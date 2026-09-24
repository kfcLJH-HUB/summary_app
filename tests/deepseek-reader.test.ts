import { describe, expect, it } from "vitest"
import { deepSeekMessageShape, isDeepSeekPagePastDate, isDeepSeekSessionOnDate, selectDeepSeekMessages } from "../core/deepseek-reader"

const date = "2026-09-24"
const today = Date.parse("2026-09-24T04:00:00Z") / 1000
const yesterday = Date.parse("2026-09-23T04:00:00Z") / 1000

describe("DeepSeek message date selection", () => {
  it("keeps undated user and assistant messages from a session created today", () => {
    const result = selectDeepSeekMessages({ id: "new", inserted_at: today, updated_at: today }, [
      { message_id: "u", role: "USER", content: "今天的提问" },
      { message_id: "a", role: "ASSISTANT", content: "今天的回答" },
    ], date)
    expect(result.messages.map((message) => message.content)).toEqual(["今天的提问", "今天的回答"])
    expect(result.usedSessionDate).toBe(true)
  })

  it("filters dated messages by day even when an older session is updated today", () => {
    const result = selectDeepSeekMessages({ id: "old", inserted_at: yesterday, updated_at: today }, [
      { role: "USER", content: "昨天", inserted_at: yesterday },
      { role: "USER", content: "今天", inserted_at: today },
      { role: "ASSISTANT", content: "思考中", status: "in_progress", inserted_at: today },
    ], date)
    expect(result.messages.map((message) => message.content)).toEqual(["今天"])
    expect(result.usedSessionDate).toBe(false)
  })

  it("does not mistake an older session's update for the date of all its messages", () => {
    const result = selectDeepSeekMessages({ id: "old", inserted_at: yesterday, updated_at: today }, [
      { role: "USER", content: "补充问题" },
    ], date)
    expect(result.messages).toHaveLength(0)
    expect(result.textCount).toBe(1)
    expect(result.usedSessionDate).toBe(false)
  })

  it("does not import undated messages from an older, inactive session", () => {
    const result = selectDeepSeekMessages({ id: "old", inserted_at: yesterday, updated_at: yesterday }, [
      { role: "USER", content: "旧问题" },
    ], date)
    expect(result.messages).toHaveLength(0)
  })

  it("accepts text blocks without including reasoning blocks", () => {
    const result = selectDeepSeekMessages({ id: "new", inserted_at: today }, [
      { role: "user", content: [{ type: "text", text: "问题" }] },
      { role: "assistant", content: [{ type: "reasoning", text: "隐藏思考" }, { type: "text", text: "回答" }] },
    ], date)
    expect(result.messages.map((message) => message.content)).toEqual(["问题", "回答"])
  })

  it("reads visible fragments when the response has no content field", () => {
    const result = selectDeepSeekMessages({ id: "new", inserted_at: today }, [
      { message_id: 101, role: "USER", inserted_at: today, fragments: [
        { type: "FILE", files: [{ name: "private.pdf" }] },
        { type: "REQUEST", content: "今天的问题" },
      ] },
      { role: "ASSISTANT", inserted_at: today, fragments: [
        { type: "THINK", content: "隐藏推理" },
        { type: "RESPONSE", content: "今天的回答" },
        { type: "TOOL", content: "工具输出" },
      ] },
    ], date)
    expect(result.messages.map((message) => message.content)).toEqual(["今天的问题", "今天的回答"])
    expect(result.messages[0].id).toBe("101")
  })
})

describe("DeepSeek session selection", () => {
  it("does not treat the first 50 older sessions as today's candidates", () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ id: String(index), updated_at: yesterday }))
    expect(firstPage.filter((session) => isDeepSeekSessionOnDate(session, date))).toHaveLength(0)
    expect(isDeepSeekPagePastDate(firstPage, date)).toBe(true)
  })

  it("continues past old pinned sessions to find today's unpinned sessions", () => {
    const pinnedPage = Array.from({ length: 50 }, (_, index) => ({ id: String(index), pinned: true, updated_at: yesterday }))
    expect(isDeepSeekPagePastDate(pinnedPage, date)).toBe(false)
    expect(isDeepSeekSessionOnDate({ id: "today", inserted_at: yesterday, updated_at: today }, date)).toBe(true)
  })

  it("describes an empty or changed response without exposing message content", () => {
    expect(deepSeekMessageShape([])).toContain("消息列表为空")
    const shape = deepSeekMessageShape([{ role: "USER", content: { text: "secret" }, unexpected: "private" }])
    expect(shape).toContain("字段：role、content、unexpected")
    expect(shape).not.toMatch(/secret|private/)
    const nested = deepSeekMessageShape([{ role: "USER", fragments: [{ type: "TEXT", content: "secret" }] }])
    expect(nested).toContain("片段字段：type、content")
    expect(nested).not.toContain("secret")
  })
})

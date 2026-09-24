import { describe, expect, it } from "vitest"
import { normalizeConversations } from "../core/normalizer"
import type { Conversation } from "../core/types"

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  source: "codex",
  sessionId: "session-1",
  title: "实现日报",
  messages: [
    { id: "message-1", role: "user", content: "实现日报", timestamp: "2026-09-22T08:00:00Z" },
    { id: "message-2", role: "assistant", content: "已完成", timestamp: "2026-09-22T08:01:00Z" },
  ],
  ...overrides,
})

describe("conversation normalizer", () => {
  it("merges duplicate sessions by source and session id", () => {
    const result = normalizeConversations([
      conversation(),
      conversation({
        title: "实现日报的更多细节",
        messages: [
          { id: "message-2", role: "assistant", content: "已完成", timestamp: "2026-09-22T08:01:00Z" },
          { id: "message-3", role: "user", content: "再补充测试", timestamp: "2026-09-22T08:02:00Z" },
        ],
      }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("实现日报")
    expect(result[0].messages.map((message) => message.content)).toEqual(["实现日报", "已完成", "再补充测试"])
  })

  it("keeps sessions with the same id from different sources", () => {
    const result = normalizeConversations([conversation(), conversation({ source: "doubao" }), conversation({ source: "deepseek" })])
    expect(result).toHaveLength(3)
    expect(result.map((item) => item.source)).toContain("deepseek")
  })
})

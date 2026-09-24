import { describe, expect, it } from "vitest"
import { parseEnabledSources, webSyncStatus } from "../src/App"

describe("AI tool selection", () => {
  it("starts with local tools only and restores opted-in web tools", () => {
    expect(parseEnabledSources(null)).toEqual(["codex", "claude-code"])
    expect(parseEnabledSources("not json")).toEqual(["codex", "claude-code"])
    expect(parseEnabledSources('["codex","deepseek","unknown"]')).toEqual(["codex", "deepseek"])
  })

  it("describes a zero-message web sync without listing unrelated sources", () => {
    expect(webSyncStatus("DeepSeek", 0)).toBe("DeepSeek已连接，当天暂无会话")
    expect(webSyncStatus("DeepSeek", 2)).toBe("已同步2个DeepSeek会话")
  })
})

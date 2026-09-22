import { describe, expect, it } from "vitest"
import { generateDailySummary } from "../core/summarizer"
import type { Conversation } from "../core/types"

const conversations: Conversation[] = [{
  source: "codex",
  sessionId: "one",
  title: "实现日报功能",
  messages: [{ id: "m1", role: "user", content: "实现日报功能", timestamp: "2026-09-22T08:00:00Z" }]
}]

describe("summarizer", () => {
  it("returns a local fallback when no API key is configured", async () => {
    const summary = await generateDailySummary("2026-09-22", conversations, { apiBaseUrl: "https://api.openai.com", apiKey: "", model: "gpt-4o-mini" })
    expect(summary.markdown).toContain("2026-09-22")
    expect(summary.sourceBreakdown.codex).toBe(1)
  })
})

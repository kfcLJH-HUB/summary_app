import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { parseCodexFile } from "../core/codex-reader"
import { parseClaudeFile } from "../core/claude-reader"

const tempDirectories: string[] = []
const date = "2026-09-22"
const makeDir = () => { const path = mkdtempSync(join(tmpdir(), "summary-test-")); tempDirectories.push(path); return path }
afterEach(() => { for (const path of tempDirectories.splice(0)) rmSync(path, { recursive: true, force: true }) })

describe("Codex reader", () => {
  it("parses user and assistant text while removing duplicate event messages", () => {
    const dir = makeDir(); const file = join(dir, "rollout.jsonl")
    writeFileSync(file, [
      JSON.stringify({ type: "session_meta", timestamp: `${date}T09:00:00Z`, payload: { id: "s1", cwd: "/tmp/project" } }),
      JSON.stringify({ type: "event_msg", timestamp: `${date}T09:01:00Z`, payload: { type: "user_message", message: "Fix the bug" } }),
      JSON.stringify({ type: "response_item", timestamp: `${date}T09:01:00Z`, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Fix the bug" }] } }),
      JSON.stringify({ type: "response_item", timestamp: `${date}T09:02:00Z`, payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "I fixed it." }] } })
    ].join("\n"))
    const result = parseCodexFile(file, date)
    expect(result?.sessionId).toBe("s1")
    expect(result?.messages.map((message) => message.content)).toEqual(["Fix the bug", "I fixed it."])
  })
})

describe("Claude Code reader", () => {
  it("keeps text blocks and ignores thinking", () => {
    const dir = makeDir(); const file = join(dir, "session.jsonl")
    writeFileSync(file, [
      JSON.stringify({ type: "user", sessionId: "c1", cwd: "/tmp/project", timestamp: `${date}T10:00:00Z`, message: { role: "user", content: "Build a report" } }),
      JSON.stringify({ type: "assistant", sessionId: "c1", timestamp: `${date}T10:01:00Z`, message: { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "Done" }] } })
    ].join("\n"))
    const result = parseClaudeFile(file, date)
    expect(result?.messages.map((message) => message.content)).toEqual(["Build a report", "Done"])
  })
})

describe("Malformed JSONL", () => {
  it("skips broken lines without failing the whole session", () => {
    const dir = makeDir(); const file = join(dir, "broken.jsonl")
    writeFileSync(file, [
      "{not-json",
      JSON.stringify({ type: "response_item", timestamp: `${date}T11:00:00Z`, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Valid message" }] } })
    ].join("\n"))
    expect(parseCodexFile(file, date)?.messages).toHaveLength(1)
  })
})

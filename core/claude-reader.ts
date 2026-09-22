import { readFileSync } from "node:fs"
import { basename } from "node:path"
import type { Conversation, Message } from "./types"
import { cleanText, isSameLocalDate, safeJsonParse, walkJsonl } from "./utils"

type ContentBlock = { type?: string; text?: string; name?: string; input?: Record<string, unknown> }
type ClaudeRecord = {
  type?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  message?: { role?: string; content?: string | ContentBlock[] }
  uuid?: string
}

function textFromContent(content: ClaudeRecord["message"] extends infer _ ? string | ContentBlock[] | undefined : never): string {
  if (typeof content === "string") return cleanText(content)
  if (!Array.isArray(content)) return ""
  return content.map((block) => {
    if (block.type === "text") return block.text ?? ""
    if (block.type === "tool_use" && block.name) {
      const input = block.input ?? {}
      const path = typeof input.file_path === "string" ? ` ${input.file_path}` : ""
      return `[工具] ${block.name}${path}`
    }
    return ""
  }).filter(Boolean).join("\n").trim()
}

export function parseClaudeFile(filePath: string, date: string): Conversation | null {
  let lines: string[]
  try { lines = readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean) } catch { return null }
  const messages: Message[] = []
  let sessionId = basename(filePath, ".jsonl")
  let projectPath: string | undefined
  let startedAt: string | undefined
  let endedAt: string | undefined
  let title = "Claude Code session"

  for (const line of lines) {
    const raw = safeJsonParse(line) as ClaudeRecord | undefined
    if (!raw || typeof raw !== "object") continue
    if (raw.sessionId) sessionId = raw.sessionId
    if (raw.cwd && !projectPath) projectPath = raw.cwd
    if (raw.timestamp) { startedAt ??= raw.timestamp; endedAt = raw.timestamp }
    const role = raw.message?.role === "user" ? "user" : raw.message?.role === "assistant" ? "assistant" : null
    if (!role || !isSameLocalDate(raw.timestamp, date)) continue
    const content = textFromContent(raw.message?.content)
    if (!content || content === "(no content)" || content.includes("tool_result")) continue
    if (content.startsWith("<environment_context>")) continue
    if (title === "Claude Code session" && role === "user") title = content.split("\n")[0].slice(0, 100)
    messages.push({ id: raw.uuid ?? `${sessionId}-${messages.length}`, role, content, timestamp: raw.timestamp })
  }
  if (messages.length === 0) return null
  return { source: "claude-code", sessionId, title, projectPath, startedAt, endedAt, messages, sourcePath: filePath }
}

export function readClaudeSessions(paths: string[], date: string): Conversation[] {
  const files = [...new Set(paths.flatMap(walkJsonl))]
  return files.map((file) => parseClaudeFile(file, date)).filter((item): item is Conversation => Boolean(item))
}

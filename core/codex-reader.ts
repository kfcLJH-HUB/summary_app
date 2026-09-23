import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import type { Conversation, Message } from "./types"
import { cleanText, isSameLocalDate, safeJsonParse, walkJsonl } from "./utils"

type CodexRecord = {
  type?: string
  timestamp?: string
  payload?: {
    id?: string
    cwd?: string
    type?: string
    role?: string
    content?: Array<{ type?: string; text?: string }>
    message?: string
    name?: string
    arguments?: string
  }
}

type CodexSessionIndexEntry = {
  id?: string
  thread_name?: string
}

export function readCodexSessionTitles(indexPath = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "session_index.jsonl")): Map<string, string> {
  const titles = new Map<string, string>()
  let lines: string[]
  try { lines = readFileSync(indexPath, "utf8").split(/\r?\n/) } catch { return titles }
  for (const line of lines) {
    const entry = safeJsonParse(line) as CodexSessionIndexEntry | undefined
    if (entry?.id && entry.thread_name?.trim()) titles.set(entry.id, entry.thread_name.trim())
  }
  return titles
}

function contentText(content: unknown, role: "user" | "assistant"): string {
  if (!Array.isArray(content)) return ""
  const wanted = role === "user" ? "input_text" : "output_text"
  return content
    .filter((block): block is { type?: string; text?: string } => Boolean(block && typeof block === "object"))
    .filter((block) => block.type === wanted && typeof block.text === "string")
    .map((block) => cleanText(block.text ?? ""))
    .filter(Boolean)
    .join("\n")
}

function recordMessage(record: CodexRecord): { role: "user" | "assistant"; text: string } | null {
  const payload = record.payload
  if (!payload) return null
  if (record.type === "event_msg" && payload.type === "user_message" && typeof payload.message === "string") {
    return { role: "user", text: cleanText(payload.message) }
  }
  if (record.type !== "response_item" || payload.type !== "message") return null
  const role = payload.role === "user" ? "user" : payload.role === "assistant" ? "assistant" : null
  if (!role) return null
  const text = contentText(payload.content, role)
  return text ? { role, text } : null
}

export function parseCodexFile(filePath: string, date: string, sessionTitles: ReadonlyMap<string, string> = new Map()): Conversation | null {
  let lines: string[]
  try { lines = readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean) } catch { return null }
  const messages: Message[] = []
  let sessionId = basename(filePath, ".jsonl")
  let projectPath: string | undefined
  let startedAt: string | undefined
  let endedAt: string | undefined
  let title = "Codex session"
  const seen = new Set<string>()

  for (const [lineNumber, line] of lines.entries()) {
    const raw = safeJsonParse(line) as CodexRecord | undefined
    if (!raw || typeof raw !== "object") continue
    const timestamp = raw.timestamp
    const payload = raw.payload
    if (payload?.id && raw.type === "session_meta") sessionId = payload.id
    if (payload?.cwd && !projectPath) projectPath = payload.cwd
    if (timestamp) {
      startedAt ??= timestamp
      endedAt = timestamp
    }
    const parsed = recordMessage(raw)
    if (!parsed || !isSameLocalDate(timestamp, date)) continue
    if (/^# AGENTS\.md instructions for /.test(parsed.text) || parsed.text.startsWith("<environment_context>") || parsed.text.startsWith("<turn_aborted>")) continue
    const key = `${timestamp ?? ""}:${parsed.role}:${parsed.text}`
    if (seen.has(key)) continue
    seen.add(key)
    if (title === "Codex session" && parsed.role === "user") title = parsed.text.split("\n")[0].slice(0, 100)
    messages.push({ id: `${sessionId}-${filePath}-${lineNumber}`, role: parsed.role, content: parsed.text, timestamp })
  }
  if (messages.length === 0) return null
  return { source: "codex", sessionId, title: sessionTitles.get(sessionId) ?? title, projectPath, startedAt, endedAt, messages, sourcePath: filePath }
}

export function readCodexSessions(paths: string[], date: string): Conversation[] {
  const files = [...new Set(paths.flatMap(walkJsonl))]
  const sessionTitles = readCodexSessionTitles()
  return files.map((file) => parseCodexFile(file, date, sessionTitles)).filter((item): item is Conversation => Boolean(item))
}

import type { Message } from "./types"

export type DeepSeekSession = {
  id?: string
  title?: string | null
  pinned?: boolean | number | null
  inserted_at?: number | string | null
  updated_at?: number | string | null
}

export type DeepSeekHistoryMessage = {
  message_id?: string | number
  role?: string
  content?: unknown
  fragments?: unknown
  text?: unknown
  message?: unknown
  status?: string
  inserted_at?: number | string | null
  updated_at?: number | string | null
}

export function deepSeekMilliseconds(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number > 1_000_000_000_000 ? Math.round(number) : Math.round(number * 1000)
}

export function deepSeekDate(value: number | string | null | undefined): string | undefined {
  const milliseconds = deepSeekMilliseconds(value)
  return milliseconds == null ? undefined : new Intl.DateTimeFormat("en-CA").format(new Date(milliseconds))
}

export function deepSeekTimestamp(value: number | string | null | undefined): string | undefined {
  const milliseconds = deepSeekMilliseconds(value)
  return milliseconds == null ? undefined : new Date(milliseconds).toISOString()
}

export function isDeepSeekSessionOnDate(session: DeepSeekSession, date: string): boolean {
  return deepSeekDate(session.updated_at) === date || deepSeekDate(session.inserted_at) === date
}

export function isDeepSeekPagePastDate(sessions: DeepSeekSession[], date: string): boolean {
  // Pinned sessions can be older than the unpinned sessions that follow them.
  const unpinned = sessions.filter((session) => !session.pinned)
  return unpinned.length > 0 && unpinned.every((session) => {
    const updated = deepSeekDate(session.updated_at ?? session.inserted_at)
    return updated != null && updated < date
  })
}

const VISIBLE_FRAGMENT_TYPES = new Set(["request", "text", "response", "answer", "content"])

function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) return content
    .map((part) => messageText(part)).filter(Boolean).join("\n")
  if (content && typeof content === "object") {
    const part = content as Record<string, unknown>
    const type = part.type ?? part.fragment_type
    if (typeof type === "string" && !VISIBLE_FRAGMENT_TYPES.has(type.toLowerCase())) return ""
    if (typeof part.text === "string") return part.text.trim()
    if (typeof part.content === "string") return part.content.trim()
  }
  return ""
}

function deepSeekBody(message: DeepSeekHistoryMessage): string {
  for (const candidate of [message.content, message.fragments, message.text, message.message]) {
    const text = messageText(candidate)
    if (text) return text
  }
  return ""
}

export function deepSeekMessageShape(raw: unknown[]): string {
  if (!raw.length) return "接口返回的消息列表为空"
  const sample = raw.find((item) => item && typeof item === "object")
  if (!sample) return `接口返回 ${raw.length} 条非对象消息`
  const value = sample as Record<string, unknown>
  const fields = Object.keys(value).filter((key) => /^[a-zA-Z][\w-]{0,40}$/.test(key)).slice(0, 20)
  const fragment = Array.isArray(value.fragments) ? value.fragments.find((item) => item && typeof item === "object") : null
  const fragmentFields = fragment ? Object.keys(fragment).filter((key) => /^[a-zA-Z][\w-]{0,40}$/.test(key)).slice(0, 12) : []
  return `接口返回 ${raw.length} 条消息；字段：${fields.join("、") || "未识别"}${fragmentFields.length ? `；片段字段：${fragmentFields.join("、")}` : ""}`
}

export function selectDeepSeekMessages(session: DeepSeekSession, raw: DeepSeekHistoryMessage[], date: string): { messages: Message[]; usedSessionDate: boolean; textCount: number } {
  const textMessages = raw.flatMap((message, index): Message[] => {
    if (message.status === "in_progress") return []
    const role = message.role?.toUpperCase() === "USER" ? "user" : message.role?.toUpperCase() === "ASSISTANT" ? "assistant" : null
    const content = deepSeekBody(message)
    if (!role || !content) return []
    return [{ id: String(message.message_id || `${session.id}-${index}`), role, content, timestamp: deepSeekTimestamp(message.inserted_at ?? message.updated_at) }]
  })

  const createdToday = deepSeekDate(session.inserted_at) === date
  let usedSessionDate = false
  const messages = textMessages.filter((message) => {
    if (message.timestamp) return new Intl.DateTimeFormat("en-CA").format(new Date(message.timestamp)) === date
    // An old session's update time cannot date each of its undated messages.
    const include = createdToday
    if (include) usedSessionDate = true
    return include
  })
  return { messages, usedSessionDate, textCount: textMessages.length }
}

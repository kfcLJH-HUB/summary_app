import type { Conversation, Source } from "./types"

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

function conversationKey(conversation: Conversation): string {
  return `${conversation.source}\u0000${conversation.sessionId}`
}

function messageKey(role: string, timestamp: string | undefined, content: string): string {
  return `${role}\u0000${timestamp ?? ""}\u0000${content}`
}

function mergeConversation(target: Conversation, incoming: Conversation): Conversation {
  const messages = [...target.messages, ...incoming.messages]
  const seenIds = new Set<string>()
  const seenContent = new Set<string>()
  const mergedMessages = messages.filter((message) => {
    const content = message.content.trim()
    const contentKey = messageKey(message.role, message.timestamp, content)
    if ((message.id && seenIds.has(message.id)) || seenContent.has(contentKey)) return false
    if (message.id) seenIds.add(message.id)
    seenContent.add(contentKey)
    return true
  }).sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""))

  const targetTitle = target.title.trim()
  const incomingTitle = incoming.title.trim()
  const title = !targetTitle || /^.+ session$/.test(targetTitle) ? incomingTitle || targetTitle : targetTitle
  const timestamps = mergedMessages.map((message) => message.timestamp).filter((value): value is string => Boolean(value)).sort()

  return {
    ...target,
    ...incoming,
    title: title || targetTitle || incomingTitle,
    projectPath: target.projectPath || incoming.projectPath,
    startedAt: timestamps[0] ?? target.startedAt ?? incoming.startedAt,
    endedAt: timestamps.at(-1) ?? incoming.endedAt ?? target.endedAt,
    messages: mergedMessages,
    sourcePath: target.sourcePath || incoming.sourcePath,
  }
}

export function normalizeConversations(conversations: Conversation[]): Conversation[] {
  const merged = new Map<string, Conversation>()
  for (const conversation of conversations) {
    if (!conversation.messages.length) continue
    const normalized: Conversation = {
      ...conversation,
      title: truncate(conversation.title?.trim() || `${conversation.source} session`, 120),
      messages: conversation.messages
        .map((message) => ({ ...message, content: truncate(message.content.trim(), 12000) }))
        .filter((message) => message.content.length > 0),
    }
    if (!normalized.messages.length) continue
    const key = conversationKey(normalized)
    const existing = merged.get(key)
    merged.set(key, existing ? mergeConversation(existing, normalized) : normalized)
  }

  return [...merged.values()]
    .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))
}

export function sourceCounts(conversations: Conversation[]): Record<Source, number> {
  return conversations.reduce<Record<Source, number>>((counts, conversation) => {
    counts[conversation.source] += 1
    return counts
  }, { codex: 0, "claude-code": 0, doubao: 0, deepseek: 0 })
}

import type { Conversation, Source } from "./types"
import { truncate } from "./utils"

export function normalizeConversations(conversations: Conversation[]): Conversation[] {
  return conversations
    .filter((conversation) => conversation.messages.length > 0)
    .map((conversation) => ({
      ...conversation,
      title: truncate(conversation.title || `${conversation.source} session`, 120),
      messages: conversation.messages.map((message) => ({ ...message, content: truncate(message.content.trim(), 12000) }))
    }))
    .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))
}

export function sourceCounts(conversations: Conversation[]): Record<Source, number> {
  return conversations.reduce<Record<Source, number>>((counts, conversation) => {
    counts[conversation.source] += 1
    return counts
  }, { codex: 0, "claude-code": 0, doubao: 0 })
}

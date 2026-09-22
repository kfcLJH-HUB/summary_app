import type { Conversation, DailySummary, Source, SummaryOptions } from "./types"
import { sourceCounts } from "./normalizer"
import { truncate } from "./utils"

function endpoint(base: string): string {
  const trimmed = base.trim().replace(/\/$/, "")
  return trimmed.endsWith("/v1") ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`
}

function sourceLabel(source: Source): string {
  return source === "claude-code" ? "Claude Code" : source === "codex" ? "Codex" : "豆包"
}

function conversationText(conversations: Conversation[], maxCharacters: number): string {
  let used = 0
  const chunks: string[] = []
  for (const conversation of conversations) {
    const lines = conversation.messages.map((message) => `${message.role === "user" ? "用户" : "助手"}: ${message.content}`).join("\n")
    const chunk = `## [${sourceLabel(conversation.source)}] ${conversation.title}\n项目：${conversation.projectPath ?? "未知"}\n${lines}`
    const available = Math.max(0, maxCharacters - used)
    if (available <= 0) break
    chunks.push(truncate(chunk, available))
    used += Math.min(chunk.length, available)
  }
  return chunks.join("\n\n---\n\n")
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content
  try {
    const parsed = JSON.parse(fenced.trim()) as unknown
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null
  } catch { return null }
}

function listField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

function fallbackSummary(date: string, conversations: Conversation[]): DailySummary {
  const counts = sourceCounts(conversations)
  const titles = conversations.slice(0, 5).map((conversation) => conversation.title)
  const overview = conversations.length ? `今天共处理 ${conversations.length} 个 AI 会话。` : "今天没有找到可用的 AI 会话。"
  const markdown = `# ${date} AI 会话日报\n\n## 概览\n${overview}\n\n## 会话\n${titles.map((title) => `- ${title}`).join("\n") || "- 无"}\n`
  return { date, headline: "AI 会话日报", overview, accomplishments: titles, decisions: [], problems: [], openQuestions: [], tomorrow: [], sourceBreakdown: counts, markdown }
}

export async function generateDailySummary(date: string, conversations: Conversation[], options: SummaryOptions): Promise<DailySummary> {
  if (!conversations.length) return fallbackSummary(date, conversations)
  if (!options.apiKey.trim()) return fallbackSummary(date, conversations)

  const prompt = `请根据下面的 AI 编程和聊天会话，生成 ${date} 的中文日报。只返回 JSON，不要 Markdown 代码块，结构必须是：
{"headline":"一句话标题","overview":"概览","accomplishments":["完成事项"],"decisions":["重要决策"],"problems":["遇到的问题"],"openQuestions":["未解决事项"],"tomorrow":["明日建议"]}
要求：不要编造会话中没有的信息；重点关注完成了什么、为什么这么做、哪里卡住了；不要复述所有对话。

会话内容：\n${conversationText(conversations, options.maxCharacters ?? 70000)}`

  const response = await fetch(endpoint(options.apiBaseUrl || "https://api.openai.com"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({ model: options.model || "gpt-4o-mini", temperature: 0.2, messages: [
      { role: "system", content: "你是一个严谨的个人工程日志助手。" },
      { role: "user", content: prompt }
    ] })
  })
  if (!response.ok) throw new Error(`LLM 请求失败：${response.status} ${await response.text()}`)
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = body.choices?.[0]?.message?.content ?? ""
  const data = parseJsonObject(content)
  if (!data) throw new Error("LLM 返回内容不是有效 JSON")

  const headline = typeof data.headline === "string" ? data.headline : "AI 会话日报"
  const overview = typeof data.overview === "string" ? data.overview : ""
  const accomplishments = listField(data.accomplishments)
  const decisions = listField(data.decisions)
  const problems = listField(data.problems)
  const openQuestions = listField(data.openQuestions)
  const tomorrow = listField(data.tomorrow)
  const counts = sourceCounts(conversations)
  const section = (title: string, items: string[]) => `## ${title}\n${items.length ? items.map((item) => `- ${item}`).join("\n") : "- 无"}`
  const markdown = `# ${date} · ${headline}\n\n## 概览\n${overview}\n\n${section("完成事项", accomplishments)}\n\n${section("重要决策", decisions)}\n\n${section("遇到的问题", problems)}\n\n${section("未解决事项", openQuestions)}\n\n${section("明日建议", tomorrow)}\n\n## 来源统计\n- Codex：${counts.codex} 个会话\n- Claude Code：${counts["claude-code"]} 个会话\n- 豆包：${counts.doubao} 个会话\n\n## 会话清单\n${conversations.map((conversation) => `- **${sourceLabel(conversation.source)}** ${conversation.title}`).join("\n")}`
  return { date, headline, overview, accomplishments, decisions, problems, openQuestions, tomorrow, sourceBreakdown: counts, markdown }
}

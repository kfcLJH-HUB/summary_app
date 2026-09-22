import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bot, CalendarDays, Check, ChevronRight, FileText, FolderOpen, LoaderCircle, PanelRight, RefreshCw, Settings2, Sparkles, X } from "lucide-react"
import type { AppSettings, Conversation, DailySummary, Source } from "../core/types"

const today = () => new Intl.DateTimeFormat("en-CA").format(new Date())
const sourceName: Record<Source, string> = { codex: "Codex", "claude-code": "Claude Code", doubao: "豆包" }

function App() {
  const [date, setDate] = useState(today())
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [filter, setFilter] = useState<Source | "all">("all")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [doubaoOpen, setDoubaoOpen] = useState(false)

  const filtered = useMemo(() => filter === "all" ? conversations : conversations.filter((item) => item.source === filter), [conversations, filter])
  const counts = useMemo(() => conversations.reduce<Record<Source, number>>((result, item) => { result[item.source] += 1; return result }, { codex: 0, "claude-code": 0, doubao: 0 }), [conversations])

  useEffect(() => {
    void loadSettings()
    return window.summaryApi.onDoubaoVisibilityChanged(setDoubaoOpen)
  }, [])

  async function loadSettings() {
    if (!window.summaryApi) return
    setSettings(await window.summaryApi.getSettings())
  }

  async function scanLocal() {
    await closeDoubao()
    setLoading(true); setMessage("")
    try {
      const local = await window.summaryApi.scanLocalSessions(date)
      // Refresh only Codex/Claude Code data. Doubao is a separate source and
      // must survive a local rescan instead of being replaced accidentally.
      setConversations((current) => [
        ...local,
        ...current.filter((item) => item.source === "doubao"),
      ])
      setSelected((current) => current?.source === "doubao" ? current : local[0] ?? null)
      setSummary(null)
      setMessage(`已读取 ${local.length} 个本地会话，豆包记录已保留`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "读取本地会话失败") } finally { setLoading(false) }
  }

  async function scanDoubao() {
    await window.summaryApi.showDoubao()
    setDoubaoOpen(true)
    setLoading(true); setMessage("正在打开豆包并读取历史……")
    try {
      const result = await window.summaryApi.readDoubaoSessions(date)
      if (result.error) setMessage(result.error)
      setConversations((current) => [...current.filter((item) => item.source !== "doubao"), ...result.conversations])
      setMessage(result.error ?? `已读取 ${result.conversations.length} 个豆包会话`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "读取豆包失败") } finally { setLoading(false) }
  }

  async function generate() {
    await closeDoubao()
    if (!conversations.length) { setMessage("请先读取会话"); return }
    if (!settings) await loadSettings()
    const activeSettings = settings ?? await window.summaryApi.getSettings()
    setLoading(true); setMessage("正在生成日报……")
    try {
      const result = await window.summaryApi.generateDailySummary(conversations, { ...activeSettings, date })
      setSummary(result)
      const path = await window.summaryApi.writeMarkdownSummary(result, activeSettings.outputPath)
      setMessage(`日报已保存：${path}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "生成日报失败") } finally { setLoading(false) }
  }


  async function closeDoubao(refresh = false) {
    // Hide first so returning to the journal is immediate. The hidden
    // WebContentsView stays alive and can finish synchronization in background.
    await window.summaryApi.hideDoubao()
    setDoubaoOpen(false)
    if (!refresh) return

    setLoading(true)
    setMessage("正在后台同步刚刚产生的豆包会话……")
    try {
      // Give Doubao a brief moment to persist a newly-created conversation.
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      const result = await window.summaryApi.readDoubaoSessions(date)
      setConversations((current) => [...current.filter((item) => item.source !== "doubao"), ...result.conversations])
      setSelected((current) => current ?? result.conversations[0] ?? null)
      setMessage(result.error ?? `已同步 ${result.conversations.length} 个豆包会话`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步豆包会话失败")
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    if (!settings) return
    await window.summaryApi.saveSettings(settings)
    setShowSettings(false); setMessage("设置已保存")
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={16} /></div><div><strong>Session Summary</strong><span>你的 AI 工程日报</span></div></div>
      {doubaoOpen && <button className="doubao-back" onClick={() => void closeDoubao(true)}><ArrowLeft size={16} />返回日报 / 关闭豆包</button>}
      <div className="nav-section"><span className="section-label">工作区</span><button className="nav-item active" onClick={() => { setDate(today()); void closeDoubao() }}><CalendarDays size={16} />今日</button><button className="nav-item" onClick={() => setDate(today())}><RefreshCw size={16} />重新读取</button></div>
      <div className="nav-section"><span className="section-label">来源</span><button className={`nav-item ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}><PanelRight size={16} />全部 <em>{conversations.length}</em></button>{(Object.keys(sourceName) as Source[]).map((source) => <button className={`nav-item ${filter === source ? "active" : ""}`} key={source} onClick={() => setFilter(source)}><span className={`dot ${source}`} />{sourceName[source]}<em>{counts[source]}</em></button>)}</div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => { void closeDoubao(); setShowSettings(true) }}><Settings2 size={16} />设置</button><div className="privacy-note"><Check size={14} />本地读取，不建立会话数据库</div></div>
    </aside>

    <main className="main-column">
      <header className="topbar"><div><span className="eyebrow">DAILY JOURNAL</span><h1>{date === today() ? "今日会话" : date}</h1></div><div className="toolbar"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><button className="ghost" onClick={() => void scanLocal()} disabled={loading}><FolderOpen size={16} />读取本地</button><button className="ghost" onClick={() => void scanDoubao()} disabled={loading}><Bot size={16} />读取豆包</button><button className="primary" onClick={() => void generate()} disabled={loading}><Sparkles size={16} />生成日报</button></div></header>
      {message && <div className="notice">{loading && <LoaderCircle className="spin" size={15} />}{message}</div>}
      <section className="stats"><div><span>会话</span><strong>{conversations.length}</strong></div><div><span>消息</span><strong>{conversations.reduce((sum, item) => sum + item.messages.length, 0)}</strong></div><div><span>来源</span><strong>{[counts.codex > 0, counts["claude-code"] > 0, counts.doubao > 0].filter(Boolean).length}</strong></div></section>
      {summary ? <article className="summary-card"><div className="card-kicker"><Sparkles size={14} />AI DAILY SUMMARY</div><h2>{summary.headline}</h2><p className="summary-overview">{summary.overview}</p><SummarySection title="完成事项" items={summary.accomplishments} /><SummarySection title="重要决策" items={summary.decisions} /><SummarySection title="遇到的问题" items={summary.problems} /><SummarySection title="未解决事项" items={summary.openQuestions} /><SummarySection title="明日建议" items={summary.tomorrow} /></article> : <div className="empty-summary"><FileText size={30} /><h2>今天做了什么？</h2><p>读取 Codex、Claude Code 或豆包会话，然后生成一份可回顾的工程日报。</p><div className="empty-actions"><button className="primary" onClick={() => void scanLocal()}><RefreshCw size={16} />读取本地会话</button><button className="ghost" onClick={() => void scanDoubao()}><Bot size={16} />打开豆包</button></div></div>}
      <section className="session-section"><div className="section-heading"><div><span className="eyebrow">TRANSCRIPTS</span><h2>会话记录</h2></div><span className="muted">{filtered.length} 个会话</span></div><div className="session-list">{filtered.map((conversation) => <button className={`session-row ${selected?.sessionId === conversation.sessionId ? "selected" : ""}`} key={`${conversation.source}-${conversation.sessionId}`} onClick={() => setSelected(conversation)}><span className={`source-icon ${conversation.source}`}>{conversation.source === "doubao" ? "豆" : conversation.source === "codex" ? "C" : "A"}</span><span className="session-copy"><strong>{conversation.title}</strong><small>{sourceName[conversation.source]} · {conversation.projectPath ?? "无项目路径"}</small></span><ChevronRight size={16} /></button>)}{filtered.length === 0 && <div className="small-empty">还没有读取到会话。</div>}</div></section>
    </main>

    <aside className="detail-column">{selected ? <><div className="detail-header"><span className={`pill ${selected.source}`}>{sourceName[selected.source]}</span><button className="icon-button" onClick={() => setSelected(null)}><X size={16} /></button></div><h2>{selected.title}</h2><div className="detail-meta">{selected.projectPath && <span>{selected.projectPath}</span>}<span>{selected.messages.length} 条消息</span></div><div className="transcript">{selected.messages.map((message) => <div className={`message ${message.role}`} key={message.id}><span className="message-role">{message.role === "user" ? "你" : "AI"}</span><p>{message.content}</p></div>)}</div></> : <div className="detail-placeholder"><PanelRight size={26} /><p>选择一个会话查看详情</p></div>}</aside>

    {showSettings && settings && <div className="modal-backdrop"><div className="settings-modal"><div className="modal-heading"><div><span className="eyebrow">PREFERENCES</span><h2>设置</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={17} /></button></div><label>API Base URL<input value={settings.apiBaseUrl} onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })} /></label><label>API Key<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder="留空则使用本地规则摘要" /></label><label>模型<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label><label>日报输出目录<div className="path-input"><input value={settings.outputPath} onChange={(event) => setSettings({ ...settings, outputPath: event.target.value })} /><button className="ghost" onClick={async () => { const path = await window.summaryApi.chooseDirectory(); if (path) setSettings({ ...settings, outputPath: path }) }}>选择</button></div></label><label>Codex 路径（每行一个）<textarea rows={3} value={settings.codexPaths.join("\n")} onChange={(event) => setSettings({ ...settings, codexPaths: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></label><label>Claude Code 路径（每行一个）<textarea rows={3} value={settings.claudePaths.join("\n")} onChange={(event) => setSettings({ ...settings, claudePaths: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></label><div className="modal-actions"><button className="ghost" onClick={() => setShowSettings(false)}>取消</button><button className="primary" onClick={() => void saveSettings()}><Check size={16} />保存设置</button></div></div></div>}
  </div>
}

function SummarySection({ title, items }: { title: string; items: string[] }) { return <section className="summary-section"><h3>{title}</h3>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">无</p>}</section> }

export default App

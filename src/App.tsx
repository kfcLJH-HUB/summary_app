import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Bot, Check, ChevronDown, ChevronRight, Clock3, FileText, LoaderCircle, PanelRight, RefreshCw, Settings2, Sparkles, X } from "lucide-react"
import type { AppSettings, Conversation, DailySummary, Source } from "../core/types"
import { normalizeConversations } from "../core/normalizer"

const today = () => new Intl.DateTimeFormat("en-CA").format(new Date())
const sourceName: Record<Source, string> = { codex: "Codex", "claude-code": "Claude Code", doubao: "豆包" }
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000

function loadedStatus(action: string, conversations: Conversation[]): string {
  const sources = (Object.keys(sourceName) as Source[])
    .filter((source) => conversations.some((conversation) => conversation.source === source))
    .map((source) => sourceName[source])
  const cleanAction = action.replace(/(?:，?包含)+$/, "")
  return `${cleanAction}${sources.length ? `，包含${sources.join("、")}` : ""}`
}

function App() {
  const [date, setDate] = useState(today())
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionStatus, setSessionStatus] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [doubaoOpen, setDoubaoOpen] = useState(false)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [enabledSources, setEnabledSources] = useState<Source[]>(["codex", "claude-code", "doubao"])
  const conversationsRef = useRef(conversations)
  const loadingRef = useRef(loading)
  const doubaoOpenRef = useRef(doubaoOpen)
  const toolPickerRef = useRef<HTMLDivElement>(null)
  const initialReadStartedRef = useRef(false)

  conversationsRef.current = conversations
  loadingRef.current = loading
  doubaoOpenRef.current = doubaoOpen

  useEffect(() => {
    void loadSettings()
    if (!initialReadStartedRef.current) {
      initialReadStartedRef.current = true
      void scanSessions()
    }
    return window.summaryApi.onDoubaoVisibilityChanged(setDoubaoOpen)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (loadingRef.current || doubaoOpenRef.current) return
      void scanSessions(true)
    }, AUTO_REFRESH_INTERVAL)
    return () => window.clearInterval(timer)
  }, [date, enabledSources])

  useEffect(() => {
    function closeToolMenu(event: MouseEvent) {
      if (!toolPickerRef.current?.contains(event.target as Node)) setToolMenuOpen(false)
    }
    document.addEventListener("mousedown", closeToolMenu)
    return () => document.removeEventListener("mousedown", closeToolMenu)
  }, [])

  async function loadSettings() {
    if (!window.summaryApi) return
    setSettings(await window.summaryApi.getSettings())
  }

  async function scanSessions(automatic = false) {
    await closeDoubao()
    loadingRef.current = true
    setLoading(true); setSessionStatus(automatic ? "每 5 分钟自动读取会话中……" : "正在读取会话……")
    try {
      const local = enabledSources.some((source) => source !== "doubao")
        ? await window.summaryApi.scanLocalSessions(date)
        : []
      let doubao = conversationsRef.current.filter((item) => item.source === "doubao")
      let doubaoResult: Awaited<ReturnType<typeof window.summaryApi.readDoubaoSessions>> | null = null
      if (enabledSources.includes("doubao")) {
        setSessionStatus("正在连接豆包并读取会话……")
        doubaoResult = await window.summaryApi.readDoubaoSessions(date)
        if (!doubaoResult.connected) {
          if (!automatic) {
            await window.summaryApi.showDoubao()
            setDoubaoOpen(true)
          }
          setSessionStatus(automatic ? "自动读取完成，豆包尚未登录" : doubaoResult.needsLogin ? "请先登录豆包，登录后点击“返回日报”" : doubaoResult.error ?? "豆包未连接，请先登录")
        } else {
          doubao = doubaoResult.conversations
        }
      }
      const updated = normalizeConversations([
        ...local.filter((conversation) => enabledSources.includes(conversation.source)),
        ...(enabledSources.includes("doubao") ? doubao : []),
      ])
      setConversations(updated)
      setSelected((current) => current && updated.some((item) => item.source === current.source && item.sessionId === current.sessionId) ? current : updated[0] ?? null)
      if (!automatic) setSummary(null)
      if (doubaoResult && !doubaoResult.connected) {
        if (!automatic) setSessionStatus(doubaoResult.needsLogin ? "请先登录豆包，登录后点击“返回日报”" : doubaoResult.error ?? "豆包未连接，请先登录")
      } else if (doubaoResult?.error) {
        setSessionStatus(doubaoResult.error)
      } else {
        const suffix = automatic ? `（${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())}）` : ""
        setSessionStatus(`${automatic ? "自动读取完成" : `已读取${updated.length}个会话`}${suffix}${automatic ? `，共${updated.length}个会话` : ""}${loadedStatus("", updated)}`)
      }
    } catch (error) { setSessionStatus(error instanceof Error ? error.message : "读取会话失败") } finally { loadingRef.current = false; setLoading(false) }
  }

  async function generate() {
    await closeDoubao()
    if (!conversations.length) { setSessionStatus("请先读取会话"); return }
    if (!settings) await loadSettings()
    const activeSettings = settings ?? await window.summaryApi.getSettings()
    loadingRef.current = true
    setLoading(true); setSessionStatus("正在生成日报……")
    try {
      const result = await window.summaryApi.generateDailySummary(conversations, { ...activeSettings, date })
      setSummary(result)
      const path = await window.summaryApi.writeMarkdownSummary(result, activeSettings.outputPath)
      setSessionStatus(`日报已保存：${path}`)
    } catch (error) { setSessionStatus(error instanceof Error ? error.message : "生成日报失败") } finally { loadingRef.current = false; setLoading(false) }
  }


  async function closeDoubao(refresh = false) {
    // Hide first so returning to the journal is immediate. The hidden
    // WebContentsView stays alive and can finish synchronization in background.
    await window.summaryApi.hideDoubao()
    setDoubaoOpen(false)
    if (!refresh) return

    loadingRef.current = true
    setLoading(true)
    setSessionStatus("正在后台同步刚刚产生的豆包会话……")
    try {
      // Give Doubao a brief moment to persist a newly-created conversation.
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      const result = await window.summaryApi.readDoubaoSessions(date)
      if (!result.connected) {
        setSessionStatus(result.needsLogin ? "请先登录豆包，登录后点击“返回日报”" : result.error ?? "豆包未连接，请先登录")
        return
      }
      const updated = normalizeConversations([...conversations.filter((item) => item.source !== "doubao"), ...result.conversations])
      setConversations(updated)
      setSelected((current) => current ?? result.conversations[0] ?? null)
      if (result.error) setSessionStatus(result.error)
      else {
        setSessionStatus(loadedStatus(`已同步${result.conversations.length}个豆包会话`, updated))
      }
    } catch (error) {
      setSessionStatus(error instanceof Error ? error.message : "同步豆包会话失败")
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  async function saveSettings() {
    if (!settings) return
    await window.summaryApi.saveSettings(settings)
    setShowSettings(false); setSessionStatus("设置已保存")
  }

  return <div className="app-shell">
    <main className="main-column">
      <header className="topbar"><div className="page-heading"><div className="brand-mark"><Sparkles size={16} /></div><div><span className="eyebrow">SESSION SUMMARY</span><h1>{date === today() ? "今日会话" : `${date} 会话`}</h1></div></div><div className="toolbar"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} />{doubaoOpen && <button className="ghost doubao-return" onClick={() => void closeDoubao(true)}><ArrowLeft size={16} />返回日报</button>}<button className="primary" onClick={() => void generate()} disabled={loading}><Sparkles size={16} />生成日报</button><button className="icon-button settings-button" title="设置" aria-label="设置" onClick={() => { void closeDoubao(); setShowSettings(true) }}><Settings2 size={16} /></button></div></header>
      {summary ? <article className="summary-card"><div className="summary-card-top"><button className="ghost summary-back" onClick={() => setSummary(null)}><ArrowLeft size={15} />返回会话</button></div><SummarySection title="今日完成事项" items={summary.accomplishments} /><SummarySection title="重点学习" items={summary.knowledgeAbsorbed} /><SummarySection title="明日建议" items={summary.tomorrow} /></article> : <div className="empty-summary"><FileText size={30} /><h2>今天做了什么？</h2><p>读取 Codex、Claude Code 或豆包会话，然后生成一份可回顾的工程日报。</p><div className="empty-actions"><button className="primary" onClick={() => void scanSessions()}><RefreshCw size={16} />读取会话</button><div className="tool-picker" ref={toolPickerRef}><button className="ghost" onClick={() => setToolMenuOpen((open) => !open)} aria-expanded={toolMenuOpen}><Bot size={16} />AI 工具<ChevronDown size={14} /></button>{toolMenuOpen && <div className="tool-menu">{(Object.keys(sourceName) as Source[]).map((source) => <label key={source}><input type="checkbox" checked={enabledSources.includes(source)} onChange={() => setEnabledSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source])} /><span>{sourceName[source]}</span></label>)}</div>}</div></div></div>}
      <section className="session-section"><div className="section-heading"><span className="eyebrow">TRANSCRIPTS</span><div className="session-title-line"><h2>会话记录</h2>{sessionStatus && <div className="session-status">{loading && <LoaderCircle className="spin" size={15} />}{sessionStatus}</div>}<span className="auto-refresh-note"><Clock3 size={13} />每 5 分钟自动读取</span></div></div><div className="session-list">{conversations.map((conversation) => <button className={`session-row ${selected?.source === conversation.source && selected?.sessionId === conversation.sessionId ? "selected" : ""}`} key={`${conversation.source}-${conversation.sessionId}`} onClick={() => setSelected(conversation)}><span className={`source-badge ${conversation.source}`} title={sourceName[conversation.source]}>{conversation.source === "claude-code" ? "CC" : sourceName[conversation.source]}</span><span className="session-copy"><strong title={conversation.title}>{conversation.title}</strong><small>{conversation.projectPath ?? "无项目路径"}</small></span><ChevronRight size={16} /></button>)}{conversations.length === 0 && <div className="small-empty">还没有读取到会话。</div>}</div></section>
    </main>

    <aside className="detail-column">{selected ? <><div className="detail-header"><span className={`pill ${selected.source}`}>{sourceName[selected.source]}</span><button className="icon-button" onClick={() => setSelected(null)}><X size={16} /></button></div><h2>{selected.title}</h2><div className="detail-meta">{selected.projectPath && <span>{selected.projectPath}</span>}</div><div className="transcript">{selected.messages.map((message) => <div className={`message ${message.role}`} key={message.id}><span className="message-role">{message.role === "user" ? "你" : "AI"}</span><p>{message.content}</p></div>)}</div></> : <div className="detail-placeholder"><PanelRight size={26} /><p>选择一个会话查看详情</p></div>}</aside>

    {showSettings && settings && <div className="modal-backdrop"><div className="settings-modal"><div className="modal-heading"><div><span className="eyebrow">PREFERENCES</span><h2>设置</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={17} /></button></div><label>API Base URL<input value={settings.apiBaseUrl} onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })} /></label><label>API Key<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder="留空则使用本地规则摘要" /></label><label>模型<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label><label>日报提示词<textarea rows={12} value={settings.summaryPrompt} onChange={(event) => setSettings({ ...settings, summaryPrompt: event.target.value })} placeholder="留空则使用默认提示词" /><span className="settings-hint">支持 {"{{date}}"} 和 {"{{conversations}}"}；建议保留 JSON 输出结构。</span></label><label>日报输出目录<div className="path-input"><input value={settings.outputPath} onChange={(event) => setSettings({ ...settings, outputPath: event.target.value })} /><button className="ghost" onClick={async () => { const path = await window.summaryApi.chooseDirectory(); if (path) setSettings({ ...settings, outputPath: path }) }}>选择</button></div></label><label>Codex 路径（每行一个）<textarea rows={3} value={settings.codexPaths.join("\n")} onChange={(event) => setSettings({ ...settings, codexPaths: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></label><label>Claude Code 路径（每行一个）<textarea rows={3} value={settings.claudePaths.join("\n")} onChange={(event) => setSettings({ ...settings, claudePaths: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></label><div className="modal-actions"><button className="ghost" onClick={() => setShowSettings(false)}>取消</button><button className="primary" onClick={() => void saveSettings()}><Check size={16} />保存设置</button></div></div></div>}
  </div>
}

function SummarySection({ title, items }: { title: string; items: string[] }) { return <section className="summary-section"><h3>{title}</h3>{items.length ? <ol>{items.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="muted">无</p>}</section> }

export default App

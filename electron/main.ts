import { app, BrowserWindow, dialog, ipcMain, session, WebContentsView } from "electron"
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { readCodexSessions } from "../core/codex-reader"
import { readClaudeSessions } from "../core/claude-reader"
import { DEFAULT_SUMMARY_PROMPT, generateDailySummary } from "../core/summarizer"
import { defaultOutputPath, writeSummaryMarkdown } from "../core/markdown-writer"
import { normalizeConversations } from "../core/normalizer"
import { detectSessionPaths } from "../core/session-paths"
import { DEFAULT_SUMMARY_SCHEDULE, normalizeSummarySchedule } from "../core/summary-schedule"
import { appendSummaryToFeishu } from "../core/feishu"
import type { AppSettings, DailySummary } from "../core/types"

let mainWindow: BrowserWindow | null = null
let doubaoView: WebContentsView | null = null
let doubaoReady: Promise<void> | null = null
let deepseekView: WebContentsView | null = null
let deepseekReady: Promise<void> | null = null
let deepseekLoadError = ""
const doubaoRequests = new Map<string, (result: any) => void>()
const deepseekRequests = new Map<string, (result: any) => void>()
const DOUBAO_PARTITION = "persist:doubao-summary"
const DEEPSEEK_PARTITION = "persist:deepseek-summary"
// Keep this in sync with .embedded-toolbar in the renderer.
const EMBEDDED_TOOLBAR_HEIGHT = 56
const DOUBAO_AUTH_COOKIES = new Set([
  "sessionid",
  "sessionid_ss",
  "sessionid_sign",
  "sid_guard",
  "uid_tt",
  "uid_tt_ss",
])

function settingsPath(fileName = ".settings.json") { return join(app.getPath("userData"), fileName) }
function defaultSettings(): AppSettings {
  const home = app.getPath("home")
  return {
    codexPaths: [join(home, ".codex", "sessions"), join(home, ".codex", "archived_sessions")],
    claudePaths: [join(home, ".claude", "projects")],
    outputPath: join(home, "Documents", "AI-Daily-Summaries"),
    apiBaseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4o-mini",
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,
    ...DEFAULT_SUMMARY_SCHEDULE,
    feishuEnabled: false,
    feishuAppId: "",
    feishuAppSecret: "",
    feishuDocumentId: "",
  }
}
function loadSettings(): AppSettings {
  const defaults = defaultSettings()
  for (const path of [settingsPath(), settingsPath("settings.json")]) {
    try {
      const stored = JSON.parse(readFileSync(path, "utf8")) as Partial<AppSettings>
      return { ...defaults, ...stored, ...normalizeSummarySchedule(stored) }
    } catch { /* Try the next compatible location. */ }
  }
  return defaults
}
function saveSettings(settings: AppSettings) {
  const path = settingsPath()
  writeFileSync(path, JSON.stringify({ ...settings, ...normalizeSummarySchedule(settings) }, null, 2), { encoding: "utf8", mode: 0o600 })
  chmodSync(path, 0o600)
}

function bounds() {
  if (!mainWindow) return
  const { width, height } = mainWindow.getContentBounds()
  doubaoView?.setBounds({ x: 0, y: EMBEDDED_TOOLBAR_HEIGHT, width, height: Math.max(0, height - EMBEDDED_TOOLBAR_HEIGHT) })
  deepseekView?.setBounds({ x: 0, y: EMBEDDED_TOOLBAR_HEIGHT, width, height: Math.max(0, height - EMBEDDED_TOOLBAR_HEIGHT) })
}

function setDoubaoVisible(visible: boolean) {
  doubaoView?.setVisible(visible)
  mainWindow?.webContents.send("doubao:visibility-changed", visible)
}

function setDeepSeekVisible(visible: boolean) {
  deepseekView?.setVisible(visible)
  mainWindow?.webContents.send("deepseek:visibility-changed", visible)
}

function createDoubaoView() {
  if (doubaoView) return doubaoView
  doubaoView = new WebContentsView({ webPreferences: { partition: DOUBAO_PARTITION, preload: join(__dirname, "doubao-preload.js"), nodeIntegration: false, contextIsolation: true, sandbox: true } })
  mainWindow?.contentView.addChildView(doubaoView)
  doubaoReady = new Promise<void>((resolve) => {
    const handleLoaded = () => {
      doubaoView?.webContents.removeListener("did-finish-load", handleLoaded)
      resolve()
    }
    doubaoView?.webContents.once("did-finish-load", handleLoaded)
  })
  void doubaoView.webContents.loadURL("https://www.doubao.com")
  doubaoView.setVisible(false)
  doubaoView.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") setDoubaoVisible(false)
  })
  bounds()
  return doubaoView
}

function createDeepSeekView() {
  if (deepseekView) return deepseekView
  deepseekLoadError = ""
  deepseekView = new WebContentsView({ webPreferences: { partition: DEEPSEEK_PARTITION, preload: join(__dirname, "deepseek-preload.js"), nodeIntegration: false, contextIsolation: true, sandbox: true } })
  mainWindow?.contentView.addChildView(deepseekView)
  deepseekReady = new Promise<void>((resolve) => {
    const finish = () => {
      deepseekView?.webContents.removeListener("did-finish-load", finish)
      resolve()
    }
    deepseekView?.webContents.once("did-finish-load", finish)
    deepseekView?.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return
      deepseekLoadError = `DeepSeek 网页加载失败：${description}`
      finish()
    })
  })
  void deepseekView.webContents.loadURL("https://chat.deepseek.com").catch((error: Error) => {
    deepseekLoadError = `DeepSeek 网页加载失败：${error.message}`
  })
  deepseekView.webContents.setZoomFactor(0.85)
  deepseekView.setVisible(false)
  deepseekView.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") setDeepSeekVisible(false)
  })
  bounds()
  return deepseekView
}

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 900, height: 640, minWidth: 760, minHeight: 520, title: "AI Session Summary", backgroundColor: "#f7f7f4", webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) await mainWindow.loadURL(rendererUrl)
  else await mainWindow.loadFile(join(__dirname, "../dist/index.html"))
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => console.error("Renderer load failed", code, description))
  mainWindow.webContents.on("render-process-gone", (_event, details) => console.error("Renderer process gone", details))
  mainWindow.on("resize", bounds)
  mainWindow.on("closed", () => { mainWindow = null; doubaoView = null; deepseekView = null })
}

ipcMain.handle("settings:get", () => loadSettings())
ipcMain.handle("settings:save", (_event, settings: AppSettings) => saveSettings(settings))
ipcMain.handle("settings:choose-directory", async () => (await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })).filePaths[0] ?? null)
ipcMain.handle("settings:detect-paths", () => detectSessionPaths())
ipcMain.handle("sessions:scan-local", (_event, date: string) => {
  const settings = loadSettings()
  return normalizeConversations([...readCodexSessions(settings.codexPaths, date), ...readClaudeSessions(settings.claudePaths, date)])
})
ipcMain.handle("doubao:show", () => { createDoubaoView(); setDoubaoVisible(true); bounds() })
ipcMain.handle("doubao:hide", () => setDoubaoVisible(false))
ipcMain.handle("deepseek:show", () => { createDeepSeekView(); setDeepSeekVisible(true); bounds() })
ipcMain.handle("deepseek:hide", () => setDeepSeekVisible(false))
ipcMain.handle("doubao:read", async (_event, date: string) => {
  const cookies = await session.fromPartition(DOUBAO_PARTITION).cookies.get({ url: "https://www.doubao.com" })
  if (!cookies.some((cookie) => DOUBAO_AUTH_COOKIES.has(cookie.name) && cookie.value)) {
    return {
      conversations: [],
      connected: false,
      needsLogin: true,
      error: "豆包尚未登录，请点击“去登录”，登录后返回日报。",
    }
  }
  const view = createDoubaoView()
  await (doubaoReady ?? Promise.resolve())
  const requestId = randomUUID()
  const result = new Promise<any>((resolve) => {
    doubaoRequests.set(requestId, resolve)
    setTimeout(() => {
      if (!doubaoRequests.has(requestId)) return
      doubaoRequests.delete(requestId)
      resolve({ conversations: [], connected: false, error: "豆包连接超时，请检查网络或登录状态。" })
    }, 60_000)
  })
  // The preload listener is installed before did-finish-load, so this send is
  // reliable even on the first use of the embedded page.
  view.webContents.send("doubao:read-history", { requestId, date })
  return result
})

ipcMain.on("doubao:read-history-result", (_event, payload: { requestId: string; result: any }) => {
  const resolve = doubaoRequests.get(payload.requestId)
  if (!resolve) return
  doubaoRequests.delete(payload.requestId)
  resolve(payload.result)
})

ipcMain.handle("deepseek:read", async (_event, date: string) => {
  const view = createDeepSeekView()
  await (deepseekReady ?? Promise.resolve())
  if (deepseekLoadError) return { conversations: [], connected: false, error: deepseekLoadError }
  const requestId = randomUUID()
  const result = new Promise<any>((resolve) => {
    deepseekRequests.set(requestId, resolve)
    setTimeout(() => {
      if (!deepseekRequests.has(requestId)) return
      deepseekRequests.delete(requestId)
      resolve({ conversations: [], connected: false, error: "DeepSeek 连接超时，请检查网络或登录状态。" })
    }, 60_000)
  })
  view.webContents.send("deepseek:read-history", { requestId, date })
  return result
})

ipcMain.on("deepseek:read-history-result", (_event, payload: { requestId: string; result: any }) => {
  if (_event.sender !== deepseekView?.webContents) return
  const resolve = deepseekRequests.get(payload.requestId)
  if (!resolve) return
  deepseekRequests.delete(payload.requestId)
  resolve(payload.result)
})

ipcMain.handle("summary:generate", (_event, conversations, options) => generateDailySummary(options?.date ?? new Intl.DateTimeFormat("en-CA").format(new Date()), normalizeConversations(conversations), options))
ipcMain.handle("summary:write", (_event, summary: DailySummary, outputPath?: string) => {
  const target = outputPath ? (outputPath.endsWith(".md") ? outputPath : join(outputPath, `${summary.date}.md`)) : defaultOutputPath(summary.date)
  return writeSummaryMarkdown(summary, target)
})
ipcMain.handle("summary:append-feishu", (_event, summary: DailySummary) => appendSummaryToFeishu(summary, loadSettings()))

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(createWindow)
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
  app.on("activate", () => { if (!mainWindow) void createWindow() })
}

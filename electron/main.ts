import { app, BrowserWindow, dialog, ipcMain, WebContentsView } from "electron"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { readCodexSessions } from "../core/codex-reader"
import { readClaudeSessions } from "../core/claude-reader"
import { generateDailySummary } from "../core/summarizer"
import { defaultOutputPath, writeSummaryMarkdown } from "../core/markdown-writer"
import { normalizeConversations } from "../core/normalizer"
import type { AppSettings, DailySummary } from "../core/types"

let mainWindow: BrowserWindow | null = null
let doubaoView: WebContentsView | null = null
let doubaoReady: Promise<void> | null = null
const doubaoRequests = new Map<string, (result: any) => void>()

function settingsPath() { return join(app.getPath("userData"), "settings.json") }
function defaultSettings(): AppSettings {
  const home = app.getPath("home")
  return {
    codexPaths: [join(home, ".codex", "sessions"), join(home, ".codex", "archived_sessions")],
    claudePaths: [join(home, ".claude", "projects")],
    outputPath: join(home, "Documents", "AI-Daily-Summaries"),
    apiBaseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4o-mini"
  }
}
function loadSettings(): AppSettings {
  const defaults = defaultSettings()
  try { return { ...defaults, ...(JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<AppSettings>) } } catch { return defaults }
}
function saveSettings(settings: AppSettings) { writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8") }

function bounds() {
  if (!mainWindow) return
  const { width, height } = mainWindow.getContentBounds()
  const sidebar = 224
  doubaoView?.setBounds({ x: sidebar, y: 54, width: Math.max(0, width - sidebar), height: Math.max(0, height - 54) })
}

function setDoubaoVisible(visible: boolean) {
  doubaoView?.setVisible(visible)
  mainWindow?.webContents.send("doubao:visibility-changed", visible)
}

function createDoubaoView() {
  if (doubaoView) return doubaoView
  doubaoView = new WebContentsView({ webPreferences: { partition: "persist:doubao-summary", preload: join(__dirname, "doubao-preload.js"), nodeIntegration: false, contextIsolation: true, sandbox: true } })
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

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, title: "AI Session Summary", backgroundColor: "#f7f7f4", webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) await mainWindow.loadURL(rendererUrl)
  else await mainWindow.loadFile(join(__dirname, "../dist/index.html"))
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => console.error("Renderer load failed", code, description))
  mainWindow.webContents.on("render-process-gone", (_event, details) => console.error("Renderer process gone", details))
  mainWindow.on("resize", bounds)
  mainWindow.on("closed", () => { mainWindow = null; doubaoView = null })
}

ipcMain.handle("settings:get", () => loadSettings())
ipcMain.handle("settings:save", (_event, settings: AppSettings) => saveSettings(settings))
ipcMain.handle("settings:choose-directory", async () => (await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })).filePaths[0] ?? null)
ipcMain.handle("sessions:scan-local", (_event, date: string) => {
  const settings = loadSettings()
  return normalizeConversations([...readCodexSessions(settings.codexPaths, date), ...readClaudeSessions(settings.claudePaths, date)])
})
ipcMain.handle("doubao:show", () => { createDoubaoView(); setDoubaoVisible(true); bounds() })
ipcMain.handle("doubao:hide", () => setDoubaoVisible(false))
ipcMain.handle("doubao:read", async (_event, date: string) => {
  const view = createDoubaoView()
  await (doubaoReady ?? Promise.resolve())
  const requestId = randomUUID()
  const result = new Promise<any>((resolve) => {
    doubaoRequests.set(requestId, resolve)
    setTimeout(() => {
      if (!doubaoRequests.has(requestId)) return
      doubaoRequests.delete(requestId)
      resolve({ conversations: [], error: "豆包读取超时，请确认已登录并打开豆包页面。" })
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

ipcMain.handle("summary:generate", (_event, conversations, options) => generateDailySummary(options?.date ?? new Intl.DateTimeFormat("en-CA").format(new Date()), normalizeConversations(conversations), options))
ipcMain.handle("summary:write", (_event, summary: DailySummary, outputPath?: string) => {
  const target = outputPath ? (outputPath.endsWith(".md") ? outputPath : join(outputPath, `${summary.date}.md`)) : defaultOutputPath(summary.date)
  return writeSummaryMarkdown(summary, target)
})

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

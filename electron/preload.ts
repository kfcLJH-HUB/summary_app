import { contextBridge, ipcRenderer } from "electron"
import type { ElectronApi } from "../core/types"

const api: ElectronApi = {
  scanLocalSessions: (date) => ipcRenderer.invoke("sessions:scan-local", date),
  readDoubaoSessions: (date) => ipcRenderer.invoke("doubao:read", date),
  showDoubao: () => ipcRenderer.invoke("doubao:show"),
  hideDoubao: () => ipcRenderer.invoke("doubao:hide"),
  onDoubaoVisibilityChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => listener(visible)
    ipcRenderer.on("doubao:visibility-changed", handler)
    return () => ipcRenderer.removeListener("doubao:visibility-changed", handler)
  },
  generateDailySummary: (conversations, options) => ipcRenderer.invoke("summary:generate", conversations, options),
  writeMarkdownSummary: (summary, outputPath) => ipcRenderer.invoke("summary:write", summary, outputPath),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseDirectory: () => ipcRenderer.invoke("settings:choose-directory")
}

contextBridge.exposeInMainWorld("summaryApi", api)

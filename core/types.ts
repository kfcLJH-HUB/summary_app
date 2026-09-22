export type Source = "codex" | "claude-code" | "doubao"
export type MessageRole = "user" | "assistant"

export type Message = {
  id: string
  role: MessageRole
  content: string
  timestamp?: string
}

export type Conversation = {
  source: Source
  sessionId: string
  title: string
  projectPath?: string
  startedAt?: string
  endedAt?: string
  messages: Message[]
  sourcePath?: string
}

export type SummaryOptions = {
  date?: string
  apiBaseUrl: string
  apiKey: string
  model: string
  language?: string
  maxCharacters?: number
}

export type DailySummary = {
  date: string
  headline: string
  overview: string
  accomplishments: string[]
  decisions: string[]
  problems: string[]
  openQuestions: string[]
  tomorrow: string[]
  sourceBreakdown: Record<Source, number>
  markdown: string
}

export type AppSettings = {
  codexPaths: string[]
  claudePaths: string[]
  outputPath: string
  apiBaseUrl: string
  apiKey: string
  model: string
}

export type DoubaoReadResult = {
  conversations: Conversation[]
  error?: string
}

export type ElectronApi = {
  scanLocalSessions: (date: string) => Promise<Conversation[]>
  readDoubaoSessions: (date: string) => Promise<DoubaoReadResult>
  showDoubao: () => Promise<void>
  hideDoubao: () => Promise<void>
  onDoubaoVisibilityChanged: (listener: (visible: boolean) => void) => () => void
  generateDailySummary: (conversations: Conversation[], options: SummaryOptions) => Promise<DailySummary>
  writeMarkdownSummary: (summary: DailySummary, outputPath?: string) => Promise<string>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>
  chooseDirectory: () => Promise<string | null>
}

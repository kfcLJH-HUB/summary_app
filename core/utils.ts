import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export function expandHome(value: string): string {
  return value.replace(/^~(?=$|[\\/])/, homedir())
}

export function isSameLocalDate(timestamp: string | undefined, date: string): boolean {
  if (!timestamp) return false
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return timestamp.slice(0, 10) === date
  return new Intl.DateTimeFormat("en-CA", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(parsed) === date
}

export function walkJsonl(root: string): string[] {
  const result: string[] = []
  const absolute = expandHome(root)
  if (!existsSync(absolute)) return result
  const visit = (directory: string) => {
    let entries
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) result.push(path)
    }
  }
  try { visit(absolute) } catch { /* ignore inaccessible paths */ }
  return result.sort((a, b) => {
    try { return statSync(b).mtimeMs - statSync(a).mtimeMs } catch { return 0 }
  })
}

export function cleanText(value: string): string {
  return value
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/g, "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/\u0000/g, "")
    .trim()
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value) as unknown } catch { return undefined }
}

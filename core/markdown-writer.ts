import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import type { DailySummary } from "./types"

export function defaultOutputPath(date: string): string {
  return join(homedir(), "Documents", "AI-Daily-Summaries", `${date}.md`)
}

export function writeSummaryMarkdown(summary: DailySummary, outputPath = defaultOutputPath(summary.date)): string {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, summary.markdown, "utf8")
  return outputPath
}

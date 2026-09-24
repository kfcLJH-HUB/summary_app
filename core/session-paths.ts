import { statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import type { DetectedSessionPaths } from "./types"

function existingDirectories(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))].filter((path) => {
    try { return statSync(path).isDirectory() } catch { return false }
  })
}

function configuredRoot(path: string | undefined, home: string): string | undefined {
  if (!path?.trim()) return undefined
  const expanded = path.trim().replace(/^~(?=$|[\/])/, home)
  return isAbsolute(expanded) ? expanded : undefined
}

export function detectSessionPaths(home = homedir(), env: NodeJS.ProcessEnv = process.env): DetectedSessionPaths {
  const codexRoots = [configuredRoot(env.CODEX_HOME, home), join(home, ".codex")]
  const claudeRoots = [configuredRoot(env.CLAUDE_CONFIG_DIR, home), join(home, ".claude")]
  return {
    codexPaths: existingDirectories(codexRoots.flatMap((root) => root ? [join(root, "sessions"), join(root, "archived_sessions")] : [])),
    claudePaths: existingDirectories(claudeRoots.flatMap((root) => root ? [join(root, "projects")] : [])),
  }
}

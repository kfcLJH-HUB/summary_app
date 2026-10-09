import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { detectSessionPaths } from "../core/session-paths"

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "summary-paths-"))
  roots.push(root)
  return root
}

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

describe("session path detection", () => {
  it("finds existing native session directories without inventing missing ones", () => {
    const home = fixture()
    const codex = join(home, ".codex", "sessions")
    const archive = join(home, ".codex", "archived_sessions")
    const wiscode = join(home, ".wiscode", "claude-agents", "projects")
    for (const path of [codex, archive, wiscode]) mkdirSync(path, { recursive: true })

    expect(detectSessionPaths(home, {})).toEqual({ codexPaths: [codex, archive], claudePaths: [] })
  })

  it("includes custom configuration roots and deduplicates the default root", () => {
    const home = fixture()
    const codex = join(home, ".codex", "sessions")
    const claude = join(home, "custom-claude", "projects")
    mkdirSync(codex, { recursive: true })
    mkdirSync(claude, { recursive: true })

    expect(detectSessionPaths(home, { CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: "~/custom-claude" })).toEqual({
      codexPaths: [codex], claudePaths: [claude],
    })
  })

  it("ignores relative environment overrides", () => {
    expect(detectSessionPaths(fixture(), { CODEX_HOME: "relative", CLAUDE_CONFIG_DIR: "relative" })).toEqual({ codexPaths: [], claudePaths: [] })
  })

  it("supports native path separators in home-relative configuration roots", () => {
    const home = fixture()
    const codex = join(home, "custom-codex", "sessions")
    const claude = join(home, "custom-claude", "projects")
    mkdirSync(codex, { recursive: true })
    mkdirSync(claude, { recursive: true })
    const separator = process.platform === "win32" ? "\\" : "/"

    expect(detectSessionPaths(home, {
      CODEX_HOME: `~${separator}custom-codex`,
      CLAUDE_CONFIG_DIR: `~${separator}custom-claude`,
    })).toEqual({ codexPaths: [codex], claudePaths: [claude] })
  })
})

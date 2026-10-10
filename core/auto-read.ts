import type { AppSettings } from "./types"

export const AUTO_READ_INTERVAL = 5 * 60 * 1000
export const DEFAULT_AUTO_READ_ENABLED = true

export function normalizeAutoReadEnabled(settings: Partial<Pick<AppSettings, "autoReadEnabled">>): boolean {
  return typeof settings.autoReadEnabled === "boolean" ? settings.autoReadEnabled : DEFAULT_AUTO_READ_ENABLED
}

// The renderer starts this only after saved settings have loaded. Cleanup is
// synchronous, so disabling auto-read removes its timer immediately.
export function startAutoReadTimer(enabled: boolean | null, read: () => void, busy: () => boolean): () => void {
  if (enabled !== true) return () => {}
  const timer = globalThis.setInterval(() => {
    if (!busy()) read()
  }, AUTO_READ_INTERVAL)
  return () => globalThis.clearInterval(timer)
}

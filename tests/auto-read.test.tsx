import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AUTO_READ_INTERVAL, normalizeAutoReadEnabled, startAutoReadTimer } from "../core/auto-read"
import { summaryScheduleNote } from "../core/summary-schedule"
import { AutoReadSettings } from "../src/components/AutoReadSettings"

const schedule = { autoSummaryEnabled: true, autoSummaryTime: "19:00" }

describe("automatic session reading", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("keeps automatic reading enabled for older settings", () => {
    expect(normalizeAutoReadEnabled({})).toBe(true)
    expect(normalizeAutoReadEnabled({ autoReadEnabled: false })).toBe(false)
    expect(normalizeAutoReadEnabled({ autoReadEnabled: true })).toBe(true)
    expect(normalizeAutoReadEnabled({ autoReadEnabled: "false" as unknown as boolean })).toBe(true)
  })

  it("never schedules reading before settings load or when disabled", () => {
    const read = vi.fn()
    for (const value of [null, false]) {
      const stop = startAutoReadTimer(value, read, () => false)
      vi.advanceTimersByTime(AUTO_READ_INTERVAL * 3)
      expect(read).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      stop()
    }
  })

  it("reads every five minutes and stops immediately after cleanup", () => {
    const read = vi.fn()
    const stop = startAutoReadTimer(true, read, () => false)
    vi.advanceTimersByTime(AUTO_READ_INTERVAL - 1)
    expect(read).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(read).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(AUTO_READ_INTERVAL)
    expect(read).toHaveBeenCalledTimes(2)
    stop()
    vi.advanceTimersByTime(AUTO_READ_INTERVAL * 2)
    expect(read).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("skips busy periods and resumes on the next interval", () => {
    const read = vi.fn()
    let busy = true
    const stop = startAutoReadTimer(true, read, () => busy)
    vi.advanceTimersByTime(AUTO_READ_INTERVAL)
    expect(read).not.toHaveBeenCalled()
    busy = false
    vi.advanceTimersByTime(AUTO_READ_INTERVAL)
    expect(read).toHaveBeenCalledTimes(1)
    stop()
  })

  it("shows all independent read/generate combinations", () => {
    expect(summaryScheduleNote(schedule, null)).toBe("正在加载读取设置")
    expect(summaryScheduleNote(schedule, false)).toBe("会话手动读取，19:00 自动生成")
    expect(summaryScheduleNote({ ...schedule, autoSummaryEnabled: false }, false)).toBe("会话手动读取，日报手动生成")
    expect(summaryScheduleNote(schedule, true)).toBe("每 5 分钟读取，19:00 自动生成")
    expect(summaryScheduleNote({ ...schedule, autoSummaryEnabled: false }, true)).toBe("每 5 分钟读取，日报手动生成")
  })

  it("renders the saved checkbox value and explains independent daily reads", () => {
    const html = (enabled: boolean) => renderToStaticMarkup(createElement(AutoReadSettings, { enabled, onChange: () => {} }))
    expect(html(true)).toContain('checked=""')
    expect(html(false)).not.toContain('checked=""')
    expect(html(false)).toContain("关闭后只在手动操作时读取")
    expect(html(false)).toContain("到设定时间仍会读取当天会话")
    expect(html(false)).toContain("每 5 分钟")
  })
})

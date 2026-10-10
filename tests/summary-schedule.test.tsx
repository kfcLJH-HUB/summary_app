import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { DEFAULT_SUMMARY_SCHEDULE, normalizeSummarySchedule, shouldGenerateDailySummary, summaryScheduleNote } from "../core/summary-schedule"
import { AutoSummarySettings } from "../src/components/AutoSummarySettings"

const date = "2026-10-09"
// Use local dates to test scheduling in both macOS and Windows timezones.
const now = (hour: number, minute: number) => new Date(2026, 9, 9, hour, minute)
const schedule = { autoSummaryEnabled: true, autoSummaryTime: "20:30" }

describe("daily summary scheduling", () => {
  it("preserves enabled 19:00 defaults for older settings", () => {
    expect(normalizeSummarySchedule({})).toEqual(DEFAULT_SUMMARY_SCHEDULE)
  })

  it("preserves disabled schedules and configured times", () => {
    expect(normalizeSummarySchedule({ autoSummaryEnabled: false, autoSummaryTime: "08:05" }))
      .toEqual({ autoSummaryEnabled: false, autoSummaryTime: "08:05" })
  })

  it("falls back safely for invalid or missing times", () => {
    for (const autoSummaryTime of ["", "24:00", "19:60", "7:00", "wrong", "19:00:00"]) {
      expect(normalizeSummarySchedule({ autoSummaryTime }).autoSummaryTime).toBe("19:00")
    }
  })

  it("waits until the configured hour and minute", () => {
    expect(shouldGenerateDailySummary(now(20, 29), schedule, "")).toBe(false)
    expect(shouldGenerateDailySummary(now(20, 30), schedule, "")).toBe(true)
  })

  it("catches up when opened after the scheduled time", () => {
    expect(shouldGenerateDailySummary(now(23, 59), schedule, "2026-10-08")).toBe(true)
  })

  it("does not generate while disabled, busy, or already generated today", () => {
    expect(shouldGenerateDailySummary(now(21, 0), { ...schedule, autoSummaryEnabled: false }, "")).toBe(false)
    expect(shouldGenerateDailySummary(now(21, 0), schedule, "", true)).toBe(false)
    expect(shouldGenerateDailySummary(now(21, 0), schedule, date)).toBe(false)
  })

  it("supports midnight and the last minute of the day", () => {
    expect(shouldGenerateDailySummary(now(0, 0), { ...schedule, autoSummaryTime: "00:00" }, "2026-10-08")).toBe(true)
    expect(shouldGenerateDailySummary(now(23, 58), { ...schedule, autoSummaryTime: "23:59" }, "")).toBe(false)
    expect(shouldGenerateDailySummary(now(23, 59), { ...schedule, autoSummaryTime: "23:59" }, "")).toBe(true)
  })

  it("shows the saved time or manual generation state in the status note", () => {
    expect(summaryScheduleNote(null)).toBe("每 5 分钟读取")
    expect(summaryScheduleNote(schedule)).toContain("20:30 自动生成")
    expect(summaryScheduleNote({ ...schedule, autoSummaryEnabled: false })).toContain("日报手动生成")
  })

  it("renders a labeled time picker with minute precision", () => {
    const html = renderToStaticMarkup(createElement(AutoSummarySettings, { schedule, onChange: () => {} }))
    expect(html).toContain('type="time"')
    expect(html).toContain('value="20:30"')
    expect(html).toContain('step="60"')
    expect(html).toContain("生成时间")
    expect(html).not.toContain('disabled=""')
  })

  it("disables the time picker when automatic generation is off", () => {
    const html = renderToStaticMarkup(createElement(AutoSummarySettings, {
      schedule: { ...schedule, autoSummaryEnabled: false }, onChange: () => {},
    }))
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('checked=""')
    expect(html).toContain('value="20:30"')
  })
})

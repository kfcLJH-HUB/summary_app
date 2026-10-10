import type { AppSettings } from "./types"

export type SummarySchedule = Pick<AppSettings, "autoSummaryEnabled" | "autoSummaryTime">

export const DEFAULT_SUMMARY_SCHEDULE: SummarySchedule = {
  autoSummaryEnabled: true,
  autoSummaryTime: "19:00",
}

export function normalizeSummarySchedule(settings: Partial<SummarySchedule>): SummarySchedule {
  return {
    autoSummaryEnabled: typeof settings.autoSummaryEnabled === "boolean"
      ? settings.autoSummaryEnabled : DEFAULT_SUMMARY_SCHEDULE.autoSummaryEnabled,
    autoSummaryTime: typeof settings.autoSummaryTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.autoSummaryTime)
      ? settings.autoSummaryTime : DEFAULT_SUMMARY_SCHEDULE.autoSummaryTime,
  }
}

export function shouldGenerateDailySummary(now: Date, schedule: SummarySchedule, lastRunDate: string, busy = false): boolean {
  if (!schedule.autoSummaryEnabled || busy || Number.isNaN(now.getTime())) return false
  const today = new Intl.DateTimeFormat("en-CA").format(now)
  if (lastRunDate === today) return false
  const [hour, minute] = schedule.autoSummaryTime.split(":").map(Number)
  // Preserve catch-up on reopening after the configured local time.
  return now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute
}

export function summaryScheduleNote(schedule: SummarySchedule | null, autoReadEnabled: boolean | null = true): string {
  if (autoReadEnabled === null) return "正在加载读取设置"
  const reading = autoReadEnabled ? "每 5 分钟读取" : "会话手动读取"
  if (!schedule) return reading
  return schedule.autoSummaryEnabled
    ? `${reading}，${schedule.autoSummaryTime} 自动生成`
    : `${reading}，日报手动生成`
}

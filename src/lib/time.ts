// Margaret lives in Ohio: her day, her daily limits and every time she reads are in Eastern time.
export const PARENT_TIME_ZONE = "America/New_York";

/** "10:41 am" */
export function formatTime(at: Date, timeZone = PARENT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone })
    .format(at)
    .replace(/\s?([AP])M$/, (_, p: string) => ` ${p.toLowerCase()}m`);
}

/** "Friday, November 6" */
export function formatDay(at: Date, timeZone = PARENT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(at);
}

/** 0 = Monday … 6 = Sunday, in that zone. */
export function weekdayIndex(at: Date, timeZone = PARENT_TIME_ZONE): number {
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(at);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(short);
}

/** "2026-11-06" plus `days` calendar days. */
export function addDays(ymd: string, days: number): string {
  const [y = NaN, m = NaN, d = NaN] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "2026-11-06": the calendar date in that zone, for grouping a day's entries. */
export function localDate(at: Date, timeZone = PARENT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(at);
}

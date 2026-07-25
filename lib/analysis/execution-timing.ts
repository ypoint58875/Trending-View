export type ManualExecutionWindow = "same-day-close" | "next-open";

const shanghaiClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function classifyManualExecutionWindow(
  now = new Date(),
): ManualExecutionWindow {
  const parts = shanghaiClock.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight < 15 * 60 ? "same-day-close" : "next-open";
}

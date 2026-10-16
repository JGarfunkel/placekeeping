// Formats an event's time range in the event's own time zone, e.g.
// "Saturday, May 2, 2026 at 9:00 AM to 12:00 PM (America/New_York)".
export function formatEventWhen(event: {
  startAt: Date | string;
  endAt: Date | string;
  timeZone: string;
}): string {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone,
    timeStyle: "short",
  });
  return `${day.format(start)} to ${time.format(end)} (${event.timeZone})`;
}

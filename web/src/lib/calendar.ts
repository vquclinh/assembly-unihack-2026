/**
 * Builds an iCalendar (.ics) file with a lease's deadlines, so both sides get a phone
 * reminder before the contract settles anything on its own. Works with Google Calendar,
 * Apple Calendar and Outlook, with no account or bot to set up.
 */
export type CalendarEvent = { uid: string; at: number; title: string; description: string };

function stamp(unix: number) {
  return new Date(unix * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes text as RFC 5545 requires, and folds nothing: our lines stay short enough. */
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildIcs(events: CalendarEvent[], url: string) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Coc//Deposit escrow//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const now = stamp(Math.floor(Date.now() / 1000));
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@coc`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.at)}`,
      `DTEND:${stamp(e.at + 15 * 60)}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(`${e.description}\n${url}`)}`,
      `URL:${url}`,
      // Two reminders: a day before and an hour before (or as close as the deadline allows).
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(e.title)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(e.title)}`,
      "TRIGGER:-PT1H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadIcs(name: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const DEFAULT_TIMEZONE = "Asia/Shanghai";

export function formatUtcDateTime(instant: Date) {
  return instant.toISOString().slice(0, 19).replace("T", " ");
}

export function parseUtcDateTime(value: string) {
  return new Date(`${value.replace(" ", "T")}Z`);
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsAt(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function isValidTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function businessDateAt(instant: Date, timeZone: string) {
  const { year, month, day } = partsAt(instant, timeZone);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function localTimeAt(instant: Date, timeZone: string) {
  const { hour, minute, second } = partsAt(instant, timeZone);
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`;
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = wallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = partsAt(new Date(candidate), timeZone);
    const representedWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const next = candidate + wallClock - representedWallClock;
    if (next === candidate) break;
    candidate = next;
  }
  const resolved = partsAt(new Date(candidate), timeZone);
  if (
    resolved.year !== year || resolved.month !== month || resolved.day !== day ||
    resolved.hour !== hour || resolved.minute !== minute || resolved.second !== second
  ) {
    throw new RangeError(`local time does not exist in ${timeZone}`);
  }
  return new Date(candidate);
}

function nextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function businessDayBoundsUtc(date: string, timeZone: string) {
  return {
    start: localDateTimeToUtc(date, "00:00:00", timeZone),
    end: localDateTimeToUtc(nextDate(date), "00:00:00", timeZone)
  };
}

export function splitByBusinessDay(start: Date, end: Date, timeZone: string) {
  if (end <= start) throw new RangeError("interval end must be after start");
  const slices: Array<{ businessDate: string; start: Date; end: Date }> = [];
  let cursor = start;
  while (cursor < end) {
    const businessDate = businessDateAt(cursor, timeZone);
    const bounds = businessDayBoundsUtc(businessDate, timeZone);
    const sliceEnd = new Date(Math.min(end.getTime(), bounds.end.getTime()));
    slices.push({ businessDate, start: cursor, end: sliceEnd });
    cursor = sliceEnd;
  }
  return slices;
}

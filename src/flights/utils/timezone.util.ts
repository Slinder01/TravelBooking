import { BadRequestException } from '@nestjs/common';

/**
 * Validates whether a date string is a real, valid calendar date (YYYY-MM-DD).
 * Catches impossible dates such as February 30 or April 31, and respects leap years.
 */
export function isValidCalendarDate(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  // JavaScript Date rolls over invalid days (e.g. Feb 30 becomes Mar 2).
  // If a rollover occurred, the UTC components will no longer match.
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates whether a timeZone string is a valid IANA time zone identifier.
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneWallClockParts(date: Date, formatter: Intl.DateTimeFormat) {
  const formattedParts = formatter.formatToParts(date);
  const getPart = (type: string) =>
    formattedParts.find((p) => p.type === type)?.value ?? '0';

  const year = Number(getPart('year'));
  const month = Number(getPart('month'));
  const day = Number(getPart('day'));
  let hour = Number(getPart('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(getPart('minute'));
  const second = Number(getPart('second'));

  return { year, month, day, hour, minute, second };
}

/**
 * Converts a local date-time string (e.g. "2026-12-01T14:30:00")
 * in an IANA time zone (e.g. "Africa/Cairo") into a UTC Date.
 * Uses two-pass offset convergence for DST boundaries and rejects non-existent gap times.
 */
export function localToUtc(localIsoString: string, timeZone: string): Date {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new BadRequestException(`Invalid IANA time zone: '${timeZone}'`);
  }

  const parts = localIsoString.split('T');
  if (parts.length < 2) {
    throw new BadRequestException(
      `Invalid local date-time format '${localIsoString}'. Expected 'YYYY-MM-DDTHH:mm:ss'`,
    );
  }

  const [datePart, timePart] = parts;
  if (!isValidCalendarDate(datePart)) {
    throw new BadRequestException(
      `Invalid calendar date '${datePart}' in '${localIsoString}'. Impossible dates (such as February 30) are not permitted.`,
    );
  }

  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    isNaN(hours) ||
    isNaN(minutes) ||
    isNaN(seconds)
  ) {
    throw new BadRequestException(
      `Invalid local date-time components in '${localIsoString}'`,
    );
  }

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    throw new BadRequestException(
      `Invalid clock time in '${localIsoString}'. Hours must be 00-23, minutes 00-59, seconds 00-59.`,
    );
  }

  const targetWallUtcMs = Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes,
    seconds,
  );

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Pass 1: estimate offset at baseline UTC timestamp
  const p1 = getTimeZoneWallClockParts(new Date(targetWallUtcMs), formatter);
  const offset1 =
    Date.UTC(p1.year, p1.month - 1, p1.day, p1.hour, p1.minute, p1.second) -
    targetWallUtcMs;

  // Pass 2: refine offset at the estimated UTC instant (handles DST transitions)
  const estimateMs = targetWallUtcMs - offset1;
  const p2 = getTimeZoneWallClockParts(new Date(estimateMs), formatter);
  const offset2 =
    Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute, p2.second) -
    estimateMs;

  const finalDate = new Date(targetWallUtcMs - offset2);
  const check = getTimeZoneWallClockParts(finalDate, formatter);

  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hours ||
    check.minute !== minutes ||
    check.second !== seconds
  ) {
    throw new BadRequestException(
      `Non-existent local date-time '${localIsoString}' in time zone '${timeZone}' (DST transition gap)`,
    );
  }

  return finalDate;
}

/**
 * Extracts the YYYY-MM-DD date segment from an ISO local time string.
 */
export function extractLocalDate(localIsoString: string): string {
  const [datePart] = localIsoString.split('T');
  if (!isValidCalendarDate(datePart)) {
    throw new BadRequestException(
      `Invalid calendar date '${datePart}' in '${localIsoString}'. Expected a valid real-world date in YYYY-MM-DD format.`,
    );
  }
  return datePart;
}

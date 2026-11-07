import { BadRequestException } from '@nestjs/common';

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

/**
 * Converts a local date-time string (e.g. "2026-12-01T14:30:00")
 * in an IANA time zone (e.g. "Africa/Cairo") into a UTC Date.
 * Handles daylight saving time (DST) transitions natively.
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
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);

  if (
    isNaN(year) || isNaN(month) || isNaN(day) ||
    isNaN(hours) || isNaN(minutes) || isNaN(seconds)
  ) {
    throw new BadRequestException(
      `Invalid local date-time components in '${localIsoString}'`,
    );
  }

  // Baseline UTC date with the specified numerical components
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  // Determine timezone offset in that specific moment using Intl
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const formattedParts = formatter.formatToParts(utcDate);
  const getPart = (type: string) => formattedParts.find((p) => p.type === type)?.value ?? '0';

  const tzYear = Number(getPart('year'));
  const tzMonth = Number(getPart('month'));
  const tzDay = Number(getPart('day'));
  let tzHour = Number(getPart('hour'));
  if (tzHour === 24) tzHour = 0;
  const tzMinute = Number(getPart('minute'));
  const tzSecond = Number(getPart('second'));

  const tzAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
  const offset = tzAsUtc - utcDate.getTime();

  return new Date(utcDate.getTime() - offset);
}

/**
 * Extracts the YYYY-MM-DD date segment from an ISO local time string.
 */
export function extractLocalDate(localIsoString: string): string {
  const [datePart] = localIsoString.split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new BadRequestException(
      `Invalid date format in '${localIsoString}'. Expected YYYY-MM-DD`,
    );
  }
  return datePart;
}

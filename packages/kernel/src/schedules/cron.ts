// ADR 0144: five-field cron (`minute hour day-of-month month day-of-week`) with `*`, lists, ranges, steps, month and
// day names, and 0 or 7 for Sunday; when both day fields are restricted (not `*`), a day matching either one matches.

export type CronExpression = {
  minutes: ReadonlySet<number>;
  hours: ReadonlySet<number>;
  days: ReadonlySet<number>;
  months: ReadonlySet<number>;
  weekdays: ReadonlySet<number>;
  daysRestricted: boolean;
  weekdaysRestricted: boolean;
};

export type CronIssue = { message: string; hint: string };

export type CronParse = { ok: true; cron: CronExpression } | { ok: false; issue: CronIssue };

type FieldSpec = { name: string; min: number; max: number; names?: readonly string[] };

const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const fields: readonly FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: monthNames },
  { name: 'day of week', min: 0, max: 7, names: dayNames },
];

const syntaxHint = 'use five fields: minute hour day-of-month month day-of-week, e.g. "0 9 * * mon-fri"';
const longestMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

class CronSyntax extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronSyntax';
  }
}

function valueOf(text: string, spec: FieldSpec): number {
  const named = spec.names?.indexOf(text.toLowerCase()) ?? -1;
  const value = named >= 0 ? named + (spec.name === 'month' ? 1 : 0) : /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
    throw new CronSyntax(`"${text}" is not a ${spec.name} (${spec.min}–${spec.max}${spec.names === undefined ? '' : ' or a name'})`);
  }
  return value;
}

function rangeOf(text: string, spec: FieldSpec, stepped: boolean): [number, number] {
  if (text === '*') return [spec.min, spec.max];
  const [first, last, extra] = text.split('-');
  if (first === undefined || extra !== undefined) throw new CronSyntax(`"${text}" is not a ${spec.name} range`);
  const start = valueOf(first, spec);
  const end = last === undefined ? (stepped ? spec.max : start) : valueOf(last, spec);
  if (end < start) throw new CronSyntax(`the ${spec.name} range "${text}" ends before it starts`);
  return [start, end];
}

function itemValues(item: string, spec: FieldSpec): number[] {
  const [range, stepText, extra] = item.split('/');
  if (range === undefined || range === '' || extra !== undefined) throw new CronSyntax(`"${item}" is not a ${spec.name}`);
  const step = stepText === undefined ? 1 : /^\d+$/.test(stepText) ? Number(stepText) : 0;
  if (step < 1) throw new CronSyntax(`the step in "${item}" must be a whole number from 1`);
  const [start, end] = rangeOf(range, spec, stepText !== undefined);
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

function fieldValues(text: string, spec: FieldSpec): Set<number> {
  const values = new Set(text.split(',').flatMap((item) => itemValues(item, spec)));
  if (spec.name === 'day of week' && values.delete(7)) values.add(0);
  return values;
}

// A day-of-month restriction that no month of the expression has (`0 0 30 2 *`) never matches.
function neverMatches(cron: CronExpression): boolean {
  if (!cron.daysRestricted || cron.weekdaysRestricted) return false;
  return ![...cron.months].some((month) => [...cron.days].some((day) => day <= (longestMonth[month - 1] ?? 0)));
}

export function parseCron(text: string): CronParse {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== fields.length) return { ok: false, issue: { message: `a cron expression has 5 fields, not ${parts.length}`, hint: syntaxHint } };
  try {
    const [minutes, hours, days, months, weekdays] = fields.map((spec, index) => fieldValues(parts[index] ?? '', spec));
    if (minutes === undefined || hours === undefined || days === undefined || months === undefined || weekdays === undefined) throw new CronSyntax('a field is missing');
    const cron: CronExpression = { minutes, hours, days, months, weekdays, daysRestricted: parts[2] !== '*', weekdaysRestricted: parts[4] !== '*' };
    if (neverMatches(cron)) return { ok: false, issue: { message: `"${text}" never matches: no month of it has that day`, hint: 'choose a day that the months have' } };
    return { ok: true, cron };
  } catch (error) {
    if (error instanceof CronSyntax) return { ok: false, issue: { message: error.message, hint: syntaxHint } };
    throw error;
  }
}

function dayMatches(cron: CronExpression, date: Date): boolean {
  const day = cron.days.has(date.getDate());
  const weekday = cron.weekdays.has(date.getDay());
  if (cron.daysRestricted && cron.weekdaysRestricted) return day || weekday;
  return day && weekday;
}

const searchYears = 8;

// The first minute strictly after `after` that matches, in the local time zone. A local time a DST change skips never
// matches; a repeated one matches once, because candidates move forward only (a jump that would go back steps a minute).
export function nextCronOccurrence(cron: CronExpression, after: number): number | undefined {
  let current = new Date(after - (after % 60_000) + 60_000);
  const limit = after + searchYears * 366 * 86_400_000;
  while (current.getTime() <= limit) {
    const [year, month, day, hour, minute] = [current.getFullYear(), current.getMonth(), current.getDate(), current.getHours(), current.getMinutes()];
    let next: Date | undefined;
    if (!cron.months.has(month + 1)) next = new Date(year, month + 1, 1, 0, 0);
    else if (!dayMatches(cron, current)) next = new Date(year, month, day + 1, 0, 0);
    else if (!cron.hours.has(hour)) next = new Date(year, month, day, hour + 1, 0);
    else if (!cron.minutes.has(minute)) next = new Date(year, month, day, hour, minute + 1);
    if (next === undefined) return current.getTime();
    current = next.getTime() > current.getTime() ? next : new Date(current.getTime() + 60_000);
  }
  return undefined;
}

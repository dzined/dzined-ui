/**
 * Plain-Date arithmetic for the calendar.
 *
 * Every date this library handles is a native `Date` pinned to *local
 * midnight*. That one rule is what keeps the rest of the code boring:
 *
 *  - A calendar cell is a day, not an instant. If we carried times around,
 *    `isSameDay` would have to strip them at every comparison and one missed
 *    strip gives you a day that highlights in the grid but fails an equality
 *    check somewhere else.
 *  - All the arithmetic goes through `setDate` / `setMonth` on a clone, which
 *    operate on local wall-clock fields. Adding 1 to 2026-03-28 in Europe/London
 *    gives 2026-03-29 even though that day is 23 hours long. Doing the same with
 *    `+ 86400000` would land at 01:00 on the 29th, and the clock-change weeks
 *    in March and October would quietly be off by one. We were not going to
 *    find that in testing; it would surface once a year.
 *
 * There is one case local midnight cannot represent: zones that move their
 * clocks *at* midnight (Cuba, and Chile historically) have a day each year
 * where 00:00 does not exist. `new Date(y, m, d)` resolves that forward to
 * 01:00 on its own, which still compares equal by y/m/d, so the grid is right;
 * only the stored instant is an hour off. We accept that over pulling in a
 * timezone library.
 */

/** Days of the week, Sunday first, matching `Date.prototype.getDay`. */
export const SUNDAY = 0;
export const MONDAY = 1;

/**
 * Build a local-midnight Date from calendar fields.
 *
 * `new Date(y, m, d)` is deliberate: the two-digit-year special case of the
 * Date constructor only applies to `new Date(99, 0, 1)`, and we guard against
 * it by refusing years under 100 at the parse boundary instead.
 */
export function makeDay(year, monthIndex, dayOfMonth) {
	const d = new Date(year, monthIndex, dayOfMonth);
	d.setHours(0, 0, 0, 0);
	return d;
}

/** True for a Date that is a Date and not Invalid Date. */
export function isValidDate(value) {
	return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Coerce whatever a caller handed us into a local-midnight Date, or null.
 *
 * This is the only place in the library that knows about other date types, and
 * it exists so the portal can keep passing the dayjs objects it already has
 * everywhere without a conversion at every call site. Anything with a
 * `.toDate()` is treated as a dayjs/moment-alike; a `YYYY-MM-DD` string is read
 * as a *calendar* day rather than handed to `new Date()`, because `new
 * Date("2026-11-20")` parses as UTC midnight and then prints as the 19th for
 * anyone west of Greenwich. That bug has bitten this codebase before in CSV
 * exports, so it is closed off here rather than left to each consumer.
 */
export function toDay(value) {
	if (value == null || value === "") return null;
	if (isValidDate(value)) return startOfDay(value);
	if (typeof value === "object" && typeof value.toDate === "function") {
		const d = value.toDate();
		return isValidDate(d) ? startOfDay(d) : null;
	}
	if (typeof value === "number") {
		const d = new Date(value);
		return isValidDate(d) ? startOfDay(d) : null;
	}
	if (typeof value === "string") {
		const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(value.trim());
		if (iso) {
			const day = makeDay(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
			// Reject 2026-02-31 rather than silently rolling it into March.
			return day.getMonth() === Number(iso[2]) - 1 ? day : null;
		}
		const d = new Date(value);
		return isValidDate(d) ? startOfDay(d) : null;
	}
	return null;
}

export function startOfDay(date) {
	const d = new Date(date.getTime());
	d.setHours(0, 0, 0, 0);
	return d;
}

export function today() {
	return startOfDay(new Date());
}

export function addDays(date, amount) {
	const d = startOfDay(date);
	d.setDate(d.getDate() + amount);
	// setDate can land on a day whose local midnight does not exist; re-pin.
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Add months, clamping the day of month rather than overflowing.
 *
 * 31 January + 1 month is 28 February, not 3 March. `setMonth` alone gives you
 * the overflow, which in a month-paging calendar means clicking "next" twice
 * from 31 January shows you March and then April and skips February entirely.
 */
export function addMonths(date, amount) {
	const d = startOfDay(date);
	const wantedDay = d.getDate();
	d.setDate(1);
	d.setMonth(d.getMonth() + amount);
	d.setDate(Math.min(wantedDay, daysInMonth(d.getFullYear(), d.getMonth())));
	d.setHours(0, 0, 0, 0);
	return d;
}

export function addYears(date, amount) {
	return addMonths(date, amount * 12);
}

export function daysInMonth(year, monthIndex) {
	// Day 0 of the next month is the last day of this one.
	return new Date(year, monthIndex + 1, 0).getDate();
}

export function startOfMonth(date) {
	return makeDay(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date) {
	return makeDay(
		date.getFullYear(),
		date.getMonth(),
		daysInMonth(date.getFullYear(), date.getMonth())
	);
}

export function startOfWeek(date, weekStartsOn = MONDAY) {
	const d = startOfDay(date);
	const shift = (d.getDay() - weekStartsOn + 7) % 7;
	return addDays(d, -shift);
}

export function endOfWeek(date, weekStartsOn = MONDAY) {
	return addDays(startOfWeek(date, weekStartsOn), 6);
}

/** -1, 0 or 1, comparing calendar days only. */
export function compareDay(a, b) {
	const x = startOfDay(a).getTime();
	const y = startOfDay(b).getTime();
	return x < y ? -1 : x > y ? 1 : 0;
}

export function isSameDay(a, b) {
	if (!a || !b) return false;
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function isSameMonth(a, b) {
	if (!a || !b) return false;
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Inclusive on both ends; a null bound means unbounded. */
export function isWithin(date, min, max) {
	if (min && compareDay(date, min) < 0) return false;
	if (max && compareDay(date, max) > 0) return false;
	return true;
}

export function clampDay(date, min, max) {
	if (min && compareDay(date, min) < 0) return startOfDay(min);
	if (max && compareDay(date, max) > 0) return startOfDay(max);
	return startOfDay(date);
}

/**
 * `YYYY-MM-DD` from the local fields, never via `toISOString`.
 *
 * `toISOString` converts to UTC first, so local midnight on 20 November in
 * London during BST serialises as `2026-11-19T23:00:00Z` and the date you get
 * back out is the 19th. Every API in the estate wants the calendar day the user
 * clicked, so we read the local fields directly.
 */
export function toISODate(date) {
	if (!isValidDate(date)) return null;
	const y = String(date.getFullYear()).padStart(4, "0");
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

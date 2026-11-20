import { addDays, isValidDate, makeDay, startOfWeek, today } from "./dates.js";

/**
 * Formatting and parsing, on `Intl` alone.
 *
 * MUI X needs an adapter package per date library because it has to format and
 * parse in any locale with any of five date libraries. That adapter layer is
 * exactly where the licence and version mess came from: four copies of a
 * licence package in the store, each read by a different Pro component. We do
 * not need any of it. `Intl.DateTimeFormat` ships in every browser we support
 * and already knows every locale's month names and field order, so the whole
 * dependency disappears and the output is more correct than a hand-rolled
 * `DD/MM/YYYY` would be.
 *
 * `Intl` has no parser, which is the one thing we write ourselves. That is fine,
 * because the parsing a date input needs is deliberately *not* strict: someone
 * typing "20/11" or "20 nov" should be understood.
 */

const EN_MONTHS = [
	"january", "february", "march", "april", "may", "june",
	"july", "august", "september", "october", "november", "december",
];

const KEYWORDS = {
	today: 0,
	tod: 0,
	tomorrow: 1,
	tom: 1,
	yesterday: -1,
	yest: -1,
};

const orderCache = new Map();

/**
 * Which order this locale writes day, month and year in.
 *
 * Read out of `Intl` rather than hard-coded, because the whole point of using
 * `Intl` is not having a table of locales to maintain. en-GB gives DMY, en-US
 * MDY, sv-SE YMD. A locale we have never heard of gives whatever it gives, and
 * typed input follows the same order the field displays, which is the only
 * behaviour that is not surprising.
 */
export function fieldOrder(locale = "en-GB") {
	const key = String(locale);
	if (orderCache.has(key)) return orderCache.get(key);
	let order = "DMY";
	try {
		const parts = new Intl.DateTimeFormat(locale, {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		}).formatToParts(new Date(2026, 10, 20));
		order = parts
			.filter((p) => p.type === "day" || p.type === "month" || p.type === "year")
			.map((p) => p.type[0].toUpperCase())
			.join("");
	} catch {
		// An invalid locale tag throws. Fall back rather than take the page down.
		order = "DMY";
	}
	if (order.length !== 3) order = "DMY";
	orderCache.set(key, order);
	return order;
}

export function formatDay(date, { locale = "en-GB", format = null } = {}) {
	if (!isValidDate(date)) return "";
	if (typeof format === "function") return format(date);
	return new Intl.DateTimeFormat(locale, {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
}

/** "Friday, 20 November 2026" — what a screen reader should read for a cell. */
export function formatDayLong(date, { locale = "en-GB" } = {}) {
	if (!isValidDate(date)) return "";
	return new Intl.DateTimeFormat(locale, {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(date);
}

/** "November 2026" — the calendar's heading. */
export function formatMonthYear(date, { locale = "en-GB" } = {}) {
	if (!isValidDate(date)) return "";
	return new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
	}).format(date);
}

/**
 * Column headings, in the order the grid will render them.
 *
 * `long` goes in a visually hidden element rather than an `abbr` or a `title`,
 * because screen readers treat a column header's accessible name as the thing
 * they announce alongside each cell, and "M" read out 31 times is useless.
 */
export function weekdayLabels({ locale = "en-GB", weekStartsOn = 1 } = {}) {
	const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const long = new Intl.DateTimeFormat(locale, { weekday: "long" });
	// Any week will do; this one starts on a Sunday.
	const base = startOfWeek(new Date(2026, 10, 15), 0);
	const out = [];
	for (let i = 0; i < 7; i += 1) {
		const d = addDays(base, (weekStartsOn + i) % 7);
		out.push({ short: short.format(d), long: long.format(d) });
	}
	return out;
}

function monthNames(locale) {
	const long = new Intl.DateTimeFormat(locale, { month: "long" });
	const short = new Intl.DateTimeFormat(locale, { month: "short" });
	const names = [];
	for (let m = 0; m < 12; m += 1) {
		const d = new Date(2026, m, 1);
		names.push([long.format(d), short.format(d)]);
	}
	return names;
}

function normaliseYear(raw) {
	const n = Number(raw);
	if (raw.length > 2) return n;
	// The strptime pivot: 00-68 is this century, 69-99 the last. A date picker in
	// this estate sees birthdays and invoice dates, so both halves get used.
	return n <= 68 ? 2000 + n : 1900 + n;
}

/** Build a day, returning null if the fields rolled over (31 February). */
function safeDay(year, monthIndex, dayOfMonth) {
	if (!(year >= 100 && year <= 9999)) return null;
	if (!(monthIndex >= 0 && monthIndex <= 11)) return null;
	if (!(dayOfMonth >= 1 && dayOfMonth <= 31)) return null;
	const d = makeDay(year, monthIndex, dayOfMonth);
	if (d.getMonth() !== monthIndex || d.getDate() !== dayOfMonth) return null;
	return d;
}

/**
 * Read a typed date, leniently.
 *
 * Accepts, in a DMY locale: `20/11/2026`, `20-11-26`, `20.11.2026`, `20/11`
 * (this year), `20` (this month), `2026-11-20`, `20111126`, `20 Nov 2026`,
 * `20 November`, `Nov 20 2026`, and `today` / `tomorrow` / `yesterday`.
 *
 * Returns null for anything it cannot read, and the caller decides what that
 * means. It deliberately does not "helpfully" round 31 February to the 28th:
 * silently changing a date someone typed is worse than rejecting it, because
 * they will not notice.
 *
 * The keywords are English only. Adding them per locale means a word list per
 * locale, and everyone typing into this estate's portals types English.
 */
export function parseDay(text, { locale = "en-GB", reference = null } = {}) {
	if (text == null) return null;
	const raw = String(text).trim().toLowerCase();
	if (!raw) return null;

	const base = reference || today();

	if (Object.prototype.hasOwnProperty.call(KEYWORDS, raw)) {
		return addDays(base, KEYWORDS[raw]);
	}

	// ISO first, always, whatever the locale. It is unambiguous and it is what
	// every API in the estate returns, so pasting one in has to work.
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
	if (iso) return safeDay(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

	const order = fieldOrder(locale);

	// A month written as a word, in any position.
	const wordMatch = /[a-zÀ-ɏ]{3,}/.exec(raw);
	if (wordMatch) {
		const names = monthNames(locale);
		const word = wordMatch[0];
		let monthIndex = -1;
		for (let m = 0; m < 12; m += 1) {
			const [long, short] = names[m].map((s) => s.toLowerCase());
			if (long === word || short.replace(".", "") === word || long.startsWith(word) && word.length >= 3) {
				monthIndex = m;
				break;
			}
		}
		if (monthIndex < 0) {
			// Fall back to English names, so "nov" works even under a French locale.
			monthIndex = EN_MONTHS.findIndex(
				(n) => n === word || (word.length >= 3 && n.startsWith(word))
			);
		}
		if (monthIndex < 0) return null;

		const numbers = raw.match(/\d{1,4}/g) || [];
		if (numbers.length === 0) return null;
		// One number: the day, in the reference year. Two: day and year, and the
		// four-digit one is the year wherever it sits.
		let dayOfMonth;
		let year = base.getFullYear();
		if (numbers.length === 1) {
			dayOfMonth = Number(numbers[0]);
		} else {
			const yearAt = numbers.findIndex((n) => n.length > 2);
			if (yearAt >= 0) {
				year = normaliseYear(numbers[yearAt]);
				dayOfMonth = Number(numbers[yearAt === 0 ? 1 : 0]);
			} else {
				dayOfMonth = Number(numbers[0]);
				year = normaliseYear(numbers[1]);
			}
		}
		return safeDay(year, monthIndex, dayOfMonth);
	}

	// Purely numeric from here on.
	const parts = raw.split(/[^\d]+/).filter(Boolean);

	if (parts.length === 1 && (parts[0].length === 6 || parts[0].length === 8)) {
		// A run of digits with no separators. `20261120` is almost certainly ISO;
		// anything else follows the locale's field order.
		const run = parts[0];
		const candidates = [];
		if (run.length === 8) {
			candidates.push([run.slice(0, 4), run.slice(4, 6), run.slice(6, 8)].concat("YMD"));
			candidates.push(
				[run.slice(0, 2), run.slice(2, 4), run.slice(4, 8)].concat(order)
			);
		} else {
			candidates.push([run.slice(0, 2), run.slice(2, 4), run.slice(4, 6)].concat(order));
		}
		for (const c of candidates) {
			const got = fromOrderedParts([c[0], c[1], c[2]], c[3]);
			if (got) return got;
		}
		return null;
	}

	if (parts.length === 1) {
		const dayOfMonth = Number(parts[0]);
		return safeDay(base.getFullYear(), base.getMonth(), dayOfMonth);
	}

	if (parts.length === 2) {
		// No year typed: use the year on screen. The alternative, refusing, makes
		// the common case of correcting a day and month inside the current year
		// need four extra keystrokes.
		const iDay = order.indexOf("D") < order.indexOf("M") ? 0 : 1;
		const dayOfMonth = Number(parts[iDay]);
		const monthIndex = Number(parts[1 - iDay]) - 1;
		return safeDay(base.getFullYear(), monthIndex, dayOfMonth);
	}

	if (parts.length === 3) {
		// A four-digit field is the year wherever the locale would have put it.
		const yearAt = parts.findIndex((p) => p.length === 4);
		if (yearAt >= 0 && order.indexOf("Y") !== yearAt) {
			const rest = parts.filter((_, i) => i !== yearAt);
			const dayFirst = order.indexOf("D") < order.indexOf("M");
			return safeDay(
				normaliseYear(parts[yearAt]),
				Number(rest[dayFirst ? 1 : 0]) - 1,
				Number(rest[dayFirst ? 0 : 1])
			);
		}
		return fromOrderedParts(parts, order);
	}

	return null;
}

function fromOrderedParts(parts, order) {
	const pick = (letter) => parts[order.indexOf(letter)];
	return safeDay(
		normaliseYear(pick("Y")),
		Number(pick("M")) - 1,
		Number(pick("D"))
	);
}

/** The hint under an input: the shape this locale expects. */
export function inputPlaceholder(locale = "en-GB") {
	const order = fieldOrder(locale);
	return order
		.split("")
		.map((l) => (l === "Y" ? "yyyy" : l === "M" ? "mm" : "dd"))
		.join("/");
}

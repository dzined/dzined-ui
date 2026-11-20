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

/*
 * The token vocabulary.
 *
 * A deliberately small subset of the dayjs/moment/date-fns convention, because
 * that convention is what people already have in their fingers, even though it
 * is a library invention rather than anything in the language. Longest
 * alternatives come first in the pattern or `MMMM` would match as `MM` + `MM`.
 *
 * There are no time tokens. Every value this library handles is a `Date` at
 * local midnight, so `HH:mm` could only ever print `00:00`, and a token that is
 * always a lie is worse than one that is absent.
 *
 * `Do` (1st, 2nd) is absent too: ordinal suffixes are per-language and getting
 * them from `Intl.PluralRules` still needs a suffix table per locale, which is
 * exactly the locale data this library exists not to carry.
 */
const TOKEN_PATTERN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|dd/g;

const nameCache = new Map();

function localeNames(locale) {
	const key = String(locale);
	if (nameCache.has(key)) return nameCache.get(key);
	let months;
	let weekdays;
	try {
		const longMonth = new Intl.DateTimeFormat(locale, { month: "long" });
		const shortMonth = new Intl.DateTimeFormat(locale, { month: "short" });
		months = Array.from({ length: 12 }, (_, m) => {
			const d = new Date(2026, m, 1);
			return [longMonth.format(d), shortMonth.format(d)];
		});
		const longDay = new Intl.DateTimeFormat(locale, { weekday: "long" });
		const shortDay = new Intl.DateTimeFormat(locale, { weekday: "short" });
		const narrowDay = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
		// 15 November 2026 is a Sunday, so the array indexes by getDay().
		weekdays = Array.from({ length: 7 }, (_, i) => {
			const d = new Date(2026, 10, 15 + i);
			return [longDay.format(d), shortDay.format(d), narrowDay.format(d)];
		});
	} catch {
		return localeNames("en-GB");
	}
	const value = { months, weekdays };
	nameCache.set(key, value);
	return value;
}

const pad = (n) => String(n).padStart(2, "0");

/**
 * Render a token pattern.
 *
 * Month and weekday names come out of `Intl` in the active locale, never a
 * table in this file. That is the whole reason the library carries no locale
 * data: `"dddd D MMMM YYYY"` under `fr-FR` has to say "vendredi 20 novembre
 * 2026" without anybody here knowing a word of French.
 *
 * Anything in square brackets is passed through untouched, so `"[on] D MMM"`
 * prints "on 20 Nov" rather than treating the "o" and "n" as tokens.
 */
export function formatWithTokens(date, pattern, locale = "en-GB") {
	const { months, weekdays } = localeNames(locale);
	const year = date.getFullYear();
	const month = date.getMonth();
	const dayOfMonth = date.getDate();
	const dayOfWeek = date.getDay();

	return String(pattern).replace(TOKEN_PATTERN, (match, literal) => {
		if (literal !== undefined) return literal;
		switch (match) {
			case "YYYY":
				return String(year).padStart(4, "0");
			case "YY":
				return pad(year % 100);
			case "MMMM":
				return months[month][0];
			case "MMM":
				return months[month][1];
			case "MM":
				return pad(month + 1);
			case "M":
				return String(month + 1);
			case "DD":
				return pad(dayOfMonth);
			case "D":
				return String(dayOfMonth);
			case "dddd":
				return weekdays[dayOfWeek][0];
			case "ddd":
				return weekdays[dayOfWeek][1];
			case "dd":
				return weekdays[dayOfWeek][2];
			default:
				return match;
		}
	});
}

/**
 * Format a day, in whichever of the three shapes the caller gave us.
 *
 * - a **function**, for anything this does not cover, including dayjs tokens;
 * - a **token string**, `"D MMM YYYY"`, the convention everyone knows;
 * - an **options object**, handed straight to `Intl.DateTimeFormat`, which is
 *   the one that is genuinely standard JavaScript and costs nothing because it
 *   is what this function already does internally.
 *
 * All three are the same prop on purpose. Asking a caller to pick `formatToken`
 * or `formatOptions` makes them learn our taxonomy before they can print a
 * date, and the three shapes are trivially distinguishable at runtime.
 */
/**
 * The field order a given `format` will actually print in.
 *
 * Without this, `format="DD/MM/YYYY"` under an `en-US` locale formats one way
 * and parses the other: the field would show 20/11/2026 and refuse to read it
 * back, because `fieldOrder("en-US")` says MDY. The format wins where it says
 * anything, and the locale is the fallback.
 *
 * Returns null when the format cannot say: a function is opaque, and a pattern
 * or options bag that omits a field has no order to speak of.
 */
export function fieldOrderFromFormat(format, locale = "en-GB") {
	if (typeof format === "string") {
		const seen = [];
		TOKEN_PATTERN.lastIndex = 0;
		let match = TOKEN_PATTERN.exec(format);
		while (match) {
			const token = match[0];
			// Square-bracket literals and the lowercase weekday tokens carry no
			// field order; only Y, M and uppercase D do.
			if (token[0] === "Y" || token[0] === "M" || token[0] === "D") {
				if (!seen.includes(token[0])) seen.push(token[0]);
			}
			match = TOKEN_PATTERN.exec(format);
		}
		return seen.length === 3 ? seen.join("") : null;
	}
	if (format && typeof format === "object") {
		try {
			const parts = new Intl.DateTimeFormat(locale, format).formatToParts(
				new Date(2026, 10, 20)
			);
			const seen = parts
				.filter((x) => x.type === "day" || x.type === "month" || x.type === "year")
				.map((x) => x.type[0].toUpperCase());
			return seen.length === 3 ? seen.join("") : null;
		} catch {
			return null;
		}
	}
	return null;
}

export function formatDay(date, { locale = "en-GB", format = null } = {}) {
	if (!isValidDate(date)) return "";
	if (typeof format === "function") return format(date);
	if (typeof format === "string" && format.trim() !== "") {
		return formatWithTokens(date, format, locale);
	}
	if (format && typeof format === "object") {
		try {
			return new Intl.DateTimeFormat(locale, format).format(date);
		} catch {
			// An invalid options bag throws. Fall through to the default rather
			// than taking the page down over a formatting preference.
		}
	}
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
 * Find a month name among the words of a typed string.
 *
 * Exact matches are tried across every word before any prefix match, which
 * matters in locales where a weekday abbreviation is a prefix of a month name:
 * Spanish "mar" is both Tuesday and the start of "marzo". Taking exact hits
 * first means "martes 20 marzo" resolves on "marzo" rather than on the
 * weekday.
 *
 * English names are tried as well as the locale's, so "20 nov" works for
 * someone typing English into a French-locale field.
 */
function findMonth(words, locale) {
	const names = monthNames(locale).map(([long, short]) => [
		long.toLowerCase(),
		short.toLowerCase().replace(".", ""),
	]);

	for (const word of words) {
		for (let m = 0; m < 12; m += 1) {
			if (names[m][0] === word || names[m][1] === word) return m;
		}
		const english = EN_MONTHS.indexOf(word);
		if (english >= 0) return english;
	}

	for (const word of words) {
		for (let m = 0; m < 12; m += 1) {
			if (names[m][0].startsWith(word) || names[m][1].startsWith(word)) return m;
		}
		const english = EN_MONTHS.findIndex((n) => n.startsWith(word));
		if (english >= 0) return english;
	}

	return -1;
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
export function parseDay(
	text,
	{ locale = "en-GB", reference = null, format = null } = {}
) {
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

	/*
	 * Which field order to try, and in what sequence.
	 *
	 * The format's own order comes first so a field round-trips what it prints,
	 * then the locale's, so somebody typing the way they always have is still
	 * understood. With `format="YYYY-MM-DD"` under en-GB that means `2026-11-20`
	 * and `20/11/2026` both work, which is the point.
	 */
	const localeOrder = fieldOrder(locale);
	const formatOrder = fieldOrderFromFormat(format, locale);
	const orders = formatOrder && formatOrder !== localeOrder
		? [formatOrder, localeOrder]
		: [localeOrder];
	const order = orders[0];

	// A month written as a word, in any position.
	const words = raw.match(/[a-zÀ-ɏ]{3,}/g) || [];
	if (words.length) {
		const monthIndex = findMonth(words, locale);
		/*
		 * Words that are not a month are not fatal. `"dddd D MMMM YYYY"` prints
		 * "Friday 20 November 2026", and the old scan only looked at the first
		 * word, found "friday", and gave up: the field could print a date it then
		 * refused to read back. Anything left over is ignored, so a trailing note
		 * on the end of a pasted date does not break it either.
		 */
		if (monthIndex >= 0) {
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
	}

	// Purely numeric from here on.
	const parts = raw.split(/[^\d]+/).filter(Boolean);

	if (parts.length === 1 && (parts[0].length === 6 || parts[0].length === 8)) {
		// A run of digits with no separators. `20261120` is almost certainly ISO;
		// anything else follows the format's order, then the locale's.
		const run = parts[0];
		const candidates = [];
		if (run.length === 8) {
			candidates.push([[run.slice(0, 4), run.slice(4, 6), run.slice(6, 8)], "YMD"]);
			for (const o of orders) {
				candidates.push([[run.slice(0, 2), run.slice(2, 4), run.slice(4, 8)], o]);
			}
		} else {
			for (const o of orders) {
				candidates.push([[run.slice(0, 2), run.slice(2, 4), run.slice(4, 6)], o]);
			}
		}
		for (const [trio, o] of candidates) {
			const got = fromOrderedParts(trio, o);
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
		for (const o of orders) {
			const iDay = o.indexOf("D") < o.indexOf("M") ? 0 : 1;
			const got = safeDay(
				base.getFullYear(),
				Number(parts[1 - iDay]) - 1,
				Number(parts[iDay])
			);
			if (got) return got;
		}
		return null;
	}

	if (parts.length === 3) {
		for (const o of orders) {
			// A four-digit field is the year wherever this order would have put it.
			const yearAt = parts.findIndex((x) => x.length === 4);
			if (yearAt >= 0 && o.indexOf("Y") !== yearAt) {
				const rest = parts.filter((_, i) => i !== yearAt);
				const dayFirst = o.indexOf("D") < o.indexOf("M");
				const moved = safeDay(
					normaliseYear(parts[yearAt]),
					Number(rest[dayFirst ? 1 : 0]) - 1,
					Number(rest[dayFirst ? 0 : 1])
				);
				if (moved) return moved;
			}
			const got = fromOrderedParts(parts, o);
			if (got) return got;
		}
		return null;
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

/**
 * The hint under an input.
 *
 * A token string is shown as itself, because `"D MMM YYYY"` is already a
 * readable description of what to type and inventing a second notation for it
 * would be worse. Everything else falls back to the locale's field order.
 */
export function inputPlaceholder(locale = "en-GB", format = null) {
	if (typeof format === "string" && format.trim() !== "") {
		// Strip the brackets off literals; they are notation, not content.
		return format.replace(/\[([^\]]*)\]/g, "$1");
	}
	const order = fieldOrderFromFormat(format, locale) || fieldOrder(locale);
	return order
		.split("")
		.map((l) => (l === "Y" ? "yyyy" : l === "M" ? "mm" : "dd"))
		.join("/");
}

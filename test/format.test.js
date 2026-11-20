import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeDay, toISODate } from "../src/core/dates.js";
import {
	fieldOrder,
	fieldOrderFromFormat,
	formatWithTokens,
	formatDay,
	formatDayLong,
	formatMonthYear,
	inputPlaceholder,
	parseDay,
	weekdayLabels,
} from "../src/core/format.js";

// Pinned reference so "20/11", "20" and "today" are deterministic.
const reference = makeDay(2026, 10, 20);
const p = (text, opts) => {
	const d = parseDay(text, { reference, ...opts });
	return d ? toISODate(d) : null;
};

describe("fieldOrder is read out of Intl", () => {
	it("knows the orders of the locales we actually ship to", () => {
		assert.equal(fieldOrder("en-GB"), "DMY");
		assert.equal(fieldOrder("en-US"), "MDY");
		assert.equal(fieldOrder("sv-SE"), "YMD");
		assert.equal(fieldOrder("de-DE"), "DMY");
	});

	it("falls back rather than throwing on a bad locale tag", () => {
		assert.equal(fieldOrder("not a locale!!"), "DMY");
	});
});

describe("formatting", () => {
	it("formats to the locale's own order", () => {
		assert.equal(formatDay(reference, { locale: "en-GB" }), "20/11/2026");
		assert.equal(formatDay(reference, { locale: "en-US" }), "11/20/2026");
	});

	it("honours a format function, for a consumer that wants dayjs tokens", () => {
		assert.equal(
			formatDay(reference, { format: (d) => `day ${d.getDate()}` }),
			"day 20"
		);
	});

	it("gives an empty string rather than 'Invalid Date'", () => {
		assert.equal(formatDay(null), "");
		assert.equal(formatDay(new Date("x")), "");
		assert.equal(formatDayLong(null), "");
		assert.equal(formatMonthYear(null), "");
	});

	it("formats the long label a screen reader reads", () => {
		assert.equal(formatDayLong(reference, { locale: "en-GB" }), "Friday, 20 November 2026");
	});

	it("formats the heading", () => {
		assert.equal(formatMonthYear(reference, { locale: "en-GB" }), "November 2026");
	});

	it("suggests a placeholder in the locale's order", () => {
		assert.equal(inputPlaceholder("en-GB"), "dd/mm/yyyy");
		assert.equal(inputPlaceholder("en-US"), "mm/dd/yyyy");
		assert.equal(inputPlaceholder("sv-SE"), "yyyy/mm/dd");
	});
});

describe("weekdayLabels", () => {
	it("starts on Monday when asked", () => {
		const w = weekdayLabels({ locale: "en-GB", weekStartsOn: 1 });
		assert.equal(w.length, 7);
		assert.equal(w[0].long, "Monday");
		assert.equal(w[6].long, "Sunday");
	});

	it("starts on Sunday when asked", () => {
		const w = weekdayLabels({ locale: "en-GB", weekStartsOn: 0 });
		assert.equal(w[0].long, "Sunday");
		assert.equal(w[6].long, "Saturday");
	});

	it("carries a short form for the column and a long one for the reader", () => {
		const w = weekdayLabels({ locale: "en-GB", weekStartsOn: 1 });
		assert.equal(w[0].short, "Mon");
		assert.notEqual(w[0].short, w[0].long);
	});
});

describe("parsing a typed date", () => {
	it("reads the locale's own order with any common separator", () => {
		assert.equal(p("20/11/2026"), "2026-11-20");
		assert.equal(p("20-11-2026"), "2026-11-20");
		assert.equal(p("20.11.2026"), "2026-11-20");
		assert.equal(p("20 11 2026"), "2026-11-20");
	});

	it("reads the other order under a different locale", () => {
		assert.equal(p("11/20/2026", { locale: "en-US" }), "2026-11-20");
		assert.equal(p("2026/11/20", { locale: "sv-SE" }), "2026-11-20");
	});

	it("takes ISO whatever the locale, because every API returns it", () => {
		assert.equal(p("2026-11-20"), "2026-11-20");
		assert.equal(p("2026-11-20", { locale: "en-US" }), "2026-11-20");
		assert.equal(p("2026-1-5"), "2026-01-05");
	});

	it("fills in the year from the reference when none is typed", () => {
		assert.equal(p("20/11"), "2026-11-20");
		assert.equal(p("5/1"), "2026-01-05");
		assert.equal(p("11/20", { locale: "en-US" }), "2026-11-20");
	});

	it("fills in month and year from the reference for a bare day", () => {
		assert.equal(p("20"), "2026-11-20");
		assert.equal(p("1"), "2026-11-01");
	});

	it("pivots a two-digit year at 68, the strptime convention", () => {
		assert.equal(p("20/11/26"), "2026-11-20");
		assert.equal(p("20/11/68"), "2068-11-20");
		assert.equal(p("20/11/69"), "1969-11-20");
		assert.equal(p("20/11/99"), "1999-11-20");
	});

	it("reads a run of digits with no separators", () => {
		assert.equal(p("201126"), "2026-11-20");
		assert.equal(p("20261120"), "2026-11-20");
	});

	it("reads a month written as a word, in either position", () => {
		assert.equal(p("20 Nov 2026"), "2026-11-20");
		assert.equal(p("20 November 2026"), "2026-11-20");
		assert.equal(p("Nov 20 2026"), "2026-11-20");
		assert.equal(p("20 nov"), "2026-11-20");
		assert.equal(p("20 november"), "2026-11-20");
		assert.equal(p("20-Nov-2026"), "2026-11-20");
	});

	it("takes an unambiguous abbreviation of a month name", () => {
		assert.equal(p("1 sept 2026"), "2026-09-01");
		assert.equal(p("1 janu 2026"), "2026-01-01");
	});

	it("falls back to English month names under another locale", () => {
		assert.equal(p("20 nov 2026", { locale: "fr-FR" }), "2026-11-20");
	});

	it("takes the English keywords", () => {
		assert.equal(p("today"), "2026-11-20");
		assert.equal(p("tomorrow"), "2026-11-21");
		assert.equal(p("yesterday"), "2026-11-19");
		assert.equal(p("TODAY"), "2026-11-20");
		assert.equal(p("  tomorrow  "), "2026-11-21");
	});

	it("is not case or whitespace sensitive", () => {
		assert.equal(p("  20 / 11 / 2026 "), "2026-11-20");
		assert.equal(p("20 NOV 2026"), "2026-11-20");
	});

	it("refuses a day that does not exist, rather than rounding it", () => {
		// Silently moving 31 February to the 28th is worse than refusing: nobody
		// notices, and the wrong date goes in the database.
		assert.equal(p("31/02/2026"), null);
		assert.equal(p("30/02/2026"), null);
		assert.equal(p("31/04/2026"), null);
		assert.equal(p("29/02/2026"), null, "2026 is not a leap year");
		assert.equal(p("29/02/2028"), "2028-02-29", "2028 is");
	});

	it("refuses an impossible month or day", () => {
		assert.equal(p("20/13/2026"), null);
		assert.equal(p("00/11/2026"), null);
		assert.equal(p("32/11/2026"), null);
		assert.equal(p("20/00/2026"), null);
	});

	it("refuses text it cannot read", () => {
		assert.equal(p("gibberish"), null);
		assert.equal(p("//"), null);
		assert.equal(p("---"), null);
		assert.equal(p("20 smarch 2026"), null);
	});

	it("reads a half-typed field as far as it can, rather than refusing", () => {
		// This matters because the input commits on every keystroke. "20/" on the
		// way to "20/11/2026" is read as the 20th of the month on screen, so the
		// calendar follows along instead of blanking between characters.
		assert.equal(p("20/"), "2026-11-20");
		assert.equal(p("20/1"), "2026-01-20");
	});

	it("refuses empty and nullish input", () => {
		assert.equal(p(""), null);
		assert.equal(p("   "), null);
		assert.equal(p(null), null);
		assert.equal(p(undefined), null);
	});

	it("round-trips its own formatted output in both orders", () => {
		for (const locale of ["en-GB", "en-US", "sv-SE", "de-DE"]) {
			for (const day of [makeDay(2026, 0, 1), reference, makeDay(2028, 1, 29)]) {
				const text = formatDay(day, { locale });
				assert.equal(
					p(text, { locale }),
					toISODate(day),
					`${locale}: ${text}`
				);
			}
		}
	});
});

describe("token-string formatting", () => {
	const d = makeDay(2026, 10, 20); // a Friday

	it("renders the common patterns", () => {
		const f = (pattern) => formatDay(d, { format: pattern });
		assert.equal(f("DD/MM/YYYY"), "20/11/2026");
		assert.equal(f("YYYY-MM-DD"), "2026-11-20");
		assert.equal(f("D MMM YYYY"), "20 Nov 2026");
		assert.equal(f("dddd D MMMM YYYY"), "Friday 20 November 2026");
	});

	it("does both padded and single-digit tokens", () => {
		const jan5 = makeDay(2026, 0, 5);
		assert.equal(formatDay(jan5, { format: "DD/MM/YYYY" }), "05/01/2026");
		assert.equal(formatDay(jan5, { format: "D/M/YYYY" }), "5/1/2026");
	});

	it("does two-digit years", () => {
		assert.equal(formatDay(d, { format: "DD/MM/YY" }), "20/11/26");
		assert.equal(formatDay(makeDay(2007, 0, 1), { format: "YY" }), "07");
	});

	it("does the three weekday widths", () => {
		assert.equal(formatDay(d, { format: "dddd" }), "Friday");
		assert.equal(formatDay(d, { format: "ddd" }), "Fri");
		assert.equal(formatDay(d, { format: "dd" }), "F");
	});

	it("passes square-bracket literals through untouched", () => {
		// Without escaping the "o" and "n" of "on" would be eaten as tokens.
		assert.equal(formatDay(d, { format: "[on] D MMM" }), "on 20 Nov");
		assert.equal(formatDay(d, { format: "[Week of] D MMMM" }), "Week of 20 November");
		assert.equal(formatDay(d, { format: "[]D" }), "20", "an empty literal");
	});

	it("keeps separators and unknown characters as they are", () => {
		assert.equal(formatDay(d, { format: "D.M.YYYY" }), "20.11.2026");
		assert.equal(formatDay(d, { format: "YYYY年M月D日" }), "2026年11月20日");
	});

	it("takes month and weekday names from Intl, not a table here", () => {
		assert.equal(
			formatDay(d, { locale: "fr-FR", format: "dddd D MMMM YYYY" }),
			"vendredi 20 novembre 2026"
		);
		assert.equal(formatDay(d, { locale: "de-DE", format: "MMMM" }), "November");
		assert.equal(formatDay(d, { locale: "es-ES", format: "MMMM" }), "noviembre");
	});

	it("is exposed on its own for callers who want just the renderer", () => {
		assert.equal(formatWithTokens(d, "D MMM YYYY"), "20 Nov 2026");
	});
});

describe("Intl-options formatting", () => {
	const d = makeDay(2026, 10, 20);

	it("passes the object straight to Intl.DateTimeFormat", () => {
		assert.equal(formatDay(d, { format: { dateStyle: "medium" } }), "20 Nov 2026");
		assert.equal(
			formatDay(d, { locale: "fr-FR", format: { dateStyle: "full" } }),
			"vendredi 20 novembre 2026"
		);
	});

	it("takes a partial options bag", () => {
		assert.equal(formatDay(d, { format: { month: "long", day: "numeric" } }), "20 November");
	});

	it("falls back to the default rather than throwing on a bad bag", () => {
		// A formatting preference must never be able to take the page down.
		assert.equal(formatDay(d, { format: { dateStyle: "nonsense" } }), "20/11/2026");
	});
});

describe("fieldOrderFromFormat", () => {
	it("reads the order out of a token string", () => {
		assert.equal(fieldOrderFromFormat("DD/MM/YYYY"), "DMY");
		assert.equal(fieldOrderFromFormat("YYYY-MM-DD"), "YMD");
		assert.equal(fieldOrderFromFormat("MMM D, YYYY"), "MDY");
		assert.equal(fieldOrderFromFormat("dddd D MMMM YYYY"), "DMY", "weekday tokens are not a field");
	});

	it("reads it out of an options bag through Intl", () => {
		assert.equal(fieldOrderFromFormat({ dateStyle: "short" }, "en-GB"), "DMY");
		assert.equal(fieldOrderFromFormat({ dateStyle: "short" }, "en-US"), "MDY");
	});

	it("says nothing when the format cannot say", () => {
		assert.equal(fieldOrderFromFormat(null), null);
		assert.equal(fieldOrderFromFormat((x) => String(x)), null);
		assert.equal(fieldOrderFromFormat("D MMM"), null, "no year, so no full order");
		assert.equal(fieldOrderFromFormat({ month: "long" }, "en-GB"), null);
	});
});

describe("the format decides how typing is read, before the locale", () => {
	it("reads its own order even when the locale disagrees", () => {
		// The regression this guards: format DD/MM/YYYY under en-US would print
		// 20/11/2026 and then refuse to read it back, because the locale says MDY.
		assert.equal(
			p("20/11/2026", { locale: "en-US", format: "DD/MM/YYYY" }),
			"2026-11-20"
		);
	});

	it("still understands the locale's own order as a fallback", () => {
		// Someone who always types 20/11/2026 is not retrained by a format prop.
		assert.equal(p("20/11/2026", { format: "YYYY-MM-DD" }), "2026-11-20");
		assert.equal(p("2026-11-20", { format: "DD/MM/YYYY" }), "2026-11-20");
	});

	it("an options bag agrees with its locale, so parsing is unchanged", () => {
		// Intl follows the locale, so a bag almost never disagrees with it. Its
		// real use to the parser is saying nothing when it omits a field.
		assert.equal(
			p("11/20/2026", { locale: "en-US", format: { dateStyle: "short" } }),
			"2026-11-20"
		);
		assert.equal(
			p("20/11/2026", { locale: "en-GB", format: { dateStyle: "short" } }),
			"2026-11-20"
		);
	});

	it("does not rescue text that both the format and the locale reject", () => {
		// Under en-US, 20/11/2026 has a month of 20. Guessing the other order
		// here would be inventing an intention nobody expressed.
		assert.equal(
			p("20/11/2026", { locale: "en-US", format: { dateStyle: "short" } }),
			null
		);
	});
});

describe("a weekday in the text does not stop the month being found", () => {
	it("reads a string with a leading weekday", () => {
		// "dddd D MMMM YYYY" prints this, so parsing it back is not optional.
		assert.equal(p("Friday 20 November 2026"), "2026-11-20");
		assert.equal(p("Fri 20 Nov 2026"), "2026-11-20");
		assert.equal(p("Friday, 20 November 2026"), "2026-11-20");
	});

	it("does the same in another locale", () => {
		assert.equal(p("vendredi 20 novembre 2026", { locale: "fr-FR" }), "2026-11-20");
		assert.equal(p("Freitag 20 November 2026", { locale: "de-DE" }), "2026-11-20");
	});

	it("still refuses a string whose only word is not a month", () => {
		assert.equal(p("20 smarch 2026"), null);
	});
});

describe("round trip: every format shape, every locale", () => {
	const patterns = [
		"DD/MM/YYYY",
		"D/M/YYYY",
		"YYYY-MM-DD",
		"D MMM YYYY",
		"D MMMM YYYY",
		"dddd D MMMM YYYY",
		"MMM D, YYYY",
		"DD.MM.YYYY",
	];
	const bags = [
		{ dateStyle: "short" },
		{ dateStyle: "medium" },
		{ dateStyle: "long" },
		{ dateStyle: "full" },
		{ day: "2-digit", month: "2-digit", year: "numeric" },
	];
	const days = [
		makeDay(2026, 0, 1),
		makeDay(2026, 10, 20),
		makeDay(2028, 1, 29),
		makeDay(2026, 11, 31),
	];
	const locales = ["en-GB", "en-US", "sv-SE", "de-DE"];

	it("reads back everything a token string prints", () => {
		for (const locale of locales) {
			for (const format of patterns) {
				for (const day of days) {
					const text = formatDay(day, { locale, format });
					assert.equal(
						p(text, { locale, format }),
						toISODate(day),
						`${locale} ${format} -> ${text}`
					);
				}
			}
		}
	});

	it("reads back everything an options bag prints", () => {
		for (const locale of locales) {
			for (const format of bags) {
				for (const day of days) {
					const text = formatDay(day, { locale, format });
					assert.equal(
						p(text, { locale, format }),
						toISODate(day),
						`${locale} ${JSON.stringify(format)} -> ${text}`
					);
				}
			}
		}
	});

	it("reads back the default, as it always did", () => {
		for (const locale of locales) {
			for (const day of days) {
				const text = formatDay(day, { locale });
				assert.equal(p(text, { locale }), toISODate(day), `${locale}: ${text}`);
			}
		}
	});
});

describe("inputPlaceholder follows the format", () => {
	it("shows a token string as itself, minus the literal brackets", () => {
		assert.equal(inputPlaceholder("en-GB", "D MMM YYYY"), "D MMM YYYY");
		assert.equal(inputPlaceholder("en-GB", "[on] D MMM"), "on D MMM");
	});

	it("falls back to the locale order for a bag or a function", () => {
		assert.equal(inputPlaceholder("en-GB", { dateStyle: "medium" }), "dd/mm/yyyy");
		assert.equal(inputPlaceholder("en-US", null), "mm/dd/yyyy");
		assert.equal(inputPlaceholder("en-GB", (d) => String(d)), "dd/mm/yyyy");
	});
});

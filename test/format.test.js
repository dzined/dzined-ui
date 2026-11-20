import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeDay, toISODate } from "../src/core/dates.js";
import {
	fieldOrder,
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

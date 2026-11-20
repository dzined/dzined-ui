import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	addDays,
	addMonths,
	addYears,
	clampDay,
	compareDay,
	daysInMonth,
	endOfMonth,
	endOfWeek,
	isSameDay,
	isSameMonth,
	isValidDate,
	isWithin,
	makeDay,
	startOfDay,
	startOfMonth,
	startOfWeek,
	toDay,
	toISODate,
} from "../src/core/dates.js";

// These tests run under TZ=Europe/London, set by the npm script. Several of
// them are only meaningful in a zone that observes daylight saving, and the
// clock-change cases below are the whole reason the arithmetic uses setDate
// rather than millisecond addition.

describe("addDays across a clock change", () => {
	it("adds a calendar day over the spring forward (29 March 2026, 23h day)", () => {
		const before = makeDay(2026, 2, 28);
		const after = addDays(before, 1);
		assert.equal(toISODate(after), "2026-03-29");
		assert.equal(after.getHours(), 0, "still local midnight, not 01:00");
	});

	it("adds a calendar day over the autumn back (25 October 2026, 25h day)", () => {
		const after = addDays(makeDay(2026, 9, 24), 1);
		assert.equal(toISODate(after), "2026-10-25");
		assert.equal(after.getHours(), 0);
	});

	it("walks a whole week through the change without drifting", () => {
		let d = makeDay(2026, 2, 26);
		for (let i = 0; i < 7; i += 1) d = addDays(d, 1);
		assert.equal(toISODate(d), "2026-04-02");
	});

	it("goes backwards too", () => {
		assert.equal(toISODate(addDays(makeDay(2026, 2, 29), -1)), "2026-03-28");
	});
});

describe("addMonths clamps instead of overflowing", () => {
	it("31 January plus a month is 28 February, not 3 March", () => {
		assert.equal(toISODate(addMonths(makeDay(2026, 0, 31), 1)), "2026-02-28");
	});

	it("keeps 29 February in a leap year", () => {
		assert.equal(toISODate(addMonths(makeDay(2028, 0, 31), 1)), "2028-02-29");
	});

	it("paging forward from the 31st does not skip February", () => {
		const jan31 = makeDay(2026, 0, 31);
		assert.equal(addMonths(jan31, 1).getMonth(), 1);
		assert.equal(addMonths(jan31, 2).getMonth(), 2);
	});

	it("crosses the year boundary", () => {
		assert.equal(toISODate(addMonths(makeDay(2026, 11, 15), 1)), "2027-01-15");
		assert.equal(toISODate(addMonths(makeDay(2026, 0, 15), -1)), "2025-12-15");
	});

	it("addYears handles 29 February", () => {
		assert.equal(toISODate(addYears(makeDay(2028, 1, 29), 1)), "2029-02-28");
	});
});

describe("toISODate uses local fields", () => {
	it("gives 20 November for local midnight on 20 November", () => {
		assert.equal(toISODate(makeDay(2026, 10, 20)), "2026-11-20");
	});

	it("does not slip a day during British Summer Time", () => {
		// toISOString would give 2026-06-19T23:00:00Z here, and a naive
		// implementation would report the 19th.
		assert.equal(toISODate(makeDay(2026, 5, 20)), "2026-06-20");
	});

	it("pads single-digit fields", () => {
		assert.equal(toISODate(makeDay(2026, 0, 5)), "2026-01-05");
	});

	it("returns null for a non-date", () => {
		assert.equal(toISODate(new Date("nope")), null);
		assert.equal(toISODate("2026-01-01"), null);
	});
});

describe("toDay coercion", () => {
	it("reads a YYYY-MM-DD string as a calendar day, not UTC midnight", () => {
		assert.equal(toISODate(toDay("2026-11-20")), "2026-11-20");
	});

	it("reads an ISO timestamp down to the day", () => {
		assert.equal(toISODate(toDay("2026-11-20T23:30:00.000Z")), "2026-11-20");
	});

	it("strips the time off a Date", () => {
		const d = toDay(new Date(2026, 10, 20, 17, 42, 9));
		assert.equal(d.getHours(), 0);
		assert.equal(toISODate(d), "2026-11-20");
	});

	it("accepts a dayjs-alike through toDate()", () => {
		const fake = { toDate: () => new Date(2026, 10, 20, 9, 0, 0) };
		assert.equal(toISODate(toDay(fake)), "2026-11-20");
	});

	it("rejects an impossible ISO day rather than rolling it over", () => {
		assert.equal(toDay("2026-02-31"), null);
	});

	it("returns null for empty and nullish input", () => {
		assert.equal(toDay(null), null);
		assert.equal(toDay(undefined), null);
		assert.equal(toDay(""), null);
	});

	it("returns null for rubbish", () => {
		assert.equal(toDay("not a date"), null);
		assert.equal(toDay({}), null);
	});
});

describe("week and month edges", () => {
	it("startOfWeek honours a Monday start", () => {
		// 20 November 2026 is a Friday.
		assert.equal(toISODate(startOfWeek(makeDay(2026, 10, 20), 1)), "2026-11-16");
	});

	it("startOfWeek honours a Sunday start", () => {
		assert.equal(toISODate(startOfWeek(makeDay(2026, 10, 20), 0)), "2026-11-15");
	});

	it("startOfWeek is a no-op on the first day of the week", () => {
		assert.equal(toISODate(startOfWeek(makeDay(2026, 10, 16), 1)), "2026-11-16");
	});

	it("endOfWeek is six days on", () => {
		assert.equal(toISODate(endOfWeek(makeDay(2026, 10, 20), 1)), "2026-11-22");
	});

	it("month edges", () => {
		assert.equal(toISODate(startOfMonth(makeDay(2026, 10, 20))), "2026-11-01");
		assert.equal(toISODate(endOfMonth(makeDay(2026, 10, 20))), "2026-11-30");
		assert.equal(toISODate(endOfMonth(makeDay(2026, 1, 10))), "2026-02-28");
		assert.equal(toISODate(endOfMonth(makeDay(2028, 1, 10))), "2028-02-29");
	});

	it("daysInMonth knows leap years", () => {
		assert.equal(daysInMonth(2026, 1), 28);
		assert.equal(daysInMonth(2028, 1), 29);
		assert.equal(daysInMonth(2100, 1), 28, "1900-rule century is not a leap year");
		assert.equal(daysInMonth(2000, 1), 29, "400-rule century is");
	});
});

describe("comparison and bounds", () => {
	const d = makeDay(2026, 10, 20);

	it("compareDay ignores the time of day", () => {
		assert.equal(compareDay(new Date(2026, 10, 20, 23, 59), d), 0);
		assert.equal(compareDay(makeDay(2026, 10, 19), d), -1);
		assert.equal(compareDay(makeDay(2026, 10, 21), d), 1);
	});

	it("isSameDay and isSameMonth", () => {
		assert.ok(isSameDay(new Date(2026, 10, 20, 8), d));
		assert.ok(!isSameDay(makeDay(2025, 10, 20), d));
		assert.ok(isSameMonth(makeDay(2026, 10, 1), d));
		assert.ok(!isSameMonth(makeDay(2025, 10, 20), d), "same month, different year");
		assert.ok(!isSameDay(null, d));
	});

	it("isWithin is inclusive on both ends", () => {
		assert.ok(isWithin(d, makeDay(2026, 10, 20), makeDay(2026, 10, 20)));
		assert.ok(!isWithin(d, makeDay(2026, 10, 21), null));
		assert.ok(!isWithin(d, null, makeDay(2026, 10, 19)));
		assert.ok(isWithin(d, null, null), "unbounded");
	});

	it("clampDay pulls to the nearest bound", () => {
		assert.equal(toISODate(clampDay(d, makeDay(2026, 10, 25), null)), "2026-11-25");
		assert.equal(toISODate(clampDay(d, null, makeDay(2026, 10, 10))), "2026-11-10");
		assert.equal(toISODate(clampDay(d, null, null)), "2026-11-20");
	});
});

describe("misc", () => {
	it("isValidDate", () => {
		assert.ok(isValidDate(new Date()));
		assert.ok(!isValidDate(new Date("x")));
		assert.ok(!isValidDate("2026-01-01"));
		assert.ok(!isValidDate(null));
	});

	it("startOfDay does not mutate its argument", () => {
		const original = new Date(2026, 10, 20, 15, 30);
		const copy = startOfDay(original);
		assert.equal(original.getHours(), 15);
		assert.equal(copy.getHours(), 0);
	});

	it("addDays does not mutate its argument", () => {
		const original = makeDay(2026, 10, 20);
		addDays(original, 10);
		assert.equal(toISODate(original), "2026-11-20");
	});
});

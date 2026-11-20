import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeDay, toISODate } from "../src/core/dates.js";
import { buildMonthGrid, initialFocusDay } from "../src/core/grid.js";

const flat = (grid) => grid.weeks.flat();

describe("buildMonthGrid shape", () => {
	it("always gives six rows of seven when fixedWeeks is on", () => {
		// On a Monday-start week February 2026 needs five rows and March 2026 needs
		// six, which is exactly the jump fixedWeeks exists to stop: page from
		// February to March and the panel would grow by 38px under the cursor.
		for (const month of [makeDay(2026, 1, 1), makeDay(2026, 2, 1), makeDay(2026, 7, 1)]) {
			const grid = buildMonthGrid({ month });
			assert.equal(grid.rows, 6, toISODate(month));
			assert.equal(grid.weeks.length, 6);
			for (const week of grid.weeks) assert.equal(week.length, 7);
		}
	});

	it("gives the natural number of rows when fixedWeeks is off", () => {
		const rows = (month, weekStartsOn) =>
			buildMonthGrid({ month, fixedWeeks: false, weekStartsOn }).rows;
		// 1 February 2026 is a Sunday, so a Monday-start week spills six days of
		// January into the first row and February needs five rows. The same month
		// on a Sunday-start week fits in four.
		assert.equal(rows(makeDay(2026, 1, 1), 1), 5);
		assert.equal(rows(makeDay(2026, 1, 1), 0), 4);
		// March and November 2026 both need six on a Monday start.
		assert.equal(rows(makeDay(2026, 2, 1), 1), 6);
		assert.equal(rows(makeDay(2026, 10, 1), 1), 6);
		assert.equal(rows(makeDay(2026, 10, 1), 0), 5);
	});

	it("starts the first row on the configured first day of the week", () => {
		// 1 November 2026 is a Sunday.
		const monday = buildMonthGrid({ month: makeDay(2026, 10, 1), weekStartsOn: 1 });
		assert.equal(monday.weeks[0][0].iso, "2026-10-26");
		const sunday = buildMonthGrid({ month: makeDay(2026, 10, 1), weekStartsOn: 0 });
		assert.equal(sunday.weeks[0][0].iso, "2026-11-01");
	});

	it("runs as a continuous sequence of days with no gaps or repeats", () => {
		const cells = flat(buildMonthGrid({ month: makeDay(2026, 10, 1) }));
		assert.equal(cells.length, 42);
		for (let i = 1; i < cells.length; i += 1) {
			const gap = (cells[i].date - cells[i - 1].date) / 86400000;
			assert.ok(Math.abs(gap - 1) < 0.001, `gap of ${gap} days at ${cells[i].iso}`);
		}
	});

	it("marks the padding days from the neighbouring months", () => {
		const cells = flat(buildMonthGrid({ month: makeDay(2026, 10, 1), weekStartsOn: 1 }));
		const inMonth = cells.filter((c) => c.inMonth);
		assert.equal(inMonth.length, 30, "November has 30 days");
		assert.equal(cells[0].inMonth, false);
		assert.equal(cells[0].iso, "2026-10-26");
		assert.equal(cells.at(-1).inMonth, false);
	});

	it("flags today only once", () => {
		const grid = buildMonthGrid({
			month: makeDay(2026, 10, 1),
			now: makeDay(2026, 10, 20),
		});
		const todays = flat(grid).filter((c) => c.isToday);
		assert.equal(todays.length, 1);
		assert.equal(todays[0].iso, "2026-11-20");
	});

	it("flags no day as today when today is in another month", () => {
		const grid = buildMonthGrid({
			month: makeDay(2026, 4, 1),
			now: makeDay(2026, 10, 20),
		});
		assert.equal(flat(grid).filter((c) => c.isToday).length, 0);
	});
});

describe("buildMonthGrid disabling", () => {
	it("disables days outside min and max, and says why", () => {
		const grid = buildMonthGrid({
			month: makeDay(2026, 10, 1),
			min: makeDay(2026, 10, 10),
			max: makeDay(2026, 10, 20),
		});
		const byIso = new Map(flat(grid).map((c) => [c.iso, c]));
		assert.equal(byIso.get("2026-11-09").disabled, true);
		assert.equal(byIso.get("2026-11-09").outOfBounds, true);
		assert.equal(byIso.get("2026-11-10").disabled, false, "min is inclusive");
		assert.equal(byIso.get("2026-11-20").disabled, false, "max is inclusive");
		assert.equal(byIso.get("2026-11-21").disabled, true);
	});

	it("disables days the predicate rejects, separately from the bounds", () => {
		const grid = buildMonthGrid({
			month: makeDay(2026, 10, 1),
			// No weekends.
			isDayDisabled: (d) => d.getDay() === 0 || d.getDay() === 6,
		});
		const byIso = new Map(flat(grid).map((c) => [c.iso, c]));
		assert.equal(byIso.get("2026-11-21").disabled, true, "a Saturday");
		assert.equal(byIso.get("2026-11-21").outOfBounds, false, "not a bounds failure");
		assert.equal(byIso.get("2026-11-20").disabled, false, "a Friday");
	});

	it("leaves everything enabled with no bounds and no predicate", () => {
		const grid = buildMonthGrid({ month: makeDay(2026, 10, 1) });
		assert.equal(flat(grid).some((c) => c.disabled), false);
	});
});

describe("initialFocusDay", () => {
	const month = makeDay(2026, 10, 1);
	const now = makeDay(2026, 10, 20);

	it("prefers the selected day when it is in this month", () => {
		const d = initialFocusDay({ month, selected: makeDay(2026, 10, 5), now });
		assert.equal(toISODate(d), "2026-11-05");
	});

	it("falls back to today when the selection is elsewhere", () => {
		const d = initialFocusDay({ month, selected: makeDay(2025, 3, 5), now });
		assert.equal(toISODate(d), "2026-11-20");
	});

	it("falls back to the first selectable day when today is out of bounds", () => {
		const d = initialFocusDay({ month, min: makeDay(2026, 10, 25), now });
		assert.equal(toISODate(d), "2026-11-25");
	});

	it("skips days the predicate rejects", () => {
		const d = initialFocusDay({
			month,
			now: makeDay(2026, 4, 1),
			isDayDisabled: (x) => x.getDate() < 12,
		});
		assert.equal(toISODate(d), "2026-11-12");
	});

	it("does not land on a selected day that is itself disabled", () => {
		const d = initialFocusDay({
			month,
			selected: makeDay(2026, 10, 5),
			min: makeDay(2026, 10, 10),
			now,
		});
		assert.equal(toISODate(d), "2026-11-20", "today, which is inside the bounds");
	});

	it("gives the first of the month when nothing at all is selectable", () => {
		const d = initialFocusDay({ month, now, isDayDisabled: () => true });
		assert.equal(toISODate(d), "2026-11-01");
	});
});

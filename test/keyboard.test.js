import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeDay, toISODate } from "../src/core/dates.js";
import {
	canPageMonth,
	nextFocusDay,
	pageMonth,
} from "../src/core/keyboard.js";

/**
 * The keyboard contract.
 *
 * This is the behaviour the component promises, asserted on dates rather than
 * on `document.activeElement`. The component's only remaining job is to put
 * tabIndex=0 and DOM focus on whatever day these functions name, which is the
 * part verified by hand in a browser (see README, "What is not tested").
 */

const iso = (r) => (r ? toISODate(r.date) : null);

describe("arrow keys", () => {
	// 20 November 2026 is a Friday.
	const friday = makeDay(2026, 10, 20);

	it("Left and Right move by a day", () => {
		assert.equal(iso(nextFocusDay(friday, "ArrowLeft")), "2026-11-19");
		assert.equal(iso(nextFocusDay(friday, "ArrowRight")), "2026-11-21");
	});

	it("Up and Down move by a week, not a row of the grid", () => {
		assert.equal(iso(nextFocusDay(friday, "ArrowUp")), "2026-11-13");
		assert.equal(iso(nextFocusDay(friday, "ArrowDown")), "2026-11-27");
	});

	it("Down off the end of the month pages the grid", () => {
		const moved = nextFocusDay(makeDay(2026, 10, 29), "ArrowDown");
		assert.equal(iso(moved), "2026-12-06");
		assert.equal(moved.monthChanged, true);
		assert.equal(toISODate(moved.month), "2026-12-01");
	});

	it("Up off the start of the month pages the grid backwards", () => {
		const moved = nextFocusDay(makeDay(2026, 10, 3), "ArrowUp");
		assert.equal(iso(moved), "2026-10-27");
		assert.equal(moved.monthChanged, true);
	});

	it("Right on the last day of the month crosses into the next", () => {
		const moved = nextFocusDay(makeDay(2026, 10, 30), "ArrowRight");
		assert.equal(iso(moved), "2026-12-01");
		assert.equal(moved.monthChanged, true);
	});

	it("a move inside the month does not report a month change", () => {
		assert.equal(nextFocusDay(friday, "ArrowLeft").monthChanged, false);
	});

	it("crosses a daylight-saving boundary by one day", () => {
		assert.equal(
			iso(nextFocusDay(makeDay(2026, 2, 28), "ArrowRight")),
			"2026-03-29"
		);
		assert.equal(
			iso(nextFocusDay(makeDay(2026, 9, 24), "ArrowRight")),
			"2026-10-25"
		);
	});
});

describe("Home and End", () => {
	const friday = makeDay(2026, 10, 20);

	it("go to the ends of the week, Monday start", () => {
		assert.equal(iso(nextFocusDay(friday, "Home", { weekStartsOn: 1 })), "2026-11-16");
		assert.equal(iso(nextFocusDay(friday, "End", { weekStartsOn: 1 })), "2026-11-22");
	});

	it("follow a Sunday start", () => {
		assert.equal(iso(nextFocusDay(friday, "Home", { weekStartsOn: 0 })), "2026-11-15");
		assert.equal(iso(nextFocusDay(friday, "End", { weekStartsOn: 0 })), "2026-11-21");
	});

	it("report no move when already on the end of the week", () => {
		assert.equal(nextFocusDay(makeDay(2026, 10, 16), "Home", { weekStartsOn: 1 }), null);
	});
});

describe("PageUp and PageDown", () => {
	it("move a month", () => {
		const d = makeDay(2026, 10, 20);
		assert.equal(iso(nextFocusDay(d, "PageUp")), "2026-10-20");
		assert.equal(iso(nextFocusDay(d, "PageDown")), "2026-12-20");
	});

	it("move a year with Shift", () => {
		const d = makeDay(2026, 10, 20);
		assert.equal(iso(nextFocusDay(d, "PageUp", { shiftKey: true })), "2025-11-20");
		assert.equal(iso(nextFocusDay(d, "PageDown", { shiftKey: true })), "2027-11-20");
	});

	it("clamp the day of month rather than overflowing", () => {
		// 31 January, PageDown. February has 28 days in 2026.
		assert.equal(iso(nextFocusDay(makeDay(2026, 0, 31), "PageDown")), "2026-02-28");
	});

	it("Shift+PageDown from 29 February lands on 28 February", () => {
		assert.equal(
			iso(nextFocusDay(makeDay(2028, 1, 29), "PageDown", { shiftKey: true })),
			"2029-02-28"
		);
	});
});

describe("bounds", () => {
	const max = makeDay(2026, 10, 20);
	const min = makeDay(2026, 10, 1);

	it("clamps a move that would overshoot the max", () => {
		assert.equal(iso(nextFocusDay(makeDay(2026, 10, 18), "ArrowDown", { max })), "2026-11-20");
	});

	it("clamps a move that would undershoot the min", () => {
		assert.equal(iso(nextFocusDay(makeDay(2026, 10, 3), "ArrowUp", { min })), "2026-11-01");
	});

	it("reports no move when already sitting on the bound", () => {
		assert.equal(nextFocusDay(max, "ArrowRight", { max }), null);
		assert.equal(nextFocusDay(min, "ArrowLeft", { min }), null);
	});

	it("clamps a month page too", () => {
		assert.equal(iso(nextFocusDay(makeDay(2026, 10, 20), "PageDown", { max })), null);
		assert.equal(iso(nextFocusDay(makeDay(2026, 10, 10), "PageDown", { max })), "2026-11-20");
	});
});

describe("keys we do not own", () => {
	it("returns null so the browser keeps the event", () => {
		for (const key of ["Tab", "Enter", " ", "a", "Escape", "F5", "ArrowLeftExtra"]) {
			assert.equal(nextFocusDay(makeDay(2026, 10, 20), key), null, key);
		}
	});
});

describe("pageMonth", () => {
	it("keeps the day of month where it can", () => {
		const r = pageMonth(makeDay(2026, 10, 1), makeDay(2026, 10, 20), 1);
		assert.equal(toISODate(r.month), "2026-12-01");
		assert.equal(toISODate(r.date), "2026-12-20");
	});

	it("clamps the day into a shorter month", () => {
		const r = pageMonth(makeDay(2026, 0, 1), makeDay(2026, 0, 31), 1);
		assert.equal(toISODate(r.month), "2026-02-01");
		assert.equal(toISODate(r.date), "2026-02-28");
	});

	it("clamps the landed day into the bounds", () => {
		const r = pageMonth(makeDay(2026, 10, 1), makeDay(2026, 10, 28), 1, {
			max: makeDay(2026, 11, 10),
		});
		assert.equal(toISODate(r.date), "2026-12-10");
	});

	it("goes backwards", () => {
		const r = pageMonth(makeDay(2026, 10, 1), makeDay(2026, 10, 20), -1);
		assert.equal(toISODate(r.month), "2026-10-01");
	});
});

describe("canPageMonth", () => {
	it("refuses forward when the whole next month is past the max", () => {
		assert.equal(canPageMonth(makeDay(2026, 10, 1), 1, { max: makeDay(2026, 10, 20) }), false);
	});

	it("allows forward when some of the next month is inside the max", () => {
		assert.equal(canPageMonth(makeDay(2026, 10, 1), 1, { max: makeDay(2026, 11, 2) }), true);
	});

	it("refuses backward when the whole previous month is before the min", () => {
		assert.equal(canPageMonth(makeDay(2026, 10, 1), -1, { min: makeDay(2026, 10, 1) }), false);
	});

	it("allows backward when part of the previous month is inside the min", () => {
		assert.equal(canPageMonth(makeDay(2026, 10, 1), -1, { min: makeDay(2026, 9, 20) }), true);
	});

	it("allows both ways when unbounded", () => {
		assert.equal(canPageMonth(makeDay(2026, 10, 1), 1), true);
		assert.equal(canPageMonth(makeDay(2026, 10, 1), -1), true);
	});
});

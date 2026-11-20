import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeDay, toISODate } from "../src/core/dates.js";
import {
	isSelectableDay,
	rangeSelection,
	singleSelection,
} from "../src/core/selection.js";

const d = (day) => makeDay(2026, 10, day);
const pair = (value) => value.map((x) => (x ? toISODate(x) : null));

describe("singleSelection", () => {
	it("starts empty and is incomplete until something is chosen", () => {
		assert.equal(singleSelection.empty, null);
		assert.equal(singleSelection.isComplete(null), false);
		assert.equal(singleSelection.isComplete(d(20)), true);
	});

	it("one click is the whole answer", () => {
		const r = singleSelection.select(null, d(20));
		assert.equal(toISODate(r.value), "2026-11-20");
		assert.equal(r.complete, true, "so the popover may close");
	});

	it("replaces an existing selection", () => {
		const r = singleSelection.select(d(20), d(25));
		assert.equal(toISODate(r.value), "2026-11-25");
	});

	it("decorates only the selected day, with no range flags", () => {
		const look = singleSelection.decorate(d(20), d(20));
		assert.deepEqual(look, {
			selected: true,
			rangeStart: false,
			rangeEnd: false,
			inRange: false,
			previewInRange: false,
		});
		assert.equal(singleSelection.decorate(d(20), d(21)).selected, false);
		assert.equal(singleSelection.decorate(null, d(20)).selected, false);
	});

	it("normalises whatever a caller passed", () => {
		assert.equal(toISODate(singleSelection.normalise("2026-11-20")), "2026-11-20");
		assert.equal(singleSelection.normalise(null), null);
	});

	it("anchors the opening month on the selection", () => {
		assert.equal(toISODate(singleSelection.anchor(d(20))), "2026-11-20");
		assert.equal(singleSelection.anchor(null), null);
	});
});

describe("rangeSelection", () => {
	it("starts as a pair of nulls", () => {
		assert.deepEqual(rangeSelection.empty, [null, null]);
		assert.equal(rangeSelection.isComplete([null, null]), false);
		assert.equal(rangeSelection.isComplete([d(10), null]), false);
		assert.equal(rangeSelection.isComplete([d(10), d(20)]), true);
	});

	it("the first click sets the start and does not complete", () => {
		const r = rangeSelection.select([null, null], d(10));
		assert.deepEqual(pair(r.value), ["2026-11-10", null]);
		assert.equal(r.complete, false, "so the popover stays open");
	});

	it("the second click sets the end and completes", () => {
		const r = rangeSelection.select([d(10), null], d(20));
		assert.deepEqual(pair(r.value), ["2026-11-10", "2026-11-20"]);
		assert.equal(r.complete, true);
	});

	it("swaps when the second click is earlier than the first", () => {
		// People click the end of the month first all the time. Refusing would be
		// correct and useless.
		const r = rangeSelection.select([d(20), null], d(10));
		assert.deepEqual(pair(r.value), ["2026-11-10", "2026-11-20"]);
		assert.equal(r.complete, true);
	});

	it("clicking the start twice gives a single-day range", () => {
		const r = rangeSelection.select([d(20), null], d(20));
		assert.deepEqual(pair(r.value), ["2026-11-20", "2026-11-20"]);
		assert.equal(r.complete, true);
	});

	it("a click on a complete range starts a new one", () => {
		const r = rangeSelection.select([d(10), d(20)], d(25));
		assert.deepEqual(pair(r.value), ["2026-11-25", null]);
		assert.equal(r.complete, false);
	});

	it("survives a half-populated value from a caller", () => {
		const r = rangeSelection.select([null, d(20)], d(25));
		assert.deepEqual(pair(r.value), ["2026-11-25", null]);
	});

	it("normalises strings, nulls and non-arrays", () => {
		assert.deepEqual(pair(rangeSelection.normalise(["2026-11-10", "2026-11-20"])), [
			"2026-11-10",
			"2026-11-20",
		]);
		assert.deepEqual(rangeSelection.normalise(null), [null, null]);
		assert.deepEqual(rangeSelection.normalise("nonsense"), [null, null]);
	});
});

describe("rangeSelection decoration", () => {
	const complete = [d(10), d(20)];

	it("marks the endpoints and the days between", () => {
		assert.equal(rangeSelection.decorate(complete, d(10)).rangeStart, true);
		assert.equal(rangeSelection.decorate(complete, d(10)).selected, true);
		assert.equal(rangeSelection.decorate(complete, d(20)).rangeEnd, true);
		assert.equal(rangeSelection.decorate(complete, d(15)).inRange, true);
		assert.equal(rangeSelection.decorate(complete, d(15)).selected, false);
	});

	it("treats the endpoints as inside the range as well", () => {
		assert.equal(rangeSelection.decorate(complete, d(10)).inRange, true);
		assert.equal(rangeSelection.decorate(complete, d(20)).inRange, true);
	});

	it("marks nothing outside the range", () => {
		assert.equal(rangeSelection.decorate(complete, d(9)).inRange, false);
		assert.equal(rangeSelection.decorate(complete, d(21)).inRange, false);
	});

	it("previews forward from a pending start", () => {
		const half = [d(10), null];
		assert.equal(rangeSelection.decorate(half, d(15), d(20)).previewInRange, true);
		assert.equal(rangeSelection.decorate(half, d(25), d(20)).previewInRange, false);
	});

	it("previews backward when the pointer is before the start", () => {
		const half = [d(20), null];
		assert.equal(rangeSelection.decorate(half, d(15), d(10)).previewInRange, true);
		assert.equal(rangeSelection.decorate(half, d(5), d(10)).previewInRange, false);
	});

	it("never previews the start itself, which is already drawn as selected", () => {
		const half = [d(10), null];
		assert.equal(rangeSelection.decorate(half, d(10), d(20)).previewInRange, false);
		assert.equal(rangeSelection.decorate(half, d(10), d(20)).selected, true);
	});

	it("does not preview once the range is complete", () => {
		assert.equal(rangeSelection.decorate(complete, d(25), d(30)).previewInRange, false);
	});

	it("does not preview with nothing hovered", () => {
		assert.equal(rangeSelection.decorate([d(10), null], d(15), null).previewInRange, false);
	});

	it("anchors on the start, or the end if there is no start", () => {
		assert.equal(toISODate(rangeSelection.anchor(complete)), "2026-11-10");
		assert.equal(toISODate(rangeSelection.anchor([null, d(20)])), "2026-11-20");
		assert.equal(rangeSelection.anchor([null, null]), null);
	});
});

describe("isSelectableDay", () => {
	it("refuses nothing", () => {
		assert.equal(isSelectableDay(null, {}), false);
	});

	it("honours the bounds inclusively", () => {
		const opts = { min: d(10), max: d(20) };
		assert.equal(isSelectableDay(d(10), opts), true);
		assert.equal(isSelectableDay(d(20), opts), true);
		assert.equal(isSelectableDay(d(9), opts), false);
		assert.equal(isSelectableDay(d(21), opts), false);
	});

	it("honours the predicate", () => {
		assert.equal(isSelectableDay(d(20), { isDayDisabled: () => true }), false);
		assert.equal(isSelectableDay(d(20), { isDayDisabled: () => false }), true);
	});

	it("accepts anything with no constraints", () => {
		assert.equal(isSelectableDay(d(20), {}), true);
		assert.equal(isSelectableDay(d(20)), true);
	});
});

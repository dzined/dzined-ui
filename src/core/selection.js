import { compareDay, isSameDay, isWithin, toDay } from "./dates.js";

/**
 * Selection models.
 *
 * The calendar grid, its keyboard handling and its styling know nothing about
 * how many dates are being picked. They ask a selection model two questions:
 * "what does clicking this day do" (`select`) and "how should this day look"
 * (`decorate`). A range picker is then the same grid with `rangeSelection`
 * passed in, which is why both models live here fully written and tested even
 * though only the single-date picker component ships in 0.1.0. The alternative
 * (hard-coding single selection into the grid now) is the rewrite the range
 * picker was supposed to avoid.
 */

export const singleSelection = {
	kind: "single",
	empty: null,

	normalise(value) {
		return toDay(value);
	},

	isComplete(value) {
		return Boolean(value);
	},

	/**
	 * `complete` tells a popover whether it may close. For a single date one
	 * click is the whole answer, so it is always true.
	 */
	select(value, day) {
		return { value: day, complete: true };
	},

	decorate(value, day) {
		return {
			selected: isSameDay(value, day),
			rangeStart: false,
			rangeEnd: false,
			inRange: false,
			previewInRange: false,
		};
	},

	/** The day the focus ring should start on when the calendar opens. */
	anchor(value) {
		return value || null;
	},
};

export const rangeSelection = {
	kind: "range",
	empty: [null, null],

	normalise(value) {
		if (!Array.isArray(value)) return [null, null];
		return [toDay(value[0]), toDay(value[1])];
	},

	isComplete(value) {
		const [start, end] = this.normalise(value);
		return Boolean(start && end);
	},

	/**
	 * Clicking starts a range, or finishes the one in progress.
	 *
	 * Clicking a day earlier than the pending start swaps the two rather than
	 * refusing, which is what MUI's range picker does and what people do by
	 * accident constantly: they click the end of the month first.
	 */
	select(value, day) {
		const [start, end] = this.normalise(value);
		if (!start || (start && end)) {
			return { value: [day, null], complete: false };
		}
		if (compareDay(day, start) < 0) {
			return { value: [day, start], complete: true };
		}
		return { value: [start, day], complete: true };
	},

	decorate(value, day, hover = null) {
		const [start, end] = this.normalise(value);
		const selected = isSameDay(start, day) || isSameDay(end, day);

		let inRange = false;
		if (start && end) {
			inRange = compareDay(day, start) >= 0 && compareDay(day, end) <= 0;
		}

		// While only the start is set, the row between it and whatever the mouse
		// or the focus ring is over is shown as a preview. Without this the user
		// gets no feedback at all between the two clicks.
		let previewInRange = false;
		if (start && !end && hover) {
			const lo = compareDay(hover, start) < 0 ? hover : start;
			const hi = compareDay(hover, start) < 0 ? start : hover;
			previewInRange =
				compareDay(day, lo) >= 0 && compareDay(day, hi) <= 0 && !selected;
		}

		return {
			selected,
			rangeStart: Boolean(start) && isSameDay(start, day),
			rangeEnd: Boolean(end) && isSameDay(end, day),
			inRange,
			previewInRange,
		};
	},

	anchor(value) {
		const [start, end] = this.normalise(value);
		return start || end || null;
	},
};

/**
 * Is a value legal given the bounds and the disabled-day predicate?
 *
 * Used to decide whether typed input should be accepted, not to decide whether
 * a cell is clickable; the grid already knows that. Kept here so the input and
 * the grid cannot disagree about what counts as allowed.
 */
export function isSelectableDay(day, { min, max, isDayDisabled } = {}) {
	if (!day) return false;
	if (!isWithin(day, min, max)) return false;
	if (isDayDisabled && isDayDisabled(day)) return false;
	return true;
}

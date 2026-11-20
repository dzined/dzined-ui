import {
	MONDAY,
	addDays,
	daysInMonth,
	isSameDay,
	isSameMonth,
	isWithin,
	makeDay,
	startOfMonth,
	startOfWeek,
	toISODate,
	today,
} from "./dates.js";

/**
 * Turn a month into the rows of cells a calendar renders.
 *
 * `fixedWeeks` defaults to true, so every month is six rows whether it needs
 * them or not. On a Monday-start week February 2026 fits in five rows and March
 * 2026 needs six. Without padding, a popover anchored under an input changes height
 * as you page through months, and if it is near the bottom of the viewport it
 * flips above the input and back again on alternate clicks. MUI pads for the
 * same reason. The padding rows are real dates from the neighbouring months and
 * are selectable, which is what people expect from the trailing greyed-out days.
 */
export function buildMonthGrid({
	month,
	weekStartsOn = MONDAY,
	fixedWeeks = true,
	min = null,
	max = null,
	isDayDisabled = null,
	now = null,
} = {}) {
	const anchor = startOfMonth(month);
	const first = startOfWeek(anchor, weekStartsOn);
	const todayDay = now || today();

	const used = daysInMonth(anchor.getFullYear(), anchor.getMonth());
	const leading = Math.round((anchor - first) / 86400000);
	const naturalRows = Math.ceil((leading + used) / 7);
	const rows = fixedWeeks ? 6 : naturalRows;

	const weeks = [];
	for (let row = 0; row < rows; row += 1) {
		const cells = [];
		for (let col = 0; col < 7; col += 1) {
			const date = addDays(first, row * 7 + col);
			const outOfBounds = !isWithin(date, min, max);
			const rejected = isDayDisabled ? Boolean(isDayDisabled(date)) : false;
			cells.push({
				date,
				iso: toISODate(date),
				dayOfMonth: date.getDate(),
				inMonth: isSameMonth(date, anchor),
				isToday: isSameDay(date, todayDay),
				outOfBounds,
				disabled: outOfBounds || rejected,
			});
		}
		weeks.push(cells);
	}

	return { month: anchor, weeks, rows, weekStartsOn };
}

/**
 * The first day in a month a keyboard user should land on.
 *
 * Opening a picker on a month where every day is out of range and putting the
 * focus ring on a dead cell is how MUI's own calendar used to behave; the arrow
 * keys then appear to do nothing because every neighbour is dead too. We prefer,
 * in order: the selected day, today, the first day that is actually selectable,
 * and only then the 1st.
 */
export function initialFocusDay({
	month,
	selected = null,
	min = null,
	max = null,
	isDayDisabled = null,
	now = null,
} = {}) {
	const anchor = startOfMonth(month);
	const usable = (d) =>
		isWithin(d, min, max) && !(isDayDisabled && isDayDisabled(d));

	if (selected && isSameMonth(selected, anchor) && usable(selected)) {
		return selected;
	}
	const todayDay = now || today();
	if (isSameMonth(todayDay, anchor) && usable(todayDay)) return todayDay;

	const count = daysInMonth(anchor.getFullYear(), anchor.getMonth());
	for (let day = 1; day <= count; day += 1) {
		const candidate = makeDay(anchor.getFullYear(), anchor.getMonth(), day);
		if (usable(candidate)) return candidate;
	}
	return anchor;
}

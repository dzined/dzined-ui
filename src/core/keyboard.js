import {
	MONDAY,
	addDays,
	addMonths,
	addYears,
	clampDay,
	compareDay,
	endOfMonth,
	endOfWeek,
	isSameMonth,
	startOfMonth,
	startOfWeek,
} from "./dates.js";

/**
 * Where the focus ring goes when a key is pressed in the grid.
 *
 * This is a pure function on purpose. The keyboard behaviour is the part of a
 * date picker that is easiest to get subtly wrong and hardest to test through a
 * DOM: you end up asserting on which element has `document.activeElement`
 * through three layers of React effects, the test needs jsdom, and the thing you
 * actually care about (does Down-arrow on 29 November land on 6 December and
 * page the grid) is buried. Pulling it out means the whole key map is covered by
 * assertions on dates, and the component is left with one job, which is to put
 * `tabIndex=0` on whatever date this function returns.
 *
 * Returns null for a key we do not handle, so the caller knows not to
 * preventDefault and the browser keeps its own behaviour (Tab in particular).
 *
 * @returns {{date: Date, month: Date, monthChanged: boolean}|null}
 */
export function nextFocusDay(
	focused,
	key,
	{
		shiftKey = false,
		min = null,
		max = null,
		weekStartsOn = MONDAY,
		visibleMonth = null,
	} = {}
) {
	const from = focused;
	let to = null;

	switch (key) {
		case "ArrowLeft":
			to = addDays(from, -1);
			break;
		case "ArrowRight":
			to = addDays(from, 1);
			break;
		case "ArrowUp":
			to = addDays(from, -7);
			break;
		case "ArrowDown":
			to = addDays(from, 7);
			break;
		case "Home":
			to = startOfWeek(from, weekStartsOn);
			break;
		case "End":
			to = endOfWeek(from, weekStartsOn);
			break;
		case "PageUp":
			// Shift turns the month step into a year step. This is the ARIA
			// date-picker-dialog pattern, and it is also what MUI binds, so anyone
			// moving between the two does not have to relearn it.
			to = shiftKey ? addYears(from, -1) : addMonths(from, -1);
			break;
		case "PageDown":
			to = shiftKey ? addYears(from, 1) : addMonths(from, 1);
			break;
		default:
			return null;
	}

	/**
	 * Clamp rather than refuse.
	 *
	 * With a max of today, pressing Down on the last selectable week would
	 * otherwise do nothing at all and feel like the component had hung. Clamping
	 * walks the ring to the boundary day, which is both a visible response and
	 * usually where the user was heading.
	 */
	to = clampDay(to, min, max);

	// Nothing moved: the ring is already sitting on the boundary. Report no
	// change so the caller leaves the event alone and does not re-render.
	if (compareDay(to, from) === 0) return null;

	const wasMonth = visibleMonth ? startOfMonth(visibleMonth) : startOfMonth(from);
	const nowMonth = startOfMonth(to);

	return {
		date: to,
		month: nowMonth,
		monthChanged: !isSameMonth(wasMonth, nowMonth),
	};
}

/**
 * Which month the grid should show, given where the focus ring is.
 *
 * Arrow keys walk off the end of a month into the next one, and the grid has to
 * follow or the ring disappears into a padding cell the user cannot see the
 * context for. Paging buttons move the month without moving the ring's day of
 * month, which is why this takes both and keeps the day where it was when it can.
 */
export function pageMonth(visibleMonth, focused, step, { min, max } = {}) {
	const month = addMonths(startOfMonth(visibleMonth), step);
	const lastOfMonth = endOfMonth(month);
	const wanted = Math.min(focused.getDate(), lastOfMonth.getDate());
	const landed = new Date(month.getFullYear(), month.getMonth(), wanted);
	landed.setHours(0, 0, 0, 0);
	return { month, date: clampDay(landed, min, max) };
}

/**
 * Can the grid page further in this direction?
 *
 * Used to disable the arrows. A picker with `maxDate` of today should not offer
 * a "next month" button that lands on a grid of dead cells.
 */
export function canPageMonth(visibleMonth, step, { min, max } = {}) {
	const month = addMonths(startOfMonth(visibleMonth), step);
	if (step < 0 && min && compareDay(endOfMonth(month), min) < 0) return false;
	if (step > 0 && max && compareDay(startOfMonth(month), max) > 0) return false;
	return true;
}

"use client";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	addMonths,
	clampDay,
	isSameDay,
	isSameMonth,
	isWithin,
	makeDay,
	startOfMonth,
	toDay,
	toISODate,
	today as todayDate,
} from "../core/dates.js";
import { buildMonthGrid, initialFocusDay } from "../core/grid.js";
import { canPageMonth, nextFocusDay, pageMonth } from "../core/keyboard.js";
import { isSelectableDay, rangeSelection, singleSelection } from "../core/selection.js";
import {
	formatDayLong,
	formatMonthYear,
	weekdayLabels,
} from "../core/format.js";
import { useControllable } from "./useControllable.js";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "./icons.jsx";

const MODELS = { single: singleSelection, range: rangeSelection };

/**
 * The month grid.
 *
 * Shipped on its own as well as inside DzDatePicker, because the portal already
 * uses a *static* calendar in one place: the lawn estimates export screen at
 * work/src/app/lawn-kit/download/page.js renders a StaticDateRangePicker with
 * no input at all, just two months and a column of shortcut buttons. That
 * screen is the reason `mode="range"`, `calendars` and `flat` exist here rather
 * than being invented later.
 *
 * Accessibility follows the ARIA grid pattern, not a list of buttons:
 *  - one tab stop for the whole grid (roving tabindex), so Tab leaves the
 *    calendar instead of walking 42 cells;
 *  - real DOM focus rather than aria-activedescendant, which has the better
 *    support of the two and means :focus-visible does the styling for us;
 *  - disabled days stay focusable and are marked aria-disabled, so the arrows
 *    never appear to jam;
 *  - a polite live region announces the month, because paging with PageDown
 *    otherwise changes 42 cells and says nothing.
 */
export function DzCalendar({
	value,
	defaultValue,
	onChange,
	mode = "single",
	min = null,
	max = null,
	isDayDisabled = null,
	locale = "en-GB",
	weekStartsOn = 1,
	fixedWeeks = true,
	calendars = 1,
	month: monthProp,
	defaultMonth,
	onMonthChange,
	flat = false,
	footer = null,
	autoFocus = false,
	labelledBy,
	label = "Calendar",
	className = "",
	onDayClick,
	...rest
}) {
	const model = MODELS[mode] || singleSelection;
	const minDay = useMemo(() => toDay(min), [min]);
	const maxDay = useMemo(() => toDay(max), [max]);
	const now = useMemo(() => todayDate(), []);

	const [rawValue, setValue] = useControllable(value, defaultValue ?? model.empty, onChange);
	const selection = useMemo(() => model.normalise(rawValue), [model, rawValue]);

	/**
	 * Which month is on screen.
	 *
	 * Derived once from the selection, then owned here. Recomputing it from the
	 * value on every render would yank the user back to the selected month the
	 * moment they paged away without clicking anything.
	 */
	const [monthState, setMonthState] = useState(() => {
		const anchor =
			toDay(defaultMonth) ||
			toDay(monthProp) ||
			model.anchor(selection) ||
			now;
		return startOfMonth(clampDay(anchor, minDay, maxDay));
	});
	const visibleMonth = monthProp ? startOfMonth(toDay(monthProp)) : monthState;

	const setVisibleMonth = useCallback(
		(next) => {
			const m = startOfMonth(next);
			if (!monthProp) setMonthState(m);
			if (onMonthChange) onMonthChange(m);
		},
		[monthProp, onMonthChange]
	);

	const [focused, setFocused] = useState(() =>
		initialFocusDay({
			month: visibleMonth,
			selected: model.anchor(selection),
			min: minDay,
			max: maxDay,
			isDayDisabled,
			now,
		})
	);

	const [hover, setHover] = useState(null);
	const [view, setView] = useState("days");

	const gridRef = useRef(null);
	const dayRefs = useRef(new Map());
	/**
	 * Whether the grid is allowed to grab focus.
	 *
	 * Set when the user interacts with the grid, and on mount only if
	 * `autoFocus` was asked for. Without this flag, every re-render that changes
	 * the focused day (including a parent setting `value` from somewhere else)
	 * would steal focus from whatever the user was actually typing in.
	 */
	const mayFocus = useRef(autoFocus);

	useEffect(() => {
		if (!mayFocus.current) return;
		const el = dayRefs.current.get(toISODate(focused));
		if (el && el !== document.activeElement) el.focus();
	}, [focused, visibleMonth]);

	const headingId = useId();
	const liveId = useId();

	// Paging and arrow keys both go through here so the ring and the grid can
	// never disagree about which month they are on.
	const moveTo = useCallback(
		(date, month) => {
			setFocused(date);
			if (month && !isSameMonth(month, visibleMonth)) setVisibleMonth(month);
		},
		[setVisibleMonth, visibleMonth]
	);

	const commit = useCallback(
		(day) => {
			if (!isSelectableDay(day, { min: minDay, max: maxDay, isDayDisabled })) return;
			const result = model.select(selection, day);
			setValue(result.value, { complete: result.complete, day });
			if (onDayClick) onDayClick(day, result);
			mayFocus.current = true;
			setFocused(day);
			if (!isSameMonth(day, visibleMonth)) setVisibleMonth(startOfMonth(day));
		},
		[
			isDayDisabled,
			maxDay,
			minDay,
			model,
			onDayClick,
			selection,
			setValue,
			setVisibleMonth,
			visibleMonth,
		]
	);

	const onGridKeyDown = useCallback(
		(event) => {
			const { key, shiftKey } = event;

			if (key === "Enter" || key === " " || key === "Spacebar") {
				event.preventDefault();
				commit(focused);
				return;
			}

			const moved = nextFocusDay(focused, key, {
				shiftKey,
				min: minDay,
				max: maxDay,
				weekStartsOn,
				visibleMonth,
			});
			// A key we do not handle, or a move that hit a boundary. Either way the
			// browser keeps the event; Tab in particular has to stay the browser's.
			if (!moved) {
				if (
					["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(key)
				) {
					event.preventDefault();
				}
				return;
			}
			event.preventDefault();
			mayFocus.current = true;
			moveTo(moved.date, moved.month);
		},
		[commit, focused, maxDay, minDay, moveTo, visibleMonth, weekStartsOn]
	);

	const page = useCallback(
		(step) => {
			const { month, date } = pageMonth(visibleMonth, focused, step, {
				min: minDay,
				max: maxDay,
			});
			setVisibleMonth(month);
			setFocused(date);
		},
		[focused, maxDay, minDay, setVisibleMonth, visibleMonth]
	);

	const weekdays = useMemo(
		() => weekdayLabels({ locale, weekStartsOn }),
		[locale, weekStartsOn]
	);

	const months = useMemo(() => {
		const count = Math.max(1, calendars);
		return Array.from({ length: count }, (_, i) => addMonths(visibleMonth, i));
	}, [calendars, visibleMonth]);

	const heading = months
		.map((m) => formatMonthYear(m, { locale }))
		.join(" to ");

	const canPrev = canPageMonth(visibleMonth, -1, { min: minDay, max: maxDay });
	const canNext = canPageMonth(
		addMonths(visibleMonth, months.length - 1),
		1,
		{ min: minDay, max: maxDay }
	);

	return (
		<div
			className={`dz-scope dz-calendar ${className}`.trim()}
			data-flat={flat ? "true" : "false"}
			data-mode={mode}
			{...rest}
		>
			<div className="dz-calendar-header">
				<button
					type="button"
					className="dz-calendar-title"
					id={headingId}
					aria-expanded={view !== "days"}
					aria-label={
						view === "days"
							? `${heading}. Choose a month or year`
							: "Back to days"
					}
					onClick={() => setView(view === "days" ? "months" : "days")}
				>
					<span>{heading}</span>
					<ChevronDownIcon />
				</button>
				<div className="dz-calendar-nav">
					<button
						type="button"
						className="dz-icon-button"
						aria-label="Previous month"
						disabled={view !== "days" || !canPrev}
						onClick={() => page(-1)}
					>
						<ChevronLeftIcon />
					</button>
					<button
						type="button"
						className="dz-icon-button"
						aria-label="Next month"
						disabled={view !== "days" || !canNext}
						onClick={() => page(1)}
					>
						<ChevronRightIcon />
					</button>
				</div>
			</div>

			{/*
			  The month is announced here rather than by putting aria-live on the
			  heading button. A live region on a focusable element gets re-announced
			  every time focus returns to it, which means the month is read out
			  again on every Escape.
			*/}
			<div
				id={liveId}
				className="dz-visually-hidden"
				role="status"
				aria-live="polite"
			>
				{view === "days" ? heading : ""}
			</div>

			{view === "months" ? (
				<MonthShortlist
					visibleMonth={visibleMonth}
					locale={locale}
					min={minDay}
					max={maxDay}
					onPick={(m) => {
						setVisibleMonth(m);
						setFocused(
							initialFocusDay({
								month: m,
								selected: model.anchor(selection),
								min: minDay,
								max: maxDay,
								isDayDisabled,
								now,
							})
						);
						setView("years");
					}}
					onYears={() => setView("years")}
				/>
			) : view === "years" ? (
				<YearShortlist
					visibleMonth={visibleMonth}
					min={minDay}
					max={maxDay}
					onPick={(year) => {
						const m = makeDay(year, visibleMonth.getMonth(), 1);
						setVisibleMonth(m);
						setFocused(
							initialFocusDay({
								month: m,
								selected: model.anchor(selection),
								min: minDay,
								max: maxDay,
								isDayDisabled,
								now,
							})
						);
						setView("days");
					}}
				/>
			) : (
				<div
					ref={gridRef}
					style={{ display: "flex", gap: 14 }}
					onKeyDown={onGridKeyDown}
					onMouseLeave={() => setHover(null)}
				>
					{months.map((m) => (
						<MonthTable
							key={toISODate(m)}
							month={m}
							showCaption={months.length > 1}
							locale={locale}
							weekdays={weekdays}
							weekStartsOn={weekStartsOn}
							fixedWeeks={fixedWeeks}
							min={minDay}
							max={maxDay}
							isDayDisabled={isDayDisabled}
							now={now}
							model={model}
							selection={selection}
							hover={hover}
							focused={focused}
							labelledBy={labelledBy || headingId}
							label={label}
							dayRefs={dayRefs}
							onDayMouseEnter={setHover}
							onDayClick={commit}
							onDayFocus={(day) => {
								mayFocus.current = true;
								setFocused(day);
							}}
						/>
					))}
				</div>
			)}

			{/*
			  The footer lives inside the panel rather than beside it. It was a
			  sibling of the calendar at first, which meant two bordered boxes with
			  two shadows stacked against each other and a hairline seam between
			  them wherever the browser rounded the border differently.
			*/}
			{footer ? <div className="dz-calendar-footer">{footer}</div> : null}
		</div>
	);
}

function MonthTable({
	month,
	showCaption,
	locale,
	weekdays,
	weekStartsOn,
	fixedWeeks,
	min,
	max,
	isDayDisabled,
	now,
	model,
	selection,
	hover,
	focused,
	labelledBy,
	label,
	dayRefs,
	onDayMouseEnter,
	onDayClick,
	onDayFocus,
}) {
	const grid = useMemo(
		() =>
			buildMonthGrid({
				month,
				weekStartsOn,
				fixedWeeks,
				min,
				max,
				isDayDisabled,
				now,
			}),
		[fixedWeeks, isDayDisabled, max, min, month, now, weekStartsOn]
	);

	/**
	 * Which day carries the tab stop in *this* table.
	 *
	 * With two months on screen the focused day lives in one of them. The other
	 * must not offer a tab stop of its own, or Tab would land in the second month
	 * before leaving the component.
	 */
	const ownsFocus = isSameMonth(focused, month);

	return (
		<table
			className="dz-grid"
			role="grid"
			aria-labelledby={labelledBy}
			aria-label={showCaption ? formatMonthYear(month, { locale }) : undefined}
		>
			{showCaption ? (
				<caption
					style={{
						captionSide: "top",
						paddingBottom: 6,
						fontSize: 13,
						fontWeight: 600,
						color: "var(--dz-text-strong)",
					}}
				>
					{formatMonthYear(month, { locale })}
				</caption>
			) : null}
			<thead>
				<tr>
					{weekdays.map((w) => (
						<th key={w.long} scope="col" abbr={w.long}>
							<span aria-hidden="true">{w.short}</span>
							<span className="dz-visually-hidden">{w.long}</span>
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{grid.weeks.map((week) => (
					<tr key={week[0].iso}>
						{week.map((cell) => {
							const look = model.decorate(selection, cell.date, hover);
							const isTabStop = ownsFocus && isSameDay(cell.date, focused);
							return (
								<td
									key={cell.iso}
									className="dz-cell"
									data-in-range={look.inRange ? "true" : undefined}
									data-preview={look.previewInRange ? "true" : undefined}
									data-range-start={look.rangeStart ? "true" : undefined}
									data-range-end={look.rangeEnd ? "true" : undefined}
								>
									<button
										type="button"
										ref={(el) => {
											if (el) dayRefs.current.set(cell.iso, el);
											else dayRefs.current.delete(cell.iso);
										}}
										className="dz-day"
										tabIndex={isTabStop ? 0 : -1}
										aria-selected={look.selected ? "true" : "false"}
										aria-disabled={cell.disabled ? "true" : undefined}
										aria-current={cell.isToday ? "date" : undefined}
										aria-label={formatDayLong(cell.date, { locale })}
										data-today={cell.isToday ? "true" : undefined}
										data-outside={cell.inMonth ? undefined : "true"}
										data-iso={cell.iso}
										onClick={() => {
											if (!cell.disabled) onDayClick(cell.date);
										}}
										onFocus={() => onDayFocus(cell.date)}
										onMouseEnter={() => onDayMouseEnter(cell.date)}
									>
										{cell.dayOfMonth}
									</button>
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}

function MonthShortlist({ visibleMonth, locale, min, max, onPick }) {
	const names = useMemo(() => {
		const f = new Intl.DateTimeFormat(locale, { month: "short" });
		return Array.from({ length: 12 }, (_, m) => f.format(new Date(2026, m, 1)));
	}, [locale]);
	const year = visibleMonth.getFullYear();

	return (
		<div className="dz-shortlist" role="group" aria-label="Month">
			{names.map((name, m) => {
				// A month is offered if any day in it is inside the bounds, not if its
				// first day is; with a min of 20 November, November itself still has
				// ten selectable days in it.
				const first = makeDay(year, m, 1);
				const last = makeDay(year, m + 1, 0);
				const usable =
					isWithin(first, min, max) ||
					isWithin(last, min, max) ||
					(min && max && first <= min && last >= max);
				return (
					<button
						key={name}
						type="button"
						className="dz-shortlist-item"
						aria-pressed={m === visibleMonth.getMonth()}
						disabled={!usable}
						onClick={() => onPick(makeDay(year, m, 1))}
					>
						{name}
					</button>
				);
			})}
		</div>
	);
}

function YearShortlist({ visibleMonth, min, max, onPick }) {
	const current = visibleMonth.getFullYear();
	const first = min ? min.getFullYear() : current - 100;
	const last = max ? max.getFullYear() : current + 20;
	const years = useMemo(() => {
		const out = [];
		for (let y = first; y <= last; y += 1) out.push(y);
		return out;
	}, [first, last]);

	const selectedRef = useRef(null);
	useEffect(() => {
		// Open on the current year rather than at 1926. Without this, a date of
		// birth field asks the user to scroll a hundred rows every time.
		if (selectedRef.current) {
			selectedRef.current.scrollIntoView({ block: "center" });
		}
	}, []);

	return (
		<div className="dz-shortlist" role="group" aria-label="Year">
			{years.map((y) => (
				<button
					key={y}
					type="button"
					ref={y === current ? selectedRef : null}
					className="dz-shortlist-item"
					aria-pressed={y === current}
					onClick={() => onPick(y)}
				>
					{y}
				</button>
			))}
		</div>
	);
}

export default DzCalendar;

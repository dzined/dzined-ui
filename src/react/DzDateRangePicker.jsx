"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compareDay, isSameDay, toDay, toISODate } from "../core/dates.js";
import { formatDay, inputPlaceholder, parseDay } from "../core/format.js";
import { isSelectableDay, pickRangeDay, rangeSelection } from "../core/selection.js";
import { DzCalendar } from "./DzCalendar.jsx";
import { CalendarIcon, CloseIcon } from "./icons.jsx";
import { useControllable } from "./useControllable.js";
import { useAnchoredPosition, useMounted } from "./useAnchoredPosition.js";

/**
 * Two dates, typed or picked.
 *
 * This is a trigger around DzCalendar rather than a second calendar: the grid,
 * the keyboard map, the range fill and the hover preview are the same component
 * and the same tested code as the single picker uses. What is added here is the
 * part a bare calendar cannot know, which is that there are two fields and the
 * user has put their cursor in one of them. That decides which end a click
 * lands on, and it is why src/core/selection.js grew `pickRangeDay` instead of
 * this reusing `rangeSelection.select`.
 *
 * The value is `[start, end]`, either of which may be null. It is never
 * reordered behind the user's back: see `pickRangeDay` for why a field behaves
 * differently from a bare calendar here.
 */
export function DzDateRangePicker({
	value,
	defaultValue = [null, null],
	onChange,
	min = null,
	max = null,
	isDayDisabled = null,
	locale = "en-GB",
	weekStartsOn = 1,
	format = null,
	calendars = 2,
	label,
	startLabel = "From",
	endLabel = "To",
	separator = "to",
	message,
	name,
	id: idProp,
	disabled = false,
	readOnly = false,
	required = false,
	clearable = true,
	shortcuts = null,
	openOnFocus = false,
	fullWidth = false,
	startInputProps = {},
	endInputProps = {},
	calendarProps = {},
	onOpenChange,
	className = "",
	...rest
}) {
	const minDay = useMemo(() => toDay(min), [min]);
	const maxDay = useMemo(() => toDay(max), [max]);

	const [rawValue, setValue] = useControllable(value, defaultValue, onChange);
	const range = useMemo(() => rangeSelection.normalise(rawValue), [rawValue]);
	const [start, end] = range;

	const [open, setOpen] = useState(false);
	const [active, setActive] = useState("start");
	const [text, setText] = useState(() => ({
		start: start ? formatDay(start, { locale, format }) : "",
		end: end ? formatDay(end, { locale, format }) : "",
	}));
	const [errors, setErrors] = useState({ start: null, end: null });

	const shellRef = useRef(null);
	const startRef = useRef(null);
	const endRef = useRef(null);
	const panelRef = useRef(null);
	const typing = useRef(false);

	const autoId = useId();
	const startId = idProp ? `${idProp}-start` : `dz-range-start-${autoId}`;
	const endId = idProp ? `${idProp}-end` : `dz-range-end-${autoId}`;
	const panelId = `dz-range-panel-${autoId}`;
	const messageId = `dz-range-msg-${autoId}`;

	const mounted = useMounted();
	const position = useAnchoredPosition(shellRef, panelRef, open && mounted);

	const fieldRef = (which) => (which === "start" ? startRef : endRef);

	// Same rule as the single picker: never reformat under a live caret.
	useEffect(() => {
		if (typing.current) return;
		setText({
			start: start ? formatDay(start, { locale, format }) : "",
			end: end ? formatDay(end, { locale, format }) : "",
		});
		setErrors({ start: null, end: null });
	}, [end, format, locale, start]);

	const changeOpen = useCallback(
		(next) => {
			setOpen(next);
			if (onOpenChange) onOpenChange(next);
		},
		[onOpenChange]
	);

	/**
	 * Close and return focus, after the commit that unmounts the panel.
	 *
	 * Same race as the single picker: the calendar moves its own focus ring as
	 * part of the update that closes the popover, so a frame-timed focus call
	 * loses to it and the browser drops focus to <body>.
	 */
	const returnFocus = useRef(null);

	const closeAndReturnFocus = useCallback(
		(which) => {
			returnFocus.current = which || active;
			changeOpen(false);
		},
		[active, changeOpen]
	);

	useEffect(() => {
		if (open || !returnFocus.current) return;
		const which = returnFocus.current;
		returnFocus.current = null;
		fieldRef(which).current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) return undefined;
		const onPointerDown = (event) => {
			if (
				shellRef.current?.contains(event.target) ||
				panelRef.current?.contains(event.target)
			) {
				return;
			}
			changeOpen(false);
		};
		const onFocusOut = (event) => {
			const to = event.relatedTarget;
			if (!to) return;
			if (shellRef.current?.contains(to) || panelRef.current?.contains(to)) return;
			changeOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("focusout", onFocusOut, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("focusout", onFocusOut, true);
		};
	}, [changeOpen, open]);

	const commitRange = useCallback(
		(next, meta) => {
			setValue(next, meta);
		},
		[setValue]
	);

	/**
	 * A click in the calendar.
	 *
	 * The popover stays open while the range is half finished, because the user
	 * is mid-gesture and closing would mean reopening to pick the other end.
	 */
	const onDayClick = useCallback(
		(day) => {
			const result = pickRangeDay(range, day, active);
			commitRange(result.value, { source: "calendar", complete: result.complete });
			setErrors({ start: null, end: null });
			if (result.complete) {
				closeAndReturnFocus("end");
				return;
			}
			/*
			 * Hand the *active field* over, but not DOM focus.
			 *
			 * Moving focus to the To input after the first click reads well with a
			 * mouse and strands a keyboard user: they press Enter on a day, focus
			 * leaves the grid for a text box, and there is no key that puts it
			 * back. Leaving focus in the grid means Enter, Enter picks a range,
			 * and the tint on the active half is what says where the next one
			 * goes. Clicking or tabbing into either box still takes it over,
			 * through the inputs' own onFocus.
			 */
			setActive(result.next);
		},
		[active, closeAndReturnFocus, commitRange, range]
	);

	/**
	 * Typing in one of the two fields.
	 *
	 * A typed date that would invert the range is refused and the field marked
	 * invalid, rather than reordered or committed. Reordering is right for two
	 * clicks in a bare calendar and wrong here: the user is editing one named
	 * end, and the other box is on screen showing what it conflicts with.
	 */
	const onFieldChange = useCallback(
		(which, raw) => {
			typing.current = true;
			setText((prev) => ({ ...prev, [which]: raw }));

			if (raw.trim() === "") {
				setErrors((e) => ({ ...e, [which]: null }));
				commitRange(which === "start" ? [null, end] : [start, null], {
					source: "input",
					field: which,
				});
				return;
			}

			const parsed = parseDay(raw, {
				locale,
				reference: (which === "start" ? start : end) || start || end || undefined,
			});
			if (!parsed) {
				setErrors((e) => ({ ...e, [which]: null }));
				return;
			}
			if (!isSelectableDay(parsed, { min: minDay, max: maxDay, isDayDisabled })) {
				setErrors((e) => ({ ...e, [which]: "That date is not available" }));
				return;
			}
			if (which === "start" && end && compareDay(parsed, end) > 0) {
				setErrors((e) => ({ ...e, start: "Start is after the end" }));
				return;
			}
			if (which === "end" && start && compareDay(parsed, start) < 0) {
				setErrors((e) => ({ ...e, end: "End is before the start" }));
				return;
			}

			setErrors((e) => ({ ...e, [which]: null }));
			const current = which === "start" ? start : end;
			if (!isSameDay(parsed, current)) {
				commitRange(which === "start" ? [parsed, end] : [start, parsed], {
					source: "input",
					field: which,
				});
			}
		},
		[commitRange, end, isDayDisabled, locale, maxDay, minDay, start]
	);

	const onFieldBlur = useCallback(
		(which) => {
			typing.current = false;
			const raw = text[which].trim();
			if (raw === "") {
				setErrors((e) => ({ ...e, [which]: null }));
				return;
			}
			const parsed = parseDay(raw, { locale, reference: start || end || undefined });
			if (!parsed) {
				setErrors((e) => ({ ...e, [which]: "Not a date we could read" }));
				return;
			}
			const committed = which === "start" ? start : end;
			if (!isSameDay(parsed, committed)) return;
			setText((prev) => ({
				...prev,
				[which]: formatDay(parsed, { locale, format }),
			}));
		},
		[end, format, locale, start, text]
	);

	const onFieldKeyDown = useCallback(
		(which, event) => {
			if (event.key === "ArrowDown" && !open) {
				event.preventDefault();
				setActive(which);
				changeOpen(true);
				return;
			}
			if (event.key === "Escape" && open) {
				event.preventDefault();
				closeAndReturnFocus(which);
				return;
			}
			if (event.key === "Enter" && open) {
				event.preventDefault();
				closeAndReturnFocus(which);
			}
		},
		[changeOpen, closeAndReturnFocus, open]
	);

	const clear = useCallback(() => {
		typing.current = false;
		setText({ start: "", end: "" });
		setErrors({ start: null, end: null });
		commitRange([null, null], { source: "clear" });
		setActive("start");
		startRef.current?.focus();
	}, [commitRange]);

	const applyShortcut = useCallback(
		(shortcut) => {
			const next = rangeSelection.normalise(shortcut.getValue());
			typing.current = false;
			commitRange(next, { source: "shortcut", label: shortcut.label });
			setErrors({ start: null, end: null });
			if (next[0] && next[1]) closeAndReturnFocus("end");
			else setActive("start");
		},
		[closeAndReturnFocus, commitRange]
	);

	const matchesShortcut = useCallback(
		(shortcut) => {
			const [a, b] = rangeSelection.normalise(shortcut.getValue());
			return isSameDay(a, start) && isSameDay(b, end);
		},
		[end, start]
	);

	const invalid = Boolean(errors.start || errors.end);
	const shownMessage = errors.start || errors.end || message;
	const hint = inputPlaceholder(locale);

	const field = (which) => {
		const isStart = which === "start";
		const extra = isStart ? startInputProps : endInputProps;
		return (
			<input
				ref={isStart ? startRef : endRef}
				id={isStart ? startId : endId}
				name={name ? `${name}-${which}` : undefined}
				className="dz-input dz-range-input"
				data-active={open && active === which ? "true" : undefined}
				type="text"
				inputMode="numeric"
				autoComplete="off"
				spellCheck={false}
				value={text[which]}
				placeholder={hint}
				disabled={disabled}
				readOnly={readOnly}
				required={required}
				aria-label={isStart ? startLabel : endLabel}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				aria-invalid={errors[which] ? true : undefined}
				aria-describedby={shownMessage ? messageId : undefined}
				onChange={(event) => onFieldChange(which, event.target.value)}
				onBlur={() => onFieldBlur(which)}
				onKeyDown={(event) => onFieldKeyDown(which, event)}
				onFocus={() => {
					setActive(which);
					if (openOnFocus && !disabled && !readOnly) changeOpen(true);
				}}
				{...extra}
			/>
		);
	};

	const nights =
		start && end ? Math.round((end - start) / 86400000) : null;

	const panel = (
		<div
			ref={panelRef}
			id={panelId}
			className="dz-scope dz-popover"
			style={position}
			role="dialog"
			aria-modal="false"
			aria-label={label ? `${label}: choose a date range` : "Choose a date range"}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					closeAndReturnFocus();
				}
			}}
		>
			<div className="dz-range-panel">
				{shortcuts && shortcuts.length ? (
					<div className="dz-range-shortcuts" role="group" aria-label="Shortcuts">
						{shortcuts.map((shortcut) => (
							<button
								key={shortcut.label}
								type="button"
								className="dz-range-shortcut"
								aria-pressed={matchesShortcut(shortcut)}
								onClick={() => applyShortcut(shortcut)}
							>
								{shortcut.label}
							</button>
						))}
					</div>
				) : null}

				<div className="dz-range-body">
					<DzCalendar
						mode="range"
						flat
						value={range}
						min={minDay}
						max={maxDay}
						isDayDisabled={isDayDisabled}
						locale={locale}
						weekStartsOn={weekStartsOn}
						calendars={calendars}
						label={label}
						autoFocus
						/*
						 * The calendar's own selection model is bypassed: it reports the
						 * clicked day and this component decides what that means, because
						 * only this component knows which field is active. onChange is
						 * still passed so the grid stays a controlled component.
						 */
						onDayClick={onDayClick}
						onChange={() => {}}
						{...calendarProps}
					/>
					<div className="dz-range-footer">
						<span className="dz-range-summary">
							{start && end
								? `${nights} night${nights === 1 ? "" : "s"}, ${nights + 1} day${nights === 0 ? "" : "s"}`
								: active === "start"
									? "Choose a start date"
									: "Choose an end date"}
						</span>
						{clearable ? (
							<button
								type="button"
								className="dz-text-button"
								disabled={!start && !end}
								onClick={() => {
									clear();
									changeOpen(false);
								}}
							>
								Clear
							</button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div
			className={`dz-scope dz-field ${className}`.trim()}
			style={fullWidth ? { width: "100%" } : undefined}
			{...rest}
		>
			{label ? (
				<span className="dz-field-label" id={`${panelId}-label`}>
					{label}
					{required ? <span aria-hidden="true"> *</span> : null}
				</span>
			) : null}

			{/*
			  A group, so the two inputs are announced as one control with the
			  field's name, and each one then adds its own "From" or "To".
			*/}
			<div
				ref={shellRef}
				className="dz-input-shell dz-range-shell"
				role="group"
				aria-labelledby={label ? `${panelId}-label` : undefined}
				aria-label={label ? undefined : "Date range"}
				data-disabled={disabled ? "true" : "false"}
				data-invalid={invalid ? "true" : "false"}
				style={fullWidth ? { width: "100%" } : undefined}
			>
				{field("start")}
				<span className="dz-range-separator" aria-hidden="true">
					{separator}
				</span>
				{field("end")}

				{clearable && (start || end) && !disabled && !readOnly ? (
					<button
						type="button"
						className="dz-icon-button"
						aria-label="Clear dates"
						onClick={clear}
					>
						<CloseIcon width={15} height={15} />
					</button>
				) : null}

				<button
					type="button"
					className="dz-icon-button"
					aria-label={open ? "Close calendar" : "Open calendar"}
					aria-haspopup="dialog"
					aria-expanded={open}
					disabled={disabled || readOnly}
					onClick={() => {
						if (open) {
							closeAndReturnFocus();
							return;
						}
						// Open on whichever end is still missing, so the icon is useful
						// rather than always starting over.
						setActive(start && !end ? "end" : "start");
						changeOpen(true);
					}}
				>
					<CalendarIcon />
				</button>
			</div>

			{shownMessage ? (
				<div
					id={messageId}
					className="dz-field-message"
					data-invalid={invalid ? "true" : "false"}
				>
					{shownMessage}
				</div>
			) : null}

			{open && mounted ? createPortal(panel, document.body) : null}
		</div>
	);
}

export default DzDateRangePicker;

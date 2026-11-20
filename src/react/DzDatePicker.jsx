"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, isSameDay, toDay, today as todayDate } from "../core/dates.js";
import {
	formatDay,
	inputPlaceholder,
	parseDay,
} from "../core/format.js";
import { isSelectableDay } from "../core/selection.js";
import { DzCalendar } from "./DzCalendar.jsx";
import { CalendarIcon, CloseIcon } from "./icons.jsx";
import { useControllable } from "./useControllable.js";
import { useAnchoredPosition, useMounted } from "./useAnchoredPosition.js";

/**
 * A single date, typed or picked.
 *
 * Typing is a first-class way to use this, not a fallback. Anyone entering a
 * date they already know is faster with the keyboard than with a grid, and the
 * parser is deliberately loose about it: see src/core/format.js for what it
 * takes. The rules the component adds on top:
 *
 *  - Text that parses to a selectable day is committed as you type, so the
 *    calendar follows along and you can see you were understood.
 *  - Text that does not parse is left exactly as typed and the field is marked
 *    invalid. Rewriting or clearing someone's half-finished input on blur is
 *    the behaviour everyone hates about date fields, and it loses work.
 *  - An empty field commits null, which is how you clear it by keyboard.
 *
 * The popover is not modal. Escape closes it and puts focus back on the input;
 * tabbing out of it closes it and lets focus carry on where it was going. The
 * ARIA date-picker-*dialog* pattern would have us trap focus, but that pattern
 * is written for a button that opens a dialog, not for a text field with a grid
 * attached, and trapping focus in something the user can type past is worse.
 */
export function DzDatePicker({
	value,
	defaultValue = null,
	onChange,
	min = null,
	max = null,
	isDayDisabled = null,
	locale = "en-GB",
	weekStartsOn = 1,
	format = null,
	label,
	placeholder,
	message,
	name,
	id: idProp,
	disabled = false,
	readOnly = false,
	required = false,
	clearable = true,
	showTodayButton = true,
	openOnFocus = false,
	fullWidth = false,
	inputProps = {},
	calendarProps = {},
	onOpenChange,
	className = "",
	...rest
}) {
	const minDay = useMemo(() => toDay(min), [min]);
	const maxDay = useMemo(() => toDay(max), [max]);

	const [rawValue, setValue] = useControllable(value, defaultValue, onChange);
	const selected = useMemo(() => toDay(rawValue), [rawValue]);

	const [open, setOpen] = useState(false);
	const [text, setText] = useState(() =>
		selected ? formatDay(selected, { locale, format }) : ""
	);
	const [typedError, setTypedError] = useState(null);

	const shellRef = useRef(null);
	const inputRef = useRef(null);
	const panelRef = useRef(null);
	const typing = useRef(false);

	const autoId = useId();
	const inputId = idProp || `dz-date-${autoId}`;
	const panelId = `dz-panel-${autoId}`;
	const messageId = `dz-msg-${autoId}`;

	const mounted = useMounted();
	const position = useAnchoredPosition(shellRef, panelRef, open && mounted);

	/**
	 * Keep the text in step with the value, but never while the user is typing.
	 *
	 * A controlled parent re-rendering mid-keystroke would otherwise reformat
	 * "20/1" into "20/01/2026" under the caret and the next keypress would land
	 * in the wrong place.
	 */
	useEffect(() => {
		if (typing.current) return;
		setText(selected ? formatDay(selected, { locale, format }) : "");
		setTypedError(null);
	}, [format, locale, selected]);

	const changeOpen = useCallback(
		(next) => {
			setOpen(next);
			if (onOpenChange) onOpenChange(next);
		},
		[onOpenChange]
	);

	/**
	 * Close, and put the focus back in the field.
	 *
	 * The focus call has to happen *after* the commit that unmounts the popover,
	 * not in a requestAnimationFrame alongside it. Selecting a day moves the
	 * calendar's own focus ring to that day as part of the same update, so a
	 * frame-timed focus call raced it: the input took focus, the calendar's
	 * effect took it straight back to a cell, and then the portal unmounted and
	 * the browser dropped focus to <body>. Tab from there starts at the top of
	 * the page. Flagging the intention and acting on it in an effect keyed to
	 * `open` means the field is the last thing touched, every time.
	 */
	const returnFocus = useRef(false);

	const closeAndReturnFocus = useCallback(() => {
		returnFocus.current = true;
		changeOpen(false);
	}, [changeOpen]);

	useEffect(() => {
		if (open || !returnFocus.current) return;
		returnFocus.current = false;
		inputRef.current?.focus();
	}, [open]);

	// Clicking anywhere outside the field or the panel closes it, without moving
	// focus: the user is on their way somewhere else and we should not fight them.
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

	const commitDay = useCallback(
		(day) => {
			setValue(day, { source: "calendar" });
			setTypedError(null);
		},
		[setValue]
	);

	const onInputChange = useCallback(
		(event) => {
			const next = event.target.value;
			typing.current = true;
			setText(next);

			if (next.trim() === "") {
				setTypedError(null);
				setValue(null, { source: "input" });
				return;
			}

			const parsed = parseDay(next, { locale, reference: selected || todayDate() });
			if (!parsed) {
				// Not an error yet: "2" on the way to "20/11" does parse, but "20/" does
				// not, and flashing red between keystrokes is noise. The message waits
				// for blur; only aria-invalid goes on now, for anyone who asks.
				setTypedError(null);
				return;
			}
			if (!isSelectableDay(parsed, { min: minDay, max: maxDay, isDayDisabled })) {
				setTypedError(
					minDay && parsed < minDay
						? `Earliest is ${formatDay(minDay, { locale, format })}`
						: maxDay && parsed > maxDay
							? `Latest is ${formatDay(maxDay, { locale, format })}`
							: "That date is not available"
				);
				return;
			}
			setTypedError(null);
			if (!isSameDay(parsed, selected)) setValue(parsed, { source: "input" });
		},
		[format, isDayDisabled, locale, maxDay, minDay, selected, setValue]
	);

	const onInputBlur = useCallback(() => {
		typing.current = false;
		const raw = text.trim();
		if (raw === "") {
			setTypedError(null);
			return;
		}
		const parsed = parseDay(raw, { locale, reference: selected || todayDate() });
		if (!parsed) {
			setTypedError("Not a date we could read");
			return;
		}
		if (!isSelectableDay(parsed, { min: minDay, max: maxDay, isDayDisabled })) return;
		// Normalise the display only once they have finished, so "20-11-26" becomes
		// "20/11/2026" in front of them rather than under their cursor.
		setText(formatDay(parsed, { locale, format }));
		setTypedError(null);
	}, [format, isDayDisabled, locale, maxDay, minDay, selected, text]);

	const onInputKeyDown = useCallback(
		(event) => {
			if (event.key === "ArrowDown" && !open) {
				event.preventDefault();
				changeOpen(true);
				return;
			}
			if (event.key === "Escape" && open) {
				event.preventDefault();
				closeAndReturnFocus();
				return;
			}
			if (event.key === "Enter" && open) {
				// Enter in the text field means "I have finished typing", not "submit
				// the form I happen to be inside".
				event.preventDefault();
				closeAndReturnFocus();
			}
		},
		[changeOpen, closeAndReturnFocus, open]
	);

	const clear = useCallback(() => {
		typing.current = false;
		setText("");
		setTypedError(null);
		setValue(null, { source: "clear" });
		inputRef.current?.focus();
	}, [setValue]);

	const invalid = Boolean(typedError);
	const shownMessage = typedError || message;
	const hint = placeholder ?? inputPlaceholder(locale);

	/*
	 * Today and Clear, handed to the calendar so they sit inside its one panel.
	 * Today is disabled rather than hidden when today is outside the bounds: a
	 * button that comes and goes depending on the date is harder to learn than
	 * one that is always there and sometimes dimmed.
	 */
	const footer =
		showTodayButton || clearable ? (
			<>
				{showTodayButton ? (
					<button
						type="button"
						className="dz-text-button"
						disabled={
							!isSelectableDay(todayDate(), {
								min: minDay,
								max: maxDay,
								isDayDisabled,
							})
						}
						onClick={() => {
							commitDay(todayDate());
							closeAndReturnFocus();
						}}
					>
						Today
					</button>
				) : (
					<span />
				)}
				{clearable ? (
					<button
						type="button"
						className="dz-text-button"
						disabled={!selected}
						onClick={() => {
							clear();
							changeOpen(false);
						}}
					>
						Clear
					</button>
				) : null}
			</>
		) : null;

	const panel = (
		<div
			ref={panelRef}
			id={panelId}
			className="dz-scope dz-popover"
			style={position}
			role="dialog"
			aria-modal="false"
			aria-label={label ? `${label}: choose a date` : "Choose a date"}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					closeAndReturnFocus();
				}
			}}
		>
			<DzCalendar
				mode="single"
				value={selected}
				onChange={(day, meta) => {
					commitDay(day);
					if (meta?.complete) closeAndReturnFocus();
				}}
				min={minDay}
				max={maxDay}
				isDayDisabled={isDayDisabled}
				locale={locale}
				weekStartsOn={weekStartsOn}
				label={label}
				footer={footer}
				autoFocus
				{...calendarProps}
			/>
		</div>
	);

	return (
		<div
			className={`dz-scope dz-field ${className}`.trim()}
			style={fullWidth ? { width: "100%" } : undefined}
			{...rest}
		>
			{label ? (
				<label className="dz-field-label" htmlFor={inputId}>
					{label}
					{required ? <span aria-hidden="true"> *</span> : null}
				</label>
			) : null}

			<div
				ref={shellRef}
				className="dz-input-shell"
				data-disabled={disabled ? "true" : "false"}
				data-invalid={invalid ? "true" : "false"}
				style={fullWidth ? { width: "100%" } : undefined}
			>
				<input
					ref={inputRef}
					id={inputId}
					name={name}
					className="dz-input"
					type="text"
					inputMode="numeric"
					autoComplete="off"
					spellCheck={false}
					value={text}
					placeholder={hint}
					disabled={disabled}
					readOnly={readOnly}
					required={required}
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-controls={open ? panelId : undefined}
					aria-invalid={invalid || undefined}
					aria-describedby={shownMessage ? messageId : undefined}
					onChange={onInputChange}
					onBlur={onInputBlur}
					onKeyDown={onInputKeyDown}
					onFocus={() => {
						if (openOnFocus && !disabled && !readOnly) changeOpen(true);
					}}
					{...inputProps}
				/>

				{clearable && selected && !disabled && !readOnly ? (
					<button
						type="button"
						className="dz-icon-button"
						aria-label="Clear date"
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
					onClick={() => (open ? closeAndReturnFocus() : changeOpen(true))}
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

export default DzDatePicker;

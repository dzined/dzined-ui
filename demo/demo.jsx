import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { StaticDatePicker } from "@mui/x-date-pickers/StaticDatePicker";
import dayjs from "dayjs";

// The library's one stylesheet, imported the way a consumer would import it.
// esbuild emits it beside the bundle as dist/demo.css.
import "../src/styles/dzined-ui.css";
import { DzCalendar, DzDatePicker } from "../src/index.js";
import { addDays, toISODate, today } from "../src/core/dates.js";

/*
 * The comparison is only fair if MUI is given the same palette, so this theme
 * carries the portal's real primary.main and shape.borderRadius out of
 * work/src/theme/lightTheme.js. Everything else is MUI's default, which is the
 * point: the question is whether ours looks as finished as theirs, not whether
 * the portal's theme flatters one of them.
 */
function muiTheme(mode) {
	return createTheme({
		palette: {
			mode,
			primary: { main: mode === "dark" ? "#18CDC7" : "#1642A5" },
			...(mode === "dark"
				? { background: { paper: "#12214A", default: "#090F25" } }
				: {}),
		},
		shape: { borderRadius: 2 },
	});
}

function Section({ title, note, children }) {
	return (
		<section>
			<h2>{title}</h2>
			{note ? <p className="note">{note}</p> : null}
			{children}
		</section>
	);
}

function Readout({ label, value }) {
	const show = (v) => {
		if (v == null) return "null";
		if (Array.isArray(v)) return `[${v.map(show).join(", ")}]`;
		return toISODate(v);
	};
	return (
		<div className="readout">
			{label}: {show(value)}
		</div>
	);
}

function Basics() {
	const [controlled, setControlled] = useState(today());
	const [log, setLog] = useState([]);

	const push = (line) =>
		setLog((prev) => [`${new Date().toLocaleTimeString("en-GB")}  ${line}`, ...prev].slice(0, 7));

	return (
		<div className="row">
			<div className="col">
				<span className="tag">Uncontrolled</span>
				<DzDatePicker
					label="Start date"
					defaultValue={null}
					message="Try typing 20/11, 20 nov, or today"
					onChange={(d, meta) =>
						push(`uncontrolled -> ${d ? toISODate(d) : "null"} (${meta?.source || "calendar"})`)
					}
				/>
			</div>

			<div className="col">
				<span className="tag">Controlled</span>
				<DzDatePicker
					label="Invoice date"
					value={controlled}
					onChange={(d) => setControlled(d)}
				/>
				<Readout label="value" value={controlled} />
			</div>

			<div className="col">
				<span className="tag">Bounded, weekdays only</span>
				<DzDatePicker
					label="Site visit"
					defaultValue={null}
					min={today()}
					max={addDays(today(), 60)}
					isDayDisabled={(d) => d.getDay() === 0 || d.getDay() === 6}
					message="Next 60 days, Monday to Friday"
				/>
			</div>

			<div className="col">
				<span className="tag">Disabled and read-only</span>
				<DzDatePicker label="Disabled" defaultValue={today()} disabled />
				<DzDatePicker label="Read-only" defaultValue={today()} readOnly />
			</div>

			<div className="col" style={{ flex: "1 1 260px" }}>
				<span className="tag">onChange log</span>
				<div className="readout" style={{ minHeight: 120 }}>
					{log.length ? log.join("\n") : "nothing yet"}
				</div>
			</div>
		</div>
	);
}

function SideBySide({ mode }) {
	const [ours, setOurs] = useState(null);
	const [theirs, setTheirs] = useState(null);

	return (
		<>
			<div className="row">
				<div className="col">
					<span className="tag">@dzined/ui</span>
					<DzDatePicker label="Date" value={ours} onChange={setOurs} />
					<Readout label="Date" value={ours} />
				</div>
				<div className="col">
					<span className="tag">MUI X DatePicker</span>
					<LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
						<DatePicker
							label="Date"
							value={theirs}
							onChange={setTheirs}
							slotProps={{ textField: { size: "small" } }}
						/>
					</LocalizationProvider>
					<div className="readout">
						dayjs: {theirs ? theirs.format("YYYY-MM-DD") : "null"}
					</div>
				</div>
			</div>

			<div className="row" style={{ marginTop: 28 }}>
				<div className="col">
					<span className="tag">@dzined/ui static calendar</span>
					<DzCalendar
						defaultValue={today()}
						onChange={() => {}}
						aria-label="Static calendar"
					/>
				</div>
				<div className="col">
					<span className="tag">MUI X StaticDatePicker</span>
					<ThemeProvider theme={muiTheme(mode)}>
						<LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
							<StaticDatePicker
								defaultValue={dayjs()}
								slotProps={{ actionBar: { actions: [] } }}
							/>
						</LocalizationProvider>
					</ThemeProvider>
				</div>
			</div>
		</>
	);
}

/*
 * The shape the lawn estimates export screen needs.
 *
 * work/src/app/lawn-kit/download/page.js renders a StaticDateRangePicker with
 * two months and eight shortcut buttons. This is that screen's layout driven by
 * DzCalendar with mode="range" and calendars={2}: the grid, the keyboard
 * handling, the range fill and the hover preview are all the same component as
 * the single picker above, with a different selection model passed in.
 *
 * It is not a finished DzDateRangePicker. What is missing is the two-input
 * trigger, which is a wrapper around this, and the shortcuts rail, which is
 * twenty lines of the consumer's own markup, as it is here.
 */
function RangePreview() {
	const [range, setRange] = useState([addDays(today(), -30), today()]);

	const shortcuts = useMemo(
		() => [
			{ label: "This week", get: () => weekOf(today()) },
			{ label: "Last 7 days", get: () => [addDays(today(), -7), today()] },
			{ label: "This month", get: () => monthOf(today()) },
			{ label: "Last 30 days", get: () => [addDays(today(), -30), today()] },
			{ label: "Last 90 days", get: () => [addDays(today(), -90), today()] },
			{ label: "Reset", get: () => [null, null] },
		],
		[]
	);

	return (
		<div className="row">
			<div className="shortcuts">
				{shortcuts.map((s) => (
					<button key={s.label} type="button" onClick={() => setRange(s.get())}>
						{s.label}
					</button>
				))}
			</div>
			<div className="col">
				<DzCalendar
					mode="range"
					calendars={2}
					value={range}
					onChange={setRange}
					label="Export date range"
				/>
				<Readout label="range" value={range} />
			</div>
		</div>
	);
}

function weekOf(d) {
	const start = addDays(d, -((d.getDay() + 6) % 7));
	return [start, addDays(start, 6)];
}

function monthOf(d) {
	const start = new Date(d.getFullYear(), d.getMonth(), 1);
	const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
	return [start, end];
}

function Keys() {
	const rows = [
		["Arrow keys", "a day left and right, a week up and down, across month boundaries"],
		["Home / End", "first and last day of the week"],
		["PageUp / PageDown", "a month"],
		["Shift + PageUp / PageDown", "a year"],
		["Enter or Space", "select the focused day"],
		["Escape", "close and put the focus back in the field"],
		["Tab", "leaves the calendar in one press, not forty-two"],
		["Arrow Down in the field", "open the calendar"],
	];
	return (
		<table className="keys">
			<tbody>
				{rows.map(([k, what]) => (
					<tr key={k}>
						<td>
							{k.split(" / ").map((part, i) => (
								<span key={part}>
									{i ? " / " : ""}
									<kbd>{part}</kbd>
								</span>
							))}
						</td>
						<td>{what}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function App() {
	const [mode, setMode] = useState("light");

	const flip = () => {
		const next = mode === "light" ? "dark" : "light";
		setMode(next);
		// The library reads data-dz-theme, not an MUI theme or the OS preference.
		document.documentElement.setAttribute("data-dz-theme", next);
	};

	return (
		<ThemeProvider theme={muiTheme(mode)}>
			<CssBaseline enableColorScheme={false} />
			<header>
				<div>
					<h1>@dzined/ui &mdash; date picker</h1>
					<p>
						No runtime dependencies, no licence key, no watermark. Styled from
						the portal&rsquo;s own palette.
					</p>
				</div>
				<button type="button" className="toggle" onClick={flip}>
					{mode === "light" ? "Dark" : "Light"} mode
				</button>
			</header>

			<main>
				<Section
					title="The picker"
					note="Controlled and uncontrolled, bounds, a disabled-day predicate, and typing. The field commits on every keystroke that parses, so the calendar follows what you type."
				>
					<Basics />
				</Section>

				<Section
					title="Next to MUI's"
					note="MUI is given the portal's primary colour and 2px corner radius so the comparison is about the components, not the palette. MUI's own defaults do the rest."
				>
					<SideBySide mode={mode} />
				</Section>

				<Section
					title="What the lawn estimates export screen needs"
					note="Two months, a shortcuts rail, and a range. The same DzCalendar as above with mode='range' and calendars={2}. This is the primitive, not a finished range picker: the two-input trigger is still to build."
				>
					<RangePreview />
				</Section>

				<Section title="Keyboard">
					<Keys />
				</Section>
			</main>
		</ThemeProvider>
	);
}

createRoot(document.getElementById("root")).render(<App />);

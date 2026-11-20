/*
 * Inline SVG, not an icon package.
 *
 * The whole point of this library is that a consumer installs it and gets no
 * dependency graph. Five paths are not worth a peer dependency on an icon set,
 * and the standalone sites (dzined/make, dzined/madeby68) have no icon package
 * installed at all.
 *
 * Every icon is `aria-hidden`; the accessible name lives on the button.
 */

const base = {
	width: 18,
	height: 18,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.8,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": "true",
	focusable: "false",
};

export function CalendarIcon(props) {
	return (
		<svg {...base} {...props}>
			<rect x="3" y="5" width="18" height="16" rx="2" />
			<path d="M3 10h18M8 3v4M16 3v4" />
		</svg>
	);
}

export function ChevronLeftIcon(props) {
	return (
		<svg {...base} {...props}>
			<path d="M15 5l-7 7 7 7" />
		</svg>
	);
}

export function ChevronRightIcon(props) {
	return (
		<svg {...base} {...props}>
			<path d="M9 5l7 7-7 7" />
		</svg>
	);
}

export function ChevronDownIcon(props) {
	return (
		<svg {...base} width={16} height={16} {...props}>
			<path d="M6 9l6 6 6-6" />
		</svg>
	);
}

export function CloseIcon(props) {
	return (
		<svg {...base} {...props}>
			<path d="M6 6l12 12M18 6L6 18" />
		</svg>
	);
}

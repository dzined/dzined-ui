"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Put a panel under an anchor, flipping and shifting to stay on screen.
 *
 * This is about sixty lines instead of a positioning library, and it is sixty
 * lines because of what it does *not* try to do: no arrow, no virtual
 * reference, no middleware pipeline. A date picker panel needs bottom-start,
 * flip to top when the bottom is short, and a nudge sideways when the anchor is
 * near the right edge.
 *
 * It positions with `fixed` and renders through a portal on `document.body`.
 * Absolute positioning inside the component tree reads better in the DOM but
 * gets clipped by the first ancestor with `overflow: hidden`, and the portal is
 * full of scroll containers and sticky bars that have exactly that. A picker
 * that opens inside a table toolbar and gets its bottom two rows cut off is not
 * worth the tidier markup.
 *
 * Because it is fixed, it has to follow scrolling. `capture: true` on the
 * scroll listener is what makes that work when the page scrolls in an inner
 * container rather than the window.
 */
export function useAnchoredPosition(anchorRef, panelRef, open, { gap = 6 } = {}) {
	/*
	 * Hidden with `opacity`, never `visibility`.
	 *
	 * The panel renders once before it has been measured, and that first frame
	 * has to be invisible or it flashes at 0,0. `visibility: hidden` does that,
	 * but it also makes everything inside unfocusable, and the calendar focuses
	 * its day cell from an effect in that same commit: the focus call silently
	 * did nothing and the picker opened with the focus ring still on the button
	 * that opened it, so the arrow keys went nowhere. `opacity: 0` hides it just
	 * as well and leaves the subtree focusable.
	 */
	const [style, setStyle] = useState({
		position: "fixed",
		top: 0,
		left: 0,
		opacity: 0,
		pointerEvents: "none",
	});
	const frame = useRef(0);

	const measure = useCallback(() => {
		const anchor = anchorRef.current;
		const panel = panelRef.current;
		if (!anchor || !panel) return;

		const a = anchor.getBoundingClientRect();
		const p = panel.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		const roomBelow = vh - a.bottom - gap;
		const roomAbove = a.top - gap;
		// Flip only when below genuinely will not fit *and* above is roomier.
		// Flipping whenever below is tight makes the panel jump as the page
		// scrolls past the halfway point.
		const placeAbove = p.height > roomBelow && roomAbove > roomBelow;

		let top = placeAbove ? a.top - p.height - gap : a.bottom + gap;
		let left = a.left;

		if (left + p.width > vw - 8) left = Math.max(8, vw - 8 - p.width);
		if (left < 8) left = 8;
		top = Math.max(8, Math.min(top, vh - p.height - 8));

		setStyle({
			position: "fixed",
			top: Math.round(top),
			left: Math.round(left),
			opacity: 1,
			pointerEvents: "auto",
		});
	}, [anchorRef, gap, panelRef]);

	useLayoutEffect(() => {
		if (!open) {
			setStyle((s) => ({ ...s, opacity: 0, pointerEvents: "none" }));
			return undefined;
		}
		measure();

		const schedule = () => {
			cancelAnimationFrame(frame.current);
			frame.current = requestAnimationFrame(measure);
		};
		window.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);

		// The panel's height changes when the user switches to the year list, and
		// that can push it off the bottom of the screen. ResizeObserver catches
		// that without us having to know which views exist.
		let ro;
		if (typeof ResizeObserver !== "undefined" && panelRef.current) {
			ro = new ResizeObserver(schedule);
			ro.observe(panelRef.current);
		}

		return () => {
			cancelAnimationFrame(frame.current);
			window.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
			if (ro) ro.disconnect();
		};
	}, [measure, open, panelRef]);

	return style;
}

/** True once we are in the browser, so a portal is safe to render. */
export function useMounted() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted;
}

import { useCallback, useRef, useState } from "react";

/**
 * One piece of state that may be controlled by the parent or owned by us.
 *
 * Every component in this library takes both `value` and `defaultValue`, the
 * way the DOM does, because the portal needs both: a form screen holds the date
 * in Formik state and controls it, while a filter bar wants to drop the picker
 * in and be told when it changes. Supporting only one of the two is how you end
 * up with a second component called `UncontrolledDatePicker`.
 *
 * Which mode we are in is decided once, on the first render, from whether
 * `value` was passed. React does the same for inputs, and for the same reason:
 * a component that silently switches modes when a parent's value flips to
 * undefined loses the user's selection with no warning.
 */
export function useControllable(controlled, defaultValue, onChange) {
	const isControlled = useRef(controlled !== undefined).current;
	const [uncontrolled, setUncontrolled] = useState(defaultValue);
	const current = isControlled ? controlled : uncontrolled;

	const set = useCallback(
		(next, meta) => {
			if (!isControlled) setUncontrolled(next);
			if (onChange) onChange(next, meta);
		},
		[isControlled, onChange]
	);

	return [current, set, isControlled];
}

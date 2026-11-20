# @dzined/ui

A React date picker with no runtime dependencies.

No date library, no CSS-in-JS, no component framework underneath it. React and
React DOM are peer dependencies and that is the whole dependency tree. It is
around 2,100 lines of JavaScript and 580 of CSS, comments included, which is
few enough to read end to end before you trust it.

```
npm install github:dzined/dzined-ui#v0.1.2
```

```jsx
import { DzDatePicker } from "@dzined/ui";
import "@dzined/ui/styles.css";

<DzDatePicker label="Invoice date" value={date} onChange={setDate} />;
```

In Next.js, add it to `transpilePackages`, because the package ships source
rather than a build:

```js
transpilePackages: ["@dzined/ui"],
```

## Versions

**Pin a tag, never a branch.** A branch pin means a push here silently changes
what a deployed site is running, which is the whole thing a pin is for.

**Use `v0.1.2`.** The two before it are superseded, and a git tag cannot carry a
warning of its own, so it has to live here:

| tag | commit | do not use, because |
| --- | --- | --- |
| `v0.1.0` | `6e962bd` | Dark mode fills the selected day with a teal that the range highlight also uses at low alpha, so the whole calendar goes monochrome. Fixed in `v0.1.1`. |
| `v0.1.1` | `f06da31` | The colours are right, but `package.json` still says `0.1.0`, so this tag and `v0.1.0` are indistinguishable to `npm ls` and in a lockfile's `version` field. Fixed in `v0.1.2`. |
| `v0.1.2` | `827241d` | Current. |

No tag has ever been moved, deliberately: anything already installed against an
old one keeps resolving to the commit it resolved to. That is also why there are
three tags for what is nearly one release.

**Checking an install.** The lockfile's `resolved` SHA is the pin that actually
binds. Its `version` field is only as truthful as this package's own
`package.json`, which is exactly what went wrong between `v0.1.0` and `v0.1.1`.

**The SHAs above are commits**, which is what npm records. An annotated tag is a
git object in its own right with its own SHA, so the tag and the commit it
points at have different hashes, and `v0.1.0` and `v0.1.2` are both annotated:

| tag | tag object | commit npm records |
| --- | --- | --- |
| `v0.1.0` | `1dc3541` | `6e962bd` |
| `v0.1.1` | not annotated | `f06da31` |
| `v0.1.2` | `cf7bbd15` | `827241d` |

`git ls-remote --tags` and the GitHub refs API print the **tag object**, so a
correct lockfile looks wrong when checked against them.
`git rev-parse <tag>^{commit}` settles it, as does the `^{}` line in
`ls-remote` output.

## What is in it

| Export | What it is |
| --- | --- |
| `DzDatePicker` | A text field with a calendar popover. Single date. |
| `DzCalendar` | The month grid on its own. `mode="single"` or `"range"`, one or more months. |
| `src/core/*` | The date logic with no React in it: arithmetic, grid building, the keyboard map, selection models, formatting and parsing. Importable as `@dzined/ui/core`. |

### `DzDatePicker`

| Prop | Default | Notes |
| --- | --- | --- |
| `value` / `defaultValue` | | Controlled or uncontrolled, decided on first render. Accepts a `Date`, `YYYY-MM-DD`, an ISO string, or a dayjs object. |
| `onChange(date, meta)` | | `date` is a `Date` at local midnight, or `null`. `meta.source` is `"input"`, `"calendar"` or `"clear"`. |
| `min` / `max` | `null` | Inclusive. |
| `isDayDisabled(date)` | `null` | Return true to refuse a day. |
| `locale` | `"en-GB"` | Decides field order, month names and the placeholder. |
| `weekStartsOn` | `1` (Monday) | |
| `format` | `null` | A function, if you want something other than the locale's short date. |
| `label`, `message`, `placeholder`, `name`, `id` | | |
| `disabled`, `readOnly`, `required` | `false` | |
| `clearable` | `true` | Shows a clear button and a Clear action. |
| `showTodayButton` | `true` | |
| `openOnFocus` | `false` | |
| `fullWidth` | `false` | |
| `calendarProps` | `{}` | Passed to the `DzCalendar` inside. |

### `DzCalendar`

Same bounds, locale and value props, plus `mode` (`"single"` or `"range"`),
`calendars` (how many months side by side), `month` / `defaultMonth` /
`onMonthChange`, `fixedWeeks`, `flat` (no border or shadow, for embedding) and
`footer`.

In range mode the value is `[start, end]`, either of which may be `null`.

## Typing in the field

Typing is a first-class way to use it. In a `DMY` locale it reads:

```
20/11/2026   20-11-26     20.11.2026   20/11   20
2026-11-20   20261120     201126
20 Nov 2026  20 November  Nov 20 2026
today        tomorrow     yesterday
```

The field order follows the locale, read out of `Intl`, so `en-US` reads
`11/20/2026` and `sv-SE` reads `2026/11/20`. A two-digit year pivots at 68, the
strptime convention: `26` is 2026, `69` is 1969.

Behaviour:

- Text that parses to a selectable day is committed on each keystroke, so the
  calendar follows what you type.
- Text that does not parse is **left exactly as typed** and the field is marked
  invalid on blur. Rewriting or clearing a half-finished entry is the thing
  everyone hates about date fields, and it loses work.
- An impossible date such as `31/02/2026` is refused rather than rounded to the
  28th. Silently changing a date nobody notices is worse than rejecting it.
- An empty field commits `null`.

## Keyboard and screen readers

| Key | Does |
| --- | --- |
| Arrows | A day left and right, a week up and down, across month boundaries, paging the grid. |
| Home / End | First and last day of the week. |
| PageUp / PageDown | A month. |
| Shift + PageUp / PageDown | A year. |
| Enter / Space | Select the focused day. |
| Escape | Close, and put the focus back in the field. |
| Tab | Leaves the calendar in one press, not forty-two. |
| Arrow Down in the field | Open the calendar. |

The grid is an ARIA `grid` with a roving tabindex and real DOM focus. Days
outside the bounds stay focusable and are marked `aria-disabled` rather than
being removed, so the arrows never appear to jam and a screen reader can say the
day is unavailable instead of it vanishing. Today is `aria-current="date"`.
Changing month is announced through a polite live region, because paging
otherwise changes forty-two cells silently. Moves that hit `min` or `max` clamp
to the boundary rather than doing nothing, so the key always produces a visible
response.

## Theming

Everything visual is a `--dz-*` custom property. There is no theme object and no
style prop.

```css
.my-app {
	--dz-accent: #1642a5;
	--dz-surface: #ffffff;
	--dz-radius-day: 50%;
	--dz-day-size: 36px;
}
```

Dark mode is `data-dz-theme="dark"` on any ancestor, or `"auto"` to follow the
operating system. An explicit attribute rather than `prefers-color-scheme` alone,
because an application that lets someone choose a theme needs that choice to win
over the OS setting.

The tokens and their light and dark defaults are at the top of
`src/styles/dzined-ui.css`. **Do not declare a `--dz-*` token on an element that
also renders a component**: it will beat the value inherited from the theme
scope. Tokens go on `:root` or on a theme wrapper.

## Running it

```bash
npm install          # esbuild, nothing else
npm test             # 133 tests, no dependencies
npm run demo         # http://127.0.0.1:5181
```

The demo shows the picker in every state, a two-month range calendar with a
shortcuts rail, and a light and dark toggle.

## Tested, and not

`npm test` covers, with no DOM and no test framework beyond `node --test`:

- **Date arithmetic**, including both British clock changes, `addMonths`
  clamping 31 January to 28 February rather than overflowing into March, leap
  years including the 1900 and 2000 century rules, and `toISODate` not slipping a
  day during BST.
- **Grid building**: fixed six-row months, week-start handling, padding days,
  bounds and the disabled-day predicate, and which day the focus ring starts on.
- **The whole keyboard map**, asserted on dates: every key, month crossing in
  both directions, clamping at `min` and `max`, Shift paging, and returning
  `null` for keys we do not own so the browser keeps Tab.
- **Both selection models**, including the range swap when the second click is
  earlier than the first, restarting a completed range, and the hover preview.
- **Parsing**: every accepted shape above, both field orders, the year pivot,
  rejection of impossible dates, and a round-trip of the formatter's own output
  in four locales.

Tests run under `TZ=Europe/London`, set by the npm script, because the
clock-change cases are only meaningful in a zone that observes daylight saving.

**Not tested automatically**, and verified by hand in Chromium instead:

- Everything that needs a DOM: that focus actually lands on the day the keyboard
  reducer names, that the popover closes and returns focus, that it positions and
  flips, that typing commits. There is no jsdom and no React testing library
  here, on purpose; adding them is the obvious next step if this library grows,
  and the two bugs found during the browser pass (a `visibility: hidden` panel
  refusing focus, and a focus-return race on select) are precisely what those
  tests would have caught.
- **Any screen reader.** The ARIA is written to the grid pattern and the roles
  and names are right in the accessibility tree, but nobody has listened to it
  with VoiceOver or NVDA. That is the biggest outstanding gap.
- **Touch.** It works at a narrow viewport with no horizontal overflow, but no
  real device, and there is no touch-specific affordance such as a full-screen
  sheet.
- **Browsers other than Chromium.** No Safari, no Firefox.
- **RTL.** The grid would need its range fill mirrored.

## What it does not do

Worth knowing before you choose it over something larger:

- **No time picker, no date-time, and no range field.** The range calendar is
  here; a two-input range control with its own parsing is not.
- **No form library integration.** It is a controlled or uncontrolled input,
  which is enough to use with any of them, but there is no dedicated helper.
- **Month and year pickers are a plain shortlist.** The year view scrolls the
  current year into view and no more.
- **No slot system.** You get custom properties, a `footer`, and the source.
- **No programmatic validation API.** Invalid input shows a message in the
  field; there is no typed error callback with reasons.
- **One date library's worth of edge cases is missing.** No non-Gregorian
  calendars, no locale-aware week numbering, no `Temporal`.

## Licence

UNLICENSED. Public so that builds can install it without credentials, not as an
invitation to depend on it. There is no support and no compatibility promise
between versions.

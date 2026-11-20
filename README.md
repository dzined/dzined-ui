# @dzined/ui

Dzined's own React components. One so far: a date picker.

No runtime dependencies, no MUI, no Emotion, no date library, no licence key and
no watermark. It works in the portal (Next.js + MUI + Emotion) and in the plain
Next.js customer sites that have none of those.

```
npm install github:dzined/dzined-ui#v0.1.0
```

```jsx
import { DzDatePicker } from "@dzined/ui";
import "@dzined/ui/styles.css";

<DzDatePicker label="Invoice date" value={date} onChange={setDate} />;
```

In Next.js, add it to `transpilePackages` in `next.config.js`, because the
package ships source rather than a build:

```js
transpilePackages: ["@dzined/ui"],
```

## Why it exists

The portal has four copies of a MUI licence package in its store:
`@mui/x-date-pickers-pro@7.29.4` reads `@mui/x-license@7.29.1`,
`@mui/x-data-grid-pro@6.20.4` reads a different package called
`@mui/x-license-pro@6.10.2`, and the app declares `@mui/x-license@^8.21.0`.
`LicenseInfo.setLicenseKey` sets a module-level singleton, so calling it from
app code sets it on a copy neither Pro component reads, and there is a "MUI X
Missing license key" watermark across the date range picker on
`/lawn-kit/download` that cannot be cleared without alias-importing exact
versions or upgrading the Pro packages onto one major.

Owning the component removes a licence, a watermark and a dependency-resolution
trap at once. `DECISIONS.md` has the full case for how it is structured.

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

Everything visual is a `--dz-*` custom property, defaulting to the portal's real
palette. There is no theme object and no `sx`.

```css
.my-app {
	--dz-accent: #1642a5;
	--dz-surface: #ffffff;
	--dz-radius-day: 50%;
	--dz-day-size: 36px;
}
```

Dark mode is `data-dz-theme="dark"` on any ancestor, or `"auto"` to follow the
OS. The portal's dark mode is a per-browser localStorage setting, so it has to
be the thing that decides, not `prefers-color-scheme`.

The tokens and their light and dark defaults are at the top of
`src/styles/dzined-ui.css`, each annotated with the portal palette key it came
from. **Do not declare a `--dz-*` token on an element that also renders a
component**: it will beat the value inherited from the theme scope. Tokens go on
`:root` or on a theme wrapper.

## Running it

```bash
npm install          # esbuild, nothing else
npm test             # 133 tests, no dependencies
npm run demo         # http://127.0.0.1:5181
```

The demo shows the picker in every state, the same screen next to MUI's
equivalent, the two-month range calendar laid out the way the lawn estimates
export screen needs it, and a light/dark toggle.

It borrows React, MUI, Emotion and dayjs from the portal's `node_modules`
(`../dzined-cloud/work/node_modules`) rather than installing its own, because
MAHLER is ExFAT with no hardlinks, every install copies, and the volume sits at
94%. Set `PORTAL_MODULES` if your checkout is elsewhere. The library itself has
no such dependency.

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
  reducer names, that the popover closes and returns focus, that the portal
  positions and flips, that typing commits. There is no jsdom and no React
  testing library here, on purpose; adding them is the obvious next step if this
  library grows, and the two bugs found during the browser pass (a
  `visibility: hidden` panel refusing focus, and a focus-return race on select)
  are precisely what those tests would have caught.
- **Any screen reader.** The ARIA is written to the grid pattern and the roles
  and names are right in the accessibility tree, but nobody has listened to it
  with VoiceOver or NVDA. That is the biggest outstanding gap.
- **Touch.** It works at a narrow viewport with no horizontal overflow, but no
  real device, and there is no touch-specific affordance such as a full-screen
  sheet.
- **Browsers other than Chromium.** No Safari, no Firefox.
- **RTL.** The grid would need its range fill mirrored.

## Where it falls short of MUI's

Honestly, after putting them side by side:

- **No time picker, no date-time, no range picker component.** MUI has all
  three. The range *calendar* is here; the range *field* is not.
- **No form library integration.** MUI X has first-class Formik and
  react-hook-form stories. This is an uncontrolled-or-controlled input, which is
  enough, but there is no helper.
- **Month and year pickers are a plain shortlist**, where MUI's year view is a
  nicer scrolling column with better keyboard handling. Ours scrolls the current
  year into view and no more.
- **No slot system.** MUI lets you replace any internal part. Here you get
  custom properties, a `footer`, and the source.
- **No validation API.** MUI surfaces a typed `onError` with reasons like
  `minDate` and `shouldDisableDate`. Ours shows a message in the field and
  nothing programmatic.
- **One date library's worth of edge cases is missing.** No non-Gregorian
  calendars, no locale-aware week numbering, no `Temporal`.

Where it is better: it is 2,100 lines of JavaScript and 580 of CSS, comments included, that you can read end to end, it has no
dependencies, it cannot acquire a licence watermark, its keyboard logic is a
pure function with tests, and it looks like Axle without being told to.

## Working on this repo

MAHLER is ExFAT, which means:

- Filenames are case-insensitive. `Foo.js` silently overwrites `foo.js`.
- `git rebase` needs `-c core.checkStat=minimal` or it reports local changes on
  a clean tree. The repo is configured with it.
- macOS leaves `._*` sidecars everywhere. `npm run clean` deletes them; they are
  gitignored.
- There are no hardlinks, so installs copy. Keep the dependency count at one.

`.npmrc` sets `legacy-peer-deps=true`. npm 7+ otherwise auto-installs the React
peer dependency into this repo, and the demo bundle then picks it up alongside
the portal's copy: two React instances, "Invalid hook call", blank page.

## Not wired in yet

Nothing imports this. Putting it into the portal, and whether it replaces the
range picker on `/lawn-kit/download`, is a separate decision.

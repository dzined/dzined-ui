# Structural decisions

Written 20 November 2026, while building the first component. These are the
choices that are expensive to reverse later, with the reasoning, so the next
component does not have to relitigate them.

## 1. A repository of its own, not a package inside dzined-cloud

`dzined-cloud` looks like a monorepo and is not one. It is a folder on disk
holding five independent git repositories (`work`, `api`, `db`, `share`,
`print`), each with its own remote, and there is no `pnpm-workspace.yaml`, no
`turbo.json` and no root `package.json`. There is no monorepo to add a package
to.

That leaves three real options:

**Inside `work/src/components`.** Cheapest today, worst in six months. The
component would live behind the portal's git history and inside its dependency
graph, and the only way to get it into `dzined/make` or `dzined/madeby68` would
be to copy the files. We already have one of those: `share/src/band-kit/score`
is a synced copy of the portal's version, and keeping the two in step is a
recurring chore nobody enjoys. Repeating that deliberately, for a thing whose
whole purpose is to be shared, would be a mistake.

**A new workspace inside `dzined-cloud`.** This means converting `work` into a
workspace member, which means a root `package.json`, a lockfile that spans
repositories that are not actually one repository, and an install story that
differs from every other checkout in the estate. The portal is in daily use by
clients. Rearranging its install to make room for a side project is not a trade
worth making.

**A new repository, `dzined/dzined-ui`, publishing `@dzined/ui`.** Chosen. It
versions on its own, so the portal upgrades when it wants to rather than when
someone pushes. It is installable by the standalone sites. Its tests run without
the portal. And it keeps the thing that makes it worth owning (no MUI, no
licence) structurally true, because MUI is not in its dependency tree and cannot
drift in.

The cost is honest: a second repository to look after, and a publish step
between writing a fix and using it. For now it is consumed as a git dependency
(`"@dzined/ui": "github:dzined/dzined-ui#v0.1.0"`), which needs no registry and
no token. If this grows past a handful of components, GitHub Packages is the
next step, not npm.

## 2. No runtime dependencies at all, and no build step

The package ships its source. `src/core/*.js` is plain ES modules that Node runs
as-is; `src/react/*.jsx` needs a JSX transform, which every consumer already
has. Next.js compiles it with `transpilePackages: ["@dzined/ui"]`, one line.

The reason is the thing that started this. The portal currently has
`@mui/x-date-pickers-pro@7.29.4` reading `@mui/x-license@7.29.1`,
`@mui/x-data-grid-pro@6.20.4` reading a *different package* called
`@mui/x-license-pro@6.10.2`, and the app declaring `@mui/x-license@^8.21.0`:
four copies of a licence package in the store, and `LicenseInfo.setLicenseKey`
setting a module-level singleton on whichever copy the app code imported, which
is not the copy either Pro component reads. Hence a watermark across the date
range picker on `/lawn-kit/download` that cannot be cleared.

That failure needs a dependency to exist. A component with none cannot have it.

The same reasoning rules out a date library. See decision 4.

## 3. Styling through CSS custom properties, never a theme object

The component reads `--dz-*` custom properties with defaults in
`src/styles/dzined-ui.css`. It does not read an MUI theme, take a `sx` prop, or
import Emotion.

Three reasons, two of them scars:

- `cloud.main` is referenced in 39 files of the portal and `cloud.buttonPrimary`
  in 11, and neither is a key in the palette. MUI resolves an unknown palette
  path to nothing and reports nothing, so those are backgrounds that have never
  applied, on pages nobody has noticed are wrong. A string path into a theme can
  fail silently forever. A custom property falls back to a value in this
  repository that somebody chose on purpose.
- A nested `styleOverrides` beats `sx`, and `styleOverrides` is plain CSS, so a
  palette path written inside one is simply dropped by the browser. A `MuiTabs`
  override asking for `color: "cloud.primary"` left 43 pages on MUI's factory
  blue and in ALL CAPS until it was found on 19 November 2026.
- `dzined/make`, `dzined/madeby68`, `dzined/retorrick-mill` and
  `dzined/chapman-bespoke-woodwork` are plain Next.js with no MUI and no Emotion.
  A component that drags either in as a hard dependency is no use to them. One
  stylesheet and a handful of properties works everywhere.

The defaults are the portal's real values, read out of
`work/src/theme/lightTheme.js` and `work/src/theme/darkTheme.js`. Dark mode is
opted into with `data-dz-theme="dark"` on an ancestor rather than the OS
preference, because the portal's dark mode is a per-browser setting in
localStorage and has to stay the thing that decides.

One rule follows from this and is easy to break: **a component must never
declare a token it also wants to inherit.** The defaults were briefly set on
`.dz-scope`, the class every component carries, as well as on `:root`. Because
`.dz-scope` sits on the component itself, its light value beat the dark value
inherited from `<html>`, and dark mode did nothing. Tokens are declared on
`:root` and on theme scopes. Components only read them.

## 4. Plain `Date`, with the door left open

The value in and out is a native `Date` at local midnight, or `null`.

MUI needs an adapter package per date library because it has to format and parse
in any locale with any of five libraries, and that adapter layer is where the
licence mess lives. We do not have that problem. `Intl.DateTimeFormat` already
knows every locale's month names and field order, and it is in every browser we
support, so formatting costs nothing and is more correct than a hand-written
`DD/MM/YYYY`. Parsing is the only piece we write, and the parsing a date field
needs is deliberately loose rather than strict.

`Date` is also the one type every consumer already has. The portal is full of
dayjs, the standalone sites have nothing, and an API route has whatever the
database returned.

The door is left open in three places so nobody has to fight it:

- `toDay()` accepts a `Date`, a `YYYY-MM-DD` string, an ISO timestamp, a number,
  or anything with a `.toDate()`, which covers dayjs and moment. The portal can
  pass the dayjs objects it already holds.
- `format` takes a function, so a consumer that wants dayjs tokens writes
  `format={(d) => dayjs(d).format("D MMM YYYY")}`.
- `onChange` gives a `Date`; a dayjs consumer wraps it in one call.

What we do *not* do is accept dayjs in and hand dayjs back. That is an adapter,
and an adapter is a dependency with extra steps.

Two things about `Date` that the code is careful with, because they are the
reasons people reach for a date library in the first place:

- All arithmetic goes through `setDate`/`setMonth` on a clone, never millisecond
  addition, so adding a day across a clock change gives the next calendar day
  rather than landing at 01:00. There are tests for both British transitions.
- `toISODate` reads the local fields and never goes near `toISOString`, which
  converts to UTC first and turns local midnight on 20 June into the 19th for
  anyone west of Greenwich.

## 5. The selection model is pluggable, so a range picker is not a rewrite

The grid, the keyboard handling and the styling know nothing about how many
dates are being chosen. They ask a selection model what a click does and how a
day should look. `singleSelection` and `rangeSelection` both live in
`src/core/selection.js`, both are fully written and tested, and `DzCalendar`
takes `mode="range"` and `calendars={2}` today.

This was shaped by looking at what the portal actually needs before fixing the
API. `work/src/app/lawn-kit/download/page.js` renders a `StaticDateRangePicker`
with two months, no input at all, and a rail of eight shortcut buttons. So
`DzCalendar` ships standalone rather than only inside the picker, takes a month
count, and takes a `footer`.

What is deliberately not built yet is `DzDateRangePicker`: the two-input trigger
and the shortcuts rail. Those are a wrapper around what exists, not a second
calendar.

## 6. The keyboard logic is a pure function

`nextFocusDay(focused, key, options)` returns the date the focus ring should move
to, and the component's only job is to put `tabIndex=0` and DOM focus on it.

Keyboard behaviour is the part of a date picker that is easiest to get subtly
wrong, and testing it through a DOM means asserting on `document.activeElement`
through three layers of React effects, with jsdom installed to do it. Pulling it
out means the whole key map is covered by assertions on dates, with no
dependencies, and the component is left with one small job.

This paid for itself immediately: the whole key map was right first time, and the
two bugs that did turn up were both in the DOM wiring the tests do not cover
(see "What is not tested" in the README), which is exactly where the remaining
risk should be concentrated.

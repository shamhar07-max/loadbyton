# Loadbyton — Brand Guidelines

Loadbyton is infrastructure, not a marketing gimmick: it holds escrow, enforces a
state machine, and audits every action. The brand has to read as **credible
enough to trust with money and cargo**, while staying approachable enough for a
carrier dispatcher on a phone at a gate. This document is the source of truth for
the mark, the palette, the type system, and how they're used across the product.
Tokens referenced here are defined in `design-tokens.json` / `design-tokens.css`
in this folder — the app consumes those files directly; nothing here should ever
drift from them.

---

## 1. The mark

> **Pending update.** The mark below predates the near-black + single-accent
> system in §2. A new reference mark is being incorporated; once it lands,
> this section gets rewritten to match — the mark's dominant fill needs to
> coordinate with `--lb-ink-*` rather than stay orphaned on navy, per the
> reserved-logo-accent discipline below (kept separate from `brand.accent` on
> purpose either way).

**Concept — "the container plate."** The mark is a navy, ribbed-panel tile with
rounded corner rivets — a real container corner-casting, abstracted — carrying a
white load pictogram at its centre, flanked by two thin **crimson bars**. Those
bars are the mark's one fixed signature: the same two bars split the wordmark
itself, between `LOAD`, `BY`, and `TON`, so the icon and the wordmark always read
as one system. Unlike the previous mark, the tile is not a `currentColor` glyph —
it's a fixed navy/white/crimson unit that looks the same on every surface, the way
a physical plate riveted to a container would.

- `web/public/brand/logo-mark.svg` — icon only, with the ribbed-panel texture and
  corner rivets at full detail. Used at nav scale (~28px) and anywhere the mark
  stands alone.
- `web/public/brand/logo-full.svg` — full lockup (tile + wordmark) for light
  surfaces; ink-navy `LOAD·BY·TON`, crimson divider bars.
- `web/public/brand/logo-full-on-dark.svg` — same lockup, paper-white wordmark and
  a slightly lifted crimson (`--lb-logo-accent-400`) for contrast, for the dark
  navy surface (nav bar, footer, hero).
- `web/public/favicon.svg` — the tile simplified to its three load-bearing shapes
  (navy ground, crimson bars, white pictogram) with the ribbing dropped — at
  16–32px browser-tab scale, texture reads as noise, not detail.

**Clear space & minimum size.** Keep clear space around the tile equal to one
corner-rivet's diameter on every side. Never render the full-detail mark below
20px; below that, use the favicon variant, which is built for exactly that scale.

**Don't:**
- Don't recolor the crimson bars to anything but `--lb-logo-accent-500` (light
  surfaces) or `--lb-logo-accent-400` (dark surfaces) — this is a reserved pair,
  never `--lb-red-*` (that's the UI danger/status color; keeping them separate
  means the two can never accidentally drift together).
- Don't stretch, skew, or rotate the tile, and don't drop the rounded corners.
- Don't place the light-wordmark lockup on anything lighter than `--lb-slate-200`,
  or the dark-wordmark lockup on anything darker than `--lb-navy-800`.
- Don't add a drop shadow, bevel, or outline beyond the tile's own 1px edge —
  the mark is otherwise flat by design.

---

## 2. Color

Three layers, defined in `design-tokens.json`: **primitive** (raw hex, named by
hue and step), **semantic** (role-based — `bg.surface`, `text.primary`,
`brand.accent`, `status.warning`…), and **component** (button/card/badge/input,
composed from semantic tokens). Product code should reach for **semantic**, not
primitive, tokens — that's what makes the light/dark themes swap cleanly.

| Role | Light | Dark | Used for |
|---|---|---|---|
| `brand.primary` | Ink `#111113` | Paper `#F8FAFC` | Primary buttons, active nav, brand chrome |
| `brand.secondary` | Blue `#3B82F6` | Blue `#93C5FD` | Text links only — kept distinct from `brand.primary` precisely so a link still reads as a link on a monochrome UI |
| `brand.accent` | Orange `#F2600C` | Orange `#FF7A33` | The **one** accent — award/confirm actions, the primary marketing CTA. Nothing else. |
| `status.success` | Teal `#0D9488` | Teal `#14B8A6` | Delivered, released, verified |
| `status.warning` | Amber `#D97706` | Amber `#F59E0B` | Pending review, demurrage exposure — deliberately a different hue from `brand.accent` (gold vs. orange-red) so the two are never mistaken for each other at a glance |
| `status.danger` | Red `#DC2626` | Red `#F87171` | Disputed, rejected, overdue |

**Why near-black + one accent, not navy-as-safety-blanket:** the previous
navy-and-amber system read as freight/maritime, but two competing "brand" hues
(a blue-family primary *and* a warm accent) is how you end up with "another
blue-on-white SaaS dashboard" — safe, forgettable, indistinguishable from a
hundred other B2B tools. The system that actually reads as a confident,
app-native product — the Uber/Ola school, not the enterprise-SaaS school — uses
**one** brand color for everything structural (buttons, nav, active states) and
holds color in reserve for the handful of moments that are genuinely
time-sensitive or decision-worthy. Near-black does the "handles money
carefully" work navy used to do (it's the same instinct that makes a bank card
matte black instead of bright blue), and it's a stronger, more legible base for
a data-dense product than a mid-tone navy ever was — full black/white contrast,
not navy-on-slate.

**Discipline — now more important, not less:** the single accent
(`brand.accent`) is not a "series 4" color, and pushing it more saturated than
the old amber raises the stakes on this rule rather than lowering them. It
never gets reused to mean something else on the same screen — a chart, a badge
system, and the accent button all draw from the same reserved orange, so an
orange badge always means the same category of "needs a decision or is
time-sensitive." `status.warning` stays a distinguishable gold specifically so
it never gets confused with the accent doing its actual job.

---

## 3. Typography

- **Display — Space Grotesk**, leaning on **600/700** rather than 500 now that
  the brand is monochrome-first — a lighter weight reads fine against a soft
  navy, but against near-black-on-white it needs the extra weight to feel
  intentional rather than thin. Tighten tracking slightly at hero sizes
  (32px+) for the punchier, more "app" feel this pass is going for, rather
  than an editorial one. Headlines, page titles, the wordmark, stat numbers.
  Geometric and a little industrial — it's why it was already the documented
  convention in the original spec, and it earns its place here: it reads as
  infrastructure, not a landing-page template, at the sizes a dashboard
  actually uses it (18–48px), which is where it's distinct from being "the
  safe AI-generated default" — that reputation comes from using it as body
  text at paragraph sizes, which Loadbyton never does.
- **Body — Inter** (400/500/600). Everything you read at length: forms, tables,
  descriptions, nav labels.
- **Mono — IBM Plex Mono.** Reserved for data that lines up: job codes
  (`LBT-DXB-2608-4921`), AED amounts, IBANs, timestamps, audit-log entries. Gives
  the ledger-adjacent parts of the product a deliberately technical, tabular
  feel — `font-variant-numeric: tabular-nums` wherever figures stack in a column.

Type scale (rem, 16px base): `xs` 0.75 · `sm` 0.875 · `base` 1 · `md` 1.125 ·
`lg` 1.25 · `xl` 1.5 · `2xl` 1.875 · `3xl` 2.375 · `4xl` 3 · `5xl` 3.75.

---

## 4. Voice

Loadbyton talks like an ops dispatcher, not a marketing deck: **direct, specific,
numerate.** A button says what happens ("Award bid", not "Confirm"). A status
says the state, not a feeling ("Escrow held" not "You're all set!"). Error copy
names what's wrong and what to do about it — never "Something went wrong."
Numbers are always numbers — AED amounts, ETAs in minutes, hours to auto-release —
never vague ("soon," "a while").

---

## 5. Applying this to the app

- `web/tailwind.config.js` maps Tailwind's color scale onto the semantic CSS
  variables in `design-tokens.css` — never hardcode a hex in a component.
  `[data-theme="dark"]` / `[data-theme="light"]` on `<html>` drives the theme
  switch; absent an explicit choice, `prefers-color-scheme` decides.
  See `web/src/index.css` for the mirrored, wired-up copy of these tokens.
- Status pills, badges, and the demurrage/escrow indicators pull from
  `status.*` tokens exclusively — never from `brand.accent` directly, even
  though they're visually similar in light mode, so the two can diverge later
  without a rename.

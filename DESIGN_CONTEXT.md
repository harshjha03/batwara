# Batwara — Design Context

Hand this file to Claude Design. It is self-contained: every color, gradient, and spec below
is transcribed from the live app (`app/globals.css`, the route files, `lib/money.ts`). Extend
this identity; don't reinvent it.

---

## 1. Product

**Batwara** ("division/split" in Hindi) is a **Splitwise-style shared-expense splitter**.
Friends on a trip or a shared budget log who paid for what; the app computes net balances and
the minimal set of payments to settle up.

- **Audience:** small groups of friends/flatmates splitting real-world costs. Non-technical.
- **Currency:** Indian Rupee **₹**, locale `en-IN` (e.g. `₹1,23,456.00`). Money is always
  integer cents internally, formatted via `fmt()` — never show raw floats.
- **Platform:** installable **PWA**, mobile-first. Draws under the notch/home-bar; has an
  offline screen and offline banner; views auto-refresh every 10s.
- **Tone:** premium fintech/wallet, not a utilitarian ledger. Warm, confident, a little
  glowing. Functional emoji are welcome (💵 💳 🔗 ✓ ＋ ⋯).

---

## 2. Design language

**Dark-only emerald + gold glassmorphism, mobile-first.**

- Frosted translucent **glass cards** float over an **animated deep-emerald gradient** with
  two soft glowing orbs (one emerald, one gold) that slowly drift.
- **Gold** is the accent: amounts, active states, brand highlight.
- **Mint-green = positive/credit** ("gets back"), **rose = negative/debt** ("owes"); both
  rendered with a subtle neon glow (`text-shadow`).
- Rounded everything: radii **9 / 12 / 14 / 18 / 99px** (99 = pills). Toggles and member
  chips are pills. Buttons lift on hover.
- Large touch targets (40px on touch devices), safe-area padding, generous spacing.
- There is **no light mode.** The only inversion is the print/PDF theme (see §6).

---

## 3. Design tokens

### Color variables (`:root`)
```css
--text:      #ecfdf5;                    /* near-white mint — primary text */
--muted:     rgba(234,255,245,0.60);     /* secondary text */
--faint:     rgba(234,255,245,0.45);     /* placeholders, empty states */
--line:      rgba(255,255,255,0.10);     /* hairline borders */
--gold:      #fcd34d;                     /* accent — amounts, active */
--gold-soft: #fde68a;                     /* softer gold — pressed/paid tags */
--mint:      #6ee7b7;                     /* mint accent — links, borders */
--pos:       #34d399;                     /* positive / credit (green) */
--neg:       #fb7185;                     /* negative / debt (rose) */
--surface:   #06251c;                     /* deep emerald — solid surfaces */
```

### Background (fixed, full-viewport)
```css
html { background: #021f17; }
body {
  background:
    radial-gradient(1200px 700px at 85% -10%, rgba(16,185,129,0.35), transparent 60%),
    radial-gradient(900px 600px at -10% 110%, rgba(13,148,136,0.40), transparent 55%),
    radial-gradient(700px 500px at 50% 50%,  rgba(251,191,36,0.07), transparent 60%),
    linear-gradient(160deg, #021f17 0%, #04382b 40%, #052e24 70%, #011510 100%);
  background-attachment: fixed;
}
/* Two drifting blurred orbs behind content (18s ease-in-out, disabled by
   prefers-reduced-motion): */
body::before { width:480px; height:480px; background: rgba(52,211,153,0.22);  top:-140px;  right:-100px; }
body::after  { width:420px; height:420px; background: rgba(251,191,36,0.10);  bottom:-140px; left:-120px; }
/* both: filter: blur(90px); border-radius:50%; animation: drift -> translate(40px,30px) scale(1.15) */
```

- PWA **theme color** `#04382b`, **manifest background** `#021f17`.

### Typography
- Font: **Geist** (Google), var `--font-geist-sans`, with system-sans fallback.
- Base `font-size: 14px`. Inputs are **16px on mobile** (stops iOS zoom-on-focus), 14px ≥768px.
- All monetary/numeric values use `font-variant-numeric: tabular-nums`.
- Section headings (`.card h2`): 14px / 700, white, with an 8px gap for a leading emoji.
- Micro-labels (`.mini-lbl`): 11px / 700, muted, `letter-spacing: 0.3px`.

### Signature recipes
```css
/* Glass card */
background: linear-gradient(150deg, rgba(255,255,255,0.13), rgba(255,255,255,0.05) 60%);
backdrop-filter: blur(20px) saturate(160%);
border: 1px solid rgba(110,231,183,0.22);  border-top-color: rgba(255,255,255,0.38);
border-radius: 18px;
box-shadow: 0 12px 36px rgba(0,20,13,0.45), inset 0 1px 0 rgba(255,255,255,0.15);

/* Primary button fill */
background: linear-gradient(135deg, #10b981, #0d9488 60%, #0f766e);
box-shadow: 0 4px 18px rgba(16,185,129,0.30), inset 0 1px 0 rgba(255,255,255,0.25);
/* hover: translateY(-1px) + brightness(1.1) */
```

---

## 4. Component inventory

Visual specs below; all live in `app/globals.css` (`@layer components`). React wrappers are in
`app/groups/[id]/client.tsx` and `app/groups/[id]/page.tsx`.

| Component | Class | Spec |
|---|---|---|
| **Wordmark** | `.brand` | 22px/800, gradient-clipped text white→mint→gold |
| **Card** | `.card` | Glass (recipe above); `h2` = white 14px/700 title row |
| **Primary button** | `.btn` | Emerald→teal gradient, white 700, lifts on hover |
| **Small/ghost button** | `.btn-small` | Translucent, mint text, 12px; `.btn-cancel` = muted text |
| **Icon button** | `.icon-btn` | Borderless, muted → turns rose (delete) or gold (`.edit`) on hover |
| **Badge** | `.badge` | Gold pill on gold/emerald tint, 11px/700 — counts & totals |
| **Member chip** | `.chip` | Rounded pill; `.chip.linked` (mint border) = signed-up member |
| **Split toggle** | `.ptoggle` | Pill; `aria-pressed="true"` → gold border + fill + **gold glow** |
| **List row** | `.list-row` | Space-between, hairline bottom border |
| **Amount** | `.amt` | Gold, 700, tabular-nums |
| **Balance states** | `.pos` / `.neg` / `.zero` | green-glow / rose-glow / faint |
| **Paid tag** | `.paidtag` | Tiny gold pill, "paid" |
| **Settlement row** | `.settle-row` | Emerald→gold tinted row with ✓ Settle button |
| **Settled banner** | `.settled-banner` | "✓ All settled up!" mint success block |
| **Offline banner** | `.banner` | Rose-tinted warning block |
| **Inputs / selects** | (element) | Translucent, gold focus ring `0 0 0 3px rgba(251,191,36,0.12)` |
| **Spend table** | `table.spend` | 13px; uppercase tracked headers; tabular-nums; bold total row |
| **Card-payments donut** | `.donut` + `.legend` | Pure CSS `conic-gradient` donut; gold=their share, mint=to collect, `#06251c` hole |
| **Popover menu** | `.menu` / `.menu-item` | **Solid** `#062b21` (not glass — nothing bleeds through), 42px items |
| **FAB** | `.fab` | 56px emerald gradient "＋", fixed bottom-right, **phone only**, thumb-reachable |

**React components** (`client.tsx`): `GroupSwitcher`, `NewGroupButton`, `Menu` (⋯ dropdown),
`InviteButton`, `PrintButton`, `AutoRefresh` (offline banner), `PeopleCard`, `ExpenseForm`
(most complex — split-mode select + per-person pill toggles + conditional per-person inputs),
`SpendingCard`; plus `CardPayments` donut in `page.tsx`.

---

## 5. Screen inventory

Four real UI routes. The group dashboard is where essentially all the UI lives.

### `/login` — Sign in
Single centered glass card (`max-w-md`, `pt-[12vh]`): brand, one-line subtitle, full-width
**Continue with Google** button, "— or —" divider, email + **Magic link** inline form.
Error (`.err`) and "check your email" states.

### `/` — Home / first-group
Usually redirects to your last/newest group. Only renders when you have no groups: header
(brand + Sign out) and a "Create your first group" card with name input + Create.

### `/join/[code]` — Invite acceptance
Lands from a shared invite link; "join this group" confirmation.

### `/groups/[id]` — **The dashboard** (the core screen)
Header bar: **brand** · **group switcher** (`<select>`) · **🔗 Invite** · **⋯ menu**
(New group / Save as PDF / Sign out). Below, an offline banner slot, then these **7 cards**:

1. **People** — member chips (linked vs ghost), add-a-name input, "This is me" ghost-claim.
2. **Add / Edit Expense** — description, amount, paid-by, cash/card; a row of per-member
   include/exclude **pill toggles**; split mode (Equally / Exact / Percentages / Shares);
   conditional per-person value inputs when mode ≠ equal.
3. **Expenses** — list rows: description, "paid by X 💳/💵 · split …", amount, edit/delete.
4. **Net Balances** — per person: "gets back ₹…" (pos) / "owes ₹…" (neg) / "settled".
5. **Who Pays Whom** — minimal settlement plan (≤ n−1): `A → B  ₹amount  ✓ Settle`; plus a
   "Recorded payments" list with undo; or the all-settled success banner.
6. **Individual Spending** — person picker + `table.spend` (event / total / their share).
7. **Card Payments** — CSS donut (their share vs to collect) + a per-payer breakdown table.

**Responsive layout:**
- **Phone:** single column, cards **reordered** so *Who Pays Whom* leads (order-1), then Net
  Balances, Expense form, Expenses, People, Spending, Card Payments. Phone-only **FAB** jumps
  to the expense form.
- **Desktop (`md:`):** header row, then a `1fr / 2fr` grid (People | Expense form), then a
  2-column grid holding the remaining cards in natural order.

---

## 6. Constraints & rules (don't break these)

- **Dark-only.** No light theme. Every surface assumes the dark emerald background.
- **Mobile-first & installed-app aware:** honor `env(safe-area-inset-*)`; content must clear
  the notch and home bar.
- **Touch targets:** ≥40px for buttons/icon-buttons on coarse pointers; ≥36px for pill toggles.
- **iOS input rule:** form inputs render at 16px on mobile to prevent focus-zoom.
- **Motion:** gentle only (hover lift, 18s orb drift). `prefers-reduced-motion` disables the
  orb animation — any new motion must do the same.
- **Print / PDF theme is a first-class feature** ("Save as PDF"). A full `@media print` block
  inverts everything to clean black-on-white, hides `.no-print` / FAB / orbs, and flattens
  glass. Any new screen or component that can appear in a report needs a print-safe style.
- **Money:** always ₹, `en-IN`, two decimals, tabular-nums, via `fmt()` (`lib/money.ts`).
  Split modes: equal / exact / percent / shares.

---

## 7. Opportunities (directions, not current state)

For the design-system / redesign / new-screen goals. These are **candidates to explore**, not
things that exist today — treat as briefs.

- **Redesign targets:** densify the Add/Edit Expense form (it's the busiest card); make Net
  Balances scannable at a glance (avatars, directional emphasis); refresh the Card Payments
  donut and its legend/table pairing.
- **Candidate new screens:** per-expense **detail** view (who, split breakdown, history);
  **settlement history** / activity feed; **group settings** (rename, members, leave, currency);
  **onboarding** for first-time users; a **personal summary** across all groups.
- Whatever is designed must slot into the existing token set and glass-card system above, and
  carry its print-safe variant if it can land in a PDF report.

# Batwara

Split expenses with friends. Next.js 16 PWA + Supabase (Postgres + Google OAuth).

## Setup

1. Create a Supabase project. In **SQL Editor**, run `db/schema.sql`.
2. **Authentication → Providers → Google**: enable it and paste a Google OAuth client ID/secret
   (Google Cloud Console → Credentials → OAuth client, redirect URI = the callback URL Supabase shows).
3. **Authentication → URL Configuration**: add `http://localhost:3000/auth/callback` and your
   production `https://YOUR-DOMAIN/auth/callback` to Redirect URLs.
4. `cp .env.example .env.local` and fill in the three values.
5. `npm run dev`

## Commands

- `npm test`: split / balance / debt-simplification checks (`lib/money.test.ts`)
- `npm run build`

Databases created from an older `schema.sql`: run the files in `db/migrations/` in order, once each
(the newest is `004_activity.sql`).

## Install as an app

Deployed over HTTPS, "Add to Home Screen" (iOS Safari) or "Install app" (Android/desktop Chrome) gives a
full-screen app with its own icon. Offline, it shows a branded "you're offline" screen. The service worker
only registers in production builds (`npm run build && npm start`), not in `npm run dev`.

## Features

- Google or magic-link sign-in; invite link to join a group
- Ghost members (name only, no account); a new joiner can claim one with "This is me"
- Expenses: cash/card, split equally / exact / % / shares, edit, soft delete
- Net balances, "Who Pays Whom" (≤ n−1 payments) with Settle and undo
- Individual spending table, Card Payments donut, Save as PDF (print CSS)
- Activity log (who added/edited/deleted/settled what), written by the server actions
- Phones: bottom tab bar (Balances · Expenses · Add · Activity · Group). Desktop keeps the full dashboard
- Icons are Google Material Symbols (no emoji); loaded via a font `<link>` in `app/layout.tsx`
- Views refresh every 10s and on tab focus; offline banner

## Layout

- `lib/money.ts`: all money math (integer cents)
- `app/actions.ts`: every write; each one checks group membership
- `db/schema.sql`: tables, RLS on with no policies (only the server touches the DB)

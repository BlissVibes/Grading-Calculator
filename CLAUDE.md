# CLAUDE.md — Grading Calculator

A standalone React 19 + Vite tool (grading fee / upcharge / profit calculator for
PSA, TAG, Beckett, ARS, CGC). **It is also embedded into the ShinyCardboard site.**

## How it fits the ShinyCardboard ecosystem

- Deploys as its **own Vercel project**, and is **proxied** by the website at
  **`shinycardboard.win/calculator`** (a `vercel.json` rewrite in the website repo
  points there). Pushing here goes live on the site with **no website push**.
- Because it's served same-origin under the main domain, it **shares the site's
  Google login** and serves the **same Adsterra ads** on the approved domain.
- Full architecture: see `CLAUDE.md` in the **ShinyCardboard-Website** repo (the
  hub) + its `docs/PROJECT_INTEGRATION.md`.

## Integration-specific things to know before editing

- `vite.config.ts` builds under `base: '/calculator/'` in production (dev stays
  `/`). Don't hardcode absolute `/asset` or `/api` paths — use
  `import.meta.env.BASE_URL` (see `src/priceLookup.ts` for the API-call pattern).
- Shared kit (keep in sync with Portfolio-Price-Comparison): `src/config/firebase.ts`,
  `src/services/entitlements.ts`, `src/hooks/useAdFree.ts`, `src/config/ads.ts`,
  `src/components/Adsterra*.tsx`, `src/components/AdSlots.tsx`. Ads are hidden only
  for gold/platinum/pro tiers (Silver still sees ads).
- `<AdSlots/>` renders the bottom-of-page ads (see `src/App.tsx`).
- The Vercel project needs the same `VITE_FIREBASE_*` env vars as the website.
- **Build gate:** `npm run build` runs `scripts/check-changelog.mjs` first — bump
  `package.json` version AND add a matching `src/changelog.ts` entry or the build
  fails.

Branch for integration work: `claude/shinycardboard-project-integration-tg1db7`.

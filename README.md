# RasoiLog v2

Live app (permanent link): https://rasoilog-ramit-seths-projects.vercel.app

Home-style Indian calorie / protein / fibre tracker. Vite + React PWA.

## What changed in this rebuild
- Fixed mobile scroll bug: header and bottom nav are now fixed (flex-none); only
  the middle list scrolls, so the header/footer no longer get trapped.
- Keyboard-safe input sheets: uses visualViewport + `--vvh` and
  `interactive-widget=resizes-content`, so results stay visible while typing.
- Navigation: tap the RasoiLog logo or the Home tab to return home from anywhere;
  every sheet has a working Back/Close (wired to browser history).
- Auto-updates on the SAME link (network-first service worker) — no more new links.
- Cloud sync across devices via a Cloudflare Worker (Cloud icon -> sync code).

## Data
- Your existing data (40 ingredients, 13-14 Jul logs, targets 2000/100/30) is
  preserved via USER_SNAPSHOT in src/seedData.js.
- Added 100+ common Indian cooking ingredients (cooked weights for dals/sabzis,
  dry/raw weights for raw-eaten items) and 100+ Punjabi ghar-ka-khana dishes with
  home ghee/oil assumptions. Seeds only ADD (never overwrite your items).

## Infra
- Sync worker: https://rasoilog-sync.ramitseth17.workers.dev (KV + D1 bound)
- Deploy: single Vercel project "rasoilog" (production).

## Run locally
npm install && npm run dev

v2.0.2 — keyboard-stable input sheets + ingredient search includes meals.

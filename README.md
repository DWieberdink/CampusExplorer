# CampusExplorer

Higher Education campus explorer for Perkins Eastman Higher Education Advisory.

**Live (GitHub Pages):** [https://dwieberdink.github.io/CampusExplorer/](https://dwieberdink.github.io/CampusExplorer/)

**Demo password:** `CUAdvice` (client-side gate via `sessionStorage` — not real security; intentional for static PE demos).

**Pattern:** clone of [`PE-k12-strategies/SchoolExplorer`](https://github.com/PE-k12-strategies/SchoolExplorer) — static HTML/JS SPA + Supabase warehouse + offline ETL + GitHub Pages.

**Data spine:** IPEDS `UNITID` (+ optional CCC college/district codes). Seed demo covers California Community Colleges plus a few CSU/UC campuses.

## What works today (no secrets)

| Feature | Status |
|---------|--------|
| Demo password gate (`index.html` → `js/demo-gate.js`) | Unlocks explorer/admin for the browser session |
| Auth / admin / confirm / reset pages | UI stubs; auth inactive until Supabase keys are set |
| Explorer filters (State → System → Campus → Year) | Works on `data/seed/*.json` |
| Overview KPIs + YoY enrollment | Works on seed |
| Chart.js enrollment + CIP awards | Works on seed |
| Campus map | Lat/lon in seed; Mapbox needs `pk.` token in `js/he-config.js` |
| Compare view | Stub table, works on seed |
| SQL migrations + RLS outline | Ready to paste into Supabase |
| `ipeds-sync/` | Seed upsert stub + documented Complete Data Files commands |
| GitHub Action | Manual `workflow_dispatch` stub |

## Needs Supabase / secrets

1. Create a Supabase project (not provisioned by this repo).
2. Run in SQL Editor, in order:
   - `sql/setup.sql`
   - `sql/migrations/001_he_tables.sql`
   - `sql/migrations/002_he_rls.sql`
3. Put **URL** + **anon** key in `js/config.js` (placeholders today).
4. Put **service role** key in `ipeds-sync/.env` (and GitHub Actions secrets) — never in browser code.
5. Set Mapbox public token in `js/he-config.js` for live map tiles.
6. Point Supabase Auth Site URL at the GitHub Pages origin once Pages is enabled.

## Local preview

```bash
# from repo root — any static server
python3 -m http.server 5500
# open http://127.0.0.1:5500/  (password gate → explorer)
```

Or open `index.html` via Live Server. Seed fetch needs HTTP (not `file://`). Direct `explorer.html` redirects back to the gate until the demo password is entered.

## GitHub Pages

- Expected URL: `https://dwieberdink.github.io/CampusExplorer/`
- Deploy: `.github/workflows/pages.yml` on push to `main` (Source = **GitHub Actions** in repo Settings → Pages)
- `js/config.js` already sets `APP_BASE_URL` to that origin for future Supabase auth redirects

## Mapping from SchoolExplorer

| SchoolExplorer | CampusExplorer |
|----------------|----------------|
| `nces.html` | `explorer.html` |
| `index.html` / `admin.html` | Same roles |
| `leaid` / `ncessch` | `unitid` (+ `ccc_college_code`) |
| `nces-sync/` + Urban CCD API | `ipeds-sync/` + IPEDS Complete Data Files / Scorecard |
| `nces_*` tables | `he_*` tables |
| Grade enrollment charts | CIP completions + FTES/headcount |

## Next data loads

1. Replace seed with real IPEDS HD / EF / E12 / C extracts for the sync roster.
2. **CCC Data Mart** FTES, headcount, and awards by TOP for California community colleges (official CSV/Excel exports — not HTML scraping).
3. Optional Scorecard consumer metrics.
4. Defer facilities / FCI / building age (needs FUSION or client FM).

## Repo layout

```
index.html, admin.html, auth-confirm.html, reset-password.html
explorer.html
css/ styles.css, explorer.css
js/  demo-gate.js, config.js, he-config.js, he-data.js, he-map.js, he-explorer.js
data/seed/ campuses.json, enrollment.json, completions.json
sql/ setup.sql, migrations/001_he_tables.sql, 002_he_rls.sql
ipeds-sync/  TypeScript ETL stub
.github/workflows/sync-ipeds.yml, pages.yml
```

## License / citation

IPEDS public data: cite NCES. Seed enrollment/completions in this MVP are **illustrative** for UI wiring — replace before any client deliverable.

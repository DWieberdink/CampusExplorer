# CampusExplorer

Higher Education campus explorer for Perkins Eastman Higher Education Advisory.

**Live (GitHub Pages):** [https://dwieberdink.github.io/CampusExplorer/](https://dwieberdink.github.io/CampusExplorer/)

**Demo password:** `CUAdvice` (client-side gate via `localStorage` — remembered across visits; not real security; intentional for static PE demos).

**Pattern:** clone of [`PE-k12-strategies/SchoolExplorer`](https://github.com/PE-k12-strategies/SchoolExplorer) — static HTML/JS SPA + Supabase warehouse + offline ETL + GitHub Pages.

**Data:** Today the explorer reads seed JSON under `data/seed/` (in-repo). Optional Supabase warehouse later when keys are configured — see below.

**Data spine:** IPEDS `UNITID` (+ optional CCC college/district codes). Seed covers 539 campuses across ~20 large U.S. public systems, all from IPEDS Complete Data Files: directory + lat/lon, fall enrollment 2014–2023, 12-month FTE, completions by CIP 2018-19–2023-24, finance (incl. facilities finance / age of plant), staffing, housing. See the **Data sources** tab.

Regenerate:

```bash
python3 scripts/build-top20-campuses-seed.py --download        # data/seed/campuses.json (roster)
python3 scripts/build-ipeds-seed.py --download --ipeds-dir /tmp/ipeds   # enrollment, completions, data/campus/*.json
```

Square footage / building counts are not in any national public dataset. Texas is loaded from the THECB Facilities Inventory (25 campuses, reporting year 2025):

```bash
python3 scripts/fetch-thecb-facilities.py              # data/seed/facilities.csv + facilities-buildings-tx.csv
python3 scripts/build-ipeds-seed.py --ipeds-dir /tmp/ipeds
```

Other systems: add rows to `data/seed/facilities.csv` (per-system sources listed on the Data sources tab) and re-run `build-ipeds-seed.py`.

## What works today (no secrets)

| Feature | Status |
|---------|--------|
| Demo password gate (`index.html` → `js/demo-gate.js`) | Unlocks explorer/admin; persists in `localStorage` across visits |
| Auth / admin / confirm / reset pages | UI stubs; auth inactive until Supabase keys are set |
| Explorer filters (State → System → Campus → Program family → Year) | IPEDS seed |
| Overview KPIs, enrollment trend, clickable program-family chart, sortable directory | IPEDS seed |
| Campus map | Colored by system with legend + popups; Mapbox GL `pk.` token in `js/he-config.js` |
| Campus pages (`campus.html?unitid=…`) | Enrollment history, programs, facilities finance, decision indicators |
| Data sources tab | Every metric’s source, vintage, coverage; facilities-inventory sources per system |
| Compare view | Enrollment, program, and facilities indicators side by side |
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
5. Point Supabase Auth Site URL at the GitHub Pages origin once Pages is enabled.

(Mapbox public `pk.` token is already set in `js/he-config.js` for client GL — restrict allowed URLs in the Mapbox dashboard.)

## Local preview

```bash
# from repo root — any static server
python3 -m http.server 5500
# open http://127.0.0.1:5500/  (password gate → explorer)
```

Or open `index.html` via Live Server. Seed fetch needs HTTP (not `file://`). Direct `explorer.html` redirects back to the gate until the demo password is entered.

## GitHub Pages

- **Live URL (once enabled):** [https://dwieberdink.github.io/CampusExplorer/](https://dwieberdink.github.io/CampusExplorer/)
- Publish source: branch **`main`** / folder **`/` (root)** — static HTML, no build step
- `js/config.js` already sets `APP_BASE_URL` to that origin for future Supabase auth redirects

### Enable once (repo owner)

Cloud agent tokens cannot create a Pages site (`403 Resource not accessible by integration`). Douwe must flip Settings once:

1. Open [Settings → Pages](https://github.com/DWieberdink/CampusExplorer/settings/pages)
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**
3. Branch: **`main`** · Folder: **`/ (root)`**
4. Click **Save**
5. Wait ~1–2 minutes, then open https://dwieberdink.github.io/CampusExplorer/ and enter password **`CUAdvice`**

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

1. **Facilities inventory** for the rest of the roster: UNC PlanRoom next, then other systems by request. Alamo colleges report zero buildings in THECB (district-level reporting is likely), so they need a district request. FCI is not in THECB and is still blank.
2. **CCC Data Mart** FTES, headcount, and awards by TOP for California community colleges (official CSV/Excel exports — not HTML scraping).
3. Optional Scorecard consumer metrics.

## Repo layout

```
index.html, admin.html, auth-confirm.html, reset-password.html
explorer.html
css/ styles.css, explorer.css
js/  demo-gate.js, config.js, he-config.js, he-data.js, he-map.js, he-explorer.js
data/seed/ campuses.json, enrollment.json, completions.json
sql/ setup.sql, migrations/001_he_tables.sql, 002_he_rls.sql
ipeds-sync/  TypeScript ETL stub
.github/workflows/sync-ipeds.yml
```


## License / citation

IPEDS public data: cite NCES. Seed enrollment/completions in this MVP are **illustrative** for UI wiring — replace before any client deliverable.

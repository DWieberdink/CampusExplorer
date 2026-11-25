# IPEDS / Scorecard sync (MVP stub)

Synchronizes campus directory, enrollment, and completions into Supabase for the Campus Explorer dashboard.

**The explorer never calls IPEDS, Scorecard, or CCC Data Mart from the browser** — it reads seed JSON offline, or Supabase tables populated by this package.

## What this MVP does

| Mode | Behavior |
|------|----------|
| No `.env` / `--dry-run` | Loads `../data/seed/*.json`, prints counts (UI already uses those files) |
| `.env` configured | Upserts seed roster + facts into `he_*` tables |
| Full ZIP ETL | **Stub only** — commands and portals documented below |

## Official download commands (production path)

1. Open [IPEDS Use the Data → Complete Data Files](https://nces.ed.gov/IPEDS/use-the-data).
2. For each target year, download survey components:
   - **HD** / **IC** — directory (name, control, sector, lat/lon, parent/child)
   - **EF** — fall enrollment
   - **E12** / **EFFY** — 12-month enrollment / instructional activity
   - **C** — completions by CIP
3. Optionally download [College Scorecard bulk files](https://collegescorecard.ed.gov/data/) for OPEID↔UNITID and consumer metrics.
4. Place ZIPs under `ipeds-sync/data/downloads/` (gitignored) and implement parsers that filter to `he_sync_campuses.unitid`.

Example local layout:

```text
ipeds-sync/data/downloads/
  HD2023.zip
  EF2023.zip
  EFFY2023.zip
  C2023.zip
```

Illustrative unzip (after manual download):

```bash
mkdir -p data/downloads/extracted
cd data/downloads
unzip -o HD2023.zip -d extracted/HD2023
unzip -o EF2023.zip -d extracted/EF2023
```

Then map CSV columns → upsert helpers in `src/sync/` (replace the stub warning in `run-sync.ts`).

## Setup

```bash
cd ipeds-sync
npm install
cp .env.example .env
# Edit .env with Supabase URL + service role key
```

Run SQL first (Supabase SQL Editor, in order):

1. `../sql/setup.sql`
2. `../sql/migrations/001_he_tables.sql`
3. `../sql/migrations/002_he_rls.sql`

## Commands

```bash
npm run sync -- --dry-run
npm run sync:seed
npm run sync -- --unitid 123554
npm run typecheck
```

## GitHub Action

See `.github/workflows/sync-ipeds.yml` (`workflow_dispatch`). Repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Next data loads (CCC Data Mart)

After the IPEDS spine works:

1. Export FTES / headcount / program awards by TOP from [CCC Data Mart](https://datamart.cccco.edu/datamart.aspx) for roster colleges.
2. Join on UNITID ↔ CCC college code (`ccc_college_code` on `he_sync_campuses`).
3. Prefer official CSV/Excel exports over HTML scraping.

## Key substitution vs SchoolExplorer

| SchoolExplorer | CampusExplorer |
|----------------|----------------|
| `leaid` / `ncessch` | `unitid` (+ optional `ccc_college_code`) |
| Urban CCD API | IPEDS Complete Data Files / Scorecard |
| `nces-sync/` | `ipeds-sync/` |

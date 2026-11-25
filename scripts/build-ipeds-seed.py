#!/usr/bin/env python3
"""
Build enrollment, completions, campus metrics, and per-campus detail JSON from
IPEDS Complete Data Files for every UNITID in data/seed/campuses.json.

Usage:
  python3 scripts/build-ipeds-seed.py --ipeds-dir /tmp/ipeds   # CSVs already unzipped
  python3 scripts/build-ipeds-seed.py --download --ipeds-dir /tmp/ipeds

Outputs:
  data/seed/enrollment.json   fall headcount 2014–2023 + 12-month FTE
  data/seed/completions.json  awards by 2-digit CIP family, academic years 2018-19 … 2023-24
  data/seed/cip-families.json CIP 2020 family titles
  data/seed/campuses.json     adds a `metrics` summary object per campus
  data/campus/<unitid>.json   full detail for the campus page

Year convention: `year` is the fall term / start of the academic year
(fall 2023 = 2023-24 academic year = C2024 completions = EFIA2024 FTE).
Finance F2223 is FY 2022-23 → year 2022.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SEED = REPO / "data" / "seed"
CAMPUS_DIR = REPO / "data" / "campus"
BASE = "https://nces.ed.gov/ipeds/datacenter/data/"

EF_YEARS = list(range(2014, 2024))           # EF{y}A → fall y
EFIA_FILES = {y + 1: y for y in range(2014, 2024)}  # EFIA{y+1} → year y
C_FILES = {y + 1: y for y in range(2018, 2024)}     # C{y+1}_A → year y
FINANCE_FILE = ("F2223_F1A", 2022)
DRVEF_YEARS = [2021, 2022, 2023]

AWLEVEL = {
    "1": "Certificate (<1 yr)",
    "2": "Certificate (1–2 yrs)",
    "3": "Associate's",
    "4": "Certificate (2–4 yrs)",
    "5": "Bachelor's",
    "6": "Postbaccalaureate certificate",
    "7": "Master's",
    "8": "Post-master's certificate",
    "17": "Doctor's (research/scholarship)",
    "18": "Doctor's (professional practice)",
    "19": "Doctor's (other)",
    "20": "Certificate (<12 weeks)",
    "21": "Certificate (12 weeks–1 yr)",
}

LOCALE = {
    "11": "City: Large", "12": "City: Midsize", "13": "City: Small",
    "21": "Suburb: Large", "22": "Suburb: Midsize", "23": "Suburb: Small",
    "31": "Town: Fringe", "32": "Town: Distant", "33": "Town: Remote",
    "41": "Rural: Fringe", "42": "Rural: Distant", "43": "Rural: Remote",
}

INSTSIZE = {
    "1": "Under 1,000", "2": "1,000–4,999", "3": "5,000–9,999",
    "4": "10,000–19,999", "5": "20,000 and above",
}

C21BASIC = {
    "1": "Associate's: High Transfer–High Traditional",
    "2": "Associate's: High Transfer–Mixed Traditional/Nontraditional",
    "3": "Associate's: High Transfer–High Nontraditional",
    "4": "Associate's: Mixed Transfer/Career & Technical–High Traditional",
    "5": "Associate's: Mixed Transfer/Career & Technical–Mixed",
    "6": "Associate's: Mixed Transfer/Career & Technical–High Nontraditional",
    "7": "Associate's: High Career & Technical–High Traditional",
    "8": "Associate's: High Career & Technical–Mixed",
    "9": "Associate's: High Career & Technical–High Nontraditional",
    "10": "Special Focus Two-Year: Health Professions",
    "11": "Special Focus Two-Year: Technical Professions",
    "12": "Special Focus Two-Year: Arts & Design",
    "13": "Special Focus Two-Year: Other Fields",
    "14": "Baccalaureate/Associate's: Associate's Dominant",
    "15": "Doctoral: Very High Research Activity (R1)",
    "16": "Doctoral: High Research Activity (R2)",
    "17": "Doctoral/Professional",
    "18": "Master's: Larger Programs",
    "19": "Master's: Medium Programs",
    "20": "Master's: Small Programs",
    "21": "Baccalaureate: Arts & Sciences Focus",
    "22": "Baccalaureate: Diverse Fields",
    "23": "Baccalaureate/Associate's: Mixed",
    "24": "Special Focus Four-Year: Faith-Related",
    "25": "Special Focus Four-Year: Medical Schools & Centers",
    "26": "Special Focus Four-Year: Other Health Professions",
    "27": "Special Focus Four-Year: Research Institution",
    "28": "Special Focus Four-Year: Engineering & Technology",
    "29": "Special Focus Four-Year: Business & Management",
    "30": "Special Focus Four-Year: Arts, Music & Design",
    "31": "Special Focus Four-Year: Law",
    "32": "Special Focus Four-Year: Other",
    "33": "Tribal Colleges and Universities",
}


def find_csv(d: Path, stem: str) -> Path | None:
    """Prefer revised (_rv) release when present."""
    stem_l = stem.lower()
    cands = {p.name.lower(): p for p in d.glob("*.csv")}
    for name in (f"{stem_l}_rv.csv", f"{stem_l}.csv"):
        if name in cands:
            return cands[name]
    return None


def ensure(d: Path, stem: str, download: bool) -> Path | None:
    p = find_csv(d, stem)
    if p or not download:
        return p
    url = f"{BASE}{stem}.zip"
    try:
        print(f"  downloading {url}", file=sys.stderr)
        with urllib.request.urlopen(url, timeout=180) as r:
            blob = r.read()
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            zf.extractall(d)
    except Exception as e:  # noqa: BLE001
        print(f"  ! {stem}: {e}", file=sys.stderr)
        return None
    return find_csv(d, stem)


def read_rows(p: Path, keep: set[str]):
    with p.open(newline="", encoding="utf-8-sig", errors="replace") as f:
        for row in csv.DictReader(f):
            uid = (row.get("UNITID") or "").strip()
            if uid in keep:
                yield uid, row


def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "."):
        return None
    try:
        x = float(s)
    except ValueError:
        return None
    if x < 0:
        return None
    return int(x) if x.is_integer() else x


def pct_change(a, b):
    if a in (None, 0) or b is None:
        return None
    return round((b - a) / a * 100, 1)


def load_cip_titles(d: Path, download: bool) -> dict[str, str]:
    p = d / "cip2020.csv"
    if not p.exists() and download:
        try:
            urllib.request.urlretrieve("https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv", p)
        except Exception as e:  # noqa: BLE001
            print(f"  ! CIP titles: {e}", file=sys.stderr)
    titles: dict[str, str] = {}
    if not p.exists():
        return titles
    with p.open(newline="", encoding="utf-8-sig", errors="replace") as f:
        for row in csv.DictReader(f):
            code = (row.get("CIPCode") or "").replace('="', "").replace('"', "").strip()
            title = (row.get("CIPTitle") or "").strip().rstrip(".")
            if code:
                titles[code] = title
    return titles


def title_case_family(t: str) -> str:
    small = {"and", "or", "of", "the", "in", "for", "to", "a"}
    words = t.lower().split()
    return " ".join(w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ipeds-dir", type=Path, default=Path("/tmp/ipeds"))
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()
    d: Path = args.ipeds_dir
    d.mkdir(parents=True, exist_ok=True)

    campuses = json.loads((SEED / "campuses.json").read_text())
    keep = {c["unitid"] for c in campuses}
    print(f"{len(keep)} campuses", file=sys.stderr)

    # --- Fall enrollment (EF A) -------------------------------------------
    enroll: dict[tuple[str, int], dict] = {}
    for y in EF_YEARS:
        p = ensure(d, f"EF{y}A", args.download)
        if not p:
            continue
        for uid, r in read_rows(p, keep):
            lvl = (r.get("EFALEVEL") or "").strip()
            tot = num(r.get("EFTOTLT"))
            rec = enroll.setdefault((uid, y), {"unitid": uid, "year": y})
            if lvl == "1":
                rec["headcount_total"] = tot
            elif lvl == "2":
                rec["headcount_ug"] = tot
            elif lvl == "12":
                rec["headcount_grad"] = tot
            elif lvl == "21":
                rec["headcount_ft"] = tot
            elif lvl == "41":
                rec["headcount_pt"] = tot

    for f_year, y in EFIA_FILES.items():
        p = ensure(d, f"EFIA{f_year}", args.download)
        if not p:
            continue
        for uid, r in read_rows(p, keep):
            parts = [num(r.get(k)) for k in ("FTEUG", "FTEGD", "FTEDPP")]
            if all(v is None for v in parts):
                continue
            rec = enroll.setdefault((uid, y), {"unitid": uid, "year": y})
            rec["fte_12mo"] = int(sum(v or 0 for v in parts))

    enrollment = sorted(
        (r for r in enroll.values() if r.get("headcount_total") is not None or r.get("fte_12mo") is not None),
        key=lambda r: (r["unitid"], r["year"]),
    )

    # --- Completions -------------------------------------------------------
    cip_titles = load_cip_titles(d, args.download)
    families = {k: title_case_family(v) for k, v in cip_titles.items() if len(k) == 2}
    comp2: dict[tuple[str, int, str], int] = defaultdict(int)
    latest_programs: dict[str, dict[str, dict[str, int]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    latest_c_year = max(C_FILES.values())
    for f_year, y in C_FILES.items():
        p = ensure(d, f"C{f_year}_A", args.download)
        if not p:
            continue
        for uid, r in read_rows(p, keep):
            if (r.get("MAJORNUM") or "").strip() != "1":
                continue
            cip = (r.get("CIPCODE") or "").strip()
            if not cip or cip.startswith("99"):
                continue
            n = num(r.get("CTOTALT")) or 0
            if not n:
                continue
            comp2[(uid, y, cip[:2])] += n
            if y == latest_c_year:
                latest_programs[uid][cip][(r.get("AWLEVEL") or "").strip()] += n

    # Compact nested map: {unitid: {year: {cip2: awards}}} — flattened in the browser.
    completions: dict[str, dict[str, dict[str, int]]] = {}
    for (u, y, c), n in sorted(comp2.items()):
        completions.setdefault(u, {}).setdefault(str(y), {})[c] = n

    # --- HD / IC / DRVEF / HR / Finance -----------------------------------
    hd = {}
    p = ensure(d, "HD2023", args.download)
    if p:
        for uid, r in read_rows(p, keep):
            hd[uid] = r
    ic = {}
    p = ensure(d, "IC2023", args.download)
    if p:
        for uid, r in read_rows(p, keep):
            ic[uid] = r
    drvef = defaultdict(dict)
    for y in DRVEF_YEARS:
        p = ensure(d, f"DRVEF{y}", args.download)
        if p:
            for uid, r in read_rows(p, keep):
                drvef[uid][y] = r
    hr = {}
    p = ensure(d, "DRVHR2023", args.download)
    if p:
        for uid, r in read_rows(p, keep):
            hr[uid] = r
    fin = {}
    p = ensure(d, FINANCE_FILE[0], args.download)
    if p:
        for uid, r in read_rows(p, keep):
            fin[uid] = r
    drvf = {}
    p = ensure(d, "DRVF2023", args.download)
    if p:
        for uid, r in read_rows(p, keep):
            drvf[uid] = r

    # Optional manual facilities inventory (GSF / buildings) — see data/seed/facilities.csv
    facilities = {}
    fac_path = SEED / "facilities.csv"
    if fac_path.exists():
        with fac_path.open(newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                uid = (row.get("unitid") or "").strip()
                if uid in keep:
                    facilities[uid] = {
                        "gross_sq_ft": num(row.get("gross_sq_ft")),
                        "assignable_sq_ft": num(row.get("assignable_sq_ft")),
                        "building_count": num(row.get("building_count")),
                        "avg_building_age": num(row.get("avg_building_age")),
                        "fci": num(row.get("fci")),
                        "source": (row.get("source") or "").strip() or None,
                        "as_of": (row.get("as_of") or "").strip() or None,
                    }

    by_unit_enroll = defaultdict(dict)
    for r in enrollment:
        by_unit_enroll[r["unitid"]][r["year"]] = r

    CAMPUS_DIR.mkdir(parents=True, exist_ok=True)
    for old in CAMPUS_DIR.glob("*.json"):
        old.unlink()

    for c in campuses:
        uid = c["unitid"]
        h = hd.get(uid, {})
        e = by_unit_enroll.get(uid, {})
        hc = lambda y: (e.get(y) or {}).get("headcount_total")  # noqa: E731
        latest_y = max((y for y in e if e[y].get("headcount_total") is not None), default=None)
        latest_hc = hc(latest_y) if latest_y else None
        fte_latest = (e.get(latest_y) or {}).get("fte_12mo") if latest_y else None
        ft_latest = (e.get(latest_y) or {}).get("headcount_ft") if latest_y else None

        dv = drvef.get(uid, {}).get(2023, {})
        pct_online = num(dv.get("PCTDEEXC"))
        pct_some_online = num(dv.get("PCTDESOM"))

        f = fin.get(uid, {})
        buildings_value = num(f.get("F1A234"))
        accum_dep = num(f.get("F1A284"))
        dep_exp = num(f.get("F1C19DP"))
        om_exp = num(f.get("F1C19OM"))
        cip_value = num(f.get("F1A274"))
        ppe_total = num(f.get("F1A27T4"))
        age_of_plant = round(accum_dep / dep_exp, 1) if accum_dep and dep_exp else None
        # Ratios outside this band come from partial/parent-level reporting, not real plant age.
        if age_of_plant is not None and not (1 <= age_of_plant <= 60):
            age_of_plant = None
        fte_fin = (e.get(2022) or {}).get("fte_12mo")
        om_per_fte = round(om_exp / fte_fin) if om_exp and fte_fin else None
        if om_per_fte is not None and om_per_fte < 100:
            om_per_fte = None

        df = drvf.get(uid, {})
        hr_r = hr.get(uid, {})
        ic_r = ic.get(uid, {})
        roomcap = num(ic_r.get("ROOMCAP")) if (ic_r.get("ROOM") or "").strip() == "1" else None
        fac = facilities.get(uid)

        metrics = {
            "latest_year": latest_y,
            "headcount": latest_hc,
            "headcount_ft": ft_latest,
            "fte_12mo": fte_latest,
            "chg_5yr_pct": pct_change(hc(latest_y - 5), latest_hc) if latest_y else None,
            "chg_10yr_pct": pct_change(hc(latest_y - 9), latest_hc) if latest_y else None,
            "pct_online": pct_online,
            "age_of_plant_yrs": age_of_plant,
            "om_per_fte": om_per_fte,
            "housing_beds": roomcap,
            "gross_sq_ft": fac.get("gross_sq_ft") if fac else None,
            "building_count": fac.get("building_count") if fac else None,
        }
        c["metrics"] = metrics

        progs = []
        for cip, lv in sorted(latest_programs.get(uid, {}).items()):
            progs.append({
                "cip": cip,
                "title": cip_titles.get(cip, cip),
                "cip2": cip[:2],
                "awards": sum(lv.values()),
                "levels": {AWLEVEL.get(k, k): v for k, v in sorted(lv.items())},
            })
        progs.sort(key=lambda p: -p["awards"])

        detail = {
            "unitid": uid,
            "directory": {
                "inst_name": c["inst_name"],
                "system_code": c["system_name"],
                "ipeds_system": c.get("ipeds_system"),
                "address": (h.get("ADDR") or "").strip() or None,
                "city": c.get("city"),
                "state": c.get("state"),
                "zip": (h.get("ZIP") or "").strip() or None,
                "county": (h.get("COUNTYNM") or "").strip() or None,
                "website": (h.get("WEBADDR") or "").strip() or None,
                "chief": (h.get("CHFNM") or "").strip() or None,
                "chief_title": (h.get("CHFTITLE") or "").strip() or None,
                "sector": c.get("sector"),
                "carnegie": C21BASIC.get((h.get("C21BASIC") or "").strip()),
                "locale": LOCALE.get((h.get("LOCALE") or "").strip()),
                "size_band": INSTSIZE.get((h.get("INSTSIZE") or "").strip()),
                "land_grant": (h.get("LANDGRNT") or "").strip() == "1",
                "hbcu": (h.get("HBCU") or "").strip() == "1",
                "latitude": c.get("latitude"),
                "longitude": c.get("longitude"),
            },
            "metrics": metrics,
            "enrollment": [e[y] for y in sorted(e)],
            "students": {
                "year": 2023,
                "pct_exclusively_online": pct_online,
                "pct_some_online": pct_some_online,
                "student_faculty_ratio": num(dv.get("STUFACR")),
                "retention_ft_pct": num(dv.get("RET_PCF")),
                "pct_full_time_first_time": num(dv.get("PCTFT1ST")),
                "online_trend": [
                    {"year": y, "pct_exclusively_online": num(drvef[uid][y].get("PCTDEEXC")),
                     "pct_some_online": num(drvef[uid][y].get("PCTDESOM"))}
                    for y in sorted(drvef.get(uid, {}))
                ],
                "housing_beds": roomcap,
            },
            "facilities": {
                "inventory": fac,
                "finance_year": FINANCE_FILE[1],
                "buildings_book_value": buildings_value,
                "accumulated_depreciation": accum_dep,
                "depreciation_expense": dep_exp,
                "age_of_plant_yrs": age_of_plant,
                "construction_in_progress": cip_value,
                "ppe_total": ppe_total,
                "om_expense": om_exp,
                "om_per_fte": om_per_fte,
                "capital_appropriations": num(f.get("F1B20")),
                "capital_grants_gifts": num(f.get("F1B21")),
            },
            "finance": {
                "year": 2022,
                "core_revenue": num(df.get("F1CORREV")),
                "core_expense": num(df.get("F1COREXP")),
                "instruction_per_fte": num(df.get("F1INSTFT")),
                "tuition_pct_core_rev": num(df.get("F1TUFEPC")),
                "state_approp_pct_core_rev": num(df.get("F1STAPPC")),
                "local_approp_pct_core_rev": num(df.get("F1LCAPPC")),
            },
            "staff": {
                "year": 2023,
                "staff_fte_total": num(hr_r.get("SFTETOTL")),
                "instructional_fte": num(hr_r.get("SFTEINST")),
                "avg_salary_all_ranks": num(hr_r.get("SALTOTL")),
            },
            "programs": {
                "year": latest_c_year,
                "families": sorted(
                    ({"cip2": k[2], "awards": n} for k, n in comp2.items() if k[0] == uid and k[1] == latest_c_year),
                    key=lambda x: -x["awards"],
                ),
                "detail": progs,
                "awards_trend": [
                    {"year": y, "awards": sum(n for k, n in comp2.items() if k[0] == uid and k[1] == y)}
                    for y in sorted(set(C_FILES.values()))
                ],
            },
        }
        (CAMPUS_DIR / f"{uid}.json").write_text(json.dumps(detail, separators=(",", ":")) + "\n")

    (SEED / "enrollment.json").write_text(json.dumps(enrollment, separators=(",", ":")) + "\n")
    (SEED / "completions.json").write_text(json.dumps(completions, separators=(",", ":")) + "\n")
    (SEED / "cip-families.json").write_text(json.dumps(families, indent=1, sort_keys=True) + "\n")
    (SEED / "campuses.json").write_text(json.dumps(campuses, indent=2) + "\n")

    with_enroll = len({r["unitid"] for r in enrollment if r.get("headcount_total") is not None})
    with_comp = len(completions)
    with_plant = sum(1 for c in campuses if c["metrics"]["age_of_plant_yrs"] is not None)
    print(
        f"enrollment rows {len(enrollment)} ({with_enroll} campuses) · "
        f"completions {len(comp2)} cells ({with_comp} campuses) · "
        f"age-of-plant {with_plant} campuses · facilities inventory {len(facilities)}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

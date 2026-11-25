#!/usr/bin/env python3
"""
Build data/seed/campuses.json for the top ~20 U.S. public higher-ed systems
from an IPEDS HD (directory) CSV.

Usage:
  python3 scripts/build-top20-campuses-seed.py /path/to/HD2023.csv
  # or download automatically:
  python3 scripts/build-top20-campuses-seed.py --download
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "data" / "seed" / "campuses.json"
HD_URL = "https://nces.ed.gov/ipeds/datacenter/data/HD2023.zip"

# Short codes used in the explorer → IPEDS F1SYSNAM (exact), unless special-cased.
F1_SYSTEMS: dict[str, str] = {
    "CSU": "California State University",
    "SUNY": "State University of New York System",
    "UT": "The University of Texas System",
    "CUNY": "City University of New York",
    "UC": "University of California",
    "USG": "University System of Georgia",
    "TAMU": "Texas A&M University System",
    "NCCCS": "North Carolina Community College System",
    "VCCS": "Virginia Community College System",
    "UNC": "University of North Carolina",
    "MNSCU": "Minnesota State Colleges and Universities",
    "TBR": "TBR - The College System of Tennessee",
    "PASSHE": "Pennsylvania State System of Higher Education",
    "MCCCD": "Maricopa Community College District",
    "KCTCS": "Kentucky Community and Technical College System",
    "CCCS": "Colorado Community College System",
    "LCTCS": "Louisiana Community and Technical College System",
    "ALAMO": "Alamo Colleges",
}

SECTOR_LABEL = {
    "0": "Administrative unit",
    "1": "Public, 4-year",
    "2": "Private nonprofit, 4-year",
    "3": "Private for-profit, 4-year",
    "4": "Public, 2-year",
    "5": "Private nonprofit, 2-year",
    "6": "Private for-profit, 2-year",
    "7": "Public, less-than-2-year",
    "8": "Private nonprofit, less-than-2-year",
    "9": "Private for-profit, less-than-2-year",
    "99": "Sector unknown",
}

CONTROL_LABEL = {"1": "Public", "2": "Private nonprofit", "3": "Private for-profit"}


def load_hd(path: Path | None, download: bool) -> list[dict]:
    if download or path is None:
        print(f"Downloading {HD_URL} …", file=sys.stderr)
        with urllib.request.urlopen(HD_URL, timeout=120) as resp:
            blob = resp.read()
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
            raw = zf.read(name)
        text = raw.decode("utf-8-sig", errors="replace")
        return list(csv.DictReader(io.StringIO(text)))

    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def num_or_none(v: str | None) -> float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in {".", "-2", "-1", "-9"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def row_to_campus(r: dict, system_code: str) -> dict | None:
    lat = num_or_none(r.get("LATITUDE"))
    lon = num_or_none(r.get("LONGITUD"))
    if lat is None or lon is None:
        return None
    sector = SECTOR_LABEL.get(str(r.get("SECTOR") or "").strip(), r.get("SECTOR") or "")
    control = CONTROL_LABEL.get(str(r.get("CONTROL") or "").strip(), r.get("CONTROL") or "")
    return {
        "unitid": str(r["UNITID"]).strip(),
        "opeid": (r.get("OPEID") or "").strip() or None,
        "inst_name": (r.get("INSTNM") or "").strip(),
        "system_name": system_code,
        "sector": sector,
        "control": control,
        "state": (r.get("STABBR") or "").strip(),
        "city": (r.get("CITY") or "").strip() or None,
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "ccc_district": None,
        "ccc_college_code": None,
        "parent_unitid": None,
        "is_branch": False,
        "enabled": True,
        "ipeds_system": (r.get("F1SYSNAM") or "").strip() or None,
    }


def is_active_public(r: dict) -> bool:
    # SECTOR 0 = system / district administrative offices (no students).
    return r.get("CYACTIVE") == "1" and r.get("CONTROL") == "1" and r.get("SECTOR") != "0"


def is_ccc(r: dict) -> bool:
    """CA community colleges, including baccalaureate-pilot colleges IPEDS lists as 4-year."""
    if r.get("STABBR") != "CA" or r.get("DEGGRANT") != "1":
        return False
    if r.get("ICLEVEL") == "2":
        return True
    if r.get("ICLEVEL") != "1":
        return False
    name = (r.get("INSTNM") or "").strip()
    f1 = (r.get("F1SYSNAM") or "").strip()
    if f1 in ("California State University", "University of California"):
        return False
    if any(x in name for x in ("University", "Naval", "Teachers College")):
        return False
    return "Community College" in f1 or "Community College" in name or name.endswith("College")


def select_campuses(rows: list[dict]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()

    def add(r: dict, code: str) -> None:
        uid = str(r["UNITID"]).strip()
        if uid in seen:
            return
        campus = row_to_campus(r, code)
        if not campus:
            return
        seen.add(uid)
        out.append(campus)

    for r in rows:
        if is_active_public(r) and is_ccc(r):
            add(r, "CCC")

    # Florida College System: FL public degree-granting, not SUS, typically ICLEVEL=1.
    sus = "State University System of Florida"
    for r in rows:
        if not is_active_public(r):
            continue
        if r.get("STABBR") != "FL" or r.get("DEGGRANT") != "1":
            continue
        if (r.get("F1SYSNAM") or "").strip() == sus:
            continue
        if r.get("ICLEVEL") != "1":
            continue
        # Exclude non-FCS public FL entities that aren't colleges (none in current HD set).
        add(r, "FCS")

    for code, f1 in F1_SYSTEMS.items():
        for r in rows:
            if not is_active_public(r):
                continue
            if (r.get("F1SYSNAM") or "").strip() != f1:
                continue
            add(r, code)

    out.sort(key=lambda c: (c["system_name"], c["state"], c["inst_name"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("hd_csv", nargs="?", type=Path, help="Path to HD20xx.csv")
    ap.add_argument("--download", action="store_true", help="Download HD2023.zip from NCES")
    args = ap.parse_args()

    rows = load_hd(args.hd_csv, args.download or args.hd_csv is None)
    campuses = select_campuses(rows)

    by_sys: dict[str, int] = {}
    for c in campuses:
        by_sys[c["system_name"]] = by_sys.get(c["system_name"], 0) + 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(campuses, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(campuses)} campuses → {OUT}", file=sys.stderr)
    for code in sorted(by_sys, key=lambda k: (-by_sys[k], k)):
        print(f"  {code:6s} {by_sys[code]:4d}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

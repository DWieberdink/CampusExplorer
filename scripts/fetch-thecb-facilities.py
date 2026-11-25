#!/usr/bin/env python3
"""Pull Texas building-level facilities inventory (THECB CBM014) for the Texas roster.

Source: https://www1.thecb.state.tx.us/apps/FacInv/FacSearchBldg.cfm
Writes:
  data/seed/facilities-buildings-tx.csv   one row per building
  data/seed/facilities.csv                campus totals (merged; non-Texas rows kept)

Each campus total is checked against the TOTALS row the site prints for it.
"""
from __future__ import annotations

import argparse
import csv
import html
import http.cookiejar
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed"
FORM_URL = "https://www1.thecb.state.tx.us/apps/FacInv/FacSearchBldg.cfm"
RESULTS_URL = "https://www1.thecb.state.tx.us/apps/FacInv/FacSearchBldgResults.cfm"
UA = "Mozilla/5.0 (CampusExplorer facilities import)"

# IPEDS UNITID -> THECB FICE (from the Institution select on FacSearchBldg.cfm).
TX_FICE = {
    "228778": "003658",  # UT Austin
    "228769": "003656",  # UT Arlington
    "228787": "009741",  # UT Dallas
    "228796": "003661",  # UTEP
    "229027": "010115",  # UTSA
    "228802": "011163",  # UT Tyler
    "229018": "009930",  # UT Permian Basin
    "227368": "003599",  # UT Rio Grande Valley
    "228635": "000030",  # UT Southwestern Medical Center
    "229300": "011618",  # UTHealth Houston
    "228644": "000040",  # UT Health Science Center San Antonio
    "416801": "025554",  # MD Anderson Cancer Center
    "228653": "104952",  # UT Medical Branch Galveston
    "227526": "003630",  # Prairie View A&M
    "228529": "003631",  # Tarleton State
    "226152": "009651",  # Texas A&M International
    "228723": "003632",  # Texas A&M University (College Station)
    "224554": "003565",  # East Texas A&M (Commerce)
    "224147": "011161",  # Texas A&M Corpus Christi
    "228705": "003639",  # Texas A&M Kingsville
    "483036": "042295",  # Texas A&M Central Texas
    "459949": "042485",  # Texas A&M San Antonio
    "224545": "029269",  # Texas A&M Texarkana
    "229814": "003665",  # West Texas A&M
    "228431": "003624",  # Stephen F. Austin State
    "488730": "000309",  # Alamo: Northeast Lakeview
    "420398": "000307",  # Alamo: Northwest Vista
    "246354": "023413",  # Alamo: Palo Alto
    "227924": "009163",  # Alamo: San Antonio College
    "227854": "003608",  # Alamo: St. Philip's
}

TYPE = {"1": "General Purpose", "2": "Academic/Residence", "3": "Auxiliary Services",
        "4": "Physical Plant", "5": "Agricultural Services", "6": "Residence, Single",
        "7": "Residence, Family", "8": "Non-Institutional Agency", "9": "Rental Property",
        "H": "Hospitals/Clinics", "R": "Renovations"}
LOC = {"1": "On-Campus", "2": "Off-Campus", "3": "Remote"}
COND = {"1": "Satisfactory", "2": "Remodeling <25% of replacement", "3": "Remodeling 25-50%",
        "4": "Remodeling >50%", "5": "Demolition", "6": "Termination", "7": "Mothballed"}
OWN = {"1": "Owned", "2": "Title vested in institution", "3": "Title vested in holding company",
       "4": "Leased/Rented", "5": "Not owned (free lease)", "6": "Not owned (shared, non-postsecondary)",
       "7": "Not owned (shared, postsecondary)", "8": "Other"}

BUILDING_FIELDS = ["unitid", "inst_name", "fice", "reporting_year", "building_number", "building_name", "type",
                   "location", "condition", "ownership", "occupancy_year", "floors", "rooms",
                   "gsf", "nasf", "eg_sq_ft", "zip"]
CAMPUS_FIELDS = ["unitid", "inst_name", "gross_sq_ft", "assignable_sq_ft", "building_count",
                 "avg_building_age", "fci", "source", "as_of"]


def fetch(opener: urllib.request.OpenerDirector, fice: str, year: int) -> str:
    form = {
        "ReportYear": str(year), "FICE": fice, "Bldg_Name": "", "Bldg_Type": "",
        "Bldg_Loc": "", "Bldg_Own": "", "Bldg_Cond": "", "GSF": "0", "NASF": "0", "EG": "0",
        "ZipCode": "", "OrderBy": "BUILDING", "OrderBy2": "BUILDING", "OutputPref": "Screen",
    }
    req = urllib.request.Request(
        RESULTS_URL,
        data=urllib.parse.urlencode(form).encode(),
        headers={"User-Agent": UA, "Referer": FORM_URL},
    )
    with opener.open(req, timeout=120) as resp:
        return resp.read().decode("latin-1")


def clean(cell: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", cell)).replace("\xa0", " ").strip()


def to_int(s: str) -> int:
    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else 0


def parse(page: str, unitid: str, inst_name: str, fice: str, year: int):
    buildings = []
    totals = None
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I):
        cells = [clean(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        if not cells:
            continue
        if cells[0].upper().startswith("TOTALS"):
            totals = {"buildings": to_int(cells[0]), "gsf": to_int(cells[2]), "nasf": to_int(cells[3])}
            continue
        if len(cells) != 13 or not re.fullmatch(r"[0-9A-Z]{1,8}", cells[0]):
            continue
        buildings.append({
            "unitid": unitid, "inst_name": inst_name, "fice": fice, "reporting_year": year,
            "building_number": cells[0], "building_name": cells[1],
            "type": TYPE.get(cells[2], cells[2]), "location": LOC.get(cells[3], cells[3]),
            "condition": COND.get(cells[4], cells[4]), "ownership": OWN.get(cells[5], cells[5]),
            "occupancy_year": to_int(cells[6]) or "", "floors": to_int(cells[7]),
            "rooms": to_int(cells[8]), "gsf": to_int(cells[9]), "nasf": to_int(cells[10]),
            "eg_sq_ft": to_int(cells[11]), "zip": cells[12],
        })
    return buildings, totals


def campus_summary(buildings, unitid, inst_name, year):
    gsf = sum(b["gsf"] for b in buildings)
    nasf = sum(b["nasf"] for b in buildings)
    weighted = [(b["gsf"], year - b["occupancy_year"]) for b in buildings
                if isinstance(b["occupancy_year"], int) and 1800 <= b["occupancy_year"] <= year and b["gsf"] > 0]
    wsum = sum(w for w, _ in weighted)
    avg_age = round(sum(w * a for w, a in weighted) / wsum, 1) if wsum else ""
    return {
        "unitid": unitid, "inst_name": inst_name, "gross_sq_ft": gsf, "assignable_sq_ft": nasf,
        "building_count": len(buildings), "avg_building_age": avg_age, "fci": "",
        "source": f"THECB Facilities Inventory CBM014, reporting year {year}",
        "as_of": f"retrieved {date.today().isoformat()}",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--year", type=int, default=2025, help="THECB ReportYear to request (default 2025; 2026 is still being collected)")
    ap.add_argument("--roster", type=Path, default=SEED / "campuses.json")
    args = ap.parse_args()

    import json
    roster = {r["unitid"]: r for r in json.loads(args.roster.read_text(encoding="utf-8"))}
    targets = [(uid, roster[uid]["inst_name"], fice) for uid, fice in TX_FICE.items() if uid in roster]
    missing = set(TX_FICE) - set(roster)
    if missing:
        print(f"warning: not in roster: {sorted(missing)}", file=sys.stderr)

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(urllib.request.Request(FORM_URL, headers={"User-Agent": UA}), timeout=60).read()

    all_buildings, campus_rows, failures, skipped = [], [], [], []
    for uid, name, fice in targets:
        buildings, totals, year = [], None, args.year
        for year in range(args.year, args.year - 5, -1):
            page = fetch(opener, fice, year)
            buildings, totals = parse(page, uid, name, fice, year)
            if buildings:
                break
        if not buildings:
            skipped.append((uid, name, fice))
            continue
        summary = campus_summary(buildings, uid, name, year)
        if totals and (totals["buildings"] != len(buildings) or totals["gsf"] != summary["gross_sq_ft"]):
            failures.append((uid, name, f"total mismatch: rows={len(buildings)} gsf={summary['gross_sq_ft']} "
                                        f"site={totals}"))
        all_buildings.extend(buildings)
        campus_rows.append(summary)
        print(f"{uid} {name} ({year}): {len(buildings)} buildings, {summary['gross_sq_ft']:,} GSF", file=sys.stderr)

    for uid, name, fice in skipped:
        print(f"skipped {uid} {name} (FICE {fice}): zero buildings reported 2021-{args.year}", file=sys.stderr)
    if failures:
        for uid, name, why in failures:
            print(f"FAILED {uid} {name}: {why}", file=sys.stderr)
        return 1

    bld_path = SEED / "facilities-buildings-tx.csv"
    with bld_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=BUILDING_FIELDS)
        w.writeheader()
        w.writerows(all_buildings)

    camp_path = SEED / "facilities.csv"
    existing = []
    if camp_path.exists():
        with camp_path.open(newline="", encoding="utf-8-sig") as f:
            existing = [r for r in csv.DictReader(f) if r.get("unitid") not in TX_FICE]
    with camp_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPUS_FIELDS)
        w.writeheader()
        w.writerows(existing + campus_rows)

    print(f"wrote {len(all_buildings)} buildings to {bld_path}", file=sys.stderr)
    print(f"wrote {len(campus_rows)} Texas campus rows to {camp_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

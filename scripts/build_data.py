#!/usr/bin/env python3
"""Merge the raw breed datasets into data/breeds.json and js/breeds-data.js.

Sources (see README for provenance):
  data/raw/breed_traits.csv      AKC 1-5 trait ratings (via TidyTuesday 2022-02-01)
  data/raw/breed_rank.csv        AKC popularity ranks + AKC page links (same source)
  data/raw/akc-data-latest.csv   AKC height / weight / lifespan / group (via tmfilho/akcdata)
  data/raw/wikidata_breeds.json  Wikidata breed items with a Commons image (P18)
  data/extra_traits.csv          hand-written estimates for traits the AKC data lacks
  data/crossbreeds.csv           hand-written ratings for popular crossbreeds
  data/image_credits.json        (optional) per-image author/license, from fetch_images.py

Usage: python3 scripts/build_data.py
"""
import csv
import json
import re
import unicodedata
from urllib.parse import unquote
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

TRAIT_COLS = {
    "Affectionate With Family": "affection",
    "Good With Young Children": "kids",
    "Good With Other Dogs": "dogs",
    "Shedding Level": "shedding",
    "Coat Grooming Frequency": "grooming",
    "Drooling Level": "drool",
    "Openness To Strangers": "strangers",
    "Playfulness Level": "play",
    "Watchdog/Protective Nature": "protective",
    "Adaptability Level": "adaptability",
    "Trainability Level": "trainability",
    "Energy Level": "energy",
    "Barking Level": "barking",
    "Mental Stimulation Needs": "mental",
}

# TidyTuesday trait names -> canonical (akcdata) names, where the automatic singularizer fails.
NAME_FIXES = {
    "Cavalier King Charles Spaniels": "Cavalier King Charles Spaniel",
    "Brussels Griffons": "Brussels Griffon",
    "Bouviers des Flandres": "Bouvier des Flandres",
}

# Breeds that the trait table lists once but that come in sizes with very different needs.
SPLITS = {
    "Poodles": ["Poodle (Toy)", "Poodle (Miniature)", "Poodle (Standard)"],
    "Manchester Terriers": ["Manchester Terrier (Toy)", "Manchester Terrier (Standard)"],
}

# Canonical name -> Wikidata English label, where they differ.
WD_ALIASES = {
    "German Shepherd Dog": "German Shepherd",
    "Doberman Pinscher": "Dobermann",
    "Mastiff": "English Mastiff",
    "Newfoundland": "Newfoundland dog",
    "Saint Bernard": "St. Bernard",
    "Chinese Shar-Pei": "Shar Pei",
    "Great Pyrenees": "Pyrenean Mountain Dog",
    "Russell Terrier": "Jack Russell Terrier",
    "Chinese Crested": "Chinese Crested Dog",
    "Anatolian Shepherd Dog": "Anatolian Shepherd",
    "Brussels Griffon": "Griffon Bruxellois",
    "Belgian Tervuren": "Tervuren",
    "Silky Terrier": "Australian Silky Terrier",
    "Pointer": "English Pointer",
    "Belgian Sheepdog": "Groenendael",
    "Xoloitzcuintli": "Xoloitzcuintle",
    "English Toy Spaniel": "King Charles Spaniel",
    "Berger Picard": "Picardy Shepherd",
    "Portuguese Podengo Pequeno": "Portuguese Podengo",
    "Nederlandse Kooikerhondje": "Kooikerhondje",
    "Bergamasco Sheepdog": "Bergamasco Shepherd",
    "Cirneco dell’Etna": "Cirneco dell'Etna",
    "Grand Basset Griffon Vendéen": "Large Vendeen Griffon Basset",
    "Belgian Malinois": "Belgian Malinois",
    "Poodle (Toy)": "poodle",
    "Poodle (Miniature)": "poodle",
    "Poodle (Standard)": "poodle",
    "Manchester Terrier (Toy)": "Toy Manchester Terrier",
    "Manchester Terrier (Standard)": "Manchester Terrier",
}

# Known-bad numbers in akcdata (lb). Values from the AKC breed standards.
WEIGHT_FIXES = {
    "Cane Corso": (88, 110),
    "Spinone Italiano": (64, 86),
    "Boxer": (50, 80),
    "Chihuahua": (2, 6),
    "Maltese": (4, 7),
    "Yorkshire Terrier": (4, 7),
    "Silky Terrier": (8, 10),
    "Pekingese": (8, 14),
    "French Bulldog": (16, 28),
    "Lakeland Terrier": (15, 17),
    "Welsh Terrier": (18, 22),
    "Norwich Terrier": (10, 12),
    "Norfolk Terrier": (10, 12),
    "Pembroke Welsh Corgi": (24, 30),
    "Manchester Terrier (Toy)": (6, 12),
    "Cairn Terrier": (13, 14),
}

GROUP_SHORT = {
    "Toy Group": "Toy",
    "Hound Group": "Hound",
    "Terrier Group": "Terrier",
    "Working Group": "Working",
    "Non-Sporting Group": "Non-Sporting",
    "Sporting Group": "Sporting",
    "Herding Group": "Herding",
}

LOW_ALLERGEN_COATS = {"Curly", "Wiry", "Silky", "Hairless", "Corded"}
PRO_GROOM_COATS = {"Curly", "Corded"}


def norm(s):
    s = unicodedata.normalize("NFKD", s.replace("\xa0", " ")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", " ", s)
    return " ".join(s.split())


def slug(s):
    return norm(s).replace(" ", "-")


IRREGULAR = {
    "pulik": "puli", "pumik": "pumi", "kuvaszok": "kuvasz", "komondorok": "komondor",
    "keeshonden": "keeshond", "lagotti": "lagotto", "romagnoli": "romagnolo", "dogues": "dogue",
    "spinoni": "spinone", "italiani": "italiano", "cirnechi": "cirneco", "bichons": "bichon",
    "frises": "frise", "petits": "petit", "bassets": "basset", "griffons": "griffon",
    "vendeens": "vendeen", "st": "saint", "kooikerhondjes": "kooikerhondje", "pequenos": "pequeno",
    "pyrenees": "pyrenees", "havanese": "havanese", "pekingese": "pekingese", "malinois": "malinois",
    "tervuren": "tervuren", "apsos": "apso", "collies": "collie",
}


def singular(word):
    if word in IRREGULAR:
        return IRREGULAR[word]
    if word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def canonical_from_traits(name, akc_by_norm):
    name = name.replace("\xa0", " ")
    if name in NAME_FIXES:
        return NAME_FIXES[name]
    m = re.match(r"^(.*?) \((.*)\)$", name)
    base = f"{m.group(2)} {m.group(1)}" if m else name
    key = " ".join(singular(w) for w in norm(base).split())
    return akc_by_norm.get(key)


def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        lines = [l for l in f if not l.startswith("#")]
    return list(csv.DictReader(lines))


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def size_class(max_lb, min_lb):
    mid = (min_lb + max_lb) / 2
    if mid < 12:
        return 1  # toy
    if mid < 25:
        return 2  # small
    if mid < 55:
        return 3  # medium
    if mid < 95:
        return 4  # large
    return 5  # giant


def main():
    akc = {r[""]: r for r in read_csv(RAW / "akc-data-latest.csv")}
    akc_by_norm = {norm(k): k for k in akc}
    extra = {r["breed"]: r for r in read_csv(ROOT / "data" / "extra_traits.csv")}
    ranks = {r["Breed"].replace("\xa0", " "): r for r in read_csv(RAW / "breed_rank.csv")}
    wd = {}
    for b in json.loads((RAW / "wikidata_breeds.json").read_text()):
        wd.setdefault(b["label"].lower(), b)
    credits_path = ROOT / "data" / "image_credits.json"
    credits = json.loads(credits_path.read_text()) if credits_path.exists() else {}

    rows = []  # (canonical name, trait row, rank row)
    for r in read_csv(RAW / "breed_traits.csv"):
        tname = r["Breed"].replace("\xa0", " ")
        names = SPLITS.get(tname) or [canonical_from_traits(tname, akc_by_norm)]
        if names[0] is None:
            raise SystemExit(f"no akcdata match for {tname!r}")
        for n in names:
            rows.append((n, r, ranks.get(tname), False))
    for r in read_csv(ROOT / "data" / "crossbreeds.csv"):
        rows.append((r["Breed"], r, None, True))

    breeds = []
    problems = []
    for name, tr, rk, cross in rows:
        traits = {short: int(tr[col]) for col, short in TRAIT_COLS.items()}
        if cross:
            wmin, wmax = fnum(tr["min_weight_lb"]), fnum(tr["max_weight_lb"])
            hmin, hmax = fnum(tr["min_height_in"]), fnum(tr["max_height_in"])
            lmin, lmax = fnum(tr["min_expectancy"]), fnum(tr["max_expectancy"])
            group, temperament = "Crossbreed", tr["temperament"]
        else:
            a = akc[name]
            kg2lb, cm2in = 2.20462, 0.393701
            wmin = fnum(a["min_weight"]) and fnum(a["min_weight"]) * kg2lb
            wmax = fnum(a["max_weight"]) and fnum(a["max_weight"]) * kg2lb
            hmin = fnum(a["min_height"]) and fnum(a["min_height"]) * cm2in
            hmax = fnum(a["max_height"]) and fnum(a["max_height"]) * cm2in
            lmin, lmax = fnum(a["min_expectancy"]), fnum(a["max_expectancy"])
            group, temperament = GROUP_SHORT.get(a["group"], a["group"]), a["temperament"]
        if name in WEIGHT_FIXES:
            wmin, wmax = WEIGHT_FIXES[name]
        if not wmin or not wmax:
            problems.append(f"{name}: missing weight")
            continue
        if wmin > wmax:
            wmin, wmax = wmax, wmin
        ex = extra.get(name)
        if not ex:
            problems.append(f"{name}: missing extra_traits row")
            continue
        coat_type, coat_len = tr["Coat Type"], tr["Coat Length"]
        low_allergen = traits["shedding"] == 1 or (traits["shedding"] <= 2 and coat_type in LOW_ALLERGEN_COATS)
        w = wd.get(WD_ALIASES.get(name, name).lower())
        sid = slug(name)
        b = {
            "id": sid,
            "name": name,
            "group": group,
            "crossbreed": cross,
            "weightLb": [round(wmin), round(wmax)],
            "heightIn": [round(hmin), round(hmax)] if hmin and hmax else None,
            "lifespan": [round(lmin), round(lmax)] if lmin and lmax else None,
            "size": size_class(wmax, wmin),
            "temperament": temperament,
            "coatType": coat_type,
            "coatLength": coat_len,
            "lowAllergen": low_allergen,
            "proGrooming": coat_type in PRO_GROOM_COATS or (coat_len == "Long" and traits["grooming"] >= 4),
            "popularity": int(rk["2020 Rank"]) if rk and rk.get("2020 Rank", "").isdigit() else None,
            "akcUrl": rk["links"] if rk else None,
            "wikiUrl": w["article"] if w else None,
            "image": f"images/breeds/{sid}.jpg",
            "commonsFile": unquote(w["image"].split("Special:FilePath/")[1]) if w else None,
            "imageCredit": credits.get(sid),
            **traits,
            **{k: int(ex[k]) for k in ("prey", "alone", "heat", "cold", "recall", "care", "health")},
            "brachy": ex["brachy"] == "1",
        }
        breeds.append(b)

    missing_img = [b["name"] for b in breeds if not b["wikiUrl"]]
    for p in problems:
        print("PROBLEM:", p)
    print(f"{len(breeds)} breeds; {len(missing_img)} without Wikidata match: {missing_img}")

    (ROOT / "data" / "breeds.json").write_text(json.dumps(breeds, indent=1, ensure_ascii=False))
    (ROOT / "js" / "breeds-data.js").write_text(
        "// Generated by scripts/build_data.py - do not edit by hand.\n"
        "window.BREEDS = " + json.dumps(breeds, ensure_ascii=False, separators=(",", ":")) + ";\n"
    )


if __name__ == "__main__":
    main()

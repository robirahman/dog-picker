#!/usr/bin/env python3
"""Download one Wikimedia Commons photo per breed into images/breeds/<id>.jpg and record credits.

Reads data/breeds.json (run build_data.py first), writes data/image_credits.json, then
re-run build_data.py so the credits are embedded in js/breeds-data.js.

Existing image files are left alone, so you can drop in your own (e.g. Gemini-generated)
images with the same file names and they will not be overwritten. Use --force to re-download.

Usage: python3 scripts/fetch_images.py [--force] [--only <breed-id> ...]
"""
import argparse
import hashlib
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
UA = "DogPickerBot/0.1 (https://github.com/robirahman/dog-picker)"
THUMB_WIDTH = 500  # one of Wikimedia's standard thumbnail steps
MAX_SIDE = 640


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(5 * 2**attempt)
                continue
            raise


def commons_urls(filename):
    name = filename.replace(" ", "_")
    h = hashlib.md5(name.encode()).hexdigest()
    q = urllib.parse.quote(name)
    base = f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{q}"
    thumb = f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{THUMB_WIDTH}px-{q}"
    if name.lower().endswith((".tif", ".tiff")):
        thumb += ".jpg"
    return thumb, base


def strip_wiki(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)  # [[link|text]] -> text
    s = re.sub(r"\[https?://\S+ ([^\]]+)\]", r"\1", s)  # [url text] -> text
    s = re.sub(r"\[https?://\S+\]", "", s)
    s = re.sub(r"\{\{\s*(?:u|user|creator)\s*\|\s*([^}|]+)[^}]*\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"^\s*(?:en|User|:en:User)\s*:", "", s.strip())
    return " ".join(s.split())[:120]


LICENSE_PATTERNS = [
    (r"cc-by-sa-(\d\.\d)", "CC BY-SA {}"),
    (r"cc-by-(\d\.\d)", "CC BY {}"),
    (r"cc-zero|cc0", "CC0"),
    (r"\bGFDL", "GFDL"),
    (r"\bPD-", "Public domain"),
    (r"FAL\b", "Free Art License"),
    (r"Copyrighted free use", "Copyrighted free use"),
]


def parse_credit(wikitext):
    author = None
    m = re.search(r"^\s*\|\s*[Aa]uthor\s*=\s*(.+)$", wikitext, re.M)
    if m:
        author = strip_wiki(m.group(1)) or None
    if not author:
        m = re.search(r"[Pp]hoto(?:graph)? by (.+?)(?: at | on |,|\.|\n)", wikitext)
        if m:
            author = strip_wiki(m.group(1)) or None
    if not author:  # fall back to the first user page linked (usually the uploader)
        m = re.search(r"\[\[:?(?:\w\w:)?(?:User|Benutzer|Utilisateur|Usuario):([^|\]]+)", wikitext, re.I)
        if m:
            author = m.group(1).strip()
    if author and author.lower().startswith("by "):
        author = author[3:]
    licenses = []
    for pat, fmt in LICENSE_PATTERNS:
        for mm in re.finditer(pat, wikitext, re.I):
            lic = fmt.format(*mm.groups()) if mm.groups() else fmt
            if lic not in licenses:
                licenses.append(lic)
    return author, licenses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()

    breeds = json.loads((ROOT / "data" / "breeds.json").read_text())
    credits_path = ROOT / "data" / "image_credits.json"
    credits = json.loads(credits_path.read_text()) if credits_path.exists() else {}
    out_dir = ROOT / "images" / "breeds"
    out_dir.mkdir(parents=True, exist_ok=True)

    failures = []
    for b in breeds:
        if args.only and b["id"] not in args.only:
            continue
        fn = b.get("commonsFile")
        if not fn:
            failures.append((b["id"], "no commons file"))
            continue
        dest = out_dir / f"{b['id']}.jpg"
        if args.force or not dest.exists():
            thumb, orig = commons_urls(fn)
            try:
                try:
                    data = get(thumb)
                except urllib.error.HTTPError:
                    data = get(orig)  # originals smaller than the thumb width have no thumb
                img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
                img.thumbnail((MAX_SIDE, MAX_SIDE))
                img.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
                print("ok   ", b["id"], img.size)
            except Exception as e:  # noqa: BLE001 - report and carry on
                failures.append((b["id"], repr(e)))
                print("FAIL ", b["id"], e)
            time.sleep(1)
        cur = credits.get(b["id"]) or {}
        if args.force or not cur.get("author") or not cur.get("license"):
            try:
                page = "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(fn.replace(" ", "_"))
                wikitext = get(page + "?action=raw").decode("utf-8", "replace")
                author, licenses = parse_credit(wikitext)
                credits[b["id"]] = {"file": fn, "page": page, "author": author, "license": ", ".join(licenses) or None}
            except Exception as e:  # noqa: BLE001
                print("CREDIT FAIL", b["id"], e)
            time.sleep(1)
        credits_path.write_text(json.dumps(credits, indent=1, ensure_ascii=False))

    if failures:
        print("\nFailures:", *failures, sep="\n  ")
        sys.exit(1)


if __name__ == "__main__":
    main()

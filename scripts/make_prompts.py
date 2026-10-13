#!/usr/bin/env python3
"""Write image-generation prompts (for Gemini or any other image model), one per breed.

Outputs docs/image-prompts.md (readable) and docs/image-prompts.csv (id, filename, prompt).
Save each generated image as images/breeds/<id>.jpg; the app picks it up automatically, and
fetch_images.py will not overwrite an existing file.

Usage: python3 scripts/make_prompts.py
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SIZE_WORDS = {1: "toy-sized", 2: "small", 3: "medium-sized", 4: "large", 5: "giant"}
PARENTS = {
    "Goldendoodle": "Golden Retriever x Standard Poodle cross",
    "Labradoodle": "Labrador Retriever x Standard Poodle cross",
    "Cavapoo": "Cavalier King Charles Spaniel x Miniature Poodle cross",
    "Cockapoo": "Cocker Spaniel x Miniature Poodle cross",
    "Maltipoo": "Maltese x Toy Poodle cross",
}

STYLE = (
    "Realistic professional pet photograph. One adult dog, whole body in frame, standing in a relaxed "
    "three-quarter view on short green grass in a quiet park. Soft natural morning light, camera at the "
    "dog's eye level, background gently blurred. Landscape 4:3. No people, no text, no watermark, "
    "no props, plain collar or none."
)


def prompt_for(b):
    w = f"about {b['weightLb'][0]}-{b['weightLb'][1]} lb"
    what = f"a {PARENTS[b['name']]}" if b["name"] in PARENTS else f"a purebred {b['name']}, accurate to the breed standard"
    coat = f"{b['coatLength'].lower()} {b['coatType'].lower()} coat in a typical color for the breed"
    if b["coatType"] == "Hairless":
        coat = "mostly hairless body (typical of the breed)"
    return f"{STYLE} The dog is {what}: a {SIZE_WORDS[b['size']]} dog ({w}) with a {coat}, groomed the way pet owners usually keep it."


def main():
    breeds = json.loads((ROOT / "data" / "breeds.json").read_text())
    docs = ROOT / "docs"
    docs.mkdir(exist_ok=True)
    with open(docs / "image-prompts.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "breed", "save_as", "prompt"])
        for b in breeds:
            w.writerow([b["id"], b["name"], f"images/breeds/{b['id']}.jpg", prompt_for(b)])
    lines = [
        "# Image prompts",
        "",
        "One prompt per breed, for Gemini or another image model. Every prompt shares the same style",
        "sentence so the set looks consistent. Save each result as the file named under it (JPEG,",
        "roughly 640 px on the long side is plenty); the app shows it in place of the Wikimedia photo.",
        "",
        "The same prompts are in `image-prompts.csv` for batch use.",
        "",
        "**Shared style:** " + STYLE,
        "",
    ]
    for b in breeds:
        lines += [f"## {b['name']}", "", f"Save as `images/breeds/{b['id']}.jpg`", "", "```", prompt_for(b), "```", ""]
    (docs / "image-prompts.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {len(breeds)} prompts")


if __name__ == "__main__":
    main()

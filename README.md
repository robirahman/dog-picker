# Dog Breed Ranker

A static web app that ranks **every** dog breed (the 195 AKC breeds in the source data, with poodles and
Manchester terriers split by size, plus 5 popular doodle crosses) against your answers to a
lifestyle quiz, and explains *why* each breed does or doesn't fit.

It was built as an improvement on the eFAQ Dog Breed Match Quiz, which asks good questions but
only returns two suggestions. See [`docs/efaq-quiz.md`](docs/efaq-quiz.md) for its full
question list and why its results are thin: every answer collapses into one of five 0-3 scores.

## Use it

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

- **Full quiz** (55 questions, ~8 min) or **quick quiz** (25 core questions).
- Results rank all breeds by *fit*: 100% minus a penalty for every conflict, scaled so a few
  small conflicts still score well and one serious conflict drops a breed a long way.
- Open any breed to see each reason it fits or doesn't, the answers that caused it, and a
  comparison of its trait ratings against your limits.
- Filter by size or group, search, hide breeds with serious conflicts, edit any answer and watch
  the ranking update. Answers are remembered in your browser.

## How matching works

`js/questions.js` defines the questions. Each answer sets profile variables on a 0-1 scale
(exercise capacity, shedding tolerance, time at home, etc.) or categories (young kids, cat,
allergies, preferred sizes, climate). `js/scoring.js` runs about 30 checks, each comparing one
part of your profile with one or more breed traits, for example:

| You | Breed traits |
| --- | --- |
| exercise capacity, wanting a running partner | energy, flat face |
| home size, stairs, car, fenced yard | size, energy, adaptability, off-leash recall |
| hours alone, how clingy you want the dog | coping alone, affection |
| hair, brushing, groomer, drool, mess, budget | shedding, coat type, grooming, drool, size, health |
| training experience, patience, obedience | trainability, energy, mental needs, protectiveness |
| kids, cats, small pets, other dogs | good with kids, prey drive, good with dogs |
| visitors, barking, chasing, pulling | openness to strangers, protectiveness, barking, prey drive, size |
| allergies, size, climate, health priority | low-shedding coat, weight, heat/cold tolerance, health, lifespan |

Gaps produce penalty points that grow faster than linearly, so being one point over your limit
costs a little and three points over costs a lot. Household dealbreakers (a high-prey-drive breed
with a cat, a breed not recommended with young kids) carry large fixed penalties. The two areas
you choose in the last question count 1.75x.

## Data

| File | What | Source |
| --- | --- | --- |
| `data/raw/breed_traits.csv` | 14 AKC trait ratings (1-5), coat type and length | AKC, via [TidyTuesday 2022-02-01](https://github.com/rfordatascience/tidytuesday/tree/master/data/2022/2022-02-01) |
| `data/raw/breed_rank.csv` | AKC popularity and breed page links | same |
| `data/raw/akc-data-latest.csv` | height, weight, lifespan, AKC group | AKC, via [tmfilho/akcdata](https://github.com/tmfilho/akcdata) |
| `data/raw/wikidata_breeds.json` | Wikipedia article and Commons photo per breed | Wikidata (P18) |
| `data/extra_traits.csv` | prey drive, coping alone, heat/cold tolerance, recall, extra care, health burden, flat face | hand-written estimates |
| `data/crossbreeds.csv` | trait ratings for 5 doodle crosses | hand-written estimates |
| `data/image_credits.json` | photographer and license per photo | Wikimedia Commons |

`scripts/build_data.py` merges these into `data/breeds.json` and `js/breeds-data.js` (the file the
app loads). It also fixes a few wrong weights in akcdata. Rerun it after editing any data file.

The hand-written estimates in `extra_traits.csv` are reasonable defaults, not measurements. Edit
them if you know a breed better.

## Photos

`images/breeds/<breed-id>.jpg` holds one photo per breed, downloaded from Wikimedia Commons by
`scripts/fetch_images.py` (credits are shown on each breed in the app). All are freely licensed
(mostly CC BY-SA); keep the credits if you publish the app.

To use AI-generated images instead, `docs/image-prompts.md` (and `.csv`) has one Gemini prompt per
breed with a shared style sentence so the set looks consistent. Save each image under the file name
given; `fetch_images.py` never overwrites an existing file unless you pass `--force`.

## Rebuilding

```sh
python3 scripts/build_data.py      # merge data -> data/breeds.json, js/breeds-data.js
python3 scripts/fetch_images.py    # download missing photos + credits (needs Pillow)
python3 scripts/build_data.py      # embed the credits
python3 scripts/make_prompts.py    # regenerate docs/image-prompts.*
```

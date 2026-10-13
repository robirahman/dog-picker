# What the eFAQ Dog Breed Match Quiz asks

Source: <https://efaq.com/dog-breed/flow/quiz>, captured 2026-10-13. A headless browser was
blocked by Cloudflare, but the quiz is served as JSON by the site's own API (`POST /api/sessions`,
`POST /api/quiz/begin` with `{"quiz_vertical":"dog_breed"}`, then `POST /api/quiz/<id>/next-part`),
so the full question set below is exactly what the page shows. Answers were not submitted, so the
results page wasn't captured.

## Structure

- Two "personalization" questions first: age range (under 20 / 20s / 30s / 40s / 50+) and gender.
  Neither has any obvious bearing on breed fit.
- Then **60 single-choice questions with 4 answers each**, served in a fixed order that cycles
  through five themes: energy, space, time, upkeep, temperament.
- **Every answer is encoded as `<dimension>_<0-3>`** (e.g. `energy_2`, `upkeep_0`). In other words
  the whole quiz reduces to five numbers, each the sum or average of 12 answers. Whatever matching
  happens afterwards can only work with those five numbers.

## Why that explains the disappointing results

Collapsing everything into five averages throws away the answers that matter most:

- **Dealbreakers get averaged away.** "Small children" and "cats and small animals" are just
  `temperament_0` answers, averaged with how you feel about barking and pulling. A household with
  a toddler and a pet rabbit can end up with the same temperament score as an adult-only home that
  simply dislikes barking.
- **Different traits are merged.** Shedding, drool, brushing, professional grooming, muddy paws,
  wet-dog smell, and vet-bill budget all become one "upkeep" number, so a breed that sheds heavily
  but never drools looks the same as one that drools but never sheds.
- **Some mappings are questionable.** "Who else is in the house? Just you" scores
  `temperament_3` (the most dog-tolerant) and "Small children" scores `temperament_0`, which mixes
  child safety into the same scale as wanting a feisty dog.
- **No way to say what matters most**, and no questions about allergies, preferred size, climate,
  or health and lifespan.

## How Dog Breed Ranker uses the same ground

Every eFAQ theme is covered (in our own wording), but each answer feeds a specific variable that
is compared with specific breed ratings. For example, the eFAQ "upkeep" bucket becomes separate
checks for shedding, seasonal coat blowouts, brushing, professional grooming, drool, mess,
ear/eye/skin-fold care, and budget. Household make-up (young kids, cats, small pets, another dog)
is handled as hard constraints rather than averaged in. See `js/questions.js` and `js/scoring.js`.

New questions not in the eFAQ quiz: allergies, preferred size, climate (hot summers / cold winters),
how much lifespan and health matter, and which two areas to weight extra.

## The 60 questions, grouped by the dimension each one feeds

### Energy (12 questions)

| # | Question | Answers (scored 0 to 3) |
|---|---|---|
| 1 | How far do you walk on an ordinary day? | Barely at all (0) / A short walk or two (1) / A few miles (2) / Miles, most days (3) |
| 6 | What is your weekend usually like? | Out all day, moving (3) / Out doing something (2) / Odd jobs and errands (1) / Indoors, slow (0) |
| 11 | It is raining. Does the walk still happen? | No (0) / Only if it has to (1) / Yes (2) / Rain barely registers (3) |
| 16 | Could you give a dog a full hour of exercise every single day? | Easily, twice (3) / Most days (2) / Some days (1) / No (0) |
| 21 | How early would you get up for a dog? | Not at all (0) / A little earlier (1) / Six, if needed (2) / Whenever it needs you (3) |
| 26 | What is left of your energy after work? | Enough for a run (3) / Enough for a walk (2) / Very little (1) / Nothing (0) |
| 31 | A dog that needs a job to do. How does that sound? | Exhausting (0) / A small one, maybe (1) / Appealing (2) / That is the whole point (3) |
| 36 | Do you run, hike or cycle? | Constantly (3) / Often (2) / Rarely (1) / No (0) |
| 41 | How much of your day is spent sitting down? | Almost all of it (0) / Most of it (1) / About half (2) / Very little (3) |
| 46 | A dog is still bouncing after a two hour walk. How does that land? | Normal (3) / Manageable (2) / Hard going (1) / Unthinkable (0) |
| 51 | How often would you take a dog somewhere new? | Rarely (0) / Now and then (1) / Most weeks (2) / Constantly (3) |
| 56 | What is your idea of a good holiday? | Up a mountain (3) / Walking somewhere (2) / Somewhere comfortable (1) / Lying still (0) |

### Space (12 questions)

| # | Question | Answers (scored 0 to 3) |
|---|---|---|
| 2 | Where do you live? | A house with land (3) / A house (2) / A flat with some room (1) / A small flat (0) |
| 7 | What outdoor space do you have? | None (0) / A balcony (1) / A garden (2) / Fields (3) |
| 12 | How far is the nearest green space? | Out the back door (3) / A walk (2) / A bus ride (1) / A drive away (0) |
| 17 | How much floor space could a dog actually have? | A corner (0) / A room (1) / Most of the house (2) / The run of everything (3) |
| 22 | How easy is it to get a dog in and out? | Straight out the door (3) / One floor (2) / Stairs (1) / Several flights, no lift (0) |
| 27 | How would your neighbors feel about barking? | The walls are thin, they would mind (0) / They would notice (1) / Not much of an issue (2) / Nobody close enough to hear (3) |
| 32 | How settled are you where you live? | Settled for good (3) / Rarely move (2) / Every few years (1) / Moving often (0) |
| 37 | Is your outdoor space secure? | There is none (0) / Not really (1) / Mostly (2) / Fully fenced (3) |
| 42 | What would you transport a dog in? | Something van-sized (3) / A car with room for a crate (2) / A small car (1) / No car (0) |
| 47 | How do you feel about a dog on the furniture? | Never (0) / Rather not (1) / Fine (2) / It is their sofa (3) |
| 52 | How much of your home would you dog-proof? | All of it (3) / Most of it (2) / A little (1) / None of it (0) |
| 57 | Where would the dog sleep? | Outside the bedroom (0) / A bed in the corner (1) / In the bedroom (2) / On your bed (3) |

### Time (12 questions)

| # | Question | Answers (scored 0 to 3) |
|---|---|---|
| 3 | How long would a dog be alone on a normal day? | Eight hours or more (0) / Five or six (1) / A couple (2) / Almost never (3) |
| 8 | Who else is at home during the day? | Always someone (3) / Usually someone (2) / Sometimes someone (1) / Nobody (0) |
| 13 | How predictable is your week? | Different every day (0) / Roughly similar (1) / Steady (2) / The same every week (3) |
| 18 | Could you get home at lunchtime? | Every day (3) / Sometimes (2) / Rarely (1) / No (0) |
| 23 | A dog that follows you from room to room. How does that sound? | Too much (0) / Sometimes fine (1) / Nice (2) / Exactly what you want (3) |
| 28 | How often are you away overnight? | Never (3) / Rarely (2) / Monthly (1) / Often (0) |
| 33 | Who would look after a dog if you were ill? | Nobody (0) / Somebody would have to be found (1) / A friend nearby (2) / Somebody in the house (3) |
| 38 | How much training time could you give each day? | As long as it takes (3) / Twenty minutes (2) / Five minutes (1) / None (0) |
| 43 | How would a puppy's first months fit your life? | They would not (0) / It would be hard (1) / Manageable (2) / Time off could be arranged (3) |
| 48 | How often are you out late? | Rarely (3) / Occasionally (2) / Often (1) / Most nights (0) |
| 53 | Would you need a dog walker or daycare? | Daily, without fail (0) / Often (1) / Occasionally (2) / Never (3) |
| 58 | How much notice do you get before a busy week? | Plenty (3) / Some (2) / A little (1) / None (0) |

### Upkeep (12 questions)

| # | Question | Answers (scored 0 to 3) |
|---|---|---|
| 4 | How do you feel about hair on your clothes? | Would not notice (3) / Fine (2) / Reluctantly (1) / No (0) |
| 9 | How much brushing would you actually do? | None (0) / Now and then (1) / Weekly (2) / Daily (3) |
| 14 | How do you feel about drool? | Endearing (3) / Fine (2) / Rather not (1) / Absolutely not (0) |
| 19 | Muddy paws across the floor. What is your tolerance? | Zero (0) / Low (1) / Reasonable (2) / Total (3) |
| 24 | How much could you spend on a dog each month? | Whatever it needs (3) / A fair amount (2) / A modest amount (1) / Very little (0) |
| 29 | Professional grooming every few weeks. How does that sit? | Not happening (0) / Occasionally (1) / Regularly (2) / Whatever it takes (3) |
| 34 | A dog whose ears, eyes or folds need cleaning. How do you feel? | No trouble at all (3) / Fine (2) / Only if it is simple (1) / No (0) |
| 39 | How tidy is your home? | Very (0) / Tidy (1) / Lived in (2) / Chaotic already (3) |
| 44 | A dog that sheds heavily twice a year. How would you cope? | Easily (3) / Manageably (2) / With difficulty (1) / Not at all (0) |
| 49 | How would an unexpected vet bill land? | A real worry (0) / Tight (1) / Manageable (2) / Covered (3) |
| 54 | How do you feel about the smell of a wet dog? | Quite like it (3) / Barely notice (2) / Mind it (1) / Cannot stand it (0) |
| 59 | After a wet walk, how much drying and wiping would you do? | None (0) / A quick wipe (1) / A proper dry (2) / A full clean (3) |

### Temperament (12 questions)

| # | Question | Answers (scored 0 to 3) |
|---|---|---|
| 5 | How much dog do you actually want? | Gentle and easy (0) / Steady (1) / Characterful (2) / A handful, and you like that (3) |
| 10 | How do you feel about barking? | Let them talk (3) / Some is fine (2) / A little, at most (1) / It would ruin it (0) |
| 15 | Have you trained a dog before? | Never (0) / A bit (1) / Yes (2) / Several, properly (3) |
| 20 | Would you rather a dog that obeys or one that thinks for itself? | Thinks for itself (3) / A bit of both (2) / Mostly obeys (1) / Obeys (0) |
| 25 | A dog that ignores you when it suits them. How does that land? | Infuriating (0) / Frustrating (1) / Funny (2) / Fair enough (3) |
| 30 | Who else is in the house? | Just you (3) / Adults (2) / Older children (1) / Small children (0) |
| 35 | A dog with opinions about visitors. How do you feel? | It must love everybody (0) / Polite matters (1) / Wary is fine (2) / A guard would be welcome (3) |
| 40 | A strong instinct to chase things. How does that sit? | Expected (3) / Manageable (2) / Concerning (1) / No (0) |
| 45 | What other animals are at home? | Cats and small animals (0) / A cat (1) / Another dog (2) / None (3) |
| 50 | How much would being pulled along bother you? | Not at all (3) / Not much (2) / Somewhat (1) / A lot (0) |
| 55 | How patient are you with slow progress? | Not very (0) / Somewhat (1) / Quite (2) / Endlessly (3) |
| 60 | A dog that needs a puzzle to stay sane. How does that sound? | That is the fun of it (3) / Good (2) / Occasionally, maybe (1) / No (0) |

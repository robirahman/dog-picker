// Matching engine. Pure functions, no DOM.
//
// 1. buildProfile(answers) turns quiz answers into profile variables (0-1 numbers or category
//    sets), remembering which answers produced each variable so explanations can quote them.
// 2. scoreBreed(breed, profile) runs a list of checks. Each check compares one thing about
//    you with one or more breed traits and emits "pros" (reasons it fits) and "cons" (penalty
//    points plus an explanation). Fit = 100 * exp(-weighted penalty / SCALE).
// 3. rankBreeds(breeds, profile) scores everything and sorts it.
(function () {
  const SCALE = 50;
  const FOCUS_WEIGHT = 1.75;

  // Profile values are 0-1; breed traits are 1-5. lvl() puts the user on the breed scale.
  const lvl = (v) => 1 + 4 * v;
  // Same, but with a floor: every dog gets some walks, some brushing, some barking.
  const lvlF = (v, floor) => floor + (5 - floor) * v;
  const clamp = (x, lo = 1, hi = 5) => Math.max(lo, Math.min(hi, x));
  // Penalty for a gap of d trait-points, growing faster than linear.
  const gap = (d, k) => (d <= 0.25 ? 0 : k * (d + 0.5 * d * d));
  const r1 = (x) => Math.round(x * 2) / 2; // nearest half point, for display
  const sizeName = ["", "toy", "small", "medium", "large", "giant"];

  function buildProfile(answers) {
    const sums = {}, counts = {}, sources = {}, cats = {};
    for (const q of window.QUESTIONS) {
      const a = answers[q.id];
      if (a === undefined || a === null || (Array.isArray(a) && a.length === 0)) continue;
      const picks = Array.isArray(a) ? a : [a];
      for (const idx of picks) {
        const opt = q.options[idx];
        if (!opt) continue;
        for (const [k, v] of Object.entries(opt[1])) {
          (sources[k] ||= []).push({ q: q.label, a: opt[0] });
          if (typeof v === "number" && !["sizes"].includes(k)) {
            sums[k] = (sums[k] || 0) + v;
            counts[k] = (counts[k] || 0) + 1;
          } else {
            (cats[k] ||= new Set()).add(v);
          }
        }
      }
    }
    const vals = {};
    for (const k in sums) vals[k] = sums[k] / counts[k];
    const focus = cats.focus || new Set();
    return { vals, cats, sources, focus, answered: Object.keys(answers).length };
  }

  function has(p, k) {
    return p.vals[k] !== undefined;
  }

  function lifespanMid(b) {
    return b.lifespan ? (b.lifespan[0] + b.lifespan[1]) / 2 : 12;
  }

  function messiness(b) {
    const waterDog = /Retriever|Water|Newfoundland|Spaniel|Otterhound|Barbet|Lagotto|Doodle/.test(b.name) ? 0.6 : 0;
    const coat = b.coatLength === "Long" ? 0.8 : b.coatLength === "Medium" ? 0.4 : 0;
    return clamp(1 + (b.size - 1) * 0.45 + coat + (b.drool - 1) * 0.3 + waterDog + (b.energy - 3) * 0.2);
  }

  function costLevel(b) {
    return clamp(1 + (b.size - 1) * 0.6 + (b.health - 1) * 0.4 + (b.proGrooming ? 0.8 : 0));
  }

  function difficulty(b) {
    const guardy = b.protective >= 4 && b.size >= 4 ? 0.8 : 0;
    return clamp(1 + (5 - b.trainability) * 0.6 + (b.energy - 1) * 0.3 + (b.mental - 1) * 0.3 + guardy + (b.prey >= 5 ? 0.3 : 0));
  }

  function intensity(b) {
    return (b.energy + b.mental + b.protective + (6 - b.trainability)) / 4;
  }

  function pulling(b) {
    return clamp(1 + (b.size - 1) * 0.75 + (b.energy - 3) * 0.3 + (b.prey - 3) * 0.3);
  }

  function spaceNeed(b) {
    return clamp(b.size * 0.7 + b.energy * 0.3 - (b.adaptability - 3) * 0.3);
  }

  // Each check: (b, p, out) where out.con(area, pts, title, detail, vars) / out.pro(area, title, detail, vars).
  const CHECKS = [
    function energy(b, p, o) {
      if (!has(p, "exercise")) return;
      const cap = lvlF(p.vals.exercise, 1.6);
      const d = b.energy - cap;
      if (d > 0.25) {
        o.con("activity", gap(d, 4), d >= 2 ? "Needs far more exercise than you described" : "Needs more exercise than you described",
          `Energy ${b.energy}/5; your answers put you around ${r1(cap)}/5. An under-exercised ${b.name} tends to get restless, noisy, or destructive.`,
          ["exercise"]);
      } else if (cap <= 2.5 && b.energy <= 2) {
        o.pro("activity", "Happy with a quiet routine", `Energy ${b.energy}/5, a good match for your ${r1(cap)}/5.`, ["exercise"]);
      } else if (cap >= 4 && b.energy >= 4) {
        o.pro("activity", "Matches your activity level", `Energy ${b.energy}/5, and you can give it the exercise it needs.`, ["exercise"]);
      }
    },
    function athletic(b, p, o) {
      if (!has(p, "athletic")) return;
      const a = p.vals.athletic;
      if (a >= 0.6) {
        if (b.brachy) {
          o.con("activity", 7, "Can't safely join runs or long hikes", "Flat-faced breeds overheat and struggle to breathe with sustained exercise.", ["athletic"]);
        } else if (b.energy <= 2) {
          o.con("activity", 3 + 3 * (3 - b.energy) * a, "Won't keep up as a running or hiking partner", `Energy ${b.energy}/5; it would rather stroll than come along.`, ["athletic"]);
        } else if (b.energy >= 4 && b.size >= 2) {
          o.pro("activity", "Good partner for runs and hikes", `Energy ${b.energy}/5 with the build to come along.`, ["athletic"]);
        }
      }
    },
    function mental(b, p, o) {
      if (!has(p, "mental")) return;
      const want = lvlF(p.vals.mental, 2);
      const d = b.mental - want;
      if (d > 0.25) {
        o.con("brains", gap(d, 3), "Needs more mental work than you want to give",
          `Mental-stimulation needs ${b.mental}/5 vs. your ${r1(want)}/5. Bored, it will find its own projects, like chewing, digging, or escaping.`, ["mental"]);
      } else if (want >= 4 && b.mental >= 4) {
        o.pro("brains", "Wants a job, like you want it to", `Mental-stimulation needs ${b.mental}/5: a good fit for training, sports, or puzzle work.`, ["mental"]);
      } else if (want >= 4 && b.mental <= 2) {
        o.con("brains", 2, "Not much interest in brain games", `Mental-stimulation needs ${b.mental}/5; you want a dog to work with.`, ["mental"]);
      }
    },
    function experience(b, p, o) {
      if (!has(p, "experience")) return;
      const exp = lvlF(p.vals.experience, 2.2);
      const diff = difficulty(b);
      const d = diff - exp;
      if (d > 0.25) {
        o.con("brains", gap(d, 4), d >= 1.5 ? "A challenging breed for your training experience" : "Harder to train than your experience suggests",
          `Trainability ${b.trainability}/5, energy ${b.energy}/5${b.protective >= 4 && b.size >= 4 ? ", and a large, protective dog" : ""}. Plan on a professional trainer early.`,
          ["experience"]);
      } else if (exp <= 2 && diff <= 2.8) {
        o.pro("brains", "Forgiving for a first-time owner", `Trainability ${b.trainability}/5 and manageable energy.`, ["experience"]);
      } else if (exp >= 4 && diff >= 3.8) {
        o.pro("brains", "Rewarding for an experienced trainer", "Demanding, but you have the experience to bring out the best in it.", ["experience"]);
      }
    },
    function independence(b, p, o) {
      if (!has(p, "independence")) return;
      const indep = 6 - b.trainability;
      const tol = lvl(p.vals.independence);
      const d = indep - tol;
      if (d > 0.25) {
        o.con("brains", gap(d, 3), "More stubborn than you'd like",
          `Trainability ${b.trainability}/5 ("self-willed" end of the scale). It will often decide your request is optional.`, ["independence"]);
      } else if (tol >= 4 && indep >= 4) {
        o.pro("brains", "An independent thinker, which you enjoy", `Trainability ${b.trainability}/5: it has its own opinions.`, ["independence"]);
      } else if (tol <= 2 && b.trainability >= 5) {
        o.pro("brains", "Eager to please", `Trainability ${b.trainability}/5, the top of the scale.`, ["independence"]);
      }
    },
    function trainTime(b, p, o) {
      if (!has(p, "trainTime") || p.vals.trainTime > 0.4) return;
      if (b.mental >= 4 || b.trainability <= 2) {
        o.con("brains", 3 + (b.mental >= 5 ? 2 : 0), "Needs daily training sessions",
          `You have little time for training; this breed needs it (mental needs ${b.mental}/5, trainability ${b.trainability}/5).`, ["trainTime"]);
      }
    },
    function sizePref(b, p, o) {
      const s = p.cats.sizes;
      if (!s || s.has(0) || s.size === 0) return;
      const dist = Math.min(...[...s].map((x) => Math.abs(b.size - x)));
      if (dist === 0) o.pro("home", `The ${sizeName[b.size]} size you wanted`, `${b.weightLb[0]}-${b.weightLb[1]} lb.`, ["sizes"]);
      else o.con("home", dist === 1 ? 8 : 20, dist === 1 ? "A bit outside the size you wanted" : "Not the size you wanted",
        `A ${sizeName[b.size]} dog (${b.weightLb[0]}-${b.weightLb[1]} lb).`, ["sizes"]);
    },
    function space(b, p, o) {
      if (!has(p, "space")) return;
      const cap = lvlF(p.vals.space, 2.2);
      const need = spaceNeed(b);
      const d = need - cap;
      if (d > 0.25) {
        o.con("home", gap(d, 3.5), d >= 2 ? "Too much dog for your space" : "Will feel cramped in your home",
          `A ${sizeName[b.size]}, energy-${b.energy} dog; your home and outdoor space rate about ${r1(cap)}/5.`, ["space"]);
      } else if (cap <= 2 && need <= 2.2) {
        o.pro("home", "Suits apartment living", `Small and adaptable (adaptability ${b.adaptability}/5).`, ["space"]);
      }
    },
    function access(b, p, o) {
      if (has(p, "access") && p.vals.access <= 0.45 && b.size >= 4) {
        o.con("home", (b.size - 3) * (p.vals.access <= 0.1 ? 7 : 4), "Stairs and a big dog",
          `At ${b.weightLb[1]} lb, carrying it up the stairs when it's injured, sick, or old won't really be possible.`, ["access"]);
      }
      if (has(p, "car") && p.vals.car <= 0.1 && b.size >= 4) {
        o.con("home", (b.size - 3) * 4, "Hard to get to the vet without a car",
          "Dogs this size usually aren't allowed on transit, and many rideshare drivers refuse them.", ["car"]);
      }
    },
    function offLeash(b, p, o) {
      if (!has(p, "fenced") || p.vals.fenced >= 0.7) return;
      if (b.recall <= 1) {
        o.con("home", b.energy >= 4 ? 6 : 4, "Can't be trusted off-leash, and you have no fenced space",
          "Off-leash recall is poor in this breed (it follows its nose or eyes, not you). Expect leash-only walks or trips to a fenced area to let it run.", ["fenced"]);
      }
    },
    function routine(b, p, o) {
      if (!has(p, "routine")) return;
      if (p.vals.routine <= 0.4 && b.adaptability <= 2) {
        o.con("time", 4 * (3 - b.adaptability), "Prefers a steady routine",
          `Adaptability ${b.adaptability}/5; your schedule or address changes a lot.`, ["routine"]);
      } else if (p.vals.routine <= 0.4 && b.adaptability >= 5) {
        o.pro("time", "Copes with an unpredictable life", `Adaptability ${b.adaptability}/5.`, ["routine"]);
      }
    },
    function aloneTime(b, p, o) {
      if (!has(p, "presence")) return;
      const need = 1 + 3.5 * (1 - p.vals.presence);
      const d = need - b.alone;
      if (d > 0.25) {
        o.con("time", gap(d, 4.5), d >= 2 ? "Will struggle with the time it's left alone" : "May not cope with time alone",
          `This breed is ${b.alone <= 1 ? "very prone" : "prone"} to separation distress (${b.alone}/5 for coping alone); your answers mean about ${r1(need)}/5 is needed.`, ["presence"]);
      } else if (need >= 3 && b.alone >= 4) {
        o.pro("time", "Fine on its own for a while", `Copes with being alone better than most (${b.alone}/5).`, ["presence"]);
      }
    },
    function clingy(b, p, o) {
      if (!has(p, "clingy")) return;
      const c = p.vals.clingy;
      const velcro = (b.affection + (6 - b.alone)) / 2;
      if (c <= 0.34 && velcro >= 4.5) {
        o.con("time", 4, "A shadow that follows you everywhere", `Affection ${b.affection}/5 and very people-dependent. You said that would be too much.`, ["clingy"]);
      } else if (c >= 0.67 && b.affection <= 3) {
        o.con("time", 3 * (4 - b.affection), "More aloof than you'd like", `Affection with family ${b.affection}/5; it loves you on its own terms.`, ["clingy"]);
      } else if (c >= 0.67 && b.affection >= 5) {
        o.pro("time", "Affectionate and sticks close", `Affection with family ${b.affection}/5.`, ["clingy"]);
      }
    },
    function puppy(b, p, o) {
      if (!has(p, "puppy") || p.vals.puppy > 0.4) return;
      if (b.energy >= 4 && (b.trainability <= 3 || b.mental >= 4)) {
        o.con("time", 3, "A demanding puppyhood", "High-energy, busy-brained puppies are a lot of work. An adult dog from a rescue or breeder may suit you better.", ["puppy"]);
      }
    },
    function shedding(b, p, o) {
      if (!has(p, "shed")) return;
      const tol = lvlF(p.vals.shed, 1.5);
      const d = b.shedding - tol;
      if (d > 0.25) {
        o.con("upkeep", gap(d, 4), "Sheds more than you'd like", `Shedding ${b.shedding}/5 vs. your tolerance of about ${r1(tol)}/5.`, ["shed"]);
      } else if (tol <= 3 && b.shedding <= 2) {
        o.pro("upkeep", "Light shedder", `Shedding ${b.shedding}/5.`, ["shed"]);
      }
      if (has(p, "blowout") && p.vals.blowout <= 0.34 && b.coatType === "Double" && b.shedding >= 3) {
        o.con("upkeep", 4, "Blows its coat twice a year", "Double-coated: expect weeks of shedding in clumps each spring and fall.", ["blowout"]);
      }
    },
    function allergy(b, p, o) {
      const a = p.cats.allergy;
      if (!a || a.has("none")) return;
      if (a.has("severe")) {
        if (!b.lowAllergen) o.con("upkeep", 22, "Not a good bet for allergies", `Shedding ${b.shedding}/5, ${b.coatType.toLowerCase()} coat.`, ["allergy"]);
        else o.pro("upkeep", "Low-shedding coat, better for allergies", "No dog is truly hypoallergenic. Spend time with one before committing.", ["allergy"]);
      } else if (a.has("mild")) {
        if (b.shedding >= 4) o.con("upkeep", 8, "Heavy shedder, with allergies in the home", `Shedding ${b.shedding}/5.`, ["allergy"]);
        else if (b.shedding === 3) o.con("upkeep", 3, "Moderate shedder, with allergies in the home", `Shedding ${b.shedding}/5.`, ["allergy"]);
        else if (b.lowAllergen) o.pro("upkeep", "Low-shedding coat, better for allergies", "No dog is truly hypoallergenic, but this coat sheds little.", ["allergy"]);
      }
    },
    function grooming(b, p, o) {
      if (!has(p, "groom")) return;
      const tol = lvlF(p.vals.groom, 1.5);
      const d = b.grooming - tol;
      if (d > 0.25) {
        o.con("upkeep", gap(d, 3.5), "More grooming than you'd do", `Coat grooming ${b.grooming}/5 (${b.coatLength.toLowerCase()}, ${b.coatType.toLowerCase()} coat) vs. your ${r1(tol)}/5.`, ["groom"]);
      } else if (tol <= 2.5 && b.grooming <= 1) {
        o.pro("upkeep", "Wash-and-go coat", `Coat grooming ${b.grooming}/5.`, ["groom"]);
      }
      if (has(p, "proGroom") && b.proGrooming) {
        if (p.vals.proGroom <= 0.1) o.con("upkeep", 10, "Needs a professional groomer", "This coat needs clipping or trimming every few weeks, and you said that's not happening.", ["proGroom"]);
        else if (p.vals.proGroom <= 0.5) o.con("upkeep", 4, "Needs regular professional grooming", "Expect a groomer visit every 4-8 weeks.", ["proGroom"]);
      }
    },
    function drool(b, p, o) {
      if (!has(p, "drool")) return;
      const tol = lvlF(p.vals.drool, 1.5);
      const d = b.drool - tol;
      if (d > 0.25) o.con("upkeep", gap(d, 5), d >= 2 ? "A serious drooler" : "Drools more than you'd like", `Drooling ${b.drool}/5 vs. your ${r1(tol)}/5.`, ["drool"]);
      else if (tol <= 2 && b.drool <= 1) o.pro("upkeep", "Dry-mouthed", `Drooling ${b.drool}/5.`, ["drool"]);
    },
    function mess(b, p, o) {
      if (!has(p, "mess")) return;
      const tol = lvlF(p.vals.mess, 1.8);
      const m = messiness(b);
      const d = m - tol;
      if (d > 0.25) o.con("upkeep", gap(d, 2.5), "Messier than your home can take",
        `Size, coat, ${b.drool >= 3 ? "drool, " : ""}and energy add up to a mess level of about ${r1(m)}/5 vs. your ${r1(tol)}/5.`, ["mess"]);
      else if (tol <= 2 && m <= 2) o.pro("upkeep", "Tidy for a dog", "Small, with a coat that doesn't carry much mud in.", ["mess"]);
    },
    function specialCare(b, p, o) {
      if (!has(p, "care") || b.care === 0) return;
      const need = 2 + b.care * 1.5;
      const tol = lvl(p.vals.care);
      const d = need - tol;
      const what = b.brachy ? "face folds, eyes, and breathing" : /Shar-Pei|Mastiff|Bloodhound|Bordeaux|Bulldog|Basset/.test(b.name) ? "skin folds, droopy eyes, and ears" : b.care >= 2 ? "cords or long hair around the eyes and ears" : "ears and eyes";
      if (d > 0.25) o.con("upkeep", gap(d, 3), "Needs regular ear, eye, or skin-fold care", `Expect routine cleaning of its ${what}.`, ["care"]);
    },
    function budget(b, p, o) {
      if (!has(p, "budget")) return;
      const tol = lvlF(p.vals.budget, 1.8);
      const c = costLevel(b);
      const d = c - tol;
      const why = [b.size >= 4 && "a lot of food", b.health >= 4 && "higher vet bills", b.proGrooming && "regular grooming"].filter(Boolean);
      if (d > 0.25) o.con("upkeep", gap(d, 3.5), "Likely to cost more than your budget",
        `Cost level about ${r1(c)}/5 vs. your ${r1(tol)}/5${why.length ? ": " + why.join(", ") : ""}.`, ["budget"]);
      else if (tol <= 2 && c <= 2) o.pro("upkeep", "Inexpensive to keep", "Small, generally healthy, no groomer needed.", ["budget"]);
    },
    function healthLife(b, p, o) {
      const life = lifespanMid(b);
      const pri = has(p, "healthPri") ? p.vals.healthPri : 0;
      const issues = [];
      if (b.brachy) issues.push("flat-faced breathing problems");
      if (b.health >= 4 && !b.brachy) issues.push("serious common hereditary conditions");
      if (life <= 10) issues.push(`a short lifespan (${b.lifespan[0]}-${b.lifespan[1]} years)`);
      const pts = pri * ((b.health - 1) * 3 + Math.max(0, 12 - life) * 1.5);
      if (pts > 2) o.con("extras", pts, "Health and lifespan concerns", issues.length ? `Known for ${issues.join(" and ")}.` : `Health burden ${b.health}/5.`, ["healthPri"]);
      else if (pri >= 0.5 && b.health <= 1 && life >= 13) o.pro("extras", "Long-lived and generally robust", `Typically ${b.lifespan[0]}-${b.lifespan[1]} years.`, ["healthPri"]);
    },
    function handful(b, p, o) {
      if (!has(p, "handful")) return;
      const tol = lvlF(p.vals.handful, 2.2);
      const it = intensity(b);
      const d = it - tol;
      if (d > 0.25) o.con("household", gap(d, 3), "More intense than you want", `A strong-willed, high-drive dog (energy ${b.energy}, protectiveness ${b.protective}, trainability ${b.trainability}).`, ["handful"]);
      else if (tol <= 2 && it <= 2.5) o.pro("household", "Gentle and easy-going", "A calm, biddable temperament.", ["handful"]);
      else if (tol >= 4.5 && it >= 3.75) o.pro("household", "Plenty of character", "You wanted a handful, and you'll get one.", ["handful"]);
    },
    function kids(b, p, o) {
      const k = p.cats.kids;
      if (!k) return;
      if (k.has("young")) {
        if (b.kids <= 2) o.con("household", 25, "Not recommended with young children", `Rated ${b.kids}/5 for young children.`, ["kids"]);
        else if (b.kids === 3) o.con("household", 8, "Only OK with young children, with supervision", `Rated ${b.kids}/5 for young children.`, ["kids"]);
        else if (b.kids >= 5) o.pro("household", "Great with young children", `Rated ${b.kids}/5 for young children.`, ["kids"]);
        if (b.size >= 4 && b.energy >= 4) o.con("household", 3, "Big and bouncy around small kids", "It can knock a toddler over in play.", ["kids"]);
        if (b.size === 1) o.con("household", 3, "Fragile around small kids", "Toy breeds get hurt easily when dropped or stepped on.", ["kids"]);
      } else if (k.has("older")) {
        if (b.kids <= 2) o.con("household", 10, "Not great with children", `Rated ${b.kids}/5 for children.`, ["kids"]);
        else if (b.kids >= 5) o.pro("household", "Great with kids", `Rated ${b.kids}/5 for children.`, ["kids"]);
      }
    },
    function pets(b, p, o) {
      const s = p.cats.pets;
      if (!s || s.has("none")) return;
      if (s.has("cat")) {
        if (b.prey >= 5) o.con("household", 22, "Likely to chase or hurt a cat", `Prey drive ${b.prey}/5. Even a dog raised with a cat may not be safe with it.`, ["pets"]);
        else if (b.prey === 4) o.con("household", 11, "Risky with a cat", `Prey drive ${b.prey}/5. Needs careful introduction, ideally as a puppy.`, ["pets"]);
        else if (b.prey === 3) o.con("household", 3, "Usually fine with a cat if raised together", `Prey drive ${b.prey}/5.`, ["pets"]);
        else o.pro("household", "Generally good with cats", `Low prey drive (${b.prey}/5).`, ["pets"]);
      }
      if (s.has("small")) {
        if (b.prey >= 4) o.con("household", b.prey === 5 ? 24 : 15, "Danger to small pets", `Prey drive ${b.prey}/5. Rabbits, rodents, and birds look like prey.`, ["pets"]);
        else if (b.prey === 3) o.con("household", 6, "Keep small pets separated", `Prey drive ${b.prey}/5.`, ["pets"]);
      }
      if (s.has("dog")) {
        if (b.dogs <= 2) o.con("household", 16, "Often doesn't get along with other dogs", `Rated ${b.dogs}/5 with other dogs.`, ["pets"]);
        else if (b.dogs === 3) o.con("household", 4, "Can be selective about other dogs", `Rated ${b.dogs}/5 with other dogs.`, ["pets"]);
        else if (b.dogs >= 5) o.pro("household", "Gets on with other dogs", `Rated ${b.dogs}/5 with other dogs.`, ["pets"]);
      }
    },
    function visitors(b, p, o) {
      if (!has(p, "guard")) return;
      const g = p.vals.guard;
      if (g <= 0.15) {
        if (b.strangers <= 3) o.con("household", 4 * (4 - b.strangers) + (b.protective >= 5 ? 3 : 0), "Reserved with strangers",
          `Openness to strangers ${b.strangers}/5; you want a dog that loves everyone.`, ["guard"]);
        else if (b.strangers >= 5) o.pro("household", "Loves everybody", `Openness to strangers ${b.strangers}/5.`, ["guard"]);
      } else if (g <= 0.4) {
        if (b.strangers <= 2) o.con("household", 4 * (3 - b.strangers), "Wary of strangers", `Openness to strangers ${b.strangers}/5; needs a lot of socialization to be polite.`, ["guard"]);
      } else if (g >= 0.9) {
        if (b.protective >= 4) o.pro("household", "A natural watchdog", `Protectiveness ${b.protective}/5.`, ["guard"]);
        else if (b.protective <= 2) o.con("household", 3, "Not much of a watchdog", `Protectiveness ${b.protective}/5. It's more likely to greet a burglar than stop one.`, ["guard"]);
      }
    },
    function barking(b, p, o) {
      if (!has(p, "noise")) return;
      const tol = lvlF(p.vals.noise, 1.5);
      const d = b.barking - tol;
      if (d > 0.25) o.con("household", gap(d, 4), d >= 2 ? "Very vocal for your situation" : "Barks more than you'd like", `Barking ${b.barking}/5 vs. your tolerance (and your neighbors') of about ${r1(tol)}/5.`, ["noise"]);
      else if (tol <= 2.5 && b.barking <= 2) o.pro("household", "A quiet breed", `Barking ${b.barking}/5.`, ["noise"]);
    },
    function chase(b, p, o) {
      if (!has(p, "chase")) return;
      const tol = lvlF(p.vals.chase, 1.5);
      const d = b.prey - tol;
      if (d > 0.25) o.con("household", gap(d, 3.5), "Strong urge to chase", `Prey drive ${b.prey}/5 vs. your ${r1(tol)}/5. Squirrels, cats, and bikes will test your grip on the leash.`, ["chase"]);
    },
    function pull(b, p, o) {
      if (!has(p, "pull")) return;
      const tol = lvlF(p.vals.pull, 1.8);
      const pl = pulling(b);
      const d = pl - tol;
      if (d > 0.25) o.con("household", gap(d, 3), d >= 2 ? "Strong enough to pull you over" : "A strong puller", `${b.weightLb[0]}-${b.weightLb[1]} lb with energy ${b.energy}/5 and prey drive ${b.prey}/5.`, ["pull"]);
    },
    function climate(b, p, o) {
      const c = p.cats.climate;
      if (!c) return;
      if (c.has("hot")) {
        if (b.heat <= 1) o.con("extras", 12, "Can't handle hot summers", b.brachy ? "Flat-faced dogs overheat dangerously easily." : "A heavy coat built for cold climates.", ["climate"]);
        else if (b.heat === 2) o.con("extras", 5, "Struggles in the heat", "Needs air conditioning and walks at dawn or dusk in summer.", ["climate"]);
        else if (b.heat >= 5) o.pro("extras", "Built for heat", "A breed from a hot climate.", ["climate"]);
      }
      if (c.has("cold")) {
        if (b.cold <= 1) o.con("extras", 4, "Needs a coat in winter", "Small or thin-coated; feels the cold badly.", ["climate"]);
        else if (b.cold >= 5) o.pro("extras", "Loves the cold", "A coat made for snow.", ["climate"]);
      }
    },
    function cuddle(b, p, o) {
      if (!has(p, "cuddle")) return;
      if (p.vals.cuddle >= 0.67 && b.size <= 2 && b.affection >= 4) o.pro("home", "A sofa and bed companion", "Small and cuddly.", ["cuddle"]);
      if (p.vals.cuddle >= 0.9 && b.size >= 5) o.con("home", 2, "A giant to share the bed with", `${b.weightLb[1]} lb takes up most of a queen bed.`, ["cuddle"]);
    },
  ];

  const AREA_OF_FOCUS = { activity: "activity", brains: "brains", home: "home", time: "time", upkeep: "upkeep", household: "household", extras: "extras" };

  function scoreBreed(b, profile) {
    const pros = [], cons = [];
    const quote = (vars) => vars.flatMap((v) => profile.sources[v] || []).slice(0, 3);
    const weightOf = (area) => (profile.focus.has(AREA_OF_FOCUS[area]) ? FOCUS_WEIGHT : 1);
    const out = {
      con(area, pts, title, detail, vars) {
        if (pts <= 0) return;
        const w = pts * weightOf(area);
        cons.push({ area, pts: w, title, detail, quotes: quote(vars), severity: w >= 15 ? "serious" : w >= 6 ? "moderate" : "minor" });
      },
      pro(area, title, detail, vars) {
        pros.push({ area, title, detail, quotes: quote(vars), boosted: weightOf(area) > 1 });
      },
    };
    for (const check of CHECKS) check(b, profile, out);
    cons.sort((a, b) => b.pts - a.pts);
    pros.sort((a, b) => b.boosted - a.boosted);
    const penalty = cons.reduce((s, c) => s + c.pts, 0);
    return {
      breed: b,
      fit: Math.round(100 * Math.exp(-penalty / SCALE)),
      penalty,
      pros,
      cons,
      serious: cons.filter((c) => c.severity === "serious").length,
    };
  }

  function rankBreeds(breeds, profile) {
    const res = breeds.map((b) => scoreBreed(b, profile));
    res.sort((a, b) => a.penalty - b.penalty || (a.breed.popularity || 999) - (b.breed.popularity || 999));
    res.forEach((r, i) => (r.rank = i + 1));
    return res;
  }

  // Your tolerance for the trait rows shown in the comparison panel, on the 1-5 scale.
  function tolerances(profile) {
    const v = profile.vals;
    const t = {};
    if (v.exercise !== undefined) t.energy = lvlF(v.exercise, 1.6);
    if (v.mental !== undefined) t.mental = lvlF(v.mental, 2);
    if (v.noise !== undefined) t.barking = lvlF(v.noise, 1.5);
    if (v.shed !== undefined) t.shedding = lvlF(v.shed, 1.5);
    if (v.groom !== undefined) t.grooming = lvlF(v.groom, 1.5);
    if (v.drool !== undefined) t.drool = lvlF(v.drool, 1.5);
    if (v.chase !== undefined) t.prey = lvlF(v.chase, 1.5);
    if (v.presence !== undefined) t.alone = 1 + 3.5 * (1 - v.presence);
    return t;
  }

  window.DogScoring = { buildProfile, scoreBreed, rankBreeds, tolerances, lvl };
})();

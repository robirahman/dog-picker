// UI for the quiz and results. Plain DOM, no framework; everything renders from `state`.
(function () {
  const { buildProfile, rankBreeds, tolerances } = window.DogScoring;
  const BREEDS = window.BREEDS;
  const QUESTIONS = window.QUESTIONS;
  const SECTIONS = window.SECTIONS;
  const STORE_KEY = "dog-breed-ranker-v1";
  const SIZE_NAMES = ["", "Toy", "Small", "Medium", "Large", "Giant"];
  const AREA_NAMES = Object.fromEntries(SECTIONS.map((s) => [s.id, s.name]));

  // An example profile for the start page, so it shows what the results look like.
  const EXAMPLE = {
    label: "Example: apartment, first dog, out 5-6 hours a day, thin walls",
    answers: { walk: 1, hour: 1, sport: 0, trained: 0, obey: 1, job: 1, hometype: 0, yard: 1, stairs: 2, neighbors: 0,
      alone: 1, follow: 2, hair: 1, brush: 2, drool: 0, budget: 1, people: 2, pets: [3], intensity: 1, visitors: 1,
      bark: 1, allergy: 0, sizes: [1, 2], health: 1, focus: [] },
  };

  const state = {
    view: "intro",
    mode: "full",
    answers: {},
    idx: 0,
    open: new Set(),
    filters: { q: "", size: "", group: "", hideSerious: false, cross: true },
  };

  // ---------- persistence (per-browser convenience only) ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ mode: state.mode, answers: state.answers, idx: state.idx, view: state.view === "intro" ? "intro" : state.view }));
    } catch (e) { /* storage unavailable: the app still works for this visit */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      state.mode = s.mode === "quick" ? "quick" : "full";
      state.answers = s.answers && typeof s.answers === "object" ? s.answers : {};
      state.idx = Number.isInteger(s.idx) ? s.idx : 0;
    } catch (e) { /* ignore */ }
  }

  // ---------- helpers ----------
  const app = document.getElementById("app");
  const nav = document.getElementById("topnav");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = () => (state.mode === "quick" ? QUESTIONS.filter((q) => q.core) : QUESTIONS);
  const answeredCount = () => qs().filter((q) => isAnswered(q)).length;
  function isAnswered(q) {
    const a = state.answers[q.id];
    return a !== undefined && !(Array.isArray(a) && a.length === 0);
  }
  const initials = (name) => name.replace(/\(.*\)/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");

  function thumb(b, inner = "") {
    return `<div class="thumb"><img src="${esc(b.image)}" alt="${esc(b.name)}" loading="lazy" decoding="async"><span class="ph" hidden>${esc(initials(b.name))}</span>${inner}</div>`;
  }
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.parentElement?.classList.contains("thumb")) {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    }
  }, true);

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function weightText(b) {
    return `${b.weightLb[0]}–${b.weightLb[1]} lb`;
  }
  function lifeText(b) {
    return b.lifespan ? `${b.lifespan[0]}–${b.lifespan[1]} yrs` : "";
  }
  function tone(fit) {
    return fit >= 75 ? "var(--good)" : fit >= 50 ? "var(--accent)" : fit >= 30 ? "var(--warn)" : "var(--bad)";
  }

  let rankCache = { key: null, res: null };
  function ranking() {
    const key = JSON.stringify(state.answers);
    if (rankCache.key !== key) rankCache = { key, res: rankBreeds(BREEDS, buildProfile(state.answers)) };
    return rankCache.res;
  }

  // ---------- navigation ----------
  function go(view) {
    state.view = view;
    save();
    render();
    window.scrollTo({ top: 0 });
  }
  function renderNav() {
    const has = Object.keys(state.answers).length > 0;
    const items = [];
    if (state.view !== "results" && has) items.push(`<button class="btn sm" data-go="results">My ranking</button>`);
    if (state.view !== "review" && has) items.push(`<button class="btn sm ghost" data-go="review">Edit answers</button>`);
    nav.innerHTML = items.join("");
  }
  document.getElementById("brand").addEventListener("click", () => go("intro"));

  // ---------- intro ----------
  function renderIntro() {
    const ex = rankBreeds(BREEDS, buildProfile(EXAMPLE.answers)).slice(0, 3);
    const has = Object.keys(state.answers).length > 0;
    const nFull = QUESTIONS.length, nQuick = QUESTIONS.filter((q) => q.core).length;
    app.innerHTML = `
      <section class="intro">
        <div>
          <p class="eyebrow">${BREEDS.length} breeds · ${nFull} questions</p>
          <h1>Every dog breed, <em>ranked for your life</em>.</h1>
          <p class="lede">Answer questions about your days, your home, and your patience for hair and barking. You get the whole list in order, with the reasons each breed fits you or doesn't.</p>
          <div class="ctas">
            ${has ? `<button class="btn primary" data-act="resume">Continue (${answeredCount()} of ${qs().length} answered)</button>` : ""}
            <button class="btn ${has ? "" : "primary"}" data-act="start-full">${has ? "Start over: full quiz" : "Take the full quiz"} · ${nFull}</button>
            <button class="btn" data-act="start-quick">Quick version · ${nQuick}</button>
          </div>
          <div class="facts">
            <div><b class="num">${BREEDS.length}</b><span>AKC breeds plus 5 popular doodle crosses, all ranked</span></div>
            <div><b class="num">30</b><span>separate checks, each explained in plain words</span></div>
            <div><b class="num">~8 min</b><span>for the full quiz; the quick one takes about 4</span></div>
          </div>
          <div class="diffs">
            <h2>How the ranking works</h2>
            <ul>
              <li><b>Specific traits, not buckets.</b> Your answers map to concrete breed ratings: energy, barking, shedding, drool, prey drive, coping alone, trainability, and more.</li>
              <li><b>Reasons you can check.</b> Every plus and minus quotes the answers that caused it.</li>
              <li><b>Dealbreakers count.</b> A cat at home, a toddler, allergies, or hot summers can sink a breed that's otherwise perfect.</li>
              <li><b>You pick what matters.</b> The last question lets you count two areas extra.</li>
            </ul>
          </div>
        </div>
        <aside class="sample" aria-label="Example results">
          <p class="eyebrow">What you'll get</p>
          <h2>${esc(EXAMPLE.label)}</h2>
          ${ex.map((r) => `
            <div class="sample-row">
              ${thumb(r.breed)}
              <div style="min-width:0">
                <h3>${r.rank}. ${esc(r.breed.name)}</h3>
                <p>${r.pros[0] ? `<span class="pro-line">${esc(r.pros[0].title)}</span>` : ""}</p>
                <p>${r.cons[0] ? `<span class="con-line">${esc(r.cons[0].title)}</span>` : ""}</p>
              </div>
              <span class="fit">${r.fit}<small>%</small></span>
            </div>`).join("")}
          <p class="why">…and ${BREEDS.length - 3} more, down to the worst fit, each with full reasons.</p>
        </aside>
      </section>`;
  }

  // ---------- quiz ----------
  function startQuiz(mode, fresh) {
    state.mode = mode;
    if (fresh) state.answers = {};
    state.idx = 0;
    if (!fresh) {
      const list = qs();
      const firstOpen = list.findIndex((q) => !isAnswered(q));
      state.idx = firstOpen === -1 ? list.length - 1 : firstOpen;
    }
    go("quiz");
  }

  function renderQuiz() {
    const list = qs();
    state.idx = Math.max(0, Math.min(state.idx, list.length - 1));
    const q = list[state.idx];
    const sec = SECTIONS.find((s) => s.id === q.section);
    const firstOfSection = state.idx === 0 || list[state.idx - 1].section !== q.section;
    const cur = state.answers[q.id];
    const picked = (i) => (Array.isArray(cur) ? cur.includes(i) : cur === i);
    const segs = SECTIONS.map((s) => {
      const inSec = list.filter((x) => x.section === s.id);
      if (!inSec.length) return "";
      const done = inSec.filter(isAnswered).length;
      return `<div class="seg" style="--n:${inSec.length}" title="${esc(s.name)}"><i style="--p:${(100 * done) / inSec.length}%"></i></div>`;
    }).join("");
    const last = state.idx === list.length - 1;
    app.innerHTML = `
      <section class="quiz">
        <div class="progress" aria-hidden="true">${segs}</div>
        <div class="qmeta">
          <span><b>${esc(sec.name)}</b></span>
          <span class="num">${state.idx + 1} / ${list.length}${state.mode === "quick" ? " · quick" : ""}</span>
        </div>
        <div class="qcard">
          ${firstOfSection ? `<p class="section-intro">${esc(sec.blurb)}</p>` : ""}
          <h2 id="qtext">${esc(q.text)}</h2>
          ${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ""}
          <div class="options" role="group" aria-labelledby="qtext">
            ${q.options.map((o, i) => `
              <button class="opt" type="button" data-opt="${i}" aria-pressed="${picked(i)}">
                <span class="key">${i + 1}</span><span>${esc(o[0])}</span>
              </button>`).join("")}
          </div>
        </div>
        <div class="qnav">
          <button class="btn ghost" data-act="back" ${state.idx === 0 ? "disabled" : ""}>← Back</button>
          <div class="right">
            ${answeredCount() >= 8 && !last ? `<button class="btn ghost" data-act="finish">See ranking so far</button>` : ""}
            ${q.multi ? "" : `<button class="btn ghost" data-act="skip">${last ? "Skip and finish" : "Not sure, skip"}</button>`}
            ${q.multi || last ? `<button class="btn primary" data-act="next">${last ? "See my ranking" : "Continue"}</button>` : ""}
          </div>
        </div>
      </section>`;
  }

  function choose(i) {
    const list = qs();
    const q = list[state.idx];
    if (!q.options[i]) return;
    if (q.multi) {
      let cur = Array.isArray(state.answers[q.id]) ? [...state.answers[q.id]] : [];
      const exclusive = (j) => /^(None|No preference)$/.test(q.options[j][0]);
      if (cur.includes(i)) cur = cur.filter((x) => x !== i);
      else if (exclusive(i)) cur = [i];
      else {
        cur = cur.filter((x) => !exclusive(x));
        if (q.max && cur.length >= q.max) cur.shift();
        cur.push(i);
      }
      state.answers[q.id] = cur;
      save();
      renderQuiz();
    } else {
      state.answers[q.id] = i;
      save();
      renderQuiz();
      setTimeout(() => advance(), 160);
    }
  }
  function advance() {
    if (state.view !== "quiz") return;
    if (state.idx >= qs().length - 1) return go("results");
    state.idx++;
    save();
    renderQuiz();
  }

  // ---------- results ----------
  function globalNotes() {
    const a = state.answers, n = [];
    if (a.alone === 0) n.push("<b>Eight or more hours alone:</b> that's long for any breed. Even the most independent dogs on this list will need a midday walker or daycare.");
    if (a.puppy === 0) n.push("<b>No time for a puppy:</b> look at adult dogs from breed rescues or retired breeding and show dogs. Adult temperament is also easier to judge.");
    if (a.allergy === 2) n.push("<b>Significant allergies:</b> no breed is truly hypoallergenic. Spend real time with the breed (ideally the individual dog) before committing.");
    if (a.people === 0) n.push("<b>Young children:</b> the kid ratings are breed tendencies. Supervise every interaction regardless of breed.");
    return n;
  }

  function filtered(res) {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    return res.filter((r) => {
      const b = r.breed;
      if (q && !b.name.toLowerCase().includes(q) && !b.group.toLowerCase().includes(q)) return false;
      if (f.size && String(b.size) !== f.size) return false;
      if (f.group && b.group !== f.group) return false;
      if (f.hideSerious && r.serious > 0) return false;
      if (!f.cross && b.crossbreed) return false;
      return true;
    });
  }

  const ROSETTE = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1l3.6 4.4 5.5-1.6.9 5.6 5.4 2-2.4 5.2 3 4.9-5 2.7.2 5.7-5.7-.4-2.8 5-4.7-3.3-4.7 3.3-2.8-5-5.7.4.2-5.7-5-2.7 3-4.9-2.4-5.2 5.4-2 .9-5.6 5.5 1.6z"/></svg>`;

  function gist(r, n = 2) {
    const items = [];
    r.cons.slice(0, n).forEach((c) => items.push(`<span class="tag ${c.severity}">${esc(c.title)}</span>`));
    if (items.length < n) r.pros.slice(0, n - items.length).forEach((p) => items.push(`<span class="tag good">${esc(p.title)}</span>`));
    return items.join("");
  }

  function podiumCard(r) {
    const b = r.breed;
    const rib = r.rank <= 3 ? `<span class="rosette r${r.rank}">${ROSETTE}<b>${r.rank}</b></span>` : "";
    return `
      <button class="pcard" type="button" data-jump="${esc(b.id)}">
        ${thumb(b, rib)}
        <div class="body">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
            <h3>${esc(b.name)}</h3><span class="fit">${r.fit}<small>%</small></span>
          </div>
          <div class="meter" style="--w:${r.fit}%;--tone:${tone(r.fit)}"><i></i></div>
          <div class="sub">${esc(b.group)} · ${weightText(b)} · ${lifeText(b)}</div>
          <ul>
            ${r.pros.slice(0, 2).map((p) => `<li class="pro-line">${esc(p.title)}</li>`).join("")}
            ${r.cons.slice(0, 2).map((c) => `<li class="con-line">${esc(c.title)}</li>`).join("")}
          </ul>
        </div>
      </button>`;
  }

  function quoteLine(quotes) {
    if (!quotes || !quotes.length) return "";
    return `<div class="said">You said: ${quotes.map((x) => `${esc(x.q)} <q>${esc(x.a)}</q>`).join(" · ")}</div>`;
  }

  const COMPARE_ROWS = [
    ["energy", "Energy"], ["mental", "Needs a job"], ["barking", "Barking"], ["shedding", "Shedding"],
    ["grooming", "Grooming"], ["drool", "Drool"], ["prey", "Prey drive"],
  ];

  function detailHTML(r) {
    const b = r.breed;
    const tol = tolerances(buildProfile(state.answers));
    const c = b.imageCredit;
    const rows = COMPARE_ROWS.map(([k, label]) => {
      const v = b[k];
      const y = tol[k];
      // A breed level counts against you when it exceeds your limit by more than a quarter point.
      const dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? "on" : ""} ${i <= v && y !== undefined && i - y > 0.25 ? "over" : ""}"></i>`).join("");
      return `<span class="lab">${label}</span><span class="dots">${dots}${y !== undefined ? `<span class="you" style="--y:${Math.min(5, Math.floor(y + 0.25))}" title="Your limit: about ${y.toFixed(1)}"></span>` : ""}</span><span class="val">${v}/5${y !== undefined ? ` · you ≈${(Math.round(y * 2) / 2).toFixed(1)}` : ""}</span>`;
    });
    // Coping alone runs the other way: the breed should be at or above what you need.
    const need = tol.alone;
    rows.push(`<span class="lab">Copes alone</span><span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= b.alone ? "on" : ""}"></i>`).join("")}${need !== undefined ? `<span class="you" style="--y:${Math.min(5, Math.ceil(need - 0.25))}" title="You need about ${need.toFixed(1)}"></span>` : ""}</span><span class="val">${b.alone}/5${need !== undefined ? ` · need ≈${(Math.round(need * 2) / 2).toFixed(1)}` : ""}</span>`);
    rows.push(`<span class="lab">Trainability</span><span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= b.trainability ? "on" : ""}"></i>`).join("")}</span><span class="val">${b.trainability}/5</span>`);
    rows.push(`<span class="lab">Good w/ young kids</span><span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= b.kids ? "on" : ""}"></i>`).join("")}</span><span class="val">${b.kids}/5</span>`);
    rows.push(`<span class="lab">Good w/ dogs</span><span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= b.dogs ? "on" : ""}"></i>`).join("")}</span><span class="val">${b.dogs}/5</span>`);

    return `
      <div class="detail">
        <div>
          ${thumb(b)}
          ${c ? `<p class="credit">Photo: ${c.author ? esc(c.author) + ", " : ""}${c.license ? esc(c.license) + ", " : ""}<a href="${esc(c.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></p>` : ""}
          <dl class="stats">
            <dt>Group</dt><dd>${esc(b.group)}${b.crossbreed ? " (not AKC-recognized; traits are estimates)" : ""}</dd>
            <dt>Size</dt><dd>${SIZE_NAMES[b.size]}, ${weightText(b)}${b.heightIn ? `, ${b.heightIn[0]}–${b.heightIn[1]} in` : ""}</dd>
            <dt>Lifespan</dt><dd>${lifeText(b) || "–"}</dd>
            <dt>Coat</dt><dd>${esc(b.coatLength)}, ${esc(b.coatType.toLowerCase())}${b.lowAllergen ? " · low-shedding" : ""}${b.proGrooming ? " · needs a groomer" : ""}</dd>
            <dt>Temperament</dt><dd>${esc(b.temperament)}</dd>
            ${b.popularity ? `<dt>Popularity</dt><dd>#${b.popularity} in the US (AKC, 2020)</dd>` : ""}
          </dl>
          <div class="links">
            ${b.akcUrl ? `<a class="btn sm" href="${esc(b.akcUrl)}" target="_blank" rel="noopener">AKC page</a>` : ""}
            ${b.wikiUrl ? `<a class="btn sm" href="${esc(b.wikiUrl)}" target="_blank" rel="noopener">Wikipedia</a>` : ""}
          </div>
        </div>
        <div style="min-width:0;display:grid;gap:var(--s-5);align-content:start">
          <div class="reasons">
            <div>
              <h4>Why it could work</h4>
              ${r.pros.length ? r.pros.map((p) => `<div class="reason"><div class="t">${esc(p.title)}${p.boosted ? ` <span class="tag good">matters to you</span>` : ""}</div><p>${esc(p.detail)}</p>${quoteLine(p.quotes)}</div>`).join("") : `<p class="empty">Nothing stands out as a particular match.</p>`}
            </div>
            <div>
              <h4>What to weigh</h4>
              ${r.cons.length ? r.cons.map((c) => `<div class="reason"><div class="t">${esc(c.title)} <span class="tag ${c.severity}">${c.severity}</span></div><p>${esc(c.detail)}</p>${quoteLine(c.quotes)}</div>`).join("") : `<p class="empty">No conflicts with your answers.</p>`}
            </div>
          </div>
          <div class="compare">
            <h4>Breed ratings vs. your answers</h4>
            <div class="ctable">${rows.join("")}</div>
            <div class="legend"><span><span class="you-k"></span>your limit (or, for coping alone, what you need)</span><span><span class="over-k"></span>over your limit</span></div>
          </div>
        </div>
      </div>`;
  }

  function rowHTML(r) {
    const b = r.breed;
    const open = state.open.has(b.id);
    return `
      <div class="row" id="b-${esc(b.id)}">
        <button type="button" data-toggle="${esc(b.id)}" aria-expanded="${open}">
          <span class="rank">${r.rank}</span>
          ${thumb(b)}
          <span style="min-width:0">
            <h3>${esc(b.name)} ${b.crossbreed ? `<span class="tag cross">crossbreed</span>` : ""}</h3>
            <span class="sub">${esc(b.group)} · ${SIZE_NAMES[b.size]}, ${weightText(b)} · ${lifeText(b)}</span>
            <span class="gist">${gist(r)}</span>
          </span>
          <span class="score"><span class="fit">${r.fit}<small>% fit</small></span><span class="meter" style="--w:${r.fit}%;--tone:${tone(r.fit)}"><i></i></span></span>
        </button>
        ${open ? detailHTML(r) : ""}
      </div>`;
  }

  function renderResults() {
    const res = ranking();
    const list = filtered(res);
    const profile = buildProfile(state.answers);
    const n = Object.keys(state.answers).length;
    const focus = [...profile.focus].map((f) => AREA_NAMES[f]).filter(Boolean);
    const groups = [...new Set(BREEDS.map((b) => b.group))].sort();
    const podium = list.slice(0, 3);
    const rest = list.slice(3);
    const f = state.filters;
    const notes = globalNotes();
    app.innerHTML = `
      <section>
        <div class="res-head">
          <div>
            <p class="eyebrow">Based on ${n} answer${n === 1 ? "" : "s"}${focus.length ? ` · counting extra: ${focus.map(esc).join(", ")}` : ""}</p>
            <h1>Your ranking</h1>
            <p>Fit starts at 100% and drops with each conflict between a breed and your answers. Serious conflicts cost the most. Open any breed to see every reason.</p>
          </div>
          <div class="res-actions">
            <button class="btn sm" data-act="copy">Copy top 10</button>
            <button class="btn sm" data-go="review">Edit answers</button>
            ${state.mode === "quick" ? `<button class="btn sm" data-act="upgrade">Answer the full quiz</button>` : ""}
          </div>
        </div>
        ${notes.length ? `<div class="notes">${notes.map((x) => `<div class="note">${x}</div>`).join("")}</div>` : ""}
        <div class="filters" role="search">
          <input type="search" id="f-q" placeholder="Search breeds or groups" value="${esc(f.q)}" aria-label="Search breeds">
          <select id="f-size" aria-label="Size">
            <option value="">Any size</option>
            ${[1, 2, 3, 4, 5].map((s) => `<option value="${s}" ${f.size === String(s) ? "selected" : ""}>${SIZE_NAMES[s]}</option>`).join("")}
          </select>
          <select id="f-group" aria-label="Group">
            <option value="">Any group</option>
            ${groups.map((g) => `<option ${f.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}
          </select>
          <label class="chk"><input type="checkbox" id="f-serious" ${f.hideSerious ? "checked" : ""}> Hide serious conflicts</label>
          <label class="chk"><input type="checkbox" id="f-cross" ${f.cross ? "checked" : ""}> Include doodles</label>
          <span class="count num">${list.length} of ${res.length}</span>
        </div>
        ${podium.length ? `<div class="podium">${podium.map(podiumCard).join("")}</div>` : `<p class="empty" style="margin-top:1rem">No breeds match these filters.</p>`}
        <div class="list">
          ${podium.map(rowHTML).join("")}
          ${rest.map(rowHTML).join("")}
        </div>
        <textarea class="copybox" id="copybox" hidden readonly aria-label="Ranking text"></textarea>
      </section>`;
  }

  function copyTop() {
    const res = ranking().slice(0, 10);
    const text = "My dog breed ranking (Dog Breed Ranker)\n\n" + res.map((r) =>
      `${r.rank}. ${r.breed.name} — ${r.fit}% fit` +
      (r.pros.length ? `\n   + ${r.pros.slice(0, 3).map((p) => p.title).join("; ")}` : "") +
      (r.cons.length ? `\n   – ${r.cons.slice(0, 3).map((c) => c.title).join("; ")}` : "")).join("\n");
    const box = document.getElementById("copybox");
    const fallback = () => {
      box.value = text;
      box.hidden = false;
      box.focus();
      box.select();
      toast("Select all and copy the text below");
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast("Top 10 copied"), fallback);
    } catch (e) {
      fallback();
    }
  }

  // ---------- review answers ----------
  function renderReview() {
    app.innerHTML = `
      <section class="review">
        <h1>Your answers</h1>
        <p class="hint" style="color:var(--muted)">Change anything; the ranking updates immediately. Unanswered questions are simply left out of the scoring.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn primary" data-go="results">See my ranking</button>
          <button class="btn" data-act="reset">Clear all answers</button>
        </div>
        ${SECTIONS.map((s) => `
          <section>
            <h2>${esc(s.name)}</h2>
            ${QUESTIONS.filter((q) => q.section === s.id).map((q) => {
              const cur = state.answers[q.id];
              return `<div class="rq"><p>${esc(q.text)}${q.core ? "" : ` <span class="tag minor">full quiz</span>`}</p><div class="chips">
                ${q.options.map((o, i) => `<button class="chip" type="button" data-q="${q.id}" data-i="${i}" aria-pressed="${Array.isArray(cur) ? cur.includes(i) : cur === i}">${esc(o[0])}</button>`).join("")}
              </div></div>`;
            }).join("")}
          </section>`).join("")}
        <div style="margin-top:24px"><button class="btn primary" data-go="results">See my ranking</button></div>
      </section>`;
  }

  function reviewToggle(qid, i) {
    const q = QUESTIONS.find((x) => x.id === qid);
    const cur = state.answers[qid];
    if (q.multi) {
      let arr = Array.isArray(cur) ? [...cur] : [];
      const exclusive = (j) => /^(None|No preference)$/.test(q.options[j][0]);
      if (arr.includes(i)) arr = arr.filter((x) => x !== i);
      else if (exclusive(i)) arr = [i];
      else { arr = arr.filter((x) => !exclusive(x)); if (q.max && arr.length >= q.max) arr.shift(); arr.push(i); }
      state.answers[qid] = arr;
    } else if (cur === i) {
      delete state.answers[qid];
    } else {
      state.answers[qid] = i;
    }
    save();
    const y = window.scrollY;
    renderReview();
    window.scrollTo({ top: y });
  }

  // ---------- events ----------
  app.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-go]");
    if (!t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.opt !== undefined) return choose(Number(t.dataset.opt));
    if (t.dataset.q) return reviewToggle(t.dataset.q, Number(t.dataset.i));
    if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      state.open.has(id) ? state.open.delete(id) : state.open.add(id);
      const r = ranking().find((x) => x.breed.id === id);
      const row = document.getElementById("b-" + id);
      if (row && r) row.outerHTML = rowHTML(r);
      return;
    }
    if (t.dataset.jump) {
      const id = t.dataset.jump;
      state.open.add(id);
      const r = ranking().find((x) => x.breed.id === id);
      const row = document.getElementById("b-" + id);
      if (row && r) {
        row.outerHTML = rowHTML(r);
        document.getElementById("b-" + id).scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    switch (t.dataset.act) {
      case "start-full": return startQuiz("full", true);
      case "start-quick": return startQuiz("quick", true);
      case "resume": return startQuiz(state.mode, false);
      case "upgrade": return startQuiz("full", false);
      case "back": state.idx = Math.max(0, state.idx - 1); save(); return renderQuiz();
      case "skip": {
        const q = qs()[state.idx];
        delete state.answers[q.id];
        save();
        if (state.idx >= qs().length - 1) return go("results");
        return advance();
      }
      case "next": return state.idx >= qs().length - 1 ? go("results") : advance();
      case "finish": return go("results");
      case "copy": return copyTop();
      case "reset": state.answers = {}; state.idx = 0; save(); return renderReview();
    }
  });
  nav.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (t) go(t.dataset.go);
  });
  app.addEventListener("input", (e) => {
    const f = state.filters;
    if (e.target.id === "f-q") f.q = e.target.value;
    else if (e.target.id === "f-size") f.size = e.target.value;
    else if (e.target.id === "f-group") f.group = e.target.value;
    else if (e.target.id === "f-serious") f.hideSerious = e.target.checked;
    else if (e.target.id === "f-cross") f.cross = e.target.checked;
    else return;
    const pos = e.target.id === "f-q" ? e.target.selectionStart : null;
    renderResults();
    const el = document.getElementById(e.target.id);
    if (el) {
      el.focus();
      if (pos !== null) el.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (state.view !== "quiz" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) { e.preventDefault(); choose(n - 1); }
    else if (e.key === "ArrowLeft" || e.key === "Backspace") { e.preventDefault(); if (state.idx > 0) { state.idx--; save(); renderQuiz(); } }
    else if (e.key === "Enter" && qs()[state.idx].multi) { e.preventDefault(); advance(); }
  });

  function render() {
    renderNav();
    if (state.view === "quiz") renderQuiz();
    else if (state.view === "results") renderResults();
    else if (state.view === "review") renderReview();
    else renderIntro();
  }

  load();
  render();
})();

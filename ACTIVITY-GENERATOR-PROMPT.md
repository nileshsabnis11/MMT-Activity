# Interactive Classroom Activity Generator — Master Prompt

> **How to use this file with ANY AI tool (ChatGPT, Gemini, Claude, Copilot, etc.)**
>
> 1. Copy **everything** in this file (from the line below down to the end).
> 2. Paste it into the AI chat as your first message.
> 3. Then add your topic material and request, for example:
>    *"Here are my lecture notes on Shape Memory Alloys. Generate a Type B (Detective Quiz) activity."*
>    (You can paste notes, upload a PPT, or just describe the topic.)
> 4. The AI will return one complete, ready-to-open `.html` file.
>
> The Firebase backend, college branding, copyright line, student gate, scoring, and design system
> are all baked in below — so any AI produces the SAME quality and format every time.
> Nothing else needs to be configured.

---

You create self-contained HTML interactive activities for classroom use. The user provides topic materials (PPTs, notes, lecture content) and you produce one or more HTML files.

**AI decides questions and content** based on the topic provided. The user picks which TYPE(s) to generate. If the user doesn't specify, suggest 2-3 types that best fit the topic.

## COLLEGE INFO (always embed these)
```
const COLLEGE_NAME = "Rajarambapu Institute of Technology";
const DEPARTMENT   = "Robotics and Automation";
```

## BACKEND — Firebase Realtime Database (the ONLY database)
Results are written to **Firebase Realtime Database** (node `submissions`). There is **no Google
Sheet and no Apps Script** anymore — do not generate any `results_collector.gs`, webhook URL,
or `?action=...` endpoint. The Firebase config and SDK calls live inside `mmt-utils.js`; each
activity only needs (a) the two Firebase `<script>` tags from **Head Includes** and (b) the
`mmt-utils.js` include.

`MMT.submitResult(dbEnabled, payload)` writes one row (a `push()` under the `submissions` node)
to the Realtime Database. Its **first argument is a
legacy enable-switch — it must be TRUTHY or the write is skipped.** Define one constant and
reuse it everywhere (any truthy value works; `true` is clearest):
```javascript
const DB_ENABLED = true;                                  // Firebase is the database — keep truthy
if (window.MMT) window.MMT._autoFlushUrl = DB_ENABLED;    // resend any queued results on load
function submitResult(payload) {
  return MMT.submitResult(DB_ENABLED, payload);
}
```
Everywhere below that shows `MMT.submitResult(null, payload)`, pass `DB_ENABLED` instead —
`null` is a no-op that silently records nothing.

## COPYRIGHT FOOTER (always include on every generated HTML)
Add this line immediately before `</body>` in every activity file:
```html
<div class="cr-copyright" style="text-align:center;padding:12px 16px;font-size:12px;color:#64748b;font-family:system-ui,Segoe UI,Arial,sans-serif;">&copy; 2026 Prof. Nilesh Vijay Sabnis (9890880549)</div>
```

> ⚠️ **CRITICAL LAYOUT RULE — do not skip.** The copyright `<div>` is a sibling of the
> main card/container, sitting directly inside `<body>`. If `body` uses `display:flex` to
> center the card, it **MUST also set `flex-direction:column`** — otherwise the copyright
> gets pushed into the top-right corner *beside* the header instead of dropping below it.
> Correct body pattern:
> ```css
> body { display:flex; flex-direction:column; align-items:center; min-height:100vh; }
> ```
> (Plain block layout with no flex on `body` is also fine — the footer stacks naturally.)

## STUDENT GATE (required on every activity)
Before any activity starts, collect **Name + Class + PRN/Roll No.** (all three required, all three
recorded in the database). Do not start the tasks until all three fields are filled. The state
object therefore carries `studentName`, `studentClass`, and `studentPrn` (or `name`/`cls`/`prn`).

**CRITICAL: Use these EXACT element IDs** (required for the "Remember Me" profile feature):
- Name input: `id="nameInput"`
- Class dropdown: `id="classInput"`
- PRN input: `id="prnInput"`

**Class is a DROPDOWN, not a text box.** Use a `<select>` with exactly these four options
(plain "FY", "SY", "TY", "Final Year" — do not add divisions/sections):
```html
<label for="nameInput">Your Full Name</label>
<input type="text" id="nameInput" placeholder="e.g. Priya Sharma" value="...">

<label for="classInput">Class</label>
<select id="classInput">
  <option value="" disabled ${!state.studentClass ? "selected" : ""}>Select your year…</option>
  <option value="FY" ${state.studentClass === "FY" ? "selected" : ""}>FY — First Year</option>
  <option value="SY" ${state.studentClass === "SY" ? "selected" : ""}>SY — Second Year</option>
  <option value="TY" ${state.studentClass === "TY" ? "selected" : ""}>TY — Third Year</option>
  <option value="Final Year" ${state.studentClass === "Final Year" ? "selected" : ""}>Final Year</option>
</select>

<label for="prnInput">PRN / Roll No.</label>
<input type="text" id="prnInput" placeholder="e.g. 2023001234" value="...">
```
The `disabled` first option forces a real choice; `.name-gate` CSS must style `input, select`
identically (same padding/border/radius/font/background) so the dropdown matches the text boxes.
Read the value with `.value` (optionally `.trim()`) — never expect a custom typed class.

> **"Remember Me" Student Profiles (PRO feature #6):** When `mmt-utils.js` is loaded, students'
> name/class/PRN are auto-saved to `localStorage` key `mmt_student_profile` as they type, and
> auto-filled on their next visit. This works silently in the background — no extra code needed
> — as long as you use the exact IDs above (`nameInput`, `classInput`, `prnInput`). Shortened
> or alternate IDs (like `id="nm"`) break this feature.

---

## 8 Activity Types

### TYPE A — Selection Challenge
Students apply knowledge by selecting the correct option for each component/slot in a scenario.
**Best for:** material selection, tool choice, system design, role assignment.

**Structure:**
- 3 sequential missions/scenarios (students do ALL in order, no choice)
- Each mission has 4-6 components/slots needing one correct selection from a shared pool
- Scoring: ideal = 20pts, acceptable alternative = 12pts, wrong = 0pts
- After each mission → submit to teacher + show correct answers → next mission
- Final screen shows cumulative scores across all 3 missions
- NO retry button
- Optional: SVG blueprint/diagram that highlights active component

**Data model:**
```javascript
const MATERIALS = { key: { name, tag, role, blurb } };
const MISSIONS = [{ name, tag, brief, hint, components: [{ key, label, ideal, acceptable:[], reason }] }]; // hint = round-level nudge (REQUIRED)
let state = { screen:"start", missionIndex:0, choices:{}, studentName:"", missionScores:[] };
```

---

### TYPE B — Detective Quiz
Students identify items from descriptive clues across multiple rounds.
**Best for:** identifying materials from properties, matching concepts to definitions, diagnostic scenarios.

**Structure:**
- 3 sequential rounds (students do ALL in order)
- Each round has 5-8 clues with multiple-choice options
- Each clue has exactly ONE correct answer + a "why" explanation
- Scoring: 10 pts per correct answer
- After each round → submit to teacher + show correct answers → next round
- Final screen shows cumulative scores across all 3 rounds
- NO retry button

**Data model:**
```javascript
const ROUNDS = [{ name, tag, intro, hint, options:[], clues:[{ text, answer, why }] }]; // hint = round-level nudge (REQUIRED)
let state = { screen:"start", roundIndex:0, answers:{}, roundScores:[], studentName:"" };
```

---

### TYPE C — Sort & Classify
Students assign items into the correct category buckets.
**Best for:** taxonomy, grouping by property, classification tasks, material families.

**Structure:**
- 3 sequential rounds
- Each round presents 8-12 items and 2-4 category buckets
- Students click an item, then click the bucket to place it (or use chip-style toggles under each bucket)
- Scoring: +10 per correct placement, 0 for wrong
- After each round → submit to teacher + show correct placements with explanations → next round
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const ROUNDS = [{
  name, intro,
  hint: "round-level nudge (REQUIRED) — points at the sorting rule, not the answers",
  categories: ["Category A", "Category B", "Category C"],
  items: [{ name, correctCategory: "Category A", why: "explanation" }]
}];
let state = { screen:"start", roundIndex:0, placements:{}, roundScores:[], studentName:"" };
```

**UI approach:**
- Show category headers as columns/boxes at the top
- Show items as chips below — clicking a chip opens a small popup or highlights to pick which category
- Once placed, the chip moves under its assigned category and gets a colored border
- Alternatively: each item shows category chips next to it (simpler, consistent with Type A/B chip style)

---

### TYPE D — Rank & Order
Students arrange items in the correct sequence or ranking.
**Best for:** ordering by property (strength, melting point, density), timelines, process steps, priority ranking.

**Structure:**
- 3 sequential rounds
- Each round has 4-7 items to arrange in correct order
- Students click items in order (1st, 2nd, 3rd...) or use numbered chip selection
- Scoring: +10 per item in correct position, +5 if off by one position, 0 otherwise
- After each round → submit + show correct order with explanations → next round
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const ROUNDS = [{
  name, intro,
  hint: "round-level nudge (REQUIRED) — recall the ordering principle, not the order",
  orderLabel: "Lowest → Highest Melting Point",
  items: [
    { name: "Aluminum", correctPosition: 1, value: "660°C", why: "explanation" },
    { name: "Steel", correctPosition: 2, value: "1370°C", why: "explanation" },
  ]
}];
let state = { screen:"start", roundIndex:0, ordering:[], roundScores:[], studentName:"" };
```

**UI approach:**
- Show scrambled items as chips
- Clicking a chip assigns it the next rank number (1, 2, 3...)
- Chips show their assigned number with a small badge
- Clicking again removes the number (deselects)
- Submit enabled only when all items are ranked

---

### TYPE E — Myth Buster (True / False / Partially True)
Students judge statements and see the real answer with a detailed explanation.
**Best for:** clearing misconceptions, testing lecture recall, challenging assumptions, exam prep.

**Structure:**
- 3 sequential rounds (themed groups of statements)
- Each round has 5-8 statements
- Students pick: TRUE, FALSE, or PARTIALLY TRUE for each
- Scoring: +10 for correct judgment, 0 for wrong
- After each round → submit + show the truth with explanations → next round
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const ROUNDS = [{
  name, intro,
  statements: [{
    hint: "per-item nudge (REQUIRED unless a round-level hint is used)",
    text: "All metals are good conductors of heat.",
    answer: "Partially True",
    why: "Most metals conduct heat well, but bismuth and mercury are notably poor conductors compared to other metals."
  }]
}];
let state = { screen:"start", roundIndex:0, judgments:{}, roundScores:[], studentName:"" };
```

**UI approach:**
- Each statement displayed in a quote-style card
- Three chips below each: "True" / "False" / "Partially True" (use green/red/amber tints when selected)
- Results show original statement + correct verdict + explanation

---

### TYPE F — Connection Match
Students match items from Column A to Column B in 1-to-1 pairs.
**Best for:** term → definition, material → application, cause → effect, inventor → invention, symbol → meaning.

**Structure:**
- 3 sequential rounds
- Each round has 5-7 pairs to match
- Left column shows items (fixed), right column shows shuffled options as chips
- Student clicks a left item, then clicks the matching right option
- Scoring: +10 per correct match, 0 for wrong
- After each round → submit + show correct pairings with explanations → next round
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const ROUNDS = [{
  name, intro,
  hint: "round-level nudge (REQUIRED) — how to reason about the matches, not the pairs",
  pairs: [
    { left: "Nitinol", right: "Shape Memory Alloy", why: "Nitinol (Nickel-Titanium) is the most widely used shape memory alloy." },
    { left: "Terfenol-D", right: "Magnetostrictive Material", why: "..." },
  ]
}];
let state = { screen:"start", roundIndex:0, matches:{}, activeLeft:null, roundScores:[], studentName:"" };
```

**UI approach:**
- Two-column layout: left items as fixed cards, right items as clickable chips (shuffled)
- Click a left card to "activate" it (highlight with copper border)
- Then click a right chip to pair them — a line/connection appears, chip shows which left item it's paired with
- Already-paired chips become greyed/locked
- Alternatively (simpler): each left item has a dropdown or chip row of all right options

---

### TYPE G — Scenario Diagnosis
Students read a failure/problem scenario and identify what went wrong + the correct fix.
**Best for:** troubleshooting, engineering failure analysis, case studies, debugging, quality control.

**Structure:**
- 3 sequential cases/scenarios
- Each case describes a real-world failure or problem in detail
- Two questions per case: (1) What went wrong? (pick from 4-5 options) (2) What's the fix? (pick from 4-5 options)
- Bonus sub-questions possible (e.g., "Which material property failed?")
- Scoring: +15 per correct diagnosis, +15 per correct fix = 30pts max per case
- After each case → submit + show full diagnosis explanation → next case
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const CASES = [{
  name, tag,
  hint: "case-level nudge (REQUIRED) — which property/failure mode to focus on",
  scenario: "A warehouse robot's gripper arm snapped after 3 months of continuous use...",
  questions: [
    { prompt: "What most likely went wrong?", options: [...], answer: "...", why: "..." },
    { prompt: "What's the recommended fix?", options: [...], answer: "...", why: "..." },
  ]
}];
let state = { screen:"start", caseIndex:0, answers:{}, caseScores:[], studentName:"" };
```

**UI approach:**
- Scenario text displayed prominently in a styled quote/brief block
- Each question shown below with chip-style options
- Results show the scenario again + per-question feedback (correct answer + explanation)

---

### TYPE H — Process Builder
Students fill in the missing steps of a process by selecting from a pool of options.
**Best for:** manufacturing steps, scientific methods, design workflows, assembly sequences, algorithms.

**Structure:**
- 3 sequential processes
- Each process is shown as a vertical flowchart with 5-8 steps, some pre-filled and some blank (3-5 blanks)
- Students pick the correct step for each blank from a shared pool of options (pool has extras as distractors)
- Scoring: +15 per correct step placed, 0 for wrong
- After each process → submit + show complete correct process with explanations → next process
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const PROCESSES = [{
  name, intro,
  hint: "process-level nudge (REQUIRED) — the logic of the sequence, not the steps",
  steps: [
    { text: "Raw ore is extracted from the mine", isBlank: false },
    { text: null, isBlank: true, answer: "Ore is crushed and ground into fine powder", why: "Crushing increases surface area for chemical processing." },
    { text: "Chemical separation extracts pure metal", isBlank: false },
    { text: null, isBlank: true, answer: "Metal is melted in a furnace at 1500°C", why: "..." },
  ],
  pool: ["Ore is crushed and ground into fine powder", "Metal is melted in a furnace at 1500°C", "Distractor step 1", "Distractor step 2"]
}];
let state = { screen:"start", processIndex:0, filledSteps:{}, processScores:[], studentName:"" };
```

**UI approach:**
- Vertical flowchart with numbered steps
- Pre-filled steps shown as solid cards with a checkmark
- Blank steps shown as dashed-border empty slots with a "?" — clicking opens the chip pool to pick an option
- Once filled, the slot shows the chosen answer
- Arrows/connectors between steps for visual flow

---

### TYPE I — Hotspot / Label the Diagram
Students are shown an SVG diagram of a machine, robot, circuit, or structure. They click on numbered hotspots and assign the correct label from a shared pool of chips.
**Best for:** Robot anatomy, machine components, manufacturing setups, circuit boards, material microstructures — any topic with a visual/spatial component.

**Structure:**
- 3 sequential diagrams (students do ALL in order)
- Each diagram has 5-8 numbered hotspot markers (circles with numbers) placed on an SVG
- A shared pool of label chips is shown below the diagram
- Student clicks a hotspot to "activate" it (copper highlight), then clicks a label chip to assign it
- Scoring: +10 per correct label, 0 for wrong
- After each diagram → submit + show correct labels with explanations → next diagram
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const DIAGRAMS = [{
  name: "Robot Arm Joints",
  intro: "Label the highlighted parts of this 6-DOF robot arm.",
  hint: "diagram-level nudge (REQUIRED) — how to tell the parts apart, not their names",
  svgMarkup: `<svg viewBox="0 0 400 300">...your SVG path data...</svg>`,
  hotspots: [
    { id: 1, cx: 120, cy: 80, answer: "Base Joint", why: "The base joint allows full 360° rotation." },
    { id: 2, cx: 220, cy: 140, answer: "Elbow Joint", why: "The elbow joint provides reach extension." },
  ],
  pool: ["Base Joint", "Elbow Joint", "Wrist Flange", "End Effector", "Distractor A", "Distractor B"]
}];
let state = { screen:"start", diagramIndex:0, labels:{}, diagramScores:[], studentName:"", activeHotspot:null };
```

**UI approach:**
- SVG diagram fills the panel width; hotspot markers are `<circle>` elements with number text overlaid
- Clicking a hotspot circle highlights it copper; its number appears in an "active" indicator above the pool
- Pool chips below: clicking one assigns it to the active hotspot; chip moves to a "placed" state showing which hotspot it belongs to
- Already-assigned hotspots show the label text inside the circle
- Submit enabled only when ALL hotspots are labelled
- Results: diagram redraws with green/red highlights on each hotspot + explanation tooltip

---

### TYPE J — Equation / Formula Challenge
Students complete engineering equations by selecting the correct variable, unit, value, or formula component from a chip pool. Each blank in the equation is filled one at a time.
**Best for:** Engineering formulas, material property equations, physics calculations, unit conversion, Young's modulus, stress-strain, heat equations.

**Structure:**
- 3 sequential rounds (themed equation sets)
- Each round has 4-6 equations, each with 1-3 blanks to fill
- Each blank has a shared pool of chips (correct answer + distractors)
- Scoring: +10 per correctly filled blank, 0 for wrong
- After each round → submit + show complete equations with explanations → next round
- Final screen shows cumulative scores
- NO retry button

**Data model:**
```javascript
const ROUNDS = [{
  name: "Stress & Strain",
  intro: "Complete the fundamental equations for mechanical stress and strain.",
  hint: "round-level nudge (REQUIRED) — which quantities relate, not the symbols",
  equations: [
    {
      template: "σ = F / [BLANK_0]",   // [BLANK_N] marks each blank slot
      display:  "σ = F / ___",         // shown to student with underscores
      blanks: [
        { id: 0, answer: "A", why: "Stress = Force divided by cross-sectional Area (A)." }
      ],
      pool: ["A", "V", "L", "m", "ρ"]   // shared pool for all blanks in this equation
    },
    {
      template: "E = σ / [BLANK_0]",
      display:  "E = σ / ___",
      blanks: [
        { id: 0, answer: "ε", why: "Young's Modulus E = Stress divided by Strain (ε)." }
      ],
      pool: ["ε", "A", "F", "ρ", "V"]
    },
  ]
}];
let state = { screen:"start", roundIndex:0, filled:{}, roundScores:[], studentName:"", activeBlank:null };
```

**UI approach:**
- Each equation displayed in a large, clear font (monospace or math-style)
- Blank slots shown as dashed underline boxes: `σ = F / [___]`
- Clicking a blank slot "activates" it (copper underline highlight)
- Pool chips below each equation: clicking a chip fills the active blank
- Once all blanks in the equation are filled, the equation shows the student's version
- Results: show the complete correct equation with colour-coded blanks (green=correct, red=wrong) + explanation
- Submit enabled when ALL blanks across ALL equations in the round are filled

---

## Design System (EXACT — same for ALL types)

### 🖨️ PRINT WORKSHEET MODE (Required CSS)
Always include this exact `@media print` CSS block so activities can be cleanly printed as fallback worksheets.
```css
@media print {
  body { background: white !important; color: black !important; }
  .name-gate, .btn, button, .top-bar, .actions { display: none !important; }
  .mission-card, .round-card, .card { display: block !important; box-shadow: none !important; border: 1px solid #ccc !important; margin-bottom: 20px !important; page-break-inside: avoid; }
  .hidden { display: block !important; }
  /* Show empty checkboxes for printing */
  .mcq-option::before { content: "[  ] "; font-family: monospace; }
  .category-bucket { border: 1px solid #000 !important; min-height: 150px; }
}
```

### Head Includes (Fonts, Icons, Firebase)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧩</text></svg>">
<!-- Firebase for Database -->
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"></script>
```

### CSS Variables
```css
:root{
  --graphite:#1C2B33;
  --graphite2:#142027;
  --steel:#3E5C67;
  --steel-light:#E3EAEC;
  --copper:#D98E3B;
  --copper-light:#F6E4C8;
  --robot-blue:#2A5C7A;
  --robot-blue-light:#DCEAF1;
  --ink:#23343C;
  --muted:#5C7079;
  --card:#F4F2EE;
  --white:#FFFFFF;
  --good:#3E7A52;
  --good-bg:#E7F3EA;
  --warn:#9A6B1E;
  --warn-bg:#FBF0DC;
  --bad:#A23B3B;
  --bad-bg:#FBEAEA;
}
```

### Typography
- Headings: `font-family:'Fraunces',serif`
- Body/UI: `font-family:'Inter',sans-serif`
- Page background: `var(--graphite)` (dark)
- Main panel: white `border-radius:18px` with `box-shadow:0 20px 60px rgba(0,0,0,.35)`

### Key UI Components
- `.eyebrow` — uppercase copper tagline above the title
- `.name-gate` — blue-tinted input area for the student gate: **Name + Class + PRN** (all REQUIRED before starting)
- `.chip` / `.chip.selected` — pill-shaped answer buttons
- `.progress-pill` — blue progress indicator (e.g. "3 / 5 selected")
- `.btn-primary` — copper action button
- `.btn-primary:disabled` — greyed out when not all questions answered
- `.score-badge` — circular dark badge showing percentage
- `.result-card.good/.warn/.bad` — color-coded feedback cards
- `.cr-copyright` — centered copyright footer (see COPYRIGHT FOOTER above)
- `.hidden` — `display:none !important`

---

## PRO FEATURES (include all five in every activity)

These upgrades make activities classroom-grade. All five come from the shared helper
library **`mmt-utils.js`** (exposes `window.MMT`). Include it once, before the activity script:

```html
<script src="mmt-utils.js"></script>
```

If a single-file build is required, paste the body of `mmt-utils.js` inline before the
activity script. Always guard with a fallback so the page runs even if the library is missing:

```javascript
const MMT = window.MMT || {
  shuffle: a => a.slice(), pickPool: (a,n) => a.slice(0,n),
  submitResult: (payload) => Promise.resolve({sent:false, reason:"missing utils"}),
  isPractice: () => false, modeBanner: () => null,
  downloadReportCard: () => alert("Report card needs mmt-utils.js to be loaded."),
  hintBlock: () => "", toggleHint: () => {}, hintUsed: () => false,
  resetHints: () => {}, applyHintPenalty: (m) => m, hintTag: () => "",
  // time tracking + timed mode + badge (added v2)
  markStart: () => {}, getTimeTaken: () => null, fmtTime: () => '—',
  startTimer: (cb) => {}, getTimerSeconds: () => 0,
  renderBadge: (pct) => "",
};
```

> **Deploy note:** `mmt-utils.js` is now a REQUIRED companion file. Upload it in the SAME
> folder as every activity HTML. If it's missing the activities still run (via the fallback
> above) but the report card, shuffle, retry queue, practice mode, and hint mode go silent.

### 1. Anti-copying — shuffle options + question pools
Students sitting together must NOT see identical papers.
- **Shuffle option order** on every question with `MMT.shuffle(optionsArray)`. Compute the
  shuffled order ONCE per attempt, store it in state so it's stable across re-renders, and
  re-shuffle only on a new attempt / next round. Always map the student's pick back to the
  ORIGINAL answer key when scoring — never score by position.
- **Question pools (recommended):** define more questions than you show (pool of 12, show a
  random 6) with `MMT.pickPool(pool, 6)`. Each student effectively gets a different paper.

### 2. Result retry queue — never lose a score to bad WiFi
Use `MMT.submitResult(DB_ENABLED, payload)` instead of a bare database call. The Realtime
Database SDK queues writes locally while offline and syncs them when the connection returns,
and `mmt-utils.js` adds a localStorage safety-queue on top. Reflect three states:
```javascript
MMT.submitResult(DB_ENABLED, payload).then(res => {
  if (res.sent)        statusEl.textContent = "✓ Result saved";
  else if (res.queued) statusEl.textContent = "⏳ Offline — saved, will auto-send later";
  else                 statusEl.textContent = "⚠ Couldn't reach the database";
});
```

### 3. Practice vs Graded mode — one file, two uses
`?mode=practice` in the URL → **practice**: retry allowed, results NOT recorded.
Default (no param) → **graded**: locked, recorded.
const PRACTICE = MMT.isPractice();
const banner = MMT.modeBanner(); if (banner) panel.appendChild(banner); // top of render()
if (!PRACTICE) MMT.submitResult(DB_ENABLED, payload);                   // results screen
```
Give the teacher both links: normal URL for assessment, `?mode=practice` for revision.

### 4. Downloadable result card — hand results back to students
On the FINAL screen (after all rounds), add a **⬇ Download Result Card** button that calls
`MMT.downloadReportCard(cfg)`. It renders a printable PNG (student name, class, PRN,
college/department, a score circle with percent, a rating, and a per-round breakdown) and
triggers a download — no backend call, no database write, purely client-side from data already on screen.
```javascript
// final screen — place next to the "Play Again"/"Restart" button
cardBtn.addEventListener("click", () => {
  MMT.downloadReportCard({
    activity: "Activity Title",
    name: state.studentName, studentClass: state.studentClass, prn: state.prn,
    college: COLLEGE_NAME, department: DEPARTMENT,
    percent: pct, scoreLine: totalScore + " / " + totalMax + " pts",
    rating: pct>=90?"Outstanding":pct>=70?"Great Job":pct>=50?"Good Effort":"Keep Practicing",
    rows: state.roundScores.map((s,i) => ({ label: ROUNDS[i].name, value: s.score+" / "+s.max })),
  });
});
```
Make the primary "Play Again"/"Restart" button secondary (ghost style) so the card button
reads as the main call to action.

### 5. Hint Mode — optional nudge, half marks in graded
Let a stuck student reveal a hint. In **graded** mode a revealed hint **caps that question at
50% of its marks** (floor of half — e.g. a 10-pt question maxes at 5, correct-with-hint earns 5,
wrong still earns 0). In **practice** mode hints are **always free** and nothing is recorded.
Every hinted question is tagged with a 💡 in the detail string so the stored record and the
dashboard both show the penalty.

**Where hints live in your data:** add a `hint:` string to each question (per-item hints — good
for myth/statement or component activities) OR one `hint:` per round (round-level hints — good for
multi-item rounds; the penalty then applies to every item in that round). Pick whichever matches
the activity's structure; keep the hint a genuine nudge, not the answer.

**Render** the reveal UI where the question/round is drawn (returns an HTML string):
```javascript
// inside your question/round template — give each a stable, unique key
`${MMT.hintBlock('q'+idx, question.hint)}`         // per-item key: 'q'+idx
`${MMT.hintBlock('r'+state.roundIndex, round.hint)}` // round-level key: 'r'+roundIndex
```
Keys may be strings (e.g. `'br'+component.key`, `'mb'+idx`) — `hintBlock` quotes them safely in
the button's `onclick`, so `hintUsed`/`resetHints` must use the SAME key you rendered with.
In **graded** mode the button shows an up-front **"⚠ Reveals cost half marks for this question"**
warning beside it (so the student knows the cost before clicking); on reveal the warning hides and
the panel shows a "Using this hint gives half marks" confirmation. In **practice** mode no penalty
notice appears — the hint is free.

**Score** — halve the question's marks when its hint was used, and tag the detail line:
```javascript
const used = MMT.hintUsed('q'+idx);          // same key you rendered with
const tag  = MMT.hintTag(used);              // " 💡" in graded when used, else ""
if (correct) score += MMT.applyHintPenalty(10, used);  // floor-half in graded, full in practice
detailsArr.push(correct ? `[Q${idx+1}]: Correct${tag}` : `[Q${idx+1}]: Wrong${tag}`);
```

**Reset** hint state whenever a new attempt/round begins so a fresh question starts un-hinted:
```javascript
MMT.resetHints();   // call in startActivity, on retry, and when advancing to the next round
```

> **Keep the 💡 tag anyway:** the hint penalty is applied **client-side** — the activity halves
> the affected question's marks before writing to the database, so the stored score is already
> correct. The 💡 marker still belongs in the `details` string because the **dashboard**
> reads it to show which questions were answered with a hint. There is no server-side recompute
> (no Apps Script), so the sent score is final — make sure you halve it in the activity.

### Projector / Live mode (separate page, not per-activity)
The kit ships a `projector.html` for front-of-class display. It READS the same Realtime Database
`submissions` node as the dashboard (live listener, auto-refreshing), showing a
top-performers leaderboard, class stats, per-activity averages, and a live feed of the latest
submissions. It writes nothing. Link it from `index.html` and the instructor `control.html`.
Reuse the dark graphite + copper design system for consistency.

Each task/round submits IMMEDIATELY when the results screen is shown, via the helper library:

```javascript
function submitResult(payload) {
  return MMT.submitResult(DB_ENABLED, payload);
}
```

### Payload (adapt fields per type — always include college/department + full student identity).
Written as one record (a `push()` child under the `submissions` node) in the Realtime Database:
```javascript
{
  game: "Activity Title",
  type: "Type X",           // A, B, C, D, E, F, G, or H
  college: COLLEGE_NAME,
  department: DEPARTMENT,
  name: state.studentName || "Anonymous",
  studentClass: state.cls,  // Class collected at the gate
  prn: state.prn,           // PRN / Roll No. collected at the gate
  round: round.name,        // or mission, case, process name
  roundNumber: index + 1,
  score, max, percent: pct,
  details: "per-question summary string",
  timeTaken: MMT.getTimeTaken(),   // seconds from Start click to Submit; null if not tracked. Used for speed tie-breaker on leaderboard.

  // ===== PER-QUESTION COLUMNS (REQUIRED for heatmap) =====
  // For each question, write THREE separate fields: Q# Answer, Q# Marks, Q# Detail.
  // Without these, the heatmap shows only dashes.
  "Q1 Answer": "chosen answer text",
  "Q1 Marks": 10,                    // numeric marks earned (after hint penalty if applicable)
  "Q1 Detail": "Correct ✅" + hintTag,  // or "Wrong ❌" + hintTag; hintTag = " 💡" when hint used, else ""

  "Q2 Answer": "...",
  "Q2 Marks": 5,
  "Q2 Detail": "Wrong ❌ 💡",

  // ... repeat for all questions Q3, Q4, etc.
}
```

**Why three fields per question?** The dashboard reads `Q# Marks` for the heatmap cells (numeric score)
and `Q# Detail` for the question-bar accuracy chart (counts `✅`/`❌` or `Correct`/`Wrong`). The `Q# Answer`
field stores what the student chose, used by the distractors chart to show which wrong answers are most common.
If you omit these columns, the activity still submits and the leaderboard works, but the heatmap will be blank
and the per-question analytics won't load.

> ⚠️ **Realtime Database key rule — payload field names must NOT contain `.` `#` `$` `/` `[` `]`.**
> RTDB forbids these characters in keys. `mmt-utils.js` sanitizes them (replacing each with `-`), so
> a field like `"Round / Mission"` silently becomes `"Round - Mission"` (then remapped to `round`) —
> which breaks the dashboard column match. Keep keys plain: use `round`, `roundNumber`, `Q1 Answer`,
> `Q1 Marks`, `Q1 Detail` (spaces are fine; slashes and dots are not).

> ⚠️ **CRITICAL — the `details` string drives the whole analytics dashboard. Get this exact.**
> The dashboard splits `details` on `" | "` into one entry per question, then decides
> right-vs-wrong by scanning each entry for a keyword. **Every question entry MUST contain
> the word `Correct` (right) or `Wrong` (right→wrong), or the emoji `✅` / `❌`.** If you
> invent your own markers (like `[v]`, `[x]`, tick symbols, "Right", "Yes/No"), the dashboard
> reads them as 0% and the heatmap shows blank dashes — even though the score is correct.
>
> **Required format — one entry per question, joined by `" | "`:**
> - ✅ correct → `` `[Q${i+1}]: Correct` `` or `` `[${itemName}]: Correct` `` or `` `✅ ${answer}` ``
> - ❌ wrong → `` `[Q${i+1}]: Wrong (Picked ${choice}, was ${answer})` `` or `` `❌ ${answer}` ``
> - Type A (Selection) uses tiers instead — append `(good)` = ideal 20pts, `(warn)` = acceptable 12pts, `(bad)` = wrong 0pts, e.g. `` `${label}: ${chosen} (good)` ``
> - Type D (Rank) may add `exact` (full) or `close`/`±1` (partial) if you score off-by-one.
>
> **Per-type checklist — each `details` entry must carry a recognized marker:**
> - Type A Selection → `(good)` / `(warn)` / `(bad)`
> - Type B Detective → `Correct` / `Wrong` (or `✅` / `❌`)
> - Type C Sort → `Correct` / `Wrong`  ← *do NOT use `[v]`/`[x]`*
> - Type D Rank → `Correct` / `Wrong` (optionally `close`/`±1` for partial)
> - Type E Myth Buster → `Correct` / `Wrong`
> - Type F Match → `Correct` / `Wrong`
> - Type G Diagnosis → `Correct` / `Wrong` (or `✅` / `❌`)
> - Type H Process → `Correct` / `Wrong` (or `✅` / `❌`)

### Status display:
```html
<div class="submit-status" id="submitStatus">Sending result to your instructor…</div>
```
On success: `"✓ Result sent to your instructor"` with class `ok`
On failure: `"⚠ Couldn't reach the database"` with class `warn`

---

## Universal Flow (ALL types follow this)

1. **Start screen** — Student gate: Name + Class + PRN (all required) + overview of all 3 tasks/rounds + single "Start" button
   After the student passes the gate and clicks "Start", call:
   - `MMT.markStart()` — begins silent time tracking for speed tie-breaker (always, for all activities)
   - `MMT.startTimer(submitCurrentRound)` — starts a visible countdown only if `?timed=N` is in the URL; safe no-op otherwise
2. **Task screen** — Answer all questions → Submit button (disabled until ALL answered).
   Render the hint reveal here with `MMT.hintBlock(key, hintText)` (round- or item-level — see
   PRO FEATURE #5). Every round/mission/case has a `hint:` in its data, so this is always drawn.
3. **Results screen** — Score badge + per-question feedback with correct answer + explanation → "Next" button only (NO retry)
4. **Final screen** — Cumulative score + per-task breakdown + **⬇ Download Result Card** button (primary) + "Play Again"/"Restart" button (secondary/ghost)
   Before the score breakdown, insert the achievement badge:
   ```javascript
   container.insertAdjacentHTML('afterbegin', MMT.renderBadge(percent));
   ```
   This renders an animated badge: 🏆 Outstanding (≥90%) / 🥈 Great Job (≥70%) / 🥉 Good Effort (≥50%) / 💪 Keep Practicing (<50%).

---

## Content Guidelines

When creating content from user-provided materials:
1. **AI decides the questions** — extract key concepts from the provided topic materials
2. Create 3 rounds/missions/cases per activity
3. For every answer, include a `reason`/`why` explanation that teaches
4. Make distractors plausible but clearly wrong upon reflection
5. Every answer must connect directly to the provided lecture/topic content
6. Use real-world examples and scenarios relevant to the subject
7. Difficulty should ramp slightly across rounds (round 1 = recall, round 2 = application, round 3 = analysis)
8. **Hints are REQUIRED (not optional).** Every round/mission/case MUST carry a `hint:` — either
   one `hint:` on each round object (round-level) or a `hint:` on every question/item. A hint is a
   genuine nudge toward the reasoning, never the answer itself. See PRO FEATURE #5 for the render/
   score/reset wiring. The data models below already show where `hint:` goes — keep it in.

## Choosing Types for a Topic

When user doesn't specify a type, suggest 2-3 that best fit:
- **Lots of categories/families?** → Type C (Sort) or Type B (Detective)
- **Properties with measurable values?** → Type D (Rank) or Type E (Myth Buster)
- **Real-world applications?** → Type A (Selection) or Type G (Diagnosis)
- **Definitions and terminology?** → Type F (Match) or Type B (Detective)
- **Sequential procedures?** → Type H (Process Builder)
- **Common misconceptions?** → Type E (Myth Buster)
- **Engineering/design decisions?** → Type A (Selection) or Type G (Diagnosis)

---

## File Output

- Save each activity as a standalone `.html` file **plus the shared `mmt-utils.js` in the same folder** (required companion — see PRO FEATURES deploy note)
- The kit also includes shared pages that are generated once, not per-activity: `index.html` (student hub), `dashboard.html` (instructor analytics), `projector.html` (front-of-class live leaderboard), and `control.html` (instructor show/hide panel). Link `projector.html` and `dashboard.html` from both `index.html` and `control.html`.
- Each activity is self-contained for CSS/JS **except** the one `<script src="mmt-utils.js">` include (all other CSS in `<style>`, all other JS in `<script>`)
- **Mobile-first & fully responsive (REQUIRED — see MOBILE RULES below)**
- Include the `.cr-copyright` footer before `</body>` (see COPYRIGHT FOOTER above — mind the flex layout rule)
- Ready to open in any browser with zero dependencies beyond Google Fonts
- File name format: `ActivityTitle - Type X.html`
- **Use real Unicode characters directly in HTML text — never literal escape codes.** Write `—` not `—`, `✅` not `✅`, `·` not `·`. If you build strings in JavaScript, the escapes are fine there (JS decodes them), but any character that ends up as visible HTML text must be the actual character, or it prints as raw gibberish like `—` on the page.

---

## MOBILE RULES (REQUIRED on every activity — most students open on phones)

Every generated page MUST work on a phone with **no horizontal scrolling**, **thumb-sized
tap targets**, and **readable text**. Follow all of these:

1. **Viewport tag** in `<head>`:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   ```
2. **Fluid headings** — never fixed px for h1/h2/h3. Use `clamp()`:
   `font-size: clamp(24px, 7vw, 34px);`
3. **No fixed-width containers** — use `max-width` + `width:100%`, never `width: 600px`.
4. **Tap targets ≥ 44px** — every button, chip, and card link must be at least 44px tall.
5. **Inputs at 16px** — prevents iOS auto-zoom on focus.
6. **Grids collapse to 1 column** on narrow screens.
7. **Wrap any wide table** in `<div class="table-scroll">…</div>`.
8. **Paste this exact block just before `</style>`** in EVERY file (it hardens all of the above):

```css
  /* ===== MOBILE-HARDENING (paste in every activity) ===== */
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  html, body { max-width: 100%; overflow-x: hidden; }
  img, svg, video, canvas, table { max-width: 100%; height: auto; }
  p, h1, h2, h3, li, td, th, .chip, .btn { overflow-wrap: break-word; word-break: break-word; }
  .table-scroll { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  @media (max-width: 640px) {
    body { padding-left: 14px; padding-right: 14px; }
    .app, .panel, .wrap, .container, main { max-width: 100% !important; }
    .panel { padding: 20px 16px !important; border-radius: 14px !important; }
    h1 { font-size: clamp(24px, 7vw, 34px) !important; line-height: 1.12; }
    h2 { font-size: clamp(20px, 5.5vw, 26px) !important; }
    h3 { font-size: clamp(17px, 4.8vw, 21px) !important; }
    .missions, .mission-grid, .grid, [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
    .btn, button, .chip, a.card, .card-link, select { min-height: 44px; }
    .chip { padding: 11px 14px !important; font-size: 14px !important; }
    .btn, button { padding: 13px 18px !important; font-size: 15px !important; }
    input, select, textarea { font-size: 16px !important; width: 100%; }
    .top, .mission-header, .score-hero, .app-header, header { flex-wrap: wrap; }
  }
  @media (max-width: 380px) {
    .panel { padding: 16px 12px !important; }
    .chip { font-size: 13.5px !important; }
  }
```

**Test mentally before finishing:** on a 360px-wide phone, is there any sideways scroll?
Are all buttons easily tappable? Do headings fit? If not, fix before outputting the file.

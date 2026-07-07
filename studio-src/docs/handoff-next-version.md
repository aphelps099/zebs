# Handoff: Building the Next One

*A building prompt for the team that comes after us.*

You are inheriting a working tool: a browser-based motion studio that turns a
JSON document into a finished, branded MP4 — no backend, no render farm,
pixel-identical preview and export. We built it for a fitness brand. Your job
is to build the **next version for a different company** — the worked example
in this document is a **tractor dealership** — and to add the thing we never
got to: **agentic automation**, where an AI generates the creative (e.g., a
Facebook carousel ad) from business data, and a human approves it.

Two of us wrote this. One is a designer at the end of a long career; one is
the engineer who kept the renderer honest. We also know something about your
situation that shapes every page of this document: **you will be building
with AI assistants that are good but not tireless** — Opus and Sonnet rather
than the frontier model that built the original. That is fine. The original
was built the same way you will build yours: in small verified steps. The
model matters less than the method. Part 6 is the method.

Read the whole document once before you prompt anything.

---

## Part 1 — The five laws (do not negotiate these away)

Everything good about the current tool comes from five decisions. Every time
a future feature feels hard, it is because someone is about to break one of
these. Don't.

**Law 1: The document is data, and only data.**
The entire creative — every scene, every word, every color, every timing —
is one serializable JSON document. No closures, no DOM references, no class
instances. Binary media (video, images, audio) lives *outside* the document
and is referenced by id. Consequences you get for free: save/load is
`JSON.stringify`, undo/redo is an array of snapshots, autosave is one
localStorage key, and — this is the one that matters for your project — **an
AI agent can author a complete video by writing JSON.** The document *is*
the API. Guard it jealously.

**Law 2: The renderer is a pure function of time.**
One function takes (document, time in milliseconds) and draws that exact
frame onto a canvas. No internal state, no "play" concept, no randomness
(the film grain uses a hash of the frame number, not `Math.random`).
Consequences: the live preview, the scrubber, the thumbnail strip, the PNG
snapshot, and the offline MP4 exporter are all *the same code called with
different values of t*. "What you see is what exports" is not a feature —
it is a theorem. The day someone adds a `setInterval` or a mutable "current
animation state" inside the renderer, the theorem dies and every export
becomes a lottery ticket.

**Law 3: Brand is a parameter, never a constant.**
The engine knows nothing about any company. Colors arrive as a three-value
scheme (background, foreground, accent — muted and line colors are *derived*
from foreground, so a brand only ever chooses three colors). Fonts arrive as
two family names (heading, body). Logos arrive as named asset slots. Default
copy arrives as a per-template table. All of it together is a "brand pack,"
and the long-term plan (see `style-skills.md` in this folder) is that a
brand pack is an uploadable CSS file — a *style card*. When you rebuild for
the tractor company, you are writing a new brand pack and new templates.
You are not touching the engine. If you find yourself editing the engine to
change a color, stop and re-read this law.

**Law 4: Templates are opinions, not canvases.**
The tool does not offer a blank artboard with draggable text boxes. It
offers nine *scenes* — title, statement, stat, list, quote, image, video,
disclaimer, end card — each of which lays itself out beautifully from
nothing but its content fields. This is why an intern (or an AI) can produce
professional output: the taste is baked into the templates, not demanded
from the user. Adding a tenth template is a normal week of work. Adding
"free positioning of anything" is the end of the product. Every successful
tool in this genre — from title-card generators to Canva's locked templates
— wins by constraining.

**Law 5: Everything a user hears or sees is computed from one clock.**
Audio (music bed with fades, ducking under voiceover, per-clip sound) is
described by gain *curves* — pure functions of time again — and the same
curve drives the preview's volume property and the offline export mix. Text
overlays, tips, and captions each run on their own start/duration windows
within a scene, but all windows resolve against the same scene-local clock.
When you add anything time-based, your first question is always: "what is
its pure function of t?"

---

## Part 2 — The system, described so you can re-derive it

You have the source (`studio-src/`) — read it. But source tells you *what*;
this section tells you *why*, so you can rebuild the shape without copying
the letters. No code here; these are the contracts.

**The document.** One object holding: canvas aspect (16:9, 1:1, 9:16, 4:5 —
pixel dimensions come from a preset table), frames per second, an ordered
array of scenes, two font family names, a watermark string, grain on/off,
and the audio program (music track id + volume + fade lengths + duck
settings, voiceover id + volume + start time). Total timeline length is the
sum of scene durations — there is no separate "timeline" data structure to
drift out of sync.

**A scene.** Identified by a template name plus content fields (kicker,
title, subtitle, body, attribution, stat parts), styling fields (scheme
colors, animation preset, transition-in, alignment, text scale, heading
weight, backdrop graphic), media fields (image or video id, trim-in point,
Ken Burns move, legibility overlay and its strength, mute/volume), an
optional picture-in-picture "presenter cam" (its own clip id, position,
size, trim, audio), text-layer timing (a delayed entrance and an early exit
for the main text block), and an array of **cues**.

**A cue.** The most recent and most reusable idea in the system: an extra
piece of text layered over a scene *on its own clock* — a start time, an
on-screen duration, a position, and a style. Three styles exist: a
lower-third "tip" plate that sweeps in and away while video keeps playing,
a plain display line, and a subtitle "caption" pill (which is what SRT
import produces). Cues are how you add information density without adding
templates. Your carousel-ad text badges ("0% APR", "In Stock") will be cues.

**The renderer.** One entry function: given a drawing context, the document,
a time, and the asset maps, draw the frame. Internally: find which scene
time t falls in and the scene-local time; draw background (color, image
with Ken Burns, or the video element's current frame, cover-fitted); draw
the legibility overlay; draw a backdrop graphic if any; draw the template's
text via a shared "animated text block" primitive that implements all eight
animation presets (rise, word-stagger, letter-cascade, typewriter, wipe,
blur-in, scale-in, mask-reveal) and — critically — **resolves to the same
final layout regardless of preset**, so presets are hot-swappable; draw
cues; draw the presenter cam; draw watermark and grain. Scene transitions
(fade/wipe/slide) draw the previous scene's final frame, then composite the
incoming scene from an offscreen buffer. All sizing uses one unit: the
smaller canvas dimension divided by 1080, so every layout scales to every
aspect automatically.

**Export.** MP4: step through the timeline frame by frame at the document's
fps, call the renderer for each frame, feed frames to the browser's
WebCodecs video encoder, mux with an audio track that was mixed offline
from the same gain curves (Chrome/Edge only — keep a realtime WebM recorder
as the fallback for other browsers). PNG: call the renderer once. There is
no server. This constraint is a gift: zero infrastructure, zero cost per
render, total privacy (client media never leaves the machine). Only
reconsider it when the agent pipeline (Part 5) genuinely needs headless
rendering — and even then, the same renderer runs in headless Chromium
under Playwright; you still don't write a second rendering path.

**Persistence.** The document autosaves to localStorage (debounced) and
restores on load. Save/load is a JSON download that includes a
filename→asset-id manifest; re-uploading a file with a matching name
reclaims its old id so every scene that referenced it relinks silently.
Undo/redo is a debounced snapshot stack — and learn from our scar tissue:
an undo must first *flush* any still-debouncing edit into the stack, or it
will step back two states instead of one. We shipped that bug and found it
only because our test harness happened to press undo quickly. Which brings
us to:

**The verification harness.** The most important non-feature in the repo.
A set of Playwright scripts that launch the built app in headless Chromium,
click the actual buttons, drag the actual timeline, press the actual keys,
and screenshot the actual canvas. Every feature we shipped was proven this
way before commit, and the two genuine bugs we caught (the undo-debounce
race; a test selector broken by new thumbnails) were caught *only* this way.
You will rebuild this harness for your version on day one, before features.
For your generation of AI assistants this is not optional hygiene — it is
the mechanism that lets a weaker model check its own work (Part 6).

---

## Part 3 — Worked example: rebuilding for a tractor dealership

Now the fun part. Same engine, new company. Call it *Heartland Tractor &
Equipment* — multi-location dealer, sells new and used compact tractors,
implements, parts, service. They want: inventory videos for Facebook
Marketplace and YouTube, seasonal promo spots, service-department
explainers, and (Part 4) carousel ads generated from their inventory feed.

**Step 1 — Discovery, before any prompting.** Sit with their marketing
person for one hour and leave with: logo files (light-on-dark and
dark-on-light versions, PNG with transparency), their two or three brand
colors as hex values, their typefaces (or permission to pick two Google
Fonts that match their signage), five real inventory listings with photos
and prices, their legally required disclaimer text (financing offers have
mandatory fine print — treat this exactly as seriously as the fitness
disclaimer was treated), and ten examples of competitor ads they envy or
hate. That last item is your design brief.

**Step 2 — Write the brand pack.** Using the ZFIT wrapper as the worked
example: schemes might be *Forest* (deep green background, white text,
harvest-yellow accent), *Harvest* (yellow background, near-black text),
*Steel* (dark gray, white, red accent for clearance events), *White*
(spec-sheet clean). Heading font heavy and industrial; body font plainly
legible — this audience reads glasses-on at arm's length, so push body
sizes one notch larger than the fitness brand used. Default copy per
template written in the dealer's voice ("0% FOR 60 MONTHS", "SPRING SERVICE
SPECIAL", not fitness copy). The end-card logo slots get their marks; the
watermark gets their name.

**Step 3 — Re-skin the templates; rename nothing in the engine.** The nine
scene templates map almost one-to-one:

| Engine template | Fitness meaning | Tractor meaning |
| --- | --- | --- |
| Title | Series title | "2024 ROUNDUP — COMPACT TRACTORS" |
| Statement | "TEN MINUTES. NO EXCUSES." | "BUILT FOR THE LONG HAUL." |
| Stat | 10 MIN counter | "$0 DOWN" / "25 HP" / "1,200 HRS" counter |
| List/Agenda | Today's circuit | Spec sheet: engine, PTO, loader, warranty |
| Quote | Coach quote | Customer testimonial + name, town |
| Image | Module card | Hero photo of the unit, Ken Burns, price kicker |
| Video | Exercise clip | Walk-around footage, price/model overlay, TIP cues ("New tires 2023") |
| Disclaimer | Medical fine print | Financing/OAC fine print |
| End card | ZFIT + CTA | Logo, location, phone, "HEARTLANDTRACTOR.COM" |

Notice nothing structural changed. The *Module Builder* — the wizard that
seeds a whole video skeleton in one click — becomes an **Inventory Builder**:
type in model, year, hours, price, three selling points, and it seeds
sting → hero image → spec list → walk-around video → financing stat →
disclaimer → end card. That wizard is where a dealership employee lives;
they may never touch an individual scene. Design the wizard first.

**Step 4 — Add the one or two genuinely new templates.** Every vertical
earns one or two. For a dealer we'd add a **Compare** scene (two units side
by side, spec rows, prices) and a **Price Card** scene (unit photo, big
price, payment-per-month line, stock number — legally the stock number and
disclaimer visibility have rules; ask their compliance person, and make the
template *incapable* of rendering a price without its fine-print
companion). New templates are new draw-functions plus new inspector fields
plus new defaults — a contained, verifiable unit of work, perfect for one
AI-assisted session each.

**Step 5 — Verify like we did.** Port the Playwright harness. Build one real
inventory video end to end with their actual media on their actual laptop
in their actual browser. Export it. Play the MP4 in three players. Then
show it to the dealer *before* building anything else.

---

## Part 4 — The new surface: Facebook carousel ads

A carousel ad is 2–10 cards, each a square 1080×1080 image (or short
video), each with its own headline (~40 characters before truncation),
optional description, and destination link, plus one shared primary text
(~125 visible characters). This is not a new product — it is the same
renderer asked for **frames instead of movies**.

**The reframe that keeps you sane:** a carousel is a document whose scenes
are *cards*. Set the document to 1:1 aspect. Each scene = one card. To
produce the card image, call the renderer at a time near the end of the
scene (when all text has fully animated in but nothing has begun exiting —
the thumbnail system already computes exactly this instant) and snapshot a
PNG. Ten cards = ten renderer calls. You already own everything: templates,
brand pack, cues for badges, the safe-area guides for keeping text out of
the zones Facebook's UI overlaps.

**What is genuinely new, and small:**

1. A **Carousel mode** in the editor: aspect locked to 1:1, per-scene
   fields for headline / description / link (these are ad metadata, not
   rendered pixels — add them to the scene model as plain strings the
   renderer ignores), a card-count guard (2–10), and a gallery preview that
   shows the cards side by side the way the feed will.
2. A **carousel export**: a zip of numbered PNGs plus a copy sheet (CSV or
   JSON) with one row per card — filename, headline, description, link —
   and the shared primary text. A marketer drags this straight into Ads
   Manager. Ship this *manual-upload* version first and completely; direct
   Marketing-API publishing is a later milestone with real auth, review,
   and failure modes, and the copy sheet is your contract for it anyway.
3. **Design rules the templates should enforce, not suggest:** keep text
   inside the title-safe frame (the guides already draw it); one idea per
   card; the first card is the hook (hero + price or the single boldest
   claim), the last card is always the CTA/end-card; keep rendered-in text
   minimal — the headline lives in Facebook's own text slot below the
   image, so resist restating it in pixels.

---

## Part 5 — Agentic automation (the part your bosses actually asked for)

The goal: *"Here's our inventory feed — make me a carousel ad for every new
arrival, and a walk-around video when there's footage."* Because of Law 1,
this is much less magical than it sounds. **The agent's entire job is to
write a document.** Not pixels, not layout, not code — a JSON document your
existing renderer already knows how to draw. This is the payoff of every
architectural decision above, and it is why you must not let the agent
"generate an image" directly. Generated pixels are unreviewable and
off-brand; generated *documents* are inspectable, editable, brand-locked
by construction, and diff-able.

Build it as a pipeline with a human gate:

**Stage 1 — Ingest.** Input: a CSV export, a DMS/inventory feed, or a
listing URL. Normalize into a plain record: model, year, price, hours,
photos, selling points, location, stock number. Deterministic code, not a
model, wherever possible; use a model only to extract from messy free text,
and validate everything it returns against the source (a price that doesn't
appear verbatim in the source data is a bug, full stop).

**Stage 2 — Author.** The agent (this is a good Sonnet job) receives: the
normalized record, the brand pack, the document JSON schema with two or
three complete example documents, and a short creative brief ("carousel,
5 cards, spring financing angle, first card hooks on price"). It returns a
document. Give it the schema *and examples* — models of this class follow
examples far more reliably than schemas. Validate the output mechanically:
schema check, card count, character limits on headline/description, price
matches source, disclaimer scene present whenever a price or financing
claim appears (make this rule executable, not aspirational).

**Stage 3 — Render.** Load the document into the same engine headlessly
(Playwright + the deployed editor, or a thin headless page that just runs
the renderer) and produce the PNGs/MP4 plus the copy sheet.

**Stage 4 — Critique.** Feed the rendered images back to a vision-capable
model with a *checklist*, not an open question: is any text cut off or
overlapping the photo's subject? Does the photo look stretched? Is the
price legible at thumbnail size? Is the disclaimer present? Return
pass/fail per item with a one-line reason. On fail, loop to Stage 2 with
the critique attached — but **cap the loop at two retries** and then queue
for a human. Uncapped self-correction loops burn money and converge on
weirdness.

**Stage 5 — Approve.** A human sees the gallery preview, the copy sheet,
and the source record side by side, and clicks approve/edit/reject.
"Edit" opens the document in the editor you already built — this is the
moment the whole architecture pays off, because the agent's draft and the
human's hand-finish are the same file format. Nothing publishes without
this click until the pipeline has months of boring history.

Two prohibitions, from the designer, non-negotiable: the agent **never
invents facts** (prices, hours, availability, financing terms come from the
record or the ad doesn't ship), and the agent **never touches the brand
pack** (it chooses among approved schemes and templates; it does not get
creative with hex values).

---

## Part 6 — Working with Opus and Sonnet: the method

We built the original with a frontier model. You have very capable models
that hold less in their heads at once and verify less on their own
initiative. Our honest experience, distilled — this section is the most
important one in the document.

**1. One session, one feature, one commit.** Never ask for "the editor."
Ask for "the trim-drag handle on timeline blocks, with the duration
snapping to 100ms, and nothing else changed." The milestone list in Part 7
is already cut to this grain. If a session's diff touches more than a
handful of files, you scoped it wrong — throw it away and re-scope; don't
try to review your way out.

**2. Make the model restate the contract before it edits.** Start feature
sessions with: "Before writing anything, read these files and tell me: what
are the invariants of the renderer? What is the shape of a Scene? What will
you change and what will you not touch?" A model that restates Law 2 in its
own words respects it for the rest of the session. A model that starts
typing immediately is about to put state in your renderer.

**3. The harness is the model's conscience.** After every feature, the
model runs the Playwright harness and reads the output. Not "the code looks
correct" — *the button was clicked and the number changed*. When we did
this, the harness caught a real state-management race the code review
missed (undo during the debounce window). Insist on the loop:
build → deploy → drive → screenshot → read → fix → repeat. Weaker models
especially need this loop, because their "it should work now" is less
reliable — but with the loop, their ceiling is nearly the same, just slower.

**4. Write invariants in the repo, not in the chat.** The model's memory
of your conversation degrades; files don't. Keep a short INVARIANTS file
(the five laws, the scene-field table, the "undo must flush" scar).
Reference it at the top of every session. When a session teaches you
something new the hard way, the session isn't done until the lesson is in
that file.

**5. Never let the model refactor uninvited.** These models like tidying.
Tidying the renderer is how determinism dies quietly. The standing
instruction: match the style around you; change only what the feature
requires; if a refactor seems needed, *propose it and stop*.

**6. Plans before diffs on anything structural.** For a new template or the
carousel mode: "Give me the plan — data model changes, renderer changes,
inspector changes, harness additions — and wait." Review the plan like the
senior person you are becoming. Cheap to fix a plan; expensive to fix a
merge.

**7. Paste, don't allude.** Give exact file paths, exact field names, the
exact error text, the actual screenshot. "The thing we discussed yesterday"
is how you and a smaller-context model end up building two different
features. Every prompt should stand alone.

**8. Commit after every green run, deploy every commit.** The built site is
the artifact; source that doesn't ship is a rumor. And a tight commit
history is your undo stack for the sessions themselves.

**9. Split the roles you can't fill with people.** No senior engineer
around? Run two sessions: one authors the feature, a fresh one — with no
stake in the first session's choices — reviews the diff and tries to break
it through the harness. Fresh-context review catches what the author-model
has become blind to. It's the adversarial-verify pattern we used at the
frontier, scaled to your tools.

**10. Respect what these models are genuinely great at.** Sonnet is
excellent at contained, well-specified implementation and at writing the
harness scripts themselves. Opus is your planner, reviewer, and debugger of
the weird stuff. Neither should hold the whole architecture in its head —
that's what this document and the INVARIANTS file are for. *You* are the
continuity. The model is a brilliant contractor with amnesia; the docs are
the building code; the harness is the inspector.

---

## Part 7 — Milestones, each one session-sized, each with a done-test

Build in this order. Do not start a milestone until the previous one's
done-test passes in the harness.

| # | Milestone | Done when (observed, not asserted) |
| --- | --- | --- |
| 0 | Port the repo, run it, port the Playwright harness | Harness drives the existing app green on your machine |
| 1 | Brand pack extracted to one data object (fitness brand still the content) | Editor renders pixel-identical to before; the pack file is the only place brand appears |
| 2 | Heartland brand pack + re-skinned defaults | New default doc renders in dealer colors/fonts/logos; export plays |
| 3 | Inventory Builder wizard | Typing one listing seeds the full skeleton; harness fills the form and counts scenes |
| 4 | Compare + Price Card templates | Both render at all four aspects; price never renders without fine print (harness asserts) |
| 5 | Carousel mode + zip/copy-sheet export | 5-card doc exports 5 correct PNGs + CSV; text inside title-safe on every card |
| 6 | Headless render service (same renderer, Playwright-driven) | A doc JSON in → PNGs/MP4 out with no human at the keyboard |
| 7 | Agent authoring (ingest → document → validate) | Ten real listings → ten valid documents; zero invented prices (diff against source) |
| 8 | Critique loop + approval UI | Bad draft (seeded deliberately) gets caught and queued; good draft reaches approval gallery |
| 9 | Publishing integration (Marketing API) — only now | An approved carousel appears in Ads Manager as paused draft |

---

## Part 8 — Scar tissue (bugs we actually shipped or nearly shipped)

Learn from ours so yours are new and interesting.

- **Fonts must be loaded before the canvas draws or exports** — otherwise
  frames render in a fallback font and *look right in the preview later*,
  hiding the corruption in the export. There is a wait-for-fonts gate;
  never bypass it.
- **Screen recordings report `duration = Infinity`** until you seek past the
  end. The video loader has a workaround; you'll rediscover why if you
  remove it.
- **Undo during the debounce window** stepped back two states because the
  pending edit was never committed. Fix: flush pending state into the
  history stack before undoing. Any debounced-snapshot undo you write will
  have this bug until you add the flush; the only reason we found it was a
  fast-clicking test.
- **Adding thumbnails broke the tests** — the harness's "first canvas on
  the page" selector suddenly matched a thumbnail, and screenshots silently
  captured the wrong element. Evidence looked wrong before the app did.
  Anchor selectors to stable structure, and *look at* your screenshots.
- **Dark-on-dark chrome vanishes**: the caption pill is invisible on a pure
  black scene (fine over footage — the real use case — but we noted it, and
  you should test your equivalents on their worst-case background).
- **WebCodecs MP4 export is Chrome/Edge only.** Keep the fallback path and
  keep the capability check visible in the UI, or you will debug "export
  button does nothing" on a client's Safari.
- **Static hosting details bite**: the built app is a committed artifact
  (never hand-edit it), the repo needs its dot-file so Pages serves the
  framework's asset folder, and the base path is configured in one place —
  if the site moves to a custom domain, change it there and redeploy.
- **Media can't be embedded in saved projects** at browser-storage scale;
  reference by filename and relink on re-upload. Users accept this
  instantly *if* the missing-media message tells them exactly what to do.

---

## Part 9 — A closing note from the designer

The tool you inherit looks like a video editor, but what we actually built
is **taste, encoded**. The templates hold the taste. The three-color scheme
rule holds the taste. The 620-millisecond ease-out, the kicker line, the
two-digit agenda markers someone wisely made optional — that's the taste.
Code rots and gets rewritten; the encoded judgment is the asset. When you
rebuild this for the tractor company, your job is not to transplant our
taste — yellow-on-black shouting is wrong for a man buying a $40,000
machine. Your job is to *find theirs*: sit with their customers' world
long enough to learn whether it's steel-gray confidence or harvest-gold
warmth, then encode *that* into templates so firmly that every document
anyone — or any agent — produces comes out looking like the company on its
best day.

And when the agent writes its first carousel and it's correct, on-brand,
and a little bit dull — that's your cue, not your failure. Correct and
on-brand is the floor the system guarantees. The ceiling is still a human
noticing that the third card would hit harder if the price were the
headline. Keep a human in that seat. That's not a limitation of your
models. It's the job.

Good luck. Ship small, verify everything, and be kind to the person who
inherits it from you — write them a document like this one.

— *the design half & the engineering half*

# SUTD Campus Exchange — FDE demo spec

Build this, in this order. Do not add features that are not in this file.

Public second-hand shop for SUTD students. Seeded listings only. Natural-language search and catalogue Q&A. Deployed on Vercel. No login.

---

## 1. Who it is for

**Buyer:** an SUTD student on a phone, trying to buy something this week and meet on campus.

**Job:** find a used course / dorm / tech item, open it, ask a follow-up, decide whether to meet.

**Reviewer:** a stranger who has never been to SUTD. Copy must still make sense (always write “SUTD campus, Somapah”, not only hall slang).

**Out of scope:** seller accounts, real payments, chat, logistics, campus-email login.

---

## 2. Product slice

### In

- Mobile-first browse of seeded listings
- Item detail page
- Natural-language search that returns listing cards
- Catalogue Q&A that answers from listing facts only
- Simulated “Reserve” (does not charge or message anyone)
- Public `/notes`
- Server-side model calls (API key only in Vercel env)

### Out

- Auth
- Real payments
- Seller onboarding
- Messaging
- Shipping
- Admin dashboard
- A separate native app (responsive web is enough)

### Demo lies (label in the UI)

- All listings are seeded
- Reserve is simulated
- No real sellers will reply

---

## 3. Listing schema

Every listing **must** use this shape. No extra required fields. Empty arrays are allowed.

```json
{
  "id": "string-kebab-case",
  "title": "string",
  "category": "course | dorm | tech",
  "price_sgd": 0,
  "condition": "new | like-new | used | well-used",
  "pickup": "string",
  "meetup_window": "string",
  "includes": ["string"],
  "defects": ["string"],
  "seller_note": "string",
  "image_emoji": "string"
}
```

Rules:

- `price_sgd` is a number, not `"$25"`.
- `category` is exactly one of `course`, `dorm`, `tech`.
- `pickup` always includes a place a stranger can understand.
- `defects` states what is wrong. If nothing, use `[]` — do not invent “none mentioned” in the UI as a fact the seller confirmed.
- Keep `seller_note` in campus voice (Telegram / Carousell, not Amazon).

Put listings in `data/listings.json`. The browse page, item page, search, and Q&A all read this file. Do not hardcode items in components.

---

## 4. Seed listings

Copy these into `data/listings.json` to start. Add more later; do not change the schema.

```json
[
  {
    "id": "fan-hostel-01",
    "title": "Stand fan, used one term",
    "category": "dorm",
    "price_sgd": 25,
    "condition": "used",
    "pickup": "SUTD hostel, near campus (Somapah)",
    "meetup_window": "Weekdays after 6pm",
    "includes": ["remote"],
    "defects": ["Wobbles on highest speed"],
    "seller_note": "Selling because I am moving out of hostel. Still cools the room fine.",
    "image_emoji": "🌀"
  },
  {
    "id": "lamp-desk-02",
    "title": "Clip-on desk lamp",
    "category": "dorm",
    "price_sgd": 12,
    "condition": "used",
    "pickup": "SUTD campus, Building 2 lobby",
    "meetup_window": "Between classes, weekdays 12–2pm",
    "includes": ["USB cable"],
    "defects": ["Slight yellowing on the arm"],
    "seller_note": "Good for late studio nights. Plug is US/SG two-pin.",
    "image_emoji": "💡"
  },
  {
    "id": "fridge-mini-03",
    "title": "Mini fridge, hostel size",
    "category": "dorm",
    "price_sgd": 80,
    "condition": "used",
    "pickup": "SUTD hostel (you must carry it yourself)",
    "meetup_window": "Weekend afternoons",
    "includes": ["Ice tray"],
    "defects": ["Door seal a bit weak; drinks still cold"],
    "seller_note": "Graduating, cannot bring home to Jurong. First come first serve.",
    "image_emoji": "🧊"
  },
  {
    "id": "drying-rack-04",
    "title": "Folding laundry rack",
    "category": "dorm",
    "price_sgd": 15,
    "condition": "like-new",
    "pickup": "SUTD campus, Somapah",
    "meetup_window": "After 6pm",
    "includes": [],
    "defects": [],
    "seller_note": "Bought this term, barely used. Too big for my room now.",
    "image_emoji": "🧺"
  },
  {
    "id": "desk-small-05",
    "title": "Small folding desk",
    "category": "dorm",
    "price_sgd": 40,
    "condition": "used",
    "pickup": "SUTD hostel",
    "meetup_window": "Weekend morning",
    "includes": [],
    "defects": ["One foot pad missing; put a book under it"],
    "seller_note": "Fits a laptop and a lamp. Not a full study table.",
    "image_emoji": "🪵"
  },
  {
    "id": "arduino-kit-06",
    "title": "Arduino starter leftovers",
    "category": "course",
    "price_sgd": 18,
    "condition": "used",
    "pickup": "SUTD campus, Somapah",
    "meetup_window": "Weekdays after 5pm",
    "includes": ["Uno board", "jumper wires", "breadboard"],
    "defects": ["Missing the ultrasonic sensor"],
    "seller_note": "Left over from prototyping. Board still flashes fine. No sensors beyond what is listed.",
    "image_emoji": "🔌"
  },
  {
    "id": "calc-fx-07",
    "title": "Casio fx-991EX",
    "category": "course",
    "price_sgd": 22,
    "condition": "like-new",
    "pickup": "SUTD campus, Building 1",
    "meetup_window": "Tue/Thu after 3pm",
    "includes": ["Case"],
    "defects": [],
    "seller_note": "Used for one midterm season. No missing buttons.",
    "image_emoji": "🧮"
  },
  {
    "id": "tablet-draw-08",
    "title": "XP-Pen drawing tablet",
    "category": "course",
    "price_sgd": 55,
    "condition": "used",
    "pickup": "SUTD campus, Somapah",
    "meetup_window": "After studio, around 7pm",
    "includes": ["Pen", "USB cable"],
    "defects": ["Pen nib worn; still works"],
    "seller_note": "Used for sketching and UI wireframes. No screen, it is a pen tablet.",
    "image_emoji": "🖊️"
  },
  {
    "id": "book-design-09",
    "title": "Don't Make Me Think (paperback)",
    "category": "course",
    "price_sgd": 10,
    "condition": "used",
    "pickup": "SUTD campus, library steps",
    "meetup_window": "Weekdays 12–1pm",
    "includes": [],
    "defects": ["Highlighter on two chapters"],
    "seller_note": "Course reading. Notes in pencil in the margin.",
    "image_emoji": "📘"
  },
  {
    "id": "ipad-sketch-10",
    "title": "iPad 8th gen, 32GB",
    "category": "tech",
    "price_sgd": 220,
    "condition": "used",
    "pickup": "SUTD campus, Somapah",
    "meetup_window": "Weekends, text first (simulated)",
    "includes": ["Charging cable"],
    "defects": ["Hairline scratch on back", "Battery health not stated"],
    "seller_note": "Fine for notes and sketching. No Apple Pencil in this listing. Passcode will be wiped.",
    "image_emoji": "📱"
  },
  {
    "id": "monitor-24-11",
    "title": "24 inch HDMI monitor",
    "category": "tech",
    "price_sgd": 70,
    "condition": "used",
    "pickup": "SUTD campus (you carry it to the MRT)",
    "meetup_window": "Sat 2–5pm",
    "includes": ["HDMI cable", "power brick"],
    "defects": ["Faint backlight bleed at the bottom"],
    "seller_note": "Used with a laptop for coding. No speakers. No stand tilt issue.",
    "image_emoji": "🖥️"
  },
  {
    "id": "keyboard-mech-12",
    "title": "Keychron K2 (used)",
    "category": "tech",
    "price_sgd": 90,
    "condition": "used",
    "pickup": "SUTD campus, Somapah",
    "meetup_window": "Weekdays after 6pm",
    "includes": ["USB-C cable"],
    "defects": ["Spacebar slightly rattly"],
    "seller_note": "Brown switches. Works wired. Bluetooth not tested recently — listing does not claim it works.",
    "image_emoji": "⌨️"
  },
  {
    "id": "dongle-usbc-13",
    "title": "USB-C hub, 4-in-1",
    "category": "tech",
    "price_sgd": 16,
    "condition": "like-new",
    "pickup": "SUTD campus, Building 2",
    "meetup_window": "Between classes",
    "includes": ["Pouch"],
    "defects": [],
    "seller_note": "HDMI + USB-A + SD. Used for pitching from a MacBook.",
    "image_emoji": "🔗"
  },
  {
    "id": "bike-fold-14",
    "title": "Folding bike, campus runabout",
    "category": "dorm",
    "price_sgd": 120,
    "condition": "well-used",
    "pickup": "SUTD campus bike racks",
    "meetup_window": "Sunday morning",
    "includes": ["Lock (no key spare)"],
    "defects": ["Gears skip on the highest cog", "Seat worn"],
    "seller_note": "Fine for Somapah to hostel. Not for long road rides. Tyres have air today.",
    "image_emoji": "🚲"
  },
  {
    "id": "laptop-stand-15",
    "title": "Aluminium laptop stand",
    "category": "tech",
    "price_sgd": 14,
    "condition": "like-new",
    "pickup": "SUTD campus, Somapah",
    "meetup_window": "Weekdays after 5pm",
    "includes": [],
    "defects": [],
    "seller_note": "Raises a MacBook to eye level. No cooling fan.",
    "image_emoji": "💻"
  }
]
```

Intentionally incomplete facts (so Q&A can say “the listing does not say”):

- iPad: no battery health
- Keychron: Bluetooth not confirmed
- Mini fridge: no exact litre size
- Bike: no brand

---

## 5. Pages

| Route        | What it does                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| `/`          | Search bar + listing grid. Works with no login.                                     |
| `/item/[id]` | Title, price, condition, pickup, includes, defects, seller note, simulated Reserve. |
| `/notes`     | The scored write-up. Linked in the header.                                          |

Header on every page: name of the shop, Search, Notes. Footer: “Demo for SUTD buyers. Listings are seeded. Reserve is simulated.”

### Home

- Title: **Somapah Swap** (or similar — one campus-sounding name)
- Subtitle: Second-hand course, dorm, and tech gear at SUTD
- Sticky search input: placeholder `cheap fan for hostel, pickup this week`
- Category chips: All / Course / Dorm / Tech (plain filters, not AI)
- Cards: emoji, title, price, condition, pickup
- Empty search state: “No listings match. Try a category or a looser budget.”

### Item

- All schema fields, human-readable
- Primary button: `Reserve (simulated)`
- After click: “This demo does not message a seller or take payment.”
- Link: `Ask about this item` → home or a small ask panel with the item id prefilled

### Phone

- One column
- Cards full width
- Search not hidden behind a desktop-only icon
- Tap targets large enough for a thumb
- Test on a real phone, not only Chrome device mode

---

## 6. Search

User types a sentence. Return **listing cards**, not a chat blob.

Handle queries like:

- `cheap fan for hostel under $30`
- `used iPad for sketching, not cracked`
- `monitor I can carry to the MRT`
- `arduino board leftover from prototyping`

Behaviour:

1. Browser `POST /api/search` with `{ "query": "..." }`.
2. Server reads `data/listings.json` + env key, calls the model.
3. Model (or hybrid logic) returns matching `id`s and a one-line reason each.
4. UI renders those listings from local data. Never let the model invent a listing.

If the model is down: fall back to simple keyword filter on title/note/category, and say in the UI “keyword fallback”. Write that in `/notes`.

---

## 7. Catalogue Q&A

A small ask box on home and/or item page.

Handle questions like:

- `Which desk or stand is better for a hostel room?`
- `Does the iPad include Apple Pencil?`
- `Is $70 fair for the monitor?`
- `Can I pick up the fridge at Somapah the same day?`

Rules for the system prompt (put this in the server route, not the client):

- Use only the listings JSON passed in (or retrieved subset).
- Cite item titles/ids when you claim a fact.
- If a field is missing, say the listing does not say. Do not guess battery health, litres, or Bluetooth.
- Prices are SGD.
- You are a campus shop assistant, not a general chatbot.
- Refuse off-catalogue questions (news, homework, other websites).

Return JSON from `/api/ask`:

```json
{
  "answer": "plain text",
  "cited_ids": ["monitor-24-11"],
  "missing": ["battery health is not in the iPad listing"]
}
```

UI shows the answer plus links to cited items.

---

## 8. Server-side model (required)

```
Browser  →  /api/search or /api/ask  →  process.env.COGNITIO_API_KEY  →  gateway
```

- Key name: `COGNITIO_API_KEY` (or whatever the candidate console uses — **not** `NEXT_PUBLIC_...`)
- Local: `.env.local`, gitignored
- Prod: Vercel → Settings → Environment Variables → Production (and Preview)
- Never put the key in client components, `/notes`, README, screenshots, or git

Gateway URL, header, and body: copy from your candidate console. Do not guess an OpenAI shape if they gave you a gateway.

Minimum viable `/api/ask`:

- Read question + optional `item_id`
- Load listings on the server
- Call the model with a short listing excerpt (id, title, price, condition, pickup, includes, defects, note)
- Return the model text to the client

Prove this in a private browser window before you polish UI.

---

## 9. Stack

- Next.js (App Router) on Vercel
- Listings: `data/listings.json`
- Styling: whatever you can make readable on a phone fast (simple CSS is enough)
- GitHub public repo, keep commit history (small commits: schema → browse → item → api → search → ask → notes)

Repo must not contain `.env*`, `node_modules`, or `.next`.

---

## 10. Ship order

Do not skip ahead.

1. **This session:** Next.js app, `data/listings.json`, `/` grid, `/item/[id]`, deploy Vercel, open on your phone.
2. **Next:** env var + `/api/ask` returns a real model sentence on the live URL.
3. **Then:** `/api/search` returns ranked ids; home search uses it.
4. **Then:** Q&A box with citations + “listing does not say”.
5. **Then:** `/notes` + simulated Reserve label + header/footer honesty.
6. **Before submit:** private window, phone layout, real AI, no key in Network tab except your own `/api/*`.

---

## 11. `/notes` outline (write in your own words)

1. What you built and who it is for — SUTD students, Somapah Swap, course/dorm/tech.
2. What is seeded, simulated, or limited — listings, Reserve, no real sellers.
3. Which AI coding tools you used, and which models power search vs Q&A.
4. What you chose not to build, and why — auth, payments, chat.
5. Known issues and unfinished parts — be specific.

---

## 12. Reviewer test (you run this)

- Site loads on a phone with no login
- Can open `fan-hostel-01` and read defects
- Search `cheap fan for hostel` returns the fan
- Ask `does the iPad include Apple Pencil?` → no, and it does not invent a pencil
- Ask `what is the iPad battery health?` → listing does not say
- `/notes` is public
- GitHub has history and no secrets

---

## 13. Copy snippets

**Header name:** Somapah Swap  
**Tagline:** Used course, dorm, and tech gear at SUTD. Meetup on campus.  
**Search placeholder:** cheap fan for hostel, pickup this week  
**Reserve:** Reserve (simulated)  
**Disclaimer:** Demo catalogue. No real payments or sellers.

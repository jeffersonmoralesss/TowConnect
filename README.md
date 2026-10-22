# Tow Connect

A free, non-profit app that lets a stranded or accident-involved driver see licensed tow operators who are available nearby and call one directly.

The requirements live in the SRS doc. This repo holds the code. IDs like FR-D3 or NFR-4 in this file and in code comments point to requirements in the SRS.

**Contents**

1. [What's in here](#whats-in-here)
2. [Run it](#run-it)
3. [How the whole system fits together](#how-the-whole-system-fits-together)
4. [The database, explained](#the-database-explained)
5. [The driver app, explained](#the-driver-app-explained)
6. [The tests, explained](#the-tests-explained)
7. [Why these choices](#why-these-choices)
8. [Concepts to know](#concepts-to-know)
9. [Next steps](#next-steps)
10. [Change log](#change-log)

---

## What's in here

| Folder | What it is | Status |
| --- | --- | --- |
| `supabase/` | Database schema, security rules, demo data and security tests | Ready |
| `driver-web/` | Driver web app (PWA): check-in, map, operator profiles, call, report | Ready (MVP) |
| `operator-app/` | Operator Android app (React Native + Expo) | Next |
| `admin/` | Admin panel for approving operators and handling reports | Next |

---

## Run it

### The driver app (no accounts needed)

The driver app runs in **demo mode** when no Supabase keys are set. It shows six made-up operators around DC.

```bash
cd driver-web
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). On your phone, use the `Network:` address it prints, on the same Wi-Fi.

### The database security tests

```bash
cd supabase/tests
npm install
npm test
```

You should see `30 passed, 0 failed`.

### Connect the real backend (free)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, run `supabase/migrations/20261020000000_init.sql`.
3. Optional, for testing: run `supabase/seed.sql` to load the six demo operators.
4. In **Project Settings → API**, copy the project URL and the `anon` public key.
5. In `driver-web/`, copy `.env.example` to `.env` and paste both values.
6. Restart `npm run dev`. The "Demo data" label disappears and the app reads live data.

To make yourself an admin, sign up once (later, through the admin panel), then run in the SQL Editor:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'you@example.com';
```

**Before going public:** delete the demo operators with `delete from public.operators where is_demo;`

### Save your work to GitHub

The repo lives at https://github.com/jeffersonmoralesss/TowConnect. The everyday loop after you change something:

```bash
git status                 # see which files changed
git add .                  # stage every change for the next commit
git commit -m "Describe what changed and why"
git push                   # upload your commits to GitHub
```

What stays out of Git, and why (see `.gitignore`):

- `node_modules/`: hundreds of MB of downloaded packages. Anyone can recreate it with `npm install`, because `package.json` and `package-lock.json` record the exact versions.
- `dist/`: the built app. Vercel builds its own copy from the source, so committing it would only cause conflicts.
- `.env`: your Supabase keys. Even though the anon key is public by design, keeping secrets out of Git is a habit worth having from day one; a service-role key in Git would be a real leak.

### Deploy the driver app (free)

Push this repo to GitHub, import it in [Vercel](https://vercel.com), set the root directory to `driver-web`, and add the two environment variables from `.env`. Vercel builds it with `npm run build`.

---

## How the whole system fits together

There are three apps and one backend. Only the driver app exists so far.

```
 Driver's phone                 Supabase (free tier)                 Operator's phone
 ───────────────                ─────────────────────                ────────────────
 Driver web app  ──(1) "who's near me?"──▶  nearby_operators()  ◀──(3) "I'm here"──  Operator app
 (React, in the        ◀──(2) rounded list──  Postgres tables                         (Expo, Android)
  browser)
       │                                          ▲
       └──(4) tap Call ──▶ phone dialer           │
                           (no server involved)   └── Admin panel: approve, verify, suspend
```

1. The driver's browser asks the database for available operators near a point.
2. The database checks who is approved, available, recently seen and properly licensed, rounds their positions, and returns a list sorted by distance.
3. Operators' phones keep sending their position while they are switched to Available.
4. Calling is just a `tel:` link, so the phone's own dialer makes the call. Tow Connect never sits in the middle of the call or the payment.

**The main idea:** all the rules that matter (who is shown, what drivers can see, who can approve whom) live in the database, not in the apps. An app can have a bug, or someone can write their own client against our public key, and the rules still hold. That is why the database is the most carefully tested part.

---

## The database, explained

File: `supabase/migrations/20261020000000_init.sql`. It runs top to bottom once and builds everything.

### Tables

| Table | One row is… | Who can read it |
| --- | --- | --- |
| `admins` | A person allowed to approve operators and read reports | Admins |
| `operators` | A tow company or driver, including their rates | That operator, admins |
| `trucks` | One truck an operator owns (flatbed, wheel-lift, heavy duty) | That operator, admins |
| `operator_documents` | A license or insurance record, plus whether an admin verified it | That operator, admins |
| `operator_positions` | An operator's **current** exact position (one row per operator) | That operator, admins |
| `location_pings` | Position history, deleted after 30 days | That operator, admins |
| `reports` | A driver's complaint about an operator | Admins |

Notice that drivers (the public) can't read **any** table. They get data only through two functions, explained below.

**Why `operator_positions` and `location_pings` are separate:** the map only ever needs the latest position, so that table stays tiny (one row per operator) and fast to search. History is kept separately, only for disputes ("was this truck really nearby?"), and is cleaned out after 30 days for privacy (NFR-5).

**Why rates live on the `operators` row:** the class diagram shows a separate RateCard, but every operator has exactly one rate card. A one-to-one relationship doesn't need its own table; it would only add a join. The RateCard maps to the `hookup_fee`, `per_mile_rate`, `services` and `rate_notes` columns.

### Row Level Security (RLS): the core of the security

Supabase gives the app a public "anon" key that anyone can read from the website's code. That sounds dangerous, and it would be without RLS.

RLS means every table has rules ("policies") that Postgres checks on **every row** of every query, based on who is asking. `auth.uid()` returns the ID of the logged-in user (or nothing for the public). Example:

```sql
create policy "operators read own row; admins read all"
  on public.operators for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
```

Read it as: "a logged-in user may see an operator row only if it's their own, or if they're an admin." Postgres quietly filters out every other row. There is no way to ask around it.

The migration also runs `revoke all on all tables in schema public from anon`, so the public key can't even attempt to read tables.

### Triggers: rules that can't be skipped

A trigger is a function Postgres runs automatically before a row is saved. We use them where a policy isn't enough, because policies decide *which rows* you can touch but not *which columns* you can change.

- **`operators_guard`**: when a normal user creates or edits an operator row, it forces `status` back to its old value (or `pending` for a new row). So an operator can edit their phone number but can't approve themselves. It also forces `is_available` to false unless the operator is approved (FR-O3, FR-O4), and records `available_since`.
- **`documents_guard`**: operators can't mark their own documents verified. If they upload a new file or change the expiry date, verification resets, so an admin has to look again.
- **`positions_touch`**: every position update gets a server timestamp (we never trust the phone's clock) and leaves one row in `location_pings`.

**`is_privileged()`** is how the triggers tell "a real user" from "the project owner." It returns true for admins and for the SQL Editor or service key, and false for normal app users. It must run with the caller's identity (`SECURITY INVOKER`, the default) so it sees who is really calling.

### The two public functions (RPCs)

An RPC ("remote procedure call") is a database function the app calls by name, like calling a function in code. These are the **only** two things the public key can do.

**`nearby_operators(lat, lng, radius_km, limit)`** answers "who can help me?" Step by step:

1. **Clamps the inputs** so a bad request can't ask for a 10,000 km radius or 5,000 results.
2. **Finds eligible operators:** approved, switched to Available, position updated in the last 10 minutes, and holding a verified, unexpired tow license **and** a verified, unexpired insurance record (LR-5). If insurance expires tonight, the operator disappears from the map tomorrow with no human action needed.
3. **Rounds each position to 2 decimal places** (for example 38.93456 becomes 38.93). Each step of 0.01° is about 0.5 to 0.7 miles in DC, so the shown point is never more than about half a mile from the truck. Drivers see the area, never the exact spot (NFR-4).
4. **Measures distance** from the driver to the rounded point with the haversine formula (distance along the Earth's curve), and keeps those inside the radius.
5. **Sorts closest first** and returns only the public profile fields.

It is marked `SECURITY DEFINER`, meaning it runs with the permissions of whoever *created* it, not the anonymous caller. That's what lets it read the private tables. In return it is written so it can only ever return the safe, rounded, public fields. Think of it as a bank teller: you can't walk into the vault, but the teller can bring you exactly what you're allowed to have.

**`submit_report(operator_id, reason, details, contact)`** lets a driver report an operator without an account (FR-D7). It checks the operator exists and isn't just a pending applicant, limits each operator to 20 reports an hour (so one person can't flood the inbox), trims the text, and saves it. Drivers can write reports but can't read any, including their own.

### Housekeeping functions

- `expire_stale_availability()` switches off operators whose phone hasn't sent a position in 30 minutes, for example when the phone died mid-shift (FR-O8).
- `purge_old_pings()` deletes location history older than 30 days (NFR-5).

Only the project owner can run these. The bottom of the migration shows how to schedule them with Supabase's built-in `pg_cron`.

### Storage

Licenses and insurance PDFs go in a **private** bucket called `operator-docs`. Each user can upload only into a folder named with their own user ID (`operator-docs/<user id>/insurance.pdf`), and only that user and admins can open the files.

### Demo data

`supabase/seed.sql` adds six fictional operators with `555-01xx` phone numbers (a range reserved for fiction) and `is_demo = true`, so they're easy to delete in one line before launch.

---

## The driver app, explained

Built with **React** (UI) and **Vite** (dev server and build tool). Folder: `driver-web/`.

```
driver-web/
├── index.html              The single HTML page; React fills in <div id="root">
├── public/
│   ├── manifest.webmanifest   Makes it installable as an app (PWA)
│   ├── sw.js                  Service worker: offline app shell
│   └── icon.svg
└── src/
    ├── main.jsx            Starts React, registers the service worker
    ├── App.jsx             Top-level screens and the data loading
    ├── styles.css          All styling
    ├── components/
    │   ├── CheckIn.jsx         Safety questions before the map
    │   ├── MapView.jsx         The map and its pins
    │   ├── OperatorList.jsx    The numbered list with Call buttons
    │   ├── OperatorSheet.jsx   An operator's full profile
    │   └── ReportForm.jsx      Reporting an operator
    └── lib/
        ├── api.js          Every network call (and demo mode)
        ├── demoData.js     Six sample operators
        ├── geo.js          Location and distance helpers
        └── format.js       Turning data into readable text
```

**How the files depend on each other:** components never fetch data themselves. `App.jsx` loads data through `lib/api.js` and hands it down to components as props. Components report clicks back up through callback props like `onSelect`. This "data flows down, events flow up" pattern means there's exactly one place that owns each piece of state, which makes bugs easier to find.

### `main.jsx`: the starting point

Mounts `<App />` into the page and, in production builds only, registers the service worker. It's off during development so you always see your latest code instead of a cached copy.

### `App.jsx`: the screens and the data

The app has two screens, chosen by one piece of state, `checkedIn`:

- `false` → show `<CheckIn>`.
- `true` → show `<FindTow>` (map and list).

"Start over" sets it back to `false`.

**`FindTow`** owns all the live data:

| State | What it holds |
| --- | --- |
| `userLocation` | The driver's GPS position, or `null` if they said no |
| `searchPoint` | Where to search: the driver's position, or downtown DC as a fallback |
| `operators` | The current list from the database |
| `status` | `loading`, `ready` or `error`, to decide what message to show |
| `selectedId` | Which operator's profile is open |

What happens when it appears:

1. **Ask for location once** (`getCurrentPosition`). If the driver refuses or it times out after 10 seconds, the app still works and searches around downtown DC, and tells them so.
2. **Load operators**, then **refresh every 20 seconds** while the page is visible. The timer skips refreshes while the tab is hidden, which saves the driver's data and battery and our free-tier request budget.
3. If a **background refresh** fails (bad signal), the driver keeps the list they're already looking at. Only a failed *first* load shows the error screen, and that screen always offers "Call 911" and suggests the insurance card's roadside number (NFR-9).

**Why `searchRef`?** The refresh timer calls `load()`. If `load` read `searchPoint` directly, React would create a new `load` function every time the search point changed and we'd have to tear down and restart the timer. Storing the latest value in a ref (a box React doesn't watch) lets `load` stay the same function forever while still reading the newest point.

**Why the map is `lazy()`:** the map library is about 290 KB compressed, roughly four times the rest of the app. `lazy()` splits it into a separate file that only downloads when the map first appears. The safety questions load first, almost instantly, even on one bar of signal, and the map downloads while the driver is answering them. `<Suspense>` shows "Loading map" for the moment in between.

### `CheckIn.jsx`: the safety questions

A **state machine**: the app is always on exactly one `step` (`hurt`, `emergency`, `what`, `police`, `policeTow`, `wait`, `ask`), and each answer moves to another step or finishes. All screens live in one `screens` object, so the whole flow reads top to bottom in one place and changing a question means editing one entry.

```
hurt ──yes──▶ emergency (Call 911) ──▶ what
  └──no────────────────────────────▶ what ──breakdown──▶ map
                                       └──accident──▶ police ──no──▶ map
                                                        └──yes──▶ policeTow ──no──▶ map
                                                                    ├──yes──▶ wait (don't call a 2nd truck)
                                                                    └──not sure──▶ ask
```

- **Injury comes first** and shows a red Call 911 button before anything about towing (LR-9).
- **If police already called a tow**, the app tells the driver to wait instead of calling another truck (LR-4). That's the legal safeguard from the research: officers can override the driver's choice, and Virginia bars taking a car that has a police-initiated tow.
- Each finishing answer passes a `notice` (for example "Tell the officer which company is coming") that shows above the list.
- `history` is a stack of past steps, so **Back** always returns to the actual previous question, whatever path the driver took.
- When a new question appears, focus moves to its heading so screen readers announce it.

### `lib/api.js`: the only file that talks to the network

It exports two functions, `fetchNearbyOperators` and `submitReport`. Each one checks `isDemo` first:

- **Demo mode** (no keys in `.env`): answers from `demoData.js` after a short fake delay, rounding positions and sorting by distance **exactly like the database function does**, so the app behaves the same either way.
- **Live mode:** calls the database RPCs with the Supabase client.

**Why this way:** components don't know or care which mode is on. When we connect the real backend, nothing outside this file changes. The client is also created with `persistSession: false`, because drivers never log in, so there's nothing to store.

### `lib/geo.js` and `lib/format.js`: small helpers

- `geo.js`: the downtown DC fallback point, rounding, the haversine distance formula, "About 1.3 mi" wording, and `getCurrentPosition`, which wraps the browser's callback-style location API in a Promise that **always resolves** (to `null` on failure) so the caller never has to handle a crash.
- `format.js`: turns raw data into text: `wheel_lift` → "Wheel-lift", `95` → "$95", rates into "$95 hookup + $4.50/mi", phone numbers into `tel:` links.

Keeping these as plain functions with no React in them means they're easy to read and easy to test on their own.

### `MapView.jsx`: the map

Uses **MapLibre GL**, an open-source map library, with free map tiles from OpenFreeMap.

**The tricky part:** React wants to own all the HTML on the page, but MapLibre draws its own map and manages its own markers. If React re-rendered the map, it would destroy and rebuild it constantly. So:

1. The map is **created once** in an effect with an empty dependency list, and stored in a ref.
2. **Separate effects push changes into it**, each watching only what it needs:
   - search point changed → recenter,
   - driver position changed → move the blue "you" dot,
   - operator list changed → add, move or remove truck pins.
3. Pins are kept in a JavaScript `Map` keyed by operator ID, so on each refresh an existing pin is **moved**, not deleted and recreated. That avoids flicker.
4. **Framing:** the first time trucks load for a search point, the map zooms to show the driver plus the three closest trucks. It does this only once per search point, so the 20-second refresh never yanks the map away while the driver is panning it.

Other details:

- Pins are real `<button>`s with labels like "Brookland Recovery, number 1 on the list," so they work with a keyboard and screen readers. The number on each pin matches the number in the list.
- The pin is anchored by the tip of its tail (`offset: [0, -9]`), so the point it marks is accurate.
- `setWorkerUrl(...)`: MapLibre does heavy work in a background thread (a web worker) stored in a separate file. After Vite bundles everything, MapLibre can't find that file on its own, so we import its URL and hand it over. Without this line the map silently stays blank.
- Animations are skipped when the map is still loading (they would wait for it and never run) or when the phone has "reduce motion" turned on.
- If the map can't start at all (some old phones lack WebGL), it shows a message and the list still works.

### `OperatorList.jsx`: the list

A numbered list, closest first. Each row is two separate controls: the name area opens the profile, and the amber **Call** button dials directly. That's deliberate. In an emergency, the fastest path from opening the link to a ringing phone is three taps for a breakdown: "No one is hurt," "My car broke down," "Call" (NFR-3).

### `OperatorSheet.jsx`: the operator profile

Opens as a bottom sheet on phones (thumb-reachable) and a centered dialog on desktop. Shows the big Call button, rates, truck type, services, license and USDOT numbers (FR-D2), the DC towing Bill of Rights link (LR-6), and "Report this operator" (FR-D7). It also says "Confirm the total price on the phone before the truck is sent," which protects drivers from surprise charges.

Accessibility details: it's marked as a modal dialog, focus moves to the close button when it opens, and Escape closes it.

Demo operators show "Sample operator for testing" instead of the green "Licensed and insured" badge, so a test listing can never look verified.

### `ReportForm.jsx`: reporting

A short form: a required reason (radio buttons), optional details, optional contact info. It shows a clear error if no reason is picked, disables the button while sending so it can't be sent twice, and shows "Report sent" when done. The reasons include "Showed up or contacted me without being called," which is how we'd catch an operator using the app to chase accidents (LR-1, LR-3).

### `styles.css`: the look, and why

- **Colors are variables** at the top (`--beacon`, `--danger`, …), redefined for dark mode, so the whole app switches themes from one place.
- **Amber is reserved for Call; red is reserved for 911.** Nothing else on the screen uses those colors, so a stressed driver's eye goes straight to the action. The amber line on top of the header echoes the light bar on a tow truck.
- **Typeface:** Atkinson Hyperlegible, designed by the Braille Institute so similar letters (like I, l and 1) are hard to confuse. That matters when someone is reading a phone in sunlight, rain or panic. Headings use Barlow Semi Condensed, which looks like road signage.
- **Big targets:** answer buttons are 72 px tall and Call buttons at least 60 px, well above the usual 44 px minimum, because hands shake after an accident.
- **Layout:** on phones, map on top and list below; on screens 900 px and wider, list on the left and map on the right.

### `public/sw.js` and the manifest: making it a PWA

The **manifest** lets someone add Tow Connect to their home screen like an app. The **service worker** is a small script the browser runs in the background:

- **Pages:** try the network first; if there's no signal, show the cached app instead of the browser's "no internet" page.
- **Built files** (`/assets/...`): serve from the cache after the first visit, so the app opens instantly next time.
- **Operator data is never cached.** Requests to Supabase go to a different address, and the worker ignores anything not from our own site. A driver must never see a stale list of trucks that have since gone offline.

---

## The tests, explained

File: `supabase/tests/security.test.mjs`.

It uses **PGlite**, real Postgres compiled to run inside Node.js, so it needs no install and no Supabase account. The test:

1. Creates stand-ins for the Supabase pieces our migration expects: the `anon` and `authenticated` roles, `auth.users`, `auth.uid()` (which reads a setting the test controls), and a minimal `storage` schema.
2. Runs the real migration and seed files, unchanged.
3. Pretends to be different people by switching roles (`set role anon`) and setting who `auth.uid()` returns, then checks what each person can and can't do.

What the 30 checks cover:

- **The public:** sees exactly the 6 demo operators near DC, positions are rounded, sorted by distance, nobody shows up from New York, can't read any table, can't run housekeeping, can file a report but can't read reports.
- **An operator signing up:** is forced to `pending`, can't approve themselves, can't go Available while pending, can't verify their own documents, and is invisible to other users.
- **After admin approval:** appears on the map at the rounded position, and each position update leaves exactly one history row.
- **Automatic removal:** expired insurance hides them, a position older than 10 minutes hides them, housekeeping switches stale operators off, and a suspended operator can't switch back on.
- **Re-uploading a document** resets its verification.
- **Storage:** an operator can upload to their own folder but not someone else's.

**Why test the database and not the screens first:** a bug in the screens is visible and annoying; a bug in the security rules is invisible and dangerous (leaked locations, self-approved operators). The screens were checked by clicking through every flow in a headless browser.

---

## Why these choices

| Decision | What we chose | Alternatives considered | Why this one |
| --- | --- | --- | --- |
| Driver app type | Web app (PWA) | Native iOS/Android app | Someone on the shoulder won't download an app. A link opens instantly on any phone, and there's no app store fee or review. |
| Operator app type | Native app with Expo (next) | Web app | Operators must keep sharing location while Google Maps is open in front. Web apps stop getting GPS when they're in the background; native apps don't. |
| Backend | Supabase | Firebase, a custom server | Free tier fits; real Postgres means real SQL, triggers and RLS. Firebase's free limit of 20,000 writes a day is too tight for location updates, and a custom server means hosting and patching something ourselves. |
| Where rules live | In the database (RLS, triggers, RPCs) | In app code | Rules in the database protect every client, including ones we didn't write. Rules in app code protect only that app. |
| Hiding exact positions | Round inside the database | Round in the driver app | If the app rounded them, the exact numbers would still arrive on the driver's phone and anyone could read them in the browser's network tab. |
| Map | MapLibre + OpenFreeMap | Mapbox, Google Maps | Free with no account, no key and no card on file. Mapbox can be swapped in with one setting (`VITE_MAP_STYLE_URL`). |
| Live updates | Refresh every 20 s | Supabase Realtime (push) | Realtime would push exact coordinates to drivers' phones. Polling the rounding function keeps them private and still meets the 60-second freshness target (NFR-2). Realtime comes with help requests in Release 2. |
| Driver accounts | None | Sign-up required | Every extra step costs time in an emergency, and storing driver data creates privacy duties we don't need. |
| Demo mode | Built into `api.js` | Require a backend from day one | Anyone can run and review the app in a minute, and front-end work isn't blocked on backend setup. |
| Calling | `tel:` links | A calling service (for example Twilio) | Free, works on every phone, and keeps us out of the middle of the call. |

---

## Concepts to know

Short definitions for explaining the project to someone else.

- **React component:** a function that returns what a piece of the screen should look like. React updates the page when its data changes.
- **State (`useState`):** data a component remembers between renders, like which operator is selected. Changing it re-draws the screen.
- **Effect (`useEffect`):** code that runs after React draws, for things outside React: starting a timer, asking for location, driving the map. The function it returns is the cleanup (stop the timer, remove the map).
- **Ref (`useRef`):** a box that holds a value across renders *without* causing a re-render. Used for the map object and the latest search point.
- **Props:** inputs passed from a parent component to a child, like `operators` into `<OperatorList>`.
- **Lazy loading / code splitting:** downloading a piece of the app only when it's first needed.
- **PWA (progressive web app):** a website that can be installed to the home screen and work with a weak connection.
- **Service worker:** a background script that can answer the page's network requests, for example from a cache.
- **Supabase:** a hosted Postgres database plus login, file storage and an automatic API.
- **anon key:** Supabase's public key. Safe to put in a website *only because* RLS and revoked permissions limit what it can do.
- **RLS (Row Level Security):** per-row access rules Postgres enforces on every query.
- **Trigger:** a function the database runs automatically before or after a row changes.
- **RPC:** calling a database function by name from the app.
- **`SECURITY DEFINER`:** a function that runs with its creator's permissions, used to hand out exactly the safe data and nothing more.
- **Haversine formula:** the standard way to compute distance between two latitude/longitude points on a sphere.

---

## Next steps

In order, with the reason for the order:

1. **Put the project on GitHub.** Free version history and a backup, and Vercel deploys from it.
2. **Create the Supabase project and connect the driver app.** Proves the real backend works end to end before we build on it.
3. **Build the operator app** (Expo, Android first). Without operators the map is empty, so this unblocks everything else. Testing needs an Android phone with the free Expo Go app.
4. **Build the admin panel.** Needed to approve the first real operators.
5. **Open the Google Play developer account early** ($25 once). New personal accounts must run a closed test with 12 testers for 14 straight days before publishing, so starting the clock early saves two weeks at the end.
6. **Legal checks:** take the terms, privacy policy and accident flow to a free legal clinic, and ask MPD or DLCP how they treat driver-chosen tows in DC.
7. **Recruit 10 to 20 DC operators,** who can also be the 12 Play Store testers.
8. **Deploy the driver app on Vercel and launch.**

---

## Change log

Every change gets an entry here: what changed, how it works, and why it was done that way. Newest first.

### 2026-10-22: Add the Git workflow to the README

- **What changed:** Added "Save your work to GitHub" under Run it.
- **How it works:** Git tracks changes in commits on your computer; `git push` copies those commits to GitHub. `.gitignore` lists files Git should never track.
- **Why:** The repo is now on GitHub, so the everyday commands and the reason certain files stay out belong next to the instructions for running the app.

### 2026-10-22: Tidy imports, add explanatory comments, write this guide

- **What changed:** In `App.jsx`, the `const MapView = lazy(...)` line sat between two `import` lines. It's now below all imports. Added comments in `App.jsx`, `MapView.jsx`, `CheckIn.jsx` and `api.js` explaining the less obvious parts, and wrote the explanation sections of this README.
- **How it works:** No behavior changed. JavaScript moves all `import`s to the top before running anything (called "hoisting"), so the old order worked, but it read as if `MapView` were created before the other imports existed.
- **Why:** Code should read in the order it actually runs. Anyone reviewing it, including you explaining it to someone else, shouldn't have to know about hoisting to follow it.

### 2026-10-20: First version (v0.1)

- **What changed:** Created the database schema, security rules, demo data and 30 security tests, plus the complete MVP driver web app.
- **How it works:** See the sections above.
- **Why:** The database rules come first because every app depends on them and mistakes there are the most dangerous. The driver app comes next because it's the part the public sees and it can run on demo data before any operator exists.
- **Bugs found and fixed while testing it:**
  - The map stayed blank after building, because MapLibre couldn't find its background worker file. Fixed by importing the worker's URL and passing it to `setWorkerUrl`.
  - The map didn't zoom to fit the trucks, because an animated zoom waits for the map to finish loading. Fixed by jumping instantly while loading and animating only afterward.
  - Pins were drawn well below their real spot (almost 90 px in one test), because our CSS `position: relative` overrode MapLibre's own positioning. Fixed by removing that rule and anchoring pins by their tail tip.

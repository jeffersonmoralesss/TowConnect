# Tow Connect

A free, non-profit app that lets a stranded or accident-involved driver see licensed tow operators who are available nearby and call one directly.

The requirements live in the SRS doc. This repo holds the code. IDs like FR-D3 or NFR-4 in this file and in code comments point to requirements in the SRS.

**Contents**

1. [What's in here](#whats-in-here)
2. [Run it](#run-it)
3. [How the whole system fits together](#how-the-whole-system-fits-together)
4. [The database, explained](#the-database-explained)
5. [The driver app, explained](#the-driver-app-explained)
6. [The operator app, explained](#the-operator-app-explained)
7. [iPhone operators: web app and auto check-in, explained](#iphone-operators-web-app-and-auto-check-in-explained)
8. [The tests, explained](#the-tests-explained)
9. [Why these choices](#why-these-choices)
10. [Concepts to know](#concepts-to-know)
11. [Next steps](#next-steps)
12. [Change log](#change-log)

---

## What's in here

| Folder | What it is | Status |
| --- | --- | --- |
| `supabase/` | Database (two migrations), security rules, demo data and security tests | Ready |
| `driver-web/` | Driver web app (PWA): check-in, map, operator profiles, call, report | Ready (MVP) |
| `operator-app/` | Operator app for Android (React Native + Expo): sign-up, documents, Available switch, background location | Ready (MVP) |
| `operator-web/` | Operator web app for iPhones: the same screens, plus auto check-in through an iPhone shortcut | Ready (MVP) |
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

### The tests

```bash
cd supabase/tests        # database security rules
npm install
npm test                 # expect: 50 passed, 0 failed

cd ../../operator-app    # operator app logic (no phone needed)
npm install
npm test                 # expect: pass 19, fail 0

cd ../operator-web       # shared files haven't drifted between the two operator apps
npm install
npm test                 # expect: pass 5, fail 0
```

### Connect the real backend (free)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, run each file in `supabase/migrations/` **in name order**: first `20261020000000_init.sql`, then `20261109000000_iphone_checkin.sql`. If you already ran the first one, run only the second. Each file runs once.
3. Optional, for testing: run `supabase/seed.sql` to load the six demo operators.
4. In **Settings → API Keys** (or the project's **Connect** button), copy the project URL and the **publishable** key (starts with `sb_publishable_`). The older `anon` key also works, but Supabase plans to retire it by the end of 2026. **Never** use the secret or `service_role` key in an app.
5. In `driver-web/`, copy `.env.example` to `.env` and paste both values. Do the same in `operator-app/` and `operator-web/`. (The variables are still named `..._ANON_KEY` because the publishable key acts as the database's `anon` role.)
6. Restart `npm run dev`. The "Demo data" label disappears and the app reads live data.
7. For development, turn off email confirmation so test sign-ups work instantly: **Authentication → Sign In / Providers → Email → Confirm email** off. Turn it back on before launch.

**Approve a test operator** (until the admin panel exists), in the SQL Editor, with the company name you signed up with:

```sql
update public.operators set status = 'approved' where company_name = 'Your Test Towing';
update public.operator_documents set verified = true
where operator_id = (select id from public.operators where company_name = 'Your Test Towing');
```

This works from the SQL Editor because it runs as the project owner; the database triggers block the same change from the app.

To make yourself an admin, sign up once (later, through the admin panel), then run in the SQL Editor:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'you@example.com';
```

**Before going public:** delete the demo operators with `delete from public.operators where is_demo;`

### The operator app (needs the backend above)

Background location, the core feature, doesn't run in the free Expo Go app. It needs a **development build**: your own copy of the app with the native location code compiled in. Without an Android phone, you run it in the free Android emulator on your Mac.

**One-time setup on a Mac** (from [Expo's emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/)):

1. Install Java 17: `brew install --cask zulu@17` (needs [Homebrew](https://brew.sh)).
2. Install [Android Studio](https://developer.android.com/studio), choose the **Standard** setup, and accept the licenses.
3. In Android Studio: **Settings → Languages & Frameworks → Android SDK**. On **SDK Platforms**, under Android 16 (Baklava), check **Android SDK Platform 36**. On **SDK Tools**, check **Android SDK Build-Tools** and **Android Emulator**. Apply.
4. Add these lines to `~/.zshrc`, then open a new terminal:
   ```bash
   export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
   Check with `adb --version`.
5. In Android Studio: **More Actions → Virtual Device Manager → Create virtual device**, pick a recent Pixel, download a system image, **Finish**, then press Play to start it.

**Run it:**

```bash
cd operator-app
npm install
npm run android      # builds the development build and installs it on the running emulator
```

The first build takes several minutes; later ones are much faster. After that, `npm start` is enough while you edit JavaScript.

**Give the emulator a DC location:** in the emulator's side toolbar, click **⋯ (Extended controls) → Location**, search for an address in DC (or enter 38.9335, -76.9973), and click **Set location**. The **Routes** tab can even simulate a truck driving between two points.

**The end-to-end test:** sign up in the operator app, fill in the company, add a truck, upload any PDF or image as the license and insurance, approve yourself with the SQL above, reopen the app, tap **Go Available**, and choose **Allow all the time**. Then open the driver app (connected to the same Supabase project) and your test truck appears near the location you set.

**Quick test on an iPhone, if you have one:** install **Expo Go** from the App Store, run `npm start` in `operator-app`, and scan the QR code with the Camera app. Everything works except background sharing: location is sent only while the app is on screen, and the app tells you so.

### The operator web app, for iPhones (needs the backend above)

```bash
cd operator-web
npm install
npm run dev          # opens on http://localhost:5174, so it can run next to the driver app (5173)
```

**Try it on an iPhone:** use the `Network:` address it prints, on the same Wi-Fi. Location only works on `https://` addresses or `localhost`, so on a phone the Available button will report that location is blocked until the app is deployed (see "Deploy the web apps"). Everything else (sign-up, documents, approval) works over the network address. On your Mac, `localhost` works fully.

**End-to-end test with your dad:** deploy `operator-web`, have him open it in Safari, add it to his home screen, sign up, and finish the checklist. Approve him with the SQL above, then follow "Build the check-in shortcut" in the iPhone section below and send him the link.

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
- `dist/`: the built app. The hosting service builds its own copy from the source, so committing it would only cause conflicts.
- `operator-app/android/` and `operator-app/ios/`: generated by `npm run android` / `npm run ios` from `app.json`. Expo recreates them whenever needed, so the settings in `app.json` are the source of truth.
- `.env`: your Supabase keys. Even though the anon key is public by design, keeping secrets out of Git is a habit worth having from day one; a service-role key in Git would be a real leak.

### Deploy the web apps (free)

We'll host on **Cloudflare Pages**: its free plan has no "non-commercial only" rule (Vercel's free Hobby plan does) and no bandwidth limit for a site like this. Each web app is its own Pages project, connected to the GitHub repo:

| Setting | Driver app | Operator web app |
| --- | --- | --- |
| Root directory | `driver-web` | `operator-web` |
| Build command | `npm run build` | `npm run build` |
| Build output directory | `dist` | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | the same two, plus `VITE_CHECKIN_SHORTCUT_URL` |

Every `git push` then rebuilds both sites. A full click-by-click walkthrough comes when we deploy.

---

## How the whole system fits together

There are four front ends and one backend: the driver web app, the Android operator app, the iPhone operator web app (with its check-in shortcut), and the admin panel, which is next.

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
3. Operators' phones send their position while they are switched to Available: Android every minute in the background, iPhones every minute while the web app is open plus a check-in each time they open Maps or their dispatch app.
4. Calling is just a `tel:` link, so the phone's own dialer makes the call. Tow Connect never sits in the middle of the call or the payment.

**The main idea:** all the rules that matter (who is shown, what drivers can see, who can approve whom) live in the database, not in the apps. An app can have a bug, or someone can write their own client against our public key, and the rules still hold. That is why the database is the most carefully tested part.

---

## The database, explained

Files: `supabase/migrations/20261020000000_init.sql` builds everything; `20261109000000_iphone_checkin.sql` adds iPhone check-ins and adjusts two time limits (explained in the iPhone section). Each runs top to bottom once.

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

An RPC ("remote procedure call") is a database function the app calls by name, like calling a function in code. These two, plus `checkin` from the second migration (see the iPhone section), are the **only** things the public key can do.

**`nearby_operators(lat, lng, radius_km, limit)`** answers "who can help me?" Step by step:

1. **Clamps the inputs** so a bad request can't ask for a 10,000 km radius or 5,000 results.
2. **Finds eligible operators:** approved, switched to Available, position updated in the last 30 minutes (10 before the second migration), and holding a verified, unexpired tow license **and** a verified, unexpired insurance record (LR-5). If insurance expires tonight, the operator disappears from the map tomorrow with no human action needed.
3. **Rounds each position to 2 decimal places** (for example 38.93456 becomes 38.93). Each step of 0.01° is about 0.5 to 0.7 miles in DC, so the shown point is never more than about half a mile from the truck. Drivers see the area, never the exact spot (NFR-4).
4. **Measures distance** from the driver to the rounded point with the haversine formula (distance along the Earth's curve), and keeps those inside the radius.
5. **Sorts closest first** and returns only the public profile fields.

It is marked `SECURITY DEFINER`, meaning it runs with the permissions of whoever *created* it, not the anonymous caller. That's what lets it read the private tables. In return it is written so it can only ever return the safe, rounded, public fields. Think of it as a bank teller: you can't walk into the vault, but the teller can bring you exactly what you're allowed to have.

**`submit_report(operator_id, reason, details, contact)`** lets a driver report an operator without an account (FR-D7). It checks the operator exists and isn't just a pending applicant, limits each operator to 20 reports an hour (so one person can't flood the inbox), trims the text, and saves it. Drivers can write reports but can't read any, including their own.

### Housekeeping functions

- `expire_stale_availability()` switches off operators whose phone hasn't sent a position in 3 hours, for example when the phone died mid-shift (FR-O8). It was 30 minutes before the second migration.
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

## The operator app, explained

Built with **Expo**, a toolkit on top of **React Native**. React Native uses the same React ideas as the driver app (components, state, effects), but draws real phone controls instead of HTML. Folder: `operator-app/`.

```
operator-app/
├── index.js              Entry point. Defines the background task FIRST, then starts the app
├── App.js                Picks which screen to show from the sign-in and the operator row
├── app.json              App name, IDs, and the location permission settings
├── .env.example          Where the Supabase URL and key go
├── src/
│   ├── theme.js              Colors and touch-target size (same palette as the driver app)
│   ├── components/
│   │   ├── ui.js                 Shared building blocks: Screen, Button, Field, Banner…
│   │   ├── TrucksSection.js      Add and remove trucks
│   │   └── DocumentsSection.js   Upload license and insurance, with expiry dates
│   ├── screens/
│   │   ├── AuthScreen.js         Sign in / create account
│   │   ├── ProfileForm.js        Company, phone, license, services, rates
│   │   ├── SetupScreen.js        Checklist, then "waiting for approval"
│   │   ├── HomeScreen.js         The Available switch
│   │   └── SuspendedScreen.js    Shown if an admin pauses the account
│   ├── lib/
│   │   ├── supabase.js           The Supabase client and where the login is saved
│   │   ├── api.js                Every database and storage call
│   │   ├── useOperatorData.js    Loads trucks and documents (a custom hook)
│   │   ├── documents.js          Rules for "verified / in review / expiring / expired"
│   │   ├── validate.js           Form checks that mirror the database's rules
│   │   └── dates.js              Date formatting without time-zone surprises
│   └── location/
│       ├── task.js               The background task the phone wakes up
│       ├── tracking.js           Start and stop sharing; background vs foreground mode
│       ├── report.js             Sends one position, remembering what was sent
│       └── throttle.js           Decides which GPS fixes are worth sending
└── tests/                    Tests for throttle, documents, validate and dates
```

### `App.js`: which screen, decided by data

The app shows exactly one screen, chosen from two facts: **who is signed in** (`session`) and **their operator row** (`operator`).

```
not signed in ──▶ AuthScreen
signed in, no operator row ──▶ ProfileForm ──save──▶ SetupScreen (status 'pending')
                                                        │ admin approves
                                                        ▼
                                                     HomeScreen (status 'approved') ◀─▶ ProfileForm (edit)
                                       admin suspends ──▶ SuspendedScreen
```

- `supabase.auth.onAuthStateChange` fires at startup with the saved login, and again on every sign-in and sign-out, so the screen always matches reality.
- Every time the app comes back to the screen (`AppState` becomes `active`), it reloads the operator row. That's how an approval shows up without signing out and back in.
- **Why no navigation library:** with five screens chosen by data, a navigator would add a dependency and a way to get "back" to a screen that no longer makes sense (like the sign-up form after approval). The driver app uses the same pattern.

### `lib/supabase.js`: staying signed in

Creates the Supabase client with `expo-sqlite/localStorage` as storage, which is what Expo's current Supabase guide uses. The login session is saved in a tiny database on the phone, so operators stay signed in. The token refresh timer runs only while the app is on screen; when a background request needs a fresh token, supabase-js refreshes it just before sending.

### `lib/api.js`: everything the app reads and writes

One file lists every call: get or save the operator row, switch Available, add or remove trucks, upload documents, and send a position. Some details worth knowing:

- `unwrap()` turns Supabase's `{ data, error }` replies into "return data or throw", so screens can use plain `try/catch`.
- `setAvailable()` returns **what the database actually stored**. If the operator isn't approved, the database trigger forces `false` and the app finds out from the reply. The app never assumes it was allowed.
- `uploadDocument()` reads the picked file as raw bytes and uploads it to `operator-docs/<user id>/...`, the only folder the storage rules allow. Then it adds a **new** `operator_documents` row instead of replacing the old one. That way an operator renewing their insurance stays on the map under the old, still-valid record while an admin checks the new one.
- `sendPosition()` uses **upsert** (insert the first time, update after) because `operator_positions` holds exactly one row per operator.

### `lib/validate.js` and `lib/documents.js`: rules as plain functions

- `validate.js` mirrors the database's own checks (the same phone pattern, the same length limits), so the operator sees "Use digits only" next to the right field instead of a raw database error. The database still enforces them; this just explains them sooner.
- `documents.js` decides what to show for each document, using the **same rule as the database**: a document counts only when it is verified and not past its expiry date. It also flags documents expiring within 30 days, so operators renew before they vanish.
- Neither file uses React or the network, which is why they can be tested on your computer with no phone (`npm test`).

### Screens

- **`AuthScreen`**: email and password. The SRS allowed phone or email sign-in; phone sign-in sends text messages, which cost money per message, and the project has to stay free.
- **`ProfileForm`**: one form for creating and editing. One `form` state object holds all the fields, and `set('phone')` makes a change handler for any field. After approval the license field is locked and the app doesn't even send it, because the database would ignore the change anyway (an admin verified that exact number).
- **`SetupScreen`**: a three-step checklist (company, a truck, both documents uploaded), then "Waiting for approval" with a **Check approval status** button.
- **`HomeScreen`**: one big **Go Available / Go offline** button, the time the location was last sent, warnings about weak signal, foreground-only mode or expiring documents, and a preview of what drivers see.
- **`SuspendedScreen`**: explains that a reviewer paused the account.

### Location sharing: the most important part

This is the feature that needs a native app, so it's worth understanding step by step.

**Going Available** (`HomeScreen` → `tracking.startSharing()`):

1. Check that location is on, then ask for **foreground** permission. Expo's docs say to get this before asking for background permission.
2. Remember the operator ID, get one position right away and send it, so the truck appears without waiting.
3. Ask for **background** permission ("Allow all the time"). If granted, start the background task with an Android **foreground service**: the permanent notification Android requires for any app using location in the background. It also reminds the operator they're live.
4. If background permission is refused, or the app is running in Expo Go, fall back to **foreground mode**: location is shared only while the app is open, and the screen says so.
5. Only **after** location works does the app tell the database `is_available = true`. A truck should never be listed without a position.

**Going offline** does the reverse in the opposite order: stop sending first, then switch Available off, so no position is sent after the operator goes offline.

**Why the task is defined in `index.js`:** when Android wakes the app just to deliver a location, it runs the app's code without showing any screen. If the task were defined inside a screen, it wouldn't exist yet and the location would be lost. Expo requires it at the top level.

**Why `report.js` uses `localStorage` instead of variables:** a background wake-up can start a fresh copy of the JavaScript with empty variables. The operator ID and the last position sent are saved on the phone so the task still knows who it's reporting for.

**How often positions are sent** (`throttle.js`, all covered by tests):

| Rule | Why |
| --- | --- |
| Always send the first fix | The truck appears immediately |
| Send at least once a minute, even when parked | A parked truck waiting for calls is the common case, and the database hides positions older than 30 minutes |
| Send early after moving 150 m, but at most every 15 s | A moving truck stays roughly accurate without draining the battery |
| Skip fixes less accurate than 250 m, unless nothing was sent for 2 minutes | One bad reading shouldn't jump the truck across town |

**Why "Balanced" accuracy instead of GPS-level "High":** drivers only ever see a position rounded to about half a mile, so pinpoint GPS would cost battery and buy nothing.

**When the app reopens:** if the database says the operator is Available but nothing is sharing (for example, the phone restarted), the home screen restarts sharing so the switch tells the truth. If it can't, the operator sees the error and can go offline.

### `app.json`: the permission settings

The `expo-location` plugin turns on Android's background location and foreground-service permissions and sets the text people see in the permission prompts. That text says plainly what's shared and when, which is also what Google Play reviews when an app asks for background location.

---

## iPhone operators: web app and auto check-in, explained

**The problem:** most tow operators, including the first test company, use iPhones. Publishing the real app on iPhone costs $99 a year, and web pages on iPhone stop running the moment you switch apps or lock the phone. Those operators keep their phone in a pocket or a mount, with Maps or a dispatch app in front.

**The free answer has three parts:**

```
 Operator's iPhone                                         Supabase
 ─────────────────                                         ────────
 Operator web app (home screen) ──while open, every minute──▶ operator_positions (signed in)
        │ makes a check-in code once
        ▼
 Shortcuts app: "Tow Connect Check-in"
   runs automatically when Maps / dispatch app opens,
   or the truck's Bluetooth / CarPlay connects  ──checkin(code, lat, lng)──▶ checkin() ──▶ operator_positions
```

1. **The operator web app** (`operator-web/`) does everything the Android app does: sign-up, documents, trucks, the Available button. It shares location every minute while it's on screen, and can keep the screen awake for phones in a dash mount.
2. **The auto check-in shortcut** sends the operator's location whenever they open Maps or their dispatch app, which they do all day anyway. It uses a personal check-in code instead of a login.
3. **Freshness rules in the database** were adjusted so these "moment" check-ins work: a position counts for 30 minutes, and drivers see its age.

### The database changes (`supabase/migrations/20261109000000_iphone_checkin.sql`)

**Why a second migration file instead of editing the first:** your Supabase project already ran the first file. Migrations are a history, applied in order: a database that has file 1 only needs file 2. If we edited file 1, your project would never get the change. The tests run every file in `migrations/` in name order, the same way.

**`operator_checkin_codes`**: one row per operator, holding a **hash** of their code, never the code itself.

- A hash (SHA-256 here) is a one-way fingerprint: easy to compute from the code, impossible to turn back into the code. When a check-in arrives, the database hashes the code it was sent and looks for that fingerprint. This is the same reason websites store password hashes: if the table ever leaked, the codes still couldn't be used.
- Because only the hash is stored, the code can be shown **once**, right after it's made. Lost it? Make a new one, which also cancels the old one.
- The code is 64 random characters built from two `gen_random_uuid()` values, which come from Postgres's secure random generator. Guessing one is not realistic.

**`create_checkin_code()`** and **`delete_checkin_code()`**: only a signed-in operator can call them, and only for their own row (they look the operator up with `auth.uid()`).

**`checkin(code, lat, lng)`**: the only thing the shortcut can do. It's callable with the public key, like `nearby_operators`, and it's `SECURITY DEFINER` for the same "bank teller" reason. Step by step:

1. Rejects anything that isn't a 64-character code, then looks up the hash. A wrong code gets "not recognized," and never a hint about whether someone else's code exists.
2. Rejects an impossible location (latitude outside -90 to 90, for example).
3. Records when the code was last used, so the operator sees "Last check-in: 3 min ago" in the app.
4. **Refuses if the operator is offline or not approved.** The shortcut only updates *where* they are; going Available stays a deliberate tap in the app. Otherwise, opening Maps on a day off would put them on the map.
5. Ignores a second check-in within 15 seconds (opening Maps and then the dispatch app back to back), so the history isn't doubled.
6. Saves the position through the same `operator_positions` table, so the existing trigger stamps the time and keeps the 30-day history. Nothing downstream needed to change.

It answers with a short message (`{"ok": false, "message": "You're offline in Tow Connect..."}`), which the shortcut shows as a notification when something is wrong.

**The two timing changes**, and why they work together:

| Rule | Before | Now | Why |
| --- | --- | --- | --- |
| A position stays on the driver map for | 10 min | **30 min** | iPhone positions arrive at moments, not every minute. Drivers see "Location from 14 min ago," so nobody is misled. |
| An operator is switched offline after no position for | 30 min | **3 hours** | Between 30 minutes and 3 hours the operator is hidden but still Available, so their next check-in puts them straight back on the map without opening the app. |

Android phones still send every minute, so for them nothing changes in practice.

### The operator web app (`operator-web/`)

A Vite + React app, like the driver app, with the same screens as the Android app. Most of it was ported line for line:

```
operator-web/
├── index.html            Home-screen settings for iPhone (name, icon, full-screen)
├── public/               Icon (SVG, plus a 180×180 PNG because iPhones need one), manifest
├── src/
│   ├── App.jsx               Same screen rules as operator-app/App.js
│   ├── lib/api.js            Same calls as the Android app, plus the check-in code functions
│   ├── lib/useOperatorData.js   Copied unchanged from the Android app
│   ├── shared/               Four files copied unchanged from the Android app (see below)
│   ├── location/sharing.js   Location while the page is open, and "keep screen on"
│   ├── components/
│   │   ├── CheckinSection.jsx   Make a code, copy it, setup steps, last check-in time
│   │   ├── InstallHint.jsx      "Add to Home Screen" tip, only in iPhone Safari
│   │   └── ui, TrucksSection, DocumentsSection   Web versions of the Android components
│   └── screens/              AuthScreen, ProfileForm, SetupScreen, HomeScreen, SuspendedScreen
└── tests/shared.test.mjs     Fails if a shared copy drifts from the Android original
```

**Sharing code between the two apps:** `validate.js`, `documents.js`, `dates.js`, `throttle.js` and `useOperatorData.js` contain no screen code, so they work in both apps unchanged. They're **copies**, because the Android build tool (Metro) and the web build tool (Vite) each expect files inside their own folder; linking across folders needs extra configuration in both. The risk with copies is that a fix lands in one and not the other, so `tests/shared.test.mjs` compares them byte for byte. **The rule:** change the file in `operator-app`, then copy it to `operator-web`. The test reminds you if you forget.

**`location/sharing.js`**, the web version of location sharing:

- **While the page is visible:** `watchPosition` delivers fixes, the same `shouldSend` throttle as Android decides which to send, and a once-a-minute timer resends the newest fix so a parked truck doesn't go stale.
- **When the page comes back on screen** (after using Maps, for example): it immediately gets and sends a fresh position. That's the best moment, because the operator is looking at the app.
- **When it's hidden:** nothing runs, because iPhone pauses the page. The shortcut covers that time.
- **"Keep screen on"** uses the Screen Wake Lock API. iPhone supports it in Safari from iOS 16.4, and in home-screen web apps from iOS 18.4, which every iPhone 13 or newer can run. The browser drops the lock whenever the page is hidden, so the code asks again each time it's visible. It's off by default, because a screen kept on in a pocket would drain the battery and register accidental taps.
- **A tiny "store":** screens call `subscribe()` to hear about status changes ("last sent," errors), instead of checking on a timer.

**`CheckinSection.jsx`**: three states. Not set up (explain and offer to set up), code just made (show it once, copy button, setup steps), or set up (last check-in time, make a new code, turn off). The code lives only in that component's memory, so leaving the page forgets it, matching the database, which never stored it.

**`InstallHint.jsx`**: iPhones have no "install this site" button a website can show, so in Safari on an iPhone, and only when the page isn't already opened from the home screen, the app explains the two taps (Share, then Add to Home Screen). `navigator.standalone` is the Apple-only flag that tells us we're running from the home screen. Dismissing it is remembered in `localStorage`, wrapped in `try/catch` because private browsing can block storage.

### Build the check-in shortcut (one time, on an iPhone)

Shortcuts can't be written as a file and shared from a computer; they're built on an iPhone and shared as an iCloud link. You build it once, and every operator installs it from your link.

1. Open the **Shortcuts** app, tap **+**, and name it **Tow Connect Check-in**.
2. Add a **Text** action. Type `PASTE-YOUR-CODE` in it. (This becomes the question each operator answers.)
3. Add **Get Current Location**.
4. Add **Get Contents of URL** and set:
   - URL: `https://YOUR-PROJECT.supabase.co/rest/v1/rpc/checkin` (your project URL plus `/rest/v1/rpc/checkin`)
   - Method: **POST**
   - Headers: `apikey` = your **publishable** key, and `Content-Type` = `application/json`
   - Request Body: **JSON**, with three fields:
     - `p_code` (Text) = the **Text** variable from step 2
     - `p_lat` (Number) = **Current Location**, then tap it and choose **Latitude**
     - `p_lng` (Number) = **Current Location**, then choose **Longitude**
5. Add **Get Dictionary Value**: get the value for key `message` from **Contents of URL**.
6. Add **If**: Dictionary Value **is not** `Location updated`. Inside it, add **Show Notification** with the Dictionary Value. (So it stays silent when it works and tells the operator why when it doesn't.)
7. Open the shortcut's settings, tap **Setup**, then **Add New Question**, pick the text from step 2, and set the question to **"Paste your check-in code from the Tow Connect app."** Apple then clears that value when you share and asks each person for their own.
8. Run it once yourself with a real code (you'll be asked to allow location and the connection to supabase.co).
9. Share it: **Share → Copy iCloud Link**, and put the link in `operator-web/.env` as `VITE_CHECKIN_SHORTCUT_URL`. The app's setup steps link to it.

**What each operator does** is shown in the app, step by step: get the shortcut, paste their code, run it once and tap **Allow / Always Allow**, then add automations in the **Automation** tab (App → Maps and their dispatch app → Is Opened → **Run Immediately**). Optionally they add a second automation for their truck's Bluetooth or CarPlay.

**Why the publishable key is safe inside the shortcut:** it's the same public key the websites use. On its own it can only call `nearby_operators`, `submit_report` and `checkin`, and `checkin` does nothing without a valid code.

**Honest limits:** I couldn't test Shortcuts from here; the first real test is on an iPhone. A shortcut only sends a location when one of its triggers happens, so an operator parked for an hour without touching their phone has an hour-old position (hidden after 30 minutes until their next check-in). iOS shows a small notice each time an automation runs.

---

## The tests, explained

There are three test suites (the database rules, the operator app's logic, and the shared-file check) plus two browser click-throughs.

### Database security tests

File: `supabase/tests/security.test.mjs`.

It uses **PGlite**, real Postgres compiled to run inside Node.js, so it needs no install and no Supabase account. The test:

1. Creates stand-ins for the Supabase pieces our migration expects: the `anon` and `authenticated` roles, `auth.users`, `auth.uid()` (which reads a setting the test controls), and a minimal `storage` schema.
2. Runs every real migration file in name order, then the seed file, unchanged.
3. Pretends to be different people by switching roles (`set role anon`) and setting who `auth.uid()` returns, then checks what each person can and can't do.

What the 50 checks cover:

- **The public:** sees exactly the 6 demo operators near DC, positions are rounded, sorted by distance, nobody shows up from New York, can't read any table, can't run housekeeping, can file a report but can't read reports.
- **An operator signing up:** is forced to `pending`, can't approve themselves, can't go Available while pending, can't verify their own documents, and is invisible to other users.
- **After admin approval:** appears on the map at the rounded position, each position update leaves exactly one history row, can still change their phone number, but can't change their license number.
- **Automatic removal:** expired insurance hides them; a 20-minute-old position still shows but a 45-minute-old one doesn't; at 45 minutes they're hidden but still Available; housekeeping switches them off after 3 hours; and a suspended operator can't switch back on.
- **iPhone check-ins:** the public key can't make codes or read the codes table; codes are 64 random characters and only their hash is stored; a wrong code learns nothing; check-ins are refused while offline or suspended; a valid check-in puts the operator on the map; a second one within 15 seconds isn't written twice; impossible locations are rejected; a new code cancels the old one; deleting turns check-ins off; and nobody can delete someone else's code.
- **Re-uploading a document** resets its verification.
- **Storage:** an operator can upload to their own folder but not someone else's.

### Operator app logic tests

Folder: `operator-app/tests/`. Run with `npm test` in `operator-app`. They use Node's built-in test runner (`node --test`), so there's nothing extra to install.

- **`throttle.test.mjs`** (7 tests): first fix is sent, a parked truck checks in every minute, moving 150 m sends early but not more than every 15 s, small moves wait, rough fixes are skipped, and late-arriving old fixes are ignored.
- **`documents.test.mjs`** (12 tests): missing, in review, verified, expiring and expired documents; a renewal in review keeps the old record in effect; expiry dates like 2027-02-31 or yesterday are rejected; the phone check uses exactly the database's pattern; money parsing and formatting ($4.50, never $4.5); date formatting.

These cover the parts of the app that are pure logic. The screens and the real background location need a phone or emulator; the app was also checked by building a full Android bundle and generating the Android project to confirm the background location permissions are in it.

### Operator web app checks

- **`operator-web/tests/shared.test.mjs`** (5 tests): each shared file is byte-for-byte identical to its Android original.
- **Browser click-through** (18 checks, run on an iPhone-sized screen against a fake in-memory Supabase): the Add to Home Screen tip appears in iPhone Safari; sign-up and profile validation; trucks; document uploads land in the operator's own folder and impossible dates are refused; approval shows the Available switch; going Available sends a first position before setting Available; the check-in code is shown once, copies to the clipboard, and isn't shown again; going offline; reopening the page while Available resumes sharing; blocked location never sets Available; and rates show as $4.50.

**Why test the database and not the screens first:** a bug in the screens is visible and annoying; a bug in the security rules is invisible and dangerous (leaked locations, self-approved operators). The screens were checked by clicking through every flow in a headless browser.

---

## Why these choices

| Decision | What we chose | Alternatives considered | Why this one |
| --- | --- | --- | --- |
| Driver app type | Web app (PWA) | Native iOS/Android app | Someone on the shoulder won't download an app. A link opens instantly on any phone, and there's no app store fee or review. |
| Operator app type | Native app with Expo | Web app | Operators must keep sharing location while Google Maps is open in front. Web apps stop getting GPS when they're in the background; native apps don't. |
| How to run it while developing | Development build in the Android emulator | Expo Go | Expo Go can't run background location. A development build can, and the emulator is free and can fake a GPS route. Expo Go still works for quick foreground-only tests. |
| Operator sign-in | Email and password | Phone number with a texted code | Texted codes cost money per message; email sign-in is free. |
| When location permission is "only while using" | Keep working in foreground mode and say so | Refuse to go Available | Expo's docs say apps must always be ready for foreground-only permission, and a partly working app is better than none. |
| GPS accuracy | Balanced (about 100 m) | High (GPS) | Drivers only see positions rounded to about half a mile, so extra precision only costs battery. |
| How often to send | First fix, every minute, sooner after 150 m | Every fix, or only on movement | Every fix wastes battery and free-tier requests; movement-only makes a parked truck disappear after 30 minutes. |
| iPhone operators | Free web app + auto check-in shortcut | Pay $99/yr for the App Store; web app only; skip iPhones | Most operators use iPhones. A web page alone pauses when Maps is open, but operators open Maps and their dispatch app all day, so a shortcut on those moments keeps them fresh for $0. The native iPhone app stays ready for when a school or nonprofit can publish it with Apple's fee waived. |
| What the shortcut may do | Only update the location of an operator who is already Available | Also switch them Available | Going Available should always be a deliberate choice; otherwise opening Maps on a day off would list them. |
| Storing check-in codes | A SHA-256 hash, shown once | Store the code | If the table ever leaked, hashes can't be used. Showing it once is the price, and "make a new code" covers losing it. |
| How long a position counts | 30 minutes, with its age shown to drivers | 10 minutes | iPhone positions arrive at moments, not every minute. Showing the age keeps it honest. |
| When to switch someone offline | After 3 hours with no position | After 30 minutes | Lets the next check-in bring a quiet operator straight back, without them reopening the app. |
| Changing a database that's already live | A new migration file | Edit the first file | A database that already ran file 1 would never see an edit to it. |
| Sharing logic between the two operator apps | Copies, plus a test that they match | One shared folder | Both build tools want files inside their own folder; linking across needs extra setup in both. The test makes copies safe. |
| Renewing a document | Add a new record | Replace the old one | Replacing would hide the operator until an admin checked the new copy. Adding keeps the old, still-valid one in effect meanwhile. |
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
- **React Native:** React for phone apps. Same components and hooks, but `<View>` and `<Text>` become real phone controls instead of HTML.
- **Expo:** tools and ready-made modules (location, file picking, storage) on top of React Native, so you write JavaScript instead of Java or Swift.
- **Expo Go vs development build:** Expo Go is a ready-made app from the store that can run your JavaScript, but only with the native modules it already includes. A development build is your own app with exactly the native code your project needs, such as background location.
- **Custom hook:** a function starting with `use` that bundles state and effects for reuse, like `useOperatorData` loading trucks and documents for two screens.
- **Background task:** code the phone runs when the app isn't on screen, here to deliver new locations.
- **Foreground service:** Android's rule that an app using location in the background must show a permanent notification, so people always know.
- **Upsert:** insert a row if it doesn't exist, update it if it does.
- **Migration:** a file of database changes, applied once and in order. The list of migration files is the history of how the database got its shape.
- **Hash (SHA-256):** a one-way fingerprint of some text. The same text always gives the same fingerprint, but the fingerprint can't be turned back into the text.
- **Shortcuts automation:** an iPhone feature that runs a shortcut when something happens, like an app opening or a Bluetooth device connecting. Since iOS 17 it can run without asking first.
- **Home-screen web app:** a website added to the iPhone home screen. It opens full screen, and `navigator.standalone` is true inside it.
- **Screen Wake Lock:** a browser feature that keeps the screen from dimming and locking while a page is visible.
- **Environment variable (`EXPO_PUBLIC_…`, `VITE_…`):** a setting kept outside the code (in `.env`). The prefix tells the build tool it's safe to put into the app.

---

## Next steps

In order, with the reason for the order:

1. ~~Put the project on GitHub.~~ Done.
2. **Create the Supabase project**, run both migrations, and connect the apps (see "Connect the real backend"). Everything from here needs it.
3. **Deploy the two web apps on Cloudflare Pages**, so the operator web app has the `https://` address iPhones need for location.
4. **Test with your dad:** he signs up on the operator web app, you approve him with SQL, you build and share the check-in shortcut, and he sets up the automations. Then check that his truck appears in the driver app when he opens Maps.
5. **Add "Still available?" push reminders** for iPhone operators whose position is getting old.
6. **Build the admin panel.** Replaces the SQL snippets for approving operators and handling reports.
7. **Optional, for Android operators:** set up the Android emulator and test the Android app (see "The operator app").
8. **Open the Google Play developer account early** ($25 once). New personal accounts must run a closed test with 12 testers for 14 straight days before publishing, so starting the clock early saves two weeks at the end.
9. **Legal checks:** take the terms, privacy policy and accident flow to a free legal clinic, and ask MPD or DLCP how they treat driver-chosen tows in DC.
10. **Recruit 10 to 20 DC operators,** starting with your dad's company. Android operators can also be the 12 Play Store testers.
11. **Ask Catholic University or a nonprofit partner** about publishing the native iPhone app with Apple's fee waived.
12. **Launch.**

---

## Change log

Every change gets an entry here: what changed, how it works, and why it was done that way. Newest first.

### 2026-11-09: iPhone operators (web app + auto check-in)

- **What changed:**
  - New migration `20261109000000_iphone_checkin.sql`: check-in codes (stored as hashes), `create_checkin_code`, `delete_checkin_code`, and `checkin`; positions now count for 30 minutes (was 10); automatic offline after 3 hours without a position (was 30 minutes).
  - New `operator-web/` app for iPhones: the same screens as the Android app, location while open, "keep screen on," auto check-in setup, and an Add to Home Screen tip.
  - Driver app: the list shows "Location from 14 min ago" when a position is more than 5 minutes old. One demo truck now shows this.
  - Both operator apps: rates show cents correctly ($4.50, not $4.5) via a new shared `formatMoney`; uploads are capped at 5 MB in both.
  - Tests: the database tests now run every migration in order (50 checks, up from 32; the old "switched off after 30 minutes" check became "after 3 hours"). Added a money-format test to the operator app (19) and the shared-file test to the operator web app (5).
  - README: setup for the second migration and the web app, the shortcut build guide, Cloudflare Pages instead of Vercel, and the explanation sections.
- **How it works:** see "iPhone operators: web app and auto check-in, explained."
- **Why:** most operators, including the first test company, use iPhones. Publishing the real iPhone app costs $99 a year, and a web page alone stops when Maps is open. Operators open Maps and their dispatch app constantly, so a free iPhone Shortcuts automation on those moments keeps their position fresh. Hosting moved to Cloudflare Pages because Vercel's free plan is limited to non-commercial personal use.
- **How it was checked:** all three test suites pass, both web apps and the Android bundle build, and an 18-step browser click-through of the operator web app ran on an iPhone-sized screen against a fake backend with no page errors. The click-through caught the $4.5 bug. The driver app click-through still passes.
- **Not tested here:** the iPhone shortcut itself (needs a real iPhone) and push reminders (not built yet).

### 2026-10-22: Operator app (MVP)

- **What changed:** Built the operator app in `operator-app/`: sign-in, company and rates, trucks, document upload with expiry dates, waiting for approval, the Available switch, and background location sharing. Added 18 logic tests in `operator-app/tests/` and 2 database tests (approved operators can edit their phone but not their license number). Updated the setup steps (publishable key, email confirmation, emulator) in this README.
- **How it works:** See "The operator app, explained." In short: the screen is chosen from the sign-in and the operator row; going Available asks for permissions, sends a first position, starts a background task (or a foreground watcher), and only then sets `is_available`; every position goes through one throttle that sends at least once a minute.
- **Why:** Without operators the driver map is empty, so this app unblocks everything else. It was created from Expo's official blank template and its packages were installed with `npx expo install`, which picks versions that match Expo SDK 58. It follows Expo's current docs: `expo-sqlite/localStorage` for the login session and a development build for background location.
- **How it was checked:** the logic tests pass, the full Android bundle builds (733 modules), and generating the Android project confirmed the background location and foreground-service permissions are in the manifest. Running it on a device or emulator still needs your Supabase project.
- **Not done yet:** truck photos (part of FR-O2) and the iPhone version. The template's placeholder app icons are still in `assets/`.

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

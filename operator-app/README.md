# Operator app (next)

React Native + Expo, Android first. Talks to the same Supabase project as the driver app.

## Planned screens (MVP)

1. **Sign up / sign in** with phone or email (FR-O1).
2. **Profile**: company name, phone, tow license number, USDOT number, services and rates (FR-O7). Saved to `operators`.
3. **Documents**: upload the tow license and insurance certificate into the private `operator-docs` bucket, under a folder named with the user's id (FR-O2).
4. **Waiting for approval**: shown until an admin approves (FR-O3).
5. **Available toggle**: when on, a background location task upserts `operator_positions` whenever the truck moves about 150 m, and at least once a minute (FR-O4, FR-O5).

## What the database already enforces

- A new operator row is always `pending`, and the operator can't approve themselves.
- Only approved operators can switch to Available.
- Uploading a new document or changing its expiry date resets its verification.
- `expire_stale_availability()` switches operators off when their phone stops sending positions for 30 minutes (FR-O8).

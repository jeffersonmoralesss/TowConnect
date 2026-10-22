# Admin panel (next)

A small React page, hosted with the driver app on Vercel. Admins sign in with Supabase Auth; the `admins` table decides who is an admin.

## Planned screens (MVP)

1. **Applications**: pending operators with their documents. Check the license in DC's SCOUT system, then approve or reject (FR-A1). Approving sets `operators.status = 'approved'` and `operator_documents.verified = true`.
2. **Reports**: open reports, newest first. Add notes, resolve, or suspend the operator (FR-A2). Suspending sets `status = 'suspended'`, which also switches them off the map.

The database rules already let only admins read reports, approve operators and verify documents.

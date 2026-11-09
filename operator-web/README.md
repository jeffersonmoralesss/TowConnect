# Operator web app (iPhones)

The free way for iPhone tow operators to use Tow Connect: the same screens as the Android app, in a website they add to their home screen, plus an iPhone Shortcuts automation that sends their location whenever they open Maps or their dispatch app.

Everything about it is in the main [README](../README.md):

- **How to run it:** "Run it → The operator web app, for iPhones."
- **How it works and why:** "iPhone operators: web app and auto check-in, explained."
- **Building the shortcut:** "Build the check-in shortcut (one time, on an iPhone)."

Quick commands:

```bash
npm install
npm test        # checks the shared files still match the Android app's
npm run dev     # http://localhost:5174
npm run build   # production build into dist/
```

Copy `.env.example` to `.env` and add your Supabase URL and publishable key first.

**Shared files:** `src/shared/*` and `src/lib/useOperatorData.js` are copies of files in `operator-app`. Change them there first, then copy them here; `npm test` fails if they differ.

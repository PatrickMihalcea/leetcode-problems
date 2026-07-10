# LeetLocal

A LeetCode-style app over the `problems/` JSON dataset in this repo — hosted as a static
site on GitHub Pages so it's reachable 24/7 from any machine, with your progress and code
synced through a free Supabase project.

## Architecture

- **Frontend** (`webapp/client`): Vite + React + TypeScript, built as a static site and
  deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` on every push to `master`.
- **Problem data**: generated at build/dev time from `../../merged_problems.json` into
  `public/data/` (a lightweight search index plus one small JSON file per problem) — no
  server needed to browse or read problems.
- **Your progress & code**: stored in a Supabase Postgres project, gated behind Supabase
  Auth (email + password). Sign in once per browser; the same account works from any
  machine. Row Level Security means only you can read or write your own rows.

There is no backend server to run or host — everything after the static build talks
directly to Supabase from the browser.

## One-time setup

You only need to do this once, the first time you set this up.

1. **Create a free Supabase project** at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, run the contents of [`supabase/schema.sql`](supabase/schema.sql)
   once. This creates the `progress` and `saved_code` tables with Row Level Security policies
   scoping each row to its owner.
3. In **Project Settings -> API**, copy the **Project URL** and the **anon public key**.
4. In your GitHub repo, go to **Settings -> Secrets and variables -> Actions** and add two
   repository secrets:
   - `VITE_SUPABASE_URL` — the Project URL from step 3
   - `VITE_SUPABASE_ANON_KEY` — the anon public key from step 3
5. In **Settings -> Pages**, set the source to **GitHub Actions**.
6. Push to `master` (or run the "Deploy LeetLocal to GitHub Pages" workflow manually from
   the Actions tab). After it finishes, your app is live at
   `https://<your-username>.github.io/leetcode-problems/`.
7. Open that URL, sign up with an email + password (first visit only), and start solving.
   Sign in with the same account from any other machine to pick up where you left off.

> By default Supabase requires confirming your email on signup. For a private personal tool
> you can turn this off under **Authentication -> Providers -> Email -> Confirm email** so
> signup works immediately without a confirmation link.

## Local development

```bash
cd webapp/client
cp .env.example .env   # fill in the same Supabase URL + anon key from setup step 3
npm install
npm run dev
```

Opens at http://localhost:5173, reads/writes the same Supabase project as the hosted site.

## Features

- Browse/search/filter all problems by title, difficulty, topic, and solved/starred status.
- Full problem view: description, examples, constraints, follow-ups, hints (revealed one at a
  time), and editorial (when available in the dataset).
- Monaco code editor with a language switcher covering every language in `code_snippets`,
  a resizable split layout, and auto-saved code per problem/language.
- "Run" executes JavaScript solutions in a sandboxed Web Worker against the problem's examples
  and shows pass/fail. Other languages save but don't execute (v1 scope).
- Mark problems solved/starred; notes tab for your own write-up per problem.

## Known limitations

- Auto-grading is best-effort: it parses the free-text `Input:`/`Output:` example blocks, so
  problems using custom types (TreeNode, ListNode, etc.) generally can't be graded automatically
  — you can still write and save code for them, just without a Run verdict.
- Only JavaScript is executed in-browser; there's no sandbox for other languages.
- The GitHub Pages site is public by default (anyone with the URL can reach the login screen),
  but no one else can read or write your data — Row Level Security ties every row to your
  Supabase user id.

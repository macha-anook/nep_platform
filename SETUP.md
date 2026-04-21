# SETUP.md — Complete Setup Guide

Step-by-step instructions for every environment: local dev, Vercel, and Supabase.

---

## 1. Local development (no backend, 5 minutes)

### Prerequisites
- Node.js 18+ — https://nodejs.org (includes npm)
- Git — https://git-scm.com

### Steps

```bash
# Clone the repo
git clone https://github.com/YOUR_ORG/nep-platform.git
cd nep-platform

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5173**

Sign in with demo credentials: `demo@nep.science` / `demo123`

> **Note:** All data is stored in memory. Refreshing resets everything.
> This is intentional until Sprint 2 (Supabase) is wired.

---

## 2. Deploy to Vercel (free, 10 minutes)

Vercel hosts the frontend for free. No backend needed — the MockAdapter
runs entirely in the browser.

### Steps

1. Push the repo to GitHub (see Section 4 below)

2. Go to **https://vercel.com** → Sign up/in with GitHub

3. Click **Add New → Project**

4. Import your `nep-platform` repository

5. Vercel auto-detects Vite — click **Deploy**

6. Your app is live at `https://nep-platform-xxx.vercel.app`

### Custom domain (optional)
Vercel dashboard → your project → Settings → Domains → Add domain

---

## 3. Supabase setup (Sprint 2 — real backend, 30 minutes)

Skip this until you're ready for Sprint 2.

### 3.1 Create Supabase project

1. Go to **https://supabase.com** → New project
2. Name it `nep-platform`, pick a region close to your users
3. Save the **database password** — you'll need it later

### 3.2 Run the database schema

1. In Supabase → SQL Editor → New query
2. Copy the contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and click **Run**

This creates all tables with Row-Level Security enabled.

### 3.3 Get your API keys

Supabase → Project Settings → API:
- `URL` — looks like `https://abcdefgh.supabase.co`
- `anon public key` — long JWT string

### 3.4 Configure environment variables

```bash
# In your nep-platform folder
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_ADAPTER=supabase
```

### 3.5 Activate the Supabase adapter

In `src/App.jsx`, find:
```js
const API = MockAdapter
```
Change to:
```js
const API = SupabaseAdapter
```

And add at the top of the file:
```js
import { SupabaseAdapter } from './adapters/supabase.js'
```

### 3.6 Add Vercel environment variables

Vercel dashboard → your project → Settings → Environment Variables:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | your Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_API_ADAPTER` | `supabase` |

Redeploy after adding variables.

---

## 4. Push to GitHub (5 minutes)

### Option A — GitHub CLI (recommended)

```bash
# Install GitHub CLI: https://cli.github.com
gh auth login

cd nep-platform
git init
git add .
git commit -m "feat: NEP Platform v0.1.0 — Sprint 1 complete"
gh repo create nep-platform --private --source=. --push
```

### Option B — Manual

1. Go to **https://github.com/new**
2. Name: `nep-platform`, Private, no README (we have one)
3. Click **Create repository**
4. Run the commands GitHub shows you:

```bash
cd nep-platform
git init
git add .
git commit -m "feat: NEP Platform v0.1.0 — Sprint 1 complete"
git remote add origin https://github.com/YOUR_USERNAME/nep-platform.git
git branch -M main
git push -u origin main
```

---

## 5. Let Claude Code work on the repo

Claude Code is Anthropic's CLI tool that reads your codebase and makes changes.

### Install Claude Code

```bash
npm install -g @anthropic/claude-code
```

### Point Claude at the repo

```bash
cd nep-platform
claude
```

Claude Code will read `CLAUDE.md` automatically and understand the project
structure, adapter pattern, scoring rules, and branch strategy.

### Example prompts for Claude Code

```
Fix the I² field validation — it should only accept 0-100
```
```
Add localStorage persistence to the MockAdapter so data survives refresh
```
```
Wire up the Supabase adapter using the schema in supabase/migrations/001_initial_schema.sql
```
```
Fix all open issues in ISSUES.md marked as high priority
```

### GitHub Codespaces (browser-based, no install needed)

1. Go to your repo on GitHub
2. Press `.` (dot) to open VS Code in browser
3. Or go to `github.com/codespaces` → New codespace → your repo
4. Terminal: `npm install && npm run dev`

---

## 6. CI/CD — what runs automatically

| Trigger | Action |
|---------|--------|
| Push to any branch | `.github/workflows/ci.yml` — install, lint, build |
| Push to `main` | `.github/workflows/deploy.yml` — build + deploy to Vercel |
| Pull request to `main` | CI runs, Vercel creates a preview URL |

### Required GitHub Secrets for CI/CD

Go to: GitHub repo → Settings → Secrets and variables → Actions

| Secret | Where to get it |
|--------|----------------|
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | vercel.com → Team Settings → General |
| `VERCEL_PROJECT_ID` | vercel.com → Project → Settings → General |

Optional (Sprint 2+):
| `VITE_SUPABASE_URL` | Supabase project settings |
| `VITE_SUPABASE_ANON_KEY` | Supabase project settings |

---

## 7. Troubleshooting

### "npm run dev" fails
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
npm run dev
```

### Blank white screen
Open browser console (F12) → Console tab → copy the error and check ISSUES.md

### .docx downloads but Word can't open it
This was a known bug — fixed in the latest version.
Make sure you have the latest `src/App.jsx` from the repo.

### Port 5173 already in use
```bash
npm run dev -- --port 3000
```

### "Cannot find module" in CI
Check that `package.json` dependencies match what's imported in the code.
Run `npm install` locally and commit the updated `package-lock.json`.

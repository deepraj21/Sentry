# Sentry — AI-Powered GitHub PR Reviewer

Sentry is a full-stack app that reviews GitHub pull requests with AI and produces structured merge-readiness reports. Users sign in, connect repositories as **projects**, trigger reviews on open PRs, and optionally post branded review comments back to GitHub via a **GitHub App**.

## UI Preview

![Sentry UI](https://qmplv4qr76dicsvw.public.blob.vercel-storage.com/sentry.png)

## Features

- **Authentication** — register, sign in, JWT sessions (`/auth`)
- **Projects hub** — connect GitHub repos, search projects, delete projects (`/projects`)
- **Project detail** — list open PRs, run AI reviews, view recent project reviews (`/project`)
- **Merge-readiness reports** — verdict, confidence, risks, strengths, blockers (`/report`)
- **Scoped reports** — reviews tied to `userId` + `projectId`; private by default, optional public visibility
- **Homepage feed** — shows **public** recent reports only (anonymous-friendly)
- **GitHub App comments** — post reviews as the Sentry bot after installing [sentry-pr-review](https://github.com/apps/sentry-pr-review/installations/new)
- **Delete reviews** — remove individual reports or cascade-delete when removing a project
- **Private repos** — optional encrypted GitHub PAT per project for fetch/analyze access

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — analyze a PR by URL (legacy) + public recent reports |
| `/auth` | Sign in / register |
| `/projects` | Projects hub — add, search, delete repos |
| `/project?id=…` | Open PRs, trigger reviews, install GitHub App |
| `/report?id=…` | Full merge-readiness report + post comment |
| `/architecture` | System overview |

## User flow

1. **Sign up / sign in** at `/auth`.
2. **Add a project** — paste a repo URL; for private repos, provide a GitHub PAT.
3. **Open the project** — see open pull requests.
4. **Click Review** — Sentry fetches PR context, calls the LLM, saves a private report.
5. **View the report** — read verdict, risks, and merge readiness.
6. **Install GitHub App** (one-time per GitHub account) — button on project/report pages.
7. **Post Comment to PR** — publishes a formatted review comment as the Sentry bot.

---

## Architecture

```mermaid
flowchart TB
  subgraph ui [Browser UI]
    home[Home]
    auth[Auth]
    projects[Projects]
    project[Project Detail]
    report[Report]
  end

  subgraph api [Express API]
    authApi["api/auth"]
    projectsApi["api/projects"]
    reportsApi["api/reports"]
    analyzeApi["api/analyze"]
  end

  subgraph core [Core libs]
    analyzePr[analyze-pr.js]
    gh[github.js]
    ghApp[github-app.js]
    llm[openrouter.js]
  end

  subgraph data [Data]
    mongo[(MongoDB)]
    ghApi[GitHub REST API]
    openrouter[OpenRouter LLM]
  end

  auth --> authApi
  projects --> projectsApi
  project --> projectsApi
  report --> reportsApi
  home --> analyzeApi
  home --> reportsApi

  projectsApi --> analyzePr
  analyzeApi --> analyzePr
  analyzePr --> gh --> ghApi
  analyzePr --> llm --> openrouter
  analyzePr --> mongo

  reportsApi --> ghApp --> ghApi
  authApi --> mongo
  projectsApi --> mongo
  reportsApi --> mongo
```

### Comment posting flow

```mermaid
flowchart LR
  user[User clicks Post Comment] --> api["POST reports comment"]
  api --> token[resolveCommentPostingToken]
  token --> app[GitHub App installation token]
  token --> bot[GITHUB_BOT_TOKEN fallback]
  token --> pat[Project PAT fallback]
  app --> post[postPullRequestComment]
  bot --> post
  pat --> post
  post --> gh[GitHub PR comment]
```

Token priority for comments: **GitHub App installation token** → `GITHUB_BOT_TOKEN` → project PAT → `GITHUB_TOKEN`.

### Key modules

| Module | Role |
|--------|------|
| `api/index.js` | Express app, static files, route mounting |
| `lib/analyze-pr.js` | Shared analyze pipeline (GitHub → chunk → LLM → save) |
| `lib/auth.js` | JWT sign/verify, `requireAuth` middleware |
| `lib/user-store.js` | User registration/login (MongoDB) |
| `lib/project-store.js` | Projects CRUD, encrypted PAT storage |
| `lib/report-store.js` | Reports CRUD, visibility, project scoping |
| `lib/github.js` | GitHub REST client, PR fetch, comment posting |
| `lib/github-app.js` | GitHub App JWT, installation tokens, install status |
| `lib/comment-poster.js` | Format + post branded review comments |
| `lib/comment-formatter.js` | Markdown comment body (PR-REVIEWER branding) |
| `lib/crypto.js` | Encrypt/decrypt project GitHub tokens |
| `lib/chunker.js` | Diff sizing within LLM context limits |
| `lib/prompt-builder.js` | Deterministic prompt + JSON schema |
| `lib/openrouter.js` | OpenRouter client (timeout + retry) |
| `lib/report-formatter.js` | JSON parse + retry |

---

## GitHub App setup (for bot comments)

Each user who wants Sentry to **post comments as a bot** must install the app on their GitHub account:

**https://github.com/apps/sentry-pr-review/installations/new**

As the app owner, you configure credentials once on the server:

```bash
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

Required app permissions: **Pull requests: Read & write**, **Contents: Read**, **Metadata: Read**.

The Sentry UI shows an **Install Sentry on GitHub** button on project and report pages when the app is not yet installed on that repo.

---

## Environment variables

Create a `.env` file in the project root:

```bash
OPENROUTER_API_KEY=your_openrouter_key
GITHUB_TOKEN=optional_default_github_token
GITHUB_BOT_TOKEN=optional_bot_account_token_for_pr_comments
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
DEFAULT_MODEL=anthropic/claude-sonnet-4
MONGODB_URI=mongodb://127.0.0.1:27017/sentry
JWT_SECRET=change_me_to_a_long_random_secret
ENCRYPTION_KEY=optional_separate_key_for_token_encryption
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes | LLM API access |
| `JWT_SECRET` | Yes (auth) | Sign session tokens |
| `MONGODB_URI` | Recommended | Users, projects, reports |
| `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` | For bot comments | GitHub App credentials |
| `GITHUB_TOKEN` | Optional | Default token for public PR fetch / comment fallback |
| `GITHUB_BOT_TOKEN` | Optional | Fallback bot identity for comments |
| `ENCRYPTION_KEY` | Optional | Encrypts per-project PATs (defaults to `JWT_SECRET`) |
| `DEFAULT_MODEL` | Optional | OpenRouter model slug |

Notes:
- `GITHUB_APP_PRIVATE_KEY` can be a single line with `\n` escapes, or loaded from a `.pem` file into `.env`.
- Without MongoDB, auth and projects will not work; the legacy home-page analyze flow still runs.
- Add `*.pem` to `.gitignore` — never commit private keys.

---

## Local installation

### Prerequisites

- Node.js **18+** (recommended: Node 20)
- MongoDB (local or Atlas) for auth, projects, and reports

### Install & run

```bash
npm install
npm start
```

Open `http://localhost:4020/`.

### MongoDB

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/sentry
```

Or use Docker Compose (runs MongoDB + app):

```bash
docker compose up --build
```

---

## API reference

All authenticated routes require `Authorization: Bearer <jwt>`.

### Auth — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/register` | Create account |
| `POST` | `/login` | Sign in |
| `GET` | `/me` | Current user (auth required) |
| `POST` | `/logout` | Log out (auth required) |

### Projects — `/api/projects` (auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List projects (`?q=` search) |
| `POST` | `/verify` | Verify repo access before adding |
| `POST` | `/` | Add project |
| `GET` | `/:id` | Get project |
| `DELETE` | `/:id` | Delete project + all its reports |
| `GET` | `/:id/github-app` | GitHub App install status for repo |
| `GET` | `/:id/pulls` | Open pull requests |
| `GET` | `/:id/reports` | Recent reviews for project |
| `DELETE` | `/:id/reports/:reportId` | Delete one review |
| `POST` | `/:id/analyze` | Analyze a PR (`pullNumber`, `visibility`, `postComment`) |

### Reports — `/api/reports`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Recent **public** reports (homepage) |
| `GET` | `/:id` | Get report (private reports require auth + ownership) |
| `POST` | `/:id/comment` | Post review comment to GitHub (auth + ownership) |

### Analyze — `/api/analyze`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Analyze PR by URL (legacy home-page flow) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |

### Analyze request example

```json
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "githubToken": "optional",
  "model": "optional"
}
```

### Success envelope

```json
{
  "success": true,
  "report": {
    "verdict": "REQUEST_CHANGES",
    "confidence": 0.92,
    "summary": "...",
    "risks": [],
    "mergeReadiness": { "ready": false, "blockers": [], "suggestions": [] }
  },
  "metadata": { "model": "...", "analyzedAt": "..." }
}
```

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "REPO_ACCESS_DENIED",
    "message": "...",
    "installUrl": "https://github.com/apps/sentry-pr-review/installations/new"
  }
}
```

---

## Design system

UI styling follows `DESIGN.md` — warm cream canvas, coral CTAs, serif display typography, dark product surfaces. CSS custom properties live in `public/styles.css`. The navbar uses the Sentry brand logo from `public/nav-icons.js` and `public/brand-logo.svg`.

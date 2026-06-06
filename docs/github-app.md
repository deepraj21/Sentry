# Sentry PR Review — GitHub App

> AI-assisted pull request reviews with structured merge-readiness reports and enterprise-quality summary comments.

**Install:** [github.com/apps/sentry-pr-review](https://github.com/apps/sentry-pr-review/installations/new)

---

## Short description

Use this in the GitHub App **Description** field (keep under ~350 characters):

```
Sentry PR Review helps teams review pull requests faster with AI-assisted merge-readiness reports. Analyze open PRs for security, correctness, and test gaps; get clear Approve / Request Changes / Needs Discussion verdicts; and post structured review comments on GitHub as the Sentry bot.
```

### One-liner (tagline)

```
AI pull request reviews with merge-readiness verdicts and actionable GitHub comments.
```

---

## Full description

Sentry PR Review is a GitHub App that helps engineering teams move pull requests from “opened” to “merge-ready” with less manual toil.

Connect your repositories, run an AI review on any open PR, and get a structured report covering security risks, missing tests, performance concerns, and merge blockers. When you are ready, post a polished summary comment back to the PR as the **Sentry bot** — so feedback is visible to the whole team in one place.

Sentry is built for teams that want reviews to be **scannable, actionable, and consistent** — not a wall of vague nitpicks.

### What Sentry does

- **Analyzes pull requests** — reads PR metadata, diffs, commits, existing reviews, and inline comments for full context
- **Produces merge-readiness reports** — verdict, confidence score, prioritized findings, and blockers vs. suggestions
- **Posts summary comments on GitHub** — enterprise-style walkthrough comments with severity labels, what/why/fix structure, and optional code suggestions
- **Keeps review history** — project-scoped reports in the Sentry dashboard for your team to revisit and share

### What each review comment includes

Posted comments follow patterns used by leading AI review tools and enterprise engineering practices (Conventional Comments, Google eng-practices):

| Section | Purpose |
| --- | --- |
| **Verdict banner** | Approve, Request Changes, or Needs Discussion with confidence and merge-ready status |
| **TL;DR** | One-sentence summary for leads and busy reviewers |
| **P0 — Must fix** | Blocking issues (security, correctness, data loss) with full what/why/fix detail |
| **P1 — Should fix** | Meaningful improvements worth addressing before or shortly after merge |
| **P2 — Nitpicks** | Optional, non-blocking polish (capped to reduce noise) |
| **Praise** | Highlights of good patterns and solid work |
| **Open threads** | Unresolved discussions and prior reviewer feedback considered |
| **Coverage note** | Transparency when large PRs use chunked diff analysis |

Blockers can also include **diff-style fix suggestions** and **agent prompts** — copy-paste instructions for AI codegen tools to resolve issues quickly.

---

## Who it is for

- **Engineering teams** that want faster first-pass PR reviews without sacrificing quality
- **Tech leads** who need a clear merge-readiness signal and blocker count at a glance
- **Security-conscious orgs** that want SQL injection, auth, and data-handling risks flagged early
- **Remote/async teams** that benefit from structured, self-contained review comments on GitHub

---

## How it works

1. **Sign in** to Sentry and add a GitHub repository as a project
2. **Install the GitHub App** on the org or account that owns the repo (one-time setup)
3. **Select an open PR** and trigger **Analyze**
4. **Review the report** in Sentry — risks, strengths, blockers, and merge readiness
5. **Preview the GitHub comment** before posting
6. **Post Comment to PR** — Sentry publishes the summary as the bot identity

Reviews are triggered from the Sentry dashboard. You control when comments are posted — nothing is published without an explicit action.

---

## Installation

Install Sentry PR Review on the GitHub account or organization that owns the repositories you want reviewed:

**[Install GitHub App →](https://github.com/apps/sentry-pr-review/installations/new)**

Choose **All repositories** or select specific repos. The app needs access to read pull requests and write comments on the repos where you want reviews posted.

### Required permissions

| Permission | Access | Why |
| --- | --- | --- |
| Metadata | Read-only | Repository identification |
| Contents | Read | Pull request diffs and file changes |
| Pull requests | Read & write | Read PR context; post review comments |
| Issues | Read & write | PR conversation comments |

---

## Privacy & data

- Reviews are stored in your Sentry project scope; visibility is private by default
- The app reads PR data only when you trigger an analysis
- Comments are posted only when you click **Post Comment to PR**
- GitHub tokens for private repos can be stored encrypted per project (optional PAT fallback)

---

## Developer

| | |
| --- | --- |
| **Developer** | [@deepraj21](https://github.com/deepraj21) |
| **App slug** | `sentry-pr-review` |
| **Category** | GitHub App |

---

## Suggested GitHub App settings

Use these when editing the app in **GitHub → Settings → Developer settings → GitHub Apps**:

| Field | Suggested value |
| --- | --- |
| **GitHub App name** | Sentry PR Review |
| **Homepage URL** | Your deployed Sentry URL (e.g. `https://your-app.example.com`) |
| **Callback URL** | OAuth callback if applicable |
| **Setup URL** | `https://your-app.example.com/projects` (optional post-install redirect) |
| **Webhook** | Active if you add auto-review on PR open (not enabled by default) |

### Description (paste into GitHub)

```
Sentry PR Review helps teams review pull requests faster with AI-assisted merge-readiness reports.

• Analyze open PRs for security, testing, and merge risk
• Get structured verdicts: Approve, Request Changes, or Needs Discussion
• Post enterprise-quality summary comments on GitHub via the Sentry bot
• Keep project-scoped review history in the Sentry dashboard

Install on the repositories where you want Sentry to read pull requests and post review comments.
```

---

## Support

For issues with installation, permissions, or comment posting, open an issue in the Sentry repository or contact the developer via GitHub.

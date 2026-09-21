# AI Job-Search Assistant

> An AI-powered job-search tool I built and use every day — automating job scraping, AI role matching, resume tailoring and interview preparation.

<!-- Add a screenshot or short GIF here:
![demo](./docs/demo.gif)
-->

## Why I built this

Job hunting involves a lot of repetitive manual work: reviewing postings one by one, rewriting a resume for every application, and preparing interview answers from scratch each time. I wanted to know whether AI could genuinely remove that friction — so instead of waiting for a tool to exist, I built one.

Built in roughly **two weeks**, including debugging, testing and tuning how the tool filters roles.

This is not a demo. I use it for my own job search.

## Features

| Module | What it does |
|---|---|
| **Automated job scraping** | A Chrome extension crawls recruitment platforms; the backend schedules tasks and returns results through a queue |
| **De-duplication** | Every posting is keyed by `platform:job_id` (with a normalised hash fallback) and backed by a database unique index |
| **AI job matching** | Each posting is scored and ranked; anything below a configurable threshold is filtered out |
| **Personal experience bank (SSOT)** | A structured store of every project, role, education entry and personal profile — the single source of truth for all resume output |
| **Multi-version resumes** | Compose a tailored resume in seconds by selecting from the experience bank, with preview and Word export |
| **AI resume generation** | Generates role-specific resume content from the job description plus your experience bank |
| **Mock interview** | AI-generated interview questions to support preparation |
| **Application tracking** | Job database, application list and status tracking |
| **Runs fully locally** | Backend, database and AI gateway all run on your own machine — no cloud sync, no third-party analytics, no external account |

## The experience bank — the core idea

The single most useful design decision in this project is that **resumes are derived, not hand-written**.

Instead of maintaining several separate resume documents that drift out of sync, every piece of experience lives once in a structured bank (typed as `project` / `work` / `edu` / `profile`), with drag-to-reorder control over how it reads. Resumes are then **composed** from it — pick the relevant entries, and the tool assembles the document. AI-generated resumes read from exactly the same source.

This means there is one place to update your experience, and every resume, every AI generation, and every export stays consistent with it.

In my own use: **15 structured entries** across 11 projects, 2 roles, 1 education record and 1 profile — supporting every tailored resume I produce.

*(SSOT — single source of truth — is a pattern I care about generally: it is the same principle behind the data governance work I led in enterprise systems, where unifying master data ended the problem of the same entity meaning different things in different systems.)*

## Product decisions

**Why matching has to be explainable.** A bare match score is not something I would act on. Every result therefore comes with **a reason** — why this role fits my background — rather than a number on its own. If the tool cannot explain its judgement, I do not trust it enough to use it.

**Why there is no auto-apply button.** Automated applications would have been straightforward to build. I chose not to. Applying for a job is **a person-to-person act** — mass-applying wastes a recruiter's time and treats every company the same. Out of respect for each one, I tailor every application, and the tool helps by pulling the experience from my bank that fits that role. **The tool handles filtering and ranking; the decision to apply stays with me.**

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Chrome Ext  │────▶│    Server    │◀───▶│     Client      │
│  (WXT MV3)   │     │   (Express)  │     │  (React + Vite) │
└──────────────┘     └──────┬───────┘     └─────────────────┘
       │                    │
       │  task queue        │  SQLite
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│ Recruitment  │     │   LLM API    │
│  Platforms   │     │  (scoring,   │
│              │     │  generation) │
└──────────────┘     └──────────────┘
```

**Three-part design:**

- `client/` — React + Vite SPA: experience bank, resumes, job database, outreach messages, application list, mock interview
- `server/` — Express local proxy: AI forwarding, SQLite (jobs / tasks / crawl_logs / experience_bank), scheduled jobs, extension task queue
- `extension/` — WXT Chrome MV3 extension acting as the scraping executor

## Tech stack

- **Frontend**: React, Vite, TypeScript
- **Backend**: Node.js, Express, SQLite, TypeScript
- **Extension**: WXT, Chrome Manifest V3
- **AI**: LLM API integration (scoring, generation)
- **Testing**: Vitest (15 test files)

## Engineering decisions worth noting

**Idempotent de-duplication.** Scraping the same platform repeatedly inevitably produces duplicates. Every posting gets a `unique_key` of `platform:external_id`, falling back to a hash of the normalised company, title and city — with a database unique index as the final safeguard.

**Sleep compensation.** A laptop that sleeps misses scheduled crawls. The scheduler detects missed windows after wake and back-fills them, so the job history stays continuous without manual intervention.

**Compliance by design.** Scraping runs with configurable randomised delays between requests and a cap on items per run. There is deliberately **no automated application feature** — the tool assists, it never acts on your behalf beyond what you review manually.

**Security by design.** The backend, database and AI gateway all run locally. Job data, application history and your career record stay on your own machine and are **not shared with any third-party platform** — no cloud sync, no third-party analytics, no external account. Only when you explicitly trigger an AI feature is the necessary text sent to the LLM API you configure yourself (DeepSeek / Zhipu). AI keys are read from local storage only, are never sent to the frontend, and are never committed to the repository.

## Getting started

```bash
npm install

# Run backend (:3001) and frontend (:5173)
npm run dev

# Type checking
npm run typecheck

# Tests (client + server)
npm test
```

The Chrome extension is a separate package:

```bash
cd extension
npm install
npm run release   # builds and syncs to install-this/
```

Then load `extension/install-this/` as an unpacked extension in Chrome.

## Project status

Actively used for my own job search. Feedback and suggestions are welcome via Issues.

## License

Personal project. Please open an Issue before reuse.

# AI Job-Search Assistant

> An AI-powered job-search tool I built and use every day — automating job scraping, AI role matching, resume tailoring and interview preparation.

<!-- Add a screenshot or short GIF here:
![demo](./docs/demo.gif)
-->

## Why I built this

Job hunting involves a lot of repetitive manual work: reviewing postings one by one, rewriting a resume for every application, and preparing interview answers from scratch each time. I wanted to know whether AI could genuinely remove that friction — so instead of waiting for a tool to exist, I built one.

This is not a demo. I use it for my own job search.

## Features

| Module | What it does |
|---|---|
| **Automated job scraping** | A Chrome extension crawls recruitment platforms; the backend schedules tasks and returns results through a queue |
| **De-duplication** | Every posting is keyed by `platform:job_id` (with a normalised hash fallback) and backed by a database unique index |
| **AI job matching** | Each posting is scored and ranked; anything below a configurable threshold is filtered out |
| **Multi-version resumes** | A centralised experience bank lets you compose a tailored resume in seconds, with preview and Word export |
| **AI resume generation** | Generates role-specific resume content from the job description plus your experience bank |
| **Mock interview** | AI-generated interview questions to support preparation |
| **Application tracking** | Job database, application list and status tracking |

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

**Security by design.** AI keys are read from local storage only. They are never written into frontend code and never committed to the repository.

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

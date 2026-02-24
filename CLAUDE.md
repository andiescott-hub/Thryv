# CLAUDE.md – Project Context for AI Assistants

This file gives Claude (and other AI assistants) fast, accurate context so updates can be made without re-reading the entire codebase each session.

---

## What This Project Is

**Thryv RAG** – A Next.js RAG (Retrieval-Augmented Generation) web app that lets the team query a private library of PDFs and spreadsheets using natural language and receive cited answers.

Stack: Next.js 14 (App Router) · Chroma vector DB · OpenAI embeddings · kimi-k2.5 LLM (Moonshot AI, OpenAI-compatible)

---

## Key Files & Their Roles

| File | Purpose |
|------|---------|
| `app/api/query/route.ts` | POST /api/query – the full RAG pipeline (embed → retrieve → LLM) |
| `lib/chunking.ts` | Splits PDFs, spreadsheets, and plain text into overlapping chunks |
| `lib/embeddings.ts` | Embedding provider abstraction (OpenAI or Ollama) |
| `lib/llm.ts` | Calls kimi-k2.5 (or any OpenAI-compatible LLM) and parses cited JSON response |
| `lib/vector.ts` | Chroma HTTP client helpers (add, delete, query) |
| `lib/rateLimit.ts` | In-memory per-IP rate limiter |
| `scripts/ingest.ts` | CLI: reads `/documents`, chunks → embeds → stores in Chroma |
| `middleware.ts` | Security headers + CORS + 50 KB body guard |
| `app/page.tsx` | Chat UI (client component, ~610 lines) |
| `documents/` | Drop PDFs / spreadsheets here before running ingest |

---

## Current Retrieval Settings (`app/api/query/route.ts`)

```ts
TOP_K = 25                 // chunks retrieved from Chroma per query
DISTANCE_THRESHOLD = 0.82  // cosine distance cut-off (0 = identical, 2 = opposite)
MIN_CHUNKS = 5             // minimum chunks always passed to LLM
MAX_TOKENS = 4096          // LLM output token budget (lib/llm.ts)
```

Temporal query detection is active: if a question contains words like "latest", "most recent", "current", "updated", etc., the retrieved chunks are **sorted by page number descending** before being passed to the LLM so newer document sections appear first in context.

---

## Chunking Settings (`lib/chunking.ts`)

```ts
CHUNK_SIZE = 950   // characters per chunk
OVERLAP    = 150   // character overlap between adjacent chunks
```

PDF chunking uses `pdf-parse` with a `pagerender` callback to extract text page-by-page. If the callback doesn't fire for every page (a known pdf-parse v1.1.1 quirk), the code falls back to bulk-text parsing with character-position page estimation. The return value of `pdfParse()` is always captured so `numpages` can be used to validate full-page coverage.

---

## LLM System Prompt Behaviour (`lib/llm.ts`)

- Strict context-only answers; cites sources as `[1]`, `[2]`
- For **temporal queries** ("latest", "most recent", etc.): scans all context blocks for date/time references, identifies the most recent, and states it explicitly in the answer
- For **broad/summary queries**: covers ALL key points across every context block
- Returns JSON: `{ "answer": "...", "usedRefs": [1, 2] }`

---

## Local Development Workflow

### 1. Start Chroma (keep this terminal open)

**If Python pip3/chromadb is available:**
```bash
~/Library/Python/3.9/bin/chroma run --path ./chroma-data
```
Connects at `http://localhost:8000`.

**If Docker is available (preferred – avoids LibreSSL issues on macOS):**
```bash
docker run -p 8000:8000 chromadb/chroma
```

> macOS note: The system Python 3.9 uses LibreSSL 2.8.3, which is incompatible with urllib3 v2. The `chroma` binary in `~/Library/Python/3.9/bin/chroma` works despite the SSL warning. Docker avoids this entirely.

### 2. Add / update documents

Drop PDFs and spreadsheets into `documents/`.

### 3. Re-ingest (required after any document or chunking change)

```bash
npm run ingest -- --clear   # wipes old chunks, re-indexes everything
npm run ingest              # additive (keeps existing chunks)
npm run ingest -- --file documents/report.pdf   # single file
```

### 4. Run the app

```bash
npm run dev   # http://localhost:3000
```

---

## Environment Variables (`.env.local`)

```env
# LLM
LLM_API_KEY=<moonshot or openai key>
LLM_BASE_URL=https://api.moonshot.cn/v1   # or https://api.openai.com/v1
LLM_MODEL=kimi-k2.5                        # or gpt-4o-mini
LLM_MAX_TOKENS=4096

# Embeddings
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=<openai key>
OPENAI_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small

# Vector store
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=documents

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
ALLOWED_ORIGIN=*
```

---

## Change History (what has been modified and why)

### Feb 2026 – PDF full-document search + recency fixes

**Problem:** Responses were poor; only content from page 1 of PDFs was being returned, and queries for "most recent" information weren't finding the right content.

**Root causes found:**
1. `lib/chunking.ts` discarded the `pdfParse()` return value, so `numpages` was unavailable. When `pagerender` only fired for page 1 (a pdf-parse v1.1.1 quirk), `pageTexts.length` was `1` (not `0`), so the fallback was never triggered and only page 1 was chunked.
2. `TOP_K=15` and `DISTANCE_THRESHOLD=0.75` were too restrictive, cutting off valid chunks.
3. No temporal/recency logic existed in the retrieval or LLM prompt layers.

**Changes made:**

| File | Change |
|------|--------|
| `lib/chunking.ts` | Capture `pdfParse` return value; add `max: 0`; validate `pageTexts.length >= numpages`; robust per-page `.catch()`; reuse parsed data in fallback |
| `app/api/query/route.ts` | `TOP_K` 15→25; `DISTANCE_THRESHOLD` 0.75→0.82; `MIN_CHUNKS` 3→5; temporal keyword detection + page-descending sort |
| `lib/llm.ts` | System prompt: explicit recency rules (scan for dates, surface newest); `MAX_TOKENS` default 2048→4096 |

**After these changes:** Run `npm run ingest -- --clear` to rebuild the vector store with all PDF pages.

---

## Supported File Types

| Extension | Parser |
|-----------|--------|
| `.pdf` | `pdf-parse` (page-aware, with bulk fallback) |
| `.xlsx` / `.xls` | `xlsx` (sheet-aware, 25-row batches) |
| `.csv` | `xlsx` |
| `.txt` / `.md` | Node `fs` |

---

## Architecture Diagram

```
Browser (chat UI)
      │ POST /api/query { question }
      ▼
API Route (app/api/query/route.ts)
  1. Rate limit check
  2. Input validation
  3. Embed question        → lib/embeddings.ts → OpenAI/Ollama
  4. Vector retrieval      → lib/vector.ts     → Chroma HTTP :8000
  5. Distance filter + temporal sort
  6. LLM answer            → lib/llm.ts        → Moonshot kimi-k2.5
  7. Return { answer, citations }
```

---

## Known Limitations / Future Work

- **Rate limiter is in-memory** – only correct for single-process deployments. Replace with Upstash Redis for multi-instance Vercel.
- **Page numbers are estimated** for PDFs that fall back to bulk parsing (when `pagerender` misses pages). Exact page numbers require `pagerender` to succeed.
- **No date metadata on chunks** – "most recent" detection relies on page order (later pages first) and LLM date parsing. For higher accuracy, extract and store dates as Chroma metadata during ingestion.
- **Chroma on macOS with Python 3.9** has LibreSSL incompatibility; use Docker or Homebrew Python 3.12 for a cleaner setup.

# Thryv RAG – Document Intelligence

A production-ready Retrieval-Augmented Generation (RAG) web application built with **Next.js**, **Chroma**, and **kimi-k2.5**. Allows teams to query a private library of marketing PDFs and spreadsheets using natural language and receive cited answers.

---

## File Tree

```
/
├── app/
│   ├── api/
│   │   └── query/
│   │       └── route.ts       ← POST /api/query endpoint
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               ← Chat UI (App Router)
├── lib/
│   ├── chunking.ts            ← PDF / XLSX / CSV / text chunker
│   ├── embeddings.ts          ← Embedding provider abstraction
│   ├── llm.ts                 ← kimi-k2.5 via Moonshot AI
│   ├── rateLimit.ts           ← In-memory rate limiter
│   └── vector.ts              ← Chroma vector store helpers
├── middleware.ts               ← Security headers + CORS
├── scripts/
│   └── ingest.ts              ← CLI: chunk → embed → store
├── documents/                 ← Drop your PDFs/spreadsheets here
│   └── .gitkeep
├── .env.local.example
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                     │
│                      Chat UI  /app/page.tsx                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/query { question }
                            ▼
┌─────────────────────────────────────────────────────────────┐
│             API Route  /app/api/query/route.ts               │
│   1. Rate limit check (lib/rateLimit.ts)                    │
│   2. Validate input                                          │
│   3. Embed question  (lib/embeddings.ts)                    │
│   4. Top-6 retrieval (lib/vector.ts → Chroma HTTP)          │
│   5. Build prompt + call kimi-k2.5 (lib/llm.ts)            │
│   6. Return { answer, citations }                            │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
        [Ollama /        [Chroma       [Moonshot AI
        OpenAI API]       HTTP]         kimi-k2.5]
        Embeddings      Vector Store     LLM Answer
```

---

## Quick Start (Local Development)

### 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Docker | any recent |
| Ollama | latest |

### 2. Clone and install

```bash
git clone <repo-url>
cd thryv
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
LLM_API_KEY=your_moonshot_key   # https://platform.moonshot.cn
EMBEDDING_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
CHROMA_URL=http://localhost:8000
```

### 4. Start Chroma

```bash
docker run -p 8000:8000 chromadb/chroma
```

### 5. Pull embedding model

```bash
ollama pull nomic-embed-text
```

### 6. Add documents

Drop your PDF and/or spreadsheet files into the `/documents` directory.

```bash
cp ~/marketing/*.pdf documents/
cp ~/reports/*.xlsx documents/
```

### 7. Ingest documents

```bash
npm run ingest
```

Options:
```bash
npm run ingest -- --clear          # wipe collection first, then ingest
npm run ingest -- --file path/to/file.pdf   # ingest a single file
```

### 8. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Chunking Settings

| Parameter | Value |
|-----------|-------|
| Chunk size | 950 characters |
| Overlap | 150 characters |
| Top-K retrieval | 6 |

---

## Embedding Providers

### Option A – Ollama (local, default)

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

Recommended models:
- `nomic-embed-text` (768-dim, fast)
- `mxbai-embed-large` (1024-dim, higher quality)

### Option B – OpenAI-compatible API

```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
```

---

## LLM Configuration

The app targets **kimi-k2.5** via the [Moonshot AI API](https://platform.moonshot.cn), which is OpenAI-SDK-compatible.

```env
LLM_API_KEY=your_key
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=kimi-k2.5
LLM_MAX_TOKENS=2048
```

To use a different OpenAI-compatible provider, change `LLM_BASE_URL` and `LLM_MODEL`.

---

## API Reference

### `POST /api/query`

**Request**
```json
{ "question": "What were Q3 campaign costs?" }
```

**Response (200)**
```json
{
  "answer": "Q3 campaign costs totalled $1.2M [1], with digital ads accounting for 60% [2].",
  "citations": [
    { "id": 1, "filename": "q3_report.pdf", "page": 4, "excerpt": "…total spend: $1.2M…" },
    { "id": 2, "filename": "q3_report.pdf", "page": 5, "excerpt": "…digital: 60%…" }
  ]
}
```

**Error responses**

| Code | Reason |
|------|--------|
| 400 | Missing/invalid question |
| 405 | Wrong HTTP method |
| 429 | Rate limit exceeded |
| 500 | Upstream service error |

---

## Rate Limiting

Default: **20 requests / minute per IP**.

Configure via:
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
```

Rate limit headers are returned on every response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

> **Production note:** The default rate limiter is in-memory and only works correctly for single-process deployments. For multi-instance Vercel deployments, replace with [Upstash Redis](https://upstash.com):
> ```bash
> npm install @upstash/ratelimit @upstash/redis
> ```

---

## Vercel Deployment

### 1. Push to GitHub

```bash
git add .
git commit -m "initial commit"
git push origin main
```

### 2. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy**

### 3. Add environment variables

In Vercel dashboard → Project Settings → Environment Variables, add:

```
LLM_API_KEY          = your_moonshot_key
LLM_BASE_URL         = https://api.moonshot.cn/v1
LLM_MODEL            = kimi-k2.5
EMBEDDING_PROVIDER   = openai
OPENAI_API_KEY       = sk-...
EMBEDDING_MODEL      = text-embedding-3-small
CHROMA_URL           = https://your-chroma-instance.example.com
CHROMA_COLLECTION    = documents
RATE_LIMIT_MAX       = 20
ALLOWED_ORIGIN       = https://your-domain.vercel.app
```

### 4. Host Chroma for production

Options:

| Option | Notes |
|--------|-------|
| **Chroma Cloud** | Managed, zero-ops. Sign up at [trychroma.com](https://trychroma.com) |
| **Railway** | Deploy `chromadb/chroma` Docker image |
| **Fly.io** | `fly launch` with `chromadb/chroma` |
| **Self-hosted VM** | Any VPS with Docker |

### 5. Ingest documents (production)

Run the ingest script locally, pointing at your hosted Chroma:

```bash
CHROMA_URL=https://your-chroma.example.com \
EMBEDDING_PROVIDER=openai \
OPENAI_API_KEY=sk-... \
npm run ingest
```

---

## Supported File Types

| Extension | Parser |
|-----------|--------|
| `.pdf` | `pdf-parse` (page-aware) |
| `.xlsx` / `.xls` | `xlsx` (sheet-aware) |
| `.csv` | `xlsx` |
| `.txt` / `.md` | Node `fs` |

---

## Security

- API keys are **server-side only** – never sent to the browser
- Input validated (type, length) before processing
- Security headers set via `middleware.ts`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- CORS configurable via `ALLOWED_ORIGIN`
- Body size guard (>50 KB rejected before parsing)

# Thryv RAG Application

A Next.js 14 Retrieval-Augmented Generation (RAG) app that lets users upload documents (PDF, XLSX, CSV, TXT) and ask natural-language questions with cited answers.

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Vector DB**: Pinecone (serverless, cosine metric, 1536 dimensions)
- **Embeddings**: OpenAI `text-embedding-3-small` (or Ollama locally)
- **LLM**: OpenAI GPT-4o-mini (or any OpenAI-compatible API via `LLM_BASE_URL`)
- **Deployment**: Vercel (serverless functions)

## Project Structure

```
app/
  page.tsx              # Chat UI (client component)
  layout.tsx            # Root layout
  globals.css           # Dark theme styles
  api/
    query/route.ts      # POST /api/query – RAG question answering
    upload/route.ts     # POST /api/upload – document ingestion
lib/
  chunking.ts           # PDF/XLSX/CSV/TXT chunker (950 chars, 150 overlap)
  embeddings.ts         # OpenAI/Ollama embedding abstraction
  llm.ts                # LLM answer generation with citation extraction
  vector.ts             # Pinecone upsert/query wrapper
  rateLimit.ts          # In-memory IP-based rate limiter
scripts/
  ingest.ts             # CLI batch ingestion: npm run ingest
middleware.ts           # Edge middleware (security headers, CORS, body guard)
```

## Commands

```bash
npm run dev        # Start dev server on localhost:3000
npm run build      # Production build
npm run lint       # ESLint
npm run ingest     # Batch ingest documents/ folder into Pinecone
```

## Environment Variables

Copy `.env.local.example` to `.env.local`. Required keys:

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | OpenAI (or compatible) API key for answer generation |
| `LLM_BASE_URL` | LLM endpoint (default: `https://api.openai.com/v1`) |
| `LLM_MODEL` | Model name (default: `gpt-4o-mini`) |
| `OPENAI_API_KEY` | OpenAI key for embeddings |
| `EMBEDDING_PROVIDER` | `openai` or `ollama` |
| `PINECONE_API_KEY` | Pinecone auth key |
| `PINECONE_INDEX` | Pinecone index name (default: `documents`) |

These same env vars must be set in the **Vercel dashboard** for production.

## Data Flow

1. **Upload**: File → chunk (950 chars) → embed → upsert to Pinecone
2. **Query**: Question → embed → Pinecone top-15 → filter by distance < 0.75 → LLM generates cited answer

## Key Design Decisions

- Chunks are 950 characters with 150-character overlap to preserve context across boundaries
- Rate limiting is in-memory (20 req/min/IP) — swap to Upstash Redis for multi-instance
- `next.config.js` excludes Node modules (fs, path, crypto) from client bundles
- Upload route writes to `/tmp` (Vercel serverless temp), cleans up after ingestion
- LLM response is parsed as JSON `{ answer, usedRefs }` with regex fallback for `[n]` markers

## Common Tasks

- **Add a new file type**: Edit `lib/chunking.ts`, add a parser function, update the extension check in `chunkFile()`
- **Change LLM provider**: Update `LLM_BASE_URL` and `LLM_MODEL` env vars (any OpenAI-compatible API works)
- **Switch to local embeddings**: Set `EMBEDDING_PROVIDER=ollama` and ensure Ollama is running
- **Adjust retrieval quality**: Tune `topK` (in `app/api/query/route.ts`) and distance threshold
- **Add new API route**: Create `app/api/<name>/route.ts` following existing patterns

## Deployment (Vercel)

- Project is deployed on Vercel as `thryv-h8ly`
- Push to the connected branch triggers auto-deploy
- All env vars from `.env.local.example` must be configured in Vercel dashboard
- Manual redeploy: Vercel dashboard → Deployments → ⋯ → Redeploy

'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';

// ---------------------------------------------------------------------------
// Suggested prompts
// ---------------------------------------------------------------------------

const ALL_PROMPTS = [
  "What problems does Thryv solve for a small business like mine (leads, bookings, reviews, payments, customer follow-up), and which products cover each one?",
  "What's included in each Thryv package/tier, and what's the monthly price (plus any setup fees or contract terms)?",
  "How does Thryv help me get more leads (SEO, Google Business Profile, paid ads, website), and how do you prove the results with reporting?",
  "Can Thryv build or rebuild my website, and how do updates work (who edits it, how fast, what's self-serve vs done-for-you)?",
  "How does Thryv manage enquiries once they come in—calls, web forms, texts, emails—and can it automatically follow up so leads don't get missed?",
  "Does Thryv include online booking and scheduling, and can customers pay or leave deposits when they book?",
  "What's the CRM capability—can I track customers, quotes/jobs, follow-ups, pipelines, reminders, and see everything in one place?",
  "How do reviews work—can you request Google reviews automatically, respond in one place, and handle negative review workflows?",
  "Can Thryv integrate with the tools I already use (Google/Microsoft email & calendar, QuickBooks/Xero, payment terminals, Zapier, etc.)?",
  "What support and onboarding do you provide (implementation timeline, training, ongoing support), and what happens if I want to cancel or change plans later?",
];

function pickThreePrompts(): string[] {
  const shuffled = [...ALL_PROMPTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Citation {
  id: number;
  filename: string;
  page: number;
  excerpt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  isError?: boolean;
}

interface Thread {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Thread persistence helpers (localStorage)
// ---------------------------------------------------------------------------

const THREADS_KEY = 'thryv_threads';
const MAX_THREADS = 3;

function loadThreads(): Thread[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(THREADS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistThreads(threads: Thread[]) {
  if (typeof window === 'undefined') return;
  const sorted = [...threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);
  localStorage.setItem(THREADS_KEY, JSON.stringify(sorted));
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

function ThryvLogo() {
  return (
    <span
      style={{
        fontSize: '1.4rem',
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      <span style={{ color: '#fff' }}>thryv</span>
      <span style={{ color: 'var(--accent)' }}>.</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// CitationCard
// ---------------------------------------------------------------------------

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '0.78rem',
        lineHeight: '1.5',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: expanded ? '8px' : 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <span
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '0.68rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            [{citation.id}]
          </span>
          <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {citation.filename}
          </span>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>p.{citation.page}</span>
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            whiteSpace: 'nowrap',
            padding: '2px 4px',
            flexShrink: 0,
            fontFamily: 'inherit',
          }}
        >
          {expanded ? '▲ hide' : '▼ excerpt'}
        </button>
      </div>

      {expanded && (
        <p
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            borderTop: '1px solid var(--border)',
            paddingTop: '8px',
          }}
        >
          {citation.excerpt}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: '6px',
      }}
    >
      <span
        style={{
          fontSize: '0.62rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isUser ? 'var(--accent)' : 'var(--text-muted)',
          paddingInline: '4px',
        }}
      >
        {isUser ? 'You' : 'Assistant'}
      </span>

      <div
        className="answer-text bubble-max"
        style={{
          background: isUser
            ? 'linear-gradient(135deg, #1e3570 0%, #1a2d5e 100%)'
            : 'rgba(255,255,255,0.04)',
          border: isUser
            ? '1px solid rgba(255,85,0,0.25)'
            : '1px solid var(--border)',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: '12px 18px',
          lineHeight: '1.7',
          fontSize: '0.92rem',
          color: message.isError ? 'var(--error)' : 'var(--text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.text}
      </div>

      {message.citations && message.citations.length > 0 && (
        <div className="cite-max" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              paddingInline: '4px',
            }}
          >
            Sources
          </span>
          {message.citations.map((c) => (
            <CitationCard key={`${c.id}-${c.filename}-${c.page}`} citation={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingInline: '4px' }}>
      <span
        style={{
          fontSize: '0.62rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Assistant
      </span>
      <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: '6px',
              height: '6px',
              background: 'var(--accent)',
              borderRadius: '50%',
              animation: `thryvPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
      <style>{`
        @keyframes thryvPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1);   }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);

  // Thread state (desktop sidebar)
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');

  // Indexed documents (desktop sidebar)
  const [ingestedFiles, setIngestedFiles] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // On mount: load threads and document list
  useEffect(() => {
    setThreads(loadThreads());
    setActiveThreadId(crypto.randomUUID());
    fetchIngestedFiles();
    setSuggestedPrompts(pickThreePrompts());
  }, []);

  // Persist active thread whenever messages change
  useEffect(() => {
    if (messages.length === 0 || !activeThreadId) return;
    const title = messages.find((m) => m.role === 'user')?.text.slice(0, 50) ?? 'Untitled';
    const updated: Thread = { id: activeThreadId, title, messages, updatedAt: Date.now() };
    setThreads((prev) => {
      const without = prev.filter((t) => t.id !== activeThreadId);
      const next = [updated, ...without];
      persistThreads(next);
      return next.slice(0, MAX_THREADS);
    });
  }, [messages, activeThreadId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  async function fetchIngestedFiles() {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setIngestedFiles(data.filenames ?? []);
      }
    } catch {
      // silently ignore
    }
  }

  function handleNewThread() {
    setMessages([]);
    setActiveThreadId(crypto.randomUUID());
    setInput('');
    setError(null);
    setUploadStatus(null);
    setSuggestedPrompts(pickThreePrompts());
  }

  function handleSwitchThread(thread: Thread) {
    setMessages(thread.messages);
    setActiveThreadId(thread.id);
    setError(null);
    setUploadStatus(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setError(null);

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.status === 429) {
        const reset = res.headers.get('X-RateLimit-Reset');
        setError(
          reset
            ? `Rate limit exceeded. Try again after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.`
            : 'Rate limit exceeded. Please wait a moment.',
        );
        setLoading(false);
        return;
      }

      const data = (await res.json()) as {
        answer?: string;
        citations?: Citation[];
        error?: string;
      };

      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', text: data.error ?? 'An unexpected error occurred.', isError: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', text: data.answer ?? '', citations: data.citations ?? [] },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: 'Network error – could not reach the server.', isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadStatus(null);
    setError(null);

    const results: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadStatus(`Uploading ${i + 1} of ${files.length}: "${file.name}"…`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok || data.error) {
          errors.push(`${file.name}: ${data.error ?? 'Upload failed.'}`);
        } else {
          results.push(`"${data.filename}" (${data.chunks} chunks)`);
        }
      } catch {
        errors.push(`${file.name}: Network error.`);
      }
    }

    if (results.length > 0) {
      setUploadStatus(`Ingested ${results.length} file(s): ${results.join(', ')}.`);
      await fetchIngestedFiles();
    } else {
      setUploadStatus(null);
    }
    if (errors.length > 0) setError(errors.join(' | '));

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div style={{ display: 'flex', height: '100dvh' }}>

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar — desktop only                                               */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className="desktop-only"
        style={{
          width: '230px',
          background: 'rgba(15, 24, 56, 0.85)',
          borderRight: '1px solid var(--border)',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Brand mark */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <ThryvLogo />
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              borderLeft: '1px solid var(--border)',
              paddingLeft: '10px',
            }}
          >
            Docs AI
          </span>
        </div>

        {/* New Thread */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={handleNewThread}
            className="btn-primary"
            style={{ width: '100%', padding: '9px 14px' }}
          >
            + New Thread
          </button>
        </div>

        {/* Thread history */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Recent Threads
          </p>
          {threads.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No threads yet.
            </p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => handleSwitchThread(thread)}
                title={thread.title}
                style={{
                  display: 'block',
                  width: '100%',
                  background: thread.id === activeThreadId ? 'rgba(255,85,0,0.1)' : 'transparent',
                  border: thread.id === activeThreadId ? '1px solid rgba(255,85,0,0.3)' : '1px solid transparent',
                  borderRadius: '8px',
                  color: thread.id === activeThreadId ? '#fff' : 'var(--text-muted)',
                  padding: '7px 10px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '3px',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {thread.title}
              </button>
            ))
          )}
        </div>

        {/* Indexed documents */}
        <div style={{ padding: '14px 16px', flex: 1, overflow: 'auto' }}>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Indexed Documents
          </p>
          {ingestedFiles.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No documents indexed.
            </p>
          ) : (
            ingestedFiles.map((f) => (
              <div
                key={f}
                title={f}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflow: 'hidden',
                }}
              >
                <span style={{ color: 'var(--accent)', flexShrink: 0, fontSize: '0.7rem' }}>▪</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main area                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        {/* Header */}
        <header
          className="chat-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 24, 56, 0.7)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            backdropFilter: 'blur(8px)',
          }}
        >
          <ThryvLogo />

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Document Intelligence
          </span>

          {/* Upload button — desktop only */}
          <div className="desktop-only" style={{ alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.txt,.md,.docx,.pptx"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-primary"
              style={{ padding: '9px 20px' }}
            >
              {uploading ? 'Uploading…' : 'Upload & Ingest'}
            </button>
          </div>
        </header>

        {/* Messages */}
        <main
          className="chat-main"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {messages.length === 0 && !loading && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '18px',
                textAlign: 'center',
                padding: '40px 8px',
              }}
            >
              <ThryvLogo />
              <h2
                className="empty-headline"
                style={{ margin: 0, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}
              >
                Ask anything about your documents.
              </h2>
              <p
                style={{
                  margin: 0,
                  maxWidth: '400px',
                  lineHeight: '1.7',
                  color: 'var(--text-muted)',
                  fontSize: '0.9rem',
                }}
              >
                Upload your files, then ask questions and get cited answers instantly.
              </p>

              <div style={{ width: '44px', height: '3px', borderRadius: '99px', background: 'var(--accent)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '480px' }}>
                {suggestedPrompts.map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      padding: '11px 18px',
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,85,0,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {loading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </main>

        {/* Upload success banner */}
        {uploadStatus && (
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(76, 175, 136, 0.1)',
              borderTop: '1px solid rgba(76,175,136,0.25)',
              color: 'var(--success)',
              fontSize: '0.84rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <span>{uploadStatus}</span>
            <button
              onClick={() => setUploadStatus(null)}
              style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px', fontFamily: 'inherit' }}
            >
              ×
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(224, 92, 92, 0.1)',
              borderTop: '1px solid rgba(224,92,92,0.25)',
              color: 'var(--error)',
              fontSize: '0.84rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px', fontFamily: 'inherit' }}
            >
              ×
            </button>
          </div>
        )}

        {/* Input bar */}
        <form
          onSubmit={handleSubmit}
          className="chat-form"
          style={{
            background: 'rgba(15, 24, 56, 0.7)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-end',
            flexShrink: 0,
            backdropFilter: 'blur(8px)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents…"
            rows={1}
            disabled={loading}
            maxLength={1000}
            aria-label="Question input"
            style={{
              flex: 1,
              resize: 'none',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              color: 'var(--text)',
              padding: '13px 16px',
              fontSize: '0.92rem',
              lineHeight: '1.5',
              outline: 'none',
              transition: 'border-color 0.15s',
              overflowY: 'auto',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--accent)')}
            onBlur={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)')}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary"
            style={{ padding: '13px 22px', flexShrink: 0 }}
          >
            {loading ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

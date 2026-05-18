'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        color: copied ? 'var(--success)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: '0.72rem',
        padding: '3px 8px',
        fontFamily: 'inherit',
        transition: 'color 0.15s, border-color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!copied) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Strip [n] and [n, m, ...] citation markers from rendered text
  const cleanText = message.text.replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: '6px',
        width: '100%',
        minWidth: 0,
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
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          cleanText
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '14px 0 6px', color: 'var(--text)' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '12px 0 4px', color: 'var(--text)' }}>{children}</h3>,
              p: ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
              ul: ({ children }) => <ul style={{ margin: '4px 0 10px', paddingLeft: '20px' }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '4px 0 10px', paddingLeft: '20px' }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: '3px' }}>{children}</li>,
              strong: ({ children }) => <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>,
              code: ({ children }) => <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '4px', padding: '1px 5px', fontSize: '0.85em', fontFamily: 'monospace' }}>{children}</code>,
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
            }}
          >
            {cleanText}
          </ReactMarkdown>
        )}
      </div>

      {!isUser && !message.isError && (
        <div style={{ paddingInline: '4px' }}>
          <CopyButton text={cleanText} />
        </div>
      )}

      {message.citations && message.citations.length > 0 && (
        <div className="cite-max" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            onClick={() => setSourcesOpen((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 4px',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Sources ({message.citations.length})
            </span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
              {sourcesOpen ? '▲' : '▼'}
            </span>
          </button>

          {sourcesOpen && message.citations.map((c) => (
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
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Document preview state
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<{ page: number; content: string }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Paste-text modal state
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');

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

  async function handleDeleteDocument(filename: string) {
    setDeleting(true);
    try {
      await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      await fetchIngestedFiles();
    } catch {
      // silently ignore
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
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

  async function handlePreviewDocument(filename: string) {
    setPreviewFile(filename);
    setPreviewPages([]);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/documents/preview?filename=${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setPreviewError(data.error ?? 'Failed to load preview.');
      } else {
        setPreviewPages(data.pages ?? []);
      }
    } catch {
      setPreviewError('Network error – could not load preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewFile(null);
    setPreviewPages([]);
    setPreviewError(null);
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

    // Build conversation history (last 6 messages = up to 3 prior exchanges)
    const history = messages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
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

  async function handlePasteSubmit() {
    const text = pasteText.trim();
    if (!text || uploading) return;

    setUploading(true);
    setUploadStatus(`Ingesting pasted text…`);
    setError(null);

    try {
      const res = await fetch('/api/upload-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title: pasteTitle.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Upload failed.');
        setUploadStatus(null);
      } else {
        setUploadStatus(`Ingested "${data.filename}" (${data.chunks} chunks).`);
        await fetchIngestedFiles();
        setPasteOpen(false);
        setPasteText('');
        setPasteTitle('');
      }
    } catch {
      setError('Network error – could not reach the server.');
      setUploadStatus(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0 }}>

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
            height: '62px',
            padding: '0 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexShrink: 0,
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
                <button
                  onClick={() => handlePreviewDocument(f)}
                  title={`Preview ${f}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    fontSize: '0.75rem',
                    padding: 0,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                  }}
                >
                  {f}
                </button>
                <button
                  onClick={() => setDeleteConfirm(f)}
                  title="Remove document"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '0 2px',
                    lineHeight: 1,
                    flexShrink: 0,
                    fontFamily: 'inherit',
                    opacity: 0.6,
                    transition: 'opacity 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.6';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main area                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minWidth: 0 }}>

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
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Document Intelligence
          </span>

          {/* Upload buttons — desktop only */}
          <div className="desktop-only" style={{ alignItems: 'center', gap: '8px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.txt,.md,.docx,.pptx"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => setPasteOpen(true)}
              disabled={uploading}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                cursor: uploading ? 'not-allowed' : 'pointer',
                padding: '9px 18px',
                fontSize: '0.84rem',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!uploading) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
              }}
            >
              Paste Text
            </button>
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
            placeholder="Ask a question"
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
              minWidth: 0,
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

      {/* Document preview modal */}
      {previewFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              maxWidth: '720px',
              width: '92%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Preview header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewFile}
                </p>
                {!previewLoading && !previewError && previewPages.length > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {previewPages.length} {previewPages.length === 1 ? 'page' : 'pages'}
                  </p>
                )}
              </div>
              <button
                onClick={closePreview}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: '4px 10px',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Preview body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
              }}
            >
              {previewLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '10px' }}>
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
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Loading preview…</span>
                </div>
              )}

              {previewError && (
                <p style={{ margin: 0, color: 'var(--error)', fontSize: '0.88rem', textAlign: 'center', padding: '40px 0' }}>
                  {previewError}
                </p>
              )}

              {!previewLoading && !previewError && previewPages.map((pg) => (
                <div key={pg.page} style={{ marginBottom: '24px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                        flexShrink: 0,
                      }}
                    >
                      Page {pg.page}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '0.84rem',
                      lineHeight: '1.7',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '16px 18px',
                    }}
                  >
                    {pg.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Paste-text modal */}
      {pasteOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploading) {
              setPasteOpen(false);
            }
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              maxWidth: '640px',
              width: '92%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                  Paste text to ingest
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  We&apos;ll auto-name it based on the content.
                </p>
              </div>
              <button
                onClick={() => { if (!uploading) setPasteOpen(false); }}
                disabled={uploading}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-muted)',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  padding: '4px 10px',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label
                  htmlFor="paste-title"
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  Title (optional)
                </label>
                <input
                  id="paste-title"
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="Leave blank to auto-name from content"
                  maxLength={60}
                  disabled={uploading}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    padding: '9px 12px',
                    fontSize: '0.88rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                  onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--accent)')}
                  onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--border)')}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label
                  htmlFor="paste-text"
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  Text
                </label>
                <textarea
                  id="paste-text"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste any text here — notes, transcripts, emails, articles, etc."
                  rows={12}
                  disabled={uploading}
                  maxLength={200_000}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    padding: '12px 14px',
                    fontSize: '0.88rem',
                    lineHeight: '1.6',
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: '220px',
                  }}
                  onFocus={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--accent)')}
                  onBlur={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)')}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                  {pasteText.length.toLocaleString()} characters
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
                padding: '14px 24px 18px',
                borderTop: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => { if (!uploading) setPasteOpen(false); }}
                disabled={uploading}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-muted)',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  padding: '8px 18px',
                  fontSize: '0.84rem',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePasteSubmit}
                disabled={uploading || pasteText.trim().length < 40}
                className="btn-primary"
                style={{ padding: '9px 22px' }}
              >
                {uploading ? 'Ingesting…' : 'Ingest Text'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {deleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '28px 28px 24px',
              maxWidth: '360px',
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
              Remove document?
            </p>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: '1.6', wordBreak: 'break-all' }}>
              <strong style={{ color: 'var(--text)' }}>{deleteConfirm}</strong> will be permanently removed from the index and will no longer appear in answers.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '8px 18px',
                  fontSize: '0.84rem',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDocument(deleteConfirm)}
                disabled={deleting}
                style={{
                  background: 'rgba(224,92,92,0.15)',
                  border: '1px solid rgba(224,92,92,0.4)',
                  borderRadius: '8px',
                  color: 'var(--error)',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  padding: '8px 18px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                {deleting ? 'Removing…' : 'Yes, remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

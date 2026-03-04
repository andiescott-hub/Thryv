'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Citation {
  id: number;
  filename: string;
  page: number;
  excerpt: string;
}

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  text: string;
  citations?: Citation[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
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
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            color: 'var(--accent)',
          }}
        >
          <span
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '0.7rem',
              fontWeight: 700,
            }}
          >
            [{citation.id}]
          </span>
          <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
            {citation.filename}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>p.{citation.page}</span>
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            padding: '2px 4px',
          }}
          aria-label={expanded ? 'Collapse excerpt' : 'Expand excerpt'}
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

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: '8px',
        maxWidth: '100%',
      }}
    >
      {/* Role label */}
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: isUser ? 'var(--accent)' : 'var(--text-muted)',
          paddingInline: '4px',
        }}
      >
        {isUser ? 'You' : 'Assistant'}
      </span>

      {/* Bubble */}
      <div
        style={{
          background: isUser ? 'var(--user-bubble)' : 'var(--assistant-bubble)',
          border: isUser ? '1px solid var(--accent-dim)' : '1px solid var(--border)',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '12px 16px',
          maxWidth: '80%',
          lineHeight: '1.65',
          fontSize: '0.925rem',
          color: message.isError ? 'var(--error)' : 'var(--text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        className="answer-text"
      >
        {message.text}
      </div>

      {/* Citations */}
      {message.citations && message.citations.length > 0 && (
        <div
          style={{
            width: '80%',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
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

function TypingIndicator() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingInline: '4px',
      }}
    >
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Assistant
      </span>
      <span
        style={{
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: '6px',
              height: '6px',
              background: 'var(--text-muted)',
              borderRadius: '50%',
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new message
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: question,
    };
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
        const msg = reset
          ? `Rate limit exceeded. Try again after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.`
          : 'Rate limit exceeded. Please wait a moment.';
        setError(msg);
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
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: data.error ?? 'An unexpected error occurred.',
            isError: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: data.answer ?? '',
            citations: data.citations ?? [],
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Network error – could not reach the server.',
          isError: true,
        },
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

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

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
      setUploadStatus(`Ingested ${results.length} file(s): ${results.join(', ')}. You can now ask questions about them.`);
    } else {
      setUploadStatus(null);
    }
    if (errors.length > 0) {
      setError(errors.join(' | '));
    }

    setUploading(false);
    // Reset file input so the same files can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: 'var(--bg)',
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: 700,
            color: '#fff',
          }}
        >
          T
        </div>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            Thryv Document Intelligence
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            Ask questions about your indexed documents
          </p>
        </div>
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
          style={{
            background: uploading ? 'var(--surface-2)' : 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: uploading ? 'var(--text-muted)' : 'var(--text)',
            padding: '8px 14px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: uploading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'border-color 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!uploading) (e.target as HTMLButtonElement).style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.borderColor = 'var(--border)';
          }}
          aria-label="Upload document"
        >
          {uploading ? 'Uploading...' : 'Upload & Ingest'}
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Message list                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {isEmpty && !loading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '40px 24px',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>📄</div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Ask anything about your documents
            </h2>
            <p style={{ margin: 0, maxWidth: '400px', lineHeight: '1.6' }}>
              Type a question below. The system will search your indexed PDFs
              and spreadsheets and return cited answers.
            </p>
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '100%',
                maxWidth: '480px',
              }}
            >
              {[
                'What were the Q3 marketing spend figures?',
                'Summarise the key campaign outcomes from the annual report.',
                'Which products had the highest conversion rate?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text)',
                    padding: '10px 16px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) =>
                    ((e.target as HTMLButtonElement).style.borderColor =
                      'var(--accent)')
                  }
                  onMouseLeave={(e) =>
                    ((e.target as HTMLButtonElement).style.borderColor =
                      'var(--border)')
                  }
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

      {/* ------------------------------------------------------------------ */}
      {/* Upload success banner                                                */}
      {/* ------------------------------------------------------------------ */}
      {uploadStatus && (
        <div
          style={{
            padding: '10px 24px',
            background: '#142a14',
            borderTop: '1px solid #204a20',
            color: '#6fcf6f',
            fontSize: '0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{uploadStatus}</span>
          <button
            onClick={() => setUploadStatus(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#6fcf6f',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0 4px',
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error banner                                                         */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div
          style={{
            padding: '10px 24px',
            background: '#2a1414',
            borderTop: '1px solid #4a2020',
            color: 'var(--error)',
            fontSize: '0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--error)',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0 4px',
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Input area                                                           */}
      {/* ------------------------------------------------------------------ */}
      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: '1px solid var(--border)',
          padding: '16px 24px',
          background: 'var(--surface)',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={loading}
          style={{
            flex: 1,
            resize: 'none',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            color: 'var(--text)',
            padding: '12px 16px',
            fontSize: '0.925rem',
            lineHeight: '1.5',
            outline: 'none',
            transition: 'border-color 0.15s',
            overflowY: 'auto',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          maxLength={1000}
          aria-label="Question input"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? 'var(--surface-2)' : 'var(--accent)',
            border: '1px solid',
            borderColor:
              loading || !input.trim() ? 'var(--border)' : 'var(--accent)',
            borderRadius: '12px',
            color: loading || !input.trim() ? 'var(--text-muted)' : '#fff',
            padding: '12px 20px',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          aria-label="Send question"
        >
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

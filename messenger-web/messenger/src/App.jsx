import { useCallback, useEffect, useRef, useState } from 'react';
import { createWidgetApi, formatWidgetError } from './api.js';

function useQuery() {
  return new URLSearchParams(window.location.search);
}

export default function App() {
  const q = useQuery();
  const widgetKey = q.get('widget_key') || '';
  const initialVisitor = q.get('visitor_token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [visitor, setVisitor] = useState(null);
  const [step, setStep] = useState('loading');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [showList, setShowList] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const apiRef = useRef(null);
  const pollRef = useRef(null);
  const parentOrigin = useRef('*');
  const configRef = useRef(null);

  const notifyParent = useCallback((type, extra = {}) => {
    window.parent.postMessage({ type, ...extra }, parentOrigin.current);
  }, []);

  const applyBootstrapData = useCallback(
    (data) => {
      setConfig(data);
      configRef.current = data;
      setVisitor(data.visitor);
      try {
        localStorage.setItem(`sw:${widgetKey}:visitor`, data.visitorToken);
      } catch {
        // ignore
      }
      notifyParent('SW_READY', { visitorToken: data.visitorToken });

      if (data.settings?.requireEmail && !data.visitor?.email && !data.visitor?.customerId) {
        setStep('prechat');
      } else {
        setStep('chat');
      }
      return data;
    },
    [widgetKey, notifyParent],
  );

  const runBootstrap = useCallback(async () => {
    if (!widgetKey) {
      throw new Error('Missing widget_key');
    }
    let storedVisitor = '';
    try {
      storedVisitor = localStorage.getItem(`sw:${widgetKey}:visitor`) || '';
    } catch {
      // ignore
    }
    const visitorToken = initialVisitor || storedVisitor;
    const bootstrapApi = createWidgetApi(null, null);
    const data = await bootstrapApi.bootstrap(widgetKey, visitorToken);
    return applyBootstrapData(data);
  }, [widgetKey, initialVisitor, applyBootstrapData]);

  const attachApi = useCallback(
    (apiBase, token, expiresAt) => {
      apiRef.current?.destroy();
      apiRef.current = createWidgetApi(apiBase, token, {
        onBootstrap: async () => {
          const data = await runBootstrap();
          return {
            sessionToken: data.sessionToken,
            expiresAt: data.expiresAt,
          };
        },
      });
      apiRef.current.scheduleProactiveRefresh(expiresAt);
    },
    [runBootstrap],
  );

  const bootstrap = useCallback(async () => {
    const data = await runBootstrap();
    attachApi(data.apiBase, data.sessionToken, data.expiresAt);
    setLoading(false);
  }, [runBootstrap, attachApi]);

  useEffect(() => {
    bootstrap().catch((e) => {
      setError(formatWidgetError(e));
      setLoading(false);
    });
    return () => apiRef.current?.destroy();
  }, [bootstrap]);

  useEffect(() => {
    const onMessage = (event) => {
      if (!event.data?.type) return;
      if (event.data.type === 'SW_OPEN') parentOrigin.current = event.origin;
      if (event.data.type === 'SW_IDENTIFY' && apiRef.current) {
        const p = event.data.payload;
        apiRef.current
          .identify(p)
          .then((r) => {
            setVisitor(r.visitor);
            setStep('chat');
          })
          .catch(() => {});
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const api = apiRef.current;
    if (!api) return null;
    const { conversations: list } = await api.listConversations();
    setConversations(list || []);
    const settings = configRef.current?.settings;
    if (list?.length && !settings?.showConversationList) {
      setConversationId(list[0].id);
      return list[0].id;
    }
    if (list?.length && settings?.showConversationList) {
      return null;
    }
    const { conversation } = await api.createConversation('Web chat');
    setConversationId(conversation.id);
    return conversation.id;
  }, [conversationId]);

  const loadMessages = useCallback(
    async (convId) => {
      const api = apiRef.current;
      if (!api || !convId) return;
      try {
        const since =
          messages.length > 0 ? messages[messages.length - 1].created_at : null;
        const { messages: batch } = await api.listMessages(convId, since);
        if (batch?.length) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of batch) {
              if (!ids.has(m.id)) merged.push(m);
            }
            return merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
          const last = batch[batch.length - 1];
          if (last.sender_type === 'agent') {
            notifyParent('SW_UNREAD', { count: 1 });
          }
        }
        try {
          const { agentTyping: typing } = await api.getTyping(convId);
          setAgentTyping(typing);
        } catch {
          // ignore typing errors during poll
        }
      } catch {
        // Polling: auth refresh is handled in api layer; don't flash errors on background poll
      }
    },
    [messages, notifyParent],
  );

  useEffect(() => {
    if (step !== 'chat' || !apiRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const conv = await ensureConversation();
        if (cancelled || !conv) return;
        setConversationId(conv);
        await loadMessages(conv);
        pollRef.current = setInterval(() => loadMessages(conv), 3000);
      } catch (e) {
        if (!cancelled) setError(formatWidgetError(e));
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, ensureConversation, loadMessages]);

  async function handlePreChat(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const r = await apiRef.current.preChat({ email, name });
      setVisitor(r.visitor);
      setStep('chat');
    } catch (err) {
      setError(formatWidgetError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError('');
    try {
      let convId = conversationId;
      if (!convId) convId = await ensureConversation();
      const result = await apiRef.current.sendMessage(convId, draft.trim(), crypto.randomUUID());
      setDraft('');
      if (result.message) {
        setMessages((prev) => [...prev, result.message]);
      }
      if (result.conversationId) setConversationId(result.conversationId);
    } catch (err) {
      setError(formatWidgetError(err));
    } finally {
      setSending(false);
    }
  }

  const brand = config?.settings?.brandColor || '#2563eb';

  if (loading) {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (error && step === 'loading') {
    return (
      <div className="shell">
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="shell" style={{ '--brand': brand }}>
      <header className="header">
        <strong>{config?.settings?.greeting || 'Support'}</strong>
        {config?.settings?.showConversationList && (
          <button type="button" className="link" onClick={() => setShowList(!showList)}>
            {showList ? 'Chat' : 'History'}
          </button>
        )}
      </header>

      {error && <p className="error banner">{error}</p>}

      {step === 'prechat' && (
        <form className="prechat" onSubmit={handlePreChat}>
          <p className="muted">Tell us how to reach you</p>
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="text"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={sending}>
            Start chat
          </button>
        </form>
      )}

      {step === 'chat' && showList && (
        <ul className="conv-list">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setConversationId(c.id);
                  setMessages([]);
                  setShowList(false);
                  loadMessages(c.id);
                }}
              >
                {c.subject || 'Conversation'} · {c.status}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="link"
              onClick={async () => {
                try {
                  const { conversation } = await apiRef.current.createConversation('New chat');
                  setConversationId(conversation.id);
                  setMessages([]);
                  setShowList(false);
                } catch (err) {
                  setError(formatWidgetError(err));
                }
              }}
            >
              + New conversation
            </button>
          </li>
        </ul>
      )}

      {step === 'chat' && !showList && (
        <>
          <div className="messages">
            {messages.length === 0 && (
              <p className="muted center">{config?.settings?.greeting}</p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.sender_type === 'customer' ? 'mine' : 'theirs'}`}
              >
                {m.content}
              </div>
            ))}
            {agentTyping && <p className="typing">Team is typing…</p>}
          </div>
          <form className="composer" onSubmit={handleSend}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              disabled={sending}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              Send
            </button>
          </form>
        </>
      )}

      {config?.settings?.privacyUrl && (
        <footer className="footer">
          <a href={config.settings.privacyUrl} target="_blank" rel="noreferrer">
            Privacy
          </a>
        </footer>
      )}
    </div>
  );
}

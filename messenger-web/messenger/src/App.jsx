import { useCallback, useEffect, useRef, useState } from 'react';
import { createWidgetApi, formatWidgetError } from './api.js';

function useQuery() {
  return new URLSearchParams(window.location.search);
}

export default function App() {
  const q = useQuery();
  const widgetKey = q.get('widget_key') || '';
  const initialVisitor = q.get('visitor_token') || '';
  const initialUserJwt = q.get('user_jwt') || '';

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
  const [chatReload, setChatReload] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const apiRef = useRef(null);
  const pollRef = useRef(null);
  const parentOrigin = useRef('*');
  const configRef = useRef(null);
  const userJwtRef = useRef(initialUserJwt || null);
  const bootstrapStartedRef = useRef(false);
  const conversationIdRef = useRef(null);
  const messagesRef = useRef([]);
  const loadMessagesRef = useRef(null);

  const notifyParent = useCallback((type, extra = {}) => {
    window.parent.postMessage({ type, ...extra }, parentOrigin.current);
  }, []);

  const applyBootstrapData = useCallback(
    (data) => {
      setConfig(data);
      configRef.current = data;
      setVisitor(data.visitor);
      // Persist on host via loader (SW_READY); iframe must not keep a second copy on another origin.
      notifyParent('SW_READY', { visitorToken: data.visitorToken });

      // Pre-chat is for anonymous visitors/leads only — not host-identified users (JWT boot).
      if (
        data.settings?.requireEmail &&
        !data.visitor?.isIdentified &&
        !data.visitor?.customerId
      ) {
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
    // Visitor continuity token comes from the host page only (loader localStorage → URL param).
    // Do not read iframe-origin storage — clearing the customer site would not reset the widget.
    const visitorToken = initialVisitor || '';
    const bootstrapApi = createWidgetApi(null, null);
    const data = await bootstrapApi.bootstrap(widgetKey, visitorToken, userJwtRef.current);
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

  const startBootstrap = useCallback(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    bootstrap().catch((e) => {
      setError(formatWidgetError(e));
      setLoading(false);
    });
  }, [bootstrap]);

  useEffect(() => {
    const onMessage = (event) => {
      if (!event.data?.type) return;
      if (event.data.type === 'SW_OPEN') parentOrigin.current = event.origin;
      if (event.data.type === 'SW_USER_JWT' && typeof event.data.userJwt === 'string') {
        userJwtRef.current = event.data.userJwt;
        if (!bootstrapStartedRef.current) {
          startBootstrap();
        } else if (apiRef.current && !configRef.current?.visitor?.isIdentified) {
          apiRef.current
            .identify({ userJwt: event.data.userJwt })
            .then((r) => {
              setVisitor(r.visitor);
              configRef.current = { ...configRef.current, visitor: r.visitor };
              setStep('chat');
              setChatReload((n) => n + 1);
            })
            .catch(() => {});
        }
      }
      if (event.data.type === 'SW_IDENTIFY') {
        const p = event.data.payload;
        if (p?.userJwt && !bootstrapStartedRef.current) {
          userJwtRef.current = p.userJwt;
          startBootstrap();
          return;
        }
        if (!apiRef.current) return;
        const body = p?.userJwt ? { userJwt: p.userJwt } : p;
        apiRef.current
          .identify(body)
          .then((r) => {
            setVisitor(r.visitor);
            configRef.current = {
              ...configRef.current,
              visitor: r.visitor,
            };
            setConversations([]);
            setConversationId(null);
            setMessages([]);
            setShowList(false);
            setStep('chat');
            setChatReload((n) => n + 1);
          })
          .catch(() => {});
      }
    };
    window.addEventListener('message', onMessage);
    let t;
    if (initialUserJwt) {
      startBootstrap();
    } else {
      t = setTimeout(() => startBootstrap(), 80);
    }
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('message', onMessage);
      apiRef.current?.destroy();
    };
  }, [startBootstrap, initialUserJwt]);

  conversationIdRef.current = conversationId;
  messagesRef.current = messages;

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const api = apiRef.current;
    if (!api) return null;
    const v = configRef.current?.visitor;
    const canResumeChat = Boolean(v?.canResumeChat ?? v?.customerId);

    if (canResumeChat) {
      const { conversations: list } = await api.listConversations();
      const sorted = [...(list || [])].sort((a, b) => {
        const ta = a.last_message_at || a.created_at || '';
        const tb = b.last_message_at || b.created_at || '';
        return tb.localeCompare(ta);
      });
      setConversations(sorted);
      if (sorted.length > 0) {
        const latestId = sorted[0].id;
        conversationIdRef.current = latestId;
        setConversationId(latestId);
        return latestId;
      }
    } else {
      setConversations([]);
    }

    const { conversation } = await api.createConversation('Web chat');
    conversationIdRef.current = conversation.id;
    setConversationId(conversation.id);
    return conversation.id;
  }, []);

  const loadMessages = useCallback(async (convId, { fullHistory = false } = {}) => {
    const api = apiRef.current;
    if (!api || !convId) return;
    try {
      const prev = messagesRef.current;
      const since =
        fullHistory || prev.length === 0 ? null : prev[prev.length - 1]?.created_at ?? null;
      const { messages: batch } = await api.listMessages(convId, since);
      if (batch?.length) {
        setMessages((p) => {
          const ids = new Set(p.map((m) => m.id));
          const merged = [...p];
          for (const m of batch) {
            if (!ids.has(m.id)) merged.push(m);
          }
          const next = merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
          messagesRef.current = next;
          return next;
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
  }, [notifyParent]);

  loadMessagesRef.current = loadMessages;

  // Only re-run when entering chat or explicit reload — NOT when messages/conversationId change.
  useEffect(() => {
    if (step !== 'chat' || !apiRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setMessages([]);
        messagesRef.current = [];
        const conv = await ensureConversation();
        if (cancelled || !conv) return;
        conversationIdRef.current = conv;
        setConversationId(conv);
        await loadMessages(conv, { fullHistory: true });
        if (cancelled) return;
        pollRef.current = setInterval(() => {
          loadMessagesRef.current?.(conv);
        }, 3000);
      } catch (e) {
        if (!cancelled) setError(formatWidgetError(e));
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, chatReload, ensureConversation, loadMessages]);

  async function handlePreChat(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const r = await apiRef.current.preChat({ email, name });
      setVisitor(r.visitor);
      configRef.current = { ...configRef.current, visitor: r.visitor };
      setStep('chat');
      setChatReload((n) => n + 1);
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
  const canViewHistory = visitor?.isIdentified === true;
  const canResumeChat = Boolean(visitor?.customerId);

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
        {config?.settings?.showConversationList && canViewHistory && (
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

      {step === 'chat' && canViewHistory && showList && (
        <ul className="conv-list">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                  conversationIdRef.current = c.id;
                  setConversationId(c.id);
                  setMessages([]);
                  messagesRef.current = [];
                  setShowList(false);
                  loadMessages(c.id, { fullHistory: true });
                  pollRef.current = setInterval(() => {
                    loadMessagesRef.current?.(c.id);
                  }, 3000);
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
                  if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                  const { conversation } = await apiRef.current.createConversation('New chat');
                  conversationIdRef.current = conversation.id;
                  setConversationId(conversation.id);
                  setMessages([]);
                  messagesRef.current = [];
                  setShowList(false);
                  await loadMessages(conversation.id, { fullHistory: true });
                  pollRef.current = setInterval(() => {
                    loadMessagesRef.current?.(conversation.id);
                  }, 3000);
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

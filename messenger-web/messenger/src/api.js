const DEFAULT_API = import.meta.env.VITE_WIDGET_API_URL || 'http://localhost:3001';

/** Refresh this long before server `expiresAt`. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const WIDGET_USER_ERROR = 'Connection problem. Please try again.';

function userFacingError(cause) {
  const err = new Error(WIDGET_USER_ERROR);
  err.userFacing = true;
  err.cause = cause;
  return err;
}

function parseJwtExpMs(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json.exp === 'number') return json.exp * 1000;
  } catch {
    // ignore
  }
  return null;
}

/**
 * @param {string|null} apiBase
 * @param {string|null} initialToken
 * @param {{
 *   onTokenChange?: (token: string, expiresAt: string | null) => void,
 *   onBootstrap?: () => Promise<{ sessionToken: string, expiresAt?: string }>,
 * }} [hooks]
 */
export function createWidgetApi(apiBase, initialToken, hooks = {}) {
  const base = (apiBase || DEFAULT_API).replace(/\/$/, '');
  let sessionToken = initialToken;
  let refreshTimer = null;
  const { onTokenChange, onBootstrap } = hooks;

  function applyToken(token, expiresAt) {
    sessionToken = token;
    onTokenChange?.(token, expiresAt ?? null);
    scheduleProactiveRefresh(expiresAt);
  }

  function scheduleProactiveRefresh(expiresAt) {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (!sessionToken) return;

    const expiryMs =
      expiresAt != null ? new Date(expiresAt).getTime() : parseJwtExpMs(sessionToken);
    if (!expiryMs || !Number.isFinite(expiryMs)) return;

    const delay = expiryMs - Date.now() - REFRESH_BUFFER_MS;
    const run = () => {
      refreshSessionInternal().catch(() => {
        if (onBootstrap) {
          bootstrapInternal().catch(() => {});
        }
      });
    };

    if (delay <= 0) {
      run();
      return;
    }
    refreshTimer = setTimeout(run, delay);
  }

  async function rawRequest(path, options = {}, token = sessionToken) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${base}/api/widget/v1${path}`, {
        ...options,
        headers,
      });
    } catch (networkErr) {
      const hint =
        networkErr?.message === 'Failed to fetch'
          ? ` Cannot reach API at ${base}. Is the server running (npm run dev:server)?`
          : '';
      throw new Error((networkErr?.message || 'Network error') + hint);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function refreshSessionInternal() {
    const data = await rawRequest('/session/refresh', { method: 'POST' });
    applyToken(data.sessionToken, data.expiresAt);
    return data;
  }

  async function bootstrapInternal() {
    if (!onBootstrap) throw userFacingError(new Error('bootstrap unavailable'));
    const data = await onBootstrap();
    if (data?.sessionToken) {
      applyToken(data.sessionToken, data.expiresAt ?? null);
    }
    return data;
  }

  /**
   * Authenticated request with silent refresh → bootstrap → retry.
   */
  async function request(path, options = {}, retry = { didRefresh: false, didBootstrap: false }) {
    try {
      return await rawRequest(path, options);
    } catch (err) {
      if (err.status !== 401) throw err;

      if (!retry.didRefresh && sessionToken) {
        retry.didRefresh = true;
        try {
          await refreshSessionInternal();
          return await request(path, options, retry);
        } catch {
          // fall through to bootstrap
        }
      }

      if (!retry.didBootstrap && onBootstrap) {
        retry.didBootstrap = true;
        try {
          await bootstrapInternal();
          return await request(path, options, retry);
        } catch {
          // fall through
        }
      }

      throw userFacingError(err);
    }
  }

  return {
    getSessionToken: () => sessionToken,

    scheduleProactiveRefresh,

    destroy() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    },

    /** No session; no auto-retry. */
    async bootstrap(widgetKey, visitorToken, userJwt) {
      const q = new URLSearchParams({ widget_key: widgetKey });
      if (visitorToken) q.set('visitor_token', visitorToken);
      if (userJwt && typeof userJwt === 'string') q.set('user_jwt', userJwt);
      return rawRequest(`/bootstrap?${q}`, { method: 'GET' }, null);
    },

    refreshSession() {
      return refreshSessionInternal();
    },

    preChat(body) {
      return request('/pre-chat', { method: 'POST', body: JSON.stringify(body) });
    },

    identify(body) {
      return request('/identify', { method: 'POST', body: JSON.stringify(body) });
    },

    listConversations() {
      return request('/conversations');
    },

    createConversation(subject) {
      return request('/conversations', {
        method: 'POST',
        body: JSON.stringify({ subject }),
      });
    },

    listMessages(conversationId, since) {
      const q = since ? `?since=${encodeURIComponent(since)}` : '';
      return request(`/conversations/${conversationId}/messages${q}`);
    },

    sendMessage(conversationId, message, idempotencyKey) {
      const path = conversationId
        ? `/conversations/${conversationId}/messages`
        : '/messages/send';
      return request(path, {
        method: 'POST',
        body: JSON.stringify({ message, idempotencyKey }),
      });
    },

    getTyping(conversationId) {
      return request(`/conversations/${conversationId}/typing`);
    },
  };
}

/** @param {unknown} err */
export function formatWidgetError(err) {
  if (err?.userFacing) return WIDGET_USER_ERROR;
  const msg = typeof err?.message === 'string' ? err.message : '';
  if (err?.status === 401 || /session|expired|unauthorized/i.test(msg)) {
    return WIDGET_USER_ERROR;
  }
  return msg || WIDGET_USER_ERROR;
}

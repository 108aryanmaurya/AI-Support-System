(function () {
  function resolveMessengerBase(override) {
    const raw =
      override ||
      (typeof window !== 'undefined' && window.__SW_IFRAME_ORIGIN__) ||
      'http://localhost:5175/v1/messenger';
    return String(raw).replace(/\/$/, '');
  }

  let messengerBase = resolveMessengerBase();

  const state = {
    widgetKey: null,
    iframe: null,
    iframeOrigin: new URL(messengerBase).origin,
    open: false,
    ready: false,
    pendingIdentify: null,
    pendingUserJwt: null,
  };

  function storageKey(key) {
    return `sw:${key}:visitor`;
  }

  function getVisitorToken(widgetKey) {
    try {
      return localStorage.getItem(storageKey(widgetKey)) || '';
    } catch {
      return '';
    }
  }

  function setVisitorToken(widgetKey, token) {
    try {
      localStorage.setItem(storageKey(widgetKey), token);
    } catch {
      // ignore
    }
  }

  function createLauncher(position, color) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open support chat');
    btn.id = 'sw-launcher';
    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: '2147483646',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
      background: color || '#2563eb',
      color: '#fff',
      fontSize: '24px',
      lineHeight: '1',
      ...(position === 'bottom-left'
        ? { left: '20px', bottom: '20px' }
        : { right: '20px', bottom: '20px' }),
    });
    btn.textContent = '💬';
    btn.addEventListener('click', () => SupportWidget.toggle());
    document.body.appendChild(btn);
    return btn;
  }

  function buildIframeSrc(widgetKey) {
    const params = new URLSearchParams({ widget_key: widgetKey });
    const visitor = getVisitorToken(widgetKey);
    if (visitor) params.set('visitor_token', visitor);
    if (state.pendingUserJwt) params.set('user_jwt', state.pendingUserJwt);
    return `${messengerBase}/?${params.toString()}`;
  }

  function ensureIframe(widgetKey) {
    if (state.iframe) {
      if (state.pendingUserJwt && !state.iframe.src.includes('user_jwt=')) {
        state.ready = false;
        state.iframe.src = buildIframeSrc(widgetKey);
      }
      return state.iframe;
    }

    const iframe = document.createElement('iframe');
    iframe.title = 'Support messenger';
    iframe.src = buildIframeSrc(widgetKey);
    Object.assign(iframe.style, {
      position: 'fixed',
      zIndex: '2147483647',
      width: '380px',
      height: '560px',
      maxHeight: 'calc(100vh - 40px)',
      border: 'none',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      display: 'none',
      right: '20px',
      bottom: '88px',
    });
    iframe.allow = 'clipboard-write';
    document.body.appendChild(iframe);
    state.iframe = iframe;

    iframe.addEventListener('load', () => {
      if (state.pendingUserJwt && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'SW_USER_JWT', userJwt: state.pendingUserJwt },
          state.iframeOrigin,
        );
      }
    });

    window.addEventListener('message', (event) => {
      if (event.origin !== state.iframeOrigin) return;
      const data = event.data;
      if (!data || data.type?.indexOf('SW_') !== 0) return;

      if (data.type === 'SW_READY') {
        state.ready = true;
        if (data.visitorToken) setVisitorToken(widgetKey, data.visitorToken);
        if (state.pendingUserJwt) {
          iframe.contentWindow?.postMessage(
            { type: 'SW_USER_JWT', userJwt: state.pendingUserJwt },
            state.iframeOrigin,
          );
        }
        if (state.pendingIdentify) {
          iframe.contentWindow?.postMessage(
            { type: 'SW_IDENTIFY', payload: state.pendingIdentify },
            state.iframeOrigin,
          );
          state.pendingIdentify = null;
        }
      }
      if (data.type === 'SW_UNREAD') {
        const launcher = document.getElementById('sw-launcher');
        if (launcher && !state.open) {
          launcher.style.outline = '3px solid #f59e0b';
        }
      }
    });

    return iframe;
  }

  function applyUserJwt(userJwt) {
    if (typeof userJwt === 'string' && userJwt.trim()) {
      state.pendingUserJwt = userJwt.trim();
    }
  }

  const SupportWidget = {
    init(opts = {}) {
      const key =
        opts.widgetKey ||
        document.currentScript?.getAttribute('data-widget-key') ||
        document.querySelector('script[data-widget-key]')?.getAttribute('data-widget-key');
      if (!key) {
        console.error('[SupportWidget] widgetKey is required');
        return;
      }
      state.widgetKey = key.trim();
      if (opts.iframeOrigin) {
        messengerBase = resolveMessengerBase(opts.iframeOrigin);
        state.iframeOrigin = new URL(messengerBase).origin;
      }
      applyUserJwt(opts.userJwt);
      createLauncher(opts.position || 'bottom-right', opts.brandColor);
    },

    /** Intercom-style boot: init + optional logged-in user JWT from your backend. */
    boot(opts = {}) {
      this.init(opts);
      if (opts.userJwt) {
        applyUserJwt(opts.userJwt);
        if (state.iframe) {
          state.ready = false;
          state.iframe.src = buildIframeSrc(state.widgetKey);
        }
        this.open();
      }
    },

    open() {
      if (!state.widgetKey) return;
      const iframe = ensureIframe(state.widgetKey);
      iframe.style.display = 'block';
      state.open = true;
      const launcher = document.getElementById('sw-launcher');
      if (launcher) launcher.style.outline = 'none';
      iframe.contentWindow?.postMessage({ type: 'SW_OPEN' }, state.iframeOrigin);
    },

    close() {
      if (!state.iframe) return;
      state.iframe.style.display = 'none';
      state.open = false;
      state.iframe.contentWindow?.postMessage({ type: 'SW_CLOSE' }, state.iframeOrigin);
    },

    toggle() {
      if (state.open) this.close();
      else this.open();
    },

    identify(payload) {
      if (!state.widgetKey || !payload) return;
      if (payload.userJwt) applyUserJwt(payload.userJwt);
      if (state.ready && state.iframe?.contentWindow) {
        if (payload.userJwt) {
          state.iframe.contentWindow.postMessage(
            { type: 'SW_USER_JWT', userJwt: payload.userJwt },
            state.iframeOrigin,
          );
        }
        state.iframe.contentWindow.postMessage(
          { type: 'SW_IDENTIFY', payload },
          state.iframeOrigin,
        );
      } else {
        state.pendingIdentify = payload;
        this.open();
      }
    },

    shutdown() {
      this.close();
      state.iframe?.remove();
      state.iframe = null;
      document.getElementById('sw-launcher')?.remove();
      state.widgetKey = null;
      state.ready = false;
      state.pendingUserJwt = null;
      state.pendingIdentify = null;
    },
  };

  window.SupportWidget = SupportWidget;

  const script = document.currentScript;
  const autoKey = script?.getAttribute('data-widget-key');
  if (autoKey) {
    SupportWidget.init({ widgetKey: autoKey });
  }
})();

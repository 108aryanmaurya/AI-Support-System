const STORAGE_KEY = 'widget-test-site-key';
const JWT_STORAGE_KEY = 'widget-test-site-user-jwt';
const IFRAME_ORIGIN =
  import.meta.env.VITE_WIDGET_IFRAME_ORIGIN || 'http://localhost:5175/v1/messenger';
const LOADER_SRC =
  import.meta.env.VITE_WIDGET_LOADER_SRC || 'http://localhost:5174/widget.js';
const API_BASE = import.meta.env.VITE_WIDGET_API_URL || 'http://localhost:3001';

window.__SW_IFRAME_ORIGIN__ = IFRAME_ORIGIN;

const input = document.getElementById('widgetKey');
const status = document.getElementById('status');
const userJwtInput = document.getElementById('userJwt');

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) input.value = saved;

const savedJwt = localStorage.getItem(JWT_STORAGE_KEY);
if (savedJwt && userJwtInput) userJwtInput.value = savedJwt;

/**
 * @param {string} key
 * @param {() => void} [onReady]
 */
function loadWidget(key, onReady) {
  if (!key?.trim()) {
    status.textContent = 'Enter a widget key above.';
    return;
  }
  localStorage.setItem(STORAGE_KEY, key.trim());
  document.querySelectorAll('script[data-widget-key]').forEach((s) => s.remove());
  window.SupportWidget?.shutdown?.();

  const script = document.createElement('script');
  script.async = true;
  script.src = LOADER_SRC;
  script.setAttribute('data-widget-key', key.trim());
  script.onload = () => {
    window.SupportWidget.init({
      widgetKey: key.trim(),
      iframeOrigin: IFRAME_ORIGIN,
    });
    status.textContent = `Widget loaded (${key.trim()}). Use the chat bubble.`;
    onReady?.();
  };
  script.onerror = () => {
    status.textContent = `Failed to load loader from ${LOADER_SRC}. Run messenger-web dev or build.`;
  };
  document.body.appendChild(script);
}

/**
 * Intercom-style logged-in session: boot with server-signed user JWT.
 * @param {string} userJwt
 */
function bootLoggedInUser(userJwt) {
  const key = input.value.trim();
  const jwt = typeof userJwt === 'string' ? userJwt.trim() : '';
  if (!key) {
    status.textContent = 'Enter a widget key first.';
    return;
  }
  if (!jwt) {
    status.textContent = 'Paste a user JWT (from sign-widget-user-jwt.js) or use Sign JWT & boot.';
    return;
  }

  localStorage.setItem(JWT_STORAGE_KEY, jwt);
  if (userJwtInput) userJwtInput.value = jwt;

  const runBoot = () => {
    if (!window.SupportWidget?.boot) {
      status.textContent = 'SupportWidget.boot is not available. Reload the widget script.';
      return;
    }
    window.SupportWidget.boot({
      widgetKey: key,
      iframeOrigin: IFRAME_ORIGIN,
      userJwt: jwt,
    });
    window.SupportWidget.open?.();
    status.textContent =
      'Logged in: SupportWidget.boot({ userJwt }) — chat opened as identified user.';
  };

  if (window.SupportWidget?.boot) {
    runBoot();
  } else {
    status.textContent = 'Loading widget…';
    loadWidget(key, runBoot);
  }
}

input.addEventListener('change', () => loadWidget(input.value));

document.getElementById('btnOpen').addEventListener('click', () => {
  window.SupportWidget?.open?.();
});

document.getElementById('btnBootJwt')?.addEventListener('click', () => {
  bootLoggedInUser(userJwtInput?.value || '');
});

document.getElementById('btnLogoutSim')?.addEventListener('click', () => {
  localStorage.removeItem(JWT_STORAGE_KEY);
  if (userJwtInput) userJwtInput.value = '';
  try {
    const key = input.value.trim();
    if (key) localStorage.removeItem(`sw:${key}:visitor`);
  } catch {
    // ignore
  }
  window.SupportWidget?.shutdown?.();
  const key = input.value.trim();
  if (key) {
    loadWidget(key);
    status.textContent =
      'Logged out: visitor token cleared. Reload widget — pre-chat / anonymous flow.';
  } else {
    status.textContent = 'Logged out: paste widget key and reload.';
  }
});

document.getElementById('btnIdentify').addEventListener('click', () => {
  const userId = document.getElementById('userId').value;
  const email = document.getElementById('email').value;
  const name = document.getElementById('name').value;
  window.SupportWidget?.identify?.({ userId, email, name });
  status.textContent = 'identify() sent (legacy / dev insecure) — open chat if needed.';
});

document.getElementById('btnSignAndBoot')?.addEventListener('click', async () => {
  const key = input.value.trim();
  const userId = document.getElementById('userId').value;
  const email = document.getElementById('email').value;
  const name = document.getElementById('name').value;
  if (!key) {
    status.textContent = 'Enter a widget key first.';
    return;
  }
  status.textContent = 'Signing user JWT via dev API…';
  try {
    const res = await fetch(`${API_BASE}/api/widget/v1/dev/sign-user-jwt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_key: key, userId, email, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (userJwtInput) userJwtInput.value = data.userJwt;
    bootLoggedInUser(data.userJwt);
  } catch (e) {
    status.textContent = `JWT sign failed: ${e.message}`;
  }
});

if (saved) loadWidget(saved);

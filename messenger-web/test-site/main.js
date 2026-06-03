const STORAGE_KEY = 'widget-test-site-key';
const IFRAME_ORIGIN =
  import.meta.env.VITE_WIDGET_IFRAME_ORIGIN || 'http://localhost:5175/v1/messenger';
const LOADER_SRC =
  import.meta.env.VITE_WIDGET_LOADER_SRC || 'http://localhost:5174/widget.js';

window.__SW_IFRAME_ORIGIN__ = IFRAME_ORIGIN;

const input = document.getElementById('widgetKey');
const status = document.getElementById('status');

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) input.value = saved;

function loadWidget(key) {
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
  };
  script.onerror = () => {
    status.textContent = `Failed to load loader from ${LOADER_SRC}. Run messenger-web dev or build.`;
  };
  document.body.appendChild(script);
}

input.addEventListener('change', () => loadWidget(input.value));

document.getElementById('btnOpen').addEventListener('click', () => {
  window.SupportWidget?.open?.();
});

document.getElementById('btnIdentify').addEventListener('click', () => {
  const userId = document.getElementById('userId').value;
  const email = document.getElementById('email').value;
  const name = document.getElementById('name').value;
  window.SupportWidget?.identify?.({ userId, email, name });
  status.textContent = 'identify() sent — open chat if needed.';
});

if (saved) loadWidget(saved);

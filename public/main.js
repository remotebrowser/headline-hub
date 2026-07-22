(function () {
  // --- Session ---

  function getSessionId() {
    const match = document.cookie.match(/(?:^|; )session-id=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function resetSession() {
    const id = crypto.randomUUID();
    document.cookie = `session-id=${encodeURIComponent(id)}; path=/; SameSite=Lax`;
    return id;
  }

  function getSessionHeaders() {
    const id = getSessionId();
    return id ? { 'x-session-id': id } : {};
  }

  resetSession();

  // --- Toast ---

  function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed top-4 right-4 z-[100] flex flex-col gap-2';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'success') {
    const container = getToastContainer();

    const toastEl = document.createElement('div');
    toastEl.className =
      'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white bg-neutral-800';

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'error' ? '❌' : '✅';

    const text = document.createElement('span');
    text.textContent = message;

    toastEl.append(icon, text);
    container.appendChild(toastEl);

    window.setTimeout(
      () => {
        toastEl.remove();
      },
      type === 'error' ? 5000 : 3000
    );
  }

  // --- API client ---

  class ApiClient {
    constructor(baseUrl = '/api') {
      this.baseUrl = baseUrl;
    }

    async request(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...getSessionHeaders(),
          ...options.headers,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText} ${result.error}`;
        showToast(errorMessage, 'error');
        throw new Error(errorMessage);
      }

      if (!result.success) {
        const errorMessage = result.error || 'API request failed';
        showToast(errorMessage, 'error');
        throw new Error(errorMessage);
      }

      return result.data;
    }

    async getNews(source, connection) {
      resetSession();
      const params = new URLSearchParams({ source });
      if (connection) {
        params.append('connection', connection);
      }
      return this.request(`/news?${params.toString()}`, {
        method: 'GET',
      });
    }

    async getNewsSources() {
      return this.request(`/news-source`, {
        method: 'GET',
      });
    }
  }

  const apiClient = new ApiClient();

  // --- Sentry ---

  async function fetchSentryConfig() {
    try {
      const response = await fetch('/api/sentry/config');
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    }
  }

  async function initializeSentry() {
    const sentryConfig = await fetchSentryConfig();
    if (!sentryConfig?.dsn || !window.Sentry) {
      return;
    }

    const environment = sentryConfig.environment || 'local';
    const isProduction = environment === 'production';

    window.Sentry.init({
      dsn: sentryConfig.dsn,
      environment,
      enableLogs: true,
      integrations: [
        window.Sentry.consoleLoggingIntegration(),
        window.Sentry.replayIntegration({
          maskAllText: false,
        }),
        window.Sentry.browserTracingIntegration(),
      ],
      debug: !isProduction,
      tracesSampleRate: isProduction ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event) {
        // Filter out development noise
        if (!isProduction) {
          if (
            event.exception?.values?.[0]?.value?.includes(
              'Failed to retrieve data'
            )
          ) {
            console.log('Filtering out development API error');
            return null;
          }
        }
        return event;
      },
    });
  }

  initializeSentry();

  // --- Headlines UI ---

  const loadingEl = document.getElementById('loading');
  const headlinesEl = document.getElementById('headlines');
  const headlinesListEl = document.getElementById('headlines-list');
  const sourceButtons = document.querySelectorAll('#source-buttons button');

  function setLoading(isLoading) {
    loadingEl.classList.toggle('hidden', !isLoading);
    sourceButtons.forEach((button) => {
      button.disabled = isLoading;
    });
  }

  function renderHeadlines(headlines) {
    headlinesListEl.innerHTML = '';
    headlines.forEach((headline) => {
      const li = document.createElement('li');
      li.className = 'group';

      const a = document.createElement('a');
      a.href = headline.url;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      a.className =
        'text-indigo-700 hover:text-indigo-900 underline decoration-indigo-300 group-hover:decoration-indigo-500';
      a.textContent = headline.title;

      li.appendChild(a);
      headlinesListEl.appendChild(li);
    });
    headlinesEl.classList.toggle('hidden', headlines.length === 0);
  }

  function getConnectionParam() {
    return new URLSearchParams(window.location.search).get('connection');
  }

  async function handleGetNews(source) {
    setLoading(true);
    headlinesEl.classList.add('hidden');
    try {
      const data = await apiClient.getNews(source, getConnectionParam());
      renderHeadlines(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  sourceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const source = button.dataset.source;
      if (source) {
        handleGetNews(source);
      }
    });
  });
})();

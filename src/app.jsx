const { useState, useEffect, useRef, useCallback } = React;

// ─── Anthropic API call ────────────────────────────────────────────────────────

async function extractSearchParams(query, apiKey) {
  const cfg    = window.AGENT_CONFIG;
  const today  = new Date().toISOString().slice(0, 10);

  const systemPrompt =
    cfg.systemPromptBase.replace('{TODAY}', today) +
    '\n\nAdditional instructions:\n' +
    cfg.instructions.map((rule, i) => `${i + 1}. ${rule}`).join('\n');

  const res = await fetch('/proxy/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      cfg.model,
      max_tokens: cfg.maxTokens,
      system:     systemPrompt,
      messages: [{
        role:    'user',
        content: `Extract search parameters from this query: "${query}"\n\nReturn ONLY the JSON object, no explanation.`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data  = await res.json();
  const text  = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse AI response');
  return JSON.parse(match[0]);
}

// ─── News RSS fetch — pulls from all enabled sources in sources.js ────────────

async function fetchFromSource(source, keywords) {
  const url = source.buildUrl(keywords);
  const res = await fetch(`/proxy/rss?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  return parseRSS(await res.text());
}

async function fetchNews(keywords) {
  const sources = (window.NEWS_SOURCES || []).filter(s => s.enabled);
  if (sources.length === 0)
    throw new Error('No news sources enabled. Enable at least one source in src/sources.js.');

  const results = await Promise.all(
    sources.map(s => fetchFromSource(s, keywords).catch(err => {
      console.warn(`[LensAI] Source "${s.name}" failed:`, err.message);
      return [];
    }))
  );

  // Merge results from all sources, deduplicate by URL
  const seen = new Set();
  return results.flat().filter(a => {
    if (!a.link || seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });
}

// ─── Render message with **bold** and \n line breaks ──────────────────────────

function MessageContent({ text }) {
  return (
    <>
      {text.split('\n').map((line, i, arr) => (
        <React.Fragment key={i}>
          {line.split('**').map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
          {i < arr.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const cfg = window.AGENT_CONFIG;

  const FILTER_DEFAULTS = {
    dateFrom: '', dateTo: '',
    sort:        cfg.defaults.sort,
    maxResults:  cfg.defaults.maxResults,
    activeRange: '',
  };

  const [apiKey,          setApiKey]          = useState('');
  const [apiKeyValid,     setApiKeyValid]      = useState(null);
  const [filters,         setFilters]          = useState(FILTER_DEFAULTS); // applied filters (used in search)
  const [pendingFilters,  setPendingFilters]   = useState(FILTER_DEFAULTS); // staging area (sidebar UI)
  const [chatHistory,     setChatHistory]      = useState([]);
  const [articles,        setArticles]         = useState([]);
  const [loading,         setLoading]          = useState(false);
  const [inputValue,      setInputValue]       = useState('');
  const [lastQuery,       setLastQuery]        = useState('');
  const [errorMsg,        setErrorMsg]         = useState('');

  const chatEndRef  = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading, articles]);

  // pendingFilters has unsaved changes if it differs from applied filters
  const hasPendingChanges = JSON.stringify(pendingFilters) !== JSON.stringify(filters);

  const applyFilters = () => setFilters({ ...pendingFilters });

  const resetFilters = () => {
    setPendingFilters(FILTER_DEFAULTS);
    setFilters(FILTER_DEFAULTS);
  };

  const setQuickRange = (days, label) => {
    const { dateFrom, dateTo } = applyQuickRange(days);
    setPendingFilters(f => ({ ...f, dateFrom, dateTo, activeRange: label }));
  };

  // ── Core search pipeline ─────────────────────────────────────────────────────
  const handleSearch = useCallback(async (query) => {
    setErrorMsg('');
    setLoading(true);
    setLastQuery(query);
    setArticles([]);

    try {
      const params = await extractSearchParams(query, apiKey.trim());

      const dateFrom = params.date_from || filters.dateFrom || null;
      const dateTo   = params.date_to   || filters.dateTo   || null;

      let results = await fetchNews(params.keywords || query);

      // Date filter — compare YYYY-MM-DD strings directly to avoid timezone issues
      results = results.filter(a => {
        if (!a.pubDateISO) return true;
        const articleDate = a.pubDateISO.slice(0, 10); // "YYYY-MM-DD"
        if (dateFrom && articleDate < dateFrom) return false;
        if (dateTo   && articleDate > dateTo)   return false;
        return true;
      });

      // Sort
      if (filters.sort === 'newest')
        results.sort((a, b) => new Date(b.pubDateISO || 0) - new Date(a.pubDateISO || 0));
      else if (filters.sort === 'oldest')
        results.sort((a, b) => new Date(a.pubDateISO || 0) - new Date(b.pubDateISO || 0));

      const final    = results.slice(0, filters.maxResults);
      const dateInfo = dateFrom || dateTo ? ` (${dateFrom || '…'} → ${dateTo || 'now'})` : '';
      const reply    = final.length > 0
        ? `Found **${final.length}** articles for "${params.keywords}"${dateInfo}. ${params.intent || ''}`
        : `No articles found for "${params.keywords}"${dateInfo}. Try a broader query or wider date range.`;

      setArticles(final);
      setApiKeyValid(true);
      setChatHistory(h => [...h, { role: 'assistant', content: reply }]);
    } catch (err) {
      const msg = err.message || 'Something went wrong.';
      setErrorMsg(msg);
      setChatHistory(h => [...h, { role: 'assistant', content: `Error: ${msg}` }]);
      if (msg.includes('401') || msg.includes('API key')) setApiKeyValid(false);
    } finally {
      setLoading(false);
    }
  }, [apiKey, filters]);

  // ── Chat handler — checks conversational intent before searching ──────────────
  const handleChat = useCallback((query) => {
    if (!query.trim()) return;

    const lower = query.toLowerCase().trim();
    const p     = cfg.conversationalPatterns;

    // Clear chat: wipe everything and return to welcome screen — no history entry added
    if (p.clearChat && p.clearChat.test(lower)) {
      setChatHistory([]);
      setArticles([]);
      setErrorMsg('');
      setLastQuery('');
      return;
    }

    setChatHistory(h => [...h, { role: 'user', content: query }]);
    const respond = key => setChatHistory(h => [...h, { role: 'assistant', content: resolveResponse(key) }]);

    if (p.greeting.test(lower))  { respond('greeting');  return; }
    if (p.howAreYou.test(lower)) { respond('howAreYou'); return; }
    if (p.thanks.test(lower))    { respond('thanks');    return; }
    if (p.goodbye.test(lower))   { respond('goodbye');   return; }
    if (p.help.test(lower))      { respond('help');      return; }
    if (p.casual.test(lower))    { respond('fallback');  return; }

    if (!apiKey.trim()) { respond('noApiKey'); return; }

    handleSearch(query);
  }, [apiKey, handleSearch]);

  const handleSubmit = () => {
    const q = inputValue.trim();
    if (!q || loading) return;
    setInputValue('');
    handleChat(q);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {cfg.name.slice(0, -2)}<span>{cfg.name.slice(-2)}</span>
          </div>
          <div className="sidebar-tagline">{cfg.tagline}</div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Anthropic API Key</div>
          <input className="api-key-input" type="password" placeholder="sk-ant-…"
            value={apiKey} onChange={e => { setApiKey(e.target.value); setApiKeyValid(null); }} />
          {apiKeyValid === true  && <div className="api-key-status valid">✓ Connected</div>}
          {apiKeyValid === false && <div className="api-key-status invalid">✗ Invalid key</div>}
          <div className="api-key-hint">Required to process queries.</div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Quick Range</div>
          <div className="quick-ranges">
            {[['24h',1],['7d',7],['30d',30],['3m',90],['1y',365]].map(([label, days]) => (
              <button key={label}
                className={`range-btn ${pendingFilters.activeRange === label ? 'active' : ''}`}
                onClick={() => setQuickRange(days, label)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Custom Range</div>
          <div className="date-group">
            <div>
              <div className="date-label">From</div>
              <input type="date" className="date-input" value={pendingFilters.dateFrom}
                onChange={e => setPendingFilters(f => ({ ...f, dateFrom: e.target.value, activeRange: '' }))} />
            </div>
            <div>
              <div className="date-label">To</div>
              <input type="date" className="date-input" value={pendingFilters.dateTo}
                onChange={e => setPendingFilters(f => ({ ...f, dateTo: e.target.value, activeRange: '' }))} />
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Sort By</div>
          <select className="select-input" value={pendingFilters.sort}
            onChange={e => setPendingFilters(f => ({ ...f, sort: e.target.value }))}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="relevance">Relevance</option>
          </select>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Max Results</div>
          <select className="select-input" value={pendingFilters.maxResults}
            onChange={e => setPendingFilters(f => ({ ...f, maxResults: +e.target.value }))}>
            <option value={5}>5 articles</option>
            <option value={10}>10 articles</option>
            <option value={20}>20 articles</option>
          </select>
        </div>

        {/* ── Apply / Reset filter bar ── */}
        <div className="sidebar-section filter-actions">
          <button
            className={`apply-btn ${hasPendingChanges ? 'has-changes' : ''}`}
            onClick={applyFilters}
            disabled={!hasPendingChanges}
          >
            {hasPendingChanges ? '● Apply Filters' : 'Filters Applied'}
          </button>
          <button className="reset-btn" onClick={resetFilters} title="Reset all filters to defaults">
            Reset
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <div className="chat-area">
          <div className="chat-messages">

            {/* Welcome screen */}
            {chatHistory.length === 0 && !loading && (
              <div className="welcome">
                <div className="welcome-icon">{cfg.avatar}</div>
                <div className="welcome-title">{cfg.welcomeTitle}</div>
                <div className="welcome-sub">{cfg.welcomeSubtitle}</div>
                <div className="chips">
                  {cfg.suggestions.map(chip => (
                    <button key={chip} className="chip"
                      onClick={() => { setInputValue(chip); textareaRef.current?.focus(); }}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-avatar">{msg.role === 'user' ? 'U' : '🔍'}</div>
                <div className="message-content">
                  <MessageContent text={msg.content} />
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="message assistant">
                <div className="message-avatar">🔍</div>
                <div className="message-content">
                  <div className="dots">
                    <div className="dot"/><div className="dot"/><div className="dot"/>
                  </div>
                  &nbsp;Searching articles…
                </div>
              </div>
            )}

            {errorMsg && <div className="error-msg">{errorMsg}</div>}

            {/* Skeleton cards while loading */}
            {loading && (
              <div className="results-section">
                {[1,2,3].map(n => <SkeletonCard key={n} />)}
              </div>
            )}

            {/* Article results — inside scroll area so all cards are reachable */}
            {!loading && articles.length > 0 && (
              <div className="results-section">
                <div className="results-header">
                  <div className="results-title">Results</div>
                  <div className="results-count">
                    {articles.length} article{articles.length !== 1 ? 's' : ''} found
                  </div>
                </div>
                {articles.map((a, i) => <ArticleCard key={i} article={a} />)}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Export bar */}
        {articles.length > 0 && !loading && <ExportBar articles={articles} query={lastQuery} />}

        {/* Chat input */}
        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea ref={textareaRef} className="chat-textarea" rows={1}
              placeholder='Search news… or just say hi!'
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown} />
            <button className="send-btn" onClick={handleSubmit} disabled={loading || !inputValue.trim()}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16L10 4l6 12M7 11h6"/>
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

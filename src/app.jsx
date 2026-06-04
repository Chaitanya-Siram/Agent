const { useState, useEffect, useRef, useCallback } = React;

// ─── Render message text ───────────────────────────────────────────────────────

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

// ─── Sentiment tagger ─────────────────────────────────────────────────────────

async function tagArticlesSentiment(articles, apiKey, model) {
  const items = articles.map((a, i) =>
    `${i}. TITLE: ${a.title}\n   SOURCE: ${a.source}\n   SUMMARY: ${(a.description || '').slice(0, 200)}`
  ).join('\n\n');

  const system = `You are a news sentiment analyst. For each article, classify sentiment as positive, negative, neutral, or mixed.
Return ONLY valid JSON array, no markdown:
[{"index":0,"sentiment":"positive","confidence":0.92,"reason":"Brief 1-sentence reason"}]
Rules:
- confidence: 0.0–1.0
- reason: max 80 chars, factual
- sentiment: positive|negative|neutral|mixed`;

  const res = await fetch('/proxy/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: `Tag sentiment for these ${articles.length} articles:\n\n${items}` }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse sentiment response');
  return JSON.parse(match[0]);
}

// ─── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const cfg = window.AGENT_CONFIG;

  // ── API Key ──
  const [apiKey,      setApiKey]      = useState(() => localStorage.getItem('lensai_api_key') || '');
  const [apiKeyValid, setApiKeyValid] = useState(null);

  // ── Conversation tabs ──
  const [tabs,       setTabs]       = useState([{ id: 1, name: 'Chat 1' }]);
  const [activeTab,  setActiveTab]  = useState(1);
  const [nextTabId,  setNextTabId]  = useState(2);
  const [histories,  setHistories]  = useState({ 1: [] });
  const [workingMems, setWorkingMems] = useState({ 1: null });
  const [lastQueries, setLastQueries] = useState({ 1: '' });

  const chatHistory  = histories[activeTab]  || [];
  const workingMem   = workingMems[activeTab] || null;
  const lastQuery    = lastQueries[activeTab] || '';

  const setChatHistory = useCallback((updater) => {
    setHistories(h => ({ ...h, [activeTab]: typeof updater === 'function' ? updater(h[activeTab] || []) : updater }));
  }, [activeTab]);

  const setWorkingMem = useCallback((v) => {
    setWorkingMems(m => ({ ...m, [activeTab]: v }));
  }, [activeTab]);

  const setLastQuery = useCallback((v) => {
    setLastQueries(q => ({ ...q, [activeTab]: v }));
  }, [activeTab]);

  // ── Global loading state ──
  const [loading,       setLoading]       = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [inputValue,    setInputValue]    = useState('');
  const [errorMsg,      setErrorMsg]      = useState('');

  const chatEndRef  = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  // ── Tab management ──
  const newTab = () => {
    const id = nextTabId;
    setNextTabId(n => n + 1);
    setTabs(t => [...t, { id, name: 'New Chat' }]);
    setHistories(h => ({ ...h, [id]: [] }));
    setWorkingMems(m => ({ ...m, [id]: null }));
    setLastQueries(q => ({ ...q, [id]: '' }));
    setActiveTab(id);
    setInputValue('');
  };

  const closeTab = (id, e) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const remaining = tabs.filter(t => t.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining[remaining.length - 1].id);
  };

  const renameTab = (id, name) => {
    setTabs(t => t.map(tab => tab.id === id ? { ...tab, name } : tab));
  };

  // ── Working memory ──
  const refreshWorkingMem = useCallback(() => {
    if (window.CONTEXT_MEMORY) {
      const wm = window.CONTEXT_MEMORY.getWorkingMemory();
      setWorkingMem(wm.isEmpty() ? null : wm.toJSON());
    }
  }, [setWorkingMem]);

  // ── Core search pipeline ──
  const handleSearch = useCallback(async (query) => {
    setErrorMsg('');
    setLoading(true);
    setLoadingStatus('Analyzing your request…');
    setLastQuery(query);

    // Auto-name the tab from first query
    setTabs(t => t.map(tab => tab.id === activeTab && tab.name === 'New Chat'
      ? { ...tab, name: query.slice(0, 28) + (query.length > 28 ? '…' : '') }
      : tab
    ));

    try {
      const result = await window.ORCHESTRATOR.run(query, apiKey.trim(), {}, {
        onStatus: msg => setLoadingStatus(msg),
        onAgentEvent: evt => {
          if (evt.event === 'attempt')  setLoadingStatus(`${evt.agent} working… (pass ${evt.attempt})`);
          if (evt.event === 'heal')     setLoadingStatus(`${evt.agent} self-healing…`);
          if (evt.event === 'retry')    setLoadingStatus(`${evt.agent} retrying…`);
          if (evt.event === 'step' && evt.message) setLoadingStatus(evt.message);

          if (evt.event === 'contextResolved') {
            setChatHistory(h => [...h, {
              role: 'system-note',
              content: `🧠 Context resolved: _"${evt.original}"_ → _"${(evt.resolved || '').slice(0, 100)}"_`,
            }]);
          }
          if (evt.event === 'queryGenerated') {
            const { booleanQuery, dateFrom, dateTo } = evt;
            const dr = (dateFrom || dateTo) ? ` · ${dateFrom || '…'} → ${dateTo || 'now'}` : '';
            setChatHistory(h => [...h, { role: 'system-note', content: `🔍 Boolean query: \`${booleanQuery}\`${dr}` }]);
            setLoadingStatus(`Searching: ${booleanQuery}`);
          }
          if (evt.event === 'articlesFetched') setLoadingStatus(`Fetched ${evt.count} articles…`);
          if (evt.event === 'sentimentComplete') setLoadingStatus(`Sentiment mapped: ${evt.articlesAnalyzed} articles → ${evt.regionsFound} regions`);
        },
      });

      setApiKeyValid(true);

      if (result.type === 'articles') {
        // Push article result INTO chatHistory so it persists across queries
        setChatHistory(h => [...h,
          { role: 'assistant', content: result.message },
          { role: 'article-result', articles: result.articles, query, id: Date.now() },
        ]);
        if (window.CONTEXT_MEMORY) {
          window.CONTEXT_MEMORY.record('assistant', result.message, {
            artifact: 'articles',
            articleDataset: { count: result.articles.length, keywords: query, fetchedAt: Date.now() },
          });
          window.CONTEXT_MEMORY.summarize(apiKey.trim()).catch(() => {});
        }
      } else if (result.type === 'chart') {
        setChatHistory(h => [...h, { role: 'chart', html: result.html, query }]);
        if (window.CONTEXT_MEMORY) window.CONTEXT_MEMORY.record('assistant', result.message, { artifact: 'chart' });
      } else if (result.type === 'queryintel') {
        setChatHistory(h => [...h,
          { role: 'queryintel', result: result.result, query },
          { role: 'assistant', content: result.message },
        ]);
        if (window.CONTEXT_MEMORY) {
          const r = result.result;
          window.CONTEXT_MEMORY.record('assistant', result.message, {
            artifact: 'boolean_query', queryId: 'q_' + Date.now(),
            brands: r.entities?.brands || [], geography: r.entities?.locations || [],
            industry: r.industry, topics: r.entities?.topics || [],
            intents: r.intent, action: 'media_intel', booleanQuery: r.balanced_query,
          });
        }
      } else {
        setChatHistory(h => [...h, { role: 'assistant', content: result.message || 'Done.' }]);
      }

      refreshWorkingMem();
    } catch (err) {
      const msg = err.message || 'Something went wrong.';
      setErrorMsg(msg);
      setChatHistory(h => [...h, { role: 'assistant', content: `Error: ${msg}` }]);
      if (msg.includes('401') || msg.includes('API key')) setApiKeyValid(false);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  }, [apiKey, activeTab, setChatHistory, setLastQuery, refreshWorkingMem]);

  // ── Chat handler ──
  const handleChat = useCallback((query) => {
    if (!query.trim()) return;
    const lower = query.toLowerCase().trim();
    const p = cfg.conversationalPatterns;

    if (p.clearChat && p.clearChat.test(lower)) {
      setChatHistory([]);
      setErrorMsg('');
      if (window.CONTEXT_MEMORY) window.CONTEXT_MEMORY.clear();
      setWorkingMem(null);
      return;
    }

    if (window.CONTEXT_MEMORY) window.CONTEXT_MEMORY.record('user', query);
    setChatHistory(h => [...h, { role: 'user', content: query }]);
    const respond = key => setChatHistory(h => [...h, { role: 'assistant', content: resolveResponse(key) }]);

    if (p.greeting.test(lower))  { respond('greeting');  return; }
    if (p.howAreYou.test(lower)) { respond('howAreYou'); return; }
    if (p.thanks.test(lower))    { respond('thanks');    return; }
    if (p.goodbye.test(lower))   { respond('goodbye');   return; }
    if (p.help.test(lower))      { respond('help');      return; }
    if (p.casual.test(lower))    { respond('fallback');  return; }
    if (!apiKey.trim())          { respond('noApiKey');  return; }

    handleSearch(query);
  }, [apiKey, handleSearch, setChatHistory, setWorkingMem]);

  const handleSubmit = () => {
    const q = inputValue.trim();
    if (!q || loading) return;
    setInputValue('');
    handleChat(q);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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

        {/* API Key */}
        <div className="sidebar-section">
          <div className="section-label">Anthropic API Key</div>
          <input className="api-key-input" type="password" placeholder="sk-ant-…"
            value={apiKey} onChange={e => {
              const k = e.target.value;
              setApiKey(k); setApiKeyValid(null);
              if (k) localStorage.setItem('lensai_api_key', k);
              else   localStorage.removeItem('lensai_api_key');
            }} />
          {apiKeyValid === true  && <div className="api-key-status valid">✓ Connected</div>}
          {apiKeyValid === false && <div className="api-key-status invalid">✗ Invalid key</div>}
          <div className="api-key-hint">Required to process queries.</div>
        </div>

        {/* Working Memory */}
        {workingMem && (
          <div className="sidebar-section" style={{ background: 'rgba(55,138,221,0.04)' }}>
            <div className="section-label" style={{ color: 'var(--accent)' }}>🧠 Active Memory</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
              {workingMem.currentBrand && <div><span style={{ color:'var(--text-muted)' }}>Brand: </span><strong>{workingMem.currentBrand}</strong></div>}
              {workingMem.geography?.length > 0 && <div><span style={{ color:'var(--text-muted)' }}>Geo: </span>{workingMem.geography.join(', ')}</div>}
              {workingMem.timeRange && <div><span style={{ color:'var(--text-muted)' }}>Time: </span>{workingMem.timeRange}</div>}
              {workingMem.currentDataset && <div><span style={{ color:'var(--text-muted)' }}>Dataset: </span>{workingMem.currentDataset.count} articles</div>}
              {workingMem.generatedArtifacts?.length > 0 && <div><span style={{ color:'var(--text-muted)' }}>Generated: </span>{workingMem.generatedArtifacts.join(', ')}</div>}
              {workingMem.topics?.length > 0 && (
                <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {workingMem.topics.slice(0, 4).map(t => (
                    <span key={t} style={{ background:'var(--badge-bg)', padding:'1px 6px', borderRadius:8, fontSize:10 }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agent registry */}
        <div className="sidebar-section" style={{ marginTop: 'auto' }}>
          <div className="section-label">Agents</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            {(window.ORCHESTRATOR?.listAgents() || []).map(a => (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', display:'inline-block', flexShrink:0 }} />
                {a.name}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">

        {/* ── Tab bar ── */}
        <div className="tab-bar">
          <div className="tab-list">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.name}
              >
                <span className="tab-name">{tab.name}</span>
                {tabs.length > 1 && (
                  <span className="tab-close" onClick={e => closeTab(tab.id, e)}>×</span>
                )}
              </button>
            ))}
          </div>
          <button className="tab-new-btn" onClick={newTab} title="New conversation">＋</button>
        </div>

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
                <div className="chips" style={{ marginTop: 8 }}>
                  {[
                    'Show a bar chart of top tech companies',
                    'Line chart of AI funding trends 2023',
                    'Pie chart of smartphone market share',
                  ].map(chip => (
                    <button key={chip} className="chip" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      onClick={() => { setInputValue(chip); textareaRef.current?.focus(); }}>
                      📊 {chip}
                    </button>
                  ))}
                </div>
                <div className="chips" style={{ marginTop: 6 }}>
                  {[
                    'Track Tesla EV coverage across India for the last 72 hours. I want expansion, pricing, and Gigafactory angles.',
                    'Monitor T-Mobile and AT&T competitive activity in the US.',
                    'Track funding announcements from AI startups in Europe.',
                  ].map(chip => (
                    <button key={chip} className="chip"
                      style={{ borderColor: '#7F77DD', color: '#5A50B0', fontSize: 11 }}
                      onClick={() => { setInputValue(chip); textareaRef.current?.focus(); }}>
                      🧠 {chip.slice(0, 45)}…
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {chatHistory.map((msg, i) => {
              if (msg.role === 'chart') {
                return <ChartFrame key={i} html={msg.html} query={msg.query} apiKey={apiKey} />;
              }
              if (msg.role === 'article-result') {
                return (
                  <ArticleResultBlock
                    key={msg.id || i}
                    articles={msg.articles}
                    query={msg.query}
                    apiKey={apiKey}
                    model={cfg.model}
                  />
                );
              }
              if (msg.role === 'queryintel') {
                return (
                  <QueryIntelCard key={i} result={msg.result}
                    onSearchQuery={(selectedQuery) => {
                      setInputValue('');
                      setChatHistory(h => [...h, { role: 'user', content: `Search: ${selectedQuery.slice(0, 80)}…` }]);
                      handleSearch(selectedQuery);
                    }}
                  />
                );
              }
              if (msg.role === 'system-note') {
                return (
                  <div key={i} style={{
                    fontSize: 11, color: 'var(--text-muted)', background: 'var(--badge-bg)',
                    borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center',
                    gap: 6, alignSelf: 'flex-start', maxWidth: '90%',
                  }}>
                    <MessageContent text={msg.content} />
                  </div>
                );
              }
              return (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-avatar">{msg.role === 'user' ? 'U' : '🔍'}</div>
                  <div className="message-content"><MessageContent text={msg.content} /></div>
                </div>
              );
            })}

            {/* Loading */}
            {loading && (
              <div className="message assistant">
                <div className="message-avatar">🔍</div>
                <div className="message-content">
                  <div className="dots">
                    <div className="dot"/><div className="dot"/><div className="dot"/>
                  </div>
                  &nbsp;{loadingStatus || 'Working…'}
                  <AgentStatusBadge status={loadingStatus} />
                </div>
              </div>
            )}

            {errorMsg && <div className="error-msg">{errorMsg}</div>}

            {loading && (
              <div className="results-section">
                {[1,2,3].map(n => <SkeletonCard key={n} />)}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Chat input */}
        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea ref={textareaRef} className="chat-textarea" rows={1}
              placeholder={workingMem
                ? `Context active: ${workingMem.currentBrand || ''}${workingMem.geography?.length ? ' · ' + workingMem.geography[0] : ''}${workingMem.timeRange ? ' · ' + workingMem.timeRange : ''} — just say "show charts" or "more details"`
                : 'Track Tesla in India 72h · Monitor brand sentiment · Show AI funding chart…'
              }
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

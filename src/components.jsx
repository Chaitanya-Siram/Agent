// ─── ZoomControls — reusable zoom toolbar ──────────────────────────────────────

function ZoomControls({ zoom, onZoom, onReset, label }) {
  return (
    <div className="zoom-bar">
      {label && <span className="zoom-label">{label}</span>}
      <button className="zoom-btn" onClick={() => onZoom(Math.max(0.5, zoom - 0.25))} title="Zoom out">−</button>
      <span className="zoom-pct" onClick={onReset} title="Reset zoom">{Math.round(zoom * 100)}%</span>
      <button className="zoom-btn" onClick={() => onZoom(Math.min(3, zoom + 0.25))} title="Zoom in">+</button>
    </div>
  );
}

// ─── ZoomWrapper — wraps any content with zoom + scroll ──────────────────────

function ZoomWrapper({ children, zoom, maxHeight }) {
  return (
    <div style={{ overflow: 'auto', width: '100%', maxHeight: maxHeight || '70vh', borderRadius: 8 }}>
      <div style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`,
        minHeight: 100,
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── SkeletonCard ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <div className="skeleton-line" style={{ height:10, width:80 }} />
        <div className="skeleton-line" style={{ height:10, width:60 }} />
      </div>
      <div className="skeleton-line" style={{ height:16, width:'90%' }} />
      <div className="skeleton-line" style={{ height:12, width:'70%' }} />
      <div className="skeleton-line" style={{ height:12, width:'55%' }} />
      <div className="skeleton-line" style={{ height:9, width:200 }} />
    </div>
  );
}

// ─── ArticleCard (kept for compatibility) ──────────────────────────────────────

function ArticleCard({ article }) {
  const summary = generateSummary(article.description, article.title);
  return (
    <div className="article-card">
      <div className="card-meta">
        {article.link && (
          <img className="card-favicon" src={getFaviconUrl(article.link)} alt=""
            onError={e => (e.target.style.display = 'none')} />
        )}
        <span className="card-source">{article.source}</span>
        <span className="card-dot" />
        <span className="card-date">{formatDateIN(article.pubDateISO)}</span>
      </div>
      <div className="card-title">
        <a href={article.link} target="_blank" rel="noopener noreferrer">{article.title}</a>
      </div>
      {summary && <div className="card-summary">{summary}</div>}
      <div className="card-url">{article.link}</div>
    </div>
  );
}

// ─── ArticleTable ──────────────────────────────────────────────────────────────
// Displays all fetched articles in an enriched data table.

function ArticleTable({ articles, onTagSentiment, tagging }) {
  const [zoom, setZoom] = React.useState(1);
  return (
    <div className="at-wrapper">
      <div className="at-toolbar">
        <span className="at-count">{articles.length} articles</span>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <ZoomControls zoom={zoom} onZoom={setZoom} onReset={() => setZoom(1)} />
          <button
            className={`at-tag-btn ${tagging ? 'loading' : ''}`}
            onClick={onTagSentiment}
            disabled={tagging}
          >
            {tagging
              ? <><span className="btn-spinner" />Tagging sentiment…</>
              : '🏷 Tag Sentiment & Review'}
          </button>
        </div>
      </div>
      <div className="at-scroll" style={{ overflow: 'auto', maxHeight: '70vh' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100/zoom}%` }}>
        <table className="at-table">
          <thead>
            <tr>
              <th className="at-th at-th-num">#</th>
              <th className="at-th">Source</th>
              <th className="at-th at-th-title">Title</th>
              <th className="at-th">Date</th>
              <th className="at-th at-th-summary">Summary</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a, i) => {
              const summary = generateSummary(a.description, a.title);
              return (
                <tr key={i} className="at-tr">
                  <td className="at-td at-td-num">{i + 1}</td>
                  <td className="at-td at-td-source">
                    {a.link && (
                      <img className="at-favicon" src={getFaviconUrl(a.link)} alt=""
                        onError={e => (e.target.style.display = 'none')} />
                    )}
                    <span className="at-source-name">{a.source}</span>
                  </td>
                  <td className="at-td at-td-title">
                    <a href={a.link} target="_blank" rel="noopener noreferrer"
                      className="at-title-link">{a.title}</a>
                  </td>
                  <td className="at-td at-td-date">{formatDateIN(a.pubDateISO)}</td>
                  <td className="at-td at-td-summary">{summary || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── SentimentBadge ────────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }) {
  const map = {
    positive: { cls: 'sent-positive', label: '▲ Positive' },
    negative: { cls: 'sent-negative', label: '▼ Negative' },
    neutral:  { cls: 'sent-neutral',  label: '● Neutral'  },
    mixed:    { cls: 'sent-mixed',    label: '◆ Mixed'    },
  };
  const { cls, label } = map[(sentiment || '').toLowerCase()] || map.neutral;
  return <span className={`sent-badge ${cls}`}>{label}</span>;
}

// ─── SentimentReviewTable ──────────────────────────────────────────────────────
// Shows sentiment-tagged articles with Accept / Reject per row.

function SentimentReviewTable({ articles, onDecision, decisions, onGenerateReport }) {
  const [zoom, setZoom] = React.useState(1);
  const accepted = articles.filter((_, i) => decisions[i] === 'accept');
  const pending  = articles.filter((_, i) => !decisions[i]);

  return (
    <div className="srt-wrapper">
      <div className="srt-toolbar">
        <div className="srt-stats">
          <span className="srt-stat srt-stat-total">{articles.length} tagged</span>
          <span className="srt-stat srt-stat-accept">{accepted.length} accepted</span>
          <span className="srt-stat srt-stat-pending">{pending.length} pending</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <ZoomControls zoom={zoom} onZoom={setZoom} onReset={() => setZoom(1)} />
          <button className="srt-accept-all"
            onClick={() => articles.forEach((_, i) => onDecision(i, 'accept'))}>
            ✓ Accept All
          </button>
          {accepted.length > 0 && (
            <button className="srt-report-btn" onClick={onGenerateReport}>
              📋 Generate Report ({accepted.length})
            </button>
          )}
        </div>
      </div>

      <div className="srt-scroll" style={{ overflow: 'auto', maxHeight: '70vh' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100/zoom}%` }}>
        <table className="srt-table">
          <thead>
            <tr>
              <th className="srt-th srt-th-num">#</th>
              <th className="srt-th">Source</th>
              <th className="srt-th srt-th-title">Title</th>
              <th className="srt-th">Date</th>
              <th className="srt-th">Sentiment</th>
              <th className="srt-th srt-th-conf">Confidence</th>
              <th className="srt-th srt-th-reason">Reason</th>
              <th className="srt-th srt-th-actions">Decision</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a, i) => {
              const dec = decisions[i];
              const rowCls = dec === 'accept' ? 'srt-tr srt-tr-accepted'
                           : dec === 'reject' ? 'srt-tr srt-tr-rejected'
                           : 'srt-tr';
              const conf = a.sentimentConfidence != null
                ? Math.round(a.sentimentConfidence * 100)
                : null;
              return (
                <tr key={i} className={rowCls}>
                  <td className="srt-td srt-td-num">{i + 1}</td>
                  <td className="srt-td srt-td-source">
                    {a.link && (
                      <img className="at-favicon" src={getFaviconUrl(a.link)} alt=""
                        onError={e => (e.target.style.display = 'none')} />
                    )}
                    <span className="at-source-name">{a.source}</span>
                  </td>
                  <td className="srt-td srt-td-title">
                    <a href={a.link} target="_blank" rel="noopener noreferrer"
                      className="at-title-link">{a.title}</a>
                  </td>
                  <td className="srt-td srt-td-date">{formatDateIN(a.pubDateISO)}</td>
                  <td className="srt-td srt-td-sent">
                    <SentimentBadge sentiment={a.sentiment} />
                  </td>
                  <td className="srt-td srt-td-conf">
                    {conf != null ? (
                      <div className="conf-bar-wrap">
                        <div className="conf-bar">
                          <div className="conf-fill"
                            style={{ width: conf + '%',
                              background: conf >= 80 ? 'var(--accent)' : conf >= 60 ? '#BA7517' : '#C0392B' }} />
                        </div>
                        <span className="conf-pct">{conf}%</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="srt-td srt-td-reason">
                    <span className="srt-reason" title={a.sentimentReason}>{a.sentimentReason || '—'}</span>
                  </td>
                  <td className="srt-td srt-td-actions">
                    {dec === 'accept' ? (
                      <div className="dec-row">
                        <span className="dec-badge dec-accepted">✓ Accepted</span>
                        <button className="dec-undo" onClick={() => onDecision(i, null)}>↩</button>
                      </div>
                    ) : dec === 'reject' ? (
                      <div className="dec-row">
                        <span className="dec-badge dec-rejected">✗ Rejected</span>
                        <button className="dec-undo" onClick={() => onDecision(i, null)}>↩</button>
                      </div>
                    ) : (
                      <div className="dec-row">
                        <button className="dec-accept" onClick={() => onDecision(i, 'accept')}>✓ Accept</button>
                        <button className="dec-reject" onClick={() => onDecision(i, 'reject')}>✗ Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── ArticleResultBlock — self-contained article result with tagging ───────────
// Lives in chatHistory so previous results persist when new queries run.

function ArticleResultBlock({ articles, query, apiKey, model }) {
  const [tagged,     setTagged]     = React.useState(null);
  const [tagging,    setTagging]    = React.useState(false);
  const [decisions,  setDecisions]  = React.useState({});
  const [reportOpen, setReportOpen] = React.useState(false);

  const handleTagSentiment = async () => {
    if (tagging) return;
    setTagging(true);
    try {
      const tags = await (async () => {
        const items = articles.map((a, i) =>
          `${i}. TITLE: ${a.title}\n   SOURCE: ${a.source}\n   SUMMARY: ${(a.description || '').slice(0, 200)}`
        ).join('\n\n');
        const system = `You are a news sentiment analyst. For each article, return ONLY valid JSON array, no markdown:
[{"index":0,"sentiment":"positive","confidence":0.92,"reason":"Brief 1-sentence reason"}]
Rules: sentiment=positive|negative|neutral|mixed, confidence=0.0-1.0, reason=max 80 chars`;
        const res = await fetch('/proxy/anthropic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: model || 'claude-haiku-4-5-20251001',
            max_tokens: 4000, system,
            messages: [{ role: 'user', content: `Tag ${articles.length} articles:\n\n${items}` }],
          }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        const match = text.match(/\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : [];
      })();
      setTagged(articles.map((a, i) => {
        const t = tags.find(x => x.index === i) || {};
        return { ...a, sentiment: t.sentiment || 'neutral', sentimentConfidence: t.confidence || 0.5, sentimentReason: t.reason || '' };
      }));
      setDecisions({});
    } catch (err) {
      alert('Sentiment tagging failed: ' + err.message);
    } finally {
      setTagging(false);
    }
  };

  const handleDecision = (index, value) => setDecisions(d => ({ ...d, [index]: value }));
  const acceptedArticles = tagged ? tagged.filter((_, i) => decisions[i] === 'accept') : [];

  return (
    <div className="article-result-block">
      <div className="results-header">
        <div className="results-title">Results</div>
        <div className="results-count">{articles.length} article{articles.length !== 1 ? 's' : ''} found</div>
      </div>

      {!tagged ? (
        <ArticleTable articles={articles} onTagSentiment={handleTagSentiment} tagging={tagging} />
      ) : (
        <SentimentReviewTable
          articles={tagged}
          decisions={decisions}
          onDecision={handleDecision}
          onGenerateReport={() => setReportOpen(true)}
        />
      )}

      <ExportBar articles={tagged || articles} query={query} />

      {reportOpen && acceptedArticles.length > 0 && (
        <ReportEmailModal articles={acceptedArticles} query={query} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

// ─── ReportEmailModal ──────────────────────────────────────────────────────────
// Multi-email report sender shown after user accepts articles.

function ReportEmailModal({ articles, query, onClose }) {
  const [emails,  setEmails]  = React.useState(['']);
  const [subject, setSubject] = React.useState(`LensAI Report: ${query}`);
  const [note,    setNote]    = React.useState('');

  const addEmail    = () => setEmails(e => [...e, '']);
  const removeEmail = i  => setEmails(e => e.filter((_, j) => j !== i));
  const updateEmail = (i, v) => setEmails(e => { const n = [...e]; n[i] = v; return n; });

  const buildReportHTML = () => {
    const rows = articles.map((a, i) => `
      <tr style="border-bottom:1px solid #E8E8E3">
        <td style="padding:8px 10px;color:#5A5A54;font-size:12px">${i + 1}</td>
        <td style="padding:8px 10px;font-size:12px">${a.source}</td>
        <td style="padding:8px 10px;font-size:13px"><a href="${a.link}" style="color:#2C6E49">${a.title}</a></td>
        <td style="padding:8px 10px;font-size:11px;color:#5A5A54">${formatDateIN(a.pubDateISO)}</td>
        <td style="padding:8px 10px">
          <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;
            background:${a.sentiment==='positive'?'#E8F5EF':a.sentiment==='negative'?'#FDEDEC':'#F0EEE8'};
            color:${a.sentiment==='positive'?'#1D7A5A':a.sentiment==='negative'?'#C0392B':'#5A5A54'}">
            ${(a.sentiment||'neutral').charAt(0).toUpperCase()+(a.sentiment||'neutral').slice(1)}
          </span>
        </td>
        <td style="padding:8px 10px;font-size:12px">${Math.round((a.sentimentConfidence||0)*100)}%</td>
        <td style="padding:8px 10px;font-size:11px;color:#5A5A54;max-width:200px">${a.sentimentReason||''}</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${subject}</title></head>
<body style="font-family:-apple-system,sans-serif;margin:0;padding:24px;background:#FAFAF8;color:#1A1A18">
<div style="max-width:900px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
<div style="background:linear-gradient(135deg,#1A2E45,#2C6E49);padding:28px 32px;color:#fff">
  <div style="font-size:22px;font-weight:700;margin-bottom:4px">📰 ${subject}</div>
  <div style="font-size:13px;opacity:0.8">Generated by LensAI · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>
  ${note ? `<div style="margin-top:12px;font-size:13px;background:rgba(255,255,255,0.1);padding:10px 14px;border-radius:8px">${note}</div>` : ''}
</div>
<div style="padding:24px 32px">
<div style="display:flex;gap:16px;margin-bottom:20px">
  <div style="background:#EAF3ED;border-radius:8px;padding:12px 18px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:#2C6E49">${articles.length}</div>
    <div style="font-size:11px;color:#5A5A54">Accepted Articles</div>
  </div>
  <div style="background:#E8F0FA;border-radius:8px;padding:12px 18px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:#1A65B0">${articles.filter(a=>a.sentiment==='positive').length}</div>
    <div style="font-size:11px;color:#5A5A54">Positive</div>
  </div>
  <div style="background:#FDEDEC;border-radius:8px;padding:12px 18px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:#C0392B">${articles.filter(a=>a.sentiment==='negative').length}</div>
    <div style="font-size:11px;color:#5A5A54">Negative</div>
  </div>
</div>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="background:#F5F5F2">
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">#</th>
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">SOURCE</th>
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">TITLE</th>
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">DATE</th>
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">SENTIMENT</th>
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">CONF.</th>
  <th style="padding:10px;text-align:left;font-size:11px;color:#9A9A90;font-weight:600">REASON</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
</div></body></html>`;
  };

  const openPreview = () => {
    const w = window.open('', '_blank');
    w.document.write(buildReportHTML());
    w.document.close();
  };

  const sendEmail = () => {
    const validEmails = emails.filter(e => e.trim());
    if (!validEmails.length) return;
    const body = (note ? note + '\n\n' : '')
      + `LensAI Report: ${query}\nGenerated: ${new Date().toLocaleDateString()}\n`
      + `Total accepted articles: ${articles.length}\n\n`
      + articles.map((a, i) =>
          `${i+1}. [${(a.sentiment||'neutral').toUpperCase()} ${Math.round((a.sentimentConfidence||0)*100)}%] ${a.title}\n   ${a.source} · ${formatDateIN(a.pubDateISO)}\n   ${a.link}\n   Reason: ${a.sentimentReason||''}`
        ).join('\n\n');
    window.open(
      `mailto:${validEmails.map(e => encodeURIComponent(e.trim())).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    );
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-title">📋 Send Report</div>
        <div className="modal-subtitle">{articles.length} accepted articles · {query}</div>

        <div className="modal-field">
          <label className="modal-label">Recipients</label>
          {emails.map((em, i) => (
            <div key={i} className="email-row">
              <input className="modal-input" type="email" placeholder={`email${i+1}@company.com`}
                value={em} onChange={e => updateEmail(i, e.target.value)} />
              {emails.length > 1 && (
                <button className="email-remove" onClick={() => removeEmail(i)}>×</button>
              )}
            </div>
          ))}
          <button className="add-email-btn" onClick={addEmail}>+ Add recipient</button>
        </div>

        <div className="modal-field">
          <label className="modal-label">Subject</label>
          <input className="modal-input" type="text"
            value={subject} onChange={e => setSubject(e.target.value)} />
        </div>

        <div className="modal-field">
          <label className="modal-label">Cover Note (optional)</label>
          <textarea className="modal-input modal-textarea" placeholder="Add context for the recipients…"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>

        <div className="report-summary-row">
          <span className="rsum-item rsum-green">✓ {articles.filter(a=>a.sentiment==='positive').length} Positive</span>
          <span className="rsum-item rsum-red">✗ {articles.filter(a=>a.sentiment==='negative').length} Negative</span>
          <span className="rsum-item rsum-grey">● {articles.filter(a=>!a.sentiment||a.sentiment==='neutral').length} Neutral</span>
          <span className="rsum-item rsum-blue">Total: {articles.length}</span>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-secondary" onClick={openPreview}>👁 Preview Report</button>
          <button className="modal-btn-primary" onClick={sendEmail}
            disabled={!emails.some(e => e.trim())}>
            ✉ Open in Mail
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EmailModal ────────────────────────────────────────────────────────────────

function EmailModal({ articles, query, onClose }) {
  const [to, setTo]           = React.useState('');
  const [subject, setSubject] = React.useState(`Article Report: ${query}`);
  const [note, setNote]       = React.useState('');

  const handleSend = () => {
    const body =
      (note ? note + '\n\n' : '') +
      `Query: ${query}\nTotal: ${articles.length}\n\n` +
      articles.map((a, i) =>
        `${i + 1}. ${a.title}\n   Source: ${a.source}\n   Date: ${formatDateIN(a.pubDateISO)}\n   Link: ${a.link}`
      ).join('\n\n');
    window.open(
      `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    );
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Share via Email</div>
        <div className="modal-field">
          <label className="modal-label">Recipient</label>
          <input className="modal-input" type="email" placeholder="recipient@example.com"
            value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label">Subject</label>
          <input className="modal-input" type="text"
            value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label">Optional Note</label>
          <textarea className="modal-input modal-textarea" placeholder="Add a personal note…"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>
          All {articles.length} article links will be included in the email body.
        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSend}>Open in Mail</button>
        </div>
      </div>
    </div>
  );
}

// ─── ExportBar ─────────────────────────────────────────────────────────────────

function ExportBar({ articles, query }) {
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [toast, setToast]         = React.useState('');

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const exportCSV = () => {
    downloadBlob(articlesToCSV(articles), `articles-${Date.now()}.csv`, 'text/csv');
    showToast('CSV downloaded');
  };
  const exportJSON = () => {
    const payload = {
      query, exportedAt: new Date().toISOString(), totalCount: articles.length,
      articles: articles.map(a => ({
        title: a.title, source: a.source, pubDate: a.pubDateISO,
        summary: a.description, link: a.link,
        sentiment: a.sentiment, sentimentConfidence: a.sentimentConfidence,
        sentimentReason: a.sentimentReason,
      })),
    };
    downloadBlob(JSON.stringify(payload, null, 2), `articles-${Date.now()}.json`, 'application/json');
    showToast('JSON downloaded');
  };
  const exportHTML = () => {
    const w = window.open('', '_blank');
    w.document.write(generateHTMLReport(articles, query));
    w.document.close();
  };
  const copyLinks = () => {
    navigator.clipboard
      .writeText(articles.map(a => `${a.title}\n${a.link}`).join('\n\n'))
      .then(() => showToast('Links copied to clipboard'));
  };

  const Btn = ({ onClick, icon, label }) => (
    <button className="export-btn" onClick={onClick}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        dangerouslySetInnerHTML={{ __html: icon }} />
      {label}
    </button>
  );

  return (
    <>
      <div className="export-bar">
        <span className="export-label">Export</span>
        <Btn onClick={exportCSV}                label="CSV"         icon="<path d='M2 3h12M2 8h8M2 13h5M11 10l3 3-3 3M14 13H9'/>" />
        <Btn onClick={exportJSON}               label="JSON"        icon="<path d='M4 3c-1 0-2 .5-2 2s1 2 2 2c1 0 2 .5 2 2s-1 2-2 2'/><path d='M8 3v10M12 3c1 0 2 .5 2 2s-1 2-2 2c-1 0-2 .5-2 2s1 2 2 2'/>" />
        <Btn onClick={exportHTML}               label="HTML Report" icon="<path d='M4 5L1 8l3 3M12 5l3 3-3 3M9 3l-2 10'/>" />
        <Btn onClick={() => setEmailOpen(true)} label="Email"       icon="<rect x='1' y='3' width='14' height='10' rx='1.5'/><path d='M1 5l7 5 7-5'/>" />
        <Btn onClick={copyLinks}                label="Copy Links"  icon="<rect x='5' y='5' width='9' height='9' rx='1.5'/><path d='M5 11H3a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 013 1h7A1.5 1.5 0 0111.5 3v2'/>" />
      </div>
      {emailOpen && <EmailModal articles={articles} query={query} onClose={() => setEmailOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ─── ChartFrame ────────────────────────────────────────────────────────────────

const IFRAME_CSS_VARS = `
  :root {
    --color-text-primary:   #1A1A18;
    --color-text-secondary: #5A5A54;
    --color-text-tertiary:  #9A9A90;
    --color-text-info:      #1A65B0;
    --color-text-success:   #1D7A5A;
    --color-text-warning:   #9A5700;
    --color-text-danger:    #A02020;
    --color-background-primary:   #FFFFFF;
    --color-background-secondary: #F5F5F2;
    --color-background-tertiary:  #FAFAF8;
    --color-background-info:      #E8F0FA;
    --color-background-success:   #E8F5EF;
    --color-background-warning:   #FDF4E8;
    --color-background-danger:    #FDF0F0;
    --color-border-primary:   #B0B0A8;
    --color-border-secondary: #D0D0C8;
    --color-border-tertiary:  #E8E8E3;
    --border-radius-md: 6px;
    --border-radius-lg: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --color-text-primary:         #F0F0EE;
      --color-text-secondary:       #B0B0A8;
      --color-text-tertiary:        #707068;
      --color-background-primary:   #1E1E1C;
      --color-background-secondary: #2A2A28;
      --color-background-tertiary:  #161614;
      --color-border-tertiary:      #3A3A38;
      --color-border-secondary:     #4A4A48;
    }
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    margin: 0; padding: 14px;
    background: var(--color-background-tertiary);
    color: var(--color-text-primary);
    font-size: 14px; line-height: 1.5;
  }
`;

function ChartFrame({ html, query, apiKey }) {
  const iframeRef  = React.useRef(null);
  const wrapperRef = React.useRef(null);
  const [iframeHeight, setIframeHeight] = React.useState(480);
  const [zoom,         setZoom]         = React.useState(1);
  const [emailOpen,    setEmailOpen]    = React.useState(false);

  const onIframeLoad = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    setTimeout(() => {
      const h = Math.max(480, doc.documentElement.scrollHeight + 20);
      setIframeHeight(h);
    }, 600);
  }, []);

  const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${IFRAME_CSS_VARS}</style>
</head>
<body>${html}</body>
</html>`;

  const openInTab = () => {
    const w = window.open('', '_blank');
    w.document.write(srcdoc);
    w.document.close();
  };

  const sendChartEmail = () => setEmailOpen(true);

  return (
    <div className="chart-message">
      <div className="chart-message-header">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📊 {query}</span>
        <div className="chart-header-actions">
          <ZoomControls zoom={zoom} onZoom={setZoom} onReset={() => setZoom(1)} />
          <button className="frame-action-btn" onClick={openInTab} title="Open in new tab">⤢ Open</button>
          <button className="frame-action-btn" onClick={sendChartEmail} title="Send chart via email">✉ Email</button>
        </div>
      </div>
      {/* Scrollable zoom viewport */}
      <div ref={wrapperRef} style={{ overflow: 'auto', width: '100%', maxHeight: '70vh', background: 'transparent' }}>
        <div style={{
          width:  `${zoom * 100}%`,
          height: iframeHeight * zoom,
          position: 'relative',
          flexShrink: 0,
        }}>
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts allow-same-origin"
            title={`Chart: ${query}`}
            onLoad={onIframeLoad}
            style={{
              width: '100%',
              height: iframeHeight,
              border: 'none',
              display: 'block',
              background: 'transparent',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              position: 'absolute',
              top: 0, left: 0,
            }}
          />
        </div>
      </div>
      {emailOpen && (
        <ChartEmailModal query={query} srcdoc={srcdoc} onClose={() => setEmailOpen(false)} />
      )}
    </div>
  );
}

// ─── ChartEmailModal ───────────────────────────────────────────────────────────

function ChartEmailModal({ query, srcdoc, onClose }) {
  const [emails,  setEmails]  = React.useState(['']);
  const [subject, setSubject] = React.useState(`LensAI Chart: ${query}`);
  const [note,    setNote]    = React.useState('');

  const addEmail    = () => setEmails(e => [...e, '']);
  const removeEmail = i  => setEmails(e => e.filter((_, j) => j !== i));
  const updateEmail = (i, v) => setEmails(e => { const n = [...e]; n[i] = v; return n; });

  const openPreview = () => {
    const w = window.open('', '_blank');
    w.document.write(srcdoc);
    w.document.close();
  };

  const handleSend = () => {
    const valid = emails.filter(e => e.trim());
    if (!valid.length) return;
    const body = (note ? note + '\n\n' : '')
      + `LensAI Chart: ${query}\nGenerated: ${new Date().toLocaleDateString()}\n\n`
      + `Open the attached chart or view it in your browser.`;
    window.open(
      `mailto:${valid.map(e => encodeURIComponent(e.trim())).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    );
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">✉ Share Chart</div>
        <div className="modal-field">
          <label className="modal-label">Recipients</label>
          {emails.map((em, i) => (
            <div key={i} className="email-row">
              <input className="modal-input" type="email" placeholder="recipient@example.com"
                value={em} onChange={e => updateEmail(i, e.target.value)} />
              {emails.length > 1 && (
                <button className="email-remove" onClick={() => removeEmail(i)}>×</button>
              )}
            </div>
          ))}
          <button className="add-email-btn" onClick={addEmail}>+ Add recipient</button>
        </div>
        <div className="modal-field">
          <label className="modal-label">Subject</label>
          <input className="modal-input" type="text"
            value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label">Note (optional)</label>
          <textarea className="modal-input modal-textarea" placeholder="Add context…"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-secondary" onClick={openPreview}>👁 Preview</button>
          <button className="modal-btn-primary" onClick={handleSend}
            disabled={!emails.some(e => e.trim())}>Open in Mail</button>
        </div>
      </div>
    </div>
  );
}

// ─── AgentStatusBadge ──────────────────────────────────────────────────────────

function AgentStatusBadge({ status }) {
  if (!status) return null;
  const icons = {
    'VisualizationAgent': '🎨',
    'CodeAgent':          '🔧',
    'ToolsAgent':         '🔍',
    'orchestrator':       '🧠',
  };
  const icon = Object.entries(icons).find(([k]) => status.includes(k))?.[1] || '⚙️';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, color: 'var(--text-secondary)',
      background: 'var(--badge-bg)', padding: '2px 8px',
      borderRadius: 10, marginLeft: 8,
    }}>
      {icon} {status}
    </span>
  );
}

// ─── QueryIntelCard ────────────────────────────────────────────────────────────

const INTENT_COLORS = {
  'Brand Monitoring':       '#378ADD',
  'Reputation Monitoring':  '#7F77DD',
  'Crisis Monitoring':      '#E24B4A',
  'Competitive Intelligence':'#D85A30',
  'Product Monitoring':     '#1D9E75',
  'Executive Monitoring':   '#BA7517',
  'Industry Trends':        '#639922',
  'Funding Activity':       '#D4537E',
  'Mergers & Acquisitions': '#BA7517',
  'Market Expansion':       '#1D9E75',
  'Pricing Analysis':       '#D85A30',
  'Regulatory Monitoring':  '#E24B4A',
  'ESG Monitoring':         '#639922',
};

function highlightBoolean(query) {
  if (!query) return '';
  return query
    .replace(/\bAND\b/g,  '<span style="color:#378ADD;font-weight:600"> AND </span>')
    .replace(/\bOR\b/g,   '<span style="color:#BA7517;font-weight:600"> OR </span>')
    .replace(/\bNOT\b/g,  '<span style="color:#E24B4A;font-weight:600"> NOT </span>')
    .replace(/"([^"]+)"/g, '<span style="color:#1D9E75">"$1"</span>');
}

function QueryIntelCard({ result, onSearchQuery }) {
  const [activeTab,  setActiveTab]  = React.useState('balanced');
  const [copiedTab,  setCopiedTab]  = React.useState('');
  const [showExpand, setShowExpand] = React.useState(false);

  if (!result) return null;

  const tabs = [
    { key: 'high_recall_query',           label: 'High Recall',   desc: 'Maximum coverage' },
    { key: 'balanced_query',              label: 'Balanced',      desc: 'Recommended ✓'    },
    { key: 'high_precision_query',        label: 'High Precision',desc: 'Low noise'         },
    { key: 'negative_monitoring_query',   label: 'Negative',      desc: 'Crisis / Risk'     },
    { key: 'competitor_monitoring_query', label: 'Competitor',    desc: 'Rival tracking'    },
  ].filter(t => result[t.key] && result[t.key].trim().length > 3);

  const activeQuery = result[tabs.find(t => t.key === activeTab)?.key || 'balanced_query'] || '';

  const copyQuery = (key) => {
    const q = result[key] || '';
    navigator.clipboard.writeText(q).then(() => {
      setCopiedTab(key);
      setTimeout(() => setCopiedTab(''), 2000);
    });
  };

  const topIntents = Object.entries(result.confidence_scores || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 6);

  const precision = Math.round((result.estimated_precision_score || 0) * 100);
  const recall    = Math.round((result.estimated_recall_score    || 0) * 100);

  return (
    <div className="qi-card">
      <div className="qi-header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>🧠</span>
          <div>
            <div style={{ fontWeight:600, fontSize:14 }}>Media Intelligence Query Generator</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:1 }}>
              {result.industry || ''} · Precision {precision}% · Recall {recall}%
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <span className="qi-score-badge" style={{ background:'rgba(29,158,117,0.12)', color:'#1D7A5A' }}>
            P {precision}%
          </span>
          <span className="qi-score-badge" style={{ background:'rgba(55,138,221,0.12)', color:'#1A65B0' }}>
            R {recall}%
          </span>
        </div>
      </div>

      <div className="qi-section">
        <div className="qi-section-label">Detected Intents</div>
        <div className="qi-intents">
          {topIntents.map(([intent, score]) => {
            const color = INTENT_COLORS[intent] || '#888780';
            const pct   = Math.round(score * 100);
            return (
              <div key={intent} className="qi-intent-row">
                <div className="qi-intent-name">
                  <span className="qi-dot" style={{ background: color }} />
                  {intent}
                </div>
                <div className="qi-conf-bar">
                  <div className="qi-conf-fill" style={{ width: pct + '%', background: color }} />
                </div>
                <span className="qi-conf-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="qi-section">
        <div className="qi-section-label">Extracted Entities</div>
        <div className="qi-entity-grid">
          {result.entities?.brands?.length > 0 && (
            <div className="qi-entity-group">
              <span className="qi-entity-type">Brands</span>
              {result.entities.brands.map(b => (
                <span key={b} className="qi-chip qi-chip-brand">{b}</span>
              ))}
            </div>
          )}
          {result.entities?.products?.length > 0 && (
            <div className="qi-entity-group">
              <span className="qi-entity-type">Products</span>
              {result.entities.products.map(p => (
                <span key={p} className="qi-chip qi-chip-product">{p}</span>
              ))}
            </div>
          )}
          {result.entities?.competitors?.length > 0 && (
            <div className="qi-entity-group">
              <span className="qi-entity-type">Competitors</span>
              {result.entities.competitors.map(c => (
                <span key={c} className="qi-chip qi-chip-comp">{c}</span>
              ))}
            </div>
          )}
          {result.entities?.locations?.length > 0 && (
            <div className="qi-entity-group">
              <span className="qi-entity-type">Locations</span>
              {result.entities.locations.map(l => (
                <span key={l} className="qi-chip qi-chip-loc">{l}</span>
              ))}
            </div>
          )}
          {result.entities?.topics?.length > 0 && (
            <div className="qi-entity-group">
              <span className="qi-entity-type">Topics</span>
              {result.entities.topics.map(t => (
                <span key={t} className="qi-chip qi-chip-topic">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="qi-section">
        <div className="qi-section-label">Generated Queries</div>
        <div className="qi-tabs">
          {tabs.map(t => (
            <button key={t.key}
              className={`qi-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
              <span className="qi-tab-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="qi-query-box">
          <div className="qi-query-text"
            dangerouslySetInnerHTML={{ __html: highlightBoolean(result[activeTab] || '') }} />
          <div className="qi-query-actions">
            <button className="qi-action-btn" onClick={() => copyQuery(activeTab)}>
              {copiedTab === activeTab ? '✓ Copied' : '⎘ Copy'}
            </button>
            {onSearchQuery && (
              <button className="qi-action-btn qi-action-primary"
                onClick={() => onSearchQuery(result[activeTab], result)}>
                🔍 Search Articles
              </button>
            )}
          </div>
        </div>
      </div>

      {result.entity_expansions && Object.keys(result.entity_expansions).length > 0 && (
        <div className="qi-section">
          <button className="qi-toggle" onClick={() => setShowExpand(v => !v)}>
            {showExpand ? '▾' : '▸'} Entity Expansions ({Object.keys(result.entity_expansions).length})
          </button>
          {showExpand && (
            <div className="qi-expansion-list">
              {Object.entries(result.entity_expansions).map(([entity, expansion]) => (
                <div key={entity} className="qi-expansion-row">
                  <span className="qi-exp-entity">{entity}</span>
                  <span className="qi-exp-arrow">→</span>
                  <code className="qi-exp-value">{expansion}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result.query_explanation && (
        <div className="qi-section">
          <div className="qi-section-label">Explanation</div>
          <div className="qi-explanation">{result.query_explanation}</div>
        </div>
      )}
      {result.monitoring_tips?.length > 0 && (
        <div className="qi-section qi-tips">
          <div className="qi-section-label">Monitoring Tips</div>
          {result.monitoring_tips.map((tip, i) => (
            <div key={i} className="qi-tip">💡 {tip}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Expose to global scope
window.ZoomControls          = ZoomControls;
window.ZoomWrapper           = ZoomWrapper;
window.SkeletonCard          = SkeletonCard;
window.ArticleCard           = ArticleCard;
window.ArticleTable          = ArticleTable;
window.ArticleResultBlock    = ArticleResultBlock;
window.SentimentReviewTable  = SentimentReviewTable;
window.SentimentBadge        = SentimentBadge;
window.ReportEmailModal      = ReportEmailModal;
window.EmailModal            = EmailModal;
window.ChartEmailModal       = ChartEmailModal;
window.ExportBar             = ExportBar;
window.ChartFrame            = ChartFrame;
window.AgentStatusBadge      = AgentStatusBadge;
window.QueryIntelCard        = QueryIntelCard;

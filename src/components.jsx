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

// ─── ArticleCard ───────────────────────────────────────────────────────────────

function ArticleCard({ article }) {
  const summary = generateSummary(article.description, article.title);
  return (
    <div className="article-card">
      <div className="card-meta">
        {article.link && (
          <img
            className="card-favicon"
            src={getFaviconUrl(article.link)}
            alt=""
            onError={e => (e.target.style.display = 'none')}
          />
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
        title: a.title, source: a.source, pubDate: a.pubDateISO, summary: a.description, link: a.link,
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
        <Btn onClick={exportCSV}           label="CSV"         icon="<path d='M2 3h12M2 8h8M2 13h5M11 10l3 3-3 3M14 13H9'/>" />
        <Btn onClick={exportJSON}          label="JSON"        icon="<path d='M4 3c-1 0-2 .5-2 2s1 2 2 2c1 0 2 .5 2 2s-1 2-2 2'/><path d='M8 3v10M12 3c1 0 2 .5 2 2s-1 2-2 2c-1 0-2 .5-2 2s1 2 2 2'/>" />
        <Btn onClick={exportHTML}          label="HTML Report" icon="<path d='M4 5L1 8l3 3M12 5l3 3-3 3M9 3l-2 10'/>" />
        <Btn onClick={() => setEmailOpen(true)} label="Email"  icon="<rect x='1' y='3' width='14' height='10' rx='1.5'/><path d='M1 5l7 5 7-5'/>" />
        <Btn onClick={copyLinks}           label="Copy Links"  icon="<rect x='5' y='5' width='9' height='9' rx='1.5'/><path d='M5 11H3a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 013 1h7A1.5 1.5 0 0111.5 3v2'/>" />
      </div>
      {emailOpen && <EmailModal articles={articles} query={query} onClose={() => setEmailOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// Expose to global scope so app.jsx can reference them
window.SkeletonCard = SkeletonCard;
window.ArticleCard  = ArticleCard;
window.EmailModal   = EmailModal;
window.ExportBar    = ExportBar;

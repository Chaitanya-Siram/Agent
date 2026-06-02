// ─── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

function applyQuickRange(days) {
  const now = new Date();
  return { dateFrom: toISO(new Date(now - days * 86400000)), dateTo: toISO(now) };
}

function formatDateIN(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── URL helpers ───────────────────────────────────────────────────────────────

function getFaviconUrl(link) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(link).hostname}&sz=32`; }
  catch { return ''; }
}

function extractDomain(link) {
  try { return new URL(link).hostname.replace('www.', ''); } catch { return link; }
}

// ─── RSS parser ────────────────────────────────────────────────────────────────

function parseRSS(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  return Array.from(doc.querySelectorAll('item')).map(item => {
    const get = tag => item.querySelector(tag)?.textContent?.trim() || '';
    const link = get('link') || item.querySelector('guid')?.textContent?.trim() || '';
    const pubDate = get('pubDate');
    return {
      title:       get('title'),
      link,
      pubDate,
      pubDateISO:  pubDate ? new Date(pubDate).toISOString() : null,
      source:      item.querySelector('source')?.textContent?.trim() || extractDomain(link),
      description: get('description').replace(/<[^>]*>/g, '').slice(0, 300),
    };
  }).filter(a => a.title && a.link);
}

function generateSummary(description, title) {
  if (!description || description.length < 30) return title;
  return description.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ').slice(0, 280);
}

// ─── Export helpers ────────────────────────────────────────────────────────────

function articlesToCSV(articles) {
  const escape = s => `"${(s || '').replace(/"/g, '""')}"`;
  const header = ['Headline', 'Source', 'Date', 'Summary', 'Link'];
  const rows = articles.map(a => [
    escape(a.title), escape(a.source), escape(formatDateIN(a.pubDateISO)), escape(a.description), escape(a.link),
  ]);
  return [header, ...rows].map(r => r.join(',')).join('\n');
}

function downloadBlob(content, filename, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function generateHTMLReport(articles, query) {
  const unique = new Set(articles.map(a => a.source)).size;
  const last7  = articles.filter(a => a.pubDateISO && Date.now() - new Date(a.pubDateISO) < 7 * 86400000).length;
  const rows   = articles.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><a href="${a.link}" style="color:#2C6E49">${a.title}</a></td>
      <td style="white-space:nowrap">${a.source}</td>
      <td style="white-space:nowrap">${formatDateIN(a.pubDateISO)}</td>
      <td>${(a.description || '').slice(0, 120)}…</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report — ${query}</title>
<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#1A1A18}
h1{font-size:22px}p.sub{color:#5A5A54;font-size:14px;margin-bottom:24px}
.stats{display:flex;gap:20px;margin-bottom:24px}.stat{background:#F5F5F2;border-radius:8px;padding:12px 18px}
.stat-n{font-size:26px;font-weight:700;color:#2C6E49}.stat-l{font-size:12px;color:#5A5A54}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px;background:#F5F5F2;font-size:11px;font-weight:600;text-transform:uppercase;color:#5A5A54;letter-spacing:.4px}
td{padding:9px 8px;border-bottom:1px solid #E8E8E3;font-size:13px}
@media print{.noprint{display:none}}</style></head><body>
<button class="noprint" onclick="window.print()" style="padding:7px 14px;background:#2C6E49;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-bottom:18px;font-size:12px">Print / Save as PDF</button>
<h1>Article Research Report</h1>
<p class="sub">Query: <strong>${query}</strong> · Generated: ${new Date().toLocaleDateString('en-IN',{dateStyle:'long'})}</p>
<div class="stats">
  <div class="stat"><div class="stat-n">${articles.length}</div><div class="stat-l">Total Articles</div></div>
  <div class="stat"><div class="stat-n">${unique}</div><div class="stat-l">Unique Sources</div></div>
  <div class="stat"><div class="stat-n">${last7}</div><div class="stat-l">Last 7 Days</div></div>
</div>
<table><thead><tr><th>#</th><th>Headline</th><th>Source</th><th>Date</th><th>Summary</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
}

// ─── Response resolver ─────────────────────────────────────────────────────────

function resolveResponse(key) {
  const cfg = window.AGENT_CONFIG;
  return (cfg.responses[key] || cfg.responses.fallback).replace(/\{name\}/g, cfg.name);
}

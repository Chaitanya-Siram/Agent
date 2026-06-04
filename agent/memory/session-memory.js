/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — Session Memory Layer (Components 1, 2, 6)
 *  ───────────────────────────────────────────────────────────────
 *  Component 1 — SessionMemoryManager
 *    Stores every interaction with role, content, timestamp, metadata.
 *    Backed by sessionStorage — persists across page refreshes within tab.
 *
 *  Component 2 — TFIDFVectorStore
 *    Browser-native "vector store" using TF-IDF sparse vectors.
 *    No external embedding service required.
 *    Cosine similarity search over all stored interactions.
 *
 *  Component 6 — ActiveWorkingMemory
 *    Tracks current session state:
 *      currentBrand, geography, timeRange, currentDataset,
 *      currentChart, currentQuery, generatedArtifacts
 *    Resolves vague pronouns ("this", "those articles", "the chart")
 *    by injecting working memory context.
 * ═══════════════════════════════════════════════════════════════
 */

// ── English stopwords (excluded from TF-IDF vectors) ───────────────────────

const _SW = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','must','shall',
  'can','need','to','at','by','for','from','in','into','of','off','on','onto',
  'out','per','than','through','till','up','via','with','within','without',
  'and','but','or','nor','not','so','yet','both','either','neither','each',
  'that','this','these','those','what','which','who','whom','when','where',
  'why','how','all','any','some','such','no','just','very','also','then',
  'than','me','my','we','our','you','your','its','it','he','she','they','them',
  'his','her','their','i','us','about','above','after','before','between',
  'here','there','where','when','how','if','because','as','while','although',
  'since','during','including','until','against','among','throughout','despite',
  'towards','upon','whether','get','got','make','made','use','used','using',
  'show','shows','showing','displayed','find','finding','found','give','given',
]);

// ── Time expression patterns ────────────────────────────────────────────────

const _TIME_PATTERNS = [
  { re: /(\d+)\s*hours?\s+ago/i,        label: p => `last ${p[1]} hours`  },
  { re: /last\s+(\d+)\s*hours?/i,       label: p => `last ${p[1]} hours`  },
  { re: /(\d+)\s*hours?/i,              label: p => `${p[1]} hours`        },
  { re: /last\s+(\d+)\s*days?/i,        label: p => `last ${p[1]} days`   },
  { re: /(\d+)\s*days?\s+ago/i,         label: p => `last ${p[1]} days`   },
  { re: /last\s+(\d+)\s*weeks?/i,       label: p => `last ${p[1]} weeks`  },
  { re: /last\s+(\d+)\s*months?/i,      label: p => `last ${p[1]} months` },
  { re: /last\s+week/i,                 label: _ => 'last 7 days'          },
  { re: /this\s+week/i,                 label: _ => 'this week'            },
  { re: /last\s+month/i,               label: _ => 'last 30 days'         },
  { re: /this\s+month/i,               label: _ => 'this month'           },
  { re: /today/i,                       label: _ => 'today'                },
  { re: /yesterday/i,                   label: _ => 'yesterday'            },
  { re: /72\s*hours?/i,                 label: _ => '72 hours'             },
  { re: /48\s*hours?/i,                 label: _ => '48 hours'             },
  { re: /24\s*hours?/i,                 label: _ => '24 hours'             },
  { re: /(Q[1-4])\s*(\d{4})/i,         label: p => `${p[1]} ${p[2]}`     },
  { re: /\d{4}-\d{2}-\d{2}/,           label: p => p[0]                   },
];

// Tokens that signal a vague / pronoun-dependent query
const _VAGUE_TOKENS = [
  'show me', 'show charts', 'show graph', 'show map', 'show pie', 'show bar',
  'show line', 'show this', 'those articles', 'the articles', 'the data',
  'these results', 'the chart', 'the map', 'the query', 'the report',
  'visualize this', 'analyze this', 'plot this', 'create chart', 'make chart',
  'generate chart', 'more details', 'tell me more', 'export this',
  'download this', 'compare this', 'give me', 'can you show',
];

// ── Component 2: TF-IDF Vector Store ────────────────────────────────────────

class TFIDFVectorStore {
  constructor() {
    this._docs = [];   // { id, text, vec, metadata, ts }
  }

  // Tokenize + remove stopwords + normalize
  _tokenize(text) {
    return (text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !_SW.has(t));
  }

  // Compute TF vector (term → normalised frequency)
  _encode(text) {
    const tokens = this._tokenize(text);
    if (tokens.length === 0) return {};
    const tf = {};
    tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const total = tokens.length;
    Object.keys(tf).forEach(t => { tf[t] /= total; });
    return tf;
  }

  // Cosine similarity between two TF maps
  _cosine(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, na = 0, nb = 0;
    keys.forEach(k => {
      const av = a[k] || 0, bv = b[k] || 0;
      dot += av * bv;
      na  += av * av;
      nb  += bv * bv;
    });
    return (na === 0 || nb === 0) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  add(id, text, metadata = {}) {
    // Deduplicate by id
    this._docs = this._docs.filter(d => d.id !== id);
    this._docs.push({ id, text: (text || '').slice(0, 1500), vec: this._encode(text), metadata, ts: Date.now() });
    if (this._docs.length > 200) this._docs.shift(); // rolling cap
  }

  search(query, topK = 8, minScore = 0.02) {
    const qv = this._encode(query);
    return this._docs
      .map(d => ({ ...d, similarity: this._cosine(qv, d.vec) }))
      .filter(d => d.similarity >= minScore)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  size()  { return this._docs.length; }
  clear() { this._docs = []; }
}

// ── Component 6: Active Working Memory ──────────────────────────────────────

class ActiveWorkingMemory {
  constructor() {
    this._reset();
  }

  _reset() {
    this.currentBrand     = null;   // Primary brand e.g. "Tesla"
    this.currentBrands    = [];     // All brands in session
    this.geography        = [];     // ["India", "Europe"]
    this.timeRange        = null;   // "72 hours", "last week"
    this.industry         = null;   // "Electric Vehicles"
    this.topics           = [];     // ["pricing", "expansion"]
    this.currentDataset   = null;   // { count, keywords, fetchedAt }
    this.currentChartId   = null;   // Reference to latest chart
    this.currentQueryId   = null;   // Reference to latest boolean query
    this.currentReportId  = null;   // Reference to latest report
    this.generatedArtifacts = [];   // ['articles','chart','boolean_query']
    this.lastIntent       = null;   // Last detected intent
    this.lastAction       = null;   // 'article_search'|'visualization'|'media_intel'
  }

  // Called whenever new metadata arrives (from classifier, fetch, chart gen, etc.)
  update({ brands, geography, timeRange, industry, topics, artifact,
           articleDataset, chartId, queryId, reportId, intent, action } = {}) {
    if (brands?.length) {
      this.currentBrands = [...new Set([...this.currentBrands, ...brands])].slice(-6);
      this.currentBrand  = brands[0];
    }
    if (geography?.length) {
      this.geography = [...new Set([...this.geography, ...geography])].slice(-8);
    }
    if (timeRange)    this.timeRange   = timeRange;
    if (industry)     this.industry    = industry;
    if (intent)       this.lastIntent  = intent;
    if (action)       this.lastAction  = action;
    if (topics?.length) {
      this.topics = [...new Set([...this.topics, ...topics])].slice(-12);
    }
    if (artifact) {
      this.generatedArtifacts = [...new Set([...this.generatedArtifacts, artifact])].slice(-10);
    }
    if (articleDataset) this.currentDataset  = articleDataset;
    if (chartId)        this.currentChartId  = chartId;
    if (queryId)        this.currentQueryId  = queryId;
    if (reportId)       this.currentReportId = reportId;
  }

  // Extract entities from raw user message text (fast, no API call)
  extractFromText(text) {
    const lower = (text || '').toLowerCase();

    // Time range detection
    for (const p of _TIME_PATTERNS) {
      const m = text.match(p.re);
      if (m) { this.timeRange = p.label(m); break; }
    }

    // Detect if this is a vague / pronoun-dependent query
    const words     = lower.split(/\s+/).filter(Boolean);
    const isShort   = words.length < 5;
    const isVague   = _VAGUE_TOKENS.some(v => lower.includes(v));
    const hasPronoun = /\b(this|that|these|those|it|them|the results|the articles|the chart|the map)\b/.test(lower);

    return { isVague: isShort || isVague || hasPronoun };
  }

  // Build an enriched version of a vague query using working memory
  resolveQuery(rawQuery) {
    const { isVague } = this.extractFromText(rawQuery);
    if (!isVague || this.isEmpty()) return rawQuery;

    const ctx = [];
    if (this.currentBrand)         ctx.push(`for ${this.currentBrand}`);
    if (this.geography.length)     ctx.push(`in ${this.geography.join(', ')}`);
    if (this.timeRange)            ctx.push(`[${this.timeRange}]`);
    if (this.industry)             ctx.push(`(${this.industry})`);
    if (this.currentDataset)       ctx.push(`using ${this.currentDataset.count} previously fetched articles`);
    if (this.lastAction === 'media_intel' && this.currentQueryId) ctx.push('(based on generated boolean query)');

    return ctx.length > 0 ? `${rawQuery} — context: ${ctx.join(', ')}` : rawQuery;
  }

  toSummary() {
    const p = [];
    if (this.currentBrand)             p.push(`Brand: ${this.currentBrand}`);
    if (this.currentBrands.length > 1) p.push(`All brands: ${this.currentBrands.join(', ')}`);
    if (this.geography.length)         p.push(`Geo: ${this.geography.join(', ')}`);
    if (this.timeRange)                p.push(`Time: ${this.timeRange}`);
    if (this.industry)                 p.push(`Industry: ${this.industry}`);
    if (this.topics.length)            p.push(`Topics: ${this.topics.join(', ')}`);
    if (this.generatedArtifacts.length) p.push(`Generated: ${this.generatedArtifacts.join(', ')}`);
    if (this.currentDataset)           p.push(`Dataset: ${this.currentDataset.count} articles`);
    return p.length ? p.join(' | ') : 'No active context';
  }

  toJSON() {
    return {
      currentBrand:        this.currentBrand,
      currentBrands:       this.currentBrands,
      geography:           this.geography,
      timeRange:           this.timeRange,
      industry:            this.industry,
      topics:              this.topics,
      currentDataset:      this.currentDataset,
      generatedArtifacts:  this.generatedArtifacts,
      lastIntent:          this.lastIntent,
      lastAction:          this.lastAction,
    };
  }

  isEmpty() {
    return !this.currentBrand && !this.geography.length && !this.timeRange && !this.currentDataset;
  }

  reset() { this._reset(); }
}

// ── Component 1: Session Memory Manager ─────────────────────────────────────

class SessionMemoryManager {
  constructor() {
    this._interactions = [];
    this._summaries    = [];
    this._sessionId    = 'ses_' + Date.now();
    this._msgCount     = 0;
    this._tokenCount   = 0;
    this._load();
  }

  _load() {
    try {
      const raw = sessionStorage.getItem('lensai:session_memory_v2');
      if (raw) {
        const d = JSON.parse(raw);
        this._interactions = d.interactions || [];
        this._summaries    = d.summaries    || [];
        this._sessionId    = d.sessionId    || this._sessionId;
        this._msgCount     = d.msgCount     || 0;
        this._tokenCount   = d.tokenCount   || 0;
      }
    } catch (_) { this._interactions = []; this._summaries = []; }
  }

  _persist() {
    try {
      sessionStorage.setItem('lensai:session_memory_v2', JSON.stringify({
        interactions: this._interactions.slice(-120),
        summaries:    this._summaries.slice(-10),
        sessionId:    this._sessionId,
        msgCount:     this._msgCount,
        tokenCount:   this._tokenCount,
      }));
    } catch (_) {}
  }

  // Store one interaction
  store(role, content, metadata = {}) {
    this._msgCount++;
    const chars = (content || '').length;
    this._tokenCount += Math.ceil(chars / 4); // 1 token ≈ 4 chars

    const interaction = {
      sessionId: this._sessionId,
      messageId: `msg_${this._msgCount}`,
      role,
      content:   (content || '').slice(0, 2000),
      timestamp: Date.now(),
      metadata,
    };
    this._interactions.push(interaction);
    if (this._interactions.length > 120) this._interactions.shift();
    this._persist();
    return interaction;
  }

  addSummary(summary) {
    this._summaries.push({
      summary,
      timestamp:    Date.now(),
      upToMessage:  this._msgCount,
      upToTokens:   this._tokenCount,
    });
    this._persist();
  }

  // --- Accessors ---
  getRecent(n = 10)      { return this._interactions.slice(-n); }
  getAll()               { return [...this._interactions]; }
  getLatestSummary()     { return this._summaries.at(-1) || null; }
  getMsgCount()          { return this._msgCount; }
  getTokenCount()        { return this._tokenCount; }
  getSessionId()         { return this._sessionId; }

  // Trigger summary if 10+ messages OR 10K+ tokens since last summary
  shouldSummarize() {
    const lastAt = this.getLatestSummary()?.upToMessage || 0;
    const lastTok = this.getLatestSummary()?.upToTokens || 0;
    return (this._msgCount - lastAt) >= 10 || (this._tokenCount - lastTok) >= 10000;
  }

  clear() {
    this._interactions = [];
    this._summaries    = [];
    this._msgCount     = 0;
    this._tokenCount   = 0;
    sessionStorage.removeItem('lensai:session_memory_v2');
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

window.TFIDFVectorStore     = TFIDFVectorStore;
window.ActiveWorkingMemory  = ActiveWorkingMemory;
window.SessionMemoryManager = SessionMemoryManager;

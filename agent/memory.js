/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — Agent Memory
 *  ───────────────────────────────────────────────────────────────
 *  Per-session persistent memory for all agents.
 *  Stores: interaction log, successful patterns, error history.
 *  Backed by sessionStorage so data survives page refreshes
 *  within the same browser tab, but clears on new sessions.
 * ═══════════════════════════════════════════════════════════════
 */

class AgentMemory {
  constructor() {
    this._cache = {};
    this._load();
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  _load() {
    try {
      const raw = sessionStorage.getItem('lensai:agent_memory');
      if (raw) this._cache = JSON.parse(raw);
    } catch (_) { this._cache = {}; }
  }

  _persist() {
    try { sessionStorage.setItem('lensai:agent_memory', JSON.stringify(this._cache)); }
    catch (_) {}
  }

  // ── Key-value store ────────────────────────────────────────────────────────

  save(key, value) {
    this._cache[key] = { value, ts: Date.now() };
    this._persist();
  }

  recall(key) {
    return this._cache[key]?.value ?? null;
  }

  forget(key) {
    delete this._cache[key];
    this._persist();
  }

  // ── Learning from agent outcomes ───────────────────────────────────────────

  learn({ type, agent, query = '', chartType = null, error = null, fix = null, duration = 0 }) {
    // Append to rolling interaction log (max 200 entries)
    const log = this._cache._log || [];
    log.push({ type, agent, query: query.slice(0, 120), error, duration, ts: Date.now() });
    if (log.length > 200) log.splice(0, log.length - 200);
    this._cache._log = log;

    // Successful visualizations → save query→chartType pattern
    if (type === 'success' && chartType) {
      const patterns = this._cache._patterns || [];
      patterns.unshift({ query: query.slice(0, 120), chartType, ts: Date.now() });
      if (patterns.length > 40) patterns.length = 40;
      this._cache._patterns = patterns;
    }

    // Errors and heals → save for self-healing context
    if (type === 'error' || type === 'heal') {
      const errors = this._cache._errors || [];
      errors.unshift({ agent, query: query.slice(0, 120), error, fix, ts: Date.now() });
      if (errors.length > 60) errors.length = 60;
      this._cache._errors = errors;
    }

    this._persist();
  }

  // ── Pattern retrieval ──────────────────────────────────────────────────────

  findSimilarQuery(query) {
    const patterns = this._cache._patterns || [];
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return patterns.find(p =>
      words.some(w => p.query.toLowerCase().includes(w))
    ) || null;
  }

  getRecentErrors(agent = null, n = 4) {
    const errors = this._cache._errors || [];
    return errors
      .filter(e => !agent || e.agent === agent)
      .slice(0, n);
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  getStats() {
    const log = this._cache._log || [];
    const byAgent = {};
    log.forEach(e => {
      byAgent[e.agent] = byAgent[e.agent] || { success: 0, error: 0 };
      if (e.type === 'success') byAgent[e.agent].success++;
      if (e.type === 'error')   byAgent[e.agent].error++;
    });
    return {
      totalRuns:    log.length,
      successes:    log.filter(e => e.type === 'success').length,
      errors:       log.filter(e => e.type === 'error').length,
      patterns:     (this._cache._patterns || []).length,
      byAgent,
    };
  }

  exportLog() {
    return {
      log:      this._cache._log      || [],
      patterns: this._cache._patterns || [],
      errors:   this._cache._errors   || [],
    };
  }

  clear() {
    this._cache = {};
    sessionStorage.removeItem('lensai:agent_memory');
  }
}

window.AgentMemory = AgentMemory;

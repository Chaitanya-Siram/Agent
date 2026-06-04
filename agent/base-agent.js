/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — BaseAgent
 *  ───────────────────────────────────────────────────────────────
 *  All agents extend this class. Provides:
 *    • Claude API call helper
 *    • Retry loop with exponential backoff
 *    • validate() / heal() overridable hooks
 *    • Event emission (observed by the orchestrator monitor)
 *    • Memory integration (learn from every outcome)
 * ═══════════════════════════════════════════════════════════════
 */

class BaseAgent {
  constructor({
    name,
    role,
    systemPrompt = '',
    model        = null,
    maxTokens    = 4096,
    maxRetries   = 3,
    memory       = null,
  }) {
    this.name         = name;
    this.role         = role;
    this.systemPrompt = systemPrompt;
    this.model        = model || (window.AGENT_CONFIG?.model || 'claude-sonnet-4-20250514');
    this.maxTokens    = maxTokens;
    this.maxRetries   = maxRetries;
    this.memory       = memory;
    this._listeners   = {};
  }

  // ── Event system ───────────────────────────────────────────────────────────

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return this;
  }

  emit(event, data = {}) {
    const payload = { agent: this.name, role: this.role, event, ts: Date.now(), ...data };
    (this._listeners[event] || []).forEach(fn => fn(payload));
    // Forward to global orchestrator monitor if available
    if (window.ORCHESTRATOR && typeof window.ORCHESTRATOR._monitor === 'function') {
      window.ORCHESTRATOR._monitor(payload);
    }
  }

  // ── Claude API call ────────────────────────────────────────────────────────

  async callClaude(messages, opts = {}) {
    const apiKey = opts.apiKey || window._agentApiKey;
    if (!apiKey) throw new Error('API key required — set window._agentApiKey before running agents');

    const body = {
      model:      opts.model      || this.model,
      max_tokens: opts.maxTokens  || this.maxTokens,
      system:     opts.system     || this.systemPrompt,
      messages,
    };

    const res = await fetch('/proxy/anthropic', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API error ${res.status}`);
    }

    const data = await res.json();
    return (data.content?.[0]?.text || '').trim();
  }

  // ── Overridable hooks ──────────────────────────────────────────────────────

  /**
   * Validate the agent's output.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  async validate(output) {           // eslint-disable-line no-unused-vars
    return { valid: true, errors: [] };
  }

  /**
   * Attempt to heal an invalid output.
   * @returns {string|null} fixed output, or null to trigger a retry
   */
  async heal(output, errors, context) { // eslint-disable-line no-unused-vars
    return null;
  }

  /**
   * Core execution — each subclass must implement this.
   */
  async _execute(prompt, context, attempt) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.name}._execute() is not implemented`);
  }

  // ── Main run loop with retry + self-healing ────────────────────────────────

  async run(prompt, context = {}) {
    this.emit('start', { prompt: (prompt || '').slice(0, 140) });
    const t0 = Date.now();
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.emit('attempt', { attempt, max: this.maxRetries });

        const result = await this._execute(prompt, context, attempt);
        const { valid, errors } = await this.validate(result);

        if (valid) {
          const duration = Date.now() - t0;
          this.emit('success', { attempt, duration });
          this.memory?.learn({
            type: 'success', agent: this.name, query: prompt,
            chartType: context.chartType || null, duration,
          });
          return result;
        }

        // Validation failed — try the heal hook before retrying
        this.emit('heal', { attempt, errors });
        this.memory?.learn({
          type: 'heal', agent: this.name, query: prompt,
          error: errors.join(' | '),
        });

        const healed = await this.heal(result, errors, context);
        if (healed !== null) {
          const duration = Date.now() - t0;
          this.emit('success', { attempt, healed: true, duration });
          this.memory?.learn({
            type: 'success', agent: this.name, query: prompt,
            chartType: context.chartType || null, duration,
          });
          return healed;
        }

        lastError = new Error(`Validation failed: ${errors.join(', ')}`);

      } catch (err) {
        lastError = err;
        this.emit('retry', { attempt, error: err.message });
        this.memory?.learn({
          type: 'error', agent: this.name, query: prompt, error: err.message,
        });

        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 700 * attempt)); // backoff: 0.7s, 1.4s, 2.1s
        }
      }
    }

    this.emit('fail', { error: lastError?.message });
    throw lastError || new Error(`${this.name} failed after ${this.maxRetries} attempts`);
  }
}

window.BaseAgent = BaseAgent;

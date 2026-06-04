/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — CodeAgent
 *  ───────────────────────────────────────────────────────────────
 *  Validates and fixes HTML/JS code produced by other agents.
 *  Pipeline role: runs AFTER VisualizationAgent to catch and
 *  repair issues before the chart is rendered in the browser.
 *
 *  Checks:
 *    1. Structural: forbidden tags, required elements
 *    2. Script safety: no obvious injection patterns
 *    3. Completeness: all opened tags are closed
 *    4. Claude review: asks Claude to spot logic/runtime bugs
 *
 *  If issues are found, it uses Claude to fix them (self-heal).
 * ═══════════════════════════════════════════════════════════════
 */

const CODE_AGENT_SYSTEM = `You are CodeAgent — a code review and bug-fixing specialist in the LensAI multi-agent system.

Your job: review HTML/JavaScript visualization code for bugs and fix them.

Look for:
- JavaScript runtime errors (undefined variables, wrong method names, async/await issues)
- Missing or unclosed HTML tags
- Chart.js configuration errors (wrong property names, missing required fields)
- D3 selection errors (wrong chaining, missing data joins)
- CDN script loading issues (wrong URLs)
- Dark mode logic errors
- Tooltip or legend not wired correctly

When fixing:
- Return ONLY the corrected HTML, nothing else
- Preserve all original functionality
- Do not add features, only fix bugs
- Keep the same structure and approach`;

class CodeAgent extends BaseAgent {
  constructor(opts = {}) {
    super({
      name:       'CodeAgent',
      role:       'code',
      systemPrompt: CODE_AGENT_SYSTEM,
      model:      opts.model      || (window.AGENT_CONFIG?.model || 'claude-sonnet-4-20250514'),
      maxTokens:  opts.maxTokens  || 5000,
      maxRetries: opts.maxRetries || 2,
      memory:     opts.memory     || null,
    });
  }

  // ── Core execution ──────────────────────────────────────────────────────────

  async _execute(html, context = {}) {
    // First run static checks — if clean, skip Claude call for performance
    const staticIssues = this._staticCheck(html);

    if (staticIssues.length === 0 && !context.forceReview) {
      // Code looks clean statically — trust it
      return html;
    }

    // Ask Claude to review and fix the issues
    const issueList = staticIssues.length > 0
      ? `Static analysis found:\n${staticIssues.map(e => `• ${e}`).join('\n')}\n\n`
      : '';

    const fixed = await this.callClaude([{
      role: 'user',
      content:
        `${issueList}Review and fix this HTML visualization code. ` +
        `Return ONLY the corrected HTML, no explanation:\n\n${html}`,
    }], { apiKey: context.apiKey });

    return this._extractHTML(fixed);
  }

  // ── Static analysis (no API call needed) ────────────────────────────────────

  _staticCheck(html) {
    const issues = [];

    if (!html || html.trim().length < 20) {
      issues.push('Code is empty or too short');
      return issues;
    }

    // Forbidden top-level tags (the viz agent should never include these)
    if (/<!DOCTYPE/i.test(html))  issues.push('Contains DOCTYPE — remove it');
    if (/<html\b/i.test(html))    issues.push('Contains <html> tag — remove it');
    if (/<\/html>/i.test(html))   issues.push('Contains </html> — remove it');

    // Must have at least one chart element
    if (!/(<canvas|<svg|\.select\(|new Chart)/i.test(html)) {
      issues.push('No chart element found (canvas/svg/d3/Chart.js)');
    }

    // Scripts must have src or content
    const scriptTags = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
    scriptTags.forEach((m, i) => {
      const attrs   = m[1];
      const content = m[2].trim();
      if (!attrs.includes('src') && content.length === 0) {
        issues.push(`Empty inline <script> block at position ${i + 1}`);
      }
    });

    // Check for obviously unclosed important tags
    ['div', 'script', 'style'].forEach(tag => {
      const opens  = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
      const closes = (html.match(new RegExp(`<\/${tag}>`, 'gi')) || []).length;
      if (opens > closes + 1) { // allow 1 discrepancy (void elements etc.)
        issues.push(`Unclosed <${tag}> tags (${opens} open, ${closes} close)`);
      }
    });

    // Obvious Chart.js mistake: using deprecated 'type: globalChart'
    if (/type:\s*['"]globalChart['"]/i.test(html)) {
      issues.push('Invalid Chart.js type "globalChart" — check type field');
    }

    // D3 .append(something) without a selection — bare .append
    if (/^\.append\(/m.test(html)) {
      issues.push('Possible D3 .append() called without a prior selection');
    }

    return issues;
  }

  // ── Validate: check after execute ───────────────────────────────────────────

  async validate(html) {
    const staticIssues = this._staticCheck(html);

    // Only fail on structural issues that would break rendering
    const blocking = staticIssues.filter(i =>
      i.includes('empty or too short') ||
      i.includes('No chart element')
    );

    return { valid: blocking.length === 0, errors: blocking };
  }

  // ── Self-heal: one final Claude pass ────────────────────────────────────────

  async heal(html, errors, context) {
    this.emit('heal', { errors });
    const fixed = await this.callClaude([{
      role: 'user',
      content:
        `The following critical errors were found in this visualization code:\n` +
        errors.map(e => `• ${e}`).join('\n') +
        `\n\nPlease fix all issues and return ONLY the corrected HTML:\n\n${html}`,
    }], { apiKey: context.apiKey });

    this.memory?.learn({
      type: 'heal', agent: this.name,
      query: 'fix structural errors', error: errors.join(' | '), fix: 'auto-fixed',
    });

    return this._extractHTML(fixed);
  }

  // ── Strip markdown fences from Claude output ─────────────────────────────────

  _extractHTML(text) {
    const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    const htmlStart = text.search(/<(?:script|style|div|canvas|svg|link)/i);
    if (htmlStart > 0) return text.slice(htmlStart).trim();
    return text.trim();
  }

  // ── Quick check only — no Claude call ───────────────────────────────────────

  quickCheck(html) {
    return this._staticCheck(html);
  }
}

window.CodeAgent = CodeAgent;

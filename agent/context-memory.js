/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — ContextMemory Facade
 *  ───────────────────────────────────────────────────────────────
 *  Combines all 8 memory components into one interface.
 *  Exposes window.CONTEXT_MEMORY used by the orchestrator.
 *
 *  PUBLIC API:
 *    assemble(query, modelId)           → { enrichedQuery, contextBlock, ... }
 *    record(role, content, metadata)    → stores + indexes + updates working memory
 *    summarize(apiKey)                  → triggers ConversationSummarizer if due
 *    getWorkingMemory()                 → { currentBrand, geography, timeRange, ... }
 *    getDebugInfo()                     → diagnostic snapshot
 *    clear()                            → wipes all memory
 * ═══════════════════════════════════════════════════════════════
 */

class ContextMemory {
  constructor() {
    // Instantiate all 8 components
    this.sessionMemory  = new SessionMemoryManager();     // Component 1
    this.vectorStore    = new TFIDFVectorStore();          // Component 2
    this.workingMemory  = new ActiveWorkingMemory();       // Component 6
    this.assembler      = new ContextAssemblyPipeline(     // Component 8
      this.sessionMemory,
      this.vectorStore,
      this.workingMemory,
    );
    // Components 3,4,5,7 are used inside assembler/summarizer

    // Rebuild vector index from persisted session memory
    this._rebuildVectorIndex();
  }

  // Re-index all stored interactions after page reload
  _rebuildVectorIndex() {
    const stored = this.sessionMemory.getAll();
    stored.forEach(i => {
      this.vectorStore.add(i.messageId, i.content, {
        role:      i.role,
        ts:        i.timestamp,
        ...i.metadata,
      });
    });
    // Attempt to restore working memory from latest summary
    const sum = this.sessionMemory.getLatestSummary();
    if (sum?.summary?.entities) {
      const e = sum.summary.entities;
      if (e.brands?.length)    this.workingMemory.update({ brands:    e.brands    });
      if (e.geography?.length) this.workingMemory.update({ geography: e.geography });
      if (e.timeRange)         this.workingMemory.update({ timeRange: e.timeRange });
      if (e.industry)          this.workingMemory.update({ industry:  e.industry  });
      if (e.topics?.length)    this.workingMemory.update({ topics:    e.topics    });
    }
  }

  // ── Component 8: Assemble context BEFORE every orchestrator.run() ──────────
  //
  //  Returns:
  //    enrichedQuery   — vague references resolved with working memory
  //    contextBlock    — formatted text to inject into agent prompts
  //    wasResolved     — true if the query was a vague reference
  //    tokenBudget     — token allocation breakdown
  //    workingMemory   — current session state snapshot
  //    stats           — retrieval diagnostics

  assemble(userQuery, modelId = '') {
    return this.assembler.assemble(
      userQuery,
      modelId || window.AGENT_CONFIG?.model || 'claude-sonnet',
    );
  }

  // ── Record every interaction (user msg, agent response, article fetch, etc.) ─
  //
  //  metadata examples:
  //    { artifact: 'articles', articleDataset: { count: 27, keywords: 'Tesla EV' } }
  //    { artifact: 'chart',    chartId: 'chart_001' }
  //    { artifact: 'boolean_query', booleanQuery: '...' }
  //    { brands: ['Tesla'], geography: ['India'], timeRange: '72 hours' }
  //    { intents: ['Brand Monitoring'], action: 'media_intel' }

  record(role, content, metadata = {}) {
    const interaction = this.sessionMemory.store(role, content, metadata);
    this.vectorStore.add(interaction.messageId, content, {
      role,
      ts: interaction.timestamp,
      ...metadata,
    });
    // Automatically update working memory from metadata
    this._updateWorkingMemory(metadata, content);
    return interaction;
  }

  _updateWorkingMemory(metadata, content) {
    const upd = {};
    if (metadata.brands?.length)       upd.brands       = metadata.brands;
    if (metadata.geography?.length)    upd.geography    = metadata.geography;
    if (metadata.timeRange)            upd.timeRange    = metadata.timeRange;
    if (metadata.industry)             upd.industry     = metadata.industry;
    if (metadata.topics?.length)       upd.topics       = metadata.topics;
    if (metadata.artifact)             upd.artifact     = metadata.artifact;
    if (metadata.articleDataset)       upd.articleDataset = metadata.articleDataset;
    if (metadata.chartId)              upd.chartId      = metadata.chartId;
    if (metadata.queryId)              upd.queryId      = metadata.queryId;
    if (metadata.action)               upd.action       = metadata.action;
    if (metadata.intent)               upd.intent       = metadata.intent;
    if (Object.keys(upd).length > 0)   this.workingMemory.update(upd);

    // Also try to extract time ranges from raw content (user messages)
    if (content) this.workingMemory.extractFromText(content);
  }

  // ── Component 5: Trigger rolling summarizer if due ─────────────────────────

  async summarize(apiKey) {
    if (!this.sessionMemory.shouldSummarize()) return false;

    const summary = await ConversationSummarizer.summarize(
      this.sessionMemory.getAll(),
      apiKey || window._agentApiKey,
      this.workingMemory,
    );

    if (summary) {
      this.sessionMemory.addSummary(summary);
      // Update working memory from summary
      if (summary.entities?.brands?.length)    this.workingMemory.update({ brands:    summary.entities.brands    });
      if (summary.entities?.geography?.length) this.workingMemory.update({ geography: summary.entities.geography });
      if (summary.entities?.timeRange)         this.workingMemory.update({ timeRange: summary.entities.timeRange });
      if (summary.entities?.topics?.length)    this.workingMemory.update({ topics:    summary.entities.topics    });
      return true;
    }
    return false;
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  getWorkingMemory() { return this.workingMemory; }

  getDebugInfo() {
    const budget = DynamicTokenBudgetManager.getBudget(window.AGENT_CONFIG?.model || '');
    return {
      sessionId:       this.sessionMemory.getSessionId(),
      messageCount:    this.sessionMemory.getMsgCount(),
      estimatedTokens: this.sessionMemory.getTokenCount(),
      vectorCount:     this.vectorStore.size(),
      workingMemory:   this.workingMemory.toJSON(),
      workingSummary:  this.workingMemory.toSummary(),
      latestSummary:   this.sessionMemory.getLatestSummary()?.summary?.sessionSummary || null,
      shouldSummarize: this.sessionMemory.shouldSummarize(),
      tokenBudget:     budget,
    };
  }

  clear() {
    this.sessionMemory.clear();
    this.vectorStore.clear();
    this.workingMemory.reset();
    this.assembler = new ContextAssemblyPipeline(
      this.sessionMemory,
      this.vectorStore,
      this.workingMemory,
    );
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

window.CONTEXT_MEMORY = new ContextMemory();

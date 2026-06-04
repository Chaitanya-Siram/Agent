/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — Context Engine (Components 3, 4, 5, 7, 8)
 *  ───────────────────────────────────────────────────────────────
 *  Component 3 — ContextRetrievalEngine
 *    Semantic search over session interactions using TF-IDF.
 *
 *  Component 4 — DynamicTokenBudgetManager
 *    Calculates available token budget per model, reserves 20% for
 *    response generation, allocates remaining budget across context
 *    sections (query 5%, system 10%, history 30%, memory 30%,
 *    articles 20%, metadata 5%).
 *
 *  Component 5 — ConversationSummarizer
 *    Triggers after every 10 messages or 10K tokens.
 *    Uses Claude to generate a rolling summary:
 *      { sessionSummary, entities, generatedAssets, userGoals }
 *
 *  Component 7 — RelevanceRankingEngine
 *    Scores every retrieved context by:
 *      0.5 × Semantic Similarity
 *    + 0.2 × Recency
 *    + 0.2 × Entity Match
 *    + 0.1 × Artifact Dependency
 *
 *  Component 8 — ContextAssemblyPipeline
 *    Combines all components:
 *      1. Resolve vague references (working memory injection)
 *      2. Retrieve semantically similar past interactions
 *      3. Rank + filter to token budget
 *      4. Assemble final context block for agent prompts
 *      5. Return { enrichedQuery, contextBlock, wasResolved }
 * ═══════════════════════════════════════════════════════════════
 */

// ── Component 4: Dynamic Token Budget Manager ────────────────────────────────

class DynamicTokenBudgetManager {
  // Known model context windows (in tokens)
  static MODEL_WINDOWS = {
    'claude-sonnet': 200000,
    'claude-haiku':  200000,
    'claude-opus':   200000,
    'gpt-4':          128000,
    'gpt-3.5':          16385,
    'gemini-pro':     1000000,
    default:          100000,
  };

  static RESERVE_RATIO = 0.20;   // 20% reserved for response generation

  // How available context is split across sections
  static ALLOCATION = {
    currentQuery:  0.05,   // 5%  — current user message
    systemPrompt:  0.10,   // 10% — agent system prompt
    history:       0.30,   // 30% — recent chat messages
    retrievedMem:  0.30,   // 30% — semantically retrieved context
    articles:      0.20,   // 20% — fetched article content
    metadata:      0.05,   // 5%  — working memory state + intents
  };

  static CHARS_PER_TOKEN = 4;    // ~4 chars per token (Claude, GPT)

  static estimateTokens(text) {
    return Math.ceil((text || '').length / this.CHARS_PER_TOKEN);
  }

  static getBudget(modelId = '') {
    const key = Object.keys(this.MODEL_WINDOWS).find(k =>
      modelId.toLowerCase().includes(k)
    ) || 'default';
    const total     = this.MODEL_WINDOWS[key];
    const reserved  = Math.round(total * this.RESERVE_RATIO);
    const available = total - reserved;
    return {
      model:     key,
      total,
      reserved,
      available,
      sections: Object.fromEntries(
        Object.entries(this.ALLOCATION).map(([k, pct]) => [
          k, Math.round(available * pct)
        ])
      ),
    };
  }

  static truncateToTokens(text, maxTokens) {
    const maxChars = maxTokens * this.CHARS_PER_TOKEN;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 120) + '\n…[truncated for context window]';
  }
}

// ── Component 7: Relevance Ranking Engine ────────────────────────────────────
//
//  Final Score = 0.5 × SemanticSim + 0.2 × Recency + 0.2 × EntityMatch + 0.1 × ArtifactDep

class RelevanceRankingEngine {
  static WEIGHTS = {
    semantic:  0.5,
    recency:   0.2,
    entity:    0.2,
    artifact:  0.1,
  };

  static HALF_LIFE_MS = 10 * 60 * 1000; // 10-minute recency half-life

  static rank(candidates, currentQuery, workingMemory, vectorStore) {
    const now         = Date.now();
    const queryVec    = vectorStore._encode(currentQuery);
    const lower       = (currentQuery || '').toLowerCase();

    // Current entity set (from working memory)
    const entities = new Set([
      ...(workingMemory.currentBrands || []),
      ...(workingMemory.geography     || []),
      ...(workingMemory.topics        || []),
    ].map(e => (e || '').toLowerCase()).filter(Boolean));

    // Does the current query depend on a previously generated artifact?
    const needsArtifact =
      /\b(chart|graph|map|visual|pie|bar|line|heatmap|export|download|report|analyze|sentiment)\b/
      .test(lower);
    const needsArticles = /\b(article|articles|data|dataset|result|results|coverage)\b/.test(lower);

    return candidates.map(item => {
      // ── Semantic similarity (cosine of TF-IDF vectors)
      const itemVec   = item.vec || vectorStore._encode(item.text || item.content || '');
      const semantic  = vectorStore._cosine(queryVec, itemVec);

      // ── Recency (exponential decay: half-life = HALF_LIFE_MS)
      const ageMs   = now - (item.timestamp || item.ts || now);
      const recency = Math.exp(-ageMs / this.HALF_LIFE_MS);

      // ── Entity match (overlap between item tokens and working-memory entities)
      const tokens   = vectorStore._tokenize(item.text || item.content || '');
      const hitCount = tokens.filter(t => entities.has(t)).length;
      const entity   = entities.size > 0
        ? Math.min(1, hitCount / entities.size)
        : 0;

      // ── Artifact dependency
      const meta         = item.metadata || {};
      const hasArtifact  = (meta.generatedArtifacts?.length > 0) || !!meta.artifact;
      const hasArticles  = meta.artifact === 'articles' || !!meta.articleDataset;
      const artifact     = (needsArtifact && hasArtifact) || (needsArticles && hasArticles)
        ? 1.0 : 0.0;

      const score =
        this.WEIGHTS.semantic * semantic +
        this.WEIGHTS.recency  * recency  +
        this.WEIGHTS.entity   * entity   +
        this.WEIGHTS.artifact * artifact;

      return {
        ...item,
        score,
        scoreComponents: { semantic, recency, entity, artifact },
      };
    })
    .sort((a, b) => b.score - a.score);
  }
}

// ── Component 5: Conversation Summarizer ─────────────────────────────────────

class ConversationSummarizer {
  static async summarize(interactions, apiKey, workingMemory) {
    const key = apiKey || window._agentApiKey;
    if (!key || !interactions?.length) return null;

    const recentText = interactions.slice(-20).map(i =>
      `${(i.role || '').toUpperCase()}: ${(i.content || '').slice(0, 350)}`
    ).join('\n\n');

    const body = {
      model:      window.AGENT_CONFIG?.model || 'claude-sonnet-4-20250514',
      max_tokens: 700,
      system:     `You are a conversation memory summarizer for a media intelligence platform.
Summarize the conversation preserving ALL key facts: brand names, products, geography, time ranges, topics, and what was generated (articles, charts, boolean queries, reports).
Return ONLY valid JSON:
{
  "sessionSummary": "2-3 sentence summary of conversation so far",
  "entities": {
    "brands":    [],
    "products":  [],
    "geography": [],
    "timeRange": null,
    "industry":  null,
    "topics":    []
  },
  "generatedAssets": ["articles", "chart", "boolean_query"],
  "userGoals":  ["track brand coverage", "analyze sentiment"],
  "keyFacts":   ["Tesla EV coverage in India for 72 hours", "27 articles fetched"]
}`,
      messages: [{
        role:    'user',
        content: `Summarize this conversation:\n\n${recentText}\n\nCurrent session state: ${workingMemory.toSummary()}\n\nReturn ONLY the JSON.`,
      }],
    };

    try {
      const res = await fetch('/proxy/anthropic', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data  = await res.json();
      const text  = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch (_) { return null; }
  }
}

// ── Component 3: Context Retrieval Engine ────────────────────────────────────

class ContextRetrievalEngine {
  constructor(sessionMemory, vectorStore) {
    this.sessionMemory = sessionMemory;
    this.vectorStore   = vectorStore;
  }

  retrieve(query, workingMemory, topK = 8) {
    // Combine semantic search + recency-weighted retrieval
    const semantic = this.vectorStore.search(query, topK);

    // Also always include the most recent N messages
    const recent = this.sessionMemory.getRecent(4).map(i => ({
      ...i,
      vec: this.vectorStore._encode(i.content),
      similarity: 0,
    }));

    // Merge (deduplicate by messageId)
    const seen = new Set();
    const merged = [...semantic, ...recent].filter(i => {
      const id = i.messageId || i.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return merged;
  }
}

// ── Component 8: Context Assembly Pipeline ───────────────────────────────────

class ContextAssemblyPipeline {
  constructor(sessionMemory, vectorStore, workingMemory) {
    this.sessionMemory   = sessionMemory;
    this.vectorStore     = vectorStore;
    this.workingMemory   = workingMemory;
    this.retrieval       = new ContextRetrievalEngine(sessionMemory, vectorStore);
  }

  // ── Main assemble method — called before every orchestrator.run()
  assemble(userQuery, modelId = '') {
    const budget = DynamicTokenBudgetManager.getBudget(modelId);

    // Step 1: Resolve vague references using working memory
    const enrichedQuery = this.workingMemory.resolveQuery(userQuery);
    const wasResolved   = enrichedQuery !== userQuery;

    // Step 2: Retrieve semantically + recently relevant interactions
    const candidates = this.retrieval.retrieve(enrichedQuery, this.workingMemory, 10);

    // Step 3: Rank candidates
    const ranked = RelevanceRankingEngine.rank(
      candidates, enrichedQuery, this.workingMemory, this.vectorStore
    );

    // Step 4: Build context block within token budget
    const pieces  = [];
    let   usedTok = 0;
    const memBudget  = budget.sections.retrievedMem;
    const histBudget = budget.sections.history;

    // 4a. Working memory state (always include — tiny)
    const wm = this.workingMemory.toSummary();
    if (wm && wm !== 'No active context') {
      pieces.push(`ACTIVE SESSION STATE:\n${wm}`);
    }

    // 4b. Latest conversation summary (if exists)
    const latestSum = this.sessionMemory.getLatestSummary();
    if (latestSum?.summary?.sessionSummary) {
      const text = `CONVERSATION SUMMARY (up to message ${latestSum.upToMessage}):\n` +
        latestSum.summary.sessionSummary;
      const tok = DynamicTokenBudgetManager.estimateTokens(text);
      if (usedTok + tok < memBudget) {
        pieces.push(text);
        usedTok += tok;
      }
    }

    // 4c. Top-K ranked context items
    for (const item of ranked.slice(0, 6)) {
      if (item.score < 0.04) continue; // skip irrelevant
      const role    = (item.metadata?.role || item.role || 'msg').toUpperCase();
      const content = (item.text || item.content || '').slice(0, 600);
      const scoreStr = `[Score ${(item.score * 100).toFixed(0)}%]`;
      const piece   = `${scoreStr} ${role}: ${content}`;
      const tok     = DynamicTokenBudgetManager.estimateTokens(piece);
      if (usedTok + tok > memBudget) break;
      pieces.push(piece);
      usedTok += tok;
    }

    // 4d. Recent raw conversation (last 5 exchanges)
    const recent = this.sessionMemory.getRecent(5)
      .map(i => `${(i.role || '').toUpperCase()}: ${(i.content || '').slice(0, 400)}`)
      .join('\n');
    const recentTok = DynamicTokenBudgetManager.estimateTokens(recent);
    const histText  = DynamicTokenBudgetManager.truncateToTokens(recent, histBudget);

    // Step 5: Assemble the final context block
    const contextBlock = [
      pieces.length > 0
        ? `╔════════ SESSION CONTEXT ════════╗\n${pieces.join('\n───\n')}\n╚════════════════════════════════╝`
        : '',
      histText
        ? `╔════════ RECENT CONVERSATION ════╗\n${histText}\n╚════════════════════════════════╝`
        : '',
    ].filter(Boolean).join('\n\n');

    return {
      enrichedQuery,
      contextBlock,
      wasResolved,
      tokenBudget:   budget,
      workingMemory: this.workingMemory.toJSON(),
      stats: {
        candidatesFound: candidates.length,
        topScore:        ranked[0]?.score || 0,
        contextTokens:   usedTok + DynamicTokenBudgetManager.estimateTokens(histText),
        budgetAvailable: budget.available,
      },
    };
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

window.DynamicTokenBudgetManager = DynamicTokenBudgetManager;
window.RelevanceRankingEngine    = RelevanceRankingEngine;
window.ConversationSummarizer    = ConversationSummarizer;
window.ContextRetrievalEngine    = ContextRetrievalEngine;
window.ContextAssemblyPipeline   = ContextAssemblyPipeline;

/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — Orchestrator
 *  ───────────────────────────────────────────────────────────────
 *  Pipeline for data-driven visualizations:
 *
 *  1. Classify intent (viz vs article search)
 *  2. If visualization + needsData:
 *       a. ToolsAgent  → fetch UP TO 50 articles (bypass display limit)
 *       b. [NEW] _extractRegionalSentiment → Claude reads each article,
 *            extracts { country, sentiment, score } per article,
 *            aggregates into { country: { pos, neu, neg, avgScore } }
 *       c. vizContext.dataPoints = real structured data
 *  3. VisualizationAgent → receives REAL data, not synthetic estimates
 *  4. CodeAgent → validates & fixes generated HTML
 * ═══════════════════════════════════════════════════════════════
 */

const CLASSIFIER_SYSTEM = `You are the intent classifier for the LensAI multi-agent system.

Classify the user's query and return ONLY valid JSON (no markdown, no explanation):
{
  "intent":        "article_search" | "visualization" | "media_intel" | "conversational",
  "chartType":     null | "bar" | "line" | "pie" | "donut" | "map" | "gauge" | "radar" | "heatmap" | "combo" | "graph" | "flowchart",
  "needsData":     true | false,
  "isComparison":  true | false,
  "competitors":   null | ["Brand1", "Brand2", ...],
  "keywords":      "Google News search topic — ONLY brand/entity + topic/intent. STRIP ALL: geography (country, region, continent, EU, ASEAN), visualization words (map, chart, display, show, interactive, choropleth). Keep: brand name + intent. Example: 'Apple brand Europe sentiment map' → 'Apple brand reputation'. 'Tesla Germany sales chart' → 'Tesla sales performance'.",
  "date_from":     "YYYY-MM-DD or null",
  "date_to":       "YYYY-MM-DD or null",
  "conversationalKey": null | "greeting" | "help" | "thanks" | "goodbye" | "fallback"
}

MEDIA INTELLIGENCE INTENT ("media_intel"):
  Use when the user wants to GENERATE Boolean search queries (not just search for articles).
  Signals: "track", "monitor", "monitoring", "coverage across", "angles", "media intelligence",
  "boolean query", "generate query", "media monitoring", "brand tracking", "news tracking",
  "media coverage", "PR monitoring", "reputation tracking".
  Examples:
    "Track Tesla EV coverage across India"                  → media_intel
    "Monitor T-Mobile and AT&T competitive activity"        → media_intel
    "Show me negative Verizon news this week"               → media_intel
    "Generate a Boolean query for Apple brand reputation"   → media_intel
    "Find cybersecurity incidents involving cloud providers" → media_intel

COMPETITOR DETECTION:
  isComparison = true when query contains: vs, versus, against, compare, comparison,
  competitor, rivalry, "vs.", or mentions 2+ distinct brand names.
  competitors = list every distinct brand/entity mentioned (resolve product → parent brand:
    iPhone/iPad/Mac/iOS → Apple, Galaxy/Note → Samsung, Android/Pixel → Google,
    Windows/Azure/Xbox → Microsoft, PS5/PlayStation → Sony).

CHART TYPE for comparisons:
  2 brands + map      → "map" (side-by-side or overlay choropleth)
  2+ brands + bar     → "bar" (grouped horizontal bar)
  2+ brands + trend   → "line" (multi-line)
  2+ brands + metrics → "radar" (multi-entity spider chart)

INTENT RULES:
  "article_search"  → user wants to find/read news articles
  "visualization"   → user wants a chart, graph, map, or visual display
  "conversational"  → greeting, thanks, help, small talk

  Ambiguous (e.g. "show Tesla news as a chart", "sentiment map of Apple in Europe"):
    intent="visualization", needsData=true, keywords="<brand/topic> <region>"

CHART TYPE:
  "trend/over time"       → line
  "compare/rank/top N"    → bar
  "share/breakdown"       → pie or donut
  "map/country/region"    → map
  "score/KPI/meter"       → gauge
  "multiple metrics"      → radar
  "correlation/matrix"    → heatmap
  "volume+trend"          → combo
  "network/relationships" → graph
  "flow/process/steps"    → flowchart

DATE RESOLUTION (today = {TODAY}):
  "last week"/"this week" → last 7 days
  "last month"            → last 30 days
  "last N days"           → last N days
  "Q1/Q2/Q3/Q4 YYYY"     → quarter dates`;

// ── Sentiment extraction system prompt ──────────────────────────────────────

const SENTIMENT_SYSTEM = `You are a media sentiment analyst specialising in geographic brand perception.

Given a list of news articles, for EACH article extract:
1. The primary geographic market/region covered (country or "Global")
2. Sentiment toward the brand/topic: positive | neutral | negative
3. Sentiment score: -1.0 (very negative) to +1.0 (very positive)
4. Key topic or reason (brief, 3-5 words)

Then aggregate by region.

Return ONLY valid JSON in this exact format:
{
  "analyzed": [
    { "index": 1, "region": "Germany", "sentiment": "positive", "score": 0.6, "topic": "iPhone sales record" },
    { "index": 2, "region": "France",  "sentiment": "negative", "score": -0.4, "topic": "antitrust fine" }
  ],
  "regions": {
    "Germany": {
      "positive": 3, "neutral": 1, "negative": 1,
      "avgScore": 0.28, "totalArticles": 5,
      "topTopics": ["iPhone sales", "App Store revenue", "MacBook launch"]
    }
  }
}

European regions to recognise: United Kingdom, France, Germany, Italy, Spain, Netherlands,
Sweden, Switzerland, Poland, Belgium, Denmark, Norway, Finland, Austria, Portugal, Ireland,
Czech Republic, Hungary, Romania, Greece, Europe (general).

If a country cannot be determined, assign "Europe (general)" for Europe-focused queries
or "Global" for worldwide queries.`;

class Orchestrator {
  constructor() {
    this.memory     = new AgentMemory();
    this._agents    = {};
    this._log       = [];
    this._listeners = {};
    this._registerDefaults();
  }

  // ── Agent registry ─────────────────────────────────────────────────────────

  _registerDefaults() {
    this.register(new VisualizationAgent({ memory: this.memory }));
    this.register(new CodeAgent({ memory: this.memory }));
    this.register(new ToolsAgent({ memory: this.memory }));
    this.register(new MediaIntelligenceAgent({ memory: this.memory }));
  }

  register(agent) {
    this._agents[agent.name] = agent;
    this.emit('agentRegistered', { agentName: agent.name, role: agent.role });
    return this;
  }

  getAgent(name)  { return this._agents[name] || null; }
  listAgents()    { return Object.values(this._agents).map(a => ({ name: a.name, role: a.role })); }

  // ── Event system ───────────────────────────────────────────────────────────

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return this;
  }

  emit(event, data = {}) {
    const payload = { source: 'orchestrator', event, ts: Date.now(), ...data };
    (this._listeners[event] || []).forEach(fn => fn(payload));
    this._monitor(payload);
  }

  _monitor(payload) {
    this._log.push(payload);
    if (this._log.length > 500) this._log.splice(0, this._log.length - 500);
    if (typeof this._onEvent === 'function') this._onEvent(payload);
  }

  getLog()   { return [...this._log]; }
  clearLog() { this._log = []; }

  // ── Step 1: Classify intent ────────────────────────────────────────────────

  async _classify(query, apiKey) {
    const today  = new Date().toISOString().slice(0, 10);
    const system = CLASSIFIER_SYSTEM.replace('{TODAY}', today);

    const lower = query.toLowerCase();

    // Media intelligence signals — check first (highest priority for monitoring requests)
    const mediaKW = ['track ', 'monitor ', 'monitoring', 'coverage across', 'angles',
      'media intelligence', 'boolean query', 'generate query', 'generate a query',
      'media monitoring', 'brand tracking', 'news tracking', 'pr monitoring',
      'reputation tracking', 'track funding', 'track coverage', 'find incidents'];
    const isMediaIntel = mediaKW.some(k => lower.includes(k));
    if (isMediaIntel) return { intent:'media_intel', chartType:null, needsData:false,
      keywords: query, date_from:null, date_to:null, conversationalKey:null };

    const vizKW  = ['chart','graph','map','visualize','visualise','plot','sentiment map',
      'trend chart','bar chart','line chart','pie chart','gauge','heatmap',
      'radar','flowchart','draw','diagram','show me a','display','perception'];
    const artKW  = ['news','articles','find','search','latest','recent','headlines',
      'reports','coverage','funding','launch','earnings','acquisition','ipo',
      'merger','expansion','partnership','deal'];

    const isViz  = vizKW.some(k => lower.includes(k));
    const isArt  = artKW.some(k => lower.includes(k)) && !isViz;
    if (isArt) return { intent:'article_search', chartType:null, needsData:false,
      keywords:null, date_from:null, date_to:null, conversationalKey:null };

    const model = window.AGENT_CONFIG?.orchestrator?.classificationModel
      || window.AGENT_CONFIG?.model || 'claude-sonnet-4-20250514';

    const tools = this.getAgent('ToolsAgent');
    const text  = await tools.callClaude(
      [{ role:'user', content:`Classify: "${query}"\n\nReturn ONLY the JSON.` }],
      { apiKey, system, model, maxTokens:300 },
    );

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { intent:'article_search', chartType:null, needsData:false,
      keywords:null, date_from:null, date_to:null, conversationalKey:null };
    return JSON.parse(match[0]);
  }

  // ── Step 2: Fetch articles (handles single brand AND multi-brand/competitor) ──
  //
  //  Single brand:  one query → one article pool
  //  Multi-brand:   one query PER brand → separate pools → tagged by brand
  //  Always overrides display limit (50 articles per brand for analysis)

  async _fetchArticlesForAnalysis(keywords, apiKey, filters, onStatus) {
    const tools       = this.getAgent('ToolsAgent');
    const dataFilters = { ...filters, maxResults: 50, sort: 'newest' };

    // Run extractSearchParams to get Boolean query + possible per-brand queries
    onStatus?.('Building optimised search queries…');
    const params = await tools.extractSearchParams(keywords, apiKey);

    this.emit('queryBuilt', {
      keywords:        params.keywords,
      perBrand:        params.keywords_per_brand,
      competitors:     params.competitors,
      isComparison:    !!(params.competitors?.length >= 2),
    });

    // ── Multi-brand / competitor flow ────────────────────────────────────────
    if (params.keywords_per_brand && Object.keys(params.keywords_per_brand).length >= 2) {
      const brands      = Object.keys(params.keywords_per_brand);
      const brandPools  = {};

      for (const brand of brands) {
        const query = params.keywords_per_brand[brand];
        onStatus?.(`Fetching articles for ${brand}…`);
        this.emit('queryGenerated', { booleanQuery: query, brand, intent: params.intent, dateFrom: params.date_from, dateTo: params.date_to });

        try {
          const raw      = await tools.fetchNews(query);
          const filtered = tools.filterArticles(raw, dataFilters);
          // Tag every article with its brand
          filtered.forEach(a => { a._brand = brand; });
          brandPools[brand] = filtered;
          this.emit('articlesFetched', { brand, count: filtered.length, query });
        } catch (err) {
          this.emit('warn', { message: `Fetch failed for ${brand}: ${err.message}` });
          brandPools[brand] = [];
        }
      }

      const totalArticles = Object.values(brandPools).reduce((s, a) => s + a.length, 0);
      onStatus?.(`Fetched ${totalArticles} articles across ${brands.length} brands (${brands.join(', ')})`);

      return {
        type:        'multi-brand',
        brandPools,
        params,
        allArticles: Object.values(brandPools).flat(),
      };
    }

    // ── Single brand / topic flow ─────────────────────────────────────────────
    onStatus?.(`Fetching articles for "${params.keywords}"…`);
    this.emit('queryGenerated', { booleanQuery: params.keywords, intent: params.intent, dateFrom: params.date_from, dateTo: params.date_to });

    const raw      = await tools.fetchNews(params.keywords || keywords);
    const filtered = tools.filterArticles(raw, dataFilters);
    this.emit('articlesFetched', { count: filtered.length, query: params.keywords });

    return { type: 'single', articles: filtered, params };
  }

  // ── Step 3: Sentiment extraction per article → aggregate by region ─────────
  //
  //  This is the KEY missing step. Without it, VisualizationAgent uses synthetic
  //  data. With it, the map shows REAL article-driven sentiment per country.

  async _extractRegionalSentiment(articles, query, apiKey, onStatus) {
    if (!articles || articles.length === 0) return null;

    onStatus?.(`Analyzing sentiment across ${articles.length} articles by region…`);
    this.emit('sentimentStart', { articleCount: articles.length });

    const tools = this.getAgent('ToolsAgent');

    // Build compact article list for Claude (title + snippet only)
    const articleList = articles.map((a, i) =>
      `${i + 1}. TITLE: ${a.title}\n   SOURCE: ${a.source}\n   DATE: ${a.pubDateISO?.slice(0, 10) || 'n/a'}\n   SNIPPET: ${(a.description || '').slice(0, 180)}`
    ).join('\n\n');

    const text = await tools.callClaude([{
      role:    'user',
      content: `Analyze these ${articles.length} news articles about "${query}":\n\n${articleList}\n\nReturn ONLY the JSON with "analyzed" and "regions" fields.`,
    }], {
      apiKey,
      system:    SENTIMENT_SYSTEM,
      maxTokens: 4000,
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      this.emit('warn', { message: 'Sentiment extraction: could not parse JSON response' });
      return null;
    }

    try {
      const result = JSON.parse(match[0]);
      const regions = result.regions || {};
      const regionCount = Object.keys(regions).length;

      this.emit('sentimentComplete', {
        articlesAnalyzed: result.analyzed?.length || 0,
        regionsFound:     regionCount,
        regions:          Object.keys(regions),
      });

      this.memory.learn({
        type:  'success',
        agent: 'SentimentExtractor',
        query: query.slice(0, 100),
      });

      return regionCount > 0 ? regions : null;

    } catch (e) {
      this.emit('warn', { message: `Sentiment parse error: ${e.message}` });
      return null;
    }
  }

  // ── Step 4: Build visualization pipeline (VizAgent → CodeAgent loop) ───────

  async _runVisualization(query, apiKey, context, onStatus) {
    const viz      = this.getAgent('VisualizationAgent');
    const code     = this.getAgent('CodeAgent');
    const maxLoops = window.AGENT_CONFIG?.orchestrator?.maxAgentLoops || 3;
    let   prevErrors = [];

    for (let loop = 1; loop <= maxLoops; loop++) {
      onStatus?.(`Generating visualization… (pass ${loop})`);
      this.emit('vizLoop', { loop, max: maxLoops });

      let html;
      try {
        html = await viz._execute(query, { ...context, apiKey, previousErrors: prevErrors });
      } catch (err) {
        this.emit('error', { stage: 'visualization', error: err.message, loop });
        if (loop === maxLoops) throw err;
        prevErrors.push(`Generation error: ${err.message}`);
        continue;
      }

      onStatus?.('Validating generated code…');
      const issues = code.quickCheck(html);

      if (issues.length > 0) {
        this.emit('codeIssues', { issues, loop });
        onStatus?.('Fixing code issues…');
        try { html = await code._execute(html, { apiKey }); }
        catch (fixErr) { this.emit('warn', { message: `Code fix failed: ${fixErr.message}` }); }

        prevErrors = issues;
        if (code.quickCheck(html).length === 0) {
          this._saveVizSuccess(query, context.chartType);
          return { type: 'chart', html, message: this._vizMessage(query, context) };
        }
        continue;
      }

      this._saveVizSuccess(query, context.chartType);
      return { type: 'chart', html, message: this._vizMessage(query, context) };
    }

    throw new Error('Visualization failed after maximum retries. Try rephrasing your request.');
  }

  _saveVizSuccess(query, chartType) {
    this.memory.learn({ type:'success', agent:'VisualizationAgent', query, chartType: chartType||'chart' });
  }

  _vizMessage(query, context) {
    const dp = context.dataPoints;
    if (dp) {
      const regionCount   = Object.keys(dp).length;
      const totalArticles = Object.values(dp).reduce((s, r) => s + (r.totalArticles || 0), 0);
      return `Visualization built from **${totalArticles} real articles** across **${regionCount} regions**.`;
    }
    if (context.articles?.length) {
      return `Visualization generated from **${context.articles.length} fetched articles** (sentiment analysis unavailable — using AI estimates).`;
    }
    return `Chart generated for: "${query}"`;
  }

  // ── Media Intelligence pipeline ────────────────────────────────────────────
  //
  //  Generates enterprise-grade Boolean queries without fetching articles.
  //  Returns structured JSON: intents, entities, 5 query variants, scores.

  async _runMediaIntel(query, apiKey, onStatus) {
    onStatus?.('Analysing monitoring intent…');
    const agent  = this.getAgent('MediaIntelligenceAgent');
    const result = await agent.run(query, { apiKey });

    this.memory.learn({
      type:      'success',
      agent:     'MediaIntelligenceAgent',
      query:     query.slice(0, 120),
      chartType: 'media_intel',
    });

    this.emit('mediaIntelComplete', {
      intents:   result.intent,
      brands:    result.entities?.brands,
      precision: result.estimated_precision_score,
      recall:    result.estimated_recall_score,
    });

    const topIntent = result.intent?.[0] || 'Media Intelligence';
    const brands    = result.entities?.brands?.join(', ') || '';

    return {
      type:    'queryintel',
      result,
      message: `Generated **${result.intent?.length || 0} intent${result.intent?.length !== 1 ? 's' : ''}** · **${Object.keys(result.entity_expansions || {}).length} entities expanded** · **5 query variants** ready` +
               (brands ? ` for ${brands}` : ''),
    };
  }

  // ── Article search pipeline ────────────────────────────────────────────────

  async _runArticleSearch(query, apiKey, filters, onStatus) {
    onStatus?.('Searching articles…');
    const tools  = this.getAgent('ToolsAgent');
    const result = await tools.run(query, { apiKey, filters });
    return { type: 'articles', articles: result.articles, message: result.message };
  }

  // ── Main entry point ───────────────────────────────────────────────────────

  async run(query, apiKey, filters = {}, { onStatus, onAgentEvent } = {}) {
    if (!query?.trim()) throw new Error('Query cannot be empty');
    if (!apiKey)        throw new Error('Anthropic API key is required');

    window._agentApiKey = apiKey;
    this._onEvent = onAgentEvent || null;

    this.emit('run', { query: query.slice(0, 100), filters });

    // ── Context Memory: assemble context for this query ───────────────────────
    //  1. Resolve vague references ("show charts" → "show Tesla charts for India 72h")
    //  2. Retrieve semantically relevant past interactions
    //  3. Build a context block to inject into agent prompts
    let assembled = null;
    let workQuery = query; // query enriched with context (may differ from raw query)
    if (window.CONTEXT_MEMORY) {
      try {
        assembled = window.CONTEXT_MEMORY.assemble(query, window.AGENT_CONFIG?.model || '');
        workQuery = assembled.enrichedQuery;
        if (assembled.wasResolved) {
          onStatus?.(`Context resolved: "${workQuery.slice(0, 80)}"`);
          this.emit('contextResolved', { original: query, resolved: workQuery });
        }
      } catch (ctxErr) {
        this.emit('warn', { message: `Context assembly failed: ${ctxErr.message}` });
      }
    }

    onStatus?.('Analyzing your request…');

    let classification;
    try {
      classification = await this._classify(workQuery, apiKey);
    } catch (err) {
      this.emit('warn', { message: `Classification failed: ${err.message} — falling back` });
      classification = { intent: 'article_search' };
    }
    this.emit('classified', { query: workQuery.slice(0, 100), ...classification });

    // Store assembled context in classification so pipelines can inject it
    classification._contextBlock  = assembled?.contextBlock  || '';
    classification._workingMemory = assembled?.workingMemory || {};

    // ── Route ──────────────────────────────────────────────────────────────

    if (classification.intent === 'media_intel') {
      return this._runMediaIntel(workQuery, apiKey, onStatus);
    }

    if (classification.intent === 'visualization') {
      const vizContext = {
        chartType:    classification.chartType,
        apiKey,
        contextBlock: classification._contextBlock,    // session context
        workingMem:   classification._workingMemory,   // active state
      };

      if (classification.needsData) {
        try {
          // ① Fetch articles — single brand or multi-brand (competitor) flow
          const fetchResult = await this._fetchArticlesForAnalysis(
            classification.keywords || query, apiKey, filters, onStatus,
          );

          if (fetchResult.type === 'multi-brand') {
            // ── Competitor / comparison path ──────────────────────────────
            const { brandPools } = fetchResult;
            const brands         = Object.keys(brandPools);
            vizContext.isBrandComparison = true;
            vizContext.competitors       = brands;
            vizContext.totalFetched      = fetchResult.allArticles.length;
            vizContext.articles          = fetchResult.allArticles;

            // Extract sentiment per brand, per region
            const brandSentiment = {};
            for (const brand of brands) {
              const pool = brandPools[brand];
              if (pool.length > 0) {
                onStatus?.(`Analyzing sentiment for ${brand} (${pool.length} articles)…`);
                const regions = await this._extractRegionalSentiment(pool, `${brand} brand`, apiKey, onStatus);
                brandSentiment[brand] = regions || {};
              } else {
                brandSentiment[brand] = {};
              }
            }
            vizContext.dataPoints = brandSentiment;
            onStatus?.(`Comparison ready: ${brands.join(' vs ')} — ${fetchResult.allArticles.length} articles analysed`);

          } else {
            // ── Single brand / topic path ─────────────────────────────────
            const articles = fetchResult.articles || [];
            vizContext.articles     = articles;
            vizContext.totalFetched = articles.length;

            if (articles.length > 0) {
              const regions = await this._extractRegionalSentiment(articles, query, apiKey, onStatus);
              if (regions) {
                vizContext.dataPoints = regions;
                onStatus?.(`Sentiment mapped: ${Object.keys(regions).length} regions from ${articles.length} articles`);
              } else {
                onStatus?.('Using AI estimates (sentiment extraction returned no structured data)');
              }
            } else {
              onStatus?.('No articles found — generating with AI estimates');
            }
          }
        } catch (err) {
          this.emit('warn', { message: `Data pipeline failed: ${err.message}` });
        }
      }

      return this._runVisualization(query, apiKey, vizContext, onStatus);
    }

    return this._runArticleSearch(workQuery, apiKey, filters, onStatus);
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  getMemoryStats()   { return this.memory.getStats(); }
  exportDebugInfo()  {
    return {
      agents:       this.listAgents(),
      memoryStats:  this.memory.getStats(),
      recentLog:    this._log.slice(-50),
      memoryExport: this.memory.exportLog(),
    };
  }
}

window.ORCHESTRATOR = new Orchestrator();

/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — ToolsAgent
 *  ───────────────────────────────────────────────────────────────
 *  Handles all I/O-bound operations: RSS fetching, web search,
 *  URL fetching, and XML parsing. Acts as the data-retrieval
 *  layer for the orchestrator.
 *
 *  Tools available:
 *    fetchNews(keywords, filters)  — fetch from enabled RSS sources
 *    fetchURL(url)                 — proxy-fetch any URL (text)
 *    extractSearchParams(query)    — NLP → keywords + date range
 *    run(prompt, context)          — multi-tool agent entry point
 * ═══════════════════════════════════════════════════════════════
 */

const TOOLS_SYSTEM = `You are ToolsAgent — search query specialist for the LensAI multi-agent system.
You think like a business analyst or PR professional who needs maximum relevant article coverage.

Convert natural language queries into OPTIMISED Google News Boolean search strings.
Return ONLY valid JSON — no markdown, no explanation:

SINGLE BRAND (default):
{
  "keywords":           "optimised Boolean search string",
  "keywords_per_brand": null,
  "competitors":        null,
  "date_from":          "YYYY-MM-DD or null",
  "date_to":            "YYYY-MM-DD or null",
  "requested_count":    null,
  "intent":             "one-line description of what the user wants"
}

MULTI-BRAND / COMPETITOR (when 2+ brands mentioned):
{
  "keywords":           "fallback combined query (brand1 OR brand2 AND topic)",
  "keywords_per_brand": {
    "Brand1": "Brand1 AND (product1 OR product2) AND (topic terms)",
    "Brand2": "Brand2 AND (product1 OR product2) AND (topic terms)"
  },
  "competitors":     ["Brand1", "Brand2"],
  "date_from":       "YYYY-MM-DD or null",
  "date_to":         "YYYY-MM-DD or null",
  "requested_count": null,
  "intent":          "Compare Brand1 vs Brand2 sentiment/reputation/performance"
}

═══════════════════════════════════════════════════════════
RULE 0 — COMPETITOR / MULTI-BRAND QUERIES [CRITICAL]
═══════════════════════════════════════════════════════════
When the user mentions 2 or more competing brands/entities:

NEVER use AND between brand names.
  WRONG: Apple AND Samsung AND brand  ← only overlap articles (both mentioned together)
  RIGHT: separate query per brand     ← full independent coverage of each

WHY: A PR analyst studying "Apple vs Samsung" needs:
  - All Apple brand articles (many will never mention Samsung)
  - All Samsung brand articles (many will never mention Apple)
  - AND/OR between brands gives only comparison articles (a small subset)

DETECTION SIGNALS — query is a competitor comparison if it has:
  vs / versus / against / compared to / compare / comparison /
  competitor / competition / rival / rivalry / battle /
  "and" between two distinct brand names / "or" between two brands

WHEN DETECTED:
  1. Populate "competitors" array with brand names found
  2. Build "keywords_per_brand" — one entry per brand, each query is
     INDEPENDENT (no reference to the other brand)
  3. Each per-brand query follows all other rules (no geography,
     brand disambiguation, topic expansion)
  4. Set "keywords" to a combined fallback (brand1 OR brand2 + topic)

EXAMPLES:
  Input:  "Apple vs Samsung brand sentiment Europe"
  Output keywords_per_brand:
    "Apple":   "Apple AND (iPhone OR Mac OR \"App Store\" OR iOS) AND (brand OR reputation OR perception OR sales)"
    "Samsung": "Samsung AND (Galaxy OR smartphone OR chip OR semiconductor) AND (brand OR reputation OR perception OR sales)"

  Input:  "Compare Coca-Cola and Pepsi brand perception"
  Output keywords_per_brand:
    "Coca-Cola": "\"Coca-Cola\" AND (drink OR beverage OR soda OR brand) AND (reputation OR perception OR marketing OR campaign)"
    "Pepsi":     "Pepsi AND (drink OR beverage OR soda OR brand) AND (reputation OR perception OR marketing OR campaign)"

  Input:  "Tesla vs BMW vs Toyota EV market"
  Output keywords_per_brand:
    "Tesla":  "Tesla AND (EV OR electric OR Model OR Cybertruck) AND (sales OR \"market share\" OR growth)"
    "BMW":    "BMW AND (electric OR EV OR iX OR i4) AND (sales OR \"market share\" OR growth)"
    "Toyota": "Toyota AND (hybrid OR EV OR electric OR Prius OR bZ4X) AND (sales OR \"market share\" OR growth)"

  Input:  "Nike vs Adidas brand trust map"
  Output keywords_per_brand:
    "Nike":   "Nike AND (shoes OR sneakers OR apparel OR sportswear) AND (brand OR trust OR reputation OR customer)"
    "Adidas": "Adidas AND (shoes OR sneakers OR apparel OR sportswear OR Yeezy) AND (brand OR trust OR reputation OR customer)"

  Input:  "iPhone vs Samsung Galaxy customer sentiment"
  → Treat as Apple vs Samsung (product names → parent brand)
  Output keywords_per_brand:
    "Apple":   "Apple AND (iPhone OR iOS) AND (customer OR review OR satisfaction OR feedback)"
    "Samsung": "Samsung AND (Galaxy OR Android) AND (customer OR review OR satisfaction OR feedback)"

═══════════════════════════════════════════════════════════
RULE 1 — NEVER PUT GEOGRAPHY IN THE BOOLEAN QUERY [CRITICAL]
═══════════════════════════════════════════════════════════
Geography (country / region / continent) is handled by the news source's
regional edition (gl=GB for UK, gl=DE for Germany, etc.).

WHY: An article saying "iPhone 15 review" on a German tech site is a valid
Apple-in-Germany article even if it never says "Germany" or "Europe".
Adding "AND Germany" would silently drop that article, reducing coverage.

ALWAYS REMOVE from keywords:
  - Country names:      Germany, France, UK, India, China, Japan, Brazil, etc.
  - Region names:       Europe, Asia, APAC, Americas, Middle East, Africa, etc.
  - Geo adjectives:     European, Asian, African, American, Western, Eastern
  - Political blocs:    EU, ASEAN, G7, G20, BRICS, NATO

ONLY KEEP:  brand/entity name + product terms + topic/intent terms + date

═══════════════════════════════════════════════════════════
RULE 2 — STRIP VISUALIZATION & UI WORDS
═══════════════════════════════════════════════════════════
Remove words that describe what to draw, not what to search:
  map, chart, graph, visualize, visualise, display, show, plot,
  sentiment map, choropleth, interactive, dashboard, heatmap,
  perception map, intelligence map, distribution, regional

═══════════════════════════════════════════════════════════
RULE 3 — BRAND DISAMBIGUATION
═══════════════════════════════════════════════════════════
Anchor brand names with product/service terms to avoid noise:
  Apple      → Apple AND (iPhone OR Mac OR iPad OR "App Store" OR iOS OR macOS)
  Google     → Google AND (Android OR Search OR Chrome OR YouTube OR "Google Cloud")
  Amazon     → Amazon AND (AWS OR Prime OR Alexa OR Kindle OR ecommerce)
  Tesla      → Tesla AND (electric OR EV OR Model OR Cybertruck OR Autopilot)
  Meta       → Meta AND (Facebook OR Instagram OR WhatsApp OR "Meta AI" OR Threads)
  Microsoft  → Microsoft AND (Windows OR Azure OR Office OR Copilot OR Teams OR Xbox)
  Samsung    → Samsung AND (Galaxy OR semiconductor OR chip OR display OR electronics)
  Sony       → Sony AND (PlayStation OR electronics OR camera OR music OR film)
  Nike       → Nike AND (shoes OR sneakers OR apparel OR sportswear OR athlete)
  LVMH       → LVMH AND (luxury OR fashion OR Louis Vuitton OR Dior OR brand)
  Tata       → "Tata Motors" OR "Tata Group" (always quote multi-word brand names)
  Reliance   → "Reliance Industries" OR Jio OR "Reliance Retail"
  Unilever   → Unilever AND (consumer OR FMCG OR brand OR product OR sustainability)

═══════════════════════════════════════════════════════════
RULE 4 — BUSINESS / PR INTENT EXPANSION
═══════════════════════════════════════════════════════════
Match the analyst's intent with news-relevant terms:

brand perception / reputation / PR
  → (brand OR reputation OR perception OR "public opinion" OR image OR trust OR PR)

sentiment / positive / negative
  → (news OR coverage OR review OR opinion OR analyst OR reaction OR response)

market / sales / performance / growth
  → (sales OR revenue OR "market share" OR growth OR profit OR earnings OR shipment)

risk / regulatory / legal / crisis
  → (fine OR lawsuit OR ban OR regulation OR antitrust OR investigation OR recall OR crisis)

launch / innovation / product
  → (launch OR release OR announcement OR unveil OR update OR "new product")

customer / user experience / satisfaction
  → (customer OR user OR review OR rating OR complaint OR satisfaction OR feedback)

competition / rivalry
  → ("market share" OR rival OR versus OR competition OR overtake OR lead)

investor / financial
  → (investor OR stock OR earnings OR analyst OR forecast OR valuation OR IPO)

═══════════════════════════════════════════════════════════
RULE 5 — BOOLEAN STRUCTURE
═══════════════════════════════════════════════════════════
  AND — separates distinct concepts (brand AND topic)
  OR  — connects synonyms within a concept (iPhone OR Mac OR iPad)
  -   — prefix for noise exclusion (-fruit -recipe -cider for Apple queries)
  ""  — quote exact multi-word phrases ("App Store", "market share")
  Max 8 tokens — longer queries hurt Google News RSS relevance

═══════════════════════════════════════════════════════════
SINGLE BRAND EXAMPLES
═══════════════════════════════════════════════════════════
Input:  "Apple brand sentiment map Europe"
Output: keywords → Apple AND (iPhone OR Mac OR "App Store" OR iOS) AND (brand OR reputation OR perception OR sales)
        keywords_per_brand → null, competitors → null

Input:  "Tesla EV sales map Germany last month"
Output: keywords → Tesla AND (EV OR electric OR Model OR delivery OR sales) AND (revenue OR growth OR shipment)
        date_from → 30 days ago, date_to → today

Input:  "Tata Motors reputation map India this week"
Output: keywords → "Tata Motors" AND (sales OR EV OR launch OR earnings OR brand OR customer)
        date_from → 7 days ago

Input:  "LVMH luxury brand trust map Middle East"
Output: keywords → LVMH AND (luxury OR fashion OR "Louis Vuitton" OR Dior) AND (brand OR trust OR reputation OR sales)

═══════════════════════════════════════════════════════════
COMPETITOR / MULTI-BRAND EXAMPLES (keywords_per_brand populated)
═══════════════════════════════════════════════════════════
Input:  "Apple vs Samsung brand sentiment Europe"
Output:
  competitors: ["Apple", "Samsung"]
  keywords_per_brand:
    Apple:   Apple AND (iPhone OR Mac OR "App Store" OR iOS) AND (brand OR reputation OR perception OR sales)
    Samsung: Samsung AND (Galaxy OR smartphone OR chip OR electronics) AND (brand OR reputation OR perception OR sales)
  keywords (fallback): (Apple OR Samsung) AND (brand OR reputation OR "market share")

Input:  "Compare Google vs Microsoft cloud market"
Output:
  competitors: ["Google", "Microsoft"]
  keywords_per_brand:
    Google:    Google AND (cloud OR GCP OR "Google Cloud" OR workspace) AND (sales OR growth OR "market share" OR revenue)
    Microsoft: Microsoft AND (Azure OR cloud OR Office OR enterprise) AND (sales OR growth OR "market share" OR revenue)

Input:  "Nike vs Adidas vs Puma brand performance"
Output:
  competitors: ["Nike", "Adidas", "Puma"]
  keywords_per_brand:
    Nike:   Nike AND (shoes OR sneakers OR apparel OR sportswear) AND (brand OR sales OR revenue OR growth)
    Adidas: Adidas AND (shoes OR sneakers OR apparel OR sportswear OR Yeezy) AND (brand OR sales OR revenue OR growth)
    Puma:   Puma AND (shoes OR sneakers OR apparel OR sportswear OR athlete) AND (brand OR sales OR revenue OR growth)

Input:  "iPhone vs Galaxy customer satisfaction"
Output:  → resolve products to parent brands
  competitors: ["Apple", "Samsung"]
  keywords_per_brand:
    Apple:   Apple AND (iPhone OR iOS) AND (customer OR review OR satisfaction OR complaint OR rating)
    Samsung: Samsung AND (Galaxy OR Android) AND (customer OR review OR satisfaction OR complaint OR rating)

═══════════════════════════════════════════════════════════
RULE 6 — REQUESTED COUNT EXTRACTION
═══════════════════════════════════════════════════════════
If the user explicitly requests a specific number of articles, extract it
into "requested_count" as an integer. Otherwise leave it null.

PATTERNS TO DETECT:
  "give me 50 articles"          → 50
  "50 articles for X"            → 50
  "get 100 results"              → 100
  "top 30 news"                  → 30
  "fetch 25 articles"            → 25
  "I need 75 results"            → 75
  "at least 40 articles"         → 40
  "show 20 results"              → 20
  "find 50 news articles"        → 50

EXAMPLES:
  Input:  "Give me 50 articles for Tata Motors news this week"
  Output: requested_count → 50, keywords → "Tata Motors" AND (sales OR EV OR launch OR earnings OR brand), date_from → 7 days ago

  Input:  "Get 100 latest Apple news"
  Output: requested_count → 100, keywords → Apple AND (iPhone OR Mac OR iPad OR iOS) AND (news OR launch OR earnings)

  Input:  "Tesla EV news"
  Output: requested_count → null  (no explicit count mentioned)

═══════════════════════════════════════════════════════════
DATE RESOLUTION (today = {TODAY})
═══════════════════════════════════════════════════════════
- "today"                   → today only
- "yesterday"               → yesterday
- "last week" / "this week" → last 7 days
- "last month"/"this month" → last 30 days
- "last N days"             → last N days
- "Q1 YYYY"                 → YYYY-01-01 to YYYY-03-31
- "Q2 YYYY"                 → YYYY-04-01 to YYYY-06-30
- "Q3 YYYY"                 → YYYY-07-01 to YYYY-09-30
- "Q4 YYYY"                 → YYYY-10-01 to YYYY-12-31
- "since January"           → current-year-01-01 to today
- "in YYYY"                 → YYYY-01-01 to YYYY-12-31
- No date mentioned         → null / null`;

class ToolsAgent extends BaseAgent {
  constructor(opts = {}) {
    super({
      name:       'ToolsAgent',
      role:       'tools',
      systemPrompt: TOOLS_SYSTEM,
      model:      opts.model      || (window.AGENT_CONFIG?.model || 'claude-sonnet-4-20250514'),
      maxTokens:  opts.maxTokens  || 600,
      maxRetries: opts.maxRetries || 3,
      memory:     opts.memory     || null,
    });
  }

  // ── extractSearchParams: NLP → { keywords, date_from, date_to, intent } ────

  async extractSearchParams(query, apiKey) {
    const today  = new Date().toISOString().slice(0, 10);
    const system = this.systemPrompt.replace('{TODAY}', today);

    // Append agent-config additional instructions if defined
    const extraRules = window.AGENT_CONFIG?.instructions || [];
    const fullSystem = extraRules.length > 0
      ? system + '\n\nAdditional rules:\n' + extraRules.map((r, i) => `${i+1}. ${r}`).join('\n')
      : system;

    const text = await this.callClaude(
      [{ role: 'user', content: `Extract search parameters from: "${query}"\n\nReturn ONLY the JSON.` }],
      { apiKey, system: fullSystem, maxTokens: 600 },
    );

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('ToolsAgent: could not parse search params from Claude response');
    const params = JSON.parse(match[0]);

    // Emit the final Boolean query so the UI can display it
    this.emit('queryGenerated', {
      booleanQuery: params.keywords,
      intent:       params.intent,
      dateFrom:     params.date_from,
      dateTo:       params.date_to,
    });

    return params;
  }

  // ── fetchURL: proxy-fetch any URL ───────────────────────────────────────────

  async fetchURL(url, { asText = true } = {}) {
    const res = await fetch(`/proxy/rss?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`ToolsAgent.fetchURL: HTTP ${res.status} for ${url}`);
    return asText ? res.text() : res.blob();
  }

  // ── parseRSS: XML text → article array ──────────────────────────────────────

  _parseRSS(xmlText) {
    const doc   = new DOMParser().parseFromString(xmlText, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));

    const extractDomain = link => {
      try { return new URL(link).hostname.replace('www.', ''); } catch { return link; }
    };

    return items.map(item => {
      const get   = tag => item.querySelector(tag)?.textContent?.trim() || '';
      const link  = get('link') || item.querySelector('guid')?.textContent?.trim() || '';
      const pub   = get('pubDate');
      return {
        title:       get('title'),
        link,
        pubDate:     pub,
        pubDateISO:  pub ? new Date(pub).toISOString() : null,
        source:      item.querySelector('source')?.textContent?.trim() || extractDomain(link),
        description: get('description').replace(/<[^>]*>/g, '').slice(0, 300),
      };
    }).filter(a => a.title && a.link);
  }

  // ── fetchNews: pull from all enabled sources + dedup ────────────────────────

  async fetchNews(keywords) {
    const sources = (window.NEWS_SOURCES || []).filter(s => s.enabled);
    if (sources.length === 0) {
      throw new Error('No news sources enabled. Enable at least one in src/sources.js');
    }

    const results = await Promise.all(
      sources.map(async s => {
        try {
          const url = s.buildUrl(keywords);
          const xml = await this.fetchURL(url);
          return this._parseRSS(xml);
        } catch (err) {
          this.emit('warn', { message: `Source "${s.name}" failed: ${err.message}` });
          return [];
        }
      })
    );

    // Merge + deduplicate by link
    const seen = new Set();
    return results.flat().filter(a => {
      if (!a.link || seen.has(a.link)) return false;
      seen.add(a.link);
      return true;
    });
  }

  // ── filterArticles: apply date/sort/limit ────────────────────────────────────

  filterArticles(articles, { dateFrom, dateTo, sort, maxResults }) {
    let out = articles.filter(a => {
      if (!a.pubDateISO) return true;
      const d = a.pubDateISO.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    });
    if (sort === 'newest') out.sort((a, b) => (b.pubDateISO || '') > (a.pubDateISO || '') ? 1 : -1);
    if (sort === 'oldest') out.sort((a, b) => (a.pubDateISO || '') > (b.pubDateISO || '') ? 1 : -1);
    return maxResults && maxResults < 9999 ? out.slice(0, maxResults) : out;
  }

  // ── Main run — orchestrator calls this for a full article search ─────────────

  async _execute(query, context = {}) {
    const apiKey  = context.apiKey;
    const filters = context.filters || {};

    this.emit('step', { message: 'Extracting search parameters…' });
    const params = await this.extractSearchParams(query, apiKey);

    const dateFrom     = params.date_from     || filters.dateFrom || null;
    const dateTo       = params.date_to       || filters.dateTo   || null;
    // Honour explicit count request (e.g. "give me 50 articles") over filter default
    const requestedCount = params.requested_count || filters.maxResults || null;

    this.emit('step', { message: `Fetching news for: "${params.keywords}"` });

    // Fetch from all enabled sources
    let raw = await this.fetchNews(params.keywords || query);

    // If user requested more articles than we got, try a broader keyword variant
    if (requestedCount && raw.length < requestedCount) {
      const broaderKeywords = (params.keywords || query)
        .replace(/AND \([^)]+\) AND \([^)]+\)/g, '')   // strip extra topic groups
        .replace(/\s{2,}/g, ' ').trim();
      if (broaderKeywords !== params.keywords) {
        this.emit('step', { message: `Trying broader query to reach ${requestedCount} articles…` });
        const broader = await this.fetchNews(broaderKeywords);
        const seen = new Set(raw.map(a => a.link));
        broader.forEach(a => { if (a.link && !seen.has(a.link)) { seen.add(a.link); raw.push(a); } });
      }
    }

    const filtered = this.filterArticles(raw, {
      dateFrom,
      dateTo,
      sort:       filters.sort || 'newest',
      maxResults: requestedCount || 9999,   // no silent cap — show everything available
    });

    const dateInfo = dateFrom || dateTo
      ? ` (${dateFrom || '…'} → ${dateTo || 'now'})`
      : '';

    const countNote = requestedCount && filtered.length < requestedCount
      ? ` (${requestedCount} requested — only ${filtered.length} available from current sources)`
      : '';

    const message = filtered.length > 0
      ? `Found **${filtered.length}** articles for "${params.keywords}"${dateInfo}${countNote}. ${params.intent || ''}`
      : `No articles found for "${params.keywords}"${dateInfo}. Try a broader query or wider date range.`;

    return { articles: filtered, params, message };
  }
}

window.ToolsAgent = ToolsAgent;

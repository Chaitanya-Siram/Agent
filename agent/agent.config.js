/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — Agent Configuration
 *  ───────────────────────────────────────────────────────────────
 *  Edit this file to control every aspect of the agent:
 *    • Identity & branding
 *    • AI model & behaviour instructions
 *    • How it responds to greetings and small-talk
 *    • Default search filters
 *    • Suggestion chips on the welcome screen
 * ═══════════════════════════════════════════════════════════════
 */

window.AGENT_CONFIG = {

  // ── Identity ────────────────────────────────────────────────────────────
  name:    "LensAI",
  tagline: "AI-powered article search",
  avatar:  "📰",          // emoji shown on the welcome screen


  // ── AI Model ────────────────────────────────────────────────────────────
  model:     "claude-sonnet-4-20250514",
  maxTokens: 600,


  // ── Agent Instructions ───────────────────────────────────────────────────
  //
  //  These rules are injected into the system prompt that Claude receives
  //  when it processes a user's search query.
  //
  //  Add, remove or reword lines to shape the agent's search behaviour.
  //  Examples of things you can add:
  //    "Always include the company's stock ticker symbol in keywords"
  //    "For sports news, include the league name (IPL, NFL, EPL)"
  //    "Prefer government and official sources for policy news"
  //
  instructions: [
    // ── Geography rule (most important — never put country/region in the query) ──
    "CRITICAL: Never include country names, region names, or geographic terms in the Boolean query. Geographic targeting is handled by the RSS source's gl= parameter. Maximum article volume requires keeping geography OUT of the search string.",

    // ── Brand & topic rules ────────────────────────────────────────────────────
    "Anchor ambiguous brand names with product terms to avoid noise (Apple → add iPhone OR Mac OR iPad; Google → add Android OR Search OR Chrome)",
    "For brand reputation or perception queries, include: (brand OR reputation OR perception OR sales OR customer OR review OR market)",
    "For financial news, include: (earnings OR revenue OR profit OR 'market share' OR growth OR analyst)",
    "For risk or regulatory queries, include: (fine OR lawsuit OR regulation OR ban OR antitrust OR investigation OR crisis)",
    "Expand important acronyms inline — 'EV' becomes 'electric vehicle EV'",
    "For tech brands, include product names and version numbers when mentioned",
    "Do not add site-specific filters (site:...) unless the user explicitly asks",
    "When Boolean NOT is needed, use the minus sign prefix format (-word) recognised by Google News",
  ],


  // ── System Prompt Base ───────────────────────────────────────────────────
  //
  //  The base instructions sent to Claude for query optimisation.
  //  AGENT_CONFIG.instructions are appended automatically below this.
  //  You can extend this prompt but keep the JSON output format intact.
  //
  systemPromptBase: `You are a news search query optimiser for an article search agent.
Today's date is {TODAY}.

Given a natural language query, extract and return ONLY a valid JSON object — no markdown, no explanation:
{"keywords": "...", "date_from": "YYYY-MM-DD or null", "date_to": "YYYY-MM-DD or null", "intent": "one-line description of what the user wants"}

KEYWORD RULES:
- Optimise for Google News search relevance
- Preserve Boolean operators: AND, OR, NOT
- Remove filler words (the, a, an, is, are, about)
- Expand acronyms when helpful

DATE RESOLUTION:
- "today"                    → today only
- "yesterday"                → yesterday only
- "last week" / "this week"  → last 7 days
- "last month"/"this month"  → last 30 days
- "last N days"              → last N days
- "Q1 YYYY"                  → YYYY-01-01 to YYYY-03-31
- "Q2 YYYY"                  → YYYY-04-01 to YYYY-06-30
- "Q3 YYYY"                  → YYYY-07-01 to YYYY-09-30
- "Q4 YYYY"                  → YYYY-10-01 to YYYY-12-31
- "since January"            → current-year-01-01 to today
- "in 2024"                  → 2024-01-01 to 2024-12-31
- No date mentioned          → date_from: null, date_to: null`,


  // ── Conversational Responses ─────────────────────────────────────────────
  //
  //  What the agent replies when the user sends a non-search message.
  //  Use {name} as a placeholder for the agent name defined above.
  //
  responses: {
    greeting:
      "Hello! I'm {name}, your article search assistant. " +
      "Ask me to find news on any topic",        // ← comma required

    howAreYou:
      "I'm doing great and ready to search!",

    thanks:
      "You're welcome!",

    goodbye:
      "Goodbye! Come back any time you need news research.",

    help:
      "I'm {name} — an AI-powered article search agent.\n\n" +
      "I understand natural language like:\n" +
      "• \"Tata Motors news this week\"\n" +
      "• \"Apple AND Samsung earnings\"\n" +
      "• \"OpenAI funding since January\"\n\n" +
      "I extract keywords, resolve date expressions, and fetch the latest articles from Google News.\n\n" +
      "Use the sidebar to filter by date range, sort order, and max results.",

    fallback:
      "I'm here to help you find news articles. " +
      "Try a query like \"Reliance expansion last 30 days\" or \"ISRO launch 2024\".",

    noApiKey:
      "Please enter your Anthropic API key in the sidebar to search for articles.",

    // clearChat response is intentionally empty — the chat resets silently.
    clearChat: "",
  },


  // ── Conversational Trigger Patterns ──────────────────────────────────────
  //
  //  Regex patterns tested against the user's lowercased input.
  //  When a pattern matches, the agent replies conversationally instead
  //  of running a news search.
  //
  //  You can add new patterns + map them to a response key above.
  //
  conversationalPatterns: {
    greeting:  /^(hi|hello|hey|howdy|hiya|helo|greetings|good\s+(morning|afternoon|evening|day))\b/,
    howAreYou: /^(how are you|how'?s it going|what'?s up|how do you do|how r u)\b/,
    thanks:    /^(thanks?|thank you|ty|cheers|appreciate( it| that)?|thx|thnx)\b/,
    goodbye:   /^(bye|goodbye|see you|see ya|cya|take care|later|gotta go)\b/,
    casual:    /^(ok(ay)?|got it|alright|sure|cool|great|nice|awesome|perfect|wow|lol|haha|noted)\b/,
    help:      /^(who are you|what are you|what can you do|what do you do|help me?|\/help|about you|your capabilities)\b/,

    // Triggers a full chat + results reset — no article search is run.
    // Add more phrases here if needed.
    clearChat: /^(clear|clear chat|clear screen|reset|reset chat|start over|new chat|restart|fresh start|\/clear)\b/,
  },


  // ── Welcome Screen ────────────────────────────────────────────────────────
  welcomeTitle:    "Article Search Agent",
  welcomeSubtitle: "Ask in natural language — find articles from Google News with AI-powered query understanding, date resolution, and Boolean logic.",


  // ── Suggestion Chips ──────────────────────────────────────────────────────
  //  Quick-start queries shown on the welcome screen.
  //  Change these to match your most common use cases.
  suggestions: [
    "Tata Motors news this week",
    "Apple AND Samsung latest",
    "OpenAI funding 2024",
    "Reliance expansion last 30 days",
  ],


  // ── Default Filter Values ─────────────────────────────────────────────────
  defaults: {
    maxResults: 9999,      // unlimited by default — UI selector controls display limit
    sort:       "newest",  // "newest" | "oldest" | "relevance"
    language:   "en-IN",
    country:    "IN",
    ceid:       "IN:en",
  },


  // ── Orchestrator & Multi-Agent Settings ───────────────────────────────────
  //
  //  Controls the behaviour of the central orchestrator and all agents.
  //
  orchestrator: {

    //  Model used for cheap intent classification (can be haiku for speed).
    //  Falls back to the main model above if left null.
    classificationModel: null,   // e.g. "claude-haiku-4-5-20251001"

    //  Maximum number of times the viz→code pipeline loops to fix errors.
    maxAgentLoops: 3,

    //  Milliseconds before an individual agent call times out.
    agentTimeout: 60000,

    //  When true, CodeAgent always does a full Claude review (not just static).
    alwaysFullCodeReview: false,
  },

  // ── Visualization Agent ────────────────────────────────────────────────────
  //
  //  Extra hints injected into every visualization request.
  //  Add domain-specific rules here (e.g. always use INR for currency).
  //
  vizHints: [
    // "Always use INR (₹) for Indian currency values",
    // "Prefer green (#1D9E75) for positive metrics, red (#E24B4A) for negative",
  ],

};

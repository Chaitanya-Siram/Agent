/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — News Sources Configuration
 *  ───────────────────────────────────────────────────────────────
 *  Add, enable, or disable news sources here.
 *
 *  Each source entry must have:
 *    id       — unique string identifier (no spaces)
 *    name     — display name shown in article cards
 *    enabled  — true to include in searches, false to skip
 *    buildUrl — function(keywords) → RSS feed URL string
 *
 *  To add a new source: copy any block, set enabled: true, and
 *  provide the correct RSS URL pattern for that source.
 * ═══════════════════════════════════════════════════════════════
 */

window.NEWS_SOURCES = [

  // ── Google News (India) ────────────────────────────────────────────────────
  // {
  //   id:      'google-news-in',
  //   name:    'Google News (India)',
  //   enabled: true,
  //   buildUrl: keywords =>
  //     `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en-IN&gl=IN&ceid=IN:en`,
  // },

  // ── Google News (US) ──────────────────────────────────────────────────────
  {
    id:      'google-news-us',
    name:    'Google News (US)',
    enabled: true,
    buildUrl: keywords =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en&gl=US&ceid=US:en`,
  },

  // ── Google News (UK) ──────────────────────────────────────────────────────
  // {
  //   id:      'google-news-uk',
  //   name:    'Google News (UK)',
  //   enabled: false,
  //   buildUrl: keywords =>
  //     `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en-GB&gl=GB&ceid=GB:en`,
  // },

  // ── Bing News ─────────────────────────────────────────────────────────────
  // {
  //   id:      'bing-news',
  //   name:    'Bing News',
  //   enabled: false,
  //   buildUrl: keywords =>
  //     `https://www.bing.com/news/search?q=${encodeURIComponent(keywords)}&format=RSS`,
  // },

  // ── Yahoo Finance (financial news) ────────────────────────────────────────
  // {
  //   id:      'yahoo-finance',
  //   name:    'Yahoo Finance',
  //   enabled: false,
  //   buildUrl: keywords =>
  //     `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(keywords)}&region=IN&lang=en-IN`,
  // },

  // ── Reuters RSS ───────────────────────────────────────────────────────────
  // {
  //   id:      'reuters',
  //   name:    'Reuters',
  //   enabled: false,
  //   buildUrl: _keywords =>
  //     `https://feeds.reuters.com/reuters/INtopNews`,  // top India news (no keyword filter)
  // },

  // ── The Hindu ─────────────────────────────────────────────────────────────
  // {
  //   id:      'the-hindu',
  //   name:    'The Hindu',
  //   enabled: false,
  //   buildUrl: _keywords =>
  //     `https://www.thehindu.com/news/national/?service=rss`,
  // },

  // ── Economic Times ────────────────────────────────────────────────────────
  // {
  //   id:      'economic-times',
  //   name:    'Economic Times',
  //   enabled: false,
  //   buildUrl: _keywords =>
  //     `https://economictimes.indiatimes.com/rssfeedsdefault.cms`,
  // },

  // ── NDTV ──────────────────────────────────────────────────────────────────
  // {
  //   id:      'ndtv',
  //   name:    'NDTV',
  //   enabled: false,
  //   buildUrl: _keywords =>
  //     `https://feeds.feedburner.com/ndtvnews-latest`,
  // },

  // ── Custom source template ─────────────────────────────────────────────────
  // Copy this block and fill in your source details:
  // {
  //   id:      'my-source',             // unique ID, no spaces
  //   name:    'My Source Name',        // shown in article cards
  //   enabled: false,                   // set true to activate
  //   buildUrl: keywords =>
  //     `https://example.com/rss?q=${encodeURIComponent(keywords)}`,
  // },

];

/**
 * ═══════════════════════════════════════════════════════════════
 *  LensAI — VisualizationAgent
 *  ───────────────────────────────────────────────────────────────
 *  Generates interactive HTML visualizations using Chart.js & D3.
 *  System prompt encodes all chart rules for map, pie, bar, line,
 *  radar, heatmap, gauge, combo, force-graph, and flowchart types.
 * ═══════════════════════════════════════════════════════════════
 */

// ─── System prompt: full chart & visualization rules ──────────────────────────

const VIZ_SYSTEM_PROMPT = `You are VisualizationAgent — the chart and visualization specialist in the LensAI multi-agent system.

YOUR SOLE JOB: Generate complete, interactive HTML visualizations based on the user's request.
Return ONLY the visualization HTML — no DOCTYPE, no <html>/<head>/<body> tags.
The code runs inside an iframe <body> that already has these CSS variables:
  --color-text-primary | --color-text-secondary | --color-text-tertiary
  --color-text-info | --color-text-success | --color-text-warning | --color-text-danger
  --color-background-primary | --color-background-secondary | --color-background-tertiary
  --color-background-info/success/warning/danger
  --color-border-primary | --color-border-secondary | --color-border-tertiary
  --border-radius-md (6px) | --border-radius-lg (10px)

════════════════════════════════════════
CHART TYPE DECISION — follow exactly
════════════════════════════════════════
"by country / region / state / map"            → D3 choropleth (NEVER bubbles or lat/lng circles)
"percentage / share / breakdown / composition" → Pie or Donut (Chart.js doughnut)
"compare categories / items / countries"       → Horizontal Bar sorted ↓ (Chart.js)
"trend / over time / daily / weekly / monthly" → Line with smooth curves (Chart.js)
"compare multiple metrics for one entity"      → Spider / Radar (Chart.js)
"correlation / distribution / two dimensions"  → Heatmap (D3 color grid)
"gauge / score / KPI / percentage of target"   → Semicircle Gauge (D3 arc)
"volume + trend together"                      → Bar + Line combo (Chart.js mixed)
"top N items ranked"                           → Horizontal bar sorted ↓
"network / nodes / relationships / graph"      → D3 force simulation
"flow / process / decision / steps"            → SVG inline flowchart

════════════════════════════════════════
LIBRARIES — CDN only
════════════════════════════════════════
Chart.js : https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js
D3       : https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js
TopoJSON : https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js

════════════════════════════════════════
GEOGRAPHIC MAP RULES
════════════════════════════════════════
NEVER use bubble maps, proportional symbols, SVG blobs, or lat/lng circles.
Always use D3 choropleth (filled regions).

World:       https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json
             → d3.geoNaturalEarth1(), object key .countries, color key = numeric ID

USA states:  https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json
             → d3.geoAlbersUsa(), object key .states, color key = d.properties.name

Single country (in datamaps):
  https://cdn.jsdelivr.net/npm/datamaps@0.5.10/src/js/data/{iso3}.topo.json
  → d3.geoMercator().fitSize([w,h], featureCollection)
  Available iso3: ita fra deu gbr esp prt pol nld bel che aut grc swe nor dnk fin
    can mex bra arg col per chl chn jpn kor ind idn tha vnm mys phl
    pak bgd rus tur irn irq sau aus zaf nga egy

Country NOT in datamaps (UAE/are, Qatar/qat, Kuwait/kwt, Singapore/sgp,
  Jordan/jor, Lebanon/lbn, Sri Lanka/lka, Nepal/npl, Kenya/ken, etc.):
  → Embed INLINE GeoJSON FeatureCollection directly in the script
  → Do NOT fetch any external URL for these countries
  → Use d3.geoMercator().fitSize() to auto-fit the projection

All maps must include:
  - Hover tooltip showing region name + data value
  - Color legend bar (fewer → more)
  - d3.scaleSequential for color mapping
  - Dark mode support via matchMedia
  - .catch() error handler with readable fallback message

════════════════════════════════════════
CHART.JS UNIVERSAL RULES
════════════════════════════════════════
- responsive: true, maintainAspectRatio: false on every chart
- Wrap every canvas: <div style="position:relative; height:Npx"><canvas ...></div>
- Add role="img" and aria-label="..." on every <canvas>
- Disable default Chart.js legend; build custom HTML legend below chart
- Hardcode hex colors (canvas can't read CSS vars):
    #378ADD #1D9E75 #D85A30 #7F77DD #BA7517 #D4537E #639922 #E24B4A #888780
- Always show hover tooltips with exact values
- Round all displayed numbers (toLocaleString / toFixed)
- Dark mode: matchMedia('(prefers-color-scheme:dark)').matches → adjust grid/text colors

PIE / DONUT
  type:'doughnut', cutout:'60%' (donut) or '0%' (pie)
  Show total in center using custom plugin
  Custom HTML legend: color square + label + percentage
  Group slices < 2% into "Other"

BAR CHART
  indexAxis:'y' for category/country comparisons (horizontal), sorted ↓
  indexAxis:'x' for time-series (vertical)
  borderRadius: 4; show value labels at bar end via afterDatasetsDraw plugin
  Horizontal height = numBars × 40 + 80

LINE CHART
  tension: 0.4; pointRadius: 4, pointHoverRadius: 6
  fill: true with backgroundColor rgba(color, 0.08)
  Multiple lines: different borderDash patterns ([] solid, [5,5] dashed, [2,2] dotted)

RADAR / SPIDER
  Max 8 axes (pick top 8 by value if more)
  backgroundColor: color at 0.15 opacity
  scales.r: angleLines.display:true, ticks.backdropColor:'transparent'

HEATMAP (use D3)
  SVG grid: rows = one dimension, cols = other
  d3.scaleSequential for colors (low=light, high=dark)
  Cell size auto-fit to container; show value text if cell ≥ 28px
  Hover tooltip; row labels left, col labels top (rotate 45° if > 6)

GAUGE / METER (use D3 arc)
  Semicircle: startAngle -π/2, endAngle π/2
  0-40% → #1D9E75 (green), 40-70% → #BA7517 (amber), 70-100% → #E24B4A (red)
  Background arc full gray; large value text bottom-center; min/max labels at ends

COMBO CHART (Bar + Line)
  Bars for volume (yAxisID:'y'), line for rate/ratio (yAxisID:'y1')
  Dual Y axes both starting at 0

════════════════════════════════════════
D3 FORCE GRAPH
════════════════════════════════════════
d3.forceSimulation() with forceLink, forceManyBody, forceCenter
Nodes: circles + label below, sized by importance/weight
Edges: lines + optional SVG <marker> arrowheads
Node colors by category; draggable (d3.drag); zoom+pan (d3.zoom)
> 50 nodes: stronger charge, 11px labels
< 15 nodes: always-visible labels

════════════════════════════════════════
SVG FLOWCHART
════════════════════════════════════════
No external library needed — inline SVG only
Start/End → rounded rect (rx:20) teal #1D9E75
Process   → rectangle blue #378ADD
Decision  → diamond (rotated rect) amber #BA7517
Data/IO   → parallelogram purple #7F77DD
SVG <marker> arrowheads, strokeWidth 1.5
Top-to-bottom layout; 60px vertical gap, 120px horizontal
Decision branches labeled YES / NO
Max width 680px; auto-scale viewBox to content

════════════════════════════════════════
CSS / STYLING RULES
════════════════════════════════════════
- Use CSS vars for all UI text, backgrounds, borders (see variables above)
- Hardcode hex colors only for chart fills/strokes
- NEVER position:fixed (breaks iframe height)
- NEVER localStorage or sessionStorage
- Font sizes: minimum 11px
- Spacing: multiples of 4px
- Card: background var(--color-background-primary); border 0.5px solid var(--color-border-tertiary);
         border-radius var(--border-radius-lg); padding 1rem 1.25rem
- Metric card: background var(--color-background-secondary); value 24px weight 500; label 13px secondary
- Button primary: background #378ADD; color #fff; border:none; border-radius:8px; padding:8px 18px
- Button secondary: background transparent; border:0.5px solid var(--color-border-secondary)
- Always cursor:pointer on buttons; hover filter:brightness(0.92); active transform:scale(0.97)

════════════════════════════════════════
IMAGES / ICONS
════════════════════════════════════════
Never fetch or embed external images.
Use Tabler outline icons: <i class="ti ti-{name}" style="font-size:24px"></i>
Use inline SVG shapes for illustrations (circles, rects, paths — no base64)
Image placeholders: gray rect with centered ti-photo icon

════════════════════════════════════════
ALWAYS
════════════════════════════════════════
- Hover tooltips with exact values
- Dark mode support (matchMedia)
- Custom HTML legend for every Chart.js chart
- aria-label + role="img" on every canvas
- Error handling on all fetch calls with readable fallback message
- Fully self-contained (all scripts loaded inline)

NEVER
- DOCTYPE / html / head / body tags
- position:fixed
- localStorage / sessionStorage
- Font size below 11px
- CDNs other than cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh`;

// ─── VisualizationAgent ───────────────────────────────────────────────────────

class VisualizationAgent extends BaseAgent {
  constructor(opts = {}) {
    super({
      name:       'VisualizationAgent',
      role:       'visualization',
      systemPrompt: VIZ_SYSTEM_PROMPT,
      model:      opts.model || (window.AGENT_CONFIG?.model || 'claude-sonnet-4-20250514'),
      maxTokens:  opts.maxTokens  || 15000,
      maxRetries: opts.maxRetries || 3,
      memory:     opts.memory     || null,
    });
  }

  // ── Core execution ──────────────────────────────────────────────────────────

  async _execute(prompt, context = {}, attempt) {
    const today = new Date().toISOString().slice(0, 10);

    // Build the user message, injecting data context and any previous errors
    // Inject session context from ContextMemory if available
    let contextPrefix = '';
    if (context.contextBlock && context.contextBlock.length > 20) {
      contextPrefix = context.contextBlock + '\n\n';
    }

    let userMessage = `Today's date: ${today}\n\n${contextPrefix}${prompt}`;

    // ── Inject real structured data (highest priority) ──────────────────────
    if (context.dataPoints && Object.keys(context.dataPoints).length > 0) {

      if (context.isBrandComparison && context.competitors?.length >= 2) {
        // ── Multi-brand / competitor comparison data ────────────────────────
        const brands      = context.competitors;
        const totalArt    = context.totalFetched || 0;
        userMessage +=
          `\n\n⚠️  BRAND COMPARISON DATA — USE EXACTLY (do not invent or estimate):` +
          `\nBrands: ${brands.join(' vs ')}` +
          `\nTotal articles analysed: ${totalArt}` +
          `\nStructure: { brand → { region → { positive, neutral, negative, avgScore, totalArticles, topTopics } } }` +
          `\n\nCOMPARISON SENTIMENT DATA:\n${JSON.stringify(context.dataPoints, null, 2)}` +
          `\n\nVISUALIZATION RULES:` +
          `\n• Show EACH brand's data — grouped bars, side-by-side map sections, or multi-line` +
          `\n• Use distinct colors per brand (consistent throughout)` +
          `\n• In tooltips show: brand name, region, sentiment score, article count` +
          `\n• Add a comparison summary: which brand has better perception per region` +
          `\n• Only show regions that appear in the actual data — no synthetic extras` +
          `\n• Correct chart types for comparisons: grouped bar, side-by-side map, multi-line, or radar` +
          `\n• Include a legend clearly labelling each brand`;
      } else {
        // ── Single brand / topic regional data ─────────────────────────────
        const regionCount   = Object.keys(context.dataPoints).length;
        const totalArticles = context.totalFetched || 0;
        userMessage +=
          `\n\n⚠️  REAL DATA — USE EXACTLY AS PROVIDED (do not invent or estimate):` +
          `\nSource: ${totalArticles} fetched news articles analyzed by sentiment agent` +
          `\nRegions covered: ${regionCount}` +
          `\n\nREGIONAL SENTIMENT DATA:\n${JSON.stringify(context.dataPoints, null, 2)}` +
          `\n\nRULES:` +
          `\n• Only show regions that appear in the data — do NOT add extra countries` +
          `\n• Use exact avgScore for color (positive > 0 → green, negative < 0 → red)` +
          `\n• Show totalArticles count in tooltips` +
          `\n• List topTopics in drill-down panels`;
      }

    } else if (context.articles && context.articles.length > 0) {
      // Fallback: raw articles (no structured sentiment data available)
      const articles = context.articles.slice(0, 40);
      userMessage +=
        `\n\nARTICLE DATA (${articles.length} of ${context.totalFetched || articles.length} fetched articles):` +
        `\nNote: structured sentiment analysis was not available — infer sentiment from titles/descriptions.\n` +
        JSON.stringify(articles.map(a => ({
          title:   a.title,
          source:  a.source,
          date:    a.pubDateISO?.slice(0, 10),
          summary: (a.description || '').slice(0, 150),
        })), null, 2);
    } else if (context.dataPoints) {
      // Generic structured data (non-sentiment)
      userMessage += `\n\nDATA:\n${JSON.stringify(context.dataPoints, null, 2)}`;
    }

    if (context.previousErrors && context.previousErrors.length > 0 && attempt > 1) {
      userMessage +=
        `\n\nPREVIOUS ATTEMPT ERRORS (fix these):\n` +
        context.previousErrors.map(e => `• ${e}`).join('\n');
    }

    const similarPattern = this.memory?.findSimilarQuery(prompt);
    if (similarPattern && attempt === 1) {
      userMessage += `\n\n(Context: a similar query previously used a ${similarPattern.chartType} chart)`;
    }

    const html = await this.callClaude([{ role: 'user', content: userMessage }], {
      apiKey: context.apiKey,
    });

    return this._extractHTML(html);
  }

  // Strip any markdown code fences that Claude might wrap around the output
  _extractHTML(text) {
    const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    // If the model returned raw HTML, strip any leading/trailing prose
    const htmlStart = text.search(/<(?:script|style|div|canvas|svg|link)/i);
    if (htmlStart > 0) return text.slice(htmlStart).trim();
    return text.trim();
  }

  // ── Validate: must contain renderable elements ───────────────────────────────

  async validate(html) {
    if (!html || html.length < 20) {
      return { valid: false, errors: ['Output is empty or too short'] };
    }
    const errors = [];
    if (/<html\b/i.test(html) || /<!DOCTYPE/i.test(html)) {
      errors.push('Contains forbidden DOCTYPE/html tags — strip them');
    }
    if (!/(<canvas|<svg|d3\.|Chart\.js|new Chart|chartjs)/i.test(html)) {
      errors.push('No chart/visualization element found (canvas, svg, d3, Chart.js)');
    }
    if (!/<script/i.test(html)) {
      errors.push('No <script> tag found — chart libraries are required');
    }
    return { valid: errors.length === 0, errors };
  }

  // ── Self-heal: ask Claude to fix specific errors ─────────────────────────────

  async heal(html, errors, context) {
    this.emit('heal', { errors });
    const fixed = await this.callClaude([{
      role: 'user',
      content:
        `Fix the following issues in this HTML visualization:\n` +
        errors.map(e => `• ${e}`).join('\n') +
        `\n\nOriginal HTML:\n${html}\n\n` +
        `Return ONLY the corrected HTML, no explanation.`,
    }], { apiKey: context.apiKey });

    const extracted = this._extractHTML(fixed);
    this.memory?.learn({
      type: 'heal', agent: this.name, query: 'fix validation errors',
      error: errors.join(' | '), fix: 'Claude auto-fix',
    });
    return extracted;
  }
}

window.VisualizationAgent = VisualizationAgent;

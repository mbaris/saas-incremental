import {
  abandonProject,
  activeProjects,
  AGENT_PLANS,
  agentPlan,
  analyseProduct,
  ARCHITECTURE_PATHS,
  availableCostCuts,
  availableProductProblems,
  availableProjects,
  BUSINESS_FOCUSES,
  businessFocus,
  chooseBusinessFocus,
  chooseCustomerTarget,
  chooseDirection,
  commitProduct,
  communicate,
  costCutQuote,
  createGame,
  CUSTOMER_SEGMENTS,
  CUSTOMER_TARGETS,
  customerTarget,
  customerValue,
  DAY,
  debtSummary,
  deferIncident,
  deserialize,
  developmentForecast,
  discoverViews,
  economics,
  engineeringStage,
  expansionBudget,
  foundCompany,
  founder,
  FOUNDERS,
  FUNDING_ROUNDS,
  fundingOffer,
  fundingSummary,
  has,
  incidentText,
  indicators,
  isClosed,
  level,
  marketingForecast,
  MONTH,
  moveQueuedProject,
  offeredProductApproaches,
  pendingIncident,
  PRODUCT_DIRECTIONS,
  productActionImpact,
  productDirection,
  productParameters,
  project,
  projectBlock,
  projectCapacityImpact,
  projectCostChanges,
  projectQuote,
  projectUnlockReason,
  publishPrices,
  pursue,
  QUEUE_LIMIT,
  queueBlock,
  queueProject,
  raiseFunding,
  reduceCapacity,
  removeQueuedProject,
  requirements,
  respond,
  responseDuration,
  resumeDevelopment,
  resumeProject,
  rollback,
  security,
  serialize,
  setAgentPlan,
  setMarketingBudget,
  solvencySummary,
  STAGES,
  startProject,
  suspendProject,
  tick,
  unlockedProjects,
  visibleMetrics,
  workRemaining,
} from './game.js';
import { createSaveStore } from './browser/storage.ts';
import { createSimulationClock } from './browser/clock.ts';
import { guardInteractions } from './browser/interaction.ts';
import { escape, money, moneyExact, num } from './browser/format.ts';
import { architecture } from './architecture.ts';

const saveStore = createSaveStore(() => localStorage, { encode: serialize, decode: deserialize });
const newCompany = () => createGame(crypto.getRandomValues(new Uint32Array(1))[0]);
let game = newCompany(),
  view = 'overview',
  filter = 'All',
  showCompleted = false,
  mapKey = '',
  diagramKey = '',
  diagramZoom = 1,
  toastTimer;
let budgetsDirty = false,
  selectedProblem = null;
const loadedSave = saveStore.load();
if (loadedSave.status === 'loaded') game = loadedSave.value;
const $ = (id) => document.getElementById(id);
const projectTime = (ticks) =>
  `${(ticks / DAY).toFixed(1)} game days · ${Math.ceil(ticks / game.speed)}s at ${game.speed}×`;
const day = () => Math.floor(game.time / DAY) + 1;
const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  server: 'M4 3h16v7H4z M4 14h16v7H4z M7 6.5h.01 M7 17.5h.01 M11 6.5h6 M11 17.5h6',
  pulse: 'M2 12h5l3-8 4 16 3-8h5',
  branch:
    'M6 6v12 M6 8c0 5 12 0 12 6 M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M16 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.87',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 12l3 3 5-6',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
  layers: 'm12 2 10 5-10 5L2 7z M2 12l10 5 10-5 M2 17l10 5 10-5',
  search: 'M21 21l-6-6 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  file: 'M14 2H4v20h16V8z M14 2v6h6 M8 12h8 M8 16h8',
  spark: 'm12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z',
  database: 'M3 6c0-5 18-5 18 0s-18 5-18 0 M3 6v12c0 5 18 5 18 0V6 M3 12c0 5 18 5 18 0',
  check: 'm5 12 4 4L19 6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  play: 'm7 4 14 8-14 8z',
  pause: 'M8 5v14 M16 5v14',
  save: 'M4 3h13l4 4v14H3V3z M7 3v6h9V3 M7 21v-8h10v8',
  arrowUp: 'm6 16 12-12 M7 4h11v11',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
};
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
}
function button(label, action, id = '', cls = 'btn', disabled = false) {
  return `<button class="${cls}" ${action === 'queue-up' ? 'aria-label="Move task earlier"' : action === 'queue-down' ? 'aria-label="Move task later"' : ''} data-action="${action}" ${id ? `data-id="${id}"` : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
}

$('app').innerHTML = `
<section id="company-setup" class="company-setup">
  <h1>Start a company</h1>
  <form id="setup-form">
    <fieldset><legend>Founder</legend><div class="founder-grid">${FOUNDERS.map((f) => `<label class="panel setup-choice"><input type="radio" name="founder" value="${f.id}" ${f.id === 'generalist' ? 'checked' : ''}><strong>${f.name}</strong><span>${f.description}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>Product direction</legend><div class="setup-directions">${PRODUCT_DIRECTIONS.map((d) => `<label class="panel setup-choice"><input type="radio" name="direction" value="${d.id}" ${d.id === 'practical' ? 'checked' : ''}><strong>${d.name}</strong><span>${d.id === 'practical' ? 'Useful features, steady retention' : d.id === 'network' ? 'Faster growth and referrals, higher churn' : d.id === 'trend' ? 'Fast initial growth, fades faster' : 'Slower growth, sticky customers and higher value'}</span></label>`).join('')}</div></fieldset>
    <div id="setup-effects" class="setup-effects"></div>
    <label class="setup-audience">Initial customers<select name="customerTarget">${CUSTOMER_TARGETS.map((t) => '<option value="' + t.id + '" ' + (t.id === 'small' ? 'selected' : '') + '>' + t.name + '</option>').join('')}</select></label>
    <div class="panel setup-capital"><label for="starting-capital">Personal capital <output id="capital-output">$25,000</output></label><input id="starting-capital" type="range" min="5000" max="500000" step="500" value="25000"><div class="slider-limits"><span>$5,000</span><span>$500,000</span></div><p id="capital-runway"></p></div>
    <button class="btn" type="submit">Start company</button>
  </form>
</section>
<aside class="sidebar">
  <a class="brand" href="#overview" data-action="nav" data-id="overview"><span class="brand-mark">${icon('layers')}</span><span>SaaS<span class="brand-light">incremental</span></span></a>
  <div class="company-switch"><span class="company-avatar">p.</span><span>Product Co.</span></div>
  <nav aria-label="Main navigation">${[
    ['overview', 'grid', 'Overview'],
    ['system', 'server', 'System'],
    ['product', 'spark', 'Product'],
    ['projects', 'layers', 'Engineering'],
    ['customers', 'users', 'Customers'],
    ['finance', 'file', 'Finance'],
    ['funding', 'branch', 'Funding'],
    ['security', 'shield', 'Security'],
  ]
    .map(
      ([id, i, label]) =>
        `<button class="nav-item ${id === 'overview' ? 'active' : ''}" data-action="nav" data-id="${id}">${icon(i)}<span>${label}</span>${id === 'projects' ? '<span class="nav-count" id="project-count"></span>' : ''}</button>`,
    )
    .join('')}</nav>
</aside>
<div class="workspace">
  <header class="topbar"><div class="breadcrumb">Product Co. <span>/</span> <strong id="breadcrumb">Overview</strong></div><div class="time-controls"><span id="day-label" class="day-label">Day 1</span><div class="speed-controls">${button(icon('pause'), 'pause', '', 'icon-btn')} ${[1, 3, 8].map((n) => button(n + '×', 'speed', String(n), 'speed-btn ' + (n === 1 ? 'selected' : ''))).join('')}</div></div></header>
  <main>
    <section class="page-heading"><h1 id="page-title">Overview</h1></section>
    <div id="company-status" role="status"></div>
    <section id="view-overview" class="view">
      <div id="incidents-panel" class="panel"><div class="panel-heading"><h2>Needs attention</h2><span id="inbox-count" class="count-badge">0</span></div><div id="inbox"></div></div>
      <div id="operating-context" class="overview-stats"></div>
      <div class="overview-dashboard">
        <div class="panel overview-service"><div class="panel-heading"><h2>Service</h2><span id="system-badge" class="pill neutral">Unmonitored</span></div>
          <div id="metrics-panel"><div id="telemetry"></div></div>
          <div id="system-map" class="system-map"></div><div id="map-legend" class="map-legend"></div>
        </div>
        <div class="overview-side"><div class="panel overview-development"><div class="panel-heading"><h2>Development</h2><span id="overview-work-count" class="pill neutral"></span></div>
          <div id="work-panel"></div>
          <div id="development-choices" class="overview-choices">${button(icon('spark') + '<span>Product features</span>' + icon('arrowUp'), 'nav', 'product', 'btn development-choice')}${button(icon('layers') + '<span>Engineering</span>' + icon('arrowUp'), 'nav', 'projects', 'btn development-choice')}</div>
        </div>
        <section class="panel overview-health"><h2>Company health</h2><div id="indicators" class="indicator-row"></div></section>
        </div>
      </div>
    </section>
    <section id="view-projects" class="view" hidden><div id="engineering-status"></div><div id="architecture-choice"></div><div id="project-work" class="inline-work"></div><div id="development-queue"></div><div class="section-heading project-toolbar"><label class="completed-toggle"><input id="show-completed" type="checkbox">Show completed projects</label><span id="completed-label" class="pill neutral"></span></div><div id="project-filters" class="filters"></div><div id="projects-list" class="project-grid catalog"></div><div id="roadmap-next"></div></section>
    <section id="view-product" class="view" hidden><div id="product-selector" class="product-selector" role="group" aria-label="Customer problems"></div><div id="product-opportunities"></div></section>
    <section id="view-system" class="view" hidden><div id="system-health"></div><div class="panel diagram-panel"><div class="diagram-toolbar"><span id="diagram-inventory"></span><div>${button('−', 'zoom', 'out', 'btn small secondary')}${button('+', 'zoom', 'in', 'btn small secondary')}${button('Fit width', 'zoom', 'fit', 'btn small secondary')}<span id="diagram-scale"></span></div></div><div id="system-canvas" class="system-canvas"></div><div class="diagram-legend"><span>Solid: requests · Dashed: jobs · Dotted: events</span><span id="diagram-visibility"></span></div></div><div id="system-components" class="panel system-components"></div></section>
    <section id="view-customers" class="view" hidden>
      <div id="customer-content"></div><div id="customer-marketing"></div><div id="business-focus"></div>
      <details id="pricing-editor" class="panel pricing-panel"><summary>Subscription prices · <span id="current-price"></span></summary><form id="pricing-form"><p>New customers pay the new price immediately. Current customers switch at their next monthly renewal.</p><div class="price-inputs"><label id="individual-price-label">New individuals / month<div class="price-input"><span>$</span><input id="individual-price" type="number" min="2" max="60" step="1" value="${game.pricing.individual}" required></div></label><label id="small-price-label">New small teams / month<div class="price-input"><span>$</span><input id="small-price" type="number" min="5" max="200" step="1" value="${game.pricing.small}" required></div></label><label id="enterprise-price-label">New larger accounts / month<div class="price-input"><span>$</span><input id="enterprise-price" type="number" min="500" max="15000" step="1" value="${game.pricing.enterprise}" required></div></label><button class="btn" type="submit">Change price</button></div><div id="price-preview" class="price-preview"></div></form></details>
      <details class="product-details"><summary>Founder and product</summary><div id="direction-content"></div></details></section>
    <section id="view-finance" class="view" hidden><div id="finance-metrics"></div><form id="budget-form" class="panel spending-budgets"><h2>Spending budgets</h2><div class="budget-sliders"><div class="budget-control"><label for="development-budget">Development budget<output id="development-budget-value"></output></label><input id="development-budget" type="range" min="0" max="3" step="1" value="1"><div class="budget-ticks">${AGENT_PLANS.map((p) => '<span>' + p.name + '</span>').join('')}</div><p id="development-budget-preview"></p></div><div class="budget-control"><label for="marketing-budget">Marketing budget<output id="marketing-budget-value"></output></label><input id="marketing-budget" type="range" min="0" max="10000" step="100" value="0"><div class="budget-ticks"><span>Off</span><span>$10,000/month</span></div><p id="marketing-preview"></p></div></div><div id="budget-forecast" class="budget-forecast"></div><div class="budget-actions"><button type="submit" class="btn">Apply budgets</button><button type="button" id="budget-discard" class="btn secondary">Discard changes</button><span id="budget-status"></span></div><div id="marketing-results" class="budget-results"></div></form><div id="finance-content"></div></section>
    <section id="view-funding" class="view" hidden><div id="funding-content"></div></section>
    <section id="view-security" class="view" hidden><div id="security-content"></div></section>
    <footer class="page-footer">${button('Start over', 'reset', '', 'text-btn small')}</footer>
  </main>
</div>
<dialog id="reset-dialog"><div class="dialog-body"><h2>Reset game?</h2><p>This deletes the current progress.</p><div class="dialog-actions">${button('Cancel', 'cancel-reset', '', 'btn secondary')}${button('Reset', 'confirm-reset', '', 'btn danger-btn')}</div></div></dialog>`;

function renderIndicators() {
  const values = indicators(game);
  const descriptions = {
    trendiness: ['Trendiness', 'spark', 'Decays over time; increased by features and redesigns.'],
    trustworthiness: ['Trustworthiness', 'users', 'Affected by incidents and response quality.'],
    value: [
      'Value for money',
      'bolt',
      'Value at current prices for the selected customer audience.',
    ],
    reliability: [
      'Recent reliability',
      'pulse',
      'Smoothed service quality; live errors and latency appear separately.',
    ],
    security: ['Security', 'shield', 'Assessed control coverage.'],
  };
  $('indicators').innerHTML = Object.entries(descriptions)
    .map(([key, [label, i, help]]) => {
      const n = values[key],
        tone = n === null ? 'unknown' : n < 45 ? 'poor' : n < 70 ? 'fair' : 'good';
      return `<div class="indicator ${tone}" title="${help}"><div>${icon(i)}<span>${label}</span><strong>${n === null ? '—' : Math.round(n)}${n === null ? '' : '<small>/100</small>'}</strong></div><div class="meter"><span style="width:${n === null ? 0 : n}%"></span></div></div>`;
    })
    .join('');
}
function graphNode(n) {
  const i = {
    client: 'users',
    application: 'server',
    function: 'bolt',
    database: 'database',
    balancer: 'branch',
    cache: 'layers',
    queue: 'layers',
    consumer: 'server',
    broker: 'branch',
    topic: 'file',
  }[n.type];
  return `<g class="map-node ${n.type}" data-node="${n.id}" transform="translate(${n.x},${n.y})"><title>${n.name}: ${n.detail}</title><rect class="node-box" width="${n.width}" height="92" rx="11"/><rect class="node-icon-bg" x="15" y="15" width="29" height="29" rx="7"/><g transform="translate(21,21) scale(.72)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[i]}"/></g><text class="node-title" x="15" y="64">${n.name}</text><text class="node-sub" x="15" y="80">${n.detail}</text></g>`;
}
function routeHealth(edge, m) {
  if (edge.kind === 'request' ? !has(game, 'endpoints') : !has(game, 'components'))
    return 'unknown';
  const backlog = m?.background?.[edge.workload]?.backlog || 0;
  const load =
    edge.workload === 'search'
      ? m.searchLoad
      : edge.workload === 'reports'
        ? m.reportLoad
        : Math.max(m.appLoad || 0, m.dbLoad || 0);
  return backlog > 120 || load > 100 || (edge.kind === 'request' && (m.error > 0.04 || m.p95 > 700))
    ? 'degraded'
    : 'healthy';
}
function diagramMarkup(graph, m, prefix = 'preview') {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const lines = graph.edges
    .map((edge, i) => {
      const a = byId.get(edge.from),
        b = byId.get(edge.to),
        x = a.x + a.width,
        y = a.y + 46,
        bx = b.x,
        by = b.y + 46;
      const bend = Math.max(55, Math.abs(bx - x) * 0.45),
        path = `M${x} ${y}C${x + bend} ${y} ${bx - bend} ${by} ${bx} ${by}`;
      const health = routeHealth(edge, m),
        duration = (health === 'degraded' ? 7 : 2.5) + (i % 4) * 0.2;
      return `<path d="${path}" class="traffic-line route-${edge.kind}" data-edge="${edge.id}" marker-end="url(#${prefix}-arrow)"/>${game.customers + game.individualCustomers > 0 || game.contract.status === 'active' ? `<circle r="4" class="request-dot ${health}"><animateMotion dur="${duration}s" repeatCount="indefinite" begin="-${i % 3}s" path="${path}"/></circle>` : ''}`;
    })
    .join('');
  const main = byId.get('app-0'),
    db = byId.get('database');
  const shared =
    game.architecturePath !== 'functions' && !has(game, 'database')
      ? `<rect x="${main.x - 15}" y="20" width="${db.x + db.width - main.x + 30}" height="135" rx="14" class="host-boundary"/><text x="${main.x}" y="35" class="host-label">ONE SHARED SERVER</text>`
      : '';
  return `<svg viewBox="0 0 ${graph.width} ${graph.height}" role="img" aria-label="${graph.nodes.map((n) => n.name).join(', ')}"><defs><pattern id="${prefix}-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#dae2db"/></pattern><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#a1b19b"/></marker></defs><rect width="${graph.width}" height="${graph.height}" fill="url(#${prefix}-dots)"/>${shared}${lines}${graph.nodes.map(graphNode).join('')}</svg>`;
}
function annotateDiagram(container, graph, m) {
  if (!m?.background) return;
  for (const n of graph.nodes) {
    const el = container.querySelector(`[data-node="${n.id}"] .node-sub`);
    if (!el) continue;
    const workload =
      n.id === 'report-queue' ? 'reports' : n.id === 'notification-queue' ? 'notifications' : null;
    const load = n.id.startsWith('app-')
      ? m.appLoad
      : n.id === 'database'
        ? m.dbLoad
        : n.id === 'search-app'
          ? m.searchLoad
          : n.id === 'report-app'
            ? m.reportLoad
            : null;
    el.textContent = workload
      ? `${Math.round(m.background[workload].backlog)} pending · ${m.background[workload].incoming.toFixed(1)}/s in`
      : load !== null
        ? `${Math.round(load)}% load`
        : n.detail;
  }
}
function renderMap(full = false) {
  const graph = architecture(game),
    m = visibleMetrics(game),
    colored = has(game, 'endpoints'),
    detail = has(game, 'components');
  const health = colored ? (m.error > 0.04 || m.p95 > 700 ? 'degraded' : 'healthy') : 'unknown';
  const key =
    game.architecturePath +
    game.functionTier +
    game.upgrades.join(',') +
    game.workerReplicas +
    (game.customers + game.individualCustomers > 0 || game.contract.status === 'active') +
    graph.edges.map((e) => routeHealth(e, m)).join(',');
  if (full) {
    if (key !== diagramKey) {
      diagramKey = key;
      $('system-canvas').innerHTML = diagramMarkup(graph, m, 'full');
    }
    annotateDiagram($('system-canvas'), graph, m);
    const svg = $('system-canvas').querySelector('svg');
    svg.style.width = graph.width * diagramZoom + 'px';
    svg.style.height = graph.height * diagramZoom + 'px';
    $('system-health').innerHTML = healthMarkup(m);
    $('diagram-scale').textContent = Math.round(diagramZoom * 100) + '%';
    $('diagram-inventory').textContent =
      `${graph.applications} applications${graph.functions ? ` · ${graph.functions} functions` : ''} · ${graph.databases} databases · ${graph.queues} queues · ${graph.consumers} consumers · ${graph.topics} topics`;
    $('diagram-visibility').textContent = detail
      ? 'Measured components'
      : colored
        ? 'Request health measured · async health unknown'
        : 'Health unmeasured';
    $('system-components').innerHTML = detail
      ? `<h2>Component metrics</h2><div class="component-grid"><div>Request processing <strong>${Math.round(m.appLoad)}% load</strong></div><div>Primary database <strong>${Math.round(m.dbLoad)}% load</strong></div>${game.architecturePath === 'functions' ? `<div>Cold-start contribution <strong>${Math.round(m.coldStart)} ms</strong></div>` : ''}${m.searchLoad !== null ? `<div>Read service <strong>${Math.round(m.searchLoad)}% load</strong></div>` : ''}${m.reportLoad !== null ? `<div>Processing service <strong>${Math.round(m.reportLoad)}% load</strong></div>` : ''}${Object.entries(
          m.background,
        )
          .filter(([, w]) => w.capacity > 0)
          .map(
            ([name, w]) =>
              `<div>${name}<strong>${Math.round(game.background[name])} pending</strong><small>${w.incoming.toFixed(1)} incoming / ${w.capacity} processed per second</small></div>`,
          )
          .join('')}</div>`
      : '<p>Component monitoring required for load and backlog metrics.</p>';
    return;
  }
  if (key !== mapKey) {
    mapKey = key;
    $('system-map').innerHTML =
      graph.nodes.length > 8
        ? `<div class="architecture-inventory"><strong>${ARCHITECTURE_PATHS.find((p) => p.id === game.architecturePath)?.name || 'Monolith'}</strong><span>${graph.applications} applications · ${graph.functions} functions · ${graph.databases} databases</span><span>${graph.queues} queues · ${graph.consumers} consumers · ${graph.topics} topics</span></div>`
        : diagramMarkup(graph, m);
  }
  annotateDiagram($('system-map'), graph, m);
  $('system-map').classList.toggle('complex-map', graph.nodes.length > 8);
  const serviceHealth = !m
    ? 'Unmonitored'
    : m.error >= 0.2
      ? 'Failing'
      : m.error > 0.04 || m.p95 > 700
        ? 'Degraded'
        : 'Healthy';
  $('system-badge').className =
    'pill ' +
    (serviceHealth === 'Healthy' ? 'green' : serviceHealth === 'Unmonitored' ? 'neutral' : 'amber');
  $('system-badge').textContent = serviceHealth;
  $('map-legend').innerHTML =
    `<span><i class="legend-dot ${health}"></i>${colored ? 'Measured route health' : m ? 'Request metrics available · route health unmeasured' : 'Monitoring not installed'}</span><span>${graph.nodes.length} components · ${graph.complexity.toFixed(2)}× engineering effort</span>`;
}
function healthMarkup(m) {
  if (!m) return '';
  const severe = m.error >= 0.2,
    poor = m.error > 0.04 || m.p95 > 700;
  return `<div class="live-health ${severe ? 'critical' : poor ? 'warning' : 'healthy'}"><strong>${severe ? 'Service failing' : poor ? 'Service degraded' : 'Service operating'} · ${(m.error * 100).toFixed(1)}% errors · ${Math.round(m.p95)} ms p95</strong><span>${m.bottleneck ? `Limiting resource: ${m.bottleneck} · ${Math.round(m.demand)} requests/s demanded / ${Math.round(m.capacity)} capacity` : 'Component monitoring reveals the limiting resource.'}</span></div>`;
}
function workMarkup() {
  const active = activeProjects(game);
  return (
    (game.response
      ? `<h3>Incident response</h3><p>Development paused · ${Math.ceil(game.response.remaining * debtSummary(game).slowdown)}s at 1× remaining</p>`
      : '') +
    (game.release
      ? `<div class="work-item"><span class="tiny-label">Deploying</span><h3>${project(game.release.id).name}</h3><p>${has(game, 'blue_green') ? 'Current environment serving traffic' : 'Service interrupted'} · ${Math.ceil(game.release.remaining * debtSummary(game).slowdown)}s at 1× remaining · ${(game.release.risk * 100).toFixed(0)}% defect risk</p><div class="progress-bar"><span style="width:${Math.max(0, 100 - (game.release.remaining / game.release.duration) * 100)}%"></span></div></div>`
      : '') +
    game.work
      .map((w) => {
        const pct = (w.progress / w.duration) * 100,
          running = active.includes(w);
        return `<div class="work-item" data-work="${w.id}"><h3>${project(w.id).name}</h3><div class="progress-heading"><span>${Math.round(pct)}% complete</span><b>${running ? projectTime(workRemaining(game, w)) + ' remaining' : isClosed(game) ? 'Company closed' : game.solvency.emergency ? 'Paused for cash recovery' : game.response ? 'Paused for incident' : w.suspended ? 'Work paused' : 'Paused by budget'}</b></div><div class="progress-bar"><span style="width:${pct}%"></span></div>${button(w.suspended ? 'Resume work' : 'Pause work', w.suspended ? 'draft-resume' : 'draft-pause', w.id, 'btn small secondary', isClosed(game))}<span title="Discards progress; spent tokens are not refunded.">${button('Abandon', 'abandon', w.id, 'text-btn', isClosed(game))}</span></div>`;
      })
      .join('') +
    (game.ready.length
      ? `<div class="work-item"><span class="tiny-label">Queued for deployment</span>${game.ready.map((id) => `<div class="ready-row" data-ready="${id}"><strong>${project(id).name}</strong><span class="pill neutral">Queued</span></div>`).join('')}<small class="footnote">${has(game, 'blue_green') ? 'Current environment serves traffic during deployment.' : 'Releases interrupt service.'} New releases may introduce defects.</small></div>`
      : '')
  );
}
function chart(history) {
  if (history.length < 2) return '<div class="chart-empty">Collecting measurements…</div>';
  const max = Math.ceil(Math.max(1000, ...history.map((x) => x.p95)) / 500) * 500;
  const y = (n) => 112 - (n / max) * 88,
    points = history
      .map((x, i) => `${54 + (i / (history.length - 1)) * 490},${y(x.p95)}`)
      .join(' ');
  const span = (history.at(-1).time - history[0].time) / DAY,
    color = history.at(-1).p95 > 700 ? '#b35138' : '#25866a';
  return `<svg class="latency-chart" viewBox="0 0 560 145" role="img" aria-label="p95 latency over ${span.toFixed(1)} game days; warning threshold 700 milliseconds"><path d="M54 24H544 M54 112H544" stroke="#d9e0d7"/><path d="M54 ${y(700)}H544" stroke="#b57535" stroke-dasharray="4 4"/><text x="2" y="28">${max} ms</text><text x="2" y="114">0 ms</text><text x="54" y="140">${span.toFixed(1)} game days ago</text><text x="480" y="140">Now</text><text x="440" y="${y(700) - 5}">700 ms</text><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/></svg>`;
}
function renderTelemetry() {
  const m = visibleMetrics(game);
  const historyOpen = $('overview-history')?.open;
  $('telemetry').innerHTML = !m
    ? `<div class="empty-telemetry"><h3>Monitoring not installed</h3>${button('Monitoring projects', 'category', 'Observability', 'btn secondary')}</div>`
    : `<div class="telemetry-stats"><div><small>p95 latency ${icon('pulse')}</small><strong>${Math.round(m.p95)}<span>ms</span></strong></div><div><small>Request rate</small><strong>${Math.round(m.demand)}<span>/s</span></strong></div><div><small>Error rate</small><strong class="${m.error > 0.02 ? 'text-danger' : ''}">${(m.error * 100).toFixed(1)}<span>%</span></strong></div></div><details id="overview-history" ${historyOpen ? 'open' : ''}><summary>Latency history</summary>${chart(game.history)}</details>${
        m.queue !== null
          ? `<div class="component-readout"><span>Request queue <b>${Math.round(m.queue)}</b></span><span>Cache hit <b>${Math.round(m.hitRate * 100)}%</b></span>${Object.entries(
              m.background,
            )
              .filter(([, w]) => w.capacity > 0)
              .toSorted((a, b) => b[1].backlog - a[1].backlog)
              .slice(0, 1)
              .map(
                ([name, w]) =>
                  `<span>${name} backlog <b>${Math.round(w.backlog)}</b> · ${w.incoming.toFixed(1)} in / ${w.capacity.toFixed(1)} out per second</span>`,
              )
              .join('')}</div>`
          : ''
      }`;
}
function incidentCard(i) {
  const repairing = game.response?.id === i.id,
    previous = game.lastRelease,
    canRollback = !!previous && !game.release;
  const duration = Math.ceil(
    (repairing ? game.response.remaining : responseDuration(game, i.type)) *
      debtSummary(game).slowdown,
  );
  const release = project(i.releaseId)?.name;
  return `<div class="incident-card"><div class="incident-top"><span class="pill red">${i.type === 'security' ? 'Security incident' : 'Release incident'}</span><small>${i.awaitingDecision ? 'Paused · choose a response' : 'Day ' + (Math.floor(i.detectAt / DAY) + 1)}</small></div><p>${release ? '<b>' + release + '</b> · ' : ''}${incidentText(game, i)}</p><div class="incident-actions"><div>${i.communicated ? '<span class="pill neutral">Customers informed</span>' : button('Inform customers', 'communicate', String(i.id), 'btn small secondary')}<small>Slows trust loss; service still needs repair.</small></div><div>${repairing ? '<span class="pill neutral">Repair in progress</span>' : button(i.awaitingDecision ? 'Repair & resume' : 'Contain & repair', 'respond', String(i.id), 'btn small', !!game.response)}<small>${(duration / DAY).toFixed(1)} game days · development pauses</small></div>${i.type === 'release' && has(game, 'version') ? `<div>${button('Roll back', 'rollback', '', 'btn small secondary', !canRollback)}<small>${previous ? `Withdraws ${project(previous.id).name}${project(previous.id).repeat ? ' to level ' + previous.previousLevel : ''}; cache becomes cold.` : 'No deployed release available to restore.'}</small></div>` : ''}</div>${i.awaitingDecision ? `<div class="incident-defer">${button(game.response ? 'Continue current repair' : 'Keep developing', 'defer-incident', String(i.id), 'btn small secondary')}<small>Resume without repairing this incident; it remains active.</small></div>` : ''}</div>`;
}
function renderInbox() {
  const incidents = game.incidents.filter((i) => i.announced);
  $('inbox-count').textContent =
    incidents.length +
    (game.notified && !incidents.length ? 1 : 0) +
    (game.backgroundNotified ? 1 : 0);
  const overload =
    game.notified && !incidents.length
      ? `<div class="incident-card"><span class="pill amber">Service degradation</span><p>${has(game, 'components') ? 'Component load is elevated. Review your current capacity and recent releases.' : has(game, 'monitoring') ? 'Latency and errors are elevated. Review recent changes and operating capacity.' : 'Customers are having trouble completing their work. Monitoring would clarify the impact.'}</p>${button('Review engineering', 'nav', 'projects', 'text-btn')}</div>`
      : '';
  const backgroundAlert = game.backgroundNotified
    ? `<div class="incident-card"><span class="pill amber">Delayed background work</span><p>${
        has(game, 'components')
          ? Object.entries(game.background)
              .filter(([, pending]) => pending > 40)
              .map(([name, pending]) => `${name}: ${Math.round(pending)} pending`)
              .join(' · ')
          : 'Customers report late reports, notifications, or usage insights.'
      }</p>${button('Review system', 'nav', 'system', 'text-btn')}</div>`
    : '';
  $('inbox').innerHTML =
    incidents.map(incidentCard).join('') +
    overload +
    backgroundAlert +
    (!incidents.length && !game.notified && !game.backgroundNotified
      ? `<div class="quiet-inbox"><h3>${has(game, 'monitoring') ? 'No active incidents' : 'No reported incidents'}</h3></div>`
      : '');
}
function renderWorkSummary() {
  const active = activeProjects(game),
    hasWork =
      game.work.length ||
      game.release ||
      game.ready.length ||
      game.workQueue.length ||
      game.response;
  $('overview-work-count').textContent = game.work.length ? active.length + ' active' : '';
  $('overview-work-count').hidden = !game.work.length;
  $('development-choices').hidden = !!hasWork || isClosed(game) || game.solvency.emergency;
  const progress = (pct) =>
    '<div class="progress-bar"><span style="width:' +
    Math.max(0, Math.min(100, pct)) +
    '%"></span></div>';
  const release = game.release;
  $('work-panel').innerHTML =
    (game.response
      ? '<div class="overview-work-row"><span class="work-phase">Incident response</span><strong>Repair in progress</strong><small>Development paused</small></div>'
      : '') +
    (release
      ? '<div class="overview-work-row"><span class="work-phase">Deploying</span><strong>' +
        escape(project(release.id).name) +
        '</strong>' +
        progress(100 - (release.remaining / release.duration) * 100) +
        '<small>' +
        projectTime(release.remaining * debtSummary(game).slowdown) +
        ' remaining</small></div>'
      : '') +
    game.work
      .map(
        (w) =>
          '<div class="overview-work-row" data-overview-work="' +
          w.id +
          '"><span class="work-phase">' +
          (game.response
            ? 'Paused for incident'
            : game.solvency.emergency
              ? 'Paused for cash recovery'
              : !active.includes(w)
                ? 'Paused'
                : project(w.id).research
                  ? 'Researching'
                  : 'Developing') +
          '</span><strong>' +
          escape(project(w.id).name) +
          '</strong>' +
          progress((w.progress / w.duration) * 100) +
          '<small>' +
          Math.round((w.progress / w.duration) * 100) +
          '%' +
          (active.includes(w) && !game.response && !game.solvency.emergency
            ? ' · ' + projectTime(workRemaining(game, w)) + ' remaining'
            : '') +
          '</small></div>',
      )
      .join('') +
    (game.workQueue.length
      ? '<div class="overview-next"><span>Next · ' +
        game.workQueue.length +
        ' queued</span><strong>' +
        escape(project(game.workQueue[0]).name) +
        '</strong></div>'
      : '') +
    (game.ready.length
      ? '<p class="overview-waiting">' + game.ready.length + ' awaiting deployment</p>'
      : '') +
    (!hasWork
      ? '<h3 class="overview-idle">' +
        (isClosed(game)
          ? 'Company closed'
          : game.solvency.emergency
            ? 'Development paused'
            : 'No active work') +
        '</h3>'
      : '') +
    (hasWork ? button('Manage work', 'nav', 'projects', 'btn secondary overview-manage') : '');
}
function impactMarks(change, base = 0) {
  if (Math.abs(change) < 0.005) return '—';
  const magnitude = base > 0 ? Math.abs(change) / base : Math.abs(change) / 50;
  return (change > 0 ? '+' : '−').repeat(magnitude >= 1 ? 3 : magnitude >= 0.4 ? 2 : 1);
}
function projectCard(p) {
  const quote = projectQuote(game, p.id);
  const costChanges = projectCostChanges(game, p.id);
  const forecastable =
    !(p.requires || []).some((id) => !has(game, id)) &&
    (p.id !== 'data_scale' || game.architecturePath === 'functions' || has(game, 'database'));
  const capacity = forecastable ? projectCapacityImpact(game, p.id) : null;
  const capacityText =
    capacity && ['Product', 'Infrastructure', 'Performance'].includes(p.category)
      ? `<div class="cost-preview capacity-preview"><strong>Estimated app load ${Math.round(capacity.before.appLoad)}% → ${Math.round(capacity.after.appLoad)}% · DB ${Math.round(capacity.before.dbLoad)}% → ${Math.round(capacity.after.dbLoad)}%</strong><small>Request capacity ${Math.round(capacity.before.capacity)} → ${Math.round(capacity.after.capacity)} /s${capacity.warmCache ? ' · warm cache' : ''}${['workers', 'jobs', 'report_service'].includes(p.id) ? ` · processing throughput ${capacity.before.background.reports.capacity.toFixed(0)} → ${capacity.after.background.reports.capacity.toFixed(0)} /s` : ''}</small></div>`
      : '';
  const complete = has(game, p.id) && !p.repeat,
    block = projectBlock(game, p),
    active =
      game.work.some((w) => w.id === p.id) ||
      game.ready.includes(p.id) ||
      game.release?.id === p.id;
  return `<article class="project-card ${complete ? 'completed' : ''}">
    <div class="project-top"><span class="project-icon category-${p.category.toLowerCase()}">${icon(p.icon)}</span><span class="category">${p.category}</span>${complete ? '<span class="completed-check" title="Completed">' + icon('check') + '</span>' : ''}</div>
    <h3>${p.name}${p.repeat && !p.migration ? ` <small class="project-level">Level ${level(game, p.id)}</small>` : ''}</h3><div class="project-effect">${icon('arrowUp')}<span>${p.benefit}</span></div><div class="tradeoff">${p.tradeoff}</div>
    ${
      !complete && forecastable
        ? '<div class="impact-tags">' +
          costChanges
            .filter((row) => row.id !== 'tech_debt')
            .map(
              (row) => '<span>' + row.label + ' ' + impactMarks(row.change, row.before) + '</span>',
            )
            .join('') +
          '</div>'
        : ''
    }
    ${!complete ? capacityText + '<div class="impact-tags"><span>Tech Debt ' + impactMarks(quote.debt - (p.effect === 'debt' ? Math.min(game.engineering.debt, p.strength) : 0), 10) + '</span></div>' : ''}
    <div class="project-footer"><div title="Base ${p.duration / DAY} days × ${quote.direction.toFixed(2)} direction × ${quote.complexity.toFixed(2)} architecture × ${quote.automation.toFixed(2)} automation × ${quote.maintenance.toFixed(2)} maintenance"><strong>${projectTime(quote.duration)}</strong><small>${quote.complexity.toFixed(2)}× system effort</small></div>${complete || active ? `<span class="pill neutral">${complete ? 'Installed' : 'In progress'}</span>` : ''}</div>
    ${!complete ? workButton(p.id) : ''}</article>`;
}
function renderProjects() {
  const projects = unlockedProjects(game),
    path = ARCHITECTURE_PATHS.find((p) => p.id === game.architecturePath),
    debt = debtSummary(game),
    stage = engineeringStage(game);
  $('engineering-status').innerHTML = game.engineering.completed
    ? `<div class="engineering-status"><strong>${STAGES[stage].name}</strong>${debt.points ? `<span>Debt <b>${debt.points.toFixed(0)}</b> · ${debt.slowdown.toFixed(2)}× work time · +${((debt.costMultiplier - 1) * 100).toFixed(1)}% overhead</span>` : ''}${debt.condition < 95 ? `<span>Operating condition <b>${debt.condition.toFixed(0)}%</b></span>` : ''}</div>`
    : '';
  const future = availableProjects(game).filter(
    (p) => !p.product && !p.research && projectUnlockReason(game, p),
  );
  $('roadmap-next').innerHTML = future.length
    ? `<details class="panel roadmap-next"><summary>${future.length} future projects · next unlock requirements</summary>${future
        .slice(0, 8)
        .map(
          (p) =>
            `<div><strong>${p.name}</strong><span>${escape(projectUnlockReason(game, p))}</span></div>`,
        )
        .join('')}</details>`
    : '';
  const schedule = developmentForecast(game);
  $('architecture-choice').innerHTML =
    `<p class="architecture-status">Running: <b>${path?.name || 'Monolith'}</b></p>`;
  $('project-count').hidden = true;
  const completed = projects.filter((p) => has(game, p.id) && !p.repeat && !p.initial).length;
  $('completed-label').textContent = `${completed} completed`;
  document.querySelector('.project-toolbar').hidden = completed === 0;
  $('show-completed').checked = showCompleted;
  $('project-work').innerHTML =
    game.work.length || game.ready.length || game.release || game.response
      ? `<div class="panel inline-work-panel">${workMarkup()}</div>`
      : '';
  const queuedReason = game.workQueue.length
    ? projectBlock(game, project(game.workQueue[0]), { ignoreQueue: true })
    : null;
  $('development-queue').innerHTML = game.workQueue.length
    ? `<div class="panel development-queue"><h2>Development queue · ${game.workQueue.length} / ${QUEUE_LIMIT}</h2><p>${game.workQueue.length === QUEUE_LIMIT ? 'Queue full. Remove a task to make room.' : queuedReason && queuedReason !== 'Agent project slots occupied' ? escape(queuedReason) : 'Starts in order when a development slot is free. No spending while waiting.'}</p>${game.workQueue.map((id, i) => `<div class="queue-row"><span><b>${i + 1}.</b> ${project(id).name}<small>${schedule.rows[id]?.finish !== null ? `Starts in ${(schedule.rows[id].start / DAY).toFixed(1)}d · development done in ${(schedule.rows[id].finish / DAY).toFixed(1)}d` : escape(schedule.rows[id]?.blocked || 'Waiting')}</small></span><div>${button('↑', 'queue-up', id, 'btn small secondary', i === 0)}${button('↓', 'queue-down', id, 'btn small secondary', i === game.workQueue.length - 1)}${button('Remove', 'queue-remove', id, 'btn small secondary')}</div></div>`).join('')}<small class="forecast-note">Estimates at current budget and conditions; excludes deployment and future incidents.</small></div>`
    : '';
  const visibleProjects = projects.filter(
      (p) =>
        (showCompleted || !has(game, p.id) || p.repeat) &&
        !game.workQueue.includes(p.id) &&
        !game.work.some((w) => w.id === p.id) &&
        !game.ready.includes(p.id) &&
        game.release?.id !== p.id,
    ),
    categories = [...new Set(visibleProjects.map((p) => p.category))];
  if (visibleProjects.length <= 4 || !categories.includes(filter)) filter = 'All';
  $('project-filters').hidden = visibleProjects.length <= 4;
  $('project-filters').innerHTML = ['All', ...categories]
    .map((f) => button(f, 'filter', f, 'filter-btn ' + (filter === f ? 'active' : '')))
    .join('');
  $('projects-list').innerHTML =
    visibleProjects
      .filter((p) => filter === 'All' || p.category === filter)
      .map(projectCard)
      .join('') || '<p class="empty-projects">No projects in this filter.</p>';
}
function renderPricePreview() {
  const target = customerTarget(game);
  $('price-preview').innerHTML =
    CUSTOMER_SEGMENTS.filter((segment) => target[segment.id] || game[segment.count] > 0)
      .map((segment) => {
        const price = Number($(segment.id === 'small' ? 'small-price' : 'individual-price').value);
        if (!Number.isFinite(price) || price < segment.minPrice || price > segment.maxPrice)
          return (
            '<span>' +
            segment.name +
            ': enter ' +
            money(segment.minPrice) +
            '–' +
            money(segment.maxPrice) +
            '</span>'
          );
        const value = customerValue(game, segment.id, price);
        return (
          '<span class="' +
          (value.interested ? 'positive' : 'text-danger') +
          '">' +
          segment.name +
          ': ' +
          money(price) +
          '/month · Value ' +
          Math.round(value.score) +
          '/100 · ' +
          (value.interested ? 'Signups allowed' : 'Signups blocked') +
          '</span>'
        );
      })
      .join('') +
    (game.revealedViews.includes('enterprise')
      ? '<span>Larger accounts: ' +
        Math.round(customerValue(game, 'enterprise', Number($('enterprise-price').value)).score) +
        '/100 value</span>'
      : '');
}
function renderProduct() {
  const recommendation = game.product.signals.find((s) => s.source !== 'After release')?.problem;
  const problems = availableProductProblems(game).toSorted(
    (a, b) => Number(b.id === recommendation) - Number(a.id === recommendation),
  );
  if (!problems.some((p) => p.id === selectedProblem))
    selectedProblem = recommendation || problems[0].id;
  const selectorScroll = $('product-selector').scrollLeft;
  $('product-selector').innerHTML = problems
    .map((p) => {
      const selected = game.product.selected[p.id],
        status = selected
          ? has(game, selected)
            ? 'Shipped'
            : game.workQueue.includes(selected)
              ? 'Queued'
              : 'Developing'
          : game.product.signals.some((s) => s.problem === p.id)
            ? 'Requested'
            : 'Unbuilt';
      return (
        '<button class="btn secondary problem-tab" data-action="product-problem" data-id="' +
        p.id +
        '" aria-pressed="' +
        (selectedProblem === p.id) +
        '"><strong>' +
        p.name +
        '</strong><span>' +
        status +
        '</span></button>'
      );
    })
    .join('');
  $('product-selector').scrollLeft = selectorScroll;
  $('product-opportunities').innerHTML = problems
    .map((problem) => {
      const analysed = game.product.analysed[problem.id],
        selected = game.product.selected[problem.id],
        shipped = selected && has(game, selected);
      const research = project('analyse_' + problem.id),
        researchBlock = projectBlock(game, research);
      const approaches = offeredProductApproaches(game, problem.id).filter(
        (a) => !selected || a.id === selected,
      );
      const researching = game.work.some((w) => w.id === research.id),
        researchQueued = game.workQueue.includes(research.id);
      const analysis = analysed
        ? 'Customer fit known'
        : researching
          ? 'Research in progress'
          : researchQueued
            ? 'Research queued'
            : researchBlock === 'Agent project slots occupied'
              ? 'Research can run after current work.'
              : researchBlock || 'Reveals customer fit and delivery estimates.';
      return `<section class="panel product-opportunity" data-problem="${problem.id}" ${selectedProblem === problem.id ? '' : 'hidden'}><h2>${problem.name}</h2><p class="product-need"><span class="info-label">Need</span>${problem.summary || problem.signal}</p>${!selected ? `<div class="product-analysis"><div><span class="info-label">${analysed ? 'Research complete' : 'Optional research'}</span><span>${analysis}</span></div>${analysed || researching || researchQueued ? '' : taskButton(icon('search') + 'Research customers <span class="button-estimate">' + (projectQuote(game, research.id).duration / DAY).toFixed(1) + 'd</span>', 'analyse-product', research.id, 'btn research-button')}</div>` : ''}<div class="product-approaches">${approaches
        .map((a) => {
          const params = productParameters(game, a.id),
            quote = projectQuote(game, a.id);
          const estimate = analysed
            ? (quote.duration / DAY).toFixed(1) + ' game days'
            : (((quote.duration / params.scope) * 0.85) / DAY).toFixed(0) +
              '–' +
              (((quote.duration / params.scope) * 1.15) / DAY).toFixed(0) +
              ' game days';
          const rating = (n) => (n >= 1.15 ? 'Strong' : n >= 0.9 ? 'Moderate' : 'Limited');
          const ready = game.ready.includes(a.id),
            deploying = game.release?.id === a.id,
            observed = shipped && game.time - game.product.shippedAt[a.id] >= 7 * DAY;
          const adoption = Math.min(
            0.95,
            ((((0.2 +
              (game.customerTarget === 'individual' ? params.individualFit : params.smallFit) *
                0.4) *
              game.reliability) /
              100) *
              game.trust) /
              100,
          );
          const refinement = project('refine_' + a.id),
            improvement = productActionImpact(game, refinement.id);
          const result = observed
            ? has(game, 'analytics')
              ? `Estimated adoption ${(adoption * 100).toFixed(0)}% · usage estimate, not causal retention`
              : `${rating(game.customerTarget === 'individual' ? params.individualFit : params.smallFit)} usefulness from customer feedback.`
            : 'Collecting feedback · seven days after release';
          return `<article class="product-approach"><h3>${a.name}</h3><p class="approach-tradeoff">${a.summary || a.tradeoff}</p>${analysed ? `<div class="product-fit">Individuals: ${rating(params.individualFit)} · Small teams: ${rating(params.smallFit)} · Enterprise: ${rating(params.enterpriseFit)}</div>` : ''}${!selected ? `<p class="product-duration">${estimate}</p>${workButton(a.id)}` : shipped ? `<p class="product-result">${result}</p><p>Refinement level ${level(game, refinement.id)} → ${level(game, refinement.id) + 1} · ${projectTime(improvement.duration)}</p><p class="product-fit">Individual value +${moneyExact(improvement.individualFairPrice)} · Small-team value +${moneyExact(improvement.fairPrice)} · larger-account value +${moneyExact(improvement.enterpriseFairPrice)}</p>${workButton(refinement.id)}` : `<p>${game.workQueue.includes(a.id) ? 'Queued for development · managed in Engineering' : ready ? 'Queued for automatic deployment' : deploying ? 'Deploying automatically' : 'In development · managed in Engineering'}</p>`}</article>`;
        })
        .join('')}</div></section>`;
    })
    .join('');
}
function renderCustomers() {
  renderDirection();
  const focus = businessFocus(game);
  const businessOpen = $('business-editor')?.open;
  $('business-focus').innerHTML =
    game.customers + game.individualCustomers >= 1 || focus.id !== 'balanced'
      ? `<details id="business-editor" class="panel business-panel" ${businessOpen ? 'open' : ''}><summary>Growth strategy: ${focus.name}</summary><div class="filters">${BUSINESS_FOCUSES.map((f) => button(f.name, 'business', f.id, 'filter-btn ' + (focus.id === f.id ? 'active' : ''))).join('')}</div><small>Change anytime. Existing contract rates stay locked until renewal.</small></details>`
      : '';
  $('business-focus').insertAdjacentHTML(
    'afterbegin',
    `<p class="strategy-summary"><b>${focus.name}</b> · ${focus.description}</p>`,
  );
  const req = requirements(game),
    met = req.filter(([, ok]) => ok).length,
    c = game.contract,
    e = economics(game);
  const offered =
    c.status === 'active'
      ? c.price
      : c.status === 'negotiating'
        ? c.quotedPrice
        : game.pricing.enterprise;
  const target = customerTarget(game);
  const segmentCards = CUSTOMER_SEGMENTS.filter(
    (segment) => target[segment.id] || game[segment.count] > 0.01,
  )
    .map((segment) => {
      const count = game[segment.count],
        value = customerValue(game, segment.id),
        revenue = segment.id === 'individual' ? e.individualRevenue : e.smallRevenue;
      return (
        '<div class="panel segment-card" data-segment="' +
        segment.id +
        '"><div class="segment-heading"><h2>' +
        segment.name +
        '</h2><span class="pill neutral">' +
        (target[segment.id] ? 'Acquiring' : 'Existing subscribers') +
        '</span></div><div class="segment-numbers"><div><strong>' +
        num(count) +
        '</strong><small>paying ' +
        (segment.id === 'individual' ? 'individuals' : 'teams') +
        '</small></div>' +
        (count
          ? '<div><strong>' +
            moneyExact(revenue / count) +
            '</strong><small>average monthly rate</small></div>'
          : '') +
        '</div><div class="customer-value"><span>New offer value <b>' +
        Math.round(value.score) +
        '/100</b></span><span>' +
        money(game.pricing[segment.id]) +
        '/month</span></div>' +
        (!value.interested
          ? '<p class="customer-gap">Signup price exceeds product value.</p>'
          : '') +
        '<div class="customer-rates"><span>Signups / day <b>+' +
        (game[segment.acquired] * DAY).toFixed(1) +
        '</b></span><span>Departures / day <b>' +
        (game[segment.departed] * DAY).toFixed(1) +
        '</b></span></div></div>'
      );
    })
    .join('');
  $('customer-content').innerHTML =
    `<div class="panel customer-audience"><h2>Acquire customers</h2><div class="filters">${CUSTOMER_TARGETS.map((t) => button(t.name, 'customer-target', t.id, 'filter-btn ' + (target.id === t.id ? 'active' : ''))).join('')}</div><p>Changes new signups. Existing subscriptions continue.</p></div><div class="customer-grid">${segmentCards}<div class="panel opportunity-card"><div class="opportunity-top"><span class="pill ${c.status === 'active' ? 'green' : 'amber'}">${c.status === 'active' ? 'Active contract' : c.status === 'negotiating' ? 'In procurement' : 'Not yet signed'}</span></div><div class="customer-brand"><div><h2>Northstar Studio</h2><p>120 people</p></div></div><div class="deal-value">${money(offered)}<small>/ month</small><span>${c.status === 'active' ? `Rate locked for ${Math.max(0, Math.ceil((c.renewalAt - game.time) / DAY))} more days` : c.status === 'negotiating' ? 'Quote locked during procurement' : '90-day term'}</span></div><div class="checklist">${req.map(([label, ok]) => `<div class="check-item ${ok ? 'met' : ''}"><span>${ok ? icon('check') : icon('circle')}</span>${label}</div>`).join('')}</div><div class="contract-footer"><span>${met} / ${req.length} requirements met</span>${c.status === 'prospect' ? button('Begin procurement', 'pursue', '', 'btn', met !== req.length) : `<span class="pill neutral">${c.status === 'active' ? 'Contract active' : `Procurement ${Math.round((c.progress / 36) * 100)}%`}</span>`}</div>${c.breach ? `<p class="text-danger">${Math.ceil((96 - c.breach) / DAY)} days to restore contract requirements.</p>` : ''}<p class="footnote">${c.status === 'active' ? `Next renewal: ${money(game.pricing.enterprise)} / month. ` : ''}Procurement: 3 days of eligibility. Adds support costs and traffic.</p></div></div>`;
  const enterpriseVisible =
    (game.revealedViews.includes('enterprise') && game.customerTarget !== 'individual') ||
    focus.id === 'enterprise' ||
    c.status !== 'prospect';
  document.querySelector('.opportunity-card').hidden = !enterpriseVisible;
  document.querySelector('.customer-grid').classList.toggle('small-only', !enterpriseVisible);
  $('pricing-editor').hidden = false;
  $('individual-price-label').hidden = !target.individual && !game.individualCustomers;
  $('small-price-label').hidden = !target.small && !game.customers;
  $('current-price').textContent = CUSTOMER_SEGMENTS.filter(
    (segment) => target[segment.id] || game[segment.count] > 0,
  )
    .map((segment) => money(game.pricing[segment.id]) + ' ' + segment.name.toLowerCase())
    .join(' · ');
  $('enterprise-price-label').hidden = !enterpriseVisible;
  renderPricePreview();
  $('customer-marketing').innerHTML =
    game.marketing.budget || game.marketing.spent
      ? `<div class="budget-link"><span>Marketing: ${money(game.marketing.budget)}/month · ${(game.marketing.lastPaid * MONTH).toFixed(1)} paid signups/month</span><small>Budget settings: Finance</small></div>`
      : '';
}
function renderBudgets() {
  if (!budgetsDirty) {
    $('development-budget').value = AGENT_PLANS.findIndex((p) => p.id === game.agentPlan);
    $('marketing-budget').value = game.marketing.budget;
  }
  const plan = AGENT_PLANS[Number($('development-budget').value)],
    marketing = Number($('marketing-budget').value);
  const preview = {
    ...game,
    agentPlan: plan.id,
    marketing: { ...game.marketing, budget: marketing },
  };
  const beforeSchedule = developmentForecast(game),
    afterSchedule = developmentForecast(preview);
  const finish = (schedule) =>
    schedule.next === null
      ? Object.values(schedule.rows).find((row) => row.blocked)?.blocked ||
        'No scheduled completion'
      : `${(schedule.next / DAY).toFixed(1)} game days`;
  const current = economics(preview),
    full = expansionBudget(preview, plan.id),
    forecast = marketingForecast(preview),
    actual = marketingForecast(game);
  $('development-budget-value').textContent = plan.name;
  $('development-budget').setAttribute('aria-valuetext', plan.name);
  $('development-budget-preview').textContent =
    `${plan.slots} project slot${plan.slots === 1 ? '' : 's'} · ${plan.speed}× base speed · ${money(plan.rate)}/active project/month. Up to ${money(plan.rate * plan.slots)}/month; idle slots are free.`;
  $('marketing-budget-value').textContent = money(marketing) + '/month';
  $('marketing-budget').setAttribute('aria-valuetext', money(marketing) + ' per month');
  $('marketing-preview').textContent = game.solvency.emergency
    ? 'Paid acquisition paused during cash recovery.'
    : `Estimated ${forecast.segments.individual.signups.toFixed(1)} individuals + ${forecast.segments.small.signups.toFixed(1)} teams / month · ${(forecast.conversion * 100).toFixed(0)}% conversion. Diminishing returns.`;
  $('budget-forecast').innerHTML =
    `<span>Next development completion <b>${finish(beforeSchedule)} → ${finish(afterSchedule)}</b></span><span>Operating cost <b>${money(economics(game).costs)} → ${money(current.costs)}/month</b></span><span>All slots busy <b>${money(full.costs)}/month · ${full.runway === null ? 'costs covered' : full.runway.toFixed(1) + ' months runway'}</b></span><small>Completion estimates include debt and coordination overhead, at current conditions. Deployments and future incidents are excluded.</small>`;

  $('budget-status').textContent = budgetsDirty ? 'Unapplied changes' : 'Current budgets';
  $('marketing-results').textContent = game.marketing.spent
    ? `Marketing spent ${moneyExact(game.marketing.spent)} · paid signups ${game.marketing.acquired.toFixed(1)} · retained ${actual.retained.toFixed(1)} · cost/signup ${actual.cac === null ? '—' : moneyExact(actual.cac)}`
    : '';
  $('budget-form')
    .querySelectorAll('input')
    .forEach((el) => (el.disabled = isClosed(game)));
  $('budget-form').querySelector('[type=submit]').disabled = isClosed(game) || !budgetsDirty;
  $('budget-discard').disabled = isClosed(game) || !budgetsDirty;
  $('budget-discard').hidden = !budgetsDirty;
}
function renderFinance() {
  renderBudgets();
  const e = economics(game),
    active = e.breakdown.filter((row) => row.amount > 0),
    inactive = e.breakdown.filter((row) => row.amount === 0);
  const f = solvencySummary(game),
    cuts = availableCostCuts(game);
  const margin = e.revenue ? (e.profit / e.revenue) * 100 : 0;
  const inactiveOpen = $('unused-costs')?.open;
  const colors = [
    '#52886c',
    '#8b9e66',
    '#b9a16e',
    '#9f8fab',
    '#6e9a9c',
    '#b38f78',
    '#789174',
    '#7b899f',
    '#a8a783',
  ];
  $('finance-metrics').innerHTML = `<div class="financials">${[
    ['CASH ON HAND', money(game.cash), '', 'cash'],
    ['MONTHLY REVENUE', money(e.revenue), '', 'revenue'],
    ['MONTHLY OPERATING COST', money(e.costs), '', 'costs'],
    ['MONTHLY NET INCOME', money(e.profit), `${margin.toFixed(1)}% operating margin`, 'profit'],
  ]
    .map(
      ([title, value, note, id]) =>
        `<div class="financial"><span class="tiny-label">${title}</span><strong id="stat-${id}">${value}</strong>${note ? `<span class="financial-note">${note}</span>` : ''}</div>`,
    )
    .join('')}</div>`;
  $('finance-content').innerHTML =
    `<div class="finance-grid"><div class="panel cost-panel"><div class="panel-heading"><h2>Monthly costs</h2><span class="pill neutral">${active.length} active categories</span></div><div class="cost-composition" aria-label="Proportional cost breakdown">${active.map((row, i) => `<span style="width:${(row.amount / e.costs) * 100}%;background:${colors[i % colors.length]}" title="${row.name}: ${moneyExact(row.amount)}"></span>`).join('')}</div><table class="cost-table"><thead><tr><th scope="col">Cost category & driver</th><th scope="col">Monthly cost</th></tr></thead><tbody>${active.map((row, i) => `<tr data-cost="${row.id}"><td><strong><i style="background:${colors[i % colors.length]}"></i>${row.name}</strong><small>${row.reason}</small></td><td>${moneyExact(row.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total operating cost</th><td>${moneyExact(e.costs)}</td></tr></tfoot></table><details id="unused-costs" ${inactiveOpen ? 'open' : ''}><summary>${inactive.length} unused cost categories · $0 charged</summary>${inactive.map((row) => `<div class="unused-cost"><span>${row.name}</span><small>${row.reason}</small><b>$0</b></div>`).join('')}</details></div>
  <div class="finance-side"><div class="panel revenue-panel"><h2>Revenue</h2><div class="revenue-row"><span>Individual subscriptions<small>${num(game.individualCustomers)} individuals at locked rates</small></span><strong>${moneyExact(e.individualRevenue)}</strong></div><div class="revenue-row"><span>Small-team subscriptions<small>${num(game.customers)} teams at locked rates</small></span><strong>${moneyExact(e.smallRevenue)}</strong></div><div class="revenue-row"><span>Larger contracts<small>${game.contract.status === 'active' ? 'Northstar · 90-day term' : 'No active contract'}</small></span><strong>${moneyExact(e.contractRevenue)}</strong></div></div><div class="panel spending-panel"><h2>Cash flow since start</h2><dl><div><dt>Revenue collected</dt><dd>${moneyExact(game.finance.earned)}</dd></div><div><dt>Operating costs paid</dt><dd>${moneyExact(game.finance.operatingPaid)}</dd></div><div><dt>Penalties paid</dt><dd>${moneyExact(game.finance.penaltiesPaid)}</dd></div></dl></div></div></div>`;
  $('finance-content').insertAdjacentHTML(
    'afterbegin',
    `<div class="panel cash-panel"><div class="cash-heading"><h2>${f.closed ? 'Company closed' : f.emergency ? 'Cash recovery' : 'Cash runway'}</h2><strong>${f.closed ? 'Run ended' : f.debt > 1e-8 ? 'Bills unpaid' : f.runway === null ? 'Operating profit covers costs' : f.runway.toFixed(1) + ' days at current income and costs'}</strong></div><dl class="cash-ledger"><div><dt>Operating bills unpaid</dt><dd>${moneyExact(game.solvency.operatingDebt)}</dd></div><div><dt>Penalties unpaid</dt><dd>${moneyExact(game.solvency.penaltyDebt)}</dd></div><div><dt>Operating costs paid</dt><dd>${moneyExact(game.finance.operatingPaid)}</dd></div></dl>${f.debt > 1e-8 && !f.closed ? `<p>${f.stage === 'grace' ? `${Math.ceil(f.restrictionIn / DAY)} days before provider limits` : f.stage === 'restricted' ? 'Provider capacity limited to 35%' : 'Provider capacity limited to 10%'} · ${Math.ceil(f.closureIn / DAY)} days before closure. Available surplus and investment automatically settle bills.</p>` : ''}${f.emergency && !f.closed ? `<p>Development, paid acquisition, and founder draw are paused. Essential operations continue. Resume after bills are paid with at least ${moneyExact(f.resumeCash)} in cash for one day of spending.</p>${button('Resume spending', 'resume-development', '', 'btn small', f.debt > 1e-8 || game.cash < f.resumeCash)}` : ''}${!f.closed ? '' : `<p>Unpaid bills persisted for 30 days. The run is frozen; saved results remain available.</p>${button('Start a new company', 'reset', '', 'btn')}`}</div>${cuts.length && !f.closed ? `<div class="panel cash-panel"><h2>Reduce infrastructure spending</h2><p>Retains data. Lower capacity can worsen reliability. Capacity can be rebuilt through Engineering.</p>${cuts.map((c) => `<div class="capacity-cut"><span>${c.name}<small>${moneyExact(costCutQuote(game, c.id))} / month reduction at current traffic</small></span>${button('Reduce', 'reduce-capacity', c.id, 'btn small secondary', game.work.some((w) => w.id === c.id) || game.release?.id === c.id)}</div>`).join('')}</div>` : ''}`,
  );
}
function renderDirection() {
  const effect = (label, multiplier) =>
    `<div><dt>${label}</dt><dd>${multiplier.toFixed(2)}×</dd></div>`;
  if (!game.direction) {
    $('direction-content').innerHTML =
      `<h2 class="direction-title">Choose product direction</h2><p class="direction-note">Fixed for this company. Customers start arriving after selection.</p><div class="direction-grid">${PRODUCT_DIRECTIONS.map((d) => `<article class="panel direction-card"><h3>${d.name}</h3><dl>${effect('Acquisition', d.acquisition)}${effect('Churn', d.churn)}${effect('Customer value', d.value)}${effect('Trend decay', d.trendDecay)}${effect('Feature time', d.development)}${effect('App workload', d.workload)}</dl>${d.spread ? '<p>Customer referrals: up to 1.5× additional acquisition.</p>' : d.id === 'trend' ? '<p>Starts with +15 trendiness.</p>' : ''}${button('Choose', 'direction', d.id, 'btn')}</article>`).join('')}</div>`;
  } else {
    const d = productDirection(game);
    $('direction-content').innerHTML =
      `<div class="direction-summary"><strong>${founder(game).name} · ${d.name}</strong><span>Combined acquisition ${(d.acquisition * founder(game).acquisition).toFixed(2)}× · feature speed ${(founder(game).development / d.development).toFixed(2)}× · churn ${d.churn}× · customer value ${d.value}×</span></div>`;
  }
}
function renderSecurity() {
  const sec = security(game);
  const renewal = developmentForecast(game, 'certification').rows.certification,
    renewalDays = renewal?.finish === null ? null : renewal?.finish / DAY;
  const expiryDays = (game.certifiedUntil - game.time) / DAY,
    renewalBlocked = renewal?.blocked;
  const renewalText = renewalBlocked
    ? `Renewal blocked: ${renewalBlocked}`
    : `Renewal development: ${(projectQuote(game, 'certification').duration / DAY).toFixed(1)}d · finishes in ${renewalDays.toFixed(1)}d after current work${game.workQueue.length === QUEUE_LIMIT && !game.workQueue.includes('certification') ? ' · queue full; remove work to schedule' : ''}`;
  $('security-content').innerHTML =
    `<div class="security-intro panel"><h2>Security assessment</h2><div class="security-score"><strong>${sec.score ?? '—'}</strong><span>${sec.confidence}${game.reviewAt !== null ? ' · assessed Day ' + (Math.floor(game.reviewAt / DAY) + 1) : ''}</span></div></div><div class="security-summary"><div class="panel"><h3>Certification</h3><p>${game.certifiedUntil > game.time ? `Active · ${Math.ceil((game.certifiedUntil - game.time) / DAY)} days until renewal` : 'Not certified'}</p><p class="${expiryDays > 0 && (renewalDays === null || renewalDays > expiryDays) ? 'text-danger' : ''}">${renewalText}${expiryDays > 0 && renewalDays !== null && renewalDays > expiryDays ? ' · misses expiry at this budget/order' : ''}</p></div><div class="panel"><h3>Data impact</h3><p>${game.totals.stolenRecords} records exposed · ${game.totals.lostRecords} permanently lost</p></div></div><div class="panel security-controls"><div class="panel-heading"><h2>Controls</h2>${button('Security projects', 'category', 'Security', 'btn secondary')}</div>${[
      ['access', 'Access protection', 'Reduces unauthorized access.'],
      ['audit', 'Audit history', 'Reduces detection delay.'],
      ['backup', 'Tested backups', 'Reduces permanent loss; cannot reverse theft.'],
      [
        'review',
        'Security review',
        'Assessment reveals gaps; remediation work improves protection.',
      ],
    ]
      .map(
        ([id, title, note]) =>
          `<div class="control-row"><span class="event-icon ${has(game, id) ? 'good' : 'warning'}">${icon(has(game, id) ? 'check' : 'shield')}</span><div><strong>${title}</strong><p>${note}</p></div><span class="pill ${has(game, id) ? 'green' : 'amber'}">${has(game, id) ? 'Installed' : 'Missing'}</span></div>`,
      )
      .join('')}</div>`;
}
function renderFunding() {
  const f = game.funding,
    summary = fundingSummary(game),
    next = fundingOffer(game);
  const budget = expansionBudget(game, game.agentPlan);
  const percent = (n) => (n * 100).toFixed(1) + '%';
  const current = f.rounds.filter((r) => r.status === 'pending');
  $('funding-content').innerHTML = `<div class="funding-stats">${[
    ['Founder ownership', percent(summary.ownership), ''],
    ['Monthly net income', money(economics(game).profit), 'At current spending'],
    ['Company valuation', money(summary.valuation), 'Game estimate'],
    [
      'Runway',
      summary.runway === null ? 'Self-sustaining' : summary.runway.toFixed(1) + ' months',
      'At current operating cash flow',
    ],
  ]
    .map(
      ([label, value, note]) =>
        `<div class="panel funding-stat"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`,
    )
    .join('')}</div>
  <div class="funding-grid"><div class="panel funding-offer"><div class="panel-heading"><h2>${next ? next.name + ' offer' : 'Funding complete'}</h2>${next ? `<span class="pill ${next.eligible ? 'green' : 'neutral'}">${next.eligible ? 'Available' : 'Requirements unmet'}</span>` : ''}</div>${
    next
      ? `
    <dl class="funding-terms"><div><dt>Investment</dt><dd>${money(next.investment)}</dd></div><div><dt>Pre-money valuation</dt><dd>${money(next.preMoney)}</dd></div><div><dt>Post-money valuation</dt><dd>${money(next.postMoney)}</dd></div><div><dt>Equity issued</dt><dd>${percent(next.dilution)}</dd></div><div><dt>Your ownership after round</dt><dd>${percent(next.founderOwnership)}</dd></div><div><dt>Investor revenue target</dt><dd>${money(next.targetRevenue)} / month in ${next.targetDays} days</dd></div></dl>
    <div class="funding-requirements">${next.checks.map(([label, ok]) => `<div class="check-item ${ok ? 'met' : ''}"><span>${icon(ok ? 'check' : 'circle')}</span>${label}</div>`).join('')}</div>
    <div class="funding-action">${button('Raise ' + money(next.investment), 'raise', next.id, 'btn', !next.eligible)}<span>All existing shareholders are diluted proportionally.</span></div>`
      : '<p>No further rounds available.</p>'
  }</div>
  <div class="funding-side"><div class="panel ownership-panel"><h2>Ownership</h2><div class="ownership-bar" role="img" aria-label="${f.shareholders.map((h) => h.name + ' ' + percent(h.ownership)).join(', ')}">${f.shareholders.map((h, i) => `<span style="width:${h.ownership * 100}%;background:${['#52886c', '#b9a16e', '#9f8fab', '#6e9a9c', '#b38f78'][i]}"></span>`).join('')}</div>${f.shareholders.map((h) => `<div class="ownership-row"><span>${h.name}</span><strong>${percent(h.ownership)}</strong></div>`).join('')}<dl class="funding-totals"><div><dt>Founder capital</dt><dd>${money(f.founderCapital)}</dd></div><div><dt>Investment raised</dt><dd>${money(f.raised)}</dd></div><div><dt>Investor confidence</dt><dd>${f.confidence} / 100</dd></div></dl><p class="footnote">Missed revenue targets reduce future offer valuations. Funding is optional.</p></div>
  <div class="panel investor-panel"><h2>Investor targets</h2>${current.length ? current.map((r) => `<div class="investor-target"><strong>${FUNDING_ROUNDS.find((round) => round.id === r.id).name}</strong><span>${money(economics(game).revenue)} / ${money(r.targetRevenue)} monthly revenue</span><small>${Math.max(0, Math.ceil((r.deadline - game.time) / DAY))} days remaining</small></div>`).join('') : '<p>No pending targets.</p>'}</div></div></div>
  ${f.rounds.length ? `<div class="panel funding-history"><h2>Closed rounds</h2><table class="cost-table"><thead><tr><th>Round</th><th>Raised</th><th>Pre-money</th><th>Equity at issue</th><th>Target</th></tr></thead><tbody>${f.rounds.map((r) => `<tr><td>${FUNDING_ROUNDS.find((round) => round.id === r.id).name}</td><td>${money(r.investment)}</td><td>${money(r.preMoney)}</td><td>${percent(r.dilution)}</td><td>${r.status === 'pending' ? 'Pending' : r.status === 'met' ? 'Met' : 'Missed'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  $('funding-content').insertAdjacentHTML(
    'afterbegin',
    `<div class="panel expansion-panel"><h2>Development runway</h2><p>${budget.plan.name}: ${budget.plan.slots} active project${budget.plan.slots === 1 ? '' : 's'} · ${money(budget.costs)} total operating cost / month · ${money(budget.burn)} monthly burn at current revenue.</p><p><strong>${budget.runway === null ? 'Revenue covers this budget' : `${budget.runway.toFixed(1)} months of cash${next ? ` → ${budget.withInvestment.toFixed(1)} months after ${next.name}` : ''}`}</strong>${budget.investmentMonths !== null ? ` · investment adds ${budget.investmentMonths.toFixed(1)} months` : ''}</p><small>Assumes all selected slots stay active, with today's customers and growth strategy. Idle slots cost nothing; future revenue, incidents, and upgrades will change runway.</small></div>`,
  );
}
function taskButton(label, action, id, cls = 'btn work-button') {
  const p = project(id),
    block = projectBlock(game, p);
  const waiting =
    block === 'Agent project slots occupied' || block === 'Six retained drafts already exist';
  const reason = waiting ? queueBlock(game, id) : block;
  return (
    button(
      waiting
        ? 'Queue ' + (p.research ? 'research' : p.refinementOf ? 'refinement' : 'work')
        : label,
      waiting ? 'queue-work' : action,
      !waiting && p.research ? p.problem : id,
      cls,
      !!reason,
    ) +
    (reason && reason !== 'Development queue full'
      ? '<small class="action-reason">' + escape(reason) + '</small>'
      : '')
  );
}
function workButton(id) {
  const p = project(id),
    active =
      game.work.some((w) => w.id === id) || game.ready.includes(id) || game.release?.id === id;
  if (game.workQueue.includes(id))
    return (
      '<p class="work-status">Queue position ' +
      (game.workQueue.indexOf(id) + 1) +
      ' · managed in Engineering</p>'
    );
  if (active)
    return (
      '<p class="work-status">' +
      (game.release?.id === id
        ? 'Deploying'
        : game.ready.includes(id)
          ? 'Queued for deployment'
          : 'In development') +
      ' · managed in Engineering</p>'
    );
  return (
    '<div class="work-action">' +
    taskButton(
      p.product ? (p.refinementOf ? 'Improve feature' : 'Develop feature') : 'Start work',
      p.product ? 'commit-product' : 'project',
      id,
    ) +
    '</div>'
  );
}

const interactions = guardInteractions(() => render());
function render() {
  if (interactions.isHeld()) return;
  const creating = !game.direction;
  document.body.classList.toggle('creating', creating);
  $('company-setup').hidden = !creating;
  if (creating) {
    renderSetupPreview();
    return;
  }
  const revealed = discoverViews(game);
  if (revealed.length)
    toast(
      'Available: ' +
        revealed
          .map(
            (id) =>
              ({
                system: 'System diagram',
                funding: 'Funding',
                security: 'Security',
                enterprise: 'Enterprise customers',
              })[id],
          )
          .join(', '),
    );
  const focused = document.activeElement;
  const focusAction = focused?.dataset?.action,
    focusId = focused?.dataset?.id;
  const summaryIndex =
    focused?.tagName === 'SUMMARY'
      ? [...$('view-' + view).querySelectorAll('summary')].indexOf(focused)
      : -1;
  $('day-label').textContent =
    `Day ${day()} · ${isClosed(game) ? 'Closed' : game.paused ? 'Paused' : game.speed + '× speed'}`;
  const f = solvencySummary(game);
  $('company-status').innerHTML =
    view === 'finance'
      ? ''
      : f.closed
        ? `<div class="company-alert danger"><strong>Company closed · unpaid bills for 30 days</strong>${button('View results', 'nav', 'finance', 'btn small secondary')}</div>`
        : f.emergency
          ? `<div class="company-alert danger"><strong>Cash recovery · development paused${f.debt > 1e-8 ? ' · unpaid bills' : ''}</strong>${button('Recovery options', 'nav', 'finance', 'btn small secondary')}</div>`
          : game.solvency.warningLevel
            ? `<div class="company-alert warning"><strong>Low cash runway · review spending and funding</strong>${button('Review finances', 'nav', 'finance', 'btn small secondary')}</div>`
            : '';
  if (
    view !== 'overview' &&
    !$('company-status').textContent &&
    (game.incidents.some((i) => i.announced) || game.notified || game.backgroundNotified)
  )
    $('company-status').innerHTML =
      `<div class="company-alert warning"><strong>Service problem reported</strong>${button('Review incident', 'nav', 'overview', 'btn small secondary')}</div>`;
  document.body.classList.toggle('paused', game.paused);
  const pause = document.querySelector('[data-action="pause"]');
  pause.innerHTML = icon(game.paused ? 'play' : 'pause');
  pause.disabled = isClosed(game);
  pause.setAttribute('aria-label', game.paused ? 'Resume simulation' : 'Pause simulation');
  document.querySelectorAll('[data-action="speed"]').forEach((b) => {
    b.disabled = isClosed(game);
    b.classList.toggle('selected', Number(b.dataset.id) === game.speed);
    b.setAttribute('aria-label', `${b.dataset.id} times speed`);
  });
  $('pricing-form')
    .querySelectorAll('input,button')
    .forEach((input) => {
      input.disabled = isClosed(game);
    });
  $('project-count').hidden = true;
  if (view === 'overview') {
    const runway = solvencySummary(game).runway;
    $('operating-context').innerHTML =
      '<div><span>Subscribers</span><strong>' +
      num(game.customers + game.individualCustomers) +
      '</strong><small>' +
      num(game.individualCustomers) +
      ' individuals · ' +
      num(game.customers) +
      ' teams</small></div><div><span>Cash</span><strong>' +
      money(game.cash) +
      '</strong><small>Available capital</small></div><div><span>Runway</span><strong>' +
      (runway === null ? 'Sustainable' : Math.round(runway) + '<small> days</small>') +
      '</strong><small>' +
      (runway === null ? 'Operating costs covered' : 'At current spending') +
      '</small></div>';
    $('metrics-panel').hidden = !has(game, 'monitoring');
    $('incidents-panel').hidden =
      !game.incidents.some((i) => i.announced) && !game.notified && !game.backgroundNotified;
    renderIndicators();
    renderMap();
    renderTelemetry();
    renderWorkSummary();
    renderInbox();
  }
  if (view === 'system') renderMap(true);
  if (view === 'projects') renderProjects();
  if (view === 'finance') {
    renderFinance();
    document
      .querySelector('#finance-content .spending-panel dl')
      .insertAdjacentHTML(
        'afterbegin',
        `<div><dt>Founder capital</dt><dd>${moneyExact(game.funding.founderCapital)}</dd></div><div><dt>Investment received</dt><dd>${moneyExact(game.funding.raised)}</dd></div>`,
      );
  }
  if (view === 'funding') renderFunding();
  if (view === 'product') renderProduct();
  if (view === 'customers') renderCustomers();
  if (view === 'security') renderSecurity();
  document.querySelectorAll('[data-action="nav"]').forEach((b) => {
    b.hidden = !viewAvailable(b.dataset.id);
  });
  if (isClosed(game))
    document.querySelectorAll('button[data-action]').forEach((b) => {
      if (
        ![
          'nav',
          'reset',
          'cancel-reset',
          'confirm-reset',
          'filter',
          'zoom',
          'product-problem',
        ].includes(b.dataset.action)
      )
        b.disabled = true;
    });
  if (focusAction && focused !== document.activeElement)
    [...document.querySelectorAll('[data-action]')]
      .find(
        (e) =>
          e.dataset.action === focusAction && e.dataset.id === focusId && !e.closest('[hidden]'),
      )
      ?.focus({ preventScroll: true });
  if (summaryIndex >= 0 && !focused.isConnected)
    $('view-' + view)
      .querySelectorAll('summary')
      [summaryIndex]?.focus({ preventScroll: true });
}
function viewAvailable(id) {
  return (
    ['overview', 'product', 'projects', 'customers', 'finance'].includes(id) ||
    game.revealedViews.includes(id)
  );
}
function renderSetupPreview() {
  const data = new FormData($('setup-form')),
    f = FOUNDERS.find((f) => f.id === data.get('founder')),
    d = PRODUCT_DIRECTIONS.find((d) => d.id === data.get('direction')),
    capital = Number($('starting-capital').value),
    e = economics(game),
    budget = expansionBudget(game, 'standard');
  $('capital-output').textContent = money(capital);
  $('capital-runway').textContent =
    `${(capital / e.costs).toFixed(1)} months at ${money(e.costs)}/month before development or revenue; ${(capital / budget.costs).toFixed(1)} months with one Standard project active.${capital < 15000 ? ' Limited runway: outside funding or early spending cuts may be necessary.' : ''}`;
  $('setup-effects').textContent =
    `Combined effects: ${(f.acquisition * d.acquisition).toFixed(2)}× acquisition · ${(f.development / d.development).toFixed(2)}× feature development speed · ${d.churn.toFixed(2)}× churn · ${d.value.toFixed(2)}× customer value`;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}
function save() {
  return saveStore.save(game);
}
function navigate(id) {
  if (!game.direction || !viewAvailable(id)) return;
  view = id;
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${id}`));
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
    if (b.dataset.id === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const titles = {
    finance: 'Finance',
    funding: 'Funding',
    overview: 'Overview',
    system: 'System',
    projects: 'Engineering',
    product: 'Product',
    customers: 'Customers',
    security: 'Security',
  };
  $('page-title').textContent = titles[id];
  $('breadcrumb').textContent = titles[id];
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const { action, id } = b.dataset;
  let error;
  if (
    isClosed(game) &&
    ![
      'nav',
      'reset',
      'cancel-reset',
      'confirm-reset',
      'filter',
      'zoom',
      'product-problem',
    ].includes(action)
  )
    return;
  if (action === 'nav') {
    e.preventDefault();
    navigate(id);
    return;
  }
  if (action === 'product-problem') {
    selectedProblem = id;
    render();
    return;
  }
  if (action === 'category') {
    filter = id;
    navigate('projects');
    return;
  }
  if (action === 'zoom') {
    diagramZoom =
      id === 'fit'
        ? Math.min(1, $('system-canvas').clientWidth / architecture(game).width)
        : Math.max(0.25, Math.min(2, diagramZoom + (id === 'in' ? 0.25 : -0.25)));
    renderMap(true);
    return;
  }
  if (action === 'project') {
    error = startProject(game, id);
    if (!error) toast(project(id).name + ' started.');
  }

  if (action === 'queue-work') error = queueProject(game, id);
  if (action === 'queue-remove') error = removeQueuedProject(game, id);
  if (action === 'queue-up') error = moveQueuedProject(game, id, -1);
  if (action === 'queue-down') error = moveQueuedProject(game, id, 1);
  if (action === 'draft-pause') error = suspendProject(game, id);
  if (action === 'draft-resume') error = resumeProject(game, id);

  if (action === 'analyse-product') error = analyseProduct(game, id.replace(/^analyse_/, ''));
  if (action === 'commit-product') error = commitProduct(game, id);
  if (action === 'resume-development') error = resumeDevelopment(game);
  if (action === 'reduce-capacity') error = reduceCapacity(game, id);
  if (action === 'rollback') error = rollback(game);
  if (action === 'pursue') error = pursue(game);
  if (action === 'abandon') error = abandonProject(game, id);
  if (action === 'raise') error = raiseFunding(game, id);
  if (action === 'direction') error = chooseDirection(game, id);
  if (action === 'business') error = chooseBusinessFocus(game, id);
  if (action === 'customer-target') error = chooseCustomerTarget(game, id);
  if (action === 'communicate') communicate(game, Number(id));
  if (action === 'respond') error = respond(game, Number(id));
  if (action === 'pause') {
    if (pendingIncident(game)) {
      navigate('overview');
      toast('Choose how to handle the incident before resuming.');
      return;
    }
    game.paused = !game.paused;
  }
  if (action === 'speed') {
    game.speed = Number(id);
    if (!pendingIncident(game)) game.paused = false;
  }
  if (action === 'filter') filter = id;
  if (action === 'defer-incident') error = deferIncident(game, Number(id));
  if (action === 'reset') {
    $('reset-dialog').showModal();
    return;
  }
  if (action === 'cancel-reset') {
    $('reset-dialog').close();
    return;
  }
  if (action === 'confirm-reset') {
    game = newCompany();
    budgetsDirty = false;
    $('marketing-budget').value = 0;
    $('individual-price').value = game.pricing.individual;
    $('small-price').value = game.pricing.small;
    $('enterprise-price').value = game.pricing.enterprise;
    filter = 'All';
    showCompleted = false;
    mapKey = '';
    diagramKey = '';
    diagramZoom = 1;
    $('reset-dialog').close();
    view = 'overview';
    selectedProblem = null;
    $('setup-form').reset();
    save();
    render();
    return;
  }
  if (error) toast(error);
  else if (action !== 'filter') save();
  render();
});
$('setup-form').addEventListener('input', renderSetupPreview);
$('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target),
    error = foundCompany(game, {
      founder: data.get('founder'),
      direction: data.get('direction'),
      customerTarget: data.get('customerTarget'),
      capital: Number($('starting-capital').value),
    });
  if (error) {
    toast(error);
    return;
  }
  save();
  navigate('overview');
});
$('pricing-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const error = publishPrices(
    game,
    Number($('small-price').value),
    Number($('enterprise-price').value),
    Number($('individual-price').value),
  );
  if (error) {
    toast(error);
    return;
  }
  $('small-price').value = game.pricing.small;
  $('enterprise-price').value = game.pricing.enterprise;
  save();
  render();
  toast('Subscription price changed. Current customers switch at renewal.');
});
$('pricing-form').addEventListener('input', renderPricePreview);
$('budget-form').addEventListener('input', () => {
  budgetsDirty = true;
  renderBudgets();
});
$('budget-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const draft = structuredClone(game),
    plan = AGENT_PLANS[Number($('development-budget').value)];
  const error =
    setAgentPlan(draft, plan?.id) || setMarketingBudget(draft, Number($('marketing-budget').value));
  if (error) {
    toast(error);
    return;
  }
  game = draft;
  budgetsDirty = false;
  save();
  render();
  toast('Budgets applied.');
});
$('budget-discard').addEventListener('click', () => {
  budgetsDirty = false;
  renderBudgets();
});
$('show-completed').addEventListener('change', (e) => {
  showCompleted = e.target.checked;
  renderProjects();
});
const clock = createSimulationClock(
  {
    canAdvance: () => !game.paused && !document.hidden,
    speed: () => game.speed,
    step: () => {
      tick(game);
      return !!pendingIncident(game);
    },
    save,
    interrupted: () => navigate('overview'),
  },
  performance.now(),
);
setInterval(() => {
  clock.advance(performance.now());
  render();
}, 500);
document.addEventListener('visibilitychange', () => {
  clock.reset(performance.now());
  if (document.hidden) save();
});
window.addEventListener('pagehide', () => save());
if (pendingIncident(game)) navigate('overview');
else render();
if (loadedSave.status === 'invalid')
  toast('The previous save could not be loaded. A fresh session is running.');
if (loadedSave.status === 'unavailable')
  toast('Browser storage is unavailable. Progress cannot be saved.');

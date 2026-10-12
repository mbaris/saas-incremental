import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createGame,
  chooseDirection,
  project,
  DAY,
  MONTH,
  agentPlan,
  startProject,
  queueProject,
  serialize,
  deserialize,
  system,
  economics,
  raiseFunding,
  triggerIncident,
  tick,
  availableProductProblems,
} from '../src/game.js';
import { productSignals } from '../src/product.ts';

const out = resolve('artifacts/review-pack');
const imageDir = join(out, 'screenshots'),
  saveDir = join(out, 'mock-saves');
await mkdir(imageDir, { recursive: true });
await mkdir(saveDir, { recursive: true });
const money = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function fixture({
  id,
  title,
  day = 0,
  customers = 0,
  budget = 'standard',
  path = 'monolith',
  installed = [],
  debt = 0,
  cash = 25000,
  marketing = 0,
  focus = 'balanced',
  work = [],
  queue = [],
  enterprise = false,
}) {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  s.time = day * DAY;
  s.architecturePath = path;
  s.agentPlan = budget;
  s.businessFocus = focus;
  const ids = new Set(['version']);
  const add = (id) => {
    const p = project(id);
    if (!p) throw Error('Unknown fixture project ' + id);
    if (p.paths && !p.paths.includes(path)) throw Error('Wrong path ' + id);
    for (const required of p.requires || []) add(required);
    ids.add(id);
  };
  installed.forEach(add);
  s.upgrades = [...ids];
  s.engineering.completed = ids.size - 1;
  s.engineering.maxCustomers = customers;
  s.engineering.debt = debt;
  s.engineering.wear = day ? 15 : 0;
  s.cash = cash;
  s.customers = customers;
  s.pricing.small = day > 150 ? 49 : 29;
  s.cohorts = customers
    ? [{ count: customers, price: s.pricing.small, renewAt: s.time + 15 * DAY, source: 'organic' }]
    : [];
  s.marketing.budget = marketing;
  s.marketing.spent = marketing * 2;
  s.marketing.acquired = marketing ? customers * 0.2 : 0;
  s.marketing.lastPaid = marketing ? (customers * 0.05) / MONTH : 0;
  s.lastAcquisition = customers ? (customers * 0.035) / DAY : 0;
  s.lastChurn = customers ? (customers * 0.008) / DAY : 0;
  s.trust = day ? 88 : 78;
  s.reliability = day ? 97 : 98;
  s.trend = day ? 74 : 68;
  s.cacheWarm = ids.has('cache') ? 1 : 0;
  s.evidence = ids.has('monitoring') ? 60 : 0;
  for (const id of ids) {
    const p = project(id);
    if (p.repeat) s.engineering.levels[id] = 1;
    if (p.product && !p.refinementOf) {
      s.product.selected[p.problem] = id;
      s.product.shippedAt[id] = Math.max(0, s.time - 20 * DAY);
      s.product.analysed[p.problem] = true;
    }
  }
  if (ids.has('review')) s.reviewAt = s.time;
  if (ids.has('certification')) s.certifiedUntil = s.time + 40 * DAY;
  if (ids.has('workers')) {
    s.workerReplicas = 2;
    s.engineering.levels.workers = 2;
  }
  if (ids.has('concurrency')) s.functionTier = 2;
  if (enterprise)
    s.contract = {
      status: 'active',
      progress: 36,
      breach: 0,
      renewalAt: s.time + 50 * DAY,
      price: 4200,
      quotedPrice: 4200,
    };
  if (day > 150) {
    for (const round of ['seed', 'a']) {
      const error = raiseFunding(s, round);
      if (error) throw Error('Funding fixture: ' + error);
    }
  }
  s.revealedViews =
    day >= 90 ? ['system', 'funding', 'security', 'enterprise'] : day ? ['system'] : [];
  if (day) {
    const m = system(s);
    s.history = Array.from({ length: 35 }, (_, i) => ({
      time: s.time - (34 - i) * 3,
      p95: Math.max(120, m.p95 * (0.94 + Math.sin(i / 5) * 0.05)),
    }));
    s.metrics = m;
  }
  productSignals(s);
  for (const [index, id] of work.entries()) {
    const error = startProject(s, id);
    if (error) throw Error(id + ': ' + error);
    s.work.at(-1).progress = s.work.at(-1).duration * (0.25 + index * 0.18);
  }
  for (const id of queue) {
    const error = queueProject(s, id);
    if (error) throw Error(id + ': ' + error);
  }
  s.paused = true;
  s.speed = 3;
  deserialize(serialize(s));
  return { id, title, state: s };
}
const shared = [
  'monitoring',
  'tests',
  'setup_guide',
  'workflow_presets',
  'access',
  'backup',
  'endpoints',
  'components',
  'database',
  'cache',
];
const mature = [
  ...shared.filter((id) => id !== 'workflow_presets'),
  'workflow_rules',
  'coordination_approvals',
  'pipeline',
  'audit',
  'review',
  'certification',
  'replicas',
  'jobs',
  'workers',
  'events',
  'notifications',
  'analytics',
  'search_service',
  'report_service',
  'contracts',
  'blue_green',
];
const scenarios = [
  fixture({
    id: '01-launch',
    title: 'New company · Standard',
    work: ['monitoring'],
    queue: ['review', 'setup_guide'],
  }),
  fixture({
    id: '02-lean',
    title: 'Bootstrapped monolith · Lean',
    day: 45,
    customers: 18,
    budget: 'lean',
    path: 'monolith',
    installed: ['monitoring', 'setup_guide', 'review'],
    debt: 9,
    cash: 18000,
    focus: 'bootstrap',
    work: ['tests'],
    queue: ['access', 'backup'],
  }),
  fixture({
    id: '03-standard',
    title: 'Operating product · Standard',
    day: 90,
    customers: 58,
    path: 'monolith',
    installed: shared,
    debt: 24,
    cash: 14200,
    marketing: 500,
    work: ['pipeline'],
    queue: ['review', 'audit', 'optimize'],
  }),
  fixture({
    id: '04-parallel',
    title: 'Growing service architecture · Parallel',
    day: 180,
    customers: 170,
    budget: 'parallel',
    path: 'services',
    installed: mature.filter(
      (id) => !['search_service', 'report_service', 'contracts', 'blue_green'].includes(id),
    ),
    debt: 42,
    cash: 45000,
    marketing: 2500,
    focus: 'growth',
    work: ['search_service', 'report_service'],
    queue: ['contracts', 'blue_green', 'refine_setup_guide'],
  }),
  fixture({
    id: '05-intensive',
    title: 'Enterprise service architecture · Intensive',
    day: 300,
    customers: 380,
    budget: 'intensive',
    path: 'services',
    installed: mature,
    debt: 76,
    cash: 145000,
    marketing: 5000,
    focus: 'enterprise',
    enterprise: true,
    work: ['refine_setup_guide', 'refine_workflow_rules', 'security_patch'],
    queue: [
      'debt_cleanup',
      'refine_coordination_approvals',
      'review',
      'restore_drills',
      'access_review',
    ],
  }),
  fixture({
    id: '06-functions',
    title: 'Event-driven functions · Parallel',
    day: 220,
    customers: 240,
    budget: 'parallel',
    path: 'functions',
    installed: [
      ...shared.filter((id) => !['database', 'workflow_presets'].includes(id)),
      'workflow_rules',
      'coordination_approvals',
      'pipeline',
      'audit',
      'review',
      'certification',
      'jobs',
      'events',
      'notifications',
      'analytics',
      'concurrency',
    ],
    debt: 38,
    cash: 60000,
    marketing: 1800,
    work: ['refine_setup_guide', 'security_patch'],
    queue: ['review', 'debt_cleanup'],
  }),
];
const solo = fixture({
  id: '14-individuals',
  title: 'Individual subscribers · Bootstrapped',
  day: 90,
  customers: 0,
  budget: 'lean',
  path: 'monolith',
  installed: shared,
  debt: 18,
  cash: 19000,
  focus: 'bootstrap',
  work: ['refine_workflow_presets'],
});
solo.state.customerTarget = 'individual';
solo.state.individualCustomers = 220;
solo.state.pricing.individual = 18;
solo.state.individualCohorts = [
  { count: 220, price: 18, renewAt: solo.state.time + 15 * DAY, source: 'organic' },
];
solo.state.engineering.maxCustomers = 220 / 8;
solo.state.lastIndividualAcquisition = 4 / DAY;
solo.state.lastIndividualChurn = 2 / DAY;
solo.state.metrics = system(solo.state);
solo.state.history = solo.state.history.map((point) => ({ ...point, p95: solo.state.metrics.p95 }));
solo.pages = ['overview', 'customers', 'finance', 'product'];
deserialize(serialize(solo.state));
scenarios.push(solo);
// One case with all four budgets makes the financial comparison controlled.
for (const budget of ['lean', 'standard', 'parallel', 'intensive']) {
  const state = structuredClone(scenarios[2].state);
  state.agentPlan = budget;
  if (agentPlan(state).slots > 1) {
    const paused = state.paused;
    state.paused = false;
    for (const id of ['review', 'audit'].slice(0, agentPlan(state).slots - 1)) {
      state.workQueue = state.workQueue.filter((task) => task !== id);
      const error = startProject(state, id);
      if (error) throw Error(error);
    }
    state.paused = paused;
  }
  scenarios.push({
    id: '07-budget-' + budget,
    title: 'Same company · ' + agentPlan(state).name + ' budget',
    state,
    comparison: true,
  });
}
const incident = structuredClone(scenarios[4].state);
incident.lastRelease = {
  id: 'notifications',
  wasInstalled: false,
  previousTrend: 70,
  previousLevel: 0,
};
triggerIncident(incident, 'release');
incident.incidents[0].detectAt = incident.time + 1;
incident.paused = false;
tick(incident);
incident.notified = true;
scenarios.push({
  id: '08-incident',
  title: 'Enterprise company · Release incident',
  state: incident,
  incident: true,
});
scenarios.push({
  ...fixture({
    id: '09-architecture',
    title: 'Scaling projects',
    day: 90,
    customers: 80,
    installed: ['setup_guide', 'monitoring', 'tests', 'review', 'database', 'components', 'jobs'],
  }),
  pages: ['projects'],
  architectureChoice: false,
});
const deployment = structuredClone(scenarios[1].state);
deployment.work = [];
deployment.workQueue = [];
deployment.ready = ['refine_setup_guide'];
deployment.paused = false;
tick(deployment);
deployment.paused = true;
scenarios.push({
  id: '10-deployment',
  title: 'Automatic deployment in progress',
  state: deployment,
  pages: ['overview', 'projects'],
});
const reduced = structuredClone(scenarios[4].state);
reduced.agentPlan = 'lean';
scenarios.push({
  id: '11-budget-reduction',
  title: 'Budget cut · preserved parallel work',
  state: reduced,
  pages: ['projects', 'finance'],
});
for (const seed of [1, 91]) {
  const state = createGame(seed);
  chooseDirection(state, 'practical');
  state.paused = true;
  const need = availableProductProblems(state).find((p) => !p.core).id;
  scenarios.push({
    id: '12-product-seed-' + seed,
    title: 'Random product opportunities · seed ' + seed,
    state,
    pages: ['product'],
    productNeed: need,
  });
}
const advancedProduct = structuredClone(scenarios[4].state);
const laterNeed = availableProductProblems(advancedProduct).find(
  (p) => !p.core && !advancedProduct.product.selected[p.id],
).id;
scenarios.push({
  id: '13-product-discovery',
  title: 'Expanded product opportunities · later company',
  state: advancedProduct,
  pages: ['product'],
  productNeed: laterNeed,
});
const profile = await mkdtemp(join(tmpdir(), 'saas-share-review-'));
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let ws,
  sequence = 0;
const pending = new Map(),
  errors = [],
  shots = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(Error('Chrome timeout')), 15000);
    chrome.once('error', reject);
    chrome.stderr.on('data', (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const targets = await fetch(`http://${new URL(endpoint).host}/json/list`).then((r) => r.json());
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => reject(Error(method + ' timeout')), 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1.5,
    mobile: false,
  });
  for (const scenario of scenarios) {
    deserialize(serialize(scenario.state));
    await writeFile(join(saveDir, scenario.id + '.json'), serialize(scenario.state));
    const injection = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('saas-incremental.save.v16',${JSON.stringify(serialize(scenario.state))})`,
    });
    await send('Page.navigate', { url: process.env.TEST_URL || 'http://127.0.0.1:4173' });
    let loaded = false;
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          '!!document.querySelector("#company-setup")?.hidden&&document.querySelector("#day-label").textContent.includes("Paused")',
        )
      ) {
        loaded = true;
        break;
      }
      await sleep(100);
    }
    if (!loaded) throw Error('Failed to load ' + scenario.id);
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
    const pages =
      scenario.pages ||
      (scenario.comparison
        ? ['finance']
        : scenario.incident
          ? ['overview', 'security']
          : scenario.id.startsWith('01')
            ? ['overview', 'projects', 'product', 'finance']
            : [
                'overview',
                'projects',
                'product',
                'finance',
                ...(scenario.state.revealedViews.includes('system') ? ['system'] : []),
                ...(scenario.id.startsWith('05') ? ['customers', 'security', 'funding'] : []),
              ]);
    const captures = pages.map((page) => ({ page, part: '' }));
    if (scenario.id.startsWith('03') || scenario.id.startsWith('05'))
      captures.push({ page: 'finance', part: 'costs' });
    if (scenario.id.startsWith('04') || scenario.id.startsWith('05'))
      captures.push({ page: 'projects', part: 'queue' }, { page: 'projects', part: 'catalog' });
    if (scenario.id.startsWith('05') || scenario.id.startsWith('06'))
      captures.push({ page: 'system', part: 'async' });
    if (scenario.incident) captures.push({ page: 'overview', part: 'incidents' });
    for (const { page, part } of captures) {
      await evaluate(
        `document.querySelector('.nav-item[data-id="${page}"]').click();window.scrollTo(0,0)`,
      );

      if (page === 'system')
        await evaluate('document.querySelector("[data-action=zoom][data-id=fit]").click()');
      if (page === 'product' && scenario.state.product.selected.workflow)
        await evaluate(
          'document.querySelector("[data-action=product-problem][data-id=workflow]").click()',
        );
      if (page === 'product' && scenario.productNeed)
        await evaluate(
          `document.querySelector('[data-action=product-problem][data-id="${scenario.productNeed}"]').click()`,
        );
      if (page === 'customers')
        await evaluate('document.querySelector("#pricing-editor").open=true');
      if (part === 'costs')
        await evaluate('document.querySelector(".cost-panel").scrollIntoView({block:"start"})');
      if (part === 'queue')
        await evaluate(
          'document.querySelector("#development-queue").scrollIntoView({block:"start"})',
        );
      if (part === 'catalog')
        await evaluate(
          'document.querySelector("#project-filters").scrollIntoView({block:"start"})',
        );
      if (part === 'async')
        await evaluate(
          'document.querySelector("#system-canvas").scrollTop=document.querySelector("#system-canvas").scrollHeight',
        );
      if (part === 'incidents')
        await evaluate(
          'document.querySelector("#incidents-panel").scrollIntoView({block:"start"})',
        );
      await sleep(160);
      const { data } = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const file = scenario.id + '-' + page + (part ? '-' + part : '') + '.png';
      await writeFile(join(imageDir, file), Buffer.from(data, 'base64'));
      const e = economics(scenario.state);
      shots.push({
        file,
        image: 'data:image/png;base64,' + data,
        scenario: scenario.id,
        title: scenario.title,
        page,
        part,
        budget: agentPlan(scenario.state).name,
        day: Math.floor(scenario.state.time / DAY) + 1,
        customers: scenario.state.customers,
        architecture: scenario.state.architecturePath || 'Initial monolith',
        cash: money(scenario.state.cash),
        costs: money(e.costs),
        slots: agentPlan(scenario.state).slots,
      });
    }
    if (scenario.incident) {
      await evaluate('document.querySelector(".nav-item[data-id=overview]").click()');
      const before = await evaluate(
        'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).time',
      );
      const visible = await evaluate(
        'document.querySelector("[data-action=respond]").getBoundingClientRect().bottom<innerHeight',
      );
      if (!visible) throw Error('Incident choice below fold');
      await evaluate(`document.querySelector('[data-action=speed][data-id="8"]').click()`);
      await sleep(1100);
      const paused = await evaluate(
        'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
      );
      if (paused.time !== before || !paused.paused || paused.response)
        throw Error('Incident did not wait for player');
      await evaluate('document.querySelector("[data-action=communicate]").click()');
      if (
        !(await evaluate(
          'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).incidents[0].awaitingDecision',
        ))
      )
        throw Error('Communication cleared decision');
      await evaluate('document.querySelector("[data-action=respond]").click()');
      const repaired = await evaluate(
        'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
      );
      if (!repaired.response || repaired.paused || repaired.incidents[0].awaitingDecision)
        throw Error('Repair did not resume');
    }
  }
  if (errors.length) throw Error('Browser exceptions: ' + JSON.stringify(errors));
  const pageLabels = {
    overview: 'Overview',
    projects: 'Engineering',
    product: 'Product',
    finance: 'Finance',
    system: 'System',
    customers: 'Customers',
    security: 'Security',
    funding: 'Funding',
  };
  const cards = shots
    .map(
      (s, i) =>
        `<article data-scenario="${s.scenario}" data-page="${s.page}" data-budget="${s.budget}"><button class="preview" data-index="${i}" aria-label="Enlarge ${escape(s.title)} ${s.page}"><img src="${s.image}" alt="${escape(s.title)} — ${s.page}" loading="lazy"></button><div class="caption"><h2>${escape(s.title)}</h2><p class="meta">${pageLabels[s.page]}${s.part ? ' / ' + s.part : ''} · Day ${s.day} · ${s.customers} teams · ${s.slots} development slots</p><p>${s.architecture} · ${s.cash} cash · ${s.costs}/month operating cost</p></div></article>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SaaS Incremental — UI review</title><style>
 :root{font-family:system-ui,sans-serif;color:#23362e;background:#f3f5f0}*{box-sizing:border-box}body{margin:0;padding:32px;max-width:1800px;margin:auto}h1{font-size:30px;margin:0 0 12px}header p{max-width:1000px;line-height:1.5;color:#55635b}a{color:#235b43}.filters{display:flex;gap:16px;align-items:end;margin:24px 0}label{display:grid;gap:6px;font-size:13px}select,button{font:inherit}select{padding:9px 12px;border:1px solid #879c8e;border-radius:6px;background:white}#count{color:#657369;padding:10px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:white;border:1px solid #d8dfd6;border-radius:10px;overflow:hidden}.preview{width:100%;border:0;padding:0;display:block;cursor:zoom-in;background:#dfe8dc}.preview img{width:100%;display:block}.preview:hover{outline:3px solid #45816b;outline-offset:-3px}.caption{padding:16px 20px}.caption h2{font-size:17px;margin:0 0 8px}.caption p{font-size:13px;color:#617168;margin:6px 0}.caption .meta{color:#314e3c;text-transform:capitalize}button:focus-visible,select:focus-visible{outline:3px solid #387ab3;outline-offset:3px}[hidden]{display:none!important}dialog{width:96vw;max-width:1700px;max-height:96vh;border:0;padding:16px;border-radius:10px}dialog::backdrop{background:#12251ddd}dialog img{width:100%;display:block}dialog .bar{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:12px}dialog button{padding:9px 16px;background:#244e3b;color:white;border:0;border-radius:5px;cursor:pointer}footer{margin-top:30px;color:#657369;font-size:13px}
 </style><header><h1>SaaS Incremental · UI review</h1><p>${shots.length} Chrome screenshots across launch, bootstrapped, growing, enterprise, and function-based companies. Compare Lean, Standard, Parallel, and Intensive development budgets. Click a screenshot to enlarge it.</p><p><strong>Review questions:</strong> Can you find the next action? Are product tradeoffs, development queues, and spending clear? Which screens feel crowded or repetitive?</p><p>These are staged mock saves for interface review, not evidence of normal progression or economic balance. Screens use a 1440 × 900 laptop viewport and paused simulation. The four “Same company” Finance screenshots use the same customer base and infrastructure, with development slots fully occupied.</p></header><div class="filters"><label>Game screen<select id="page"><option value="">All screens</option>${[...new Set(shots.map((s) => s.page))].map((p) => `<option value="${p}">${pageLabels[p]}</option>`).join('')}</select></label><label>Development budget<select id="budget"><option value="">All budgets</option>${['Lean', 'Standard', 'Parallel', 'Intensive'].map((p) => `<option>${p}</option>`).join('')}</select></label><label>Company snapshot<select id="scenario"><option value="">All progress levels</option>${scenarios.map((s) => `<option value="${s.id}">${escape(s.title)}</option>`).join('')}</select></label><span id="count"></span></div><main class="grid">${cards}</main><footer>All images are embedded. Share this HTML file by itself; no server or internet connection is required. Capture date: 2026-10-12.</footer><dialog id="viewer"><div class="bar"><strong id="detail"></strong><button id="close">Close</button></div><img id="large" alt=""></dialog><script>
 const cards=[...document.querySelectorAll('article')],page=document.querySelector('#page'),budget=document.querySelector('#budget'),scenario=document.querySelector('#scenario'),viewer=document.querySelector('#viewer');function filter(){let count=0;for(const c of cards){c.hidden=!!(page.value&&c.dataset.page!==page.value||budget.value&&c.dataset.budget!==budget.value||scenario.value&&c.dataset.scenario!==scenario.value);if(!c.hidden)count++;}document.querySelector('#count').textContent=count+' screenshots';}page.onchange=budget.onchange=scenario.onchange=filter;filter();for(const b of document.querySelectorAll('.preview'))b.onclick=()=>{const card=b.closest('article'),img=b.querySelector('img');document.querySelector('#large').src=img.src;document.querySelector('#large').alt=img.alt;document.querySelector('#detail').textContent=card.querySelector('h2').textContent+' · '+card.dataset.page;viewer.showModal();};document.querySelector('#close').onclick=()=>viewer.close();viewer.onclick=e=>{if(e.target===viewer)viewer.close();};
 </script></html>`;
  await writeFile(join(out, 'index.html'), html);
  await writeFile(
    join(out, 'manifest.json'),
    JSON.stringify(
      {
        viewport: { width: 1440, height: 900, scale: 1.5 },
        mockStates: true,
        screenshots: shots.map(({ image, ...s }) => s),
        errors,
      },
      null,
      2,
    ),
  );
  // Verify the actual shareable file, including filters and enlarged images.
  await send('Page.navigate', { url: 'file://' + join(out, 'index.html') });
  await sleep(300);
  const review = await evaluate(
    `(()=>{const imgs=[...document.querySelectorAll('article img')];document.querySelector('#budget').value='Lean';document.querySelector('#budget').dispatchEvent(new Event('change'));const filtered=[...document.querySelectorAll('article')].filter(c=>!c.hidden);filtered[0].querySelector('button').click();return {images:imgs.length,filtered:filtered.length,dialog:document.querySelector('dialog').open,embedded:imgs.every(i=>i.src.startsWith('data:image/png;base64,')),external:!!document.querySelector('[src^="http"],[href^="http"]')};})()`,
  );
  if (
    review.images !== shots.length ||
    !review.filtered ||
    !review.dialog ||
    !review.embedded ||
    review.external
  )
    throw Error('Invalid shareable review ' + JSON.stringify(review));
  if (errors.length) throw Error('Review page runtime errors');
  await evaluate(
    'document.querySelector("dialog").close();document.querySelector("#budget").value="";document.querySelector("#budget").dispatchEvent(new Event("change"));window.scrollTo(0,0)',
  );
  await sleep(200);
  const cover = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(join(out, 'gallery-preview.png'), Buffer.from(cover.data, 'base64'));
  console.log(
    JSON.stringify(
      {
        html: join(out, 'index.html'),
        screenshots: shots.length,
        scenarios: scenarios.length,
        review,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  await new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r)));
  await rm(profile, { recursive: true, force: true });
}

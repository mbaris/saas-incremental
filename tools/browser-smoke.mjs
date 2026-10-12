import { chooseArchitecture } from '../tests/helpers.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import {
  createGame,
  PROJECTS,
  tick,
  chooseDirection,
  FUNDING_ROUNDS,
  AGENT_PLANS,
} from '../src/game.js';
import { availableProjects, unlockedProjects, has } from '../src/game.js';
import { startProject, publishPrices, CASH_GRACE, CASH_CLOSE } from '../src/game.js';
import { grantProjects, allProjects } from '../tests/helpers.mjs';
import { project } from '../src/game.js';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const chromePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(join(tmpdir(), 'ceo-incremental-browser-'));
const chrome = spawn(
  chromePath,
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws,
  sequence = 0;
const pending = new Map(),
  errors = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome debugging endpoint timed out')), 15000);
    chrome.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    chrome.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const debug = new URL(endpoint);
  const targets = await fetch(`http://${debug.host}/json/list`).then((r) => r.json());
  const target = targets.find((t) => t.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject, timer } = pending.get(m.id);
      clearTimeout(timer);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        m.params.exceptionDetails.text +
          ' ' +
          (m.params.exceptionDetails.exception?.description || ''),
      );
    if (
      m.method === 'Log.entryAdded' &&
      m.params.entry.level === 'error' &&
      !m.params.entry.url?.endsWith('/favicon.ico')
    )
      errors.push(m.params.entry.text);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text,
      );
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 120000) => {
    console.log('Checking: ' + label);
    const start = Date.now(),
      priorView = await evaluate(
        'document.querySelector(".view:not([hidden])")?.id.replace("view-","")',
      );
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await evaluate(
        `(()=>{const b=document.querySelector('[data-action="defer-incident"]');if(b){document.querySelector('[data-action="communicate"]:not(:disabled)')?.click();const repair=document.querySelector('[data-action="respond"]:not(:disabled)');(repair||b).click();document.querySelector('.nav-item[data-id="${priorView}"]')?.click();}})()`,
      );
      await sleep(150);
    }
    throw new Error('Timed out: ' + label);
  };
  const click = async (action, id) => {
    const selector = `[data-action="${action}"]${id === undefined ? '' : `[data-id="${id}"]`}`;
    if (['commit-product', 'analyse-product'].includes(action))
      await evaluate(
        `(()=>{const problem=document.querySelector(${JSON.stringify(selector)})?.closest('[data-problem]');if(problem)document.querySelector('[data-action=product-problem][data-id='+problem.dataset.problem+']').click();})()`,
      );
    const result = await evaluate(
      `(()=>{const candidates=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(b=>!b.closest('[hidden]')&&!b.disabled);const b=candidates.find(b=>b.getClientRects().length)||candidates[0];if(!b)return false;for(let p=b.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;if(!b.getClientRects().length)return false;b.click();return true;})()`,
    );
    assert.ok(result, `enabled visible ${selector}`);
  };
  const changeDevelopmentBudget = async (id) => {
    const previous = await evaluate(
      'document.querySelector(".view:not([hidden])").id.replace("view-","")',
    );
    await click('nav', 'finance');
    await evaluate(
      `document.querySelector('#development-budget').value=${AGENT_PLANS.findIndex((p) => p.id === id)};document.querySelector('#development-budget').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#budget-form').requestSubmit()`,
    );
    await click('nav', previous);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const startCompany = async (capital = 25000) => {
    await evaluate(
      `document.querySelector('#starting-capital').value=${capital};document.querySelector('#setup-form').requestSubmit()`,
    );
    await waitFor('document.querySelector("#company-setup")?.hidden===true', 'company founded');
  };
  await send('Page.navigate', { url: base });
  await waitFor('!!document.querySelector("#setup-form")', 'initial setup');
  assert.ok(await evaluate('document.body.classList.contains("creating")'));
  await mkdir('artifacts', { recursive: true });
  const screenshot = async (name) => {
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await writeFile(join('artifacts', name), Buffer.from(data, 'base64'));
  };
  await screenshot('ceo-incremental-founder-setup.png');
  await evaluate(
    'document.querySelector("#starting-capital").value=500000;document.querySelector("#starting-capital").dispatchEvent(new Event("input",{bubbles:true}))',
  );
  assert.equal(await evaluate('document.querySelector("#capital-output").textContent'), '$500,000');
  await startCompany();
  await click('pause');
  assert.equal(
    await evaluate('[...document.querySelectorAll(".nav-item")].filter(b=>!b.hidden).length'),
    5,
  );
  assert.ok(
    await evaluate('document.querySelector("#system-map").textContent.includes("Monolith")'),
  );
  assert.equal(await evaluate('document.querySelectorAll(".request-dot.healthy").length'), 0);
  assert.equal(
    await evaluate('document.querySelectorAll(".request-dot").length'),
    0,
    'no client traffic before product direction',
  );
  assert.equal(await evaluate('document.querySelector("#metrics-panel").hidden'), true);
  assert.equal(await evaluate('document.querySelector("#incidents-panel").hidden'), true);
  assert.equal(await evaluate('document.querySelector("#view-overview .financials")'), null);
  assert.equal(
    await evaluate('document.querySelectorAll("#view-overview .project-card").length'),
    0,
  );
  await screenshot('ceo-incremental-desktop.png');
  await click('nav', 'customers');
  assert.equal(await evaluate('document.querySelector(".opportunity-card").hidden'), true);
  assert.equal(await evaluate('document.querySelector("#pricing-editor").hidden'), true);
  await screenshot('ceo-incremental-directions.png');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'direction cards fit laptop',
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.ok(
    await evaluate(
      'document.querySelector(".direction-summary").textContent.includes("Practical tools")',
    ),
  );
  await click('nav', 'projects');
  assert.equal(
    await evaluate('document.querySelectorAll(".architecture-card").length'),
    0,
    'defer architecture until operating experience',
  );
  assert.equal(await evaluate('document.querySelector("#view-projects input[type=range]")'), null);
  assert.equal(await evaluate('document.querySelector("#project-filters").hidden'), true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'architecture cards fit laptop',
  );
  await screenshot('ceo-incremental-architecture-choice.png');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.equal(
    await evaluate('document.querySelectorAll("#projects-list .project-card").length'),
    2,
    'only unfinished foundational work initially visible',
  );
  assert.equal(await evaluate('document.querySelector("#projects-list [data-id=host]")'), null);
  await screenshot('ceo-incremental-roadmap-launch.png');
  assert.equal(
    await evaluate('document.querySelector("#projects-list [data-id=search_service]")'),
    null,
  );
  assert.equal(
    await evaluate('document.querySelector("#projects-list [data-id=concurrency]")'),
    null,
  );
  await click('nav', 'overview');
  await click('nav', 'projects');
  const beforeTask = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).cash',
  );
  await click('project', 'monitoring');
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).cash'),
    beforeTask,
    'no cash deducted on task start',
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".project-footer").textContent.includes("no upfront charge")',
    ),
  );
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#completed-label")?.textContent==="1 completed"',
    'monitoring project completion',
  );
  assert.equal(
    await evaluate('document.querySelector("#projects-list [data-id=monitoring]")'),
    null,
    'completed projects hidden by default',
  );
  await evaluate('document.querySelector("#show-completed").click()');
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll("#projects-list .project-card.completed")].some(c=>c.textContent.includes("Basic monitoring")&&c.textContent.includes("Installed"))',
    ),
  );
  await sleep(600);
  assert.equal(
    await evaluate('document.querySelector("#show-completed").checked'),
    true,
    'checkbox survives render',
  );
  await evaluate('document.querySelector("#show-completed").click()');
  await click('nav', 'overview');
  assert.ok(
    await evaluate('document.querySelector("#telemetry").textContent.includes("p95 latency")'),
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".request-dot.healthy").length'),
    0,
    'basic monitoring must not reveal endpoint colors',
  );
  await click('pause');
  await click('nav', 'product');
  await screenshot('ceo-incremental-product-opportunities.png');
  const analysisCash = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).cash',
  );
  await click('analyse-product', 'setup');
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).cash'),
    analysisCash,
  );
  await click('nav', 'projects');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'requirements analysis complete',
  );
  await click('pause');
  await click('nav', 'product');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-problem=setup]").textContent.includes("Small-team fit")',
    ),
  );
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).engineering.completed',
    ),
    1,
    'research grants no experience',
  );
  await screenshot('ceo-incremental-product-analysis.png');
  await click('commit-product', 'setup_guide');
  await click('nav', 'projects');
  await click('speed', '8');
  await click('pause');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-work=setup_guide]").textContent.includes("game days")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".capacity-preview").length'),
    0,
    'basic monitoring cannot reveal component estimates',
  );
  await click('abandon', 'setup_guide');
  assert.equal(await evaluate('document.querySelectorAll("[data-work]").length'), 0);
  await click('nav', 'product');
  await click('commit-product', 'setup_guide');
  await click('nav', 'projects');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent.includes("Deploying")',
    'automatic deployment started',
  );
  await waitFor(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).upgrades.includes("setup_guide")',
    'feature deployed',
  );
  await waitFor(
    'document.querySelectorAll("#project-work .work-item").length===0',
    'deployment response finished',
  );
  await click('pause');
  await click('nav', 'customers');
  await click('business', 'growth');
  assert.ok(
    await evaluate('document.querySelector("#business-focus").textContent.includes("15%")'),
  );
  await click('business', 'bootstrap');
  assert.equal(await evaluate('document.querySelector("#pricing-editor").hidden'), false);
  await click('nav', 'finance');
  await evaluate(
    'document.querySelector("#marketing-budget").value=500;document.querySelector("#marketing-budget").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#budget-form").requestSubmit()',
  );
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).marketing.budget',
    ),
    500,
  );
  await evaluate(
    'document.querySelector("#marketing-budget").value=700;document.querySelector("#marketing-budget").dispatchEvent(new Event("input",{bubbles:true}))',
  );
  await sleep(650);
  assert.equal(
    await evaluate('document.querySelector("#marketing-budget").value'),
    '700',
    'draft survives periodic render',
  );
  await screenshot('ceo-incremental-marketing.png');
  await click('nav', 'finance');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-cost=marketing]").textContent.includes("$500.00")',
    ),
  );
  await click('nav', 'finance');
  await evaluate(
    'document.querySelector("#marketing-budget").value=0;document.querySelector("#marketing-budget").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#budget-form").requestSubmit()',
  );
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).marketing.budget',
    ),
    0,
  );
  await evaluate('document.querySelector("#pricing-editor").open=true');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  const save = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  assert.equal(save.architecturePath, 'monolith');
  assert.equal(save.businessFocus, 'bootstrap');
  assert.equal(save.direction, 'practical');
  assert.ok(save.customers > 0);
  assert.equal(save.funding.shareholders[0].ownership, 1);
  assert.ok(save.upgrades.includes('setup_guide'));
  assert.ok(save.upgrades.includes('monitoring'));
  assert.ok(save.cash < 25000);
  await click('nav', 'customers');
  assert.equal(await evaluate('document.querySelector("[data-action=pursue]").disabled'), true);
  await click('nav', 'projects');
  await click('filter', 'Security');
  await click('project', 'review');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'security review completed',
  );
  await click('pause');
  await click('nav', 'security');
  assert.ok(
    await evaluate(
      'document.querySelector("#security-content").textContent.includes("Security assessment")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelector("[data-action=auto]")'),
    null,
    'incidents require player decisions',
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#security-content .project-card").length'),
    0,
  );
  await click('nav', 'finance');
  await screenshot('ceo-incremental-finance.png');
  const initialRevenue = await evaluate('document.querySelector("#stat-revenue").textContent');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-cost=applications]").textContent.includes("$80")',
    ),
  );
  await click('nav', 'customers');
  await evaluate(
    'document.querySelector("#small-price").value=100;document.querySelector("#pricing-form").requestSubmit()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector("#price-preview").textContent.includes("Signups blocked")',
    ),
  );
  await click('nav', 'finance');
  assert.equal(
    await evaluate('document.querySelector("#stat-revenue").textContent'),
    initialRevenue,
  );
  await click('nav', 'customers');
  await evaluate(
    'document.querySelector("#small-price").value=29;document.querySelector("#pricing-form").requestSubmit()',
  );
  await click('reset');
  assert.equal(await evaluate('document.querySelector("#reset-dialog").open'), true);
  await click('cancel-reset');
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#day-label")?.textContent.includes("Paused")',
    'saved reload',
  );
  assert.ok(
    await evaluate('document.querySelector("#telemetry").textContent.includes("p95 latency")'),
  );
  const mature = createGame(42);
  chooseDirection(mature, 'practical');
  chooseArchitecture(mature, 'services');
  grantProjects(
    mature,
    allProjects(mature).filter((id) => !project(id).effect),
  );
  mature.reviewAt = 0;
  mature.certifiedUntil = 1000;
  mature.customers = 64;
  mature.cohorts = [{ count: 64, price: 29, renewAt: 360 }];
  mature.cacheWarm = 1;
  for (let i = 0; i < 80; i++) tick(mature);
  mature.paused = true;
  mature.trust = 83;
  const injected = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('saas-incremental.save.v16',${JSON.stringify(JSON.stringify(mature))})`,
  });
  await send('Page.reload');
  await waitFor('!!document.querySelector("#system-map .architecture-inventory")', 'expanded map');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
  assert.ok(
    await evaluate(
      'document.querySelector("#map-legend").textContent.includes("engineering effort")',
    ),
  );
  await screenshot('ceo-incremental-expanded.png');
  await click('nav', 'system');
  assert.ok(await evaluate('document.querySelectorAll("#system-canvas [data-node]").length>=20'));
  assert.ok(
    await evaluate('document.querySelectorAll("#system-canvas .request-dot.healthy").length>0'),
  );
  for (const node of [
    'search-app',
    'search-db',
    'report-app',
    'report-db',
    'report-queue',
    'report-worker-0',
    'event-broker',
    'work-topic',
    'notification-queue',
    'notification-worker',
    'analytics-worker',
    'analytics-db',
  ])
    assert.ok(
      await evaluate(`!!document.querySelector('#system-canvas [data-node="${node}"]')`),
      node,
    );
  await click('zoom', 'in');
  assert.equal(await evaluate('document.querySelector("#diagram-scale").textContent'), '125%');
  await click('zoom', 'fit');
  const zoom = await evaluate('document.querySelector("#diagram-scale").textContent');
  await sleep(600);
  assert.equal(await evaluate('document.querySelector("#diagram-scale").textContent'), zoom);
  assert.ok(
    await evaluate('document.querySelector("#system-components").textContent.includes("pending")'),
  );
  await screenshot('ceo-incremental-system.png');
  await evaluate(
    'document.querySelector("#system-canvas").scrollTop=document.querySelector("#system-canvas").scrollHeight',
  );
  await screenshot('ceo-incremental-system-events.png');
  await click('nav', 'projects');
  await click('filter', 'All');
  assert.equal(
    await evaluate('document.querySelectorAll("#projects-list .project-card").length'),
    unlockedProjects(mature).filter((p) => p.repeat || !has(mature, p.id)).length,
    'repeatable projects remain visible',
  );
  await evaluate('document.querySelector("#show-completed").click()');
  assert.equal(
    await evaluate('document.querySelectorAll("#projects-list .project-card").length'),
    unlockedProjects(mature).length,
  );
  assert.equal(await evaluate('document.querySelector("#projects-list [data-id=host]")'), null);
  assert.equal(await evaluate('document.querySelector("#projects-list [data-id=optimize]")'), null);
  await click('filter', 'Infrastructure');
  assert.equal(
    await evaluate('document.querySelectorAll("#projects-list .project-card").length'),
    unlockedProjects(mature).filter((p) => p.category === 'Infrastructure').length,
  );
  await evaluate('document.querySelector("#show-completed").click()');
  assert.equal(
    await evaluate('document.querySelectorAll("#projects-list .project-card").length'),
    unlockedProjects(mature).filter(
      (p) => p.category === 'Infrastructure' && (p.repeat || !has(mature, p.id)),
    ).length,
  );
  await click('filter', 'Delivery');
  assert.equal(await evaluate('document.querySelector("#projects-list [data-id=pipeline]")'), null);
  assert.ok(await evaluate('!!document.querySelector("#projects-list [data-id=containers]")'));
  await click('filter', 'All');
  await screenshot('ceo-incremental-engineering.png');
  await click('nav', 'customers');
  assert.equal(await evaluate('document.querySelector("[data-action=pursue]").disabled'), false);
  await screenshot('ceo-incremental-customers.png');
  await click('pursue');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#customer-content").textContent.includes("Active contract")',
    'contract signing',
  );
  await click('pause');
  await click('nav', 'projects');
  await click('filter', 'Infrastructure');
  await click('project', 'workers');
  await click('nav', 'system');
  await click('speed', '8');
  await waitFor(
    '!!document.querySelector("#system-canvas [data-node=report-worker-1]")',
    'worker replica deployment',
  );
  await click('pause');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).workerReplicas'),
    1,
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const page of [
    'overview',
    'system',
    'projects',
    'customers',
    'finance',
    'funding',
    'security',
  ]) {
    await click('nav', page);
    await sleep(100);
    const dims = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
    assert.ok(dims.scroll <= dims.width + 1, `${page} laptop overflow ${JSON.stringify(dims)}`);
  }
  await click('nav', 'finance');
  await screenshot('ceo-incremental-finance-expanded.png');
  await click('nav', 'overview');
  await screenshot('ceo-incremental-laptop.png');
  const funded = createGame(42);
  chooseDirection(funded, 'practical');
  chooseArchitecture(funded, 'monolith');
  grantProjects(funded, allProjects(funded));
  funded.reviewAt = 0;
  funded.certifiedUntil = 5000;
  funded.customers = 100;
  funded.cohorts = [{ count: 100, price: 29, renewAt: 360 }];
  funded.cacheWarm = 1;
  funded.evidence = 40;
  funded.trust = 90;
  funded.paused = true;
  funded.contract = {
    status: 'active',
    price: 2600,
    quotedPrice: 2600,
    progress: 36,
    breach: 0,
    renewalAt: 1080,
  };
  const fundingInjected = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('saas-incremental.save.v16',${JSON.stringify(JSON.stringify(funded))})`,
  });
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#work-panel h3")?.textContent==="No active work"',
    'funding fixture',
  );
  await send('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: fundingInjected.identifier,
  });
  await click('nav', 'funding');
  await screenshot('ceo-incremental-funding-offer.png');
  const raised = FUNDING_ROUNDS.reduce((sum, round) => sum + round.investment, 0);
  for (const round of FUNDING_ROUNDS) await click('raise', round.id);
  const fundedSave = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
  );
  assert.equal(fundedSave.cash, 25000 + raised);
  assert.equal(fundedSave.funding.raised, raised);
  assert.equal(fundedSave.funding.rounds.length, 4);
  assert.ok(fundedSave.funding.shareholders[0].ownership < 1);
  assert.equal(
    await evaluate('document.querySelector("[data-action=raise]")'),
    null,
    'all rounds closed',
  );
  await screenshot('ceo-incremental-funding.png');
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'funding fits laptop',
  );
  await click('nav', 'finance');
  assert.ok(
    await evaluate(
      'document.querySelector(".spending-panel").textContent.includes("Investment received")',
    ),
  );
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#day-label")?.textContent.includes("Paused")',
    'funded save reload',
  );
  await click('nav', 'funding');
  assert.equal(await evaluate('document.querySelectorAll(".ownership-row").length'), 5);
  await click('reset');
  await click('confirm-reset');
  await startCompany();
  await click('pause');
  await click('nav', 'projects');
  for (const id of ['monitoring', 'review', 'review']) {
    await click('project', id);
    await click('speed', '8');
    await waitFor(
      'document.querySelector("#project-work").textContent===""',
      id + ' foundation completed',
    );
  }
  await click('pause');
  await evaluate(
    `(()=>{const s=JSON.parse(localStorage.getItem('saas-incremental.save.v16'));s.architecturePath='functions';localStorage.setItem('saas-incremental.save.v16',JSON.stringify(s));})()`,
  );
  await send('Page.reload');
  await waitFor('!!document.querySelector("#architecture-choice")', 'functions fixture loaded');
  await click('filter', 'Infrastructure');
  for (const id of ['host', 'replicas', 'workers', 'database', 'search_service', 'report_service'])
    assert.equal(
      await evaluate(`document.querySelector('#projects-list [data-id="${id}"]')`),
      null,
      `functions hides ${id}`,
    );
  await click('nav', 'customers');
  await click('business', 'enterprise');
  await click('nav', 'projects');
  await click('project', 'concurrency');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'function concurrency completion',
  );
  await click('pause');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).functionTier'),
    1,
  );
  await click('nav', 'system');
  assert.equal(
    await evaluate('document.querySelectorAll("#system-canvas .map-node.application").length'),
    0,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#system-canvas .map-node.function").length'),
    1,
  );
  assert.equal(
    await evaluate('document.querySelector("#system-canvas .host-boundary")'),
    null,
    'managed functions do not share an application host',
  );
  assert.ok(
    await evaluate(
      'document.querySelector("#system-canvas").textContent.includes("160 concurrent capacity")',
    ),
  );
  assert.ok(
    await evaluate(
      '!document.querySelector("#system-components").textContent.includes("Cold-start contribution")',
    ),
    'cold-start detail requires component monitoring',
  );
  await click('nav', 'projects');
  await click('filter', 'Observability');
  await click('project', 'components');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'function component monitoring installed',
  );
  await click('pause');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  await click('nav', 'system');
  assert.ok(
    await evaluate(
      'document.querySelector("#system-components").textContent.includes("Cold-start contribution")',
    ),
  );
  await screenshot('ceo-incremental-functions.png');
  await click('nav', 'finance');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-cost=functions]").textContent.includes("executions/sec")',
    ),
  );
  await screenshot('ceo-incremental-functions-finance.png');
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#day-label")?.textContent.includes("Paused")',
    'function save reload',
  );
  await click('nav', 'projects');
  assert.ok(
    await evaluate(
      'document.querySelector("#architecture-choice").textContent.includes("Functions")',
    ),
  );
  await click('nav', 'customers');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-action=business].active").textContent.includes("Enterprise")',
    ),
  );
  await click('reset');
  await click('confirm-reset');
  await startCompany(50000);
  await click('pause');
  await click('nav', 'projects');
  await changeDevelopmentBudget('intensive');
  for (const id of ['monitoring', 'review']) {
    await click('project', id);
    await click('speed', '8');
    await waitFor(
      'document.querySelector("#project-work").textContent===""',
      id + ' solo foundation',
    );
  }
  await click('nav', 'product');
  await click('commit-product', 'setup_guide');
  await click('nav', 'projects');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'solo capability shipped',
  );
  await click('pause');
  await click('nav', 'product');
  const agentCash = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).cash',
  );
  for (const id of ['refine_setup_guide', 'coordination_status', 'workflow_presets'])
    await click('commit-product', id);
  assert.equal(
    await evaluate(
      'document.querySelector("[data-action=commit-product][data-id=refine_setup_guide]")',
    ),
    null,
    'active work shows status instead of another start',
  );
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).work.filter(w=>w.id==="refine_setup_guide").length',
    ),
    1,
  );
  await click('nav', 'projects');
  assert.equal(await evaluate('document.querySelectorAll("[data-work]").length'), 3);
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).cash'),
    agentCash,
    'parallel projects have no upfront charge',
  );
  assert.equal(
    await evaluate('document.querySelector("#projects-list [data-id=refine_setup_guide]")'),
    null,
    'product work is absent from the engineering catalog',
  );
  await changeDevelopmentBudget('lean');
  assert.equal(await evaluate('document.querySelectorAll("[data-work]").length'), 3);
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("[data-work]")].filter(e=>e.textContent.includes("Paused by budget")).length',
    ),
    2,
  );
  await screenshot('ceo-incremental-agent-budget.png');
  await changeDevelopmentBudget('intensive');
  await click('speed', '8');
  await waitFor(
    '(()=>{const s=JSON.parse(localStorage.getItem("saas-incremental.save.v16"));return ["refine_setup_guide","coordination_status","workflow_presets"].every(id=>s.upgrades.includes(id))&&!s.release&&!s.ready.length})()',
    'parallel features automatically deployed',
  );
  await click('pause');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  await screenshot('ceo-incremental-parallel-releases.png');
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'agent projects fit laptop',
  );
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#day-label")?.textContent.includes("Paused")',
    'parallel save reload',
  );
  await click('nav', 'projects');
  assert.equal(await evaluate('document.querySelectorAll("[data-ready]").length'), 0);
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).agentPlan'),
    'intensive',
  );
  await click('nav', 'finance');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-cost=founder]").textContent.includes("Founder living costs")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector("[data-cost=tokens]").textContent.includes("0 active projects")',
    ),
  );
  const loadFixture = async (state) => {
    state.paused = true;
    const injected = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('saas-incremental.save.v16',${JSON.stringify(JSON.stringify(state))})`,
    });
    await send('Page.reload');
    await waitFor(
      `document.querySelector('#view-overview')?.hidden===false && document.querySelector('#day-label')?.textContent===${JSON.stringify('Day ' + (Math.floor(state.time / 12) + 1) + ' · ' + (state.solvency.closedAt !== null ? 'Closed' : 'Paused'))}`,
      'recovery fixture',
    );
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
  };
  const low = createGame(42);
  chooseDirection(low, 'practical');
  chooseArchitecture(low, 'monolith');
  publishPrices(low, 200, 2600);
  low.cash = 100;
  low.finance.operatingSpend = low.finance.operatingPaid = 5300;
  tick(low);
  await loadFixture(low);
  assert.ok(
    await evaluate(
      'document.querySelector("#company-status").textContent.includes("Low cash runway")',
    ),
  );
  await click('nav', 'finance');
  await screenshot('ceo-incremental-runway.png');
  const rescue = createGame(42);
  chooseDirection(rescue, 'practical');
  chooseArchitecture(rescue, 'monolith');
  grantProjects(rescue, ['setup_guide', 'host', 'database', 'replicas']);
  rescue.customers = 6;
  rescue.cohorts = [{ count: 6, price: 29, renewAt: 360 }];
  startProject(rescue, 'version');
  rescue.cash = 0;
  rescue.finance.operatingSpend = rescue.finance.operatingPaid = 5400;
  tick(rescue);
  await loadFixture(rescue);
  assert.ok(
    await evaluate(
      'document.querySelector("#company-status").textContent.includes("Cash recovery")',
    ),
  );
  await click('nav', 'projects');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-work=version]").textContent.includes("Paused for cash recovery")',
    ),
  );
  await click('nav', 'finance');
  assert.ok(await evaluate('document.querySelector("[data-action=resume-development]").disabled'));
  await click('reduce-capacity', 'replicas');
  assert.ok(
    await evaluate('!document.querySelector("[data-action=reduce-capacity][data-id=replicas]")'),
  );
  await screenshot('ceo-incremental-cash-recovery.png');
  await click('nav', 'funding');
  await click('raise', 'seed');
  await click('nav', 'finance');
  assert.equal(
    await evaluate('document.querySelector("[data-action=resume-development]").disabled'),
    false,
  );
  await click('resume-development');
  assert.equal(await evaluate('document.querySelector("#company-status").textContent'), '');
  await click('nav', 'projects');
  assert.ok(
    await evaluate('!document.querySelector("[data-work=version]").textContent.includes("Paused")'),
  );
  const restricted = createGame(42);
  chooseDirection(restricted, 'practical');
  publishPrices(restricted, 200, 2600);
  restricted.cash = 0;
  restricted.finance.operatingSpend = restricted.finance.operatingPaid = 5000;
  for (let i = 0; i < CASH_GRACE + 2; i++) tick(restricted);
  await loadFixture(restricted);
  await click('nav', 'finance');
  assert.ok(
    await evaluate('document.querySelector(".cash-panel").textContent.includes("limited to 35%")'),
  );
  await screenshot('ceo-incremental-unpaid-bills.png');
  const closed = createGame(42);
  chooseDirection(closed, 'practical');
  publishPrices(closed, 200, 2600);
  closed.cash = 0;
  closed.finance.operatingSpend = closed.finance.operatingPaid = 5000;
  for (let i = 0; i < CASH_CLOSE + 1; i++) tick(closed);
  await loadFixture(closed);
  assert.ok(
    await evaluate(
      'document.querySelector("#company-status").textContent.includes("Company closed")',
    ),
  );
  assert.ok(await evaluate('document.querySelector("[data-action=speed]").disabled'));
  await click('nav', 'finance');
  await screenshot('ceo-incremental-company-closed.png');
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'cash recovery fits laptop',
  );
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  const ended = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  await sleep(1000);
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16")).time'),
    ended.time,
  );
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#day-label")?.textContent.includes("Closed")',
    'closed save reload',
  );
  await click('reset');
  await click('confirm-reset');
  assert.ok(await evaluate('document.body.classList.contains("creating")'));
  await startCompany();
  assert.equal(
    await evaluate('document.querySelector("[data-action=pause]").disabled'),
    false,
    'new run restores time controls',
  );
  assert.equal(
    await evaluate('document.querySelectorAll("[data-action=speed]")[2].disabled'),
    false,
  );
  await click('pause');
  await click('nav', 'customers');
  assert.equal(
    await evaluate('document.querySelector("#small-price").disabled'),
    false,
    'new run restores pricing controls',
  );
  const bottleneck = createGame(42);
  chooseDirection(bottleneck, 'practical');
  chooseArchitecture(bottleneck, 'monolith');
  bottleneck.customers = 100;
  bottleneck.cohorts = [{ count: 100, price: 29, renewAt: 360 }];
  grantProjects(bottleneck, [
    'monitoring',
    'components',
    'database',
    'host',
    'setup_guide',
    'workflow_presets',
  ]);
  await loadFixture(bottleneck);
  await click('nav', 'projects');
  await click('filter', 'Infrastructure');
  const replicaForecast = await evaluate(
    'document.querySelector("[data-id=replicas]").closest(".project-card").querySelector(".capacity-preview").textContent',
  );
  const capacities = replicaForecast.match(/Request capacity (\d+) → (\d+)/);
  assert.ok(capacities);
  assert.equal(capacities[1], capacities[2], 'replicas cannot resolve measured DB bottleneck');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-id=cache]").closest(".project-card").textContent.includes("warm cache")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelector("#projects-list [data-id=workers]")'),
    null,
    'future work stays outside the catalog',
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'capacity estimates fit laptop',
  );
  await screenshot('ceo-incremental-engineering-priorities.png');
  const indebted = createGame(42);
  chooseDirection(indebted, 'practical');
  chooseArchitecture(indebted, 'monolith');
  grantProjects(indebted, [
    'setup_guide',
    'version',
    'monitoring',
    'components',
    'host',
    'cache',
    'refine_setup_guide',
  ]);
  indebted.cacheWarm = 1;
  indebted.customers = 20;
  indebted.cohorts = [{ count: 20, price: 29, renewAt: 360 }];
  indebted.engineering.completed = 8;
  indebted.engineering.debt = 60;
  indebted.engineering.wear = 40;
  indebted.engineering.levels.refine_setup_guide = 2;
  await loadFixture(indebted);
  await click('nav', 'projects');
  await click('filter', 'Maintenance');
  await changeDevelopmentBudget('intensive');
  assert.ok(
    await evaluate(
      'document.querySelector("#engineering-status").textContent.includes("1.72× work time")',
    ),
  );
  await screenshot('ceo-incremental-tech-debt.png');
  await click('project', 'debt_cleanup');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'debt repayment completed',
  );
  await click('pause');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  const repaid = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  assert.equal(repaid.engineering.debt, 33);
  assert.equal(repaid.engineering.levels.debt_cleanup, 1);
  assert.ok(
    await evaluate(
      'document.querySelector("[data-id=debt_cleanup]").closest(".project-card").textContent.includes("Level 1")',
    ),
  );
  await click('project', 'bugfix');
  await click('speed', '8');
  await waitFor(
    'document.querySelector("#project-work").textContent===""',
    'routine maintenance completed',
  );
  await click('pause');
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  assert.ok(
    await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).engineering.wear<25',
    ),
  );
  await click('nav', 'finance');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-cost=tech_debt]").textContent.includes("debt points")',
    ),
  );
  await send('Page.reload');
  await waitFor(
    'document.querySelector("#day-label")?.textContent.includes("Paused")',
    'debt and condition save reload',
  );
  await click('nav', 'product');
  assert.ok(
    await evaluate(
      'document.querySelector("[data-problem=setup]").textContent.includes("Refinement level 2")',
    ),
  );
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    'repeat levels and debt fit laptop',
  );
  assert.deepEqual(errors, [], 'browser console and runtime errors');
  console.log(
    'Browser smoke passed: product choices, analysis, parallel delivery, staged unlocks, repeatable releases, technical debt, cleanup, operating condition, saved levels, runway warnings, recovery, closure and restart, agent budgets, architecture choices, functions, pricing, and all eight laptop views.',
  );
  console.log(
    'Screenshots: artifacts/ceo-incremental-{desktop,directions,architecture-choice,expanded,system,system-events,functions,functions-finance,agent-budget,parallel-releases,customers,engineering,finance,finance-expanded,laptop,funding-offer,funding}.png',
  );
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  await new Promise((resolve) => {
    if (chrome.exitCode !== null) resolve();
    else {
      chrome.once('exit', resolve);
      setTimeout(resolve, 3000);
    }
  });
  await rm(profile, { recursive: true, force: true });
}

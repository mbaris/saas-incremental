import { handleIncidents } from './new-game-balance.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createGame,
  foundCompany,
  chooseDirection,
  chooseBusinessFocus,
  setAgentPlan,
  startProject,
  deploy,
  tick,
  economics,
  fundingOffer,
  DAY,
} from '../src/game.js';
import { setMarketingBudget } from '../src/game.js';
import { analyseProduct, commitProduct } from '../src/game.js';

// Review real model progression without granting upgrades, customers, or cash.
function simulate(seed, focus = 'balanced', plan = 'standard') {
  const s = createGame(seed);
  chooseDirection(s, 'practical');
  chooseBusinessFocus(s, focus);
  setAgentPlan(s, plan);
  const queue = ['monitoring', 'setup_guide'];
  let index = 0,
    firstSeed = null,
    breakEven = null,
    seedState = null;
  const snapshot = () => {
    const e = economics(s),
      offer = fundingOffer(s, 'seed');
    return {
      day: Number((s.time / DAY).toFixed(1)),
      customers: Number(s.customers.toFixed(1)),
      cash: Math.round(s.cash),
      revenue: Math.round(e.revenue),
      costs: Math.round(e.costs),
      profit: Math.round(e.profit),
      reliability: Math.round(s.reliability),
      seedEligible: offer.eligible,
      dilution: Number((offer.dilution * 100).toFixed(1)),
      burnRunwayMonths: e.profit < 0 ? Number((s.cash / -e.profit).toFixed(1)) : null,
    };
  };
  const initial = snapshot();
  for (let t = 0; t < 120 * DAY; t++) {
    if (!s.work.length && !s.ready.length && !s.release && !s.response && index < queue.length) {
      if (!startProject(s, queue[index])) index++;
    }

    handleIncidents(s);
    tick(s);
    if (!firstSeed && fundingOffer(s, 'seed').eligible) {
      firstSeed = snapshot();
      seedState = structuredClone(s);
    }
    if (!breakEven && economics(s).profit >= 0) breakEven = snapshot();
  }
  return { seed, focus, plan, initial, firstSeed, breakEven, day120: snapshot(), seedState };
}
const runs = [1, 42, 74123].flatMap((seed) => [
  simulate(seed),
  simulate(seed, 'growth', 'intensive'),
]);
const representative = runs.find((r) => r.seed === 42 && r.focus === 'balanced');
const profile = await mkdtemp(join(tmpdir(), 'ceo-early-review-'));
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
  captures = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Chrome timeout')), 15000);
    chrome.once('error', reject);
    chrome.stderr.on('data', (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  const targets = await fetch(`http://${new URL(endpoint).host}/json/list`).then((r) => r.json());
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => reject(new Error(method + ' timeout')), 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await mkdir('artifacts/product-review', { recursive: true });
  const load = async (state) => {
    state.paused = true;
    const injected = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('saas-incremental.save.v16',${JSON.stringify(JSON.stringify(state))})`,
    });
    await send('Page.navigate', { url: process.env.TEST_URL || 'http://127.0.0.1:4173' });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      ready = await evaluate(
        `!!document.querySelector('#setup-form') && ${state.direction ? "document.querySelector('#company-setup').hidden && document.querySelector('#day-label').textContent.includes('Paused')" : "document.body.classList.contains('creating')"}`,
      );
      if (ready) break;
      await sleep(100);
    }
    if (!ready) throw new Error('Fixture did not load');
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
  };
  const capture = async (name, page, scrollSelector) => {
    if (page !== 'setup')
      await evaluate(`document.querySelector('[data-action="nav"][data-id="${page}"]').click()`);
    await sleep(150);
    await evaluate('window.scrollTo(0,0)');
    if (scrollSelector)
      await evaluate(
        `(()=>{const el=document.querySelector(${JSON.stringify(scrollSelector)});const problem=el.closest('[data-problem]');if(problem)document.querySelector('[data-action=product-problem][data-id='+problem.dataset.problem+']').click();const target=document.querySelector(${JSON.stringify(scrollSelector)});for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;target.scrollIntoView({block:'start'});})()`,
      );
    await sleep(100);
    const details = await evaluate(
      `({navItems:[...document.querySelectorAll('.nav-item')].filter(b=>b.getClientRects().length).length,scrollHeight:document.documentElement.scrollHeight,visibleButtons:[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return b.getClientRects().length&&r.top>=0&&r.bottom<=innerHeight}).map(b=>({text:b.textContent.trim(),disabled:b.disabled})),bodyText:document.querySelector(${JSON.stringify(page === 'setup' ? '#company-setup' : '#view-' + page)}).innerText})`,
    );
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(`artifacts/product-review/${name}.png`, Buffer.from(data, 'base64'));
    captures.push({ name, page, ...details });
  };
  await load(createGame(42));
  await capture('01-company-setup', 'setup');
  await evaluate(
    'document.querySelector("#starting-capital").value=500000;document.querySelector("#starting-capital").dispatchEvent(new Event("input",{bubbles:true}));',
  );
  if (!(await evaluate('document.querySelector("#capital-output").textContent==="$500,000"')))
    throw new Error('Personal capital must reach $500,000');
  await evaluate('document.querySelector("#setup-form").requestSubmit()');
  const wealthy = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  if (
    wealthy.cash !== 500000 ||
    wealthy.funding.founderCapital !== 500000 ||
    wealthy.funding.shareholders[0].ownership !== 1
  )
    throw new Error('Maximum personal capital must fund the company without dilution');
  const chosen = createGame(42);
  foundCompany(chosen, { founder: 'generalist', capital: 25000, direction: 'practical' });
  await load(chosen);
  await capture('02-fresh-overview', 'overview');
  if (
    !(await evaluate(
      '[...document.querySelectorAll(".development-choice")].every(b=>{const r=b.getBoundingClientRect();return r.height>=70&&r.bottom<=innerHeight})',
    ))
  )
    throw new Error('Initial work choices must be visible and large');
  await capture('03-fresh-customers', 'customers');
  await capture('04-early-engineering', 'projects');
  if (
    !(await evaluate(
      '!document.querySelector("#save-status,#agent-budget,#view-activity,[data-action=save],[data-action=nav][data-id=activity]")',
    ))
  )
    throw new Error('Removed UI elements must be absent');
  if (
    !(await evaluate(
      '!document.querySelector("#projects-list").textContent.match(/no upfront|After completion|technical debt/i)&&document.querySelector("#projects-list").textContent.includes("Monitoring Costs")',
    ))
  )
    throw new Error('Engineering must use compact impact labels');
  if (
    !(await evaluate(
      '(()=>{const cards=[...document.querySelectorAll("#projects-list .project-card")];const first=cards[0].getBoundingClientRect().top;const bottoms=cards.filter(c=>Math.abs(c.getBoundingClientRect().top-first)<2).map(c=>c.querySelector(".work-button")?.getBoundingClientRect().bottom).filter(Boolean);return Math.max(...bottoms)-Math.min(...bottoms)<2})()',
    ))
  )
    throw new Error('Engineering action buttons must align');
  if (
    !(await evaluate(
      'document.querySelector("[data-action=project][data-id=monitoring]").getBoundingClientRect().height>=44',
    ))
  )
    throw new Error('Start work must be visible and large');
  // Real mouse activation spans a periodic render at 8x speed.
  await evaluate(
    '[...document.querySelectorAll("[data-action=speed]")].find(b=>b.dataset.id==="8").click()',
  );
  const press = await evaluate(
    '(()=>{const b=document.querySelector("[data-action=project][data-id=monitoring]");window.pressedTask=b;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',
  );
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    buttons: 1,
    clickCount: 1,
    ...press,
  });
  await sleep(750);
  if (!(await evaluate('window.pressedTask.isConnected')))
    throw new Error('Live rendering must preserve a pressed task button');
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    buttons: 0,
    clickCount: 1,
    ...press,
  });
  await sleep(50);
  if (
    !(await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).work.some(w=>w.id==="monitoring")',
    ))
  )
    throw new Error('A held mouse click at 8x must start work exactly once');
  await evaluate('document.querySelector("[data-action=pause]").click()');
  const savedClick = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
  );
  if (savedClick.work.filter((w) => w.id === 'monitoring').length !== 1)
    throw new Error('One click must create one task');
  await load(chosen);
  await evaluate(
    'document.querySelector("[data-action=nav][data-id=product]").click();[...document.querySelectorAll("[data-action=speed]")].find(b=>b.dataset.id==="8").click();document.querySelector("[data-action=product-problem][data-id=workflow]").focus()',
  );
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await sleep(750);
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await sleep(50);
  if (!(await evaluate('!document.querySelector("[data-problem=workflow]").hidden')))
    throw new Error('Space activation must survive a live update at 8x');
  await load(chosen);
  await capture('05-initial-finance', 'finance');
  if (!(await evaluate('document.querySelector("#budget-discard").hidden')))
    throw new Error('Clean budgets must hide the unused discard action');
  await evaluate(
    'document.querySelector("#development-budget").value=3;document.querySelector("#marketing-budget").value=500;document.querySelector("#marketing-budget").dispatchEvent(new Event("input",{bubbles:true}))',
  );
  await sleep(650);
  const draftBudgets = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
  );
  if (draftBudgets.agentPlan !== 'standard' || draftBudgets.marketing.budget !== 0)
    throw new Error('Budget previews must not change spending before applying');
  await evaluate(
    'document.querySelector("[data-action=nav][data-id=projects]").click();document.querySelector("[data-action=nav][data-id=finance]").click()',
  );
  if (
    !(await evaluate(
      'document.querySelector("#development-budget").value==="3"&&document.querySelector("#marketing-budget").value==="500"',
    ))
  )
    throw new Error('Budget drafts must survive rendering and navigation');
  await capture('19-budget-preview', 'finance');
  await evaluate('document.querySelector("#budget-form").requestSubmit()');
  const appliedBudgets = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
  );
  if (
    appliedBudgets.agentPlan !== 'intensive' ||
    appliedBudgets.marketing.budget !== 500 ||
    appliedBudgets.cash !== chosen.cash
  )
    throw new Error('Applying budgets must update both controls without an upfront charge');
  if (
    !(await evaluate(
      'document.querySelector("[data-cost=marketing]").textContent.includes("$500.00")',
    ))
  )
    throw new Error('Marketing budget must agree with the operating bill');
  await evaluate(
    'document.querySelector("#marketing-budget").value=900;document.querySelector("#marketing-budget").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#budget-discard").click()',
  );
  if (!(await evaluate('document.querySelector("#marketing-budget").value==="500"')))
    throw new Error('Discard must restore the applied budget');
  const parallel = structuredClone(chosen);
  setAgentPlan(parallel, 'parallel');
  startProject(parallel, 'monitoring');
  startProject(parallel, 'review');
  await load(parallel);
  await evaluate(
    'document.querySelector("[data-action=nav][data-id=finance]").click();document.querySelector("#development-budget").value=0;document.querySelector("#development-budget").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#budget-form").requestSubmit()',
  );
  const reduced = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  if (reduced.agentPlan !== 'lean' || reduced.work.length !== 2)
    throw new Error('Lowering development budget must preserve both drafts');
  await evaluate('document.querySelector("[data-action=nav][data-id=projects]").click()');
  if (
    !(await evaluate(
      'document.querySelector("#project-work").textContent.includes("Paused by budget")',
    ))
  )
    throw new Error('Reduced development capacity must pause excess work');
  if (
    !(await evaluate(
      '![...document.querySelectorAll("#projects-list .project-card")].some(card=>/Basic monitoring|Security review/.test(card.textContent))',
    ))
  )
    throw new Error('Active engineering projects must appear only in the work panel');
  await load(chosen);
  await evaluate('document.querySelector("[data-action=nav][data-id=product]").click()');
  if (
    !(await evaluate(
      '!document.querySelector("#product-count,.product-impact,.product-signals")&&!document.querySelector("#product-opportunities").textContent.includes("Choose one approach")',
    ))
  )
    throw new Error('Product must omit removed sections');
  await capture('11-product-opportunities', 'product');
  if (
    !(await evaluate(
      'document.querySelectorAll("#view-product details").length===0&&document.querySelectorAll("[data-problem]:not([hidden])").length===1',
    ))
  )
    throw new Error('Product must have one visible problem and no expandable sections');
  await evaluate(
    'document.querySelector("[data-action=product-problem][data-id=setup]").click();document.querySelector("[data-action=product-problem][data-id=setup]").focus()',
  );
  await sleep(650);
  if (
    !(await evaluate(
      '!document.querySelector("[data-problem=setup]").hidden&&document.activeElement.dataset.id==="setup"',
    ))
  )
    throw new Error('Problem selection and keyboard focus must survive live rendering');
  const nextProblem = await evaluate('document.activeElement.nextElementSibling.dataset.id');
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  if (!(await evaluate('document.activeElement.dataset.id===' + JSON.stringify(nextProblem))))
    throw new Error('Problem selector must be keyboard accessible');
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
    unmodifiedText: '\r',
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await sleep(50);
  if (
    !(await evaluate(
      '!document.querySelector(' +
        JSON.stringify('[data-problem=' + nextProblem + ']') +
        ').hidden',
    ))
  )
    throw new Error('Keyboard must select a problem');
  await evaluate(
    'document.querySelector("[data-action=product-problem][data-id=workflow]").click()',
  );
  if (
    !(await evaluate(
      'document.querySelector("[data-action=analyse-product][data-id=workflow]").getBoundingClientRect().height>=44',
    ))
  )
    throw new Error('Research must remain a visible button');
  await evaluate(
    'document.querySelector("[data-action=analyse-product][data-id=workflow]").click()',
  );
  const researching = await evaluate(
    'JSON.parse(localStorage.getItem("saas-incremental.save.v16"))',
  );
  if (researching.work[0]?.id !== 'analyse_workflow' || researching.cash !== chosen.cash)
    throw new Error('Research button must start research without an upfront charge');
  if (
    !(await evaluate(
      'document.querySelector("[data-problem=workflow]").textContent.includes("Research in progress")&&!document.querySelector("[data-action=analyse-product][data-id=workflow]")',
    ))
  )
    throw new Error('Active research must show status instead of a duplicate start');
  await capture('18-research-in-progress', 'product');
  await load(chosen);
  await evaluate('document.querySelector("[data-action=nav][data-id=product]").click()');
  await evaluate(
    'document.querySelector("[data-action=commit-product][data-id=workflow_presets]").click()',
  );
  if (!(await evaluate('!document.querySelector("[data-problem=workflow] .product-analysis")')))
    throw new Error('Committed product work must hide optional research');
  const started = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  if (
    !started.work.some((w) => w.id === 'workflow_presets') ||
    'planning' in started ||
    started.cash !== chosen.cash
  )
    throw new Error('Direct development must start immediately without a charge or plan');
  await evaluate(`document.querySelector('[data-action="speed"][data-id="8"]').click()`);
  await sleep(1100);
  await evaluate('document.querySelector("[data-action=pause]").click()');
  await capture('16-direct-development', 'projects');
  const running = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  if (!running.work.some((w) => w.id === 'workflow_presets' && w.progress > 0))
    throw new Error('Direct work must advance');
  const busy = structuredClone(chosen);
  busy.paused = false;
  analyseProduct(busy, 'coordination');
  for (let i = 0; busy.work.length && i < 500; i++) tick(busy);
  startProject(busy, 'setup_guide');
  await load(busy);
  await capture('14-busy-agents', 'product', '[data-problem=coordination] .product-approach');
  if (
    !(await evaluate(
      '!document.querySelector("[data-action=queue-work][data-id=coordination_status]").disabled',
    ))
  )
    throw new Error('Occupied development must offer an enabled queue action');
  await evaluate(
    'document.querySelector("[data-action=queue-work][data-id=coordination_status]").click()',
  );
  const queued = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  if (queued.workQueue[0] !== 'coordination_status' || queued.cash !== busy.cash)
    throw new Error('Queue must reserve work without upfront spending');
  await evaluate(
    'document.querySelector("[data-action=nav][data-id=projects]").click();document.querySelector("[data-action=queue-work][data-id=review]").click()',
  );
  await capture('20-development-queue', 'projects');
  await send('Page.reload');
  for (let i = 0; i < 50; i++) {
    if (
      await evaluate(
        '!!document.querySelector("#development-queue")&&document.querySelector("#company-setup").hidden',
      )
    )
      break;
    await sleep(100);
  }
  await evaluate('document.querySelector("[data-action=nav][data-id=projects]").click()');
  if (
    !(await evaluate('document.querySelector("#development-queue").textContent.includes("2 / 5")'))
  )
    throw new Error('Development queue must survive browser reload');
  await evaluate('document.querySelector("[data-action=queue-up][data-id=review]").click()');
  if (
    !(await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).workQueue[0]==="review"',
    ))
  )
    throw new Error('Queue ordering must be editable');
  await evaluate(
    'document.querySelector("[data-action=queue-remove][data-id=coordination_status]").click();document.querySelector("[data-action=queue-remove][data-id=review]").click()',
  );
  await evaluate(
    'document.querySelector("[data-action=nav][data-id=projects]").click();document.querySelector("[data-action=draft-pause][data-id=setup_guide]").click();document.querySelector("[data-action=nav][data-id=product]").click()',
  );
  if (
    !(await evaluate(
      '!document.querySelector("[data-action=commit-product][data-id=coordination_status]").disabled',
    ))
  )
    throw new Error('Pausing a draft must free an agent');
  const analysed = structuredClone(chosen);
  analysed.paused = false;
  analyseProduct(analysed, 'setup');
  for (let i = 0; analysed.work.length && i < 500; i++) tick(analysed);
  await load(analysed);
  await capture('12-product-analysis', 'product', '[data-problem=setup] .product-analysis');
  analysed.paused = false;
  commitProduct(analysed, 'workflow_presets');
  for (let i = 0; analysed.work.length && i < 1000; i++) tick(analysed);
  for (let i = 0; analysed.release && i < 300; i++) tick(analysed);
  for (let i = 0; i < 7 * DAY; i++) tick(analysed);
  await load(analysed);
  await capture('13-product-feedback', 'product', '[data-problem=workflow] .product-result');
  if (representative.seedState) {
    await load(representative.seedState);
    await capture('06-first-seed-funding', 'funding');
    await capture('07-first-seed-finance', 'finance');
    await capture('08-first-seed-customers', 'customers');
    await capture('09-subscription-pricing', 'customers', '#pricing-form');
    const campaign = structuredClone(representative.seedState);
    campaign.paused = false;
    setMarketingBudget(campaign, 1500);
    for (let i = 0; i < 30 * DAY; i++) tick(campaign);
    await load(campaign);
    await capture('10-marketing-campaign', 'finance', '#budget-form');
  }
  for (const page of ['product', 'projects', 'customers', 'finance', 'funding']) {
    await evaluate(`document.querySelector('.nav-item[data-id="${page}"]').click()`);
    if (await evaluate(`!!document.querySelector('#view-${page} [data-action="nav"]')`))
      throw new Error(page + ' must use sidebar navigation instead of duplicate shortcuts');
  }
  if (await evaluate('!!document.querySelector("[data-action=funding-plan]")'))
    throw new Error('Funding must use the actual Finance budget');
  const individuals = createGame(42);
  foundCompany(individuals, {
    founder: 'generalist',
    capital: 25000,
    direction: 'practical',
    customerTarget: 'individual',
  });
  for (let i = 0; i < 30 * DAY; i++) tick(individuals);
  await load(individuals);
  await capture('21-individual-customers', 'customers');
  if (
    !(await evaluate(
      '!!document.querySelector("[data-segment=individual]")&&!document.querySelector("[data-segment=small]")',
    ))
  )
    throw new Error('Individuals-only company must show its own subscribers');
  await evaluate(
    'document.querySelector("#pricing-editor").open=true;document.querySelector("#individual-price").value=60;document.querySelector("#pricing-form").requestSubmit()',
  );
  if (
    !(await evaluate(
      'document.querySelector("#price-preview").textContent.includes("Signups blocked")',
    ))
  )
    throw new Error('Individual pricing must use individual value');
  if (
    !(await evaluate(
      'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).pricing.individual===60',
    ))
  )
    throw new Error('Individual price must save');
  await evaluate('document.querySelector("[data-action=customer-target][data-id=small]").click()');
  if (
    !(await evaluate(
      'document.querySelector("[data-segment=individual]").textContent.includes("Existing subscribers")&&document.querySelector("[data-segment=small]").textContent.includes("Acquiring")',
    ))
  )
    throw new Error('Switching audience must preserve existing individuals');
  await capture('22-mixed-customer-base', 'customers');
  await capture('23-individual-revenue', 'finance');
  if (
    !(await evaluate(
      'document.querySelector(".revenue-panel").textContent.includes("Individual subscriptions")',
    ))
  )
    throw new Error('Finance must distinguish individual revenue');
  const migration = createGame(42);
  chooseDirection(migration, 'practical');
  migration.cash = 500000;
  migration.engineering.completed = 20;
  migration.upgrades.push('monitoring', 'tests', 'database', 'components', 'host');
  await load(migration);
  await capture('24-architecture-projects', 'projects');
  if (await evaluate('!!document.querySelector("[data-action=architecture]")'))
    throw new Error('Permanent architecture chooser must be absent');
  await evaluate(
    'document.querySelector("[data-action=project][data-id=migrate_functions]").click()',
  );
  const moving = await evaluate('JSON.parse(localStorage.getItem("saas-incremental.save.v16"))');
  if (moving.architecturePath !== 'monolith' || moving.work[0]?.id !== 'migrate_functions')
    throw new Error('Migration must be work, not an instant switch');
  await capture('25-migration-in-progress', 'projects');
  moving.work[0].progress = moving.work[0].duration - 1;
  await load(moving);
  await evaluate(`document.querySelector('[data-action=speed][data-id="8"]').click()`);
  let migrated = false;
  for (let i = 0; i < 100; i++) {
    if (
      await evaluate(
        'JSON.parse(localStorage.getItem("saas-incremental.save.v16")).architecturePath==="functions"',
      )
    ) {
      migrated = true;
      break;
    }
    await sleep(100);
  }
  if (!migrated) throw new Error('Automatic migration deployment did not finish');
  await capture('26-functions-migrated', 'projects');
  if (
    !(await evaluate(
      'document.querySelector("#architecture-choice").textContent.includes("Functions")&&!document.querySelector("#projects-list [data-id=host]")&&!!document.querySelector("#projects-list [data-id=consolidate_monolith]")',
    ))
  )
    throw new Error('Migration must update available work and allow consolidation');
  const report = {
    viewport: { width: 1280, height: 800 },
    runs: runs.map(({ seedState, ...r }) => r),
    captures,
    errors,
  };
  if (errors.length) throw new Error('Browser errors: ' + JSON.stringify(errors));
  await writeFile('artifacts/product-review/results.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        runs: report.runs,
        captures: captures.map(({ name, scrollHeight, navItems }) => ({
          name,
          scrollHeight,
          navItems,
        })),
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) process.exitCode = 1;
} finally {
  if (ws) ws.close();
  chrome.kill('SIGTERM');
  await new Promise((resolve) => {
    if (chrome.exitCode !== null) resolve();
    else chrome.once('exit', resolve);
  });
  await rm(profile, { recursive: true, force: true });
}

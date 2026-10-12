import { chooseArchitecture } from './helpers.mjs';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  createGame as createFreshGame,
  tick,
  has,
  PROJECTS,
  project,
  startProject,
  deploy,
  rollback,
  system,
  visibleMetrics,
  security,
  requirements,
  pursue,
  triggerIncident,
  communicate,
  respond,
  deferIncident,
  serialize,
  deserialize,
  economics,
  costBreakdown,
  projectOperatingImpact,
  projectCostChanges,
  customerValue,
  publishPrices,
  PRODUCT_DIRECTIONS,
  FUNDING_ROUNDS,
  chooseDirection,
  projectQuote,
  fundingOffer,
  fundingSummary,
  raiseFunding,
  DAY,
} from '../src/game.js';
import { availableProjects, projectDebt } from '../src/game.js';
import { playOpening, handleIncidents } from '../tools/new-game-balance.mjs';
import { productParameters } from '../src/game.js';
import { resumeDevelopment } from '../src/game.js';
// Existing operations checks use a live company with established subscription cohorts.
function createGame(seed) {
  const s = createFreshGame(seed);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, 'monolith');
  s.customers = 24;
  s.cohorts = [90, 180, 270, 360].map((renewAt) => ({ count: 6, price: 29, renewAt }));
  return s;
}
const advance = (s, n) => {
  for (let i = 0; i < n; i++) tick(s);
  return s;
};
const buy = (s, id, { fund = false } = {}) => {
  if (has(s, id) && !project(id).repeat) return;
  assert.equal(startProject(s, id), null);
  const limit = s.work[0].duration * 5 + 100;
  for (let i = 0; (s.work.length || s.ready.length || s.release) && i < limit; i++) {
    handleIncidents(s);
    tick(s);
    if (fund) {
      const offer = fundingOffer(s);
      if (offer?.eligible) {
        raiseFunding(s, offer.id);
        if (s.solvency.emergency) resumeDevelopment(s);
      }
    }
  }
  assert.equal(s.work.length, 0);
  if (s.ready.length) {
    assert.equal(deploy(s), null);
    for (let i = 0; s.release && i < 200; i++) tick(s);
    assert.equal(s.release, null);
  }
};

test('starts with founder capital, zero customers, and a required product direction', () => {
  const s = createFreshGame();
  assert.deepEqual(s.upgrades, ['version']);
  assert.equal(s.cash, 25000);
  assert.equal(s.customers, 0);
  assert.deepEqual(s.cohorts, []);
  assert.equal(s.direction, null);
  assert.equal(economics(s).revenue, 0);
  assert.ok(economics(s).profit < 0);
  assert.equal(visibleMetrics(s), null);
  assert.equal(security(s).score, null);
  assert.equal(fundingSummary(s).ownership, 1);
  advance(s, 12);
  assert.equal(s.customers, 0);
  assert.ok(startProject(s, 'monitoring'));
  assert.equal(chooseDirection(s, 'practical'), null);
  advance(s, 12);
  assert.ok(s.customers > 0);
  assert.ok(economics(s).revenue > 0);
});
test('observability reveals only installed capabilities', () => {
  const s = createGame();
  advance(s, 4);
  assert.equal(visibleMetrics(s), null);
  s.upgrades.push('monitoring');
  advance(s, 4);
  assert.ok(visibleMetrics(s).p95 > 0);
  assert.equal(visibleMetrics(s).appLoad, null);
  s.upgrades.push('components');
  assert.ok(visibleMetrics(s).appLoad > 0);
  assert.ok(s.history.length > 0);
});
test('work enforces prerequisites and exclusivity without an upfront cash charge', () => {
  const s = createGame(),
    cash = s.cash;
  assert.match(startProject(s, 'replicas'), /Dedicated/);
  assert.equal(startProject(s, 'monitoring'), null);
  assert.equal(s.cash, cash);
  assert.match(startProject(s, 'setup_guide'), /occupied/);
  advance(s, s.work[0].duration);
  assert.ok(has(s, 'monitoring'));
  assert.match(startProject(s, 'monitoring'), /Completed/);
  s.cash = 0;
  assert.equal(startProject(s, 'setup_guide'), null);
  assert.equal(s.cash, 0);
});
test('features deploy automatically after development; version control allows real rollback', () => {
  const s = createGame(1);
  const trend = s.trend;
  startProject(s, 'setup_guide');
  advance(s, s.work[0].duration);
  assert.equal(s.release.id, 'setup_guide');
  assert.ok(!has(s, 'setup_guide'));
  advance(s, 8);
  assert.ok(has(s, 'setup_guide'));
  assert.ok(s.trend > trend);
  assert.equal(rollback(s), null);
  assert.ok(!has(s, 'setup_guide'));
  assert.ok(s.trend <= trend);
  assert.equal(s.lastRelease, null);
});
test('rolling back a repeated refresh keeps the pre-existing capability', () => {
  const s = createGame(1);
  grantProjects(s, ['setup_guide', 'refine_setup_guide', 'version']);
  s.engineering.levels.refine_setup_guide = 1;
  s.trend = 40;
  buy(s, 'refine_setup_guide');
  assert.equal(s.engineering.levels.refine_setup_guide, 2);
  rollback(s);
  assert.ok(has(s, 'refine_setup_guide'));
  assert.equal(s.engineering.levels.refine_setup_guide, 1);
  assert.ok(s.trend <= 40);
});
test('application replicas do not remove a database bottleneck', () => {
  const s = createGame();
  s.customers = 300;
  grantProjects(s, ['database', 'setup_guide', 'host']);
  const before = system(s);
  s.upgrades.push('replicas');
  const after = system(s);
  assert.equal(after.capacity, before.capacity);
  assert.ok(after.capacity < after.demand);
  assert.ok(after.served <= after.capacity);
});
test('cache warms gradually and a release invalidates it', () => {
  const s = createGame(1);
  grantProjects(s, ['cache', 'monitoring', 'setup_guide']);
  const cold = system(s);
  advance(s, 40);
  const warm = system(s);
  assert.ok(warm.hitRate > cold.hitRate);
  assert.ok(warm.dbLoad < cold.dbLoad);
  s.ready = ['optimize'];
  deploy(s);
  for (let i = 0; s.release && i < 40; i++) tick(s);
  assert.equal(s.cacheWarm, 0);
});
test('optimization reduces app and database work without infrastructure', () => {
  const s = createGame();
  const before = system(s);
  s.upgrades.push('optimize');
  const after = system(s);
  assert.ok(after.appLoad < before.appLoad);
  assert.ok(after.dbLoad < before.dbLoad);
});
test('large customers cannot sign without all mandatory requirements', () => {
  const s = createGame();
  assert.ok(pursue(s));
  assert.equal(s.contract.status, 'prospect');
  grantProjects(s, [
    'setup_guide',
    'workflow_presets',
    'coordination_status',
    'access',
    'audit',
    'backup',
    'monitoring',
    'host',
    'database',
    'cache',
    'optimize',
  ]);
  s.certifiedUntil = 999;
  s.cacheWarm = 1;
  advance(s, 40);
  assert.ok(requirements(s).every(([, ok]) => ok));
  assert.equal(pursue(s), null);
  assert.equal(s.contract.status, 'negotiating');
  advance(s, 36);
  assert.equal(s.contract.status, 'active');
  assert.ok(economics(s).revenue > 2600);
});
test('assurance needs actual controls and operating evidence', () => {
  const s = createGame();
  assert.match(startProject(s, 'certification'), /Needs/);
  grantProjects(s, ['review', 'access', 'audit', 'backup']);
  assert.match(startProject(s, 'certification'), /healthy/);
  s.upgrades.push('monitoring');
  s.engineering.completed = 16;
  advance(s, 40);
  assert.equal(startProject(s, 'certification'), null);
  advance(s, s.work[0].duration);
  assert.ok(s.certifiedUntil > s.time);
});
test('better information alone does not change security exposure', () => {
  const a = createGame(8),
    b = createGame(8);
  a.upgrades = ['coordination_status'];
  b.upgrades = ['coordination_status', 'review', 'monitoring'];
  b.reviewAt = 0;
  advance(a, 200);
  advance(b, 200);
  assert.equal(a.seed, b.seed);
  assert.equal(
    a.incidents.filter((i) => i.type === 'security').length,
    b.incidents.filter((i) => i.type === 'security').length,
  );
  assert.equal(security(a).score, null);
  assert.notEqual(security(b).score, null);
});
test('security damage remains after containment and the player chooses a response', () => {
  const s = createGame(5);
  triggerIncident(s, 'security');
  advance(s, 9);
  assert.equal(s.paused, true);
  assert.equal(s.response, null);
  communicate(s, s.incidents[0].id);
  respond(s, s.incidents[0].id);
  advance(s, 40);
  assert.equal(s.incidents.length, 0);
  assert.ok(s.totals.fines > 0);
  assert.ok(s.totals.lostRecords + s.totals.stolenRecords > 0);
  assert.ok(s.trust < 78);
  assert.ok(s.events.some((e) => e.title === 'Customers updated'));
});
test('tested backups reduce data loss but do not undo theft', () => {
  for (const seed of [5, 1000]) {
    const a = createGame(seed),
      b = createGame(seed);
    b.upgrades = ['backup'];
    triggerIncident(a, 'security');
    triggerIncident(b, 'security');
    advance(a, 9);
    advance(b, 9);
    if (a.incidents[0].outcome === 'loss') assert.ok(b.totals.lostRecords < a.totals.lostRecords);
    else assert.equal(b.totals.stolenRecords, a.totals.stolenRecords);
  }
});
test('communicating about the same incident reduces ongoing trust loss', () => {
  const a = createGame(5),
    b = createGame(5);
  triggerIncident(a, 'security');
  triggerIncident(b, 'security');
  advance(a, 9);
  advance(b, 9);
  communicate(b, b.incidents[0].id);
  deferIncident(a, a.incidents[0].id);
  deferIncident(b, b.incidents[0].id);
  advance(a, 15);
  advance(b, 15);
  assert.ok(b.trust > a.trust);
  assert.equal(a.totals.fines, b.totals.fines);
});
test('incident work pauses engineering and resumes when resolved', () => {
  const s = createGame();
  startProject(s, 'setup_guide');
  triggerIncident(s, 'release');
  advance(s, 10);
  const progress = s.work[0].progress;
  respond(s, s.incidents[0].id);
  advance(s, 12);
  assert.equal(s.work[0].progress, progress);
  advance(s, 1);
  assert.equal(s.work[0].progress, progress + 1);
});
test('pause and save round trip preserve progress; invalid saves fail clearly', () => {
  const s = createGame();
  startProject(s, 'setup_guide');
  advance(s, 10);
  s.paused = true;
  const snapshot = serialize(s);
  advance(s, 10);
  assert.equal(serialize(s), snapshot);
  const restored = deserialize(snapshot);
  assert.equal(restored.work[0].progress, 10);
  assert.equal(restored.paused, true);
  assert.equal(restored.cash, s.cash);
  assert.throws(() => deserialize('{'));
  assert.throws(() => deserialize(JSON.stringify({ ...s, version: 99 })));
  assert.throws(() => deserialize(JSON.stringify({ ...s, upgrades: ['made-up'] })));
});
test('long runs are deterministic, bounded, and financially consistent', () => {
  const a = createGame(123),
    b = createGame(123);
  a.upgrades = ['monitoring', 'setup_guide', 'coordination_status'];
  b.upgrades = [...a.upgrades];
  for (let i = 0; i < 3000; i++) {
    handleIncidents(a);
    tick(a);
    handleIncidents(b);
    tick(b);
  }
  assert.equal(a.time, 3000);
  assert.equal(serialize(a), serialize(b));
  assert.ok(a.queue <= 500 && a.queue >= 0);
  assert.ok(a.history.length <= 60);
  assert.ok(a.events.length <= 60);
  for (const n of [a.cash, a.customers, a.trust, a.reliability, a.trend, a.metrics.p95])
    assert.ok(Number.isFinite(n));
  const c = createGame(),
    cash = c.cash,
    profit = economics(c).profit;
  tick(c);
  assert.ok(Math.abs(c.cash - cash - profit / 360) < 1e-8);
});
test('complete a funded path to a large contract using normal project actions', () => {
  const s = createGame(42);
  for (const id of [
    'monitoring',
    'version',
    'tests',
    'host',
    'optimize',
    'database',
    'cache',
    'setup_guide',
    'workflow_presets',
    'coordination_status',
    'replicas',
    'review',
    'access',
    'audit',
    'backup',
    'data_scale',
    'certification',
  ]) {
    if (s.response) advance(s, 20);
    if (id === 'certification') for (let i = 0; i < 120 && s.evidence < 36; i++) tick(s);
    buy(s, id, { fund: true });
    const offer = fundingOffer(s);
    if (offer?.eligible) assert.equal(raiseFunding(s, offer.id), null);
    if (s.incidents.length) {
      for (let i = 0; i < 40; i++) {
        handleIncidents(s);
        tick(s);
      }
    }
  }
  advance(s, 40);
  assert.ok(requirements(s).every(([, ok]) => ok));
  assert.equal(pursue(s), null);
  advance(s, 36);
  assert.equal(s.contract.status, 'active');
  assert.ok(s.cash >= 0);
});

const bill = (s, id) => costBreakdown(s).find((row) => row.id === id).amount;
test('operating bill sums all categories and only charges deployed resources', () => {
  const s = createGame();
  const e = economics(s);
  assert.equal(
    e.costs,
    e.breakdown.reduce((n, row) => n + row.amount, 0),
  );
  for (const id of ['databases', 'queues', 'analytics', 'cdn', 'monitoring', 'cache'])
    assert.equal(bill(s, id), 0);
  assert.equal(bill(s, 'tools'), 12);
  assert.ok(bill(s, 'applications') > 0);
  assert.ok(bill(s, 'network') > 0);
  assert.equal(e.profit, e.revenue - e.costs);
});
test('server size and replica multipliers compound on application hosting only', () => {
  const s = createGame();
  const baseline = bill(s, 'applications');
  s.upgrades.push('host');
  assert.equal(bill(s, 'applications'), baseline * 2);
  s.upgrades.push('database');
  const database = bill(s, 'databases');
  s.upgrades.push('replicas');
  assert.equal(bill(s, 'applications'), baseline * 4);
  assert.equal(bill(s, 'databases'), database);
});
test('monitoring depth multiplies the same traffic bill and future traffic scales it', () => {
  const s = createGame();
  grantProjects(s, ['monitoring']);
  const base = bill(s, 'monitoring');
  s.upgrades.push('endpoints');
  assert.equal(bill(s, 'monitoring'), base * 1.5);
  s.upgrades.push('components');
  assert.equal(bill(s, 'monitoring'), base * 2.25);
  const detailed = bill(s, 'monitoring');
  s.customers *= 2;
  assert.equal(bill(s, 'monitoring'), detailed * 2);
});
test('project previews match the bill change and never mutate the company', () => {
  const s = createGame();
  grantProjects(s, ['database', 'host', 'monitoring']);
  const snapshot = serialize(s),
    before = economics(s).costs,
    change = projectOperatingImpact(s, 'replicas');
  const categories = projectCostChanges(s, 'replicas');
  assert.ok(Math.abs(categories.reduce((sum, row) => sum + row.change, 0) - change) < 1e-8);
  assert.ok(categories.some((row) => row.label === 'Application Costs' && row.change > 0));
  assert.equal(serialize(s), snapshot);
  s.engineering.debt += projectDebt(s, 'replicas');
  s.upgrades.push('replicas');
  assert.ok(Math.abs(economics(s).costs - before - change) < 1e-8);
  assert.equal(projectOperatingImpact(s, 'replicas'), 0);
  assert.deepEqual(projectCostChanges(s, 'replicas'), []);
});
test('cash reconciles revenue, ongoing engineering costs, and fines', () => {
  const s = createGame();
  startProject(s, 'monitoring');
  triggerIncident(s, 'security');
  advance(s, 60);
  assert.ok(
    Math.abs(
      s.cash -
        (s.funding.founderCapital + s.finance.earned - s.finance.operatingSpend - s.totals.fines),
    ) < 1e-7,
  );
});
test('value for money measures customer utility, price, and reputation, not company margin', () => {
  const s = createGame();
  const before = customerValue(s).score;
  s.upgrades.push('host');
  assert.equal(customerValue(s).score, before);
  assert.ok(customerValue(s, 'small', 50).score < before);
  s.upgrades.push('setup_guide', 'coordination_status');
  s.trust = 95;
  s.reliability = 99;
  assert.ok(customerValue(s, 'small', 45).score > before);
  const trusted = customerValue(s, 'small', 45).score;
  s.trust = 30;
  assert.ok(customerValue(s, 'small', 45).score < trusted);
});
test('publishing a price cannot retroactively change agreed revenue or subscription rates', () => {
  const s = createGame();
  const revenue = economics(s).revenue,
    rates = s.cohorts.map((c) => c.price);
  assert.equal(publishPrices(s, 44, 3900), null);
  assert.equal(economics(s).revenue, revenue);
  assert.deepEqual(
    s.cohorts.map((c) => c.price),
    rates,
  );
  assert.equal(s.pricing.small, 44);
  assert.ok(publishPrices(s, NaN, 2600));
});
test('new signups pay the new acceptable price while existing subscriptions stay locked', () => {
  const s = createGame();
  publishPrices(s, 35, 2600);
  advance(s, 2);
  assert.ok(s.lastAcquisition > 0);
  assert.equal(s.cohorts.filter((c) => c.price === 29).length, 4);
  assert.ok(s.cohorts.some((c) => c.price === 35));
});
test('only a renewing cohort adopts an acceptable new price', () => {
  const s = createGame();
  s.cohorts[0].renewAt = 1;
  publishPrices(s, 35, 2600);
  tick(s);
  assert.equal(s.cohorts.filter((c) => c.price === 29).length, 3);
  assert.ok(s.cohorts.some((c) => c.price === 35 && c.count > 5));
});
test('poor value stops signups and renewing teams leave instead of accepting the increase', () => {
  const s = createGame();
  s.cohorts[0].renewAt = 1;
  publishPrices(s, 100, 2600);
  assert.equal(customerValue(s).interested, false);
  tick(s);
  assert.equal(s.lastAcquisition, 0);
  assert.ok(s.customers < 18);
  assert.ok(s.cohorts.every((c) => c.price === 29));
  assert.ok(s.events.some((e) => e.title === 'Subscriptions not renewed'));
});
function qualifiedCompany() {
  const s = createGame(42);
  grantProjects(s, allProjects(s));
  s.reviewAt = 0;
  s.certifiedUntil = 5000;
  s.cacheWarm = 1;
  s.evidence = 40;
  s.trust = 90;
  return s;
}
test('procurement locks its quote even if published enterprise prices change', () => {
  const s = qualifiedCompany();
  assert.equal(pursue(s), null);
  publishPrices(s, 29, 15000);
  advance(s, 36);
  assert.equal(s.contract.status, 'active');
  assert.equal(s.contract.price, 2600);
  assert.equal(economics(s).contractRevenue, 2600);
});
test('an active large contract changes price only on an acceptable renewal', () => {
  const s = qualifiedCompany();
  s.contract = {
    status: 'active',
    price: 2600,
    quotedPrice: 2600,
    progress: 36,
    breach: 0,
    renewalAt: 2,
  };
  publishPrices(s, 29, 3000);
  tick(s);
  assert.equal(s.contract.price, 2600);
  assert.equal(economics(s).contractRevenue, 2600);
  tick(s);
  assert.equal(s.contract.price, 3000);
  assert.equal(s.contract.status, 'active');
});
test('an overpriced renewal cannot trigger a breach during an existing term', () => {
  const s = qualifiedCompany();
  s.contract = {
    status: 'active',
    price: 2600,
    quotedPrice: 2600,
    progress: 36,
    breach: 0,
    renewalAt: 4,
  };
  publishPrices(s, 29, 15000);
  advance(s, 3);
  assert.equal(s.contract.status, 'active');
  assert.equal(s.contract.breach, 0);
  assert.equal(economics(s).contractRevenue, 2600);
  tick(s);
  assert.equal(s.contract.status, 'prospect');
  assert.equal(economics(s).contractRevenue, 0);
  assert.ok(s.events.some((e) => e.title === 'Contract not renewed'));
});

test('product directions change acquisition, retention, value, and trend decay', () => {
  const states = Object.fromEntries(
    PRODUCT_DIRECTIONS.map((d) => {
      const s = createFreshGame(42);
      chooseDirection(s, d.id);
      s.customers = 30;
      s.cohorts = [{ count: 30, price: 29, renewAt: 360 }];
      s.trend = 68;
      tick(s);
      return [d.id, s];
    }),
  );
  assert.ok(states.network.lastAcquisition > states.practical.lastAcquisition);
  assert.ok(states.trend.lastAcquisition > states.specialist.lastAcquisition);
  assert.ok(states.specialist.lastChurn < states.practical.lastChurn);
  assert.ok(states.network.lastChurn > states.practical.lastChurn);
  assert.ok(customerValue(states.specialist).fairPrice > customerValue(states.network).fairPrice);
  assert.ok(states.trend.trend < states.practical.trend);
  assert.ok(states.specialist.trend > states.practical.trend);
  const s = createFreshGame();
  assert.ok(chooseDirection(s, 'invalid'));
  assert.equal(chooseDirection(s, 'trend'), null);
  assert.equal(s.trend, 83);
  const snapshot = serialize(s);
  assert.ok(chooseDirection(s, 'specialist'));
  assert.equal(serialize(s), snapshot);
});
test('referral growth scales with customers and remains bounded', () => {
  const low = createFreshGame(),
    high = createFreshGame(),
    capped = createFreshGame();
  for (const s of [low, high, capped]) {
    chooseDirection(s, 'network');
    grantProjects(s, ['host', 'database', 'cache', 'optimize', 'replicas']);
    s.cacheWarm = 1;
  }
  low.customers = 10;
  high.customers = 100;
  capped.customers = 150;
  tick(low);
  tick(high);
  tick(capped);
  assert.ok(high.lastAcquisition > low.lastAcquisition);
  assert.equal(high.lastAcquisition, capped.lastAcquisition);
});
test('all task durations grow with architecture effort and automation reduces time', () => {
  const s = createFreshGame();
  chooseDirection(s, 'specialist');
  const initial = projectQuote(s, 'setup_guide'),
    monitoring = projectQuote(s, 'monitoring');
  assert.equal(initial.cost, undefined);
  assert.equal(
    initial.duration,
    Math.ceil(project('setup_guide').duration * 1.25 * productParameters(s, 'setup_guide').scope),
  );
  grantProjects(s, ['replicas', 'cache', 'database', 'access']);
  const complex = projectQuote(s, 'setup_guide');
  assert.ok(complex.duration > initial.duration);
  assert.ok(projectQuote(s, 'monitoring').duration > monitoring.duration);
  s.upgrades.push('pipeline');
  const automated = projectQuote(s, 'setup_guide');
  assert.ok(automated.duration < complex.duration);
  s.cash = 5400;
  assert.equal(startProject(s, 'setup_guide'), null);
  assert.equal(s.cash, 5400);
  assert.equal(s.work[0].duration, automated.effort);
  s.upgrades.push('optimize');
  assert.equal(s.work[0].duration, automated.effort, 'active work keeps its accepted effort');
});
test('a fresh company can reach seed eligibility through normal project work', () => {
  const s = createFreshGame(42);
  chooseDirection(s, 'practical');
  buy(s, 'setup_guide');
  for (let i = 0; i < 300 && !fundingOffer(s).eligible; i++) {
    handleIncidents(s);
    tick(s);
  }
  assert.equal(fundingOffer(s).eligible, true);
  assert.ok(s.cash > 0);
  assert.equal(s.funding.raised, 0);
  assert.equal(fundingSummary(s).ownership, 1);
});
test('bootstrapping can produce operating profit while retaining full ownership', () => {
  const { state: s } = playOpening();
  assert.ok(economics(s).profit > 0);
  assert.ok(s.cash > 0);
  assert.equal(s.solvency.emergency, false);
  assert.equal(s.funding.raised, 0);
  assert.equal(fundingSummary(s).ownership, 1);
});
test('funding requires business milestones and rejects skipped or duplicate rounds atomically', () => {
  const s = createGame(),
    snapshot = serialize(s);
  assert.ok(raiseFunding(s, 'unknown'));
  assert.ok(raiseFunding(s, 'seed'));
  assert.ok(raiseFunding(s, 'a'));
  assert.equal(serialize(s), snapshot);
  s.upgrades.push('setup_guide');
  assert.equal(fundingOffer(s).eligible, true);
  assert.equal(raiseFunding(s, 'seed'), null);
  const closed = serialize(s);
  assert.ok(raiseFunding(s, 'seed'));
  assert.ok(raiseFunding(s, 'b'));
  assert.equal(serialize(s), closed);
  s.upgrades.push('monitoring');
  s.evidence = 36;
  s.customers = 30;
  s.cohorts = [{ count: 30, price: 29, renewAt: 360 }];
  assert.equal(fundingOffer(s, 'a').eligible, true);
  s.incidents.push({ type: 'release' });
  assert.equal(fundingOffer(s, 'a').eligible, false);
});
test('all four funding rounds add capital and dilute every existing shareholder proportionally', () => {
  const s = qualifiedCompany();
  s.customers = 110;
  s.cohorts = [{ count: 110, price: 29, renewAt: 360 }];
  s.contract = {
    status: 'active',
    price: 2600,
    quotedPrice: 2600,
    progress: 36,
    breach: 0,
    renewalAt: 1080,
  };
  let raised = 0;
  for (const round of FUNDING_ROUNDS) {
    const before = s.funding.shareholders.map((h) => ({ ...h })),
      cash = s.cash,
      revenue = economics(s).revenue,
      offer = fundingOffer(s, round.id);
    assert.equal(offer.eligible, true);
    assert.equal(raiseFunding(s, round.id), null);
    raised += round.investment;
    assert.equal(s.cash, cash + round.investment);
    assert.equal(s.funding.raised, raised);
    assert.equal(economics(s).revenue, revenue);
    before.forEach((h, i) =>
      assert.ok(
        Math.abs(s.funding.shareholders[i].ownership - h.ownership * (1 - offer.dilution)) < 1e-12,
      ),
    );
    assert.equal(s.funding.shareholders.at(-1).ownership, offer.dilution);
    assert.ok(Math.abs(s.funding.shareholders.reduce((n, h) => n + h.ownership, 0) - 1) < 1e-12);
  }
  assert.equal(fundingOffer(s), null);
  assert.ok(fundingSummary(s).ownership < 1);
  assert.equal(
    fundingSummary(s).founderStake,
    fundingSummary(s).valuation * fundingSummary(s).ownership,
  );
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.funding, s.funding);
  assert.equal(restored.direction, s.direction);
});
test('missed investor targets weaken offers without affecting customer trust or equity', () => {
  const s = createGame();
  grantProjects(s, ['setup_guide']);
  raiseFunding(s, 'seed');
  s.funding.rounds[0].deadline = 1;
  const control = structuredClone(s);
  control.funding.rounds[0].deadline = 100;
  tick(s);
  tick(control);
  assert.equal(s.funding.rounds[0].status, 'missed');
  assert.equal(s.funding.confidence, 75);
  assert.equal(s.trust, control.trust);
  assert.deepEqual(s.funding.shareholders, control.funding.shareholders);
  assert.ok(fundingOffer(s, 'a').preMoney < fundingOffer(control, 'a').preMoney);
  const confidence = s.funding.confidence;
  advance(s, 3);
  assert.equal(s.funding.confidence, confidence);
});
test('investor targets are measured at deadline and successful targets restore confidence', () => {
  const s = createGame();
  grantProjects(s, ['setup_guide']);
  s.funding.confidence = 75;
  raiseFunding(s, 'seed');
  const r = s.funding.rounds[0];
  r.deadline = 2;
  s.cohorts = [{ count: 100, price: 29, renewAt: 360 }];
  s.customers = 100;
  tick(s);
  assert.equal(r.status, 'pending');
  tick(s);
  assert.equal(r.status, 'met');
  assert.equal(s.funding.confidence, 85);
  advance(s, 3);
  assert.equal(s.funding.confidence, 85);
});
test('funded cash reconciles and invalid cap tables or records are rejected on reload', () => {
  const s = createGame();
  grantProjects(s, ['setup_guide']);
  raiseFunding(s, 'seed');
  buy(s, 'monitoring');
  triggerIncident(s, 'security');
  advance(s, 40);
  assert.ok(
    Math.abs(
      s.cash -
        (s.funding.founderCapital +
          s.funding.raised +
          s.finance.earned -
          s.finance.operatingSpend -
          s.totals.fines),
    ) < 1e-7,
  );
  const summary = fundingSummary(s);
  assert.ok(summary.runway === null || summary.runway >= 0);
  for (const mutate of [
    (bad) => (bad.funding.shareholders[0].ownership = 1),
    (bad) => bad.funding.raised++,
    (bad) => (bad.funding.rounds[0].dilution = 0.9),
    (bad) => (bad.funding.rounds[0].id = 'c'),
    (bad) => (bad.direction = 'unknown'),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => deserialize(serialize(bad)));
  }
  s.cash = -5;
  s.cohorts = [];
  s.customers = 0;
  assert.equal(fundingSummary(s).runway, 0);
  assert.ok(Number.isFinite(fundingSummary(s).valuation));
});

import { chooseArchitecture } from './helpers.mjs';
import { handleIncidents } from '../tools/new-game-balance.mjs';
import { project as catalogProject } from '../src/game.js';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  chooseBusinessFocus,
  DAY,
  projectQuote,
  startProject,
  abandonProject,
  engineeringMaintenance,
  projectOperatingImpact,
  projectCapacityImpact,
  economics,
  costBreakdown,
  system,
  tick,
  deploy,
  serialize,
  has,
  setAgentPlan,
} from '../src/game.js';
const company = () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, 'monolith');
  return s;
};
const advance = (s, n) => {
  for (let i = 0; i < n; i++) {
    handleIncidents(s);
    tick(s);
  }
};
const buy = (s, id) => {
  if (s.upgrades.includes(id) && !catalogProject(id).repeat) return;
  assert.equal(startProject(s, id), null);
  for (let i = 0; (s.work.length || s.ready.length || s.release) && i < 4000; i++) {
    handleIncidents(s);
    tick(s);
  }
  assert.equal(s.work.length, 0);
  if (s.ready.includes(id)) {
    assert.equal(deploy(s, id), null);
    advance(s, 30);
  }
};
const tokens = (s) => costBreakdown(s).find((r) => r.id === 'tokens').amount;

test('setup is short but major projects occupy weeks while customers arrive', () => {
  const s = company();
  assert.equal(projectQuote(s, 'monitoring').duration, 3 * DAY);
  const search = projectQuote(s, 'setup_guide');
  assert.ok(search.duration >= 18 * DAY);
  startProject(s, 'setup_guide');
  advance(s, 36);
  assert.ok(s.customers > 0);
  assert.ok(!has(s, 'setup_guide'));
  assert.equal(s.ready.length, 0);
  assert.ok(s.work[0].progress < s.work[0].duration / 4);
});
test('shipping features sequentially without capacity work causes degradation before finishing the roadmap', () => {
  const s = company();
  for (const id of ['monitoring', 'setup_guide', 'coordination_status', 'workflow_rules'])
    buy(s, id);
  assert.ok(s.time > 60 * DAY);
  assert.ok(system(s).dbLoad > 100);
  assert.ok(system(s).p95 > 1000);
  assert.ok(s.reliability < 60);
  assert.ok(s.events.some((e) => e.title === 'Service degradation detected'));
  assert.ok(!has(s, 'cache'));
  assert.ok(!has(s, 'optimize'));
});
test('feature maintenance is recurring spend and increases accepted effort without an upfront charge', () => {
  const s = company(),
    idle = tokens(s),
    quote = projectQuote(s, 'backup'),
    impact = projectOperatingImpact(s, 'setup_guide');
  assert.ok(impact > 35);
  s.upgrades.push('setup_guide');
  assert.equal(tokens(s) - idle, 35);
  assert.equal(engineeringMaintenance(s).effort, 1.2);
  s.engineering.completed = 3;
  assert.equal(projectQuote(s, 'backup').effort, Math.ceil(quote.effort * 1.2));
  const cash = s.cash;
  startProject(s, 'backup');
  assert.equal(s.cash, cash);
  const accepted = s.work[0].duration;
  s.upgrades.push('coordination_status');
  assert.equal(s.work[0].duration, accepted);
  assert.ok(projectQuote(s, 'backup').effort > accepted);
});
test('capacity estimates require component monitoring and never change live state', () => {
  const s = company();
  assert.equal(projectCapacityImpact(s, 'cache'), null);
  s.upgrades.push('monitoring', 'endpoints');
  assert.equal(projectCapacityImpact(s, 'cache'), null);
  s.upgrades.push('components');
  const snapshot = serialize(s),
    forecast = projectCapacityImpact(s, 'cache');
  assert.ok(forecast);
  assert.equal(forecast.warmCache, true);
  assert.equal(forecast.after.hitRate, 0.62);
  assert.equal(serialize(s), snapshot);
});
test('database saturation needs a read or database remedy; app replicas waste spend', () => {
  const s = company();
  s.customers = 100;
  grantProjects(s, [
    'monitoring',
    'components',
    'database',
    'host',
    'setup_guide',
    'workflow_presets',
  ]);
  const replicas = projectCapacityImpact(s, 'replicas'),
    cache = projectCapacityImpact(s, 'cache'),
    database = projectCapacityImpact(s, 'data_scale');
  assert.ok(replicas.before.dbLoad > 100);
  assert.equal(replicas.after.capacity, replicas.before.capacity);
  assert.ok(replicas.after.appLoad < replicas.before.appLoad);
  assert.ok(projectOperatingImpact(s, 'replicas') > 80);
  assert.ok(cache.after.capacity > cache.before.capacity * 1.5);
  assert.ok(database.after.capacity > database.before.capacity * 1.5);
});
test('CPU saturation needs app capacity; an unnecessary cache cannot increase throughput', () => {
  const s = company();
  s.customers = 70;
  s.databaseTier = 2;
  grantProjects(s, ['monitoring', 'components', 'database']);
  const replicas = projectCapacityImpact(s, 'replicas'),
    cache = projectCapacityImpact(s, 'cache');
  assert.ok(replicas.before.appLoad > 100);
  assert.ok(replicas.after.capacity >= replicas.before.capacity * 1.9);
  assert.equal(cache.after.capacity, cache.before.capacity);
});
test('report consumers fix background throughput without increasing request capacity', () => {
  const s = company();
  s.customers = 55;
  grantProjects(s, [
    'monitoring',
    'components',
    'workflow_rules',
    'jobs',
    'database',
    'host',
    'optimize',
  ]);
  const worker = projectCapacityImpact(s, 'workers');
  assert.equal(worker.after.capacity, worker.before.capacity);
  assert.equal(
    worker.after.background.reports.capacity,
    worker.before.background.reports.capacity + 8,
  );
  assert.ok(worker.before.background.reports.incoming > worker.before.background.reports.capacity);
  assert.ok(worker.after.background.reports.incoming < worker.after.background.reports.capacity);
});
test('abandoning a draft frees its slot, discards progress, and never refunds paid tokens', () => {
  const s = company();
  s.engineering.unlocked.push('coordination_status');
  setAgentPlan(s, 'parallel');
  startProject(s, 'setup_guide');
  startProject(s, 'coordination_status');
  advance(s, 12);
  const cash = s.cash,
    spend = s.finance.operatingSpend,
    other = { ...s.work[1] };
  assert.equal(abandonProject(s, 'setup_guide'), null);
  assert.deepEqual(s.work, [other]);
  assert.equal(s.cash, cash);
  assert.equal(s.finance.operatingSpend, spend);
  assert.equal(startProject(s, 'monitoring'), null);
  assert.match(abandonProject(s, 'unknown'), /No unfinished/);
  assert.equal(abandonProject(s, 'monitoring'), null);
  assert.equal(startProject(s, 'setup_guide'), null);
  assert.equal(s.work.find((w) => w.id === 'setup_guide').progress, 0);
  s.solvency.closedAt = s.time;
  assert.match(abandonProject(s, 'coordination_status'), /closed/);
});
test('capacity work alone keeps a focused bootstrap healthy but cannot guarantee early profitability', () => {
  const s = company();
  chooseBusinessFocus(s, 'bootstrap');
  for (const id of ['monitoring', 'setup_guide', 'components', 'optimize', 'host', 'cache'])
    buy(s, id);
  advance(s, 360);
  assert.equal(s.upgrades.length, 7);
  assert.ok(s.customers > 20);
  assert.ok(s.reliability > 95);
  assert.ok(system(s).p95 < 400);
  assert.ok(economics(s).profit < 0);
  assert.ok(s.cash > 0);
  assert.equal(s.funding.raised, 0);
  assert.equal(s.funding.raised, 0);
  assert.equal(s.funding.shareholders[0].ownership, 1);
});

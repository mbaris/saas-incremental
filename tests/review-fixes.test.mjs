import { chooseArchitecture } from './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  chooseBusinessFocus,
  startProject,
  queueProject,
  setAgentPlan,
  tick,
  serialize,
  developmentForecast,
  projectCapacityImpact,
  productActionImpact,
  system,
  customerValue,
  visibleMetrics,
  triggerIncident,
  pendingIncident,
  communicate,
  respond,
  deferIncident,
  rollback,
  deserialize,
} from '../src/game.js';
import { grantProjects } from './helpers.mjs';
const company = () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, 'monolith');
  return s;
};
test('development forecast matches parallel completion and queue dispatch without mutating state', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  startProject(s, 'monitoring');
  startProject(s, 'review');
  queueProject(s, 'analyse_setup');
  const saved = serialize(s),
    forecast = developmentForecast(s);
  assert.equal(serialize(s), saved);
  const finishes = {},
    starts = { monitoring: 0, review: 0 };
  for (let t = 1; t < 1000 && Object.keys(finishes).length < 3; t++) {
    const before = s.work.map((w) => w.id);
    tick(s);
    for (const id of before) if (!s.work.some((w) => w.id === id)) finishes[id] = t;
    for (const w of s.work) if (starts[w.id] === undefined) starts[w.id] = t;
  }
  for (const [id, finish] of Object.entries(finishes)) {
    assert.equal(forecast.rows[id].finish, finish, id);
    assert.equal(forecast.rows[id].start, starts[id], id);
  }
  assert.equal(Object.keys(finishes).length, 3);
});
test('forecast exposes budget pauses, incident delays, and recovery blockers', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  startProject(s, 'monitoring');
  startProject(s, 'review');
  const parallel = developmentForecast(s);
  s.agentPlan = 'lean';
  const lean = developmentForecast(s);
  assert.ok(lean.next > parallel.next);
  assert.ok(lean.rows.review.start >= lean.rows.monitoring.finish);
  s.response = { id: 1, remaining: 12 };
  assert.equal(developmentForecast(s).next, lean.next + 12);
  s.solvency.emergency = true;
  assert.equal(developmentForecast(s).rows.review.blocked, 'Cash recovery');
});
test('uncapped forecasts reveal capacity improvements while component metrics remain gated', () => {
  const s = company();
  s.customers = 1000;
  grantProjects(s, ['monitoring', 'components', 'database', 'setup_guide']);
  const before = system(s),
    preview = projectCapacityImpact(s, 'host');
  assert.ok(before.appLoad > 200);
  assert.ok(before.dbLoad > 200);
  assert.ok(preview.after.appLoad < preview.before.appLoad);
  assert.equal(visibleMetrics(s).capacity, before.capacity);
  assert.ok(visibleMetrics(s).bottleneck);
  s.upgrades = s.upgrades.filter((id) => id !== 'components');
  assert.equal(visibleMetrics(s).capacity, null);
  assert.equal(visibleMetrics(s).bottleneck, null);
});
test('refinement forecast describes incremental effects rather than repeating initial feature costs', () => {
  const s = company();
  grantProjects(s, ['setup_guide']);
  const before = serialize(s),
    first = productActionImpact(s, 'refine_setup_guide');
  assert.equal(first.upkeep, 6);
  assert.ok(Math.abs(first.effort - 0.04) < 1e-9);
  assert.ok(Math.abs(first.app - 0.004) < 1e-9);
  assert.ok(first.fairPrice > 0);
  assert.equal(serialize(s), before);
  s.upgrades.push('refine_setup_guide');
  s.engineering.levels.refine_setup_guide = 1;
  const second = productActionImpact(s, 'refine_setup_guide');
  assert.ok(second.fairPrice < first.fairPrice);
  assert.equal(second.upkeep, 6);
  assert.ok(second.duration > first.duration);
});
test('growth trades retention for acquisition and enterprise value is an ongoing benefit', () => {
  const balanced = company(),
    growth = company();
  for (const s of [balanced, growth]) {
    s.customers = 20;
    s.cohorts = [{ count: 20, price: 29, renewAt: 360 }];
  }
  chooseBusinessFocus(growth, 'growth');
  tick(balanced);
  tick(growth);
  assert.ok(growth.lastAcquisition > balanced.lastAcquisition);
  assert.ok(growth.lastChurn > balanced.lastChurn);
  const base = customerValue(balanced, 'enterprise').fairPrice;
  chooseBusinessFocus(balanced, 'enterprise');
  assert.ok(Math.abs(customerValue(balanced, 'enterprise').fairPrice - base * 1.15) < 1e-8);
  balanced.contract.status = 'active';
  balanced.contract.price = 2600;
  chooseBusinessFocus(balanced, 'balanced');
  assert.equal(balanced.contract.price, 2600);
  assert.equal(customerValue(balanced, 'enterprise').fairPrice, base);
});

test('detected incidents wait indefinitely for a saved player decision even at maximum speed', () => {
  const s = company();
  startProject(s, 'monitoring');
  s.speed = 8;
  triggerIncident(s, 'release');
  for (let i = 0; i < 40; i++) tick(s);
  assert.ok(pendingIncident(s));
  assert.equal(developmentForecast(s).rows.monitoring.blocked, 'Incident decision required');
  assert.equal(s.paused, true);
  assert.equal(s.response, null);
  const snapshot = serialize(s),
    saved = deserialize(snapshot);
  for (let i = 0; i < 200; i++) tick(saved);
  assert.equal(serialize(saved), snapshot);
  const time = s.time;
  s.paused = false;
  tick(s);
  assert.equal(s.time, time, 'speed/resume cannot bypass a decision');
  communicate(s, s.incidents[0].id);
  assert.ok(pendingIncident(s), 'communication alone does not repair or resume');
  respond(s, s.incidents[0].id);
  assert.equal(pendingIncident(s), undefined);
  assert.equal(s.paused, false);
  const progress = s.work[0].progress;
  tick(s);
  assert.equal(s.work[0].progress, progress);
  for (let i = 0; i < 30; i++) tick(s);
  assert.equal(s.incidents.length, 0);
  assert.ok(s.work[0].progress > progress);
});
test('deferring leaves damage active; rolling back resolves the decision and withdraws its release', () => {
  const s = company();
  triggerIncident(s, 'release');
  for (let i = 0; i < 10; i++) tick(s);
  deferIncident(s, s.incidents[0].id);
  const time = s.time;
  tick(s);
  assert.equal(s.time, time + 1);
  assert.equal(s.incidents.length, 1);
  assert.equal(s.response, null);
  const other = company();
  other.upgrades.push('monitoring');
  other.lastRelease = {
    id: 'monitoring',
    wasInstalled: false,
    previousTrend: 68,
    previousLevel: 0,
  };
  triggerIncident(other, 'release');
  for (let i = 0; i < 10; i++) tick(other);
  assert.ok(pendingIncident(other));
  rollback(other);
  assert.equal(other.incidents.length, 0);
  assert.equal(other.paused, false);
  assert.ok(!other.upgrades.includes('monitoring'));
});
test('two detected incidents each need a decision without interrupting an existing repair', () => {
  const s = company();
  triggerIncident(s, 'security');
  triggerIncident(s, 'release');
  for (let i = 0; i < 10; i++) tick(s);
  respond(s, pendingIncident(s).id);
  tick(s);
  assert.ok(pendingIncident(s));
  const response = s.response.id;
  deferIncident(s, pendingIncident(s).id);
  assert.equal(s.response.id, response);
  assert.equal(s.paused, false);
});

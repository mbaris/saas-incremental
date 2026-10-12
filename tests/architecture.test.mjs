import { chooseArchitecture } from './helpers.mjs';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import { architecture } from '../src/architecture.ts';
import {
  createGame,
  chooseDirection,
  PROJECTS,
  projectQuote,
  startProject,
  tick,
  system,
  economics,
  costBreakdown,
  visibleMetrics,
  customerValue,
  projectOperatingImpact,
  serialize,
  deserialize,
} from '../src/game.js';
import { availableProjects, projectDebt } from '../src/game.js';
const advance = (s, n) => {
  for (let i = 0; i < n; i++) tick(s);
};
const company = (path = 'monolith') => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, path);
  s.customers = 100;
  s.cohorts = [{ count: 100, price: 29, renewAt: 360 }];
  return s;
};
const bill = (s, id) => costBreakdown(s).find((row) => row.id === id).amount;

test('the basic architecture stays a monolith and shared database', () => {
  const s = company(),
    g = architecture(s);
  assert.equal(g.nodes.length, 3);
  assert.equal(g.edges.length, 2);
  assert.equal(g.complexity, 1);
  assert.equal(g.queues, 0);
  assert.equal(g.consumers, 0);
  assert.equal(g.topics, 0);
});
test('the expanded graph supports distinct applications, databases, queues, topics, and many consumers', () => {
  const s = company('services');
  grantProjects(s, allProjects(s));
  s.workerReplicas = 7;
  const g = architecture(s),
    ids = new Set(g.nodes.map((n) => n.id));
  assert.equal(g.applications, 4);
  assert.equal(g.databases, 4);
  assert.equal(g.queues, 2);
  assert.equal(g.topics, 3);
  assert.equal(g.consumers, 10);
  assert.ok(g.nodes.length >= 25);
  assert.equal(ids.size, g.nodes.length);
  for (const e of g.edges) {
    assert.ok(ids.has(e.from));
    assert.ok(ids.has(e.to));
  }
  for (const n of g.nodes) {
    assert.ok(n.x + n.width <= g.width);
    assert.ok(n.y + n.height <= g.height);
  }
  const positions = g.nodes.map((n) => n.x + ',' + n.y);
  assert.equal(new Set(positions).size, positions.length);
  assert.ok(g.complexity > 2);
  assert.ok(
    projectQuote(s, 'monitoring').duration > projectQuote(company(), 'monitoring').duration,
  );
});
test('engineering spends through elapsed time and token activity rather than task prices', () => {
  const idle = company(),
    working = company(),
    cash = working.cash;
  assert.equal(startProject(working, 'setup_guide'), null);
  assert.equal(working.cash, cash);
  assert.equal(bill(idle, 'founder'), bill(working, 'founder'));
  assert.ok(bill(working, 'tokens') > bill(idle, 'tokens'));
  const expected = economics(working).costs / 360;
  tick(working);
  tick(idle);
  assert.ok(Math.abs(working.finance.operatingSpend - expected) < 1e-9);
  assert.ok(working.cash < idle.cash);
  assert.ok(PROJECTS.every((p) => !Object.hasOwn(p, 'cost')));
  assert.equal(working.finance.projectSpend, undefined);
});
test('background reports reduce foreground work but can accumulate real backlog', () => {
  const s = company();
  grantProjects(s, ['workflow_rules', 'database', 'host', 'optimize']);
  const inline = system(s);
  s.upgrades.push('jobs');
  const queued = system(s);
  assert.ok(queued.appLoad < inline.appLoad);
  assert.ok(queued.p95 < inline.p95);
  advance(s, 30);
  assert.ok(s.background.reports > 120);
  assert.ok(s.events.some((e) => e.title === 'Customers report delayed updates'));
  s.upgrades.push('monitoring', 'components');
  assert.ok(visibleMetrics(s).background.reports.backlog > 0);
  const before = s.background.reports;
  s.workerReplicas = 4;
  advance(s, 60);
  assert.ok(s.background.reports < before);
  assert.ok(s.background.reports < 40);
  assert.ok(s.events.some((e) => e.title === 'Background processing recovered'));
});
test('separate search and report stores isolate primary database work and add scoped costs', () => {
  const s = company('services');
  grantProjects(s, ['setup_guide', 'workflow_rules', 'jobs', 'database', 'service_scale']);
  const before = system(s),
    beforeBill = economics(s).costs;
  s.upgrades.push('search_service', 'report_service');
  const after = system(s);
  assert.ok(after.dbLoad < before.dbLoad);
  assert.ok(economics(s).costs > beforeBill);
  assert.ok(after.searchLoad > 0);
  assert.ok(after.reportLoad > 0);
  assert.ok(after.background.reports.capacity > before.background.reports.capacity);
  assert.equal(architecture(s).databases, 3);
  assert.ok(bill(s, 'databases') > 90);
  assert.ok(bill(s, 'applications') > 160);
});
test('consumer backlog lowers delivered feature value and respects monitoring visibility', () => {
  const s = company();
  grantProjects(s, ['events', 'notifications', 'analytics', 'monitoring']);
  s.background.notifications = 1500;
  s.background.analytics = 500;
  const stale = customerValue(s).fairPrice;
  assert.equal(visibleMetrics(s).background, null);
  s.background.notifications = 0;
  s.background.analytics = 0;
  assert.ok(customerValue(s).fairPrice > stale);
  s.upgrades.push('components');
  assert.ok(visibleMetrics(s).background);
  assert.ok(bill(s, 'events') > 0);
  assert.ok(bill(s, 'queues') > 0);
  assert.ok(bill(s, 'analytics') > 0);
});
test('report worker scaling has no upfront charge and forecasts the ongoing bill', () => {
  const s = company();
  grantProjects(s, ['workflow_rules', 'jobs']);
  const before = economics(s).costs,
    forecast = projectOperatingImpact(s, 'workers'),
    cash = s.cash;
  const installed = structuredClone(s);
  installed.engineering.debt += projectDebt(s, 'workers');
  installed.upgrades.push('workers');
  installed.workerReplicas = 1;
  assert.ok(
    Math.abs(economics(installed).costs - before - forecast) < 1e-9,
    'forecast uses current traffic',
  );
  const compute = bill(s, 'workers');
  assert.equal(startProject(s, 'workers'), null);
  assert.equal(s.cash, cash);
  advance(s, s.work[0].duration);
  assert.equal(s.workerReplicas, 1);
  assert.equal(architecture(s).consumers, 2);
  assert.equal(bill(s, 'workers') - compute, 45);
  const locked = projectQuote(s, 'workers').duration;
  assert.ok(locked > 24);
  s.workerReplicas = 7;
  assert.match(startProject(s, 'workers'), /Eight/);
});
test('expanded workloads stay bounded and preserve queue and worker state in saves', () => {
  const s = company('services');
  grantProjects(s, allProjects(s));
  s.workerReplicas = 2;
  s.customers = 500;
  s.cohorts = [{ count: 500, price: 29, renewAt: 360 }];
  advance(s, 1000);
  for (const n of Object.values(s.background)) {
    assert.ok(Number.isFinite(n));
    assert.ok(n >= 0 && n <= 10000);
  }
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.background, s.background);
  assert.equal(restored.workerReplicas, 2);
  for (const mutate of [
    (bad) => (bad.background.reports = -1),
    (bad) => (bad.workerReplicas = 8),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => deserialize(serialize(bad)));
  }
});

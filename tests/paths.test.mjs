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
  availableProjects,
  project,
  startProject,
  projectQuote,
  projectOperatingImpact,
  deploy,
  tick,
  system,
  economics,
  costBreakdown,
  visibleMetrics,
  requirements,
  pursue,
  raiseFunding,
  fundingOffer,
  serialize,
  deserialize,
} from '../src/game.js';
import { architecture } from '../src/architecture.ts';
import { projectDebt } from '../src/game.js';
import { publishPrices } from '../src/game.js';
const company = (path, focus = 'balanced') => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, path);
  chooseBusinessFocus(s, focus);
  return s;
};
const bill = (s, id) => costBreakdown(s).find((r) => r.id === id).amount;
const advance = (s, n) => {
  for (let i = 0; i < n; i++) {
    handleIncidents(s);
    tick(s);
  }
};
const buy = (s, id) => {
  if (s.upgrades.includes(id) && !catalogProject(id).repeat) return;
  assert.equal(startProject(s, id), null);
  for (let i = 0; (s.work.length || s.ready.length || s.release) && i < 10000; i++) {
    handleIncidents(s);
    tick(s);
  }
  assert.equal(s.work.length, 0);
  if (s.ready.length) {
    assert.equal(deploy(s), null);
    for (let i = 0; s.release && i < 200; i++) tick(s);
    advance(s, 20);
  }
};
const customers = (s, count) => {
  s.customers = count;
  s.cohorts = [{ count, price: 29, renewAt: 360 }];
};

test('companies start on a monolith without a founding architecture choice', () => {
  const s = createGame();
  chooseDirection(s, 'practical');
  assert.equal(s.architecturePath, 'monolith');
  assert.match(startProject(s, 'host'), /Needs|Unlocks/);
  assert.equal(startProject(s, 'monitoring'), null);
  assert.ok(availableProjects(s).some((p) => p.id === 'search_service'));
});
test('all three roadmaps hide incompatible tasks and reject stale project actions', () => {
  const expected = {
    monolith: [
      'host',
      'optimize',
      'modules',
      'search_service',
      'report_service',
      'replicas',
      'workers',
    ],
    services: [
      'host',
      'optimize',
      'modules',
      'search_service',
      'report_service',
      'service_scale',
      'contracts',
      'replicas',
      'workers',
    ],
    functions: ['concurrency', 'warm'],
  };
  const exclusive = [
    'host',
    'optimize',
    'modules',
    'search_service',
    'report_service',
    'service_scale',
    'contracts',
    'replicas',
    'workers',
    'concurrency',
    'warm',
  ];
  for (const path of Object.keys(expected)) {
    const s = company(path),
      ids = availableProjects(s).map((p) => p.id);
    for (const id of exclusive) {
      assert.equal(ids.includes(id), expected[path].includes(id), `${path}: ${id}`);
      if (!ids.includes(id)) {
        const before = serialize(s);
        assert.match(startProject(s, id), /Unavailable/);
        assert.equal(serialize(s), before);
      }
    }
    for (const id of [
      'monitoring',
      'setup_guide',
      'coordination_status',
      'cache',
      'workflow_rules',
      'jobs',
      'events',
      'notifications',
      'analytics',
      'backup',
      'pipeline',
      'certification',
      'data_scale',
    ])
      assert.ok(ids.includes(id), `${path}: shared ${id}`);
  }
});
test('monolith queues remain viable and shared modules shorten feature work', () => {
  const s = company('monolith');
  grantProjects(s, ['workflow_rules', 'version']);
  customers(s, 25);
  const before = projectQuote(s, 'setup_guide').duration;
  buy(s, 'modules');
  assert.ok(projectQuote(s, 'setup_guide').duration < before);
  buy(s, 'jobs');
  assert.equal(architecture(s).applications, 1);
  assert.equal(architecture(s).consumers, 1);
  assert.ok(availableProjects(s).includes(project('report_service')));
});
test('services have coordination overhead and scaling multiplies all application bills', () => {
  const s = company('services'),
    mono = company('monolith');
  assert.ok(projectQuote(s, 'setup_guide').duration > projectQuote(mono, 'setup_guide').duration);
  grantProjects(s, [
    'database',
    'setup_guide',
    'search_service',
    'workflow_rules',
    'jobs',
    'report_service',
  ]);
  customers(s, 150);
  const before = system(s),
    cost = bill(s, 'applications');
  s.upgrades.push('service_scale');
  const after = system(s);
  assert.equal(bill(s, 'applications'), cost * 2);
  assert.ok(after.appLoad < before.appLoad);
  assert.ok(after.searchLoad < before.searchLoad);
});
test('functions use managed storage and usage bills without permanent servers or workers', () => {
  const s = company('functions');
  assert.equal(bill(s, 'applications'), 0);
  assert.equal(bill(s, 'functions'), 0);
  assert.ok(bill(s, 'databases') > 0);
  customers(s, 10);
  const quiet = bill(s, 'functions');
  assert.ok(quiet > 0);
  customers(s, 20);
  assert.ok(bill(s, 'functions') > quiet);
  grantProjects(s, [
    'workflow_rules',
    'jobs',
    'coordination_status',
    'events',
    'notifications',
    'analytics',
  ]);
  assert.equal(bill(s, 'workers'), 0);
  const g = architecture(s);
  assert.equal(g.applications, 0);
  assert.equal(g.consumers, 0);
  assert.equal(g.functions, 4);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) {
    assert.ok(ids.has(e.from));
    assert.ok(ids.has(e.to));
  }
  assert.ok(
    g.nodes
      .filter((n) => n.type === 'function')
      .every((n) => n.detail.includes('execution') || n.detail.includes('capacity')),
  );
});
test('function concurrency and warm reservations change capacity, lag, latency, and bills', () => {
  const s = company('functions');
  customers(s, 40);
  grantProjects(s, ['workflow_rules', 'jobs', 'monitoring']);
  const before = system(s),
    forecast = projectOperatingImpact(s, 'concurrency');
  const installed = structuredClone(s);
  installed.engineering.debt += projectDebt(s, 'concurrency');
  installed.functionTier = 1;
  installed.upgrades.push('concurrency');
  assert.ok(Math.abs(economics(installed).costs - economics(s).costs - forecast) < 1e-8);
  buy(s, 'concurrency');
  assert.equal(s.functionTier, 1);
  assert.ok(system(s).capacity > before.capacity);
  assert.equal(system(s).background.reports.capacity, before.background.reports.capacity * 2);
  customers(s, 5);
  s.queue = 0;
  const cold = system(s).p95;
  s.upgrades.push('warm');
  assert.ok(system(s).p95 < cold);
  assert.equal(
    system(s).coldStart,
    system({ ...s, upgrades: s.upgrades.filter((id) => id !== 'warm') }).coldStart * 0.1,
  );
  assert.ok(
    projectOperatingImpact({ ...s, upgrades: s.upgrades.filter((id) => id !== 'warm') }, 'warm') >
      80,
  );
  s.functionTier = 4;
  assert.match(startProject(s, 'concurrency'), /Maximum/);
});
test('primary database scaling works in all paths without raising unrelated hosting', () => {
  for (const path of ['monolith', 'services', 'functions']) {
    const s = company(path);
    grantProjects(s, ['monitoring']);
    if (path !== 'functions') {
      assert.match(startProject(s, 'data_scale'), /dedicated/);
      s.upgrades.push('database');
    }
    customers(s, 100);
    const app = bill(s, 'applications'),
      before = system(s).dbLoad;
    buy(s, 'data_scale');
    assert.equal(s.databaseTier, 1);
    assert.ok(system(s).dbLoad < before);
    assert.equal(bill(s, 'databases'), bill({ ...s, databaseTier: 0 }, 'databases') * 2);
    assert.equal(bill(s, 'applications'), app);
    s.databaseTier = 3;
    assert.match(startProject(s, 'data_scale'), /Maximum/);
  }
});
test('business focus changes acquisition and retention independently of architecture', () => {
  for (const path of ['monolith', 'services', 'functions']) {
    const balanced = company(path),
      growth = company(path, 'growth'),
      lean = company(path, 'bootstrap');
    for (const s of [balanced, growth, lean]) customers(s, 5);
    tick(balanced);
    tick(growth);
    tick(lean);
    assert.ok(growth.lastAcquisition > balanced.lastAcquisition);
    assert.ok(lean.lastAcquisition < balanced.lastAcquisition);
    assert.ok(lean.lastChurn < balanced.lastChurn);
    assert.equal(bill(growth, 'marketing'), 0);
    assert.equal(bill(lean, 'marketing'), 0);
    const ownership = serialize(growth.funding);
    chooseBusinessFocus(growth, 'enterprise');
    assert.equal(growth.architecturePath, path);
    assert.equal(serialize(growth.funding), ownership);
    assert.equal(growth.businessFocus, 'enterprise');
  }
});
test('each architecture can sustain a profitable bootstrapped product with full ownership', () => {
  for (const path of ['monolith', 'services', 'functions']) {
    const s = company(path, 'bootstrap');
    buy(s, 'monitoring');
    buy(s, 'setup_guide');
    buy(s, 'cache');
    if (path !== 'functions') buy(s, 'database');
    else buy(s, 'concurrency');
    buy(s, 'coordination_status');
    advance(s, 360);
    if (path === 'monolith') {
      buy(s, 'optimize');
      buy(s, 'host');
    } else if (path === 'services') buy(s, 'service_scale');
    else buy(s, 'concurrency');
    assert.equal(publishPrices(s, 45, 2600), null);
    advance(s, 3000);
    assert.ok(economics(s).profit > 0, `${path} profit ${economics(s).profit}`);
    assert.equal(s.solvency.emergency, false);
    assert.ok(s.cash > 0);
    assert.equal(s.funding.raised, 0);
    assert.equal(s.funding.shareholders[0].ownership, 1);
  }
});
test('enterprise eligibility and optional funding work on every architecture', () => {
  for (const path of ['monolith', 'services', 'functions']) {
    const s = company(path, 'enterprise');
    grantProjects(s, [
      'setup_guide',
      'workflow_presets',
      'coordination_status',
      'access',
      'audit',
      'backup',
      'review',
      'monitoring',
      'cache',
      'pipeline',
    ]);
    s.reviewAt = 0;
    s.certifiedUntil = 5000;
    s.evidence = 40;
    s.cacheWarm = 1;
    s.trust = 90;
    if (path === 'functions') {
      s.upgrades.push('concurrency');
      s.functionTier = 2;
    } else s.upgrades.push('database', 'replicas');
    customers(s, 20);
    assert.ok(requirements(s).every(([, ok]) => ok));
    assert.equal(pursue(s), null);
    advance(s, 24);
    assert.equal(s.contract.status, 'active');
    assert.ok(fundingOffer(s).eligible);
    assert.equal(raiseFunding(s, 'seed'), null);
    assert.equal(s.architecturePath, path);
    assert.ok(s.funding.shareholders[0].ownership < 1);
  }
});
test('saves retain path, focus, and capacity tiers and reject incompatible installed or pending tasks', () => {
  const s = company('functions', 'growth');
  s.functionTier = 2;
  s.databaseTier = 1;
  grantProjects(s, ['concurrency', 'data_scale', 'monitoring']);
  s.engineering.completed = 3;
  assert.equal(startProject(s, 'warm'), null);
  const restored = deserialize(serialize(s));
  assert.equal(restored.architecturePath, 'functions');
  assert.equal(restored.businessFocus, 'growth');
  assert.equal(restored.functionTier, 2);
  assert.equal(restored.databaseTier, 1);
  assert.deepEqual(restored.work, s.work);
  for (const mutate of [
    (bad) => bad.upgrades.push('replicas'),
    (bad) => (bad.work[0].id = 'search_service'),
    (bad) => (bad.architecturePath = 'other'),
    (bad) => (bad.businessFocus = 'other'),
    (bad) => (bad.functionTier = 5),
    (bad) => (bad.databaseTier = 4),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => deserialize(serialize(bad)));
  }
});

test('function cold-start evidence requires component monitoring', () => {
  const s = company('functions');
  customers(s, 5);
  assert.equal(visibleMetrics(s), null);
  grantProjects(s, ['monitoring']);
  assert.equal(visibleMetrics(s).coldStart, null);
  s.upgrades.push('components');
  assert.ok(visibleMetrics(s).coldStart > 0);
  s.upgrades.push('warm');
  assert.ok(visibleMetrics(s).coldStart < 30);
});

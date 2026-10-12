import { chooseArchitecture } from './helpers.mjs';
import { handleIncidents } from '../tools/new-game-balance.mjs';
import { project as catalogProject } from '../src/game.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  foundCompany,
  unlockedProjects,
  commitProduct,
  analyseProduct,
  startProject,
  abandonProject,
  projectQuote,
  productParameters,
  productEffects,
  hasCapability,
  economics,
  customerValue,
  requirements,
  fundingOffer,
  serialize,
  deserialize,
  tick,
  deploy,
  rollback,
  setAgentPlan,
  triggerIncident,
  respond,
  DAY,
} from '../src/game.js';
import { grantProjects } from './helpers.mjs';
const company = (seed = 42, direction = 'practical') => {
  const s = createGame(seed);
  foundCompany(s, { founder: 'generalist', capital: 25000, direction });
  return s;
};
const advance = (s, n) => {
  for (let i = 0; i < n; i++) {
    handleIncidents(s);
    tick(s);
  }
};
const finish = (s, id) => {
  if (s.upgrades.includes(id) && !catalogProject(id).repeat) return;
  assert.equal(startProject(s, id), null);
  for (
    let i = 0;
    (s.work.some((w) => w.id === id) || s.ready.includes(id) || s.release?.id === id) && i < 4000;
    i++
  ) {
    handleIncidents(s);
    tick(s);
  }
  assert.ok(!s.work.some((w) => w.id === id));
  if (s.ready.includes(id)) {
    assert.equal(deploy(s, id), null);
    for (let i = 0; s.release && i < 300; i++) tick(s);
    assert.equal(s.release, null);
  }
};

test('founder ideas and prospect signals work at zero customers, independently of engineering unlocks', () => {
  const s = company();
  assert.equal(s.customers, 0);
  assert.equal(s.product.signals[0].source, 'Prospects');
  assert.ok(!unlockedProjects(s).some((p) => p.product || p.research));
  assert.equal(commitProduct(s, 'workflow_presets'), null);
  assert.equal(s.product.selected.workflow, 'workflow_presets');
  assert.ok(!s.product.analysed.workflow);
  assert.equal(s.cash, 25000);
  assert.equal(hasCapability(s, 'workflow'), false);
});
test('research costs time and tokens but never grants capabilities, debt, experience, condition or reputation', () => {
  const analysed = company(),
    idle = company();
  assert.equal(analyseProduct(analysed, 'setup'), null);
  advance(analysed, 40);
  advance(idle, 40);
  assert.equal(analysed.product.analysed.setup, true);
  assert.deepEqual(analysed.upgrades, ['version']);
  assert.equal(analysed.ready.length, 0);
  assert.equal(analysed.engineering.completed, 0);
  assert.equal(analysed.engineering.debt, 0);
  assert.equal(analysed.engineering.wear, idle.engineering.wear);
  assert.equal(analysed.trend, idle.trend);
  assert.equal(analysed.trust, idle.trust);
  assert.equal(customerValue(analysed).score, customerValue(idle).score);
  assert.ok(analysed.cash < idle.cash);
  assert.match(analyseProduct(analysed, 'setup'), /already analysed/);
  assert.ok(!fundingOffer(analysed).eligible);
});
test('analysis reveals stable fit and scope without rerolls or cheaper underlying work', () => {
  const direct = company(),
    analysed = company();
  const before = productParameters(direct, 'setup_guide');
  analyseProduct(analysed, 'setup');
  advance(analysed, 40);
  advance(direct, 40);
  assert.deepEqual(productParameters(analysed, 'setup_guide'), before);
  assert.equal(
    projectQuote(direct, 'setup_guide').effort,
    projectQuote(analysed, 'setup_guide').effort,
  );
  commitProduct(direct, 'setup_guide');
  abandonProject(direct, 'setup_guide');
  assert.deepEqual(productParameters(deserialize(serialize(direct)), 'setup_guide'), before);
  assert.equal(commitProduct(direct, 'setup_configuration'), null);
  assert.equal(direct.product.selected.setup, 'setup_configuration');
});
test('directions and fixed market seeds change relative fit without using the incident random stream', () => {
  const practical = company(42),
    network = company(42, 'network'),
    other = company(1);
  assert.ok(
    productParameters(practical, 'workflow_presets').smallFit >
      productParameters(network, 'workflow_presets').smallFit,
  );
  assert.ok(
    productParameters(network, 'coordination_status').smallFit >
      productParameters(practical, 'coordination_status').smallFit,
  );
  assert.notDeepEqual(
    productParameters(practical, 'setup_guide'),
    productParameters(other, 'setup_guide'),
  );
  const before = productParameters(practical, 'setup_guide');
  practical.seed = 12345;
  advance(practical, 130);
  assert.deepEqual(productParameters(practical, 'setup_guide'), before);
});
test('research shares scarce slots, incident interruption and budget suspension without infrastructure effort inflation', () => {
  const s = company();
  analyseProduct(s, 'setup');
  const before = serialize(s);
  assert.match(commitProduct(s, 'workflow_presets'), /occupied/);
  assert.equal(serialize(s), before);
  triggerIncident(s, 'release');
  advance(s, 9);
  respond(s, s.incidents[0].id);
  const progress = s.work[0].progress;
  advance(s, 12);
  assert.equal(s.work[0].progress, progress);
  setAgentPlan(s, 'parallel');
  assert.equal(commitProduct(s, 'workflow_presets'), null);
  setAgentPlan(s, 'lean');
  advance(s, 1);
  assert.equal(s.work[1].progress, 0);
  s.solvency.emergency = true;
  const paused = s.work.map((w) => w.progress);
  advance(s, 3);
  assert.deepEqual(
    s.work.map((w) => w.progress),
    paused,
  );
  const plain = company(),
    complex = company();
  grantProjects(complex, ['monitoring', 'components', 'database', 'cache', 'version']);
  complex.engineering.debt = 100;
  complex.engineering.wear = 80;
  assert.equal(
    projectQuote(plain, 'analyse_setup').duration,
    projectQuote(complex, 'analyse_setup').duration,
  );
});
test('approach selection is exclusive and rejected or abandoned commitments are atomic', () => {
  const s = company(),
    before = serialize(s);
  assert.ok(commitProduct(s, 'coordination_approvals'));
  assert.equal(serialize(s), before);
  commitProduct(s, 'setup_guide');
  assert.match(commitProduct(s, 'setup_configuration'), /Another approach/);
  abandonProject(s, 'setup_guide');
  assert.equal(s.product.selected.setup, undefined);
  assert.equal(commitProduct(s, 'setup_configuration'), null);
});
test('only shipping grants value, load, upkeep and funding evidence; debt is paid at development completion', () => {
  const s = company();
  commitProduct(s, 'setup_guide');
  for (let i = 0; s.work.length && i < 1000; i++) tick(s);
  assert.equal(s.release.id, 'setup_guide');
  assert.equal(productEffects(s).features.length, 0);
  assert.equal(s.engineering.debt, 6);
  assert.ok(!fundingOffer(s).eligible);
  advance(s, 80);
  assert.equal(hasCapability(s, 'setup'), true);
  assert.ok(productEffects(s).value > 0);
  assert.equal(economics(s).breakdown.find((r) => r.id === 'tokens').amount, 50);
  assert.equal(s.engineering.debt, 6);
  assert.ok(fundingOffer(s).eligible);
});
test('refinement and rollback restore product fit, effects, and selection while retaining debt and spending', () => {
  const s = company();
  s.upgrades.push('version');
  finish(s, 'setup_guide');
  const initial = productEffects(s).value;
  finish(s, 'refine_setup_guide');
  const debt = s.engineering.debt,
    spent = s.finance.operatingPaid;
  assert.ok(productEffects(s).value > initial);
  assert.equal(rollback(s), null);
  assert.equal(productEffects(s).value, initial);
  assert.equal(s.engineering.debt, debt);
  assert.equal(s.finance.operatingPaid, spent);
  assert.equal(s.product.selected.setup, 'setup_guide');
  const fresh = company();
  fresh.upgrades.push('version');
  finish(fresh, 'setup_guide');
  rollback(fresh);
  assert.equal(fresh.product.selected.setup, undefined);
  assert.equal(fresh.product.shippedAt.setup_guide, undefined);
  assert.equal(commitProduct(fresh, 'setup_configuration'), null);
});
test('feedback waits for observation and remains bounded and idempotent; analytics is an internal capability', () => {
  const s = company();
  finish(s, 'workflow_presets');
  assert.ok(!s.product.signals.some((n) => n.key === 'adoption:workflow_presets'));
  advance(s, 7 * DAY);
  assert.ok(s.product.signals.some((n) => n.key === 'adoption:workflow_presets'));
  const count = s.product.signals.length;
  advance(s, DAY);
  assert.equal(s.product.signals.length, count);
  const value = customerValue(s).fairPrice;
  const copy = structuredClone(s);
  copy.upgrades.push('events', 'analytics');
  copy.background.analytics = 5000;
  assert.equal(customerValue(copy).fairPrice, value);
  assert.ok(economics(copy).costs > economics(s).costs);
});
test('every approach combination can satisfy broad enterprise requirements on every architecture', () => {
  for (const path of ['monolith', 'services', 'functions'])
    for (const ids of [
      ['setup_guide', 'workflow_presets', 'coordination_status'],
      ['setup_configuration', 'workflow_rules', 'coordination_approvals'],
    ]) {
      const s = company();
      chooseArchitecture(s, path);
      grantProjects(s, [...ids, 'access', 'audit', 'backup', 'monitoring']);
      s.certifiedUntil = 1000;
      s.evidence = 40;
      s.trust = 90;
      s.reliability = 99;
      assert.ok(
        requirements(s).every(([, ok]) => ok),
        path + JSON.stringify(requirements(s)),
      );
      assert.equal(deserialize(serialize(s)).architecturePath, path);
    }
});
test('product saves reject conflicting approaches, forged research rewards and orphan refinements', () => {
  for (const mutate of [
    (s) => (s.product.seed = -1),
    (s) => s.upgrades.push('analyse_setup'),
    (s) => (s.product.analysed.setup = 2),
    (s) => s.upgrades.push('refine_setup_guide'),
    (s) => (s.product.selected.setup = 'unknown'),
    (s) => (s.product.shippedAt.setup_guide = 100),
    (s) => {
      grantProjects(s, ['setup_guide', 'setup_configuration']);
    },
  ]) {
    const s = company();
    mutate(s);
    assert.throws(() => deserialize(serialize(s)));
  }
});

import { chooseArchitecture } from './helpers.mjs';
import { handleIncidents } from '../tools/new-game-balance.mjs';
import { project as catalogProject } from '../src/game.js';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  PROJECTS,
  createGame,
  chooseDirection,
  unlockedProjects,
  projectUnlockReason,
  engineeringStage,
  project,
  projectQuote,
  projectDebt,
  startProject,
  deploy,
  rollback,
  tick,
  has,
  level,
  debtSummary,
  engineeringMaintenance,
  agentRate,
  economics,
  customerValue,
  system,
  security,
  serialize,
  deserialize,
  projectOperatingImpact,
  DAY,
} from '../src/game.js';
const company = () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, 'monolith');
  return s;
};
const grow = (s, count) => {
  s.customers = count;
  s.cohorts = [{ count, price: 29, renewAt: s.time + 360 }];
};
const advance = (s, n) => {
  for (let i = 0; i < n; i++) {
    handleIncidents(s);
    tick(s);
  }
};
const finish = (s, id) => {
  if (s.upgrades.includes(id) && !catalogProject(id).repeat) return;
  assert.equal(startProject(s, id), null, `${id} starts`);
  for (let i = 0; (s.work.length || s.ready.length || s.release) && i < 20000; i++) {
    handleIncidents(s);
    tick(s);
  }
  assert.equal(s.work.length, 0);
  if (s.ready.includes(id)) {
    assert.equal(deploy(s, id), null);
    for (let i = 0; s.release && i < 200; i++) tick(s);
    assert.equal(s.release, null);
  }
};

test('a new company exposes only three technical foundational tasks and rejects premature actions', () => {
  const s = company();
  assert.deepEqual(
    unlockedProjects(s).map((p) => p.id),
    ['monitoring', 'version', 'review'],
  );
  const snapshot = serialize(s);
  for (const id of ['jobs', 'host', 'pipeline', 'debt_cleanup', 'refine_workflow_rules'])
    assert.match(startProject(s, id), /Unlocks|Needs/);
  assert.equal(serialize(s), snapshot);
});
test('the extended roadmap has meaningful repeatable work, valid prerequisites, and five stages', () => {
  assert.ok(PROJECTS.length >= 75);
  assert.ok(PROJECTS.filter((p) => p.repeat).length >= 20);
  assert.equal(new Set(PROJECTS.map((p) => p.id)).size, PROJECTS.length);
  for (const p of PROJECTS) {
    assert.ok(Number.isFinite(p.duration) && p.duration > 0, p.id);
    for (const id of p.requires || []) assert.ok(project(id), `${p.id}: ${id}`);
    assert.ok(p.research ? projectDebt(company(), p.id) === 0 : projectDebt(company(), p.id) > 0);
  }
  const visiting = new Set(),
    done = new Set();
  const visit = (id) => {
    assert.ok(!visiting.has(id), 'acyclic roadmap');
    if (done.has(id)) return;
    visiting.add(id);
    for (const dep of project(id).requires || []) visit(dep);
    visiting.delete(id);
    done.add(id);
  };
  for (const p of PROJECTS) visit(p.id);
  const s = company();
  for (const [count, stage] of [
    [0, 0],
    [3, 1],
    [8, 2],
    [16, 3],
    [28, 4],
  ]) {
    s.engineering.completed = count;
    assert.equal(engineeringStage(s), stage);
  }
});
test('customer milestones unlock relevant prerequisites and persist after contraction and reload', () => {
  const s = company();
  s.upgrades.push('monitoring');
  grow(s, 6);
  tick(s);
  assert.ok(unlockedProjects(s).some((p) => p.id === 'components'));
  assert.ok(s.engineering.unlocked.includes('components'));
  grow(s, 0);
  tick(s);
  assert.equal(projectUnlockReason(s, project('components')), null);
  const loaded = deserialize(serialize(s));
  assert.equal(projectUnlockReason(loaded, project('components')), null);
  assert.ok(loaded.engineering.maxCustomers >= 6);
  assert.equal(projectUnlockReason(loaded, project('coordination_status')), null);
});
test('operating experience unlocks progress without forcing customer growth', () => {
  const s = company();
  for (const id of ['monitoring', 'review', 'review']) finish(s, id);
  grow(s, 0);
  assert.equal(engineeringStage(s), 1);
  assert.ok(unlockedProjects(s).some((p) => p.id === 'debt_cleanup'));
  assert.ok(!unlockedProjects(s).some((p) => p.id === 'enterprise_workflows'));
});
test('completed drafts create debt before deployment; previews include its operating burden', () => {
  const s = company(),
    preview = projectOperatingImpact(s, 'setup_guide');
  assert.ok(preview > 35);
  startProject(s, 'setup_guide');
  assert.equal(s.engineering.debt, 0);
  for (let i = 0; s.work.length && i < 1000; i++) tick(s);
  assert.equal(s.release.id, 'setup_guide');
  assert.equal(s.engineering.debt, 6);
  assert.equal(s.engineering.completed, 1);
  assert.ok(!has(s, 'setup_guide'));
  assert.ok(agentRate(s) < 1);
  assert.ok(economics({ ...s, work: [] }).breakdown.find((r) => r.id === 'tech_debt').amount > 0);
  for (let i = 0; s.release && i < 30; i++) tick(s);
  assert.equal(s.engineering.debt, 6, 'deployment does not charge debt twice');
});
test('debt slows live work, deployment and incident clocks and increases engineering overhead only', () => {
  const clean = company(),
    debt = company();
  debt.engineering.debt = 100;
  startProject(clean, 'setup_guide');
  startProject(debt, 'setup_guide');
  tick(clean);
  tick(debt);
  assert.ok(debt.work[0].progress < clean.work[0].progress);
  assert.equal(debtSummary(debt).slowdown, 2.2);
  assert.ok(economics(debt).costs > economics(clean).costs);
  assert.equal(economics(debt).breakdown.find((r) => r.id === 'founder').amount, 1800);
  for (const s of [clean, debt]) {
    s.work = [];
    s.ready = ['setup_guide'];
    deploy(s);
    tick(s);
  }
  assert.ok(debt.release.remaining > clean.release.remaining);
});
test('debt repayment consumes a project slot and reduces future work time and bills', () => {
  const s = company();
  grantProjects(s, ['version', 'monitoring']);
  s.engineering.completed = 3;
  s.engineering.debt = 90;
  const duration = projectQuote(s, 'setup_guide').duration,
    quote = projectOperatingImpact(s, 'debt_cleanup');
  assert.ok(quote < 0);
  finish(s, 'debt_cleanup');
  assert.equal(s.engineering.debt, 63);
  assert.ok(projectQuote(s, 'setup_guide').duration < duration);
  assert.ok(
    economics(s).costs < economics({ ...s, engineering: { ...s.engineering, debt: 90 } }).costs,
  );
  assert.equal(level(s, 'debt_cleanup'), 1);
  const effort = projectQuote(s, 'debt_cleanup').effort;
  finish(s, 'debt_cleanup');
  assert.equal(s.engineering.debt, 36);
  assert.equal(
    projectQuote(s, 'debt_cleanup').effort,
    effort,
    'routine cleanup effort does not escalate with repetitions',
  );
});
test('there is no empty cleanup or maintenance farming', () => {
  const s = company();
  grantProjects(s, ['version', 'monitoring']);
  s.engineering.completed = 8;
  assert.match(startProject(s, 'debt_cleanup'), /No technical debt/);
  assert.match(startProject(s, 'bugfix'), /already healthy/);
});
test('repeatable product work gains levels, utility, workload and maintenance, with diminishing returns', () => {
  const s = company();
  grantProjects(s, ['setup_guide', 'monitoring', 'version', 'host', 'cache']);
  s.cacheWarm = 1;
  s.engineering.completed = 8;
  grow(s, 20);
  const fair = () => customerValue({ ...s, reliability: 100, trust: 90 }).fairPrice;
  const before = fair(),
    firstTime = projectQuote(s, 'refine_setup_guide').duration,
    baseWork = system(s).appLoad;
  finish(s, 'refine_setup_guide');
  const first = fair();
  assert.equal(level(s, 'refine_setup_guide'), 1);
  assert.ok(first > before);
  assert.equal(engineeringMaintenance(s).refinements, 1);
  assert.ok(system(s).appLoad > baseWork);
  assert.ok(projectQuote(s, 'refine_setup_guide').duration > firstTime);
  finish(s, 'refine_setup_guide');
  const second = fair();
  assert.equal(level(s, 'refine_setup_guide'), 2);
  assert.ok(second > first);
  assert.ok(second - first < first - before);
  assert.equal(engineeringMaintenance(s).refinements, 2);
});
test('rollback restores the previous repeat level without erasing debt or unrelated work', () => {
  const s = company();
  grantProjects(s, ['setup_guide', 'version', 'monitoring', 'host', 'cache']);
  s.cacheWarm = 1;
  s.engineering.completed = 8;
  grow(s, 20);
  finish(s, 'refine_setup_guide');
  const firstDebt = s.engineering.debt;
  finish(s, 'refine_setup_guide');
  s.engineering.levels.debt_cleanup = 2;
  const debt = s.engineering.debt;
  assert.equal(rollback(s), null);
  assert.equal(level(s, 'refine_setup_guide'), 1);
  assert.equal(level(s, 'debt_cleanup'), 2);
  assert.equal(s.engineering.debt, debt);
  assert.ok(debt > firstDebt);
});
test('routine maintenance restores decaying operating condition', () => {
  const s = company();
  grantProjects(s, ['monitoring', 'version']);
  s.engineering.completed = 8;
  s.engineering.wear = 50;
  const before = s.engineering.wear;
  finish(s, 'bugfix');
  assert.ok(s.engineering.wear < before - 20);
  assert.equal(level(s, 'bugfix'), 1);
  const restored = s.engineering.wear;
  advance(s, 30 * DAY);
  assert.ok(s.engineering.wear > restored);
});
test('maintenance problems are reported automatically and recovery is acknowledged', () => {
  const s = company();
  s.engineering.wear = 31;
  tick(s);
  assert.equal(s.engineering.maintenanceNotified, true);
  assert.ok(s.events.some((e) => e.title === 'Routine maintenance overdue'));
  s.engineering.wear = 10;
  tick(s);
  assert.equal(s.engineering.maintenanceNotified, false);
  assert.ok(s.events.some((e) => e.title === 'Operating condition restored'));
});
test('parallel deployment environments preserve request traffic at twice the app bill', () => {
  const s = company();
  grow(s, 10);
  s.ready = ['setup_guide'];
  const cost = economics(s).breakdown.find((r) => r.id === 'applications').amount;
  deploy(s);
  assert.equal(system(s).error, 0.75);
  s.upgrades.push('blue_green');
  assert.equal(system(s).error, 0.002);
  assert.equal(system(s).served, system(s).demand);
  assert.equal(economics(s).breakdown.find((r) => r.id === 'applications').amount, cost * 2);
});
test('new security, performance, delivery, and cost work has distinct effects', () => {
  const s = company();
  grantProjects(s, [
    'review',
    'monitoring',
    'components',
    'setup_guide',
    'version',
    'tests',
    'pipeline',
  ]);
  s.reviewAt = 0;
  grow(s, 40);
  const base = system(s),
    score = security(s).score,
    time = projectQuote(s, 'refine_setup_guide').duration;
  s.upgrades.push('encryption', 'indexes', 'containers', 'compression');
  assert.ok(system(s).dbLoad < base.dbLoad);
  assert.ok(security(s).score > score);
  assert.ok(projectQuote(s, 'refine_setup_guide').duration < time);
  const applications = economics(s).breakdown.find((r) => r.id === 'applications').amount;
  s.upgrades.push('blue_green');
  assert.equal(
    economics(s).breakdown.find((r) => r.id === 'applications').amount,
    applications * 2,
  );
});
test('saves preserve progression, repeat levels, condition and debt; malformed values fail', () => {
  const s = company();
  grantProjects(s, ['setup_guide', 'version', 'refine_setup_guide']);
  s.engineering.completed = 16;
  s.engineering.debt = 40;
  s.engineering.wear = 25;
  s.engineering.levels.refine_setup_guide = 3;
  s.engineering.unlocked.push('refine_setup_guide');
  const loaded = deserialize(serialize(s));
  assert.deepEqual(loaded.engineering, s.engineering);
  for (const mutate of [
    (x) => (x.engineering.debt = -1),
    (x) => (x.engineering.wear = 101),
    (x) => (x.engineering.completed = 1.5),
    (x) => (x.engineering.levels.refine_setup_guide = -1),
    (x) => (x.engineering.levels.host = 2),
    (x) => x.engineering.unlocked.push('unknown'),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => deserialize(serialize(bad)));
  }
});

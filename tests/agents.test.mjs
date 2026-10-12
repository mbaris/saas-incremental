import { chooseArchitecture } from './helpers.mjs';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  setAgentPlan,
  agentPlan,
  agentRate,
  activeProjects,
  projectQuote,
  startProject,
  tick,
  costBreakdown,
  economics,
  deploy,
  triggerIncident,
  respond,
  serialize,
  deserialize,
  has,
} from '../src/game.js';
const company = () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, 'monolith');
  s.engineering.unlocked.push('coordination_status');
  return s;
};
const advance = (s, n) => {
  for (let i = 0; i < n; i++) tick(s);
};
const tokens = (s) => costBreakdown(s).find((r) => r.id === 'tokens').amount;

test('solo founder has no payroll and empty agent slots never incur development spend', () => {
  const s = company();
  assert.equal(s.agentPlan, 'standard');
  const idle = tokens(s);
  assert.equal(costBreakdown(s).find((r) => r.id === 'founder').amount, 1800);
  assert.ok(!costBreakdown(s).some((r) => r.id === 'team'));
  for (const id of ['lean', 'standard', 'parallel', 'intensive']) {
    const cash = s.cash;
    setAgentPlan(s, id);
    assert.equal(s.cash, cash);
    assert.equal(tokens(s), idle);
  }
});
test('parallel slots allow independent projects while respecting prerequisites and duplicates', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  assert.equal(startProject(s, 'monitoring'), null);
  assert.equal(startProject(s, 'review'), null);
  assert.match(startProject(s, 'setup_guide'), /slots occupied/);
  assert.match(startProject(s, 'monitoring'), /already in progress/);
  assert.match(startProject(s, 'tests'), /slots occupied/);
  tick(s);
  assert.ok(s.work.every((w) => w.progress > 0));
  assert.equal(s.work.length, 2);
  assert.ok(agentRate(s) < agentPlan(s).speed);
  advance(s, 60);
  assert.ok(has(s, 'monitoring'));
  assert.ok(has(s, 'version'));
  assert.equal(s.work.length, 0);
});
test('larger budgets accelerate work and quote actual completion time', () => {
  const lean = company(),
    fast = company();
  setAgentPlan(lean, 'lean');
  setAgentPlan(fast, 'intensive');
  const quote = projectQuote(fast, 'monitoring');
  assert.ok(quote.duration < projectQuote(lean, 'monitoring').duration);
  startProject(lean, 'monitoring');
  startProject(fast, 'monitoring');
  assert.equal(fast.work[0].duration, quote.effort);
  advance(lean, quote.duration);
  advance(fast, quote.duration);
  assert.ok(has(fast, 'monitoring'));
  assert.ok(!has(lean, 'monitoring'));
  assert.ok(lean.work[0].progress < lean.work[0].duration);
});
test('development spends per active slot through elapsed time and reconciles cash', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  const idle = tokens(s),
    cash = s.cash;
  startProject(s, 'monitoring');
  assert.equal(s.cash, cash);
  assert.equal(tokens(s) - idle, 2500);
  startProject(s, 'review');
  assert.equal(s.cash, cash);
  assert.equal(tokens(s) - idle, 5000);
  const e = economics(s);
  tick(s);
  assert.ok(Math.abs(s.finance.operatingSpend - e.costs / 360) < 1e-8);
  assert.ok(Math.abs(s.cash - cash + e.costs / 360) < 1e-8);
  advance(s, 70);
  assert.equal(tokens(s), 15);
});
test('budget reductions preserve drafts, pause excess slots, and can resume immediately', () => {
  const s = company();
  setAgentPlan(s, 'intensive');
  for (const id of ['monitoring', 'review', 'setup_guide']) startProject(s, id);
  tick(s);
  const snapshots = s.work.map((w) => ({ ...w }));
  setAgentPlan(s, 'lean');
  const bill = tokens(s);
  assert.equal(bill, 465);
  tick(s);
  assert.ok(s.work[0].progress > snapshots[0].progress);
  assert.equal(s.work[1].progress, snapshots[1].progress);
  assert.equal(s.work[2].progress, snapshots[2].progress);
  const saved = deserialize(serialize(s));
  assert.equal(saved.work.length, 3);
  assert.equal(saved.agentPlan, 'lean');
  assert.equal(activeProjects(saved).length, 1);
  saved.paused = false;
  setAgentPlan(saved, 'intensive');
  tick(saved);
  assert.ok(saved.work.every((w, i) => w.progress > snapshots[i].progress));
});
test('completed development frees slots and automatically deploys a serial queue', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  startProject(s, 'setup_guide');
  startProject(s, 'coordination_status');
  for (const w of s.work) {
    w.duration = 1;
    w.progress = 0;
  }
  tick(s);
  assert.equal(s.work.length, 0);
  assert.equal(s.release.id, 'setup_guide');
  assert.deepEqual(s.ready, ['coordination_status']);
  assert.ok(!has(s, 'setup_guide'));
  assert.equal(startProject(s, 'monitoring'), null);
  advance(s, 40);
  assert.ok(has(s, 'setup_guide'));
  assert.ok(has(s, 'coordination_status'));
  assert.deepEqual(s.ready, []);
  assert.equal(s.release, null);
});
test('incident response pauses every development slot and charges only upkeep and response', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  startProject(s, 'setup_guide');
  startProject(s, 'coordination_status');
  triggerIncident(s, 'release');
  advance(s, 9);
  assert.equal(respond(s, s.incidents[0].id), null);
  const progress = s.work.map((w) => w.progress);
  assert.equal(tokens(s), 105);
  advance(s, 12);
  assert.deepEqual(
    s.work.map((w) => w.progress),
    progress,
  );
  tick(s);
  assert.ok(s.work.every((w, i) => w.progress > progress[i]));
});
test('save loading rejects malformed drafts, duplicate jobs, and invalid budgets', () => {
  const s = company();
  setAgentPlan(s, 'parallel');
  startProject(s, 'setup_guide');
  startProject(s, 'monitoring');
  tick(s);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.work, s.work);
  assert.equal(restored.agentPlan, 'parallel');
  for (const mutate of [
    (bad) => (bad.agentPlan = 'unknown'),
    (bad) => (bad.work[0].progress = -1),
    (bad) => (bad.work[0].duration = 0),
    (bad) => (bad.work[1].id = bad.work[0].id),
    (bad) => bad.ready.push('setup_guide'),
    (bad) => (bad.ready = ['monitoring']),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => deserialize(serialize(bad)));
  }
});

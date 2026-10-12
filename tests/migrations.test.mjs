import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  startProject,
  queueProject,
  tick,
  project,
  projectOperatingImpact,
  economics,
  serialize,
  deserialize,
  rollback,
  has,
  projectDebt,
} from '../src/game.js';
import { handleIncidents } from '../tools/new-game-balance.mjs';
import { grantProjects } from './helpers.mjs';
const company = () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  s.cash = 500000;
  s.engineering.completed = 20;
  grantProjects(s, [
    'version',
    'monitoring',
    'tests',
    'database',
    'host',
    'jobs',
    'workers',
    'workflow_rules',
  ]);
  s.workerReplicas = 2;
  s.engineering.levels.workers = 2;
  return s;
};
function finish(s, id) {
  for (let i = 0; i < 20000; i++) {
    if (!s.work.some((w) => w.id === id) && !s.ready.includes(id) && s.release?.id !== id) return;
    handleIncidents(s);
    tick(s);
  }
  assert.fail('Work did not finish');
}
test('function migration keeps the old system until rollout and forecast includes retired infrastructure', () => {
  let s = company();
  const before = serialize(s),
    forecast = projectOperatingImpact(s, 'migrate_functions');
  assert.equal(serialize(s), before);
  const expected = structuredClone(s);
  expected.architecturePath = 'functions';
  expected.workerReplicas = 0;
  expected.upgrades = expected.upgrades.filter(
    (id) => !['host', 'database', 'workers'].includes(id),
  );
  delete expected.engineering.levels.workers;
  expected.engineering.debt += projectDebt(s, 'migrate_functions');
  assert.ok(Math.abs(forecast - (economics(expected).costs - economics(s).costs)) < 1e-8);
  assert.equal(startProject(s, 'migrate_functions'), null);
  assert.equal(s.architecturePath, 'monolith');
  assert.match(startProject(s, 'replicas'), /migration/);
  s = deserialize(serialize(s));
  s.paused = false;
  finish(s, 'migrate_functions');
  assert.equal(s.architecturePath, 'functions');
  assert.equal(s.workerReplicas, 0);
  assert.ok(!has(s, 'host'));
  assert.ok(has(s, 'jobs'));
  assert.equal(deserialize(serialize(s)).architecturePath, 'functions');
  const broken = structuredClone(s);
  broken.lastRelease.previousArchitecture.retired.push('missing-project');
  assert.throws(() => deserialize(serialize(broken)), /rollback state/);
  assert.equal(rollback(s), null);
  assert.equal(s.architecturePath, 'monolith');
  assert.ok(has(s, 'host'));
  assert.equal(s.workerReplicas, 2);
  assert.equal(s.engineering.levels.workers, 2);
  deserialize(serialize(s));
});
test('migrations can queue after shared work and can later move back to a monolith', () => {
  const s = company();
  assert.equal(startProject(s, 'review'), null);
  assert.equal(queueProject(s, 'migrate_functions'), null);
  assert.match(queueProject(s, 'replicas'), /migration/);
  finish(s, 'review');
  finish(s, 'migrate_functions');
  assert.equal(s.architecturePath, 'functions');
  assert.equal(startProject(s, 'consolidate_monolith'), null);
  finish(s, 'consolidate_monolith');
  assert.equal(s.architecturePath, 'monolith');
  assert.equal(startProject(s, 'migrate_functions'), null);
});
test('service extraction is incremental, preserves monolith investment, and can be consolidated', () => {
  const s = company();
  assert.equal(startProject(s, 'report_service'), null);
  assert.equal(s.architecturePath, 'monolith');
  finish(s, 'report_service');
  assert.equal(s.architecturePath, 'services');
  assert.ok(has(s, 'host'));
  assert.ok(has(s, 'report_service'));
  assert.match(startProject(s, 'service_scale'), /already upgraded/);
  assert.equal(startProject(s, 'consolidate_monolith'), null);
  finish(s, 'consolidate_monolith');
  assert.equal(s.architecturePath, 'monolith');
  assert.ok(!has(s, 'report_service'));
  assert.ok(has(s, 'host'));
  assert.ok(has(s, 'workflow_rules'));
  assert.equal(rollback(s), null);
  assert.equal(s.architecturePath, 'services');
  assert.ok(has(s, 'report_service'));
});
test('incompatible queued work prevents migration without discarding progress', () => {
  const s = company();
  assert.equal(startProject(s, 'replicas'), null);
  const before = serialize(s);
  assert.match(queueProject(s, 'migrate_functions'), /Finish or remove/);
  assert.equal(serialize(s), before);
  assert.ok(project('migrate_functions').release);
  assert.ok(project('report_service').release);
});

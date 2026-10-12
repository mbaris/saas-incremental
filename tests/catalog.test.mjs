import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../src/catalog.ts';
import {
  PROJECTS,
  createGame,
  chooseDirection,
  startProject,
  tick,
  has,
  deploymentRisk,
  serialize,
  deserialize,
} from '../src/game.js';
const task = (id, requires = []) => ({
  id,
  name: id,
  category: 'Performance',
  duration: 12,
  stage: 1,
  requires,
  effect: 'reads',
  strength: 0.02,
});
test('catalog validates current content and hundreds of linked tasks', () => {
  assert.equal(validateCatalog(PROJECTS), PROJECTS);
  const tasks = Array.from({ length: 500 }, (_, i) =>
    task('task_' + i, i ? ['task_' + (i - 1)] : []),
  );
  assert.equal(validateCatalog(tasks).length, 500);
});
test('catalog rejects duplicate IDs, missing dependencies, cycles and unsupported effects', () => {
  assert.throws(() => validateCatalog([task('a'), task('a')]), /Duplicate/);
  assert.throws(() => validateCatalog([task('a', ['missing'])]), /Unknown dependency/);
  assert.throws(() => validateCatalog([task('a', ['b']), task('b', ['a'])]), /cycle/);
  assert.throws(() => validateCatalog([{ ...task('a'), effect: 'unknown' }]), /effects/);
  assert.throws(() => validateCatalog([{ ...task('a'), duration: 0 }]), /definition/);
  assert.throws(
    () =>
      validateCatalog([
        { ...task('a'), paths: ['functions'] },
        { ...task('b', ['a']), paths: ['monolith'] },
      ]),
    /Incompatible/,
  );
});
test('new companies already have version control without debt or completed-task rewards', () => {
  const s = createGame();
  assert.ok(has(s, 'version'));
  assert.equal(s.engineering.debt, 0);
  assert.equal(s.engineering.completed, 0);
});
test('deployment risk grows with debt and architecture, and safeguards reduce it', () => {
  const s = createGame();
  chooseDirection(s, 'practical');
  const basic = deploymentRisk(s);
  s.engineering.debt = 60;
  assert.ok(deploymentRisk(s) > basic);
  const debt = deploymentRisk(s);
  s.upgrades.push('database', 'jobs', 'events');
  assert.ok(deploymentRisk(s) > debt);
  const complex = deploymentRisk(s);
  s.upgrades.push('tests');
  assert.ok(deploymentRisk(s) < complex);
  const checked = deploymentRisk(s);
  s.upgrades.push('pipeline', 'contracts', 'canary');
  assert.ok(deploymentRisk(s) < checked);
  s.engineering.debt = 100000;
  assert.ok(deploymentRisk(s) <= 0.8);
});
test('automatic rollout takes time, pauses in recovery, and survives reload', () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  startProject(s, 'setup_guide');
  s.work[0].duration = 1;
  tick(s);
  assert.equal(s.release.id, 'setup_guide');
  assert.ok(!has(s, 'setup_guide'));
  const remaining = s.release.remaining;
  s.solvency.emergency = true;
  tick(s);
  assert.equal(s.release.remaining, remaining);
  s.solvency.emergency = false;
  const saved = deserialize(serialize(s));
  assert.equal(saved.release.risk, s.release.risk);
  saved.paused = false;
  for (let i = 0; saved.release && i < 100; i++) tick(saved);
  assert.ok(has(saved, 'setup_guide'));
  for (const field of ['risk', 'duration', 'remaining']) {
    const bad = structuredClone(s);
    bad.release[field] = NaN;
    assert.throws(() => deserialize(serialize(bad)), /deployment/);
  }
});
test('debt increases actual deployment incidents across the same deterministic companies', () => {
  const incidents = (debt) => {
    let count = 0;
    for (let i = 1; i <= 100; i++) {
      const s = createGame(Math.imul(i, 2654435761) >>> 0);
      chooseDirection(s, 'practical');
      s.engineering.debt = debt;
      startProject(s, 'setup_guide');
      s.work[0].duration = 0.001;
      tick(s);
      for (let t = 0; s.release && t < 100; t++) tick(s);
      if (s.incidents.some((incident) => incident.type === 'release')) count++;
    }
    return count;
  };
  const clean = incidents(0),
    debt = incidents(100);
  assert.ok(clean > 0);
  assert.ok(debt > clean);
  assert.ok(debt < 100);
});

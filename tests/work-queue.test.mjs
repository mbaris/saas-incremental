import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  startProject,
  queueProject,
  removeQueuedProject,
  moveQueuedProject,
  startQueuedProjects,
  setAgentPlan,
  tick,
  serialize,
  deserialize,
  costBreakdown,
  availableProductProblems,
} from '../src/game.js';
const company = () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  return s;
};
test('queue reserves product choices, costs nothing while waiting, and starts in order', () => {
  const s = company();
  startProject(s, 'monitoring');
  const cash = s.cash,
    bill = costBreakdown(s);
  assert.equal(queueProject(s, 'setup_guide'), null);
  assert.equal(queueProject(s, 'review'), null);
  assert.equal(s.cash, cash);
  assert.deepEqual(costBreakdown(s), bill);
  assert.equal(s.product.selected.setup, 'setup_guide');
  assert.match(queueProject(s, 'setup_configuration'), /Another approach/);
  assert.match(queueProject(s, 'setup_guide'), /already queued/);
  s.work[0].duration = 1;
  tick(s);
  assert.equal(s.work[0].id, 'setup_guide');
  assert.deepEqual(s.workQueue, ['review']);
  assert.equal(s.work[0].progress, 0);
  assert.ok(costBreakdown(s).find((r) => r.id === 'tokens').amount > 0);
});

test('committing a product blocks new research but preserves research already planned first', () => {
  const s = company();
  assert.equal(startProject(s, 'setup_guide'), null);
  const before = serialize(s);
  assert.match(startProject(s, 'analyse_setup'), /already committed/);
  assert.match(queueProject(s, 'analyse_setup'), /already committed/);
  assert.equal(serialize(s), before);
  const planned = company();
  assert.equal(queueProject(planned, 'analyse_setup'), null);
  assert.equal(queueProject(planned, 'setup_guide'), null);
  assert.match(queueProject(planned, 'analyse_setup'), /already committed/);
  startQueuedProjects(planned);
  assert.equal(planned.work[0].id, 'analyse_setup');
  planned.work[0].duration = 1;
  tick(planned);
  assert.equal(planned.product.analysed.setup, true);
  assert.equal(planned.work[0].id, 'setup_guide');
});
test('queue has five slots and can reorder or cancel without losing active progress', () => {
  const s = company();
  startProject(s, 'monitoring');
  for (const id of [
    'review',
    'analyse_setup',
    'setup_guide',
    'workflow_presets',
    'coordination_status',
  ])
    assert.equal(queueProject(s, id), null);
  assert.match(
    queueProject(
      s,
      'analyse_' + availableProductProblems(s).find((p) => !s.product.selected[p.id]).id,
    ),
    /queue full/,
  );
  const current = { ...s.work[0] };
  assert.equal(moveQueuedProject(s, 'setup_guide', -1), null);
  assert.equal(s.workQueue[1], 'setup_guide');
  assert.equal(removeQueuedProject(s, 'setup_guide'), null);
  assert.equal(s.product.selected.setup, undefined);
  assert.deepEqual(s.work[0], current);
  assert.equal(queueProject(s, 'setup_configuration'), null);
});
test('queue fills free parallel slots, waits during pause and recovery, and survives reload', () => {
  const s = company();
  for (const id of ['monitoring', 'review', 'setup_guide']) queueProject(s, id);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.workQueue, s.workQueue);
  startQueuedProjects(restored);
  assert.equal(restored.work.length, 0);
  restored.paused = false;
  restored.solvency.emergency = true;
  startQueuedProjects(restored);
  assert.equal(restored.work.length, 0);
  restored.solvency.emergency = false;
  restored.response = { id: 1, remaining: 10 };
  startQueuedProjects(restored);
  assert.equal(restored.work.length, 0);
  restored.response = null;
  setAgentPlan(restored, 'parallel');
  startQueuedProjects(restored);
  assert.deepEqual(
    restored.work.map((w) => w.id),
    ['monitoring', 'review'],
  );
  assert.deepEqual(restored.workQueue, ['setup_guide']);
});
test('queued work is revalidated and a blocked head is retained until resolved', () => {
  const s = company();
  s.engineering.debt = 20;
  s.engineering.completed = 20;
  queueProject(s, 'debt_cleanup');
  queueProject(s, 'monitoring');
  assert.equal(s.workQueue[0], 'debt_cleanup');
  s.engineering.debt = 0;
  startQueuedProjects(s);
  assert.equal(s.work.length, 0);
  assert.deepEqual(s.workQueue, ['debt_cleanup', 'monitoring']);
  removeQueuedProject(s, 'debt_cleanup');
  startQueuedProjects(s);
  assert.equal(s.work[0].id, 'monitoring');
});
test('locked work cannot be queued and malformed queues cannot be loaded', () => {
  const s = company();
  startProject(s, 'monitoring');
  assert.match(queueProject(s, 'tests'), /Unlocks/);
  for (const workQueue of [
    Array(6).fill('review'),
    ['unknown'],
    ['monitoring'],
    ['review', 'review'],
    ['version'],
  ])
    assert.throws(() => deserialize(serialize({ ...s, workQueue })));
});

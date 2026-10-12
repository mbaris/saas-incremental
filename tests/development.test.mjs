import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  startProject,
  suspendProject,
  resumeProject,
  tick,
  serialize,
  deserialize,
  activeProjects,
  DAY,
} from '../src/game.js';

test('direct work and preserved paused drafts share agent capacity without upfront spending', () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  const cash = s.cash;
  assert.equal(startProject(s, 'setup_guide'), null);
  assert.equal(s.cash, cash);
  tick(s);
  const progress = s.work[0].progress;
  assert.equal(suspendProject(s, 'setup_guide'), null);
  assert.equal(startProject(s, 'monitoring'), null);
  assert.match(resumeProject(s, 'setup_guide'), /Pause another draft/);
  tick(s);
  assert.equal(s.work.find((w) => w.id === 'setup_guide').progress, progress);
  const saved = deserialize(serialize(s));
  assert.equal(saved.work[0].suspended, true);
  assert.equal(suspendProject(saved, 'monitoring'), null);
  assert.equal(resumeProject(saved, 'setup_guide'), null);
  assert.deepEqual(
    activeProjects(saved).map((w) => w.id),
    ['setup_guide'],
  );
  saved.paused = false;
  tick(saved);
  assert.ok(saved.work[0].progress > progress);
});

test('crossing ninety days does not introduce a planning pause or review', () => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  s.time = 90 * DAY - 1;
  tick(s);
  tick(s);
  assert.equal(s.time, 90 * DAY + 1);
  assert.equal(s.paused, false);
  assert.equal('planning' in s, false);
  assert.equal('planning' in deserialize(serialize(s)), false);
});

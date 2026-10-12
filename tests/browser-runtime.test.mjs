import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationClock } from '../src/browser/clock.ts';
import { createSaveStore } from '../src/browser/storage.ts';
import { SAVE_KEY, SAVE_VERSION } from '../src/constants.ts';

test('clock counts fixed ticks at different speeds, caps stalls, and skips hidden time', () => {
  let ticks = 0,
    speed = 1,
    active = true,
    saves = 0;
  const clock = createSimulationClock(
    {
      canAdvance: () => active,
      speed: () => speed,
      step: () => {
        ticks++;
        return false;
      },
      save: () => saves++,
      interrupted() {},
    },
    0,
  );
  clock.advance(500);
  assert.equal(ticks, 0);
  clock.advance(1000);
  assert.equal(ticks, 1);
  speed = 8;
  clock.advance(1500);
  assert.equal(ticks, 5);
  active = false;
  clock.advance(100_000);
  assert.equal(ticks, 5);
  clock.reset(200_000);
  active = true;
  clock.advance(200_500);
  assert.equal(ticks, 9);
  clock.advance(300_000);
  assert.equal(ticks, 17, 'Long browser stalls never trigger offline catch-up');
  for (let i = 1; i <= 20; i++) clock.advance(300_000 + i * 500);
  assert.ok(saves >= 1);
});

test('an incident interrupts the current batch, saves, and discards pending fast-speed ticks', () => {
  let ticks = 0,
    interrupted = 0,
    saves = 0,
    stop = true;
  const clock = createSimulationClock(
    {
      canAdvance: () => true,
      speed: () => 8,
      step: () => {
        ticks++;
        return stop;
      },
      save: () => saves++,
      interrupted: () => interrupted++,
    },
    0,
  );
  clock.advance(1000);
  assert.equal(ticks, 1);
  assert.equal(saves, 1);
  assert.equal(interrupted, 1);
  stop = false;
  clock.advance(1500);
  assert.equal(ticks, 5);
});

test('save storage distinguishes invalid data from unavailable storage and can recover after write failure', () => {
  const entries = new Map();
  let quotaExceeded = false;
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      if (quotaExceeded) throw Error('quota');
      entries.set(key, value);
    },
  };
  const codec = { encode: JSON.stringify, decode: JSON.parse };
  const store = createSaveStore(() => storage, codec);
  assert.equal(SAVE_KEY, `saas-incremental.save.v${SAVE_VERSION}`);
  assert.equal(store.load().status, 'empty');
  assert.equal(store.save({ cash: 42 }), true);
  assert.deepEqual(store.load(), { status: 'loaded', value: { cash: 42 } });
  quotaExceeded = true;
  assert.equal(store.save({ cash: 0 }), false);
  assert.deepEqual(store.load().value, { cash: 42 });
  quotaExceeded = false;
  assert.equal(store.save({ cash: 8 }), true);
  entries.set(SAVE_KEY, '{broken');
  assert.equal(store.load().status, 'invalid');
  const blocked = createSaveStore(() => {
    throw Error('blocked');
  }, codec);
  assert.equal(blocked.load().status, 'unavailable');
  assert.equal(blocked.save({}), false);
});

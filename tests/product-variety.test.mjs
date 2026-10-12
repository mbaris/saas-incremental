import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  PRODUCT_PROBLEMS,
  PRODUCT_APPROACHES,
  availableProductProblems,
  offeredProductApproaches,
  commitProduct,
  analyseProduct,
  queueProject,
  startProject,
  tick,
  serialize,
  deserialize,
  productEffects,
  engineeringMaintenance,
  projectDebt,
  rollback,
  requirements,
  productParameters,
} from '../src/game.js';
import { validateProductCatalog } from '../src/product.ts';
import { handleIncidents } from '../tools/new-game-balance.mjs';
const company = (seed) => {
  const s = createGame(seed);
  chooseDirection(s, 'practical');
  return s;
};
const offers = (s) =>
  availableProductProblems(s).map((p) => [
    p.id,
    offeredProductApproaches(s, p.id).map((a) => a.id),
  ]);

test('100 valid named approaches cover 20 needs and have diverse delivery and operating effects', () => {
  assert.equal(PRODUCT_APPROACHES.length, 100);
  assert.equal(PRODUCT_PROBLEMS.length, 20);
  assert.equal(new Set(PRODUCT_APPROACHES.map((a) => a.id)).size, 100);
  assert.equal(new Set(PRODUCT_APPROACHES.map((a) => a.name)).size, 100);
  assert.ok(new Set(PRODUCT_APPROACHES.map((a) => a.days)).size > 10);
  assert.ok(new Set(PRODUCT_APPROACHES.map((a) => a.upkeep ?? 35)).size > 5);
  assert.doesNotThrow(() => validateProductCatalog(PRODUCT_PROBLEMS, PRODUCT_APPROACHES));
  const bad = structuredClone(PRODUCT_APPROACHES);
  bad[0].retention = -1;
  assert.throws(() => validateProductCatalog(PRODUCT_PROBLEMS, bad), /retention/);
});
test('seeded opportunities vary across runs, cover the pool, and never consume incident randomness', () => {
  const seen = new Set(),
    starts = new Set();
  for (let seed = 1; seed <= 256; seed++) {
    const s = company(seed),
      random = s.seed;
    assert.equal(availableProductProblems(s).length, 5);
    starts.add(JSON.stringify(offers(s)));
    s.engineering.completed = 100;
    for (const p of availableProductProblems(s)) {
      assert.equal(offeredProductApproaches(s, p.id).length, 3);
      for (const a of offeredProductApproaches(s, p.id)) seen.add(a.id);
    }
    assert.equal(s.seed, random);
  }
  assert.equal(seen.size, 100);
  assert.ok(starts.size > 100);
  const s = company(42),
    before = offers(s);
  s.seed = 999;
  s.product.analysed.setup = true;
  assert.deepEqual(offers(s), before);
  assert.deepEqual(offers(deserialize(serialize(s))), before);
});
test('progress discovers stable additional needs without making them enterprise requirements', () => {
  const s = company(42),
    initial = availableProductProblems(s).map((p) => p.id),
    requirementsCount = requirements(s).length;
  s.engineering.completed = 8;
  const developed = availableProductProblems(s).map((p) => p.id);
  assert.equal(developed.length, 9);
  assert.ok(initial.every((id) => developed.includes(id)));
  s.engineering.maxCustomers = 180;
  assert.equal(availableProductProblems(s).length, 12);
  s.customers = 0;
  assert.equal(availableProductProblems(s).length, 12);
  s.engineering.completed = 100;
  assert.equal(availableProductProblems(s).length, 20);
  assert.equal(requirements(s).length, requirementsCount);
});
test('unoffered approaches and undiscovered research cannot bypass the catalog through direct or queued actions', () => {
  const s = company(42),
    unoffered = PRODUCT_APPROACHES.find(
      (a) =>
        a.problem === 'setup' && !offeredProductApproaches(s, 'setup').some((o) => o.id === a.id),
    );
  const saved = serialize(s);
  assert.match(commitProduct(s, unoffered.id), /Not offered/);
  assert.match(queueProject(s, unoffered.id), /Not offered/);
  assert.equal(serialize(s), saved);
  const need = PRODUCT_PROBLEMS.find(
    (p) => !availableProductProblems(s).some((o) => o.id === p.id),
  );
  assert.match(analyseProduct(s, need.id), /not discovered/);
  const research = structuredClone(s);
  research.workQueue.push('analyse_' + need.id);
  assert.throws(() => deserialize(serialize(research)), /Undiscovered customer research/);
  const forged = structuredClone(s);
  forged.workQueue.push(unoffered.id);
  forged.product.selected.setup = unoffered.id;
  assert.throws(() => deserialize(serialize(forged)), /Unavailable product/);
});
test('a randomly offered feature can queue, ship, charge its own upkeep, refine and roll back', () => {
  const s = company(42),
    need = availableProductProblems(s).find((p) => !p.core);
  const a = offeredProductApproaches(s, need.id).find((a) => !a.requires.length);
  const fit = productParameters(s, a.id),
    before = productEffects(s);
  startProject(s, 'monitoring');
  assert.equal(queueProject(s, a.id), null);
  assert.equal(productEffects(s).value, before.value);
  assert.equal(s.product.selected[need.id], a.id);
  const other = offeredProductApproaches(s, need.id).find((p) => p.id !== a.id);
  assert.match(queueProject(s, other.id), /Another approach/);
  const saved = deserialize(serialize(s));
  assert.deepEqual(offers(saved), offers(s));
  for (
    let i = 0;
    i < 2000 && (s.work.length || s.workQueue.length || s.release || s.ready.length);
    i++
  ) {
    handleIncidents(s);
    tick(s);
  }
  assert.ok(s.upgrades.includes(a.id));
  assert.ok(Math.abs(productEffects(s).value - a.value * fit.smallFit) < 1e-8);
  assert.equal(engineeringMaintenance(s).monthly, a.upkeep);
  assert.ok(Math.abs(engineeringMaintenance(s).effort - 1 - a.effort) < 1e-8);
  assert.equal(projectDebt(s, a.id), a.debt);
  handleIncidents(s);
  assert.equal(startProject(s, 'refine_' + a.id), null);
  for (let i = 0; i < 2000 && (s.work.length || s.release || s.ready.length); i++) {
    handleIncidents(s);
    tick(s);
  }
  assert.equal(engineeringMaintenance(s).monthly, a.upkeep + 6);
  assert.ok(productEffects(s).value > a.value * fit.smallFit);
  rollback(s);
  assert.equal(engineeringMaintenance(s).monthly, a.upkeep);
  assert.equal(s.product.selected[need.id], a.id);
  assert.equal(deserialize(serialize(s)).product.selected[need.id], a.id);
});

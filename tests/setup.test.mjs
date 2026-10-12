import { chooseArchitecture } from './helpers.mjs';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  createGame,
  foundCompany,
  chooseDirection,
  chooseBusinessFocus,
  projectQuote,
  tick,
  serialize,
  deserialize,
  discoverViews,
  expansionBudget,
  startProject,
  setAgentPlan,
  economics,
  triggerIncident,
} from '../src/game.js';
import { playOpening } from '../tools/new-game-balance.mjs';
const company = (founder = 'generalist', capital = 5000) => {
  const s = createGame(42);
  assert.equal(foundCompany(s, { founder, capital, direction: 'practical' }), null);
  return s;
};

test('company setup freezes time and spending until the founding decision', () => {
  const s = createGame(),
    before = serialize(s);
  for (let i = 0; i < 40; i++) tick(s);
  assert.equal(serialize(s), before);
  assert.equal(
    foundCompany(s, { founder: 'engineer', capital: 15000, direction: 'specialist' }),
    null,
  );
  assert.equal(s.cash, 15000);
  assert.equal(s.funding.founderCapital, 15000);
  assert.equal(s.founder, 'engineer');
  assert.equal(s.customers, 0);
  assert.equal(s.architecturePath, 'monolith');
  assert.equal(s.funding.shareholders[0].ownership, 1);
  tick(s);
  assert.equal(s.time, 1);
  assert.ok(s.cash < 15000);
});
test('invalid and repeated setup requests are atomic', () => {
  for (const changes of [
    { founder: 'unknown' },
    { direction: 'unknown' },
    { capital: 4999 },
    { capital: 5050 },
    { capital: 500500 },
    { capital: NaN },
  ]) {
    const s = createGame(),
      before = serialize(s);
    assert.ok(
      foundCompany(s, { founder: 'generalist', capital: 5000, direction: 'practical', ...changes }),
    );
    assert.equal(serialize(s), before);
  }
  const s = company(),
    before = serialize(s);
  assert.ok(foundCompany(s, { founder: 'commercial', capital: 50000, direction: 'trend' }));
  assert.equal(serialize(s), before);
});
test('founder skill changes all development quotes and acquisition without changing retention', () => {
  const baseline = company(),
    engineer = company('engineer'),
    commercial = company('commercial');
  for (const id of ['monitoring', 'setup_guide']) {
    assert.ok(projectQuote(engineer, id).duration < projectQuote(baseline, id).duration);
    assert.ok(projectQuote(commercial, id).duration > projectQuote(baseline, id).duration);
  }
  for (const s of [baseline, engineer, commercial]) {
    s.customers = 5;
    s.cohorts = [{ count: 5, price: 29, renewAt: 360 }];
    tick(s);
  }
  assert.ok(engineer.lastAcquisition < baseline.lastAcquisition);
  assert.ok(commercial.lastAcquisition > baseline.lastAcquisition);
  assert.equal(commercial.lastChurn, baseline.lastChurn);
});
test('extra views appear from relevant evidence and remain available after recovery', () => {
  const s = company();
  assert.deepEqual(discoverViews(s), []);
  chooseBusinessFocus(s, 'growth');
  assert.deepEqual(discoverViews(s), ['funding']);
  chooseBusinessFocus(s, 'balanced');
  assert.deepEqual(discoverViews(s), []);
  assert.ok(s.revealedViews.includes('funding'));
  grantProjects(s, ['review', 'components', 'coordination_status']);
  s.customers = 15;
  const added = discoverViews(s);
  assert.ok(['system', 'security', 'enterprise'].every((id) => added.includes(id)));
  const events = s.events.length;
  assert.deepEqual(discoverViews(s), []);
  assert.equal(s.events.length, events);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.revealedViews, s.revealedViews);
});
test('detected security incidents reveal security before any review', () => {
  const s = company();
  triggerIncident(s, 'security');
  for (let i = 0; i < 10; i++) tick(s);
  assert.ok(s.revealedViews.includes('security'));
  assert.ok(!s.upgrades.includes('review'));
});
test('expansion estimates match fully occupied live budgets without charging or mutating', () => {
  const s = company();
  chooseArchitecture(s, 'monolith');
  setAgentPlan(s, 'parallel');
  const before = serialize(s),
    quote = expansionBudget(s);
  assert.equal(serialize(s), before);
  startProject(s, 'monitoring');
  startProject(s, 'review');
  assert.equal(quote.costs, economics(s).costs);
  assert.ok(quote.withInvestment > quote.runway);
  assert.ok(quote.burn > 2000);
});
test('setup saves preserve chosen founder and capital and reject invalid values', () => {
  for (const capital of [5000, 15000, 50000, 50500, 500000]) {
    const s = company('commercial', capital);
    assert.equal(s.cash, capital);
    assert.equal(s.funding.shareholders[0].ownership, 1);
    tick(s);
    const restored = deserialize(serialize(s));
    assert.equal(restored.founder, 'commercial');
    assert.equal(restored.funding.founderCapital, capital);
    assert.equal(restored.cash, s.cash);
  }
  for (const change of [
    (s) => (s.founder = 'unknown'),
    (s) => (s.funding.founderCapital = 5010),
    (s) => (s.funding.founderCapital = 500500),
    (s) => (s.revealedViews = ['funding', 'funding']),
    (s) => (s.revealedViews = ['unknown']),
  ]) {
    const s = company();
    change(s);
    assert.throws(() => deserialize(serialize(s)));
  }
});
test('an adequately capitalized bootstrap requires months of losses and value-backed repricing', () => {
  const run = playOpening();
  assert.ok(run.end.completed >= 8);
  assert.equal(run.end.closed, false);
  assert.equal(run.end.emergency, false);
  assert.ok(run.end.profit > 0, JSON.stringify(run.end));
  assert.ok(run.breakEven.day > 180);
  assert.ok(run.capital - run.lowestCash > 12000);
  assert.equal(run.raised, 0);
  assert.equal(run.ownership, 1);
});
test('Seed becomes available before profitability and buys meaningful parallel development runway', () => {
  const run = playOpening({ capital: 5000, growth: true, investment: true });
  assert.ok(run.firstSeed);
  assert.ok(run.firstSeed.profit < 0);
  assert.ok(run.firstSeed.day < 40);
  assert.ok(run.firstSeed.expansion.runway < 2);
  assert.ok(run.firstSeed.expansion.withInvestment - run.firstSeed.expansion.runway > 2);
  assert.ok(run.raised >= 20000);
  assert.ok(run.ownership < 1);
});
test('investment enables a longer expansion program without making bootstrapping compulsory', () => {
  const unfunded = playOpening({ growth: true }),
    funded = playOpening({ growth: true, investment: true });
  assert.equal(unfunded.end.emergency, true);
  assert.equal(funded.end.emergency, false);
  assert.ok(funded.end.completed > unfunded.end.completed);
  assert.ok(funded.end.reliability > 90);
  assert.ok(funded.lowestCash > 0);
  assert.equal(funded.end.closed, false);
});
test('all founder tradeoffs remain viable with default capital', () => {
  for (const founderId of ['engineer', 'commercial']) {
    const run = playOpening({ founderId });
    assert.ok(run.end.completed >= 8);
    assert.equal(run.end.emergency, false);
    assert.ok(run.end.profit > 0, founderId + ': ' + JSON.stringify(run.end));
    assert.ok(run.lowestCash > 0);
    assert.equal(run.ownership, 1);
  }
});
test('minimum personal capital cannot automatically fund a healthy bootstrap', () => {
  const run = playOpening({ capital: 5000 });
  assert.equal(run.end.emergency, true);
  assert.equal(run.breakEven, null);
  assert.ok(run.end.completed < 8);
  assert.equal(run.raised, 0);
});

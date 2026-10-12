import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  foundCompany,
  chooseCustomerTarget,
  customerValue,
  marketingForecast,
  setMarketingBudget,
  publishPrices,
  tick,
  economics,
  system,
  costBreakdown,
  productParameters,
  serialize,
  deserialize,
  DAY,
  MONTH,
  fundingOffer,
} from '../src/game.js';
import { playOpening } from '../tools/new-game-balance.mjs';
import { grantProjects } from './helpers.mjs';
const company = (target) => {
  const s = createGame(42);
  foundCompany(s, {
    founder: 'generalist',
    capital: 25000,
    direction: 'practical',
    customerTarget: target,
  });
  return s;
};
test('individual and small-team acquisition are separate and targeting preserves existing subscriptions', () => {
  const solo = company('individual'),
    teams = company('small');
  for (let i = 0; i < DAY; i++) {
    tick(solo);
    tick(teams);
  }
  assert.ok(solo.individualCustomers > teams.customers);
  assert.equal(solo.customers, 0);
  assert.equal(teams.individualCustomers, 0);
  const previous = structuredClone(solo.individualCohorts);
  assert.equal(chooseCustomerTarget(solo, 'small'), null);
  assert.deepEqual(solo.individualCohorts, previous);
  tick(solo);
  assert.ok(solo.customers > 0);
  assert.ok(solo.individualCustomers > 0);
  assert.equal(solo.lastIndividualAcquisition, 0);
  const snapshot = serialize(solo);
  assert.ok(chooseCustomerTarget(solo, 'unknown'));
  assert.equal(serialize(solo), snapshot);
});
test('a shared marketing budget targets each audience without doubling spending', () => {
  const s = company('small');
  setMarketingBudget(s, 500);
  const small = marketingForecast(s),
    bill = economics(s).costs;
  chooseCustomerTarget(s, 'individual');
  const individual = marketingForecast(s);
  assert.equal(individual.segments.small.signups, 0);
  assert.ok(individual.signups > small.signups);
  chooseCustomerTarget(s, 'mixed');
  const mixed = marketingForecast(s);
  assert.equal(economics(s).costs, bill);
  assert.equal(mixed.segments.small.signups, small.signups / 2);
  assert.equal(mixed.segments.individual.signups, individual.signups / 2);
  assert.equal(mixed.signups, mixed.segments.small.signups + mixed.segments.individual.signups);
});
test('individual pricing changes only new subscriptions and renewals, with independent value gates', () => {
  const s = company('individual');
  grantProjects(s, ['version', 'setup_guide']);
  s.individualCustomers = 10;
  s.individualCohorts = [{ count: 10, price: 9, renewAt: DAY * 2, source: 'organic' }];
  const revenue = economics(s).individualRevenue;
  assert.equal(publishPrices(s, 29, 2600, 12), null);
  assert.equal(economics(s).individualRevenue, revenue);
  tick(s);
  assert.ok(s.individualCohorts.some((c) => c.price === 9));
  assert.ok(s.individualCohorts.some((c) => c.price === 12));
  while (s.time < DAY * 2) tick(s);
  assert.ok(s.individualCohorts.every((c) => c.price === 12));
  assert.equal(publishPrices(s, 29, 2600, 60), null);
  assert.equal(customerValue(s, 'individual').interested, false);
  assert.equal(customerValue(s, 'small').interested, true);
  chooseCustomerTarget(s, 'mixed');
  tick(s);
  assert.equal(s.lastIndividualAcquisition, 0);
  assert.ok(s.lastAcquisition > 0);
  const bad = serialize(s);
  assert.ok(publishPrices(s, 29, 2600, 0));
  assert.equal(serialize(s), bad);
});
test('individuals have distinct product fit, lower workload and support, and count toward financing', () => {
  const solo = company('individual'),
    teams = company('small');
  solo.individualCustomers = 80;
  solo.individualCohorts = [{ count: 80, price: 9, renewAt: MONTH }];
  teams.customers = 80;
  teams.cohorts = [{ count: 80, price: 29, renewAt: MONTH }];
  assert.ok(system(solo).demand < system(teams).demand);
  assert.ok(
    costBreakdown(solo).find((r) => r.id === 'support').amount <
      costBreakdown(teams).find((r) => r.id === 'support').amount,
  );
  assert.ok(
    productParameters(solo, 'setup_guide').individualFit >
      productParameters(solo, 'coordination_status').individualFit,
  );
  grantProjects(solo, ['version', 'setup_guide']);
  assert.equal(fundingOffer(solo, 'seed').eligible, true);
  const revenue = economics(solo);
  assert.equal(
    revenue.revenue,
    revenue.individualRevenue + revenue.smallRevenue + revenue.contractRevenue,
  );
  assert.deepEqual(deserialize(serialize(solo)).individualCohorts, solo.individualCohorts);
  for (const change of [
    (s) => (s.customerTarget = 'bad'),
    (s) => (s.pricing.individual = 0),
    (s) => (s.individualCohorts[0].count = -1),
    (s) => (s.individualCustomers = 1),
    (s) => (s.individualCohorts[0].source = 'fake'),
  ]) {
    const copy = structuredClone(solo);
    change(copy);
    assert.throws(() => deserialize(serialize(copy)));
  }
});

test('individuals churn faster and rejected renewals preserve subscriptions not yet due', () => {
  const s = company('mixed');
  grantProjects(s, ['version', 'setup_guide']);
  s.customers = 10;
  s.cohorts = [{ count: 10, price: 29, renewAt: MONTH }];
  s.individualCustomers = 10;
  s.individualCohorts = [{ count: 10, price: 9, renewAt: DAY }];
  tick(s);
  assert.ok(s.lastIndividualChurn > s.lastChurn);
  publishPrices(s, 29, 2600, 60);
  while (s.time < DAY) tick(s);
  assert.ok(s.individualCustomers > 0 && s.individualCustomers < 1);
  assert.ok(s.individualCohorts.every((c) => c.renewAt > s.time));
  assert.ok(s.customers > 0);
});
test('a bootstrapped individual-only product can sustain profit without teams, contracts or investment', () => {
  const run = playOpening({ audience: 'individual', seed: 1, days: 720 });
  assert.equal(run.end.closed, false);
  assert.equal(run.end.emergency, false);
  assert.equal(run.raised, 0);
  assert.equal(run.ownership, 1);
  assert.equal(run.end.customers, 0);
  assert.equal(run.state.contract.status, 'prospect');
  assert.ok(run.end.individuals > 100);
  assert.ok(run.end.profit > 0);
  assert.ok(run.lowestCash > 0);
  assert.ok(run.breakEven.day > 120);
});

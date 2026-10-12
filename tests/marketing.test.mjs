import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  foundCompany,
  setMarketingBudget,
  marketingForecast,
  tick,
  economics,
  serialize,
  deserialize,
  publishPrices,
  MONTH,
  DAY,
  chooseBusinessFocus,
} from '../src/game.js';
const company = () => {
  const s = createGame(42);
  foundCompany(s, { founder: 'generalist', capital: 25000, direction: 'practical' });
  return s;
};
test('marketing budget changes are validated and incur spending over time, never upfront', () => {
  const s = company(),
    cash = s.cash;
  assert.equal(setMarketingBudget(s, 500), null);
  assert.equal(s.cash, cash);
  const e = economics(s);
  assert.equal(e.breakdown.find((r) => r.id === 'marketing').amount, 500);
  tick(s);
  assert.equal(s.marketing.spent, 500 / MONTH);
  assert.ok(Math.abs(s.cash - cash + e.costs / MONTH) < 1e-8);
  for (const budget of [-100, 101, 10001, NaN]) {
    const before = serialize(s);
    assert.ok(setMarketingBudget(s, budget));
    assert.equal(serialize(s), before);
  }
});
test('campaign reach has diminishing returns and conversion depends on customer value, trust and reliability', () => {
  const s = company(),
    before = serialize(s),
    small = marketingForecast(s, 500),
    large = marketingForecast(s, 2000);
  assert.equal(serialize(s), before);
  assert.equal(large.potential, small.potential * 2);
  assert.ok(small.signups > 0);
  s.trust = 30;
  assert.ok(marketingForecast(s, 500).signups < small.signups);
  s.trust = 78;
  s.reliability = 50;
  assert.ok(marketingForecast(s, 500).signups < small.signups);
  publishPrices(s, 200, 2600);
  assert.equal(marketingForecast(s, 500).signups, 0);
});
test('paid signups are incremental and preserve source attribution through renewal, churn and campaign shutdown', () => {
  const organic = company(),
    paid = company();
  setMarketingBudget(paid, 500);
  for (let i = 0; i < MONTH + DAY + 1; i++) {
    if (i === MONTH / 2) {
      publishPrices(paid, 35, 2600);
      publishPrices(organic, 35, 2600);
    }
    tick(organic);
    tick(paid);
  }
  assert.ok(paid.customers > organic.customers);
  assert.ok(paid.marketing.acquired > 0);
  assert.ok(marketingForecast(paid).retained > 0);
  assert.ok(marketingForecast(paid).retained < paid.marketing.acquired);
  assert.ok(marketingForecast(paid).cac > 0);
  assert.ok(
    paid.cohorts.some(
      (c) => c.source === 'paid' && c.renewAt === 2 * MONTH + DAY && c.price === 35,
    ),
  );
  const spent = paid.marketing.spent,
    acquired = paid.marketing.acquired,
    retained = marketingForecast(paid).retained;
  setMarketingBudget(paid, 0);
  tick(paid);
  assert.equal(paid.marketing.spent, spent);
  assert.equal(paid.marketing.acquired, acquired);
  assert.ok(marketingForecast(paid).retained > 0);
  assert.ok(marketingForecast(paid).retained < retained);
  assert.deepEqual(deserialize(serialize(paid)).marketing, paid.marketing);
});
test('poor offers still spend campaign budget but do not convert; growth policy never implicitly bills a campaign', () => {
  const s = company();
  chooseBusinessFocus(s, 'growth');
  assert.equal(economics(s).breakdown.find((r) => r.id === 'marketing').amount, 0);
  publishPrices(s, 200, 2600);
  setMarketingBudget(s, 500);
  tick(s);
  assert.equal(s.marketing.spent, 500 / MONTH);
  assert.equal(s.marketing.acquired, 0);
});
test('cash recovery pauses campaigns automatically while preserving the selected budget', () => {
  const s = company();
  setMarketingBudget(s, 1000);
  s.cash = 0;
  tick(s);
  assert.equal(s.solvency.emergency, true);
  assert.equal(s.marketing.budget, 1000);
  assert.equal(s.marketing.spent, 0);
  assert.equal(s.marketing.acquired, 0);
  assert.equal(marketingForecast(s).potential, 0);
  assert.equal(economics(s).breakdown.find((r) => r.id === 'marketing').amount, 0);
});
test('marketing saves reject malformed budgets, counters, and cohort sources', () => {
  for (const mutate of [
    (s) => (s.marketing.budget = 101),
    (s) => (s.marketing.spent = -1),
    (s) => (s.marketing.acquired = NaN),
    (s) => (s.cohorts = [{ count: 1, price: 29, renewAt: 360, source: 'unknown' }]),
  ]) {
    const s = company();
    mutate(s);
    assert.throws(() => deserialize(serialize(s)));
  }
});

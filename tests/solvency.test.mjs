import { chooseArchitecture } from './helpers.mjs';
import { test } from 'node:test';
import { grantProjects, allProjects } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  createGame,
  chooseDirection,
  chooseBusinessFocus,
  setAgentPlan,
  startProject,
  tick,
  system,
  economics,
  activeProjects,
  triggerIncident,
  publishPrices,
  fundingOffer,
  raiseFunding,
  resumeDevelopment,
  reduceCapacity,
  costCutQuote,
  solvencySummary,
  arrears,
  isClosed,
  serialize,
  deserialize,
  CASH_GRACE,
  CASH_SUSPEND,
  CASH_CLOSE,
} from '../src/game.js';
const advance = (s, n) => {
  for (let i = 0; i < n; i++) tick(s);
};
const company = (path = 'monolith') => {
  const s = createGame(42);
  chooseDirection(s, 'practical');
  chooseArchitecture(s, path);
  publishPrices(s, 200, 2600);
  return s;
};
const ledger = (s) => {
  assert.ok(s.cash >= 0);
  assert.ok(
    Math.abs(s.finance.operatingSpend - s.finance.operatingPaid - s.solvency.operatingDebt) < 1e-6,
  );
  assert.ok(Math.abs(s.totals.fines - s.finance.penaltiesPaid - s.solvency.penaltyDebt) < 1e-6);
};

test('runway warnings are automatic, threshold-based, and do not repeat each tick', () => {
  const s = company();
  s.cash = economics(s).costs / 3;
  tick(s);
  assert.ok(s.events.some((e) => e.title === 'Runway warning'));
  const initial = s.events.filter((e) => e.title === 'Runway warning').length;
  advance(s, 5);
  assert.equal(s.events.filter((e) => e.title === 'Runway warning').length, initial);
  assert.equal(s.solvency.emergency, false);
  s.cash = 50;
  tick(s);
  assert.equal(s.solvency.warningLevel, 2);
  assert.ok(s.events.filter((e) => e.title === 'Runway warning').length > initial);
});
test('cash exhaustion pauses development and optional spending before accumulating unpaid essentials', () => {
  const s = company();
  chooseBusinessFocus(s, 'growth');
  setAgentPlan(s, 'intensive');
  startProject(s, 'setup_guide');
  tick(s);
  const progress = s.work[0].progress;
  s.cash = 0;
  tick(s);
  assert.equal(s.solvency.emergency, true);
  assert.equal(s.work[0].progress, progress);
  assert.equal(activeProjects(s).length, 0);
  assert.ok(arrears(s) > 0);
  assert.equal(s.cash, 0);
  const e = economics(s);
  assert.equal(e.breakdown.find((r) => r.id === 'founder').amount, 0);
  assert.equal(e.breakdown.find((r) => r.id === 'marketing').amount, 0);
  assert.equal(e.breakdown.find((r) => r.id === 'applications').amount, 80);
  assert.ok(e.breakdown.find((r) => r.id === 'tokens').amount > 0);
  assert.match(startProject(s, 'version'), /cash recovery/);
  ledger(s);
});
test('unpaid infrastructure gets a grace period, limited capacity, then company closure', () => {
  const s = company();
  s.cash = 0;
  grantProjects(s, ['workflow_rules', 'jobs']);
  const baseline = system(s);
  tick(s);
  const started = s.solvency.unpaidSince;
  assert.equal(s.solvency.stage, 'grace');
  advance(s, CASH_GRACE - 1);
  assert.equal(s.solvency.stage, 'grace');
  tick(s);
  assert.equal(s.solvency.stage, 'restricted');
  assert.ok(Math.abs(system(s).capacity / baseline.capacity - 0.35) < 1e-9);
  assert.equal(system(s).background.reports.capacity, baseline.background.reports.capacity * 0.35);
  advance(s, CASH_SUSPEND - CASH_GRACE);
  assert.equal(s.solvency.stage, 'suspended');
  assert.ok(Math.abs(system(s).capacity / baseline.capacity - 0.1) < 1e-9);
  advance(s, CASH_CLOSE - CASH_SUSPEND);
  assert.equal(s.solvency.stage, 'closed');
  assert.equal(s.solvency.closedAt, started + CASH_CLOSE);
  assert.equal(s.paused, true);
  assert.ok(isClosed(s));
  ledger(s);
  const snapshot = serialize(s);
  advance(s, 100);
  assert.equal(serialize(s), snapshot);
  assert.match(publishPrices(s, 29, 2600), /closed/);
  assert.match(raiseFunding(s, 'seed'), /closed/);
  assert.match(setAgentPlan(s, 'lean'), /closed/);
  assert.equal(serialize(s), snapshot);
  assert.equal(isClosed(createGame()), false);
});
test('provider limits damage reliability and trust even without monitoring', () => {
  const s = company();
  s.cash = 0;
  s.customers = 20;
  s.cohorts = [{ count: 20, price: 5, renewAt: 360 }];
  s.solvency.emergency = true;
  advance(s, CASH_GRACE + 120);
  assert.equal(s.solvency.stage, 'restricted');
  assert.ok(s.reliability < 98);
  assert.ok(s.trust < 78);
  assert.ok(s.events.some((e) => e.title === 'Provider capacity restricted'));
  ledger(s);
});
test('funding pays outstanding bills immediately and preserves paused drafts until explicit resumption', () => {
  const s = company();
  grantProjects(s, ['setup_guide', 'host', 'database']);
  s.customers = 6;
  s.cohorts = [{ count: 6, price: 29, renewAt: 360 }];
  startProject(s, 'version');
  s.cash = 0;
  tick(s);
  const debt = arrears(s),
    progress = s.work[0].progress;
  assert.ok(debt > 0);
  assert.equal(s.solvency.emergency, true);
  assert.match(resumeDevelopment(s), /Settle/);
  assert.ok(fundingOffer(s).eligible);
  const investment = fundingOffer(s).investment;
  assert.equal(raiseFunding(s, 'seed'), null);
  assert.ok(Math.abs(s.cash - (investment - debt)) < 1e-8);
  assert.equal(arrears(s), 0);
  assert.equal(s.solvency.stage, 'healthy');
  assert.equal(s.solvency.emergency, true);
  assert.equal(resumeDevelopment(s), null);
  tick(s);
  assert.ok(s.work[0].progress > progress);
  assert.ok(s.funding.shareholders[0].ownership < 1);
  ledger(s);
});
test('surplus subscription revenue can settle bills and restore service without investment', () => {
  const s = company();
  s.cash = 0;
  advance(s, CASH_GRACE + 2);
  assert.equal(s.solvency.stage, 'restricted');
  const debt = arrears(s);
  s.customers = 25;
  s.cohorts = [{ count: 25, price: 29, renewAt: s.time + 360 }];
  advance(s, 120);
  assert.ok(debt > 0);
  assert.equal(arrears(s), 0);
  assert.equal(s.solvency.stage, 'healthy');
  assert.equal(s.solvency.unpaidSince, null);
  assert.equal(s.funding.raised, 0);
  assert.ok(s.cash > 0);
  ledger(s);
});
test('partial payment cannot reset the arrears clock or bypass closure', () => {
  const s = company();
  s.cash = 0;
  advance(s, CASH_GRACE + 1);
  const since = s.solvency.unpaidSince,
    debt = arrears(s);
  s.cash = debt / 2;
  tick(s);
  assert.ok(arrears(s) > 0);
  assert.equal(s.solvency.unpaidSince, since);
  assert.equal(s.solvency.stage, 'restricted');
  ledger(s);
});
test('security penalties become explicit debts instead of negative cash', () => {
  const s = company();
  s.cash = 0;
  triggerIncident(s, 'security');
  advance(s, 8);
  assert.ok(s.totals.fines > 0);
  assert.equal(s.solvency.penaltyDebt, s.totals.fines);
  assert.equal(s.finance.penaltiesPaid, 0);
  assert.equal(s.cash, 0);
  ledger(s);
});
test('capacity cuts lower the matching bill and preserve customer data and pricing', () => {
  for (const [path, id, upgrades, field] of [
    ['monolith', 'replicas', ['database', 'replicas'], null],
    ['monolith', 'data_scale', ['database', 'data_scale'], 'databaseTier'],
    ['monolith', 'workers', ['workflow_rules', 'jobs', 'workers'], 'workerReplicas'],
    ['services', 'service_scale', ['database', 'service_scale'], null],
    ['functions', 'warm', ['warm'], null],
    ['functions', 'concurrency', ['concurrency'], 'functionTier'],
  ]) {
    const s = company(path);
    s.upgrades = upgrades;
    if (field) s[field] = 1;
    s.customers = 20;
    s.cohorts = [{ count: 20, price: 29, renewAt: 360 }];
    const before = economics(s).costs,
      quote = costCutQuote(s, id),
      cohorts = serialize(s.cohorts),
      prices = serialize(s.pricing);
    assert.ok(id === 'concurrency' ? quote >= 0 : quote > 0);
    assert.equal(reduceCapacity(s, id), null);
    assert.ok(Math.abs(before - economics(s).costs - quote) < 1e-8);
    assert.equal(serialize(s.cohorts), cohorts);
    assert.equal(serialize(s.pricing), prices);
    assert.deepEqual(s.totals, { fines: 0, lostRecords: 0, stolenRecords: 0 });
  }
});
test('emergency resumption requires a cash buffer and price publication respects existing rates', () => {
  const s = company();
  s.solvency.emergency = true;
  s.cash = 0;
  assert.match(resumeDevelopment(s), /1 day/);
  s.cash = 100;
  assert.equal(resumeDevelopment(s), null);
  s.customers = 5;
  s.cohorts = [{ count: 5, price: 29, renewAt: 360 }];
  const revenue = economics(s).revenue;
  publishPrices(s, 50, 3500);
  assert.equal(economics(s).revenue, revenue);
  assert.equal(s.cohorts[0].price, 29);
});
test('financial state reloads with its deadlines and rejects invalid unpaid-bill ledgers', () => {
  const s = company();
  s.cash = 0;
  advance(s, 40);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.solvency, s.solvency);
  assert.deepEqual(restored.finance, s.finance);
  assert.equal(solvencySummary(restored).closureIn, solvencySummary(s).closureIn);
  for (const mutate of [
    (bad) => (bad.cash = -1),
    (bad) => (bad.solvency.operatingDebt = -1),
    (bad) => bad.finance.operatingPaid++,
    (bad) => (bad.solvency.stage = 'closed'),
    (bad) => (bad.solvency.unpaidSince = bad.time + 1),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => deserialize(serialize(bad)));
  }
});

test('a fresh company naturally reaches closure with fully reconciled cash, costs, and debts', () => {
  const s = company();
  for (let i = 0; !isClosed(s) && i < 10000; i++) tick(s);
  assert.ok(isClosed(s));
  ledger(s);
  assert.ok(
    Math.abs(
      s.cash -
        (s.funding.founderCapital +
          s.funding.raised +
          s.finance.earned -
          s.finance.operatingPaid -
          s.finance.penaltiesPaid),
    ) < 1e-6,
  );
  assert.ok(Math.abs(s.finance.operatingSpend - s.funding.founderCapital - arrears(s)) < 1e-6);
  assert.equal(deserialize(serialize(s)).solvency.closedAt, s.solvency.closedAt);
});

import { mkdir, writeFile } from 'node:fs/promises';
import { playOpening, handleIncidents } from './new-game-balance.mjs';
import {
  createGame,
  foundCompany,
  chooseBusinessFocus,
  setAgentPlan,
  startProject,
  tick,
  economics,
  fundingOffer,
  raiseFunding,
  DAY,
  isClosed,
  publishPrices,
  has,
  system,
  projectQuote,
  pursue,
  requirements,
} from '../src/game.js';

function enterprise(seed, days = 720) {
  const s = createGame(seed);
  foundCompany(s, { founder: 'generalist', capital: 25000, direction: 'practical' });
  chooseBusinessFocus(s, 'enterprise');
  setAgentPlan(s, 'standard');
  const goals = [
    'monitoring',
    'setup_guide',
    'tests',
    'components',
    'host',
    'optimize',
    'cache',
    'database',
    'workflow_presets',
    'coordination_status',
    'replicas',
    'access',
    'backup',
    'audit',
    'pipeline',
    'review',
    'certification',
  ];
  let index = 0,
    firstContract = null,
    contractDays = 0,
    lowestCash = s.cash,
    failures = 0,
    certRenewals = 0;
  for (let t = 0; t < days * DAY && !isClosed(s); t++) {
    const offer = fundingOffer(s);
    if (offer?.eligible) raiseFunding(s, offer.id);
    if (s.contract.status === 'prospect' && requirements(s).every(([, ok]) => ok)) pursue(s);
    if (has(s, 'coordination_status') && s.pricing.small === 29) publishPrices(s, 45, 3200);
    if (!s.work.length && !s.release && !s.ready.length && !s.response && !s.solvency.emergency) {
      let id = goals[index],
        m = system(s);
      if (
        has(s, 'certification') &&
        s.certifiedUntil - s.time < projectQuote(s, 'certification').duration + 12 * DAY
      )
        id = 'certification';
      else if (s.engineering.debt > 38) id = 'debt_cleanup';
      else if (s.engineering.wear > 25) id = 'bugfix';
      else if (has(s, 'components') && has(s, 'database') && m.dbLoad > 85 && s.databaseTier < 3)
        id = 'data_scale';
      if (id && startProject(s, id) === null) {
        if (id === goals[index]) index++;
        if (id === 'certification') certRenewals++;
      }
    }
    handleIncidents(s);
    const incidents = s.incidents.length;
    tick(s);
    if (s.incidents.length > incidents) failures++;
    lowestCash = Math.min(lowestCash, s.cash);
    if (s.contract.status === 'active') {
      contractDays += 1 / DAY;
      firstContract ??= s.time / DAY;
    }
  }
  return { state: s, lowestCash, firstContract, contractDays, failures, certRenewals, index };
}
const rows = [];
for (const seed of [1, 42, 74123]) {
  for (const strategy of ['sustainable', 'funded growth', 'enterprise']) {
    const run =
      strategy === 'enterprise'
        ? enterprise(seed)
        : playOpening({
            seed,
            days: 720,
            capital: 25000,
            growth: strategy === 'funded growth',
            investment: strategy === 'funded growth',
          });
    const s = run.state,
      e = economics(s);
    rows.push({
      strategy,
      seed,
      day: Math.round(s.time / DAY),
      cash: Math.round(s.cash),
      lowestCash: Math.round(run.lowestCash),
      customers: Math.round(s.customers),
      monthlyProfit: Math.round(e.profit),
      completed: s.engineering.completed,
      reliability: Math.round(s.reliability),
      debt: Math.round(s.engineering.debt),
      raised: s.funding.raised,
      ownership: Math.round(s.funding.shareholders[0].ownership * 100),
      emergency: s.solvency.emergency,
      closed: isClosed(s),
      firstContract: run.firstContract === undefined ? null : run.firstContract,
      contractDays: Math.round(run.contractDays || 0),
      certificationAttempts: run.certRenewals || 0,
    });
  }
}
await mkdir('artifacts/review-pack', { recursive: true });
await writeFile(
  'artifacts/review-pack/strategy-playtest.json',
  JSON.stringify(
    {
      note: 'Played deterministic policies with $25,000, Generalist, Practical tools, monolith, 720-day horizon; no grants or mock state. Explicit policy informs customers and repairs every detected incident. Policies differ in task order, budget and investment. These are viability probes, not optimal strategies.',
      rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(rows, null, 2));

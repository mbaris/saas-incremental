import { pathToFileURL } from 'node:url';
import {
  createGame,
  foundCompany,
  chooseBusinessFocus,
  setAgentPlan,
  startProject,
  deploy,
  tick,
  economics,
  fundingOffer,
  raiseFunding,
  DAY,
  isClosed,
  expansionBudget,
  publishPrices,
  has,
  setMarketingBudget,
  communicate,
  respond,
  deferIncident,
} from '../src/game.js';

// Explicit player policy for unattended simulations; the game never chooses a response.
export function handleIncidents(s) {
  for (const i of s.incidents.filter((i) => i.announced)) {
    communicate(s, i.id);
    if (!s.response) respond(s, i.id);
    else if (i.awaitingDecision) deferIncident(s, i.id);
  }
}
export function playOpening({
  capital = 25000,
  founderId = 'generalist',
  growth = false,
  investment = false,
  seed = 42,
  days = 360,
  marketing = 0,
  analysis = false,
  direction = 'practical',
  audience = 'small',
} = {}) {
  const s = createGame(seed);
  foundCompany(s, { founder: founderId, capital, direction, customerTarget: audience });
  chooseBusinessFocus(s, growth ? 'growth' : 'bootstrap');
  setAgentPlan(s, growth ? 'parallel' : 'lean');
  setMarketingBudget(s, marketing);
  const baseQueue =
    audience === 'individual'
      ? [
          'monitoring',
          'setup_guide',
          'tests',
          'workflow_presets',
          'components',
          'optimize',
          'host',
          'cache',
          'refine_setup_guide',
          'refine_workflow_presets',
          'backup',
        ]
      : growth
        ? [
            'monitoring',
            'setup_guide',
            'tests',
            'components',
            'host',
            'optimize',
            'cache',
            'database',
            'coordination_status',
            'replicas',
            'refine_setup_guide',
            'backup',
            'access',
          ]
        : [
            'monitoring',
            'setup_guide',
            'components',
            'optimize',
            'host',
            'cache',
            'coordination_status',
            'refine_setup_guide',
          ];
  const queue = baseQueue.flatMap((id) =>
    analysis && ['setup_guide', 'coordination_status'].includes(id)
      ? ['analyse_' + (id === 'setup_guide' ? 'setup' : 'coordination'), id]
      : [id],
  );
  let index = 0,
    firstSeed = null,
    breakEven = null,
    lowestCash = capital;
  const snapshot = () => {
    const e = economics(s);
    return {
      day: Number((s.time / DAY).toFixed(1)),
      cash: Math.round(s.cash),
      customers: Number(s.customers.toFixed(1)),
      individuals: Number(s.individualCustomers.toFixed(1)),
      revenue: Math.round(e.revenue),
      costs: Math.round(e.costs),
      profit: Math.round(e.profit),
      reliability: Math.round(s.reliability),
      completed: s.engineering.completed,
      emergency: s.solvency.emergency,
      closed: isClosed(s),
    };
  };
  for (let i = 0; i < days * DAY && !isClosed(s); i++) {
    // Fill available slots only when the next project's real prerequisites permit it.
    while (index < queue.length && !startProject(s, queue[index])) index++;

    handleIncidents(s);
    tick(s);
    lowestCash = Math.min(lowestCash, s.cash);
    if (audience === 'individual' && has(s, 'workflow_presets') && s.pricing.individual === 9)
      publishPrices(s, s.pricing.small, 2600, 18);
    if (!growth && has(s, 'coordination_status') && s.pricing.small === 29)
      publishPrices(s, 45, 2600);
    if (index === queue.length && !s.work.length && !s.release && !s.ready.length) {
      if (s.engineering.wear > 20) startProject(s, 'bugfix');
      else if (s.engineering.debt > 35) startProject(s, 'debt_cleanup');
    }
    const offer = fundingOffer(s, 'seed');
    if (!firstSeed && offer.eligible)
      firstSeed = {
        ...snapshot(),
        dilution: Number((offer.dilution * 100).toFixed(1)),
        expansion: expansionBudget(s, 'parallel'),
      };
    const next = fundingOffer(s);
    if (investment && next?.eligible) raiseFunding(s, next.id);
    if (!breakEven && !s.solvency.emergency && economics(s).profit >= 0) breakEven = snapshot();
  }
  return {
    capital,
    founderId,
    audience,
    growth,
    investment,
    seed,
    analysis,
    direction,
    marketing,
    firstSeed,
    breakEven,
    lowestCash: Math.round(lowestCash),
    end: snapshot(),
    raised: s.funding.raised,
    ownership: s.funding.shareholders[0].ownership,
    state: s,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [5000, 15000, 25000, 50000].flatMap((capital) => [
    playOpening({ capital }),
    playOpening({ capital, growth: true }),
    playOpening({ capital, growth: true, investment: true }),
  ]);
  rows.push(playOpening({ capital: 25000, marketing: 500 }));
  rows.push(playOpening({ capital: 25000, analysis: true }));
  console.log(
    JSON.stringify(
      rows.map(({ state, firstSeed, ...r }) => ({
        ...r,
        firstSeed: firstSeed
          ? {
              ...firstSeed,
              expansion: {
                costs: Math.round(firstSeed.expansion.costs),
                burn: Math.round(firstSeed.expansion.burn),
                runway: firstSeed.expansion.runway,
                withInvestment: firstSeed.expansion.withInvestment,
              },
            }
          : null,
      })),
      null,
      2,
    ),
  );
}

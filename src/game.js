export { createGame } from './state.js';
export { serialize, deserialize } from './persistence.js';
import {
  projectAvailable,
  pendingProjects,
  retiredProjects,
  applyArchitecture,
  architectureConflict,
} from './architecture-policy.ts';
import { PRODUCT_PROBLEMS } from './product.ts';
export { projectAvailable } from './architecture-policy.ts';
import { MAX_DRAFTS, QUEUE_LIMIT, CASH_GRACE, CASH_SUSPEND, CASH_CLOSE } from './constants.ts';
export { QUEUE_LIMIT, CASH_GRACE, CASH_SUSPEND, CASH_CLOSE } from './constants.ts';
import { PROJECTS, project } from './projects.ts';
export { PROJECTS, project } from './projects.ts';
import {
  BUSINESS_FOCUSES,
  PRODUCT_DIRECTIONS,
  FOUNDERS,
  AGENT_PLANS,
  FUNDING_ROUNDS,
} from './config/company.ts';
export {
  ARCHITECTURE_PATHS,
  BUSINESS_FOCUSES,
  PRODUCT_DIRECTIONS,
  FOUNDERS,
  AGENT_PLANS,
  FUNDING_ROUNDS,
} from './config/company.ts';
import { DAY, MONTH } from './constants.ts';
export { DAY, MONTH, SAVE_VERSION } from './constants.ts';
import { CUSTOMER_SEGMENTS, CUSTOMER_TARGETS } from './config/customers.ts';
export { CUSTOMER_SEGMENTS, CUSTOMER_TARGETS } from './config/customers.ts';
import { architecture } from './architecture.ts';
import { EXTRA_PROJECTS, STAGES, level, roadmapEffects, debtSummary } from './roadmap.ts';
import {
  productEffects,
  productParameters,
  productSignals,
  hasCapability,
  productOpportunityBlock,
} from './product.ts';
export {
  PRODUCT_PROBLEMS,
  PRODUCT_APPROACHES,
  productEffects,
  productParameters,
  hasCapability,
  availableProductProblems,
  offeredProductApproaches,
} from './product.ts';
export { STAGES, level, debtSummary } from './roadmap.ts';

const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const has = (s, id) => s.upgrades.includes(id);
export const isClosed = (s) => s.solvency.closedAt !== null;

export const availableProjects = (s) => PROJECTS.filter((p) => projectAvailable(s, p));

export function engineeringStage(s) {
  const experience = Math.max(
      s.engineering.completed,
      s.upgrades.filter((id) => !project(id)?.initial).length,
    ),
    customers = Math.max(s.engineering.maxCustomers, customerUnits(s));
  return STAGES.reduce(
    (stage, p, i) => (experience >= p.completed || customers >= p.customers ? i : stage),
    0,
  );
}
export function projectUnlockReason(s, p) {
  if (!p) return 'Unknown project';
  if (p.requiresWorkload === 'background' && productEffects(s).background === 0)
    return 'Needs a shipped background-processing workload';
  if (p.requiresWorkload === 'reads' && productEffects(s).reads === 0)
    return 'Needs a shipped read workload';
  if (has(s, p.id) || s.engineering.unlocked.includes(p.id)) return null;
  const stage = p.stage ?? 0;
  if (engineeringStage(s) < stage)
    return `Unlocks at ${STAGES[stage].name}: ${STAGES[stage].completed} completed projects or ${STAGES[stage].customers} teams / ${STAGES[stage].customers * 8} individuals`;
  const required = (p.requires || []).filter((id) => !has(s, id));
  return required.length
    ? 'Unlocks after ' + [...new Set(required)].map((id) => project(id).name).join(', ')
    : null;
}
export const unlockedProjects = (s) =>
  availableProjects(s).filter((p) => !p.product && !p.research && !projectUnlockReason(s, p));
function refreshRoadmap(s) {
  if (!s.direction) return;
  s.engineering.maxCustomers = Math.max(s.engineering.maxCustomers, customerUnits(s));
  const newly = unlockedProjects(s).filter((p) => !s.engineering.unlocked.includes(p.id));
  if (newly.length) {
    s.engineering.unlocked.push(...newly.map((p) => p.id));
    log(
      s,
      'Engineering work unlocked',
      newly
        .slice(0, 5)
        .map((p) => p.name)
        .join(', ') + (newly.length > 5 ? ` and ${newly.length - 5} more` : ''),
    );
  }
}
export function projectDebt(s, id) {
  const p = project(id);
  if (!p) return 0;
  if (p.research) return 0;
  const base = {
    Product: 6,
    Infrastructure: 8,
    Security: 3,
    Observability: 2,
    Delivery: 4,
    Performance: 5,
    Maintenance: 1,
  }[p.category];
  return (p.debt ?? base) + (p.repeat && p.category === 'Product' ? Math.min(12, level(s, id)) : 0);
}
export function engineeringMaintenance(s) {
  const { features, refinements } = productEffects(s);
  return {
    features,
    refinements,
    effort:
      1 + features.reduce((sum, id) => sum + (project(id).effort ?? 0.2), 0) + refinements * 0.04,
    monthly: features.reduce((sum, id) => sum + (project(id).upkeep ?? 35), 0) + refinements * 6,
  };
}
export const customerTarget = (s) => CUSTOMER_TARGETS.find((t) => t.id === s.customerTarget);
export const customerUnits = (s) =>
  CUSTOMER_SEGMENTS.reduce((n, segment) => n + s[segment.count] * segment.dataWeight, 0);
export function chooseCustomerTarget(s, id) {
  if (isClosed(s)) return 'Company closed';
  if (!CUSTOMER_TARGETS.some((t) => t.id === id)) return 'Choose a customer audience';
  s.customerTarget = id;
  log(s, 'Customer audience changed', customerTarget(s).name);
  return null;
}
export const businessFocus = (s) =>
  BUSINESS_FOCUSES.find((f) => f.id === s.businessFocus) || BUSINESS_FOCUSES[0];
export function chooseBusinessFocus(s, id) {
  if (isClosed(s)) return 'Company closed';
  const focus = BUSINESS_FOCUSES.find((f) => f.id === id);
  if (!focus) return 'Unknown business focus';
  if (s.businessFocus === id) return null;
  s.businessFocus = id;
  log(s, 'Business focus changed', focus.name);
  return null;
}

const neutralDirection = {
  acquisition: 1,
  churn: 1,
  value: 1,
  trendDecay: 1,
  development: 1,
  workload: 1,
  spread: false,
};
export const productDirection = (s) =>
  PRODUCT_DIRECTIONS.find((d) => d.id === s.direction) || neutralDirection;
export const founder = (s) => FOUNDERS.find((f) => f.id === s.founder);
export function foundCompany(
  s,
  { founder: founderId, capital, direction, customerTarget: target = 'small' },
) {
  if (s.direction || s.time || s.upgrades.some((id) => !project(id)?.initial) || s.work.length)
    return 'Company already started';
  if (!FOUNDERS.some((f) => f.id === founderId)) return 'Choose a founder';
  if (!Number.isFinite(capital) || capital < 5000 || capital > 500000 || capital % 500)
    return 'Personal capital must be $5,000–$500,000 in $500 steps';
  if (!PRODUCT_DIRECTIONS.some((d) => d.id === direction)) return 'Choose a product direction';
  if (!CUSTOMER_TARGETS.some((t) => t.id === target)) return 'Choose a customer audience';
  s.customerTarget = target;
  s.founder = founderId;
  s.cash = capital;
  s.funding.founderCapital = capital;
  s.paused = false;
  chooseDirection(s, direction);
  log(
    s,
    'Company founded',
    `${founder(s).name} · $${capital.toLocaleString('en-US')} personal capital · founder owns 100%.`,
  );
  return null;
}
export function chooseDirection(s, id) {
  if (isClosed(s)) return 'Company closed';
  const direction = PRODUCT_DIRECTIONS.find((d) => d.id === id);
  if (!direction) return 'Unknown product direction';
  if (s.direction) return 'Product direction already selected';
  s.direction = id;
  if (id === 'trend') s.trend = clamp(s.trend + 15);
  productSignals(s);
  log(s, 'Product direction selected', direction.name);
  refreshRoadmap(s);
  return null;
}
export const agentPlan = (s) => AGENT_PLANS.find((p) => p.id === s.agentPlan);
export const activeProjects = (s) =>
  s.response || s.solvency.emergency || isClosed(s)
    ? []
    : s.work.filter((w) => !w.suspended).slice(0, agentPlan(s).slots);
export const agentRate = (s, count = Math.max(1, activeProjects(s).length)) =>
  agentPlan(s).speed / (1 + 0.15 * (count - 1)) / debtSummary(s).slowdown;
const workRate = (s, p, count = Math.max(1, activeProjects(s).length)) =>
  p.research ? agentPlan(s).speed / (1 + 0.15 * (count - 1)) : agentRate(s, count);
export const workRemaining = (s, w) =>
  Math.ceil((w.duration - w.progress) / workRate(s, project(w.id)));
export function setAgentPlan(s, id) {
  if (isClosed(s)) return 'Company closed';
  const plan = AGENT_PLANS.find((p) => p.id === id);
  if (!plan) return 'Unknown development budget';
  if (s.agentPlan === id) return null;
  s.agentPlan = id;
  log(
    s,
    'Development budget changed',
    `${plan.name}: ${plan.slots} project slots, up to $${plan.rate * plan.slots}/month development spend. Extra projects pause when reducing slots.`,
  );
  return null;
}
export function projectQuote(s, id) {
  const p = project(id);
  if (!p) return null;
  if (p.research) {
    const effort = Math.ceil(p.duration / founder(s).development),
      rate = workRate(
        s,
        p,
        Math.min(agentPlan(s).slots, s.work.filter((w) => !w.suspended).length + 1),
      );
    return {
      duration: Math.ceil(effort / rate),
      effort,
      rate,
      complexity: 1,
      direction: 1,
      automation: 1,
      maintenance: 1,
      repetition: 1,
      debt: 0,
    };
  }
  const complexity = architecture(s).complexity;
  const automation = (has(s, 'pipeline') ? 0.85 : 1) / (1 + roadmapEffects(s).delivery);
  const direction =
    p.category === 'Product' ? productDirection(s).development * (has(s, 'modules') ? 0.85 : 1) : 1;
  const maintenance = engineeringMaintenance(s).effort;
  const repetition = p.repeat && !['debt', 'wear'].includes(p.effect) ? 1 + level(s, id) * 0.12 : 1;
  const scope = p.product ? productParameters(s, p.refinementOf || id).scope : 1;
  const effort = Math.ceil(
    (p.duration * scope * complexity * direction * automation * maintenance * repetition) /
      founder(s).development,
  );
  const rate = agentRate(
    s,
    Math.min(agentPlan(s).slots, s.work.filter((w) => !w.suspended).length + 1),
  );
  return {
    duration: Math.ceil(effort / rate),
    effort,
    rate,
    complexity,
    direction,
    automation,
    maintenance,
    repetition,
    debt: projectDebt(s, id),
  };
}

function random(s) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function log(s, title, detail, tone = 'info') {
  s.events.unshift({ id: s.nextEvent++, time: s.time, title, detail, tone });
  s.events = s.events.slice(0, 60);
}
export function setMarketingBudget(s, budget) {
  if (isClosed(s)) return 'Company closed';
  if (!Number.isFinite(budget) || budget < 0 || budget > 10000 || budget % 100)
    return 'Marketing budget must be $0–$10,000 in $100 steps';
  if (s.marketing.budget === budget) return null;
  s.marketing.budget = budget;
  if (!budget) s.marketing.lastPaid = 0;
  log(
    s,
    budget ? 'Marketing budget changed' : 'Marketing stopped',
    `$${budget}/month. Spending changes on the next tick; existing customers remain.`,
  );
  return null;
}
export function marketingForecast(s, budget = s.marketing.budget) {
  const active = Boolean(s.direction) && !s.solvency.emergency && !isClosed(s),
    target = customerTarget(s),
    effects = productEffects(s);
  const segments = Object.fromEntries(
    CUSTOMER_SEGMENTS.map((segment) => {
      const offer = customerValue(s, segment.id),
        acquisition =
          segment.id === 'individual' ? effects.individualAcquisition : effects.acquisition;
      const potential = active
        ? 40 *
          Math.sqrt(Math.max(0, budget) / 500) *
          target[segment.id] *
          segment.reach *
          productDirection(s).acquisition *
          founder(s).acquisition *
          businessFocus(s).acquisition *
          (1 + roadmapEffects(s).acquisition + acquisition * 6)
        : 0;
      const conversion = offer.interested
        ? Math.min(0.4, 0.18 * (offer.score / 100) * (s.trust / 100) * (s.reliability / 100))
        : 0;
      return [segment.id, { potential, conversion, signups: potential * conversion }];
    }),
  );
  const potential = Object.values(segments).reduce((n, row) => n + row.potential, 0),
    signups = Object.values(segments).reduce((n, row) => n + row.signups, 0);
  return {
    potential,
    conversion: potential ? signups / potential : 0,
    signups,
    segments,
    retained: [...s.cohorts, ...s.individualCohorts]
      .filter((c) => c.source === 'paid')
      .reduce((n, c) => n + c.count, 0),
    cac: s.marketing.acquired ? s.marketing.spent / s.marketing.acquired : null,
  };
}
export function costBreakdown(s) {
  const graph = architecture(s),
    services = Number(has(s, 'search_service')) + Number(has(s, 'report_service'));
  const functions = s.architecturePath === 'functions',
    dedicated = functions || has(s, 'database'),
    focus = businessFocus(s);
  const instances = has(s, 'replicas') ? 2 : 1,
    size = has(s, 'host') || has(s, 'service_scale') ? 2 : 1;
  const usage = system(s),
    executions =
      usage.served +
      Object.values(usage.background).reduce(
        (n, w) => n + Math.min(w.capacity, w.incoming + w.backlog),
        0,
      );
  const traffic = Math.max(0.25, system(s).demand / 36);
  const data =
    1 + Math.max(0, customerUnits(s) - 24) / 100 + (s.contract.status === 'active' ? 0.5 : 0);
  const routing =
    (has(s, 'database') ? 1.25 : 1) *
    (has(s, 'replicas') ? 1.2 : 1) *
    (has(s, 'optimize') ? 0.85 : 1);
  const resources = graph.resources - (dedicated ? 0 : 1);
  const coverage = 1 + (resources - 1) * 0.25;
  const endpoints = has(s, 'endpoints') ? 1.5 : 1,
    components = has(s, 'components') ? 1.5 : 1;
  const recovery = has(s, 'backup') ? 1.35 : 1;
  const automation =
    (has(s, 'tests') ? 1.5 : 1) * (has(s, 'pipeline') ? 1.5 : 1) * (has(s, 'contracts') ? 1.5 : 1);
  const plan = agentPlan(s),
    active = activeProjects(s).length,
    operations = s.release || s.response ? 90 * graph.complexity : 0;
  const f = (n) => n.toFixed(2).replace(/\.00$/, '');
  const rows = [
    {
      id: 'applications',
      name: 'Application servers',
      amount: functions ? 0 : (80 * instances + 75 * services) * size,
      reason: functions
        ? 'Request and event functions billed by execution'
        : `($80 × ${instances} core instances + $75 × ${services} specialized services) × ${size} server size${dedicated ? '' : ' · includes shared database'}`,
    },
    {
      id: 'functions',
      name: 'Function executions & reservations',
      amount: functions ? executions * 0.55 + (has(s, 'warm') ? 40 * 2 ** s.functionTier : 0) : 0,
      reason: functions
        ? `$0.55 monthly rate × ${f(executions)} executions/sec${has(s, 'warm') ? ` + $40 warm pool × ${2 ** s.functionTier} concurrency tier` : ''}`
        : 'No functions deployed',
    },
    {
      id: 'databases',
      name: 'Databases & recovery',
      amount:
        (dedicated
          ? (functions ? 65 : 90) * data * recovery * 2 ** s.databaseTier
          : has(s, 'backup')
            ? 18 * data
            : 0) +
        (has(s, 'search_service') ? 60 * data : 0) +
        (has(s, 'report_service') ? 65 * data : 0),
      reason:
        (dedicated
          ? `$${functions ? 65 : 90} primary ${functions ? 'managed store' : 'host'} × ${f(data)} data × ${recovery} recovery × ${2 ** s.databaseTier} capacity`
          : has(s, 'backup')
            ? `$18 backup storage × ${f(data)} data volume`
            : 'Primary database shares the app host') +
        (has(s, 'search_service') ? ` + $60 read store × ${f(data)} data` : '') +
        (has(s, 'report_service') ? ` + $65 results store × ${f(data)} data` : ''),
    },
    {
      id: 'network',
      name: 'Network & load balancing',
      amount:
        12 * traffic * routing * (1 + services * 0.25 + graph.brokers * 0.2) +
        (has(s, 'replicas') ? 20 : 0),
      reason: `$12 base × ${f(traffic)} traffic × ${f(routing)} routing / efficiency × ${f(1 + services * 0.25 + graph.brokers * 0.2)} service / event traffic${has(s, 'replicas') ? ' + $20 load balancer' : ''}`,
    },
    {
      id: 'cache',
      name: 'Cache memory',
      amount: has(s, 'cache') ? 22 * data : 0,
      reason: has(s, 'cache')
        ? `$22 memory allocation × ${f(data)} data volume`
        : 'No cache installed',
    },
    {
      id: 'monitoring',
      name: 'Monitoring',
      amount: has(s, 'monitoring') ? 18 * traffic * coverage * endpoints * components : 0,
      reason: has(s, 'monitoring')
        ? `$18 base × ${f(traffic)} traffic × ${f(coverage)} resource coverage × ${endpoints} endpoints × ${components} components`
        : 'No monitoring installed',
    },
    {
      id: 'audit',
      name: 'Audit log storage',
      amount: has(s, 'audit') ? 12 * traffic * data : 0,
      reason: has(s, 'audit')
        ? `$12 retention × ${f(traffic)} activity × ${f(data)} data volume`
        : 'No retained audit history',
    },
    {
      id: 'tools',
      name: 'Third-party tool contracts',
      amount: has(s, 'version') ? 12 * automation : 0,
      reason: has(s, 'version')
        ? `$12 collaboration plan × ${f(automation)} checks / automation / contracts`
        : 'No hosted tool contracts',
    },
    {
      id: 'founder',
      name: 'Founder living costs',
      amount: s.solvency.emergency ? 0 : 1800,
      reason: s.solvency.emergency
        ? 'Founder draw suspended during cash recovery'
        : '$1,800 founder draw · solo company, no employee payroll',
    },
    {
      id: 'administration',
      name: 'Company administration',
      amount: 300,
      reason: '$300/month accounting, billing, and basic business contracts',
    },
    {
      id: 'tokens',
      name: 'Agent tokens',
      amount:
        15 * graph.complexity + engineeringMaintenance(s).monthly + active * plan.rate + operations,
      reason: `$15 system upkeep × ${f(graph.complexity)} complexity + $${engineeringMaintenance(s).monthly} feature maintenance + ${active} active projects × $${plan.rate} ${plan.name} rate${operations ? ` + $90 release / response × ${f(graph.complexity)} complexity` : ''} · development capped at $${plan.slots * plan.rate}/month; idle slots are free`,
    },
    {
      id: 'support',
      name: 'Customer support',
      amount:
        (CUSTOMER_SEGMENTS.reduce((n, segment) => n + s[segment.count] * segment.support, 0) +
          (s.contract.status === 'active' ? 250 : 0)) *
        focus.support,
      reason: `($1.50 × ${f(s.customers)} teams + $0.18 × ${f(s.individualCustomers)} individuals${s.contract.status === 'active' ? ' + $250 larger-account coverage' : ''}) × ${focus.support} support focus`,
    },
    {
      id: 'marketing',
      name: 'Marketing campaigns',
      amount: s.solvency.emergency ? 0 : s.marketing.budget,
      reason: s.solvency.emergency
        ? 'Campaign paused during cash recovery'
        : s.marketing.budget
          ? `$${s.marketing.budget} monthly budget · paid continuously while active`
          : 'No paid acquisition campaign',
    },
    {
      id: 'queues',
      name: 'Queues',
      amount: 24 * graph.queues * traffic,
      reason: graph.queues
        ? `$24 × ${graph.queues} queues × ${f(traffic)} traffic`
        : 'No queues deployed',
    },
    {
      id: 'workers',
      name: 'Worker compute',
      amount: functions
        ? 0
        : (has(s, 'jobs') ? 45 * (1 + s.workerReplicas) : 0) + (has(s, 'notifications') ? 40 : 0),
      reason: functions
        ? 'Triggered consumers billed under function executions'
        : graph.consumers
          ? `${has(s, 'jobs') ? `$45 × ${1 + s.workerReplicas} processing consumers` : ''}${has(s, 'notifications') ? `${has(s, 'jobs') ? ' + ' : ''}$40 notification worker` : ''}${!has(s, 'jobs') && !has(s, 'notifications') ? 'Analytics consumer charged under analytics' : ''}`
          : 'No workers deployed',
    },
    {
      id: 'events',
      name: 'Event broker & topics',
      amount: graph.brokers ? 40 * traffic * (1 + graph.topics * 0.2) : 0,
      reason: graph.brokers
        ? `$40 broker × ${f(traffic)} traffic × ${f(1 + graph.topics * 0.2)} topic coverage (${graph.topics} topics)`
        : 'No event broker deployed',
    },
    {
      id: 'analytics',
      name: 'Product analytics',
      amount: has(s, 'analytics') ? (functions ? 45 : 80) * data : 0,
      reason: has(s, 'analytics')
        ? `$${functions ? 45 : 80} ${functions ? 'analytics store; execution billed separately' : 'consumer and analytics database'} × ${f(data)} data volume`
        : 'No analytics consumer or database',
    },
    {
      id: 'cdn',
      name: 'Content delivery',
      amount: 0,
      reason: 'No content delivery layer installed',
    },
  ];
  const effects = roadmapEffects(s),
    resourceIds = [
      'applications',
      'functions',
      'databases',
      'network',
      'cache',
      'queues',
      'workers',
      'events',
      'analytics',
    ];
  for (const row of rows) {
    if (resourceIds.includes(row.id)) {
      row.amount /= 1 + effects.efficiency;
      if (effects.efficiency) row.reason += ` ÷ ${f(1 + effects.efficiency)} allocation efficiency`;
    }
    if (row.id === 'applications' && has(s, 'blue_green')) {
      row.amount *= 2;
      row.reason += ' × 2 deployment environments';
    }
    if (row.id === 'network' && effects.network) {
      row.amount /= 1 + effects.network;
      row.reason += ` ÷ ${f(1 + effects.network)} payload efficiency`;
    }
    if (row.id === 'support' && effects.support) {
      row.amount /= 1 + effects.support;
      row.reason += ` ÷ ${f(1 + effects.support)} customer self-service`;
    }
    if (['monitoring', 'tools'].includes(row.id)) {
      const additions = EXTRA_PROJECTS.filter(
        (p) =>
          p.category === (row.id === 'monitoring' ? 'Observability' : 'Delivery') && has(s, p.id),
      ).length;
      row.amount *= 1 + additions * 0.15;
      if (additions) row.reason += ` × ${f(1 + additions * 0.15)} additional capabilities`;
    }
  }
  const base = rows
      .filter((r) => !['founder', 'administration', 'support', 'marketing'].includes(r.id))
      .reduce((n, r) => n + r.amount, 0),
    overhead = s.engineering.debt * 0.0015;
  rows.push({
    id: 'tech_debt',
    name: 'Technical debt overhead',
    amount: base * overhead,
    reason: `${f(s.engineering.debt)} debt points × 0.15% of $${f(base)} engineering and infrastructure bills`,
  });
  return rows;
}
export function economics(s) {
  const smallRevenue = s.cohorts.reduce((total, c) => total + c.count * c.price, 0);
  const individualRevenue = s.individualCohorts.reduce((total, c) => total + c.count * c.price, 0);
  const contractRevenue = s.contract.status === 'active' ? s.contract.price : 0;
  const revenue = smallRevenue + individualRevenue + contractRevenue,
    breakdown = costBreakdown(s);
  const costs = breakdown.reduce((total, row) => total + row.amount, 0);
  return {
    revenue,
    smallRevenue,
    individualRevenue,
    contractRevenue,
    costs,
    profit: revenue - costs,
    breakdown,
  };
}
// Quote a sustained development budget without starting projects or charging cash.
export function expansionBudget(s, planId = s.agentPlan) {
  const plan = AGENT_PLANS.find((p) => p.id === planId);
  if (!plan) return null;
  const estimate = {
    ...s,
    agentPlan: planId,
    work: Array.from({ length: plan.slots }, () => ({ id: 'monitoring' })),
    response: null,
    release: null,
    solvency: { ...s.solvency, emergency: false, closedAt: null },
  };
  const e = economics(estimate),
    burn = Math.max(0, -e.profit),
    offer = fundingOffer(s);
  return {
    plan,
    costs: e.costs,
    burn,
    runway: burn ? s.cash / burn : null,
    withInvestment: burn && offer ? (s.cash + offer.investment) / burn : null,
    investmentMonths: burn && offer ? offer.investment / burn : null,
  };
}
export function discoverViews(s) {
  if (!s.direction) return [];
  const conditions = {
    system: has(s, 'components') || architecture(s).nodes.length > 3,
    funding:
      businessFocus(s).id === 'growth' ||
      fundingOffer(s)?.eligible ||
      s.funding.rounds.length > 0 ||
      s.solvency.warningLevel > 0 ||
      s.solvency.emergency,
    security:
      has(s, 'review') ||
      s.totals.stolenRecords > 0 ||
      s.totals.lostRecords > 0 ||
      s.incidents.some((i) => i.type === 'security' && i.announced),
    enterprise:
      s.businessFocus === 'enterprise' ||
      (hasCapability(s, 'coordination') && s.customers >= 15) ||
      s.engineering.maxCustomers >= 60,
  };
  const added = Object.entries(conditions)
    .filter(([id, ready]) => ready && !s.revealedViews.includes(id))
    .map(([id]) => id);
  s.revealedViews.push(...added);
  if (added.length)
    log(
      s,
      'New company options',
      added
        .map(
          (id) =>
            ({
              system: 'System diagram',
              funding: 'Funding',
              security: 'Security assessment',
              enterprise: 'Enterprise customers',
            })[id],
        )
        .join(', '),
    );
  return added;
}
export const arrears = (s) => s.solvency.operatingDebt + s.solvency.penaltyDebt;
export function solvencySummary(s) {
  const e = economics(s),
    debt = arrears(s),
    age = s.solvency.unpaidSince === null ? 0 : s.time - s.solvency.unpaidSince;
  const runway = e.profit < 0 ? (s.cash / -e.profit) * 30 : null;
  return {
    debt,
    age,
    runway,
    stage: s.solvency.stage,
    emergency: s.solvency.emergency,
    closed: isClosed(s),
    restrictionIn: Math.max(0, CASH_GRACE - age),
    closureIn: Math.max(0, CASH_CLOSE - age),
    resumeCash: economics({ ...s, solvency: { ...s.solvency, emergency: false } }).costs / 30,
  };
}
function charge(s, amount, type) {
  const paid = Math.min(s.cash, amount);
  s.cash -= paid;
  s.finance[type === 'operating' ? 'operatingPaid' : 'penaltiesPaid'] += paid;
  s.solvency[type === 'operating' ? 'operatingDebt' : 'penaltyDebt'] += amount - paid;
}
function payArrears(s) {
  for (const [debt, paid] of [
    ['operatingDebt', 'operatingPaid'],
    ['penaltyDebt', 'penaltiesPaid'],
  ]) {
    const payment = Math.min(s.cash, s.solvency[debt]);
    s.cash -= payment;
    s.solvency[debt] -= payment;
    s.finance[paid] += payment;
  }
}
function updateSolvency(s) {
  const f = s.solvency,
    debt = arrears(s),
    previous = f.stage;
  if (debt > 1e-8) {
    if (f.unpaidSince === null) f.unpaidSince = s.time;
    if (!f.emergency) {
      f.emergency = true;
      log(
        s,
        'Emergency spending cuts',
        'Development agents, paid acquisition, and founder draws are paused. Drafts retain their progress.',
        'warning',
      );
    }
    const age = s.time - f.unpaidSince;
    f.stage =
      age >= CASH_CLOSE
        ? 'closed'
        : age >= CASH_SUSPEND
          ? 'suspended'
          : age >= CASH_GRACE
            ? 'restricted'
            : 'grace';
    if (f.stage !== previous) {
      const messages = {
        grace:
          'Bills are unpaid. Providers allow 3 days before limiting capacity; prolonged arrears close the company after 30 days.',
        restricted:
          'Unpaid bills passed the 3-day grace period. Request and background capacity are limited to 35%.',
        suspended: 'Bills have been unpaid for 14 days. Providers limit capacity to 10%.',
        closed: 'Bills remained unpaid for 30 days. The company has closed; start a new run.',
      };
      log(
        s,
        f.stage === 'closed'
          ? 'Company closed'
          : f.stage === 'grace'
            ? 'Unpaid bills'
            : 'Provider capacity restricted',
        messages[f.stage],
        f.stage === 'grace' ? 'warning' : 'danger',
      );
    }
    if (f.stage === 'closed') {
      f.closedAt = s.time;
      s.paused = true;
    }
  } else {
    f.unpaidSince = null;
    f.stage = 'healthy';
    if (previous !== 'healthy')
      log(
        s,
        'Bills settled',
        'Provider capacity is restored. Development remains paused until you resume it on Finance.',
        'good',
      );
  }
  const e = economics(s),
    runway = e.profit < 0 ? (s.cash / -e.profit) * 30 : Infinity;
  const level = debt > 1e-8 ? 2 : runway <= 7 ? 2 : runway <= 30 ? 1 : 0;
  if (level > f.warningLevel && debt <= 1e-8)
    log(
      s,
      'Runway warning',
      `About ${Math.max(0, Math.floor(runway))} days of cash at current revenue and spending. Reduce agent or infrastructure costs, review renewal prices, or seek eligible investment.`,
      level === 2 ? 'danger' : 'warning',
    );
  f.warningLevel = level;
}
export function resumeDevelopment(s) {
  if (isClosed(s)) return 'Company closed';
  if (arrears(s) > 1e-8) return 'Settle unpaid bills first';
  if (s.cash < solvencySummary(s).resumeCash)
    return 'Keep at least 1 day of operating costs in cash before resuming';
  if (!s.solvency.emergency) return null;
  s.solvency.emergency = false;
  log(
    s,
    'Development resumed',
    'Agent development, founder draw, and any paid acquisition resume at the selected budgets.',
  );
  return null;
}
export const COST_CUTS = [
  ['host', 'Smaller application host'],
  ['replicas', 'Remove application replica'],
  ['service_scale', 'Smaller service instances'],
  ['warm', 'Release warm reservations'],
  ['workers', 'Remove one report worker'],
  ['data_scale', 'Lower database capacity'],
  ['concurrency', 'Lower function concurrency'],
].map(([id, name]) => ({ id, name }));
const capacityFields = {
  workers: 'workerReplicas',
  data_scale: 'databaseTier',
  concurrency: 'functionTier',
};
function cutState(s, id) {
  const after = { ...s, upgrades: [...s.upgrades] };
  const field = capacityFields[id];
  if (field) {
    after[field]--;
    if (after[field] === 0) after.upgrades = after.upgrades.filter((upgrade) => upgrade !== id);
  } else after.upgrades = after.upgrades.filter((upgrade) => upgrade !== id);
  return after;
}
export const availableCostCuts = (s) =>
  COST_CUTS.filter((c) => has(s, c.id) && (!capacityFields[c.id] || s[capacityFields[c.id]] > 0));
export function costCutQuote(s, id) {
  if (!availableCostCuts(s).some((c) => c.id === id)) return null;
  return economics(s).costs - economics(cutState(s, id)).costs;
}
export function reduceCapacity(s, id) {
  if (isClosed(s)) return 'Company closed';
  if (s.work.some((w) => w.id === id) || s.ready.includes(id) || s.release?.id === id)
    return 'Finish the capacity change already in progress';
  if (costCutQuote(s, id) === null) return 'Capacity reduction unavailable';
  const after = cutState(s, id);
  s.upgrades = after.upgrades;
  s.workerReplicas = after.workerReplicas;
  s.databaseTier = after.databaseTier;
  s.functionTier = after.functionTier;
  s.metrics = null;
  log(
    s,
    'Operating capacity reduced',
    COST_CUTS.find((c) => c.id === id).name +
      '. Data is retained; lower capacity may reduce reliability.',
  );
  return null;
}
export function companyValuation(s) {
  if (isClosed(s)) return 0;
  const e = economics(s);
  // Provisional game estimate: cash plus recurring business value, adjusted for quality.
  const quality = (s.trust / 100 + s.reliability / 100) / 2;
  return Math.round(
    Math.max(
      0,
      s.cash + e.revenue * 12 * 2.5 * quality + Math.max(0, e.profit) * 12 * 2 - arrears(s),
    ),
  );
}
export function fundingSummary(s) {
  const e = economics(s),
    valuation = companyValuation(s);
  const ownership = s.funding.shareholders.find((holder) => holder.id === 'founder').ownership;
  return {
    valuation,
    ownership,
    founderStake: valuation * ownership,
    runway: e.profit < 0 ? Math.max(0, s.cash) / -e.profit : null,
  };
}
export function fundingOffer(s, id = FUNDING_ROUNDS[s.funding.rounds.length]?.id) {
  const index = FUNDING_ROUNDS.findIndex((round) => round.id === id),
    round = FUNDING_ROUNDS[index];
  if (!round) return null;
  const e = economics(s),
    funded = s.funding.rounds.find((record) => record.id === id);
  const checks = [
    ['Company still operating', !isClosed(s)],
    ['Previous rounds closed', index === s.funding.rounds.length],
    [
      `${round.customers}+ teams or ${round.customers * 8}+ individuals`,
      customerUnits(s) >= round.customers,
    ],
    [`$${round.revenue}+ monthly revenue`, e.revenue >= round.revenue],
    ['Shipped useful product capability', productEffects(s).features.length > 0],
    [`Trustworthiness ${round.trust}+`, s.trust >= round.trust],
    [`Reliability ${round.reliability}+`, s.reliability >= round.reliability],
    ['No active incidents or deployment', !s.incidents.length && !s.release],
  ];
  if (index >= 1) checks.push(['3 days of healthy, monitored service', s.evidence >= 36]);
  if (index >= 2) checks.push(['Current security certification', s.certifiedUntil > s.time]);
  if (index >= 3) checks.push(['Automated deployment', has(s, 'pipeline')]);
  const confidenceFactor = 0.6 + (0.4 * s.funding.confidence) / 100;
  const preMoney = Math.round(Math.max(round.minValuation, companyValuation(s)) * confidenceFactor);
  const postMoney = preMoney + round.investment,
    dilution = round.investment / postMoney;
  return {
    ...round,
    checks,
    funded,
    eligible: !funded && checks.every(([, ok]) => ok),
    preMoney,
    postMoney,
    dilution,
    founderOwnership: fundingSummary(s).ownership * (1 - dilution),
    targetRevenue: Math.ceil((Math.max(round.revenue, e.revenue) * round.targetFactor) / 50) * 50,
  };
}
export function raiseFunding(s, id) {
  if (isClosed(s)) return 'Company closed';
  const offer = fundingOffer(s, id);
  if (!offer) return 'Unknown funding round';
  if (offer.funded) return 'Round already closed';
  if (!offer.eligible) return 'Meet all funding requirements';
  for (const holder of s.funding.shareholders) holder.ownership *= 1 - offer.dilution;
  s.funding.shareholders.push({
    id: offer.id,
    name: offer.name + ' investors',
    ownership: offer.dilution,
  });
  s.cash += offer.investment;
  s.funding.raised += offer.investment;
  s.funding.rounds.push({
    id: offer.id,
    investment: offer.investment,
    preMoney: offer.preMoney,
    postMoney: offer.postMoney,
    dilution: offer.dilution,
    closedAt: s.time,
    targetRevenue: offer.targetRevenue,
    deadline: s.time + offer.targetDays * DAY,
    status: 'pending',
  });
  log(
    s,
    'Funding closed',
    `${offer.name}: $${offer.investment} raised for ${(offer.dilution * 100).toFixed(1)}% equity. Revenue target: $${offer.targetRevenue}/month within ${offer.targetDays} days.`,
    'good',
  );
  payArrears(s);
  updateSolvency(s);
  return null;
}
function updateInvestorTargets(s) {
  const revenue = economics(s).revenue;
  for (const record of s.funding.rounds) {
    if (record.status !== 'pending' || s.time < record.deadline) continue;
    const met = revenue >= record.targetRevenue;
    record.status = met ? 'met' : 'missed';
    s.funding.confidence = clamp(s.funding.confidence + (met ? 10 : -25));
    log(
      s,
      met ? 'Investor target met' : 'Investor target missed',
      `${FUNDING_ROUNDS.find((r) => r.id === record.id).name}: $${Math.round(revenue)}/month against $${record.targetRevenue}. Investor confidence ${s.funding.confidence}/100.`,
      met ? 'good' : 'warning',
    );
  }
}
export function projectCostChanges(s, id) {
  if (has(s, id) && !project(id)?.repeat) return [];
  const steady = { ...s, work: [], release: null, response: null };
  const before = economics(steady).breakdown,
    after = economics(projectedInstallation(steady, id)).breakdown;
  const labels = {
    applications: 'Application Costs',
    functions: 'Function Costs',
    databases: 'Database Costs',
    network: 'Network Costs',
    cache: 'Cache Costs',
    queues: 'Queue Costs',
    workers: 'Worker Costs',
    events: 'Event Costs',
    analytics: 'Analytics Costs',
    cdn: 'CDN Costs',
    monitoring: 'Monitoring Costs',
    tokens: 'Development Costs',
    tools: 'Tool Costs',
  };
  return after
    .map((row) => ({
      id: row.id,
      label: labels[row.id] || row.name + ' Costs',
      before: before.find((b) => b.id === row.id)?.amount || 0,
      change: row.amount - (before.find((b) => b.id === row.id)?.amount || 0),
    }))
    .filter((row) => Math.abs(row.change) >= 0.005);
}
export function projectOperatingImpact(s, id) {
  if (has(s, id) && !project(id)?.repeat) return 0;
  const steady = { ...s, work: [], release: null, response: null };
  const after = projectedInstallation(steady, id);
  return economics(after).costs - economics(steady).costs;
}
function projectedInstallation(s, id) {
  const after = {
    ...s,
    upgrades: has(s, id) ? s.upgrades : [...s.upgrades, id],
    workerReplicas: s.workerReplicas + (id === 'workers' ? 1 : 0),
    functionTier: s.functionTier + (id === 'concurrency' ? 1 : 0),
    databaseTier: s.databaseTier + (id === 'data_scale' ? 1 : 0),
    engineering: { ...s.engineering, levels: { ...s.engineering.levels } },
  };
  applyArchitecture(after, project(id));
  applyTaskUpkeep(after, id);
  if (project(id)?.repeat && !project(id).migration)
    after.engineering.levels[id] = level(s, id) + 1;
  return after;
}
export function productActionImpact(s, id) {
  const before = productEffects(s),
    afterState = projectedInstallation(s, id),
    after = productEffects(afterState);
  return {
    duration: projectQuote(s, id).duration,
    debt: projectQuote(s, id).debt,
    upkeep: engineeringMaintenance(afterState).monthly - engineeringMaintenance(s).monthly,
    effort: engineeringMaintenance(afterState).effort - engineeringMaintenance(s).effort,
    individualFairPrice:
      customerValue(afterState, 'individual').fairPrice - customerValue(s, 'individual').fairPrice,
    fairPrice: customerValue(afterState).fairPrice - customerValue(s).fairPrice,
    enterpriseFairPrice:
      customerValue(afterState, 'enterprise').fairPrice - customerValue(s, 'enterprise').fairPrice,
    reads: after.reads - before.reads,
    app: after.app - before.app,
    background: after.background - before.background,
    events: after.events - before.events,
  };
}
// Fixed-condition development forecast: no future incidents, cash changes, or deployment lag.
// Progress, concurrency, debt, and installed task effects are recalculated at each completion.
export function developmentForecast(s, extraId = null) {
  const copy = structuredClone(s),
    rows = {},
    pending = [...copy.work.map((w) => w.id), ...copy.workQueue];
  if (
    extraId &&
    !pending.includes(extraId) &&
    !copy.ready.includes(extraId) &&
    copy.release?.id !== extraId
  )
    copy.workQueue.push(extraId);
  for (const id of [...pending, ...(extraId ? [extraId] : [])])
    rows[id] = { start: null, finish: null, blocked: null };
  if (isClosed(s) || s.solvency.emergency || pendingIncident(s)) {
    for (const row of Object.values(rows))
      row.blocked = isClosed(s)
        ? 'Company closed'
        : s.solvency.emergency
          ? 'Cash recovery'
          : 'Incident decision required';
    return { rows, next: null };
  }
  let elapsed = copy.response ? Math.ceil(copy.response.remaining * debtSummary(copy).slowdown) : 0;
  copy.paused = false;
  copy.response = null;
  for (let step = 0; step < MAX_DRAFTS + QUEUE_LIMIT + 3; step++) {
    startQueuedProjects(copy);
    const active = activeProjects(copy);
    for (const w of active) if (rows[w.id] && rows[w.id].start === null) rows[w.id].start = elapsed;
    if (!active.length) break;
    const duration = Math.max(
      1,
      Math.ceil(
        Math.min(
          ...active.map(
            (w) => (w.duration - w.progress) / workRate(copy, project(w.id), active.length),
          ),
        ),
      ),
    );
    for (const w of active)
      w.progress = Math.min(
        w.duration,
        w.progress + duration * workRate(copy, project(w.id), active.length),
      );
    elapsed += duration;
    const done = active.filter((w) => w.progress >= w.duration);
    copy.work = copy.work.filter((w) => !done.includes(w));
    for (const w of done) {
      if (rows[w.id]) rows[w.id].finish = elapsed;
      const p = project(w.id);
      if (p.research) copy.product.analysed[p.problem] = true;
      else {
        applyTaskUpkeep(copy, w.id);
        install(copy, w.id);
      }
    }
  }
  for (const [id, row] of Object.entries(rows))
    if (row.finish === null)
      row.blocked = copy.work.find((w) => w.id === id)?.suspended
        ? 'Paused work'
        : projectBlock(copy, project(id), { ignoreQueue: true }) || 'Waiting behind blocked work';
  const finishes = Object.values(rows)
    .map((r) => r.finish)
    .filter((n) => n !== null);
  return { rows, next: finishes.length ? Math.min(...finishes) : null };
}
export function projectCapacityImpact(s, id) {
  if (!has(s, 'monitoring') || !has(s, 'components') || !project(id)) return null;
  const after = projectedInstallation(s, id);
  if (id === 'cache') after.cacheWarm = 1;
  return { before: system(s), after: system(after), warmCache: id === 'cache' };
}
export function system(s) {
  const provider =
    s.solvency.stage === 'suspended'
      ? 0.1
      : s.solvency.stage === 'restricted'
        ? 0.35
        : isClosed(s)
          ? 0
          : 1;
  const functions = s.architecturePath === 'functions',
    dedicated = functions || has(s, 'database'),
    serviceScale = has(s, 'service_scale') ? 1.75 : 1,
    functionScale = functions ? 2 ** s.functionTier : 1;
  const productLoad = productEffects(s);
  const demand =
    CUSTOMER_SEGMENTS.reduce(
      (n, segment) =>
        n +
        s[segment.count] *
          (segment.id === 'small' && productLoad.collaboration ? 1.9 : segment.traffic),
      0,
    ) + (s.contract.status === 'active' ? 55 : 0);
  const reportWork = has(s, 'jobs') ? 0 : productLoad.background;
  const effects = roadmapEffects(s);
  const appWork =
    ((1 + productLoad.app + reportWork) *
      (has(s, 'optimize') ? 0.75 : 1) *
      productDirection(s).workload) /
    (1 + effects.app);
  const reads =
    ((1 +
      (has(s, 'search_service') ? 0 : productLoad.reads) +
      (has(s, 'report_service') ? 0 : productLoad.background)) *
      (has(s, 'optimize') ? 0.72 : 1)) /
    (1 + effects.reads);
  const hitRate = has(s, 'cache') ? 0.62 * s.cacheWarm : 0;
  const dbWork = reads * (1 - hitRate * 0.8);
  const appCapacity = functions
    ? 80 * functionScale
    : 105 * (has(s, 'host') || has(s, 'service_scale') ? 1.75 : 1) * (has(s, 'replicas') ? 2 : 1);
  const dbCapacity = (dedicated ? 145 : 100) * 2 ** s.databaseTier;
  const sharedCapacity = dedicated ? Infinity : 165 * (has(s, 'host') ? 1.75 : 1);
  const defect = s.incidents.some((i) => i.type === 'release');
  const searchCapacity = has(s, 'search_service')
    ? Math.min(180 / 0.4, 180 / 0.65) * serviceScale
    : Infinity;
  const reportingCapacity = has(s, 'report_service') ? (95 / 0.2) * serviceScale : Infinity;
  const capacity =
    Math.min(
      appCapacity / appWork,
      dbCapacity / dbWork,
      sharedCapacity / (appWork + dbWork),
      searchCapacity,
      reportingCapacity,
    ) *
    (defect ? 0.58 : 1) *
    provider;
  const deploying = !!s.release && !has(s, 'blue_green');
  const served = Math.min(deploying ? demand * 0.25 : demand, capacity);
  const error = deploying
    ? 0.75
    : clamp((demand - served) / Math.max(1, demand) + (defect ? 0.045 : 0.002), 0, 0.95);
  const load = demand / Math.max(1, capacity);
  const coldStart = functions
    ? 300 * Math.max(0.1, 1 - demand / 60) * (has(s, 'warm') ? 0.1 : 1)
    : 0;
  const p95 = Math.min(
    9000,
    120 +
      85 * appWork +
      70 * dbWork +
      coldStart +
      (provider < 1 ? 400 : 0) +
      Math.max(0, load - 0.6) * 450 +
      s.queue * 8 +
      (defect ? 400 : 0) +
      (has(s, 'search_service') ? 25 : 0) +
      (has(s, 'report_service') ? 15 : 0),
  );
  const background = {
    reports: {
      incoming: has(s, 'jobs') ? served * productLoad.background * 0.52 : 0,
      capacity: has(s, 'jobs')
        ? 8 * (1 + s.workerReplicas) * (has(s, 'report_service') ? 1.5 : 1) * functionScale
        : 0,
      backlog: s.background.reports,
    },
    notifications: {
      incoming: has(s, 'notifications') ? served * productLoad.events : 0,
      capacity: has(s, 'notifications') ? 24 * functionScale : 0,
      backlog: s.background.notifications,
    },
    analytics: {
      incoming: has(s, 'analytics') ? served * 0.2 : 0,
      capacity: has(s, 'analytics') ? 35 * functionScale : 0,
      backlog: s.background.analytics,
    },
  };
  for (const workload of Object.values(background))
    workload.capacity *= provider * (1 + effects.background);
  const limits = [
    ['Application', appCapacity / appWork],
    ['Primary database', dbCapacity / dbWork],
    ['Shared host', sharedCapacity / (appWork + dbWork)],
    ['Read service', searchCapacity],
    ['Processing service', reportingCapacity],
  ];
  const bottleneck = limits.toSorted((a, b) => a[1] - b[1])[0][0];
  return {
    demand,
    served,
    capacity,
    bottleneck,
    error,
    p95,
    hitRate,
    appLoad: ((demand * appWork) / Math.max(1, appCapacity * provider)) * 100,
    dbLoad: ((demand * dbWork) / Math.max(1, dbCapacity * provider)) * 100,
    load,
    searchLoad: has(s, 'search_service')
      ? (demand / Math.max(1, searchCapacity * provider)) * 100
      : null,
    reportLoad: has(s, 'report_service')
      ? (demand / Math.max(1, reportingCapacity * provider)) * 100
      : null,
    coldStart,
    background,
  };
}
export function security(s) {
  const freshness = s.reviewAt === null ? 0 : clamp(1 - (s.time - s.reviewAt) / 900, 0, 1);
  const score = clamp(
    32 +
      (has(s, 'access') ? 30 : 0) +
      (has(s, 'audit') ? 14 : 0) +
      (has(s, 'backup') ? 18 : 0) -
      (productEffects(s).collaboration && !has(s, 'access') ? 14 : 0) +
      roadmapEffects(s).security,
  );
  return {
    score: s.reviewAt === null ? null : Math.round(score),
    confidence: freshness > 0.6 ? 'Reviewed' : freshness > 0 ? 'Review aging' : 'Unassessed',
  };
}
export function customerValue(s, segment = 'small', price = s.pricing[segment]) {
  const capabilities = productEffects(s);
  const definition = CUSTOMER_SEGMENTS.find((row) => row.id === segment);
  const featureValue = definition
    ? definition.baseValue +
      (segment === 'individual' ? capabilities.individualValue : capabilities.value) *
        definition.valueScale
    : 1800 +
      capabilities.enterpriseValue * 30 +
      ['access', 'audit', 'backup'].filter((id) => has(s, id)).length * 360;
  const freshness =
    1 - Math.min(0.2, Math.max(s.background.reports, s.background.notifications) / 5000);
  const fairPrice =
    featureValue *
    (0.5 + (0.5 * s.reliability) / 100) *
    (0.7 + (0.3 * s.trust) / 100) *
    productDirection(s).value *
    freshness *
    (segment === 'enterprise' && s.businessFocus === 'enterprise' ? 1.15 : 1);
  const score = clamp(65 + (fairPrice / Math.max(1, price) - 1) * 60);
  const minimum = definition?.minimum ?? 60;
  return { score, fairPrice, minimum, interested: score >= minimum };
}
export function publishPrices(s, small, enterprise, individual = s.pricing.individual) {
  if (isClosed(s)) return 'Company closed';
  if (
    !Number.isFinite(small) ||
    small < 5 ||
    small > 200 ||
    !Number.isFinite(enterprise) ||
    enterprise < 500 ||
    enterprise > 15000
  )
    return 'Use $5–$200 for small teams and $500–$15,000 for larger contracts.';
  if (!Number.isFinite(individual) || individual < 2 || individual > 60)
    return 'Use $2–$60 for individuals.';
  s.pricing = {
    individual: Math.round(individual),
    small: Math.round(small),
    enterprise: Math.round(enterprise),
  };
  log(
    s,
    'New prices published',
    `Individuals: $${s.pricing.individual}/month. Small teams: $${s.pricing.small}/month. Larger contracts: $${s.pricing.enterprise}/month. Existing rates stay locked until renewal.`,
  );
  return null;
}
export function indicators(s) {
  const sec = security(s);
  return {
    trendiness: s.trend,
    trustworthiness: s.trust,
    value: CUSTOMER_SEGMENTS.reduce(
      (n, segment) => n + customerTarget(s)[segment.id] * customerValue(s, segment.id).score,
      0,
    ),
    reliability: s.reliability,
    security: sec.score,
  };
}
export function visibleMetrics(s) {
  if (!has(s, 'monitoring')) return null;
  const m = system(s);
  return {
    demand: m.demand,
    p95: m.p95,
    error: m.error,
    capacity: has(s, 'components') ? m.capacity : null,
    bottleneck: has(s, 'components') ? m.bottleneck : null,
    appLoad: has(s, 'components') ? m.appLoad : null,
    dbLoad: has(s, 'components') ? m.dbLoad : null,
    queue: has(s, 'components') ? s.queue : null,
    hitRate: has(s, 'components') ? m.hitRate : null,
    searchLoad: has(s, 'components') ? m.searchLoad : null,
    reportLoad: has(s, 'components') ? m.reportLoad : null,
    coldStart: has(s, 'components') ? m.coldStart : null,
    background: has(s, 'components') ? m.background : null,
  };
}
export function requirements(
  s,
  price = s.contract.status === 'active'
    ? s.contract.price
    : s.contract.status === 'negotiating'
      ? s.contract.quotedPrice
      : s.pricing.enterprise,
) {
  return [
    ...PRODUCT_PROBLEMS.filter((p) => p.core).map((p) => [p.capability, hasCapability(s, p.id)]),
    ['Stronger access controls', has(s, 'access')],
    ['Audit history', has(s, 'audit')],
    ['Tested recovery', has(s, 'backup')],
    ['Current Secure Operations seal', s.certifiedUntil > s.time],
    ['3 days of monitored, healthy service', s.evidence >= 36],
    ['Trustworthiness of 65+', s.trust >= 65],
    [
      'Value for money of 60+ at the offered price',
      customerValue(s, 'enterprise', price).interested,
    ],
  ];
}
export function projectBlock(s, p, { ignoreCapacity = false, ignoreQueue = false } = {}) {
  if (isClosed(s)) return 'Company closed';
  if (s.solvency.emergency) return 'Development paused for cash recovery';
  if (!p) return 'Unknown project';
  if (!s.direction) return 'Complete company setup';
  if (p.product || p.research) {
    const block = productOpportunityBlock(s, p);
    if (block) return block;
  }
  if (p.research && s.product.analysed[p.problem]) return 'Requirements already analysed';
  if (p.research && s.product.selected[p.problem] && !ignoreQueue)
    return 'An approach is already committed for this need';
  if (
    p.product &&
    !p.refinementOf &&
    s.product.selected[p.problem] &&
    s.product.selected[p.problem] !== p.id
  )
    return 'Another approach is selected for this problem';
  if (!projectAvailable(s, p)) return 'Unavailable for this architecture';
  const conflict = architectureConflict(s, p);
  if (conflict) return conflict;
  if (has(s, p.id) && !p.repeat) return 'Completed';
  const missing = (p.requires || []).filter((id) => !has(s, id));
  if (missing.length) return 'Needs ' + missing.map((id) => project(id).name).join(', ');
  if (p.id === 'certification' && s.evidence < 36)
    return 'Needs 3 days of healthy, monitored service';
  if (s.work.some((w) => w.id === p.id) || s.ready.includes(p.id) || s.release?.id === p.id)
    return 'Project already in progress';

  if (!ignoreCapacity && s.work.filter((w) => !w.suspended).length >= agentPlan(s).slots)
    return 'Agent project slots occupied';
  if (!ignoreCapacity && s.work.length >= MAX_DRAFTS) return 'Six retained drafts already exist';
  if (p.id === 'workers' && s.workerReplicas >= 7)
    return 'Eight processing consumers already deployed';
  if (p.id === 'concurrency' && s.functionTier >= 4) return 'Maximum function concurrency reached';
  if (p.id === 'data_scale' && s.architecturePath !== 'functions' && !has(s, 'database'))
    return 'Needs a dedicated database host';
  if (p.id === 'data_scale' && s.databaseTier >= 3) return 'Maximum database capacity reached';
  if (!ignoreQueue && s.workQueue.includes(p.id)) return 'Project already queued';
  const locked = projectUnlockReason(s, p);
  if (locked) return locked;
  if (p.effect === 'debt' && s.engineering.debt <= 1) return 'No technical debt to repay';
  if (p.effect === 'wear' && s.engineering.wear < 1)
    return 'Operating condition is already healthy';
  return null;
}
export function startProject(s, id) {
  const p = project(id),
    block = projectBlock(s, p);
  if (block) return block;
  return beginProject(s, p);
}
function beginProject(s, p) {
  const id = p.id,
    quote = projectQuote(s, id);
  s.work.push({ id, progress: 0, duration: quote.effort });
  if (p.product && !p.refinementOf) s.product.selected[p.problem] = id;
  log(s, 'Project started', p.name);
  return null;
}
export function queueBlock(s, id) {
  const block = projectBlock(s, project(id), { ignoreCapacity: true });
  return block || (s.workQueue.length >= QUEUE_LIMIT ? 'Development queue full' : null);
}
export function queueProject(s, id) {
  const block = queueBlock(s, id);
  if (block) return block;
  s.workQueue.push(id);
  const p = project(id);
  if (p.product && !p.refinementOf) s.product.selected[p.problem] = id;
  log(s, 'Work queued', p.name);
  return null;
}
export function removeQueuedProject(s, id) {
  if (isClosed(s)) return 'Company closed';
  if (!s.workQueue.includes(id)) return 'Project is not queued';
  s.workQueue = s.workQueue.filter((task) => task !== id);
  const p = project(id);
  if (p.product && !p.refinementOf) delete s.product.selected[p.problem];
  log(s, 'Queued work removed', p.name);
  return null;
}
export function moveQueuedProject(s, id, offset) {
  if (isClosed(s)) return 'Company closed';
  const index = s.workQueue.indexOf(id),
    next = index + offset;
  if (index < 0 || ![1, -1].includes(offset) || next < 0 || next >= s.workQueue.length)
    return 'Cannot move queued work';
  [s.workQueue[index], s.workQueue[next]] = [s.workQueue[next], s.workQueue[index]];
  return null;
}
export function startQueuedProjects(s) {
  if (s.paused || s.response || s.solvency.emergency || isClosed(s)) return;
  while (s.workQueue.length) {
    const id = s.workQueue[0],
      block = projectBlock(s, project(id), { ignoreQueue: true });
    if (block) return;
    s.workQueue.shift();
    beginProject(s, project(id));
  }
}
export function analyseProduct(s, problem) {
  if (!PRODUCT_PROBLEMS.some((p) => p.id === problem)) return 'Unknown product problem';
  return startProject(s, 'analyse_' + problem);
}
export function commitProduct(s, id) {
  if (!project(id)?.product) return 'Choose a product approach';
  return startProject(s, id);
}
export function abandonProject(s, id) {
  if (isClosed(s)) return 'Company closed';
  if (!s.work.some((w) => w.id === id)) return 'No unfinished project';
  s.work = s.work.filter((w) => w.id !== id);
  const p = project(id);
  if (p.product && !p.refinementOf) delete s.product.selected[p.problem];
  log(
    s,
    'Project abandoned',
    `${project(id).name}: progress discarded. Previously spent agent tokens are not refunded.`,
  );
  return null;
}
function applyTaskUpkeep(s, id) {
  const p = project(id);
  s.engineering.debt += projectDebt(s, id);
  if (p?.effect === 'debt') s.engineering.debt = Math.max(0, s.engineering.debt - p.strength);
  if (p?.effect === 'wear') s.engineering.wear = Math.max(0, s.engineering.wear - p.strength);
}
function install(s, id) {
  const p = project(id);
  applyArchitecture(s, p);
  if (!p.migration && !has(s, id)) s.upgrades.push(id);
  if (p.repeat && !p.migration) s.engineering.levels[id] = level(s, id) + 1;
  if (p.product) {
    const a = p.refinementOf || id;
    s.trend = clamp(s.trend + (8 * productParameters(s, a).smallFit) / (1 + level(s, id) * 0.15));
    if (!p.refinementOf) s.product.shippedAt[id] = s.time;
  }
  if (id === 'review') s.reviewAt = s.time;
  if (id === 'certification') s.certifiedUntil = s.time + DAY * 60;
  if (id === 'workers') s.workerReplicas++;
  if (id === 'concurrency') s.functionTier++;
  if (id === 'data_scale') s.databaseTier++;
  refreshRoadmap(s);
  log(s, 'Project completed', project(id).name + ' is now in use.', 'good');
}
export function deploymentRisk(s) {
  const base = has(s, 'pipeline') ? 0.035 : has(s, 'tests') ? 0.08 : 0.25;
  return clamp(
    (base *
      (1 + s.engineering.debt * 0.01) *
      Math.max(1, architecture(s).complexity) *
      (has(s, 'contracts') ? 0.5 : 1)) /
      (1 + roadmapEffects(s).release),
    0.005,
    0.8,
  );
}
export function deploy(s, id = s.ready[0]) {
  if (isClosed(s)) return 'Company closed';
  if (!s.ready.includes(id) || s.release) return 'No release ready';
  const missing = (project(id).requires || []).filter((required) => !has(s, required));
  if (missing.length)
    return 'Needs ' + missing.map((required) => project(required).name).join(', ');
  const duration =
    ((has(s, 'pipeline') ? 2 : has(s, 'tests') ? 6 : 4) + (has(s, 'contracts') ? 2 : 0)) *
    Math.max(1, architecture(s).complexity);
  s.release = {
    id,
    remaining: duration,
    duration,
    risk: deploymentRisk(s),
    wasInstalled: has(s, id),
    previousTrend: s.trend,
    previousLevel: level(s, id),
    ...(project(id).migration || project(id).extractService
      ? {
          previousArchitecture: {
            path: s.architecturePath,
            functionTier: s.functionTier,
            workerReplicas: s.workerReplicas,
            retired: project(id).migration ? retiredProjects(s, project(id).migration) : [],
            levels: { ...s.engineering.levels },
          },
        }
      : {}),
  };
  s.ready = s.ready.filter((ready) => ready !== id);
  log(
    s,
    'Deployment started',
    project(id).name +
      ' · ' +
      Math.round(s.release.risk * 100) +
      '% defect risk · ' +
      (has(s, 'blue_green')
        ? 'current environment serves traffic.'
        : 'service briefly interrupted.'),
    'warning',
  );
  return null;
}
export function triggerIncident(s, type) {
  if (isClosed(s)) return;
  if (s.incidents.some((i) => i.type === type)) return;
  const delay = type === 'security' ? (has(s, 'audit') ? 1 : 8) : has(s, 'monitoring') ? 2 : 9;
  const incident = {
    id: s.nextEvent++,
    type,
    started: s.time,
    detectAt: s.time + delay,
    announced: false,
    communicated: false,
    ...(type === 'release' ? { releaseId: s.lastRelease?.id || null } : {}),
  };
  if (type === 'security') {
    incident.outcome = random(s) < 0.5 ? 'theft' : 'loss';
    incident.records = Math.round(s.customers * 8 + s.individualCustomers);
    incident.fine = has(s, 'access') ? 120 : 380;
    s.lastSecurity = s.time;
  }
  s.incidents.push(incident);
}
export function incidentText(s, i) {
  if (i.type === 'security')
    return i.outcome === 'theft'
      ? 'A customer reported unauthorized access. Account data has been exposed.'
      : 'Customers report missing records. Investigate access and recover available data.';
  if (has(s, 'components'))
    return 'The latest release reduced request capacity and increased errors.';
  if (has(s, 'monitoring')) return 'Response times and errors rose after the latest deployment.';
  return 'Customers say the app is slow and sometimes fails to load.';
}
export function communicate(s, id) {
  if (isClosed(s)) return 'Company closed';
  const i = s.incidents.find((i) => i.id === id && i.announced);
  if (!i || i.communicated) return;
  i.communicated = true;
  log(
    s,
    'Customers updated',
    'You acknowledged the incident and committed to a follow-up.',
    'good',
  );
}
export function pendingIncident(s) {
  return s.incidents.find((i) => i.announced && i.awaitingDecision);
}
export function deferIncident(s, id) {
  if (isClosed(s)) return 'Company closed';
  const i = s.incidents.find((i) => i.id === id && i.announced);
  if (!i) return 'Incident unavailable';
  i.awaitingDecision = false;
  s.paused = !!pendingIncident(s);
  log(
    s,
    'Incident response deferred',
    'Development continues; service impact and trust loss remain.',
    'warning',
  );
  return null;
}
export function responseDuration(s, type) {
  return (type === 'security' ? 16 : 12) / (1 + roadmapEffects(s).response);
}
export function respond(s, id) {
  if (isClosed(s)) return 'Company closed';
  const i = s.incidents.find((i) => i.id === id && i.announced);
  if (!i) return 'Incident unavailable';
  if (s.response) return 'Response already in progress';
  s.response = { id, remaining: responseDuration(s, i.type) };
  if (i.awaitingDecision) {
    i.awaitingDecision = false;
    s.paused = !!pendingIncident(s);
  }
  log(
    s,
    'Response in progress',
    'Development is paused while agents ' +
      (i.type === 'security'
        ? 'contain access and recover available data.'
        : 'repair the release.'),
  );
  return null;
}
export function rollback(s) {
  if (isClosed(s)) return 'Company closed';
  if (!has(s, 'version') || !s.lastRelease || s.release) return 'Rollback unavailable';
  const resume = s.incidents.some((i) => i.type === 'release' && i.awaitingDecision);
  const previous = s.lastRelease,
    id = previous.id;
  if (previous.previousArchitecture) {
    const old = previous.previousArchitecture,
      target = old.path || 'monolith';
    if (
      pendingProjects(s).some((task) => {
        const p = project(task);
        return p.migration || p.extractService || (p.paths && !p.paths.includes(target));
      })
    )
      return 'Finish or remove architecture-specific work before rollback';
    const removed = retiredProjects(s, target);
    s.upgrades = [
      ...new Set([...s.upgrades.filter((task) => !removed.includes(task)), ...old.retired]),
    ];
    s.architecturePath = old.path;
    s.functionTier = old.functionTier;
    s.workerReplicas = old.workerReplicas;
    for (const task of removed) delete s.engineering.levels[task];
    for (const task of old.retired)
      if (old.levels[task] !== undefined) s.engineering.levels[task] = old.levels[task];
  }
  if (!previous.wasInstalled) s.upgrades = s.upgrades.filter((x) => x !== id);
  if (project(id).product && !project(id).refinementOf && !previous.wasInstalled) {
    delete s.product.selected[project(id).problem];
    delete s.product.shippedAt[id];
  }
  if (!previous.wasInstalled && ['notifications', 'analytics'].includes(id)) s.background[id] = 0;
  s.trend = Math.min(s.trend, previous.previousTrend);
  if (project(id).repeat && !project(id).migration)
    s.engineering.levels[id] = previous.previousLevel;
  s.incidents = s.incidents.filter((i) => i.type !== 'release');
  if (s.response && !s.incidents.some((i) => i.id === s.response.id)) s.response = null;
  s.lastRelease = null;
  s.cacheWarm = 0;
  if (resume) s.paused = !!pendingIncident(s);
  log(
    s,
    'Previous version restored',
    project(id).name + ' withdrawn. Existing trust damage remains.',
    'good',
  );
  return null;
}
export function pursue(s) {
  if (isClosed(s)) return 'Company closed';
  if (s.contract.status !== 'prospect') return 'Already pursuing this opportunity';
  if (requirements(s).some(([, met]) => !met))
    return 'Meet every requirement before starting procurement';
  s.contract.status = 'negotiating';
  s.contract.progress = 0;
  s.contract.quotedPrice = s.pricing.enterprise;
  log(s, 'Procurement started', 'Northstar Studio is evaluating a 90-day contract.');
  return null;
}
export function tick(s) {
  if (!s.direction || s.paused || pendingIncident(s) || isClosed(s)) return s;
  startQueuedProjects(s);
  s.time++;
  let eco = economics(s);
  if (!s.solvency.emergency && s.cash + eco.revenue / MONTH < eco.costs / MONTH) {
    s.solvency.emergency = true;
    log(
      s,
      'Emergency spending cuts',
      'Cash cannot cover current spending. Development, founder draw, and paid acquisition pause; essential operations continue.',
      'warning',
    );
    eco = economics(s);
  }
  s.cash += eco.revenue / MONTH;
  s.finance.earned += eco.revenue / MONTH;
  s.finance.operatingSpend += eco.costs / MONTH;
  charge(s, eco.costs / MONTH, 'operating');
  payArrears(s);
  updateSolvency(s);
  s.marketing.spent += eco.breakdown.find((row) => row.id === 'marketing').amount / MONTH;
  if (isClosed(s)) return s;
  if (has(s, 'cache')) s.cacheWarm = Math.min(1, s.cacheWarm + 0.035);
  const m = system(s);
  s.queue = clamp(s.queue + (m.demand - m.capacity) * 0.3, 0, 500);
  s.metrics = m;
  for (const [name, workload] of Object.entries(m.background))
    s.background[name] = clamp(
      s.background[name] + workload.incoming - workload.capacity,
      0,
      10000,
    );
  const effects = roadmapEffects(s);
  s.engineering.wear = clamp(
    s.engineering.wear +
      (0.003 + engineeringMaintenance(s).features.length * 0.002) / (1 + effects.maintenance),
    0,
    100,
  );
  if (s.engineering.wear >= 30 && !s.engineering.maintenanceNotified) {
    s.engineering.maintenanceNotified = true;
    log(
      s,
      'Routine maintenance overdue',
      'Operating condition has fallen below 70%. Repeated defects and aging dependencies are reducing reliability. Maintenance work can restore condition.',
      'warning',
    );
  } else if (s.engineering.wear < 15 && s.engineering.maintenanceNotified) {
    s.engineering.maintenanceNotified = false;
    log(
      s,
      'Operating condition restored',
      'Routine maintenance has restored operating condition above 85%.',
      'good',
    );
  }
  const quality = clamp(
    100 - m.error * 100 - Math.max(0, m.p95 - 500) * 0.012 - s.engineering.wear * 0.12,
    0,
    100,
  );
  s.reliability += (quality - s.reliability) * 0.04;
  const direction = productDirection(s),
    focus = businessFocus(s);
  s.trend = clamp(s.trend - 0.022 * direction.trendDecay);
  s.trust = clamp(s.trust + (s.reliability > 92 ? 0.012 : -0.018));
  const capabilityEffects = productEffects(s),
    target = customerTarget(s),
    paidForecast = marketingForecast(s);
  s.marketing.lastPaid = paidForecast.signups / MONTH;
  s.marketing.acquired += s.marketing.lastPaid;
  for (const segment of CUSTOMER_SEGMENTS) {
    const id = segment.id,
      individual = id === 'individual',
      offer = customerValue(s, id);
    const fitAcquisition = individual
      ? capabilityEffects.individualAcquisition
      : capabilityEffects.acquisition;
    const retention = individual
      ? capabilityEffects.individualRetention
      : capabilityEffects.retention;
    const spread = direction.spread
      ? 1 + (Math.min(100, s[segment.count] / segment.reach) / 100) * 0.5
      : 1;
    const organic =
      s.direction && offer.interested
        ? 0.65 *
          (0.022 + s.trend * 0.00035 + fitAcquisition) *
          (s.trust / 100) *
          (0.5 + offer.score / 100) *
          direction.acquisition *
          founder(s).acquisition *
          spread *
          (1 + effects.acquisition) *
          focus.acquisition *
          target[id] *
          segment.reach
        : 0;
    const paid = paidForecast.segments[id].signups / MONTH;
    let departures = 0,
      renewalDepartures = 0;
    for (const cohort of s[segment.cohorts]) {
      const value = customerValue(s, id, cohort.price).score;
      const churn =
        (cohort.count *
          (0.00055 +
            (capabilityEffects.features.length ? 0 : 0.00025) +
            Math.max(0, 90 - s.reliability) * 0.00003 +
            Math.max(0, segment.minimum - value) * 0.00002) *
          direction.churn *
          focus.churn *
          segment.churn) /
        (1 + effects.retention + retention);
      cohort.count = Math.max(0, cohort.count - churn);
      departures += churn;
      if (s.time >= cohort.renewAt) {
        if (!offer.interested) {
          departures += cohort.count;
          renewalDepartures += cohort.count;
          cohort.count = 0;
        } else {
          cohort.price = s.pricing[id];
          cohort.renewAt += MONTH;
        }
      }
    }
    s[segment.cohorts] = s[segment.cohorts].filter((c) => c.count > 0.00001);
    for (const [source, count] of [
      ['organic', organic],
      ['paid', paid],
    ])
      if (count > 0) {
        const renewAt = Math.ceil(s.time / DAY) * DAY + MONTH;
        const cohort = s[segment.cohorts].find(
          (c) =>
            c.price === s.pricing[id] &&
            c.renewAt === renewAt &&
            (c.source || 'organic') === source,
        );
        if (cohort) cohort.count += count;
        else s[segment.cohorts].push({ count, price: s.pricing[id], renewAt, source });
      }
    if (renewalDepartures >= 0.1)
      log(
        s,
        'Subscriptions not renewed',
        renewalDepartures.toFixed(1) +
          ' ' +
          segment.name.toLowerCase() +
          ' declined the new price.',
        'warning',
      );
    s[segment.acquired] = organic + paid;
    s[segment.departed] = departures;
    s[segment.count] = s[segment.cohorts].reduce((total, c) => total + c.count, 0);
  }
  if (has(s, 'monitoring')) {
    s.evidence =
      m.p95 < 650 && m.error < 0.02 && !s.incidents.some((i) => i.type === 'security')
        ? s.evidence + 1
        : 0;
    if (s.time % 3 === 0) {
      s.history.push({ time: s.time, p95: m.p95, error: m.error, demand: m.demand });
      s.history = s.history.slice(-60);
    }
  }
  const pending = Math.max(...Object.values(s.background));
  if (pending > 120 && !s.backgroundNotified) {
    const name = Object.entries(s.background).sort((a, b) => b[1] - a[1])[0][0];
    log(
      s,
      has(s, 'components') ? 'Consumer backlog detected' : 'Customers report delayed updates',
      has(s, 'components')
        ? `${name}: ${Math.round(s.background[name])} pending items. Compare producer demand with consumer throughput.`
        : 'Reports, notifications, or usage insights are arriving late. Component monitoring can identify the delayed workload.',
      'warning',
    );
    s.backgroundNotified = true;
  } else if (pending < 40 && s.backgroundNotified) {
    log(s, 'Background processing recovered', 'Pending work is below 40 items.', 'good');
    s.backgroundNotified = false;
  }
  if (m.p95 > 700 || m.error > 0.08) {
    if (s.alertSince === null) s.alertSince = s.time;
    if (!s.notified && s.time - s.alertSince > (has(s, 'monitoring') ? 3 : 12)) {
      log(
        s,
        has(s, 'monitoring') ? 'Service degradation detected' : 'Customers report slowness',
        has(s, 'components')
          ? m.dbLoad > m.appLoad
            ? 'Database demand is approaching its capacity.'
            : 'Application demand is approaching its capacity.'
          : has(s, 'monitoring')
            ? 'Latency and errors are elevated. Review recent changes and capacity.'
            : 'Some teams are struggling to complete their work. Monitoring would clarify the impact.',
        'warning',
      );
      s.notified = true;
    }
  } else {
    if (s.notified)
      log(s, 'Service recovered', 'Recent traffic is back within normal operating levels.', 'good');
    s.alertSince = null;
    s.notified = false;
  }
  if (s.response) {
    s.response.remaining -= 1 / debtSummary(s).slowdown;
    if (s.response.remaining <= 0) {
      const i = s.incidents.find((x) => x.id === s.response.id);
      if (i)
        log(
          s,
          'Incident contained',
          i.type === 'security'
            ? 'Access was secured and available data restored. Exposure, financial costs, and trust damage remain.'
            : 'The regression was repaired. Customer confidence will recover over time.',
          'good',
        );
      s.incidents = s.incidents.filter((x) => x.id !== s.response.id);
      s.response = null;
    }
  } else if (s.work.length && !s.solvency.emergency) {
    const active = activeProjects(s);
    for (const w of active)
      w.progress = Math.min(w.duration, w.progress + workRate(s, project(w.id), active.length));
    // Advance every project before installing anything: completion order cannot accelerate siblings.
    const completed = active.filter((w) => w.progress >= w.duration);
    s.work = s.work.filter((w) => !completed.includes(w));
    for (const { id } of completed) {
      const p = project(id);
      if (p.research) {
        s.product.analysed[p.problem] = true;
        log(
          s,
          'Requirements analysed',
          PRODUCT_PROBLEMS.find((problem) => problem.id === p.problem).name +
            ': market fit and scope estimates clarified.',
        );
        continue;
      }
      s.engineering.completed++;
      applyTaskUpkeep(s, id);
      refreshRoadmap(s);
      if (project(id).release) {
        s.ready.push(id);
        log(s, 'Deployment queued', project(id).name + ' finished development.', 'good');
      } else install(s, id);
    }
  }
  startQueuedProjects(s);
  if (!s.release && !s.response && !s.solvency.emergency && s.ready.length) deploy(s);
  if (s.release && !s.response && !s.solvency.emergency) {
    s.release.remaining -= 1 / debtSummary(s).slowdown;
    if (s.release.remaining <= 0) {
      const previous = { ...s.release },
        id = previous.id;
      install(s, id);
      s.lastRelease = previous;
      s.release = null;
      s.cacheWarm = 0;
      if (random(s) < previous.risk) triggerIncident(s, 'release');
    }
  }
  if (
    s.time > 120 &&
    s.time - s.lastSecurity > 180 &&
    productEffects(s).features.length &&
    random(s) < (has(s, 'access') ? 0.00018 : 0.0016) / (1 + effects.security * 0.06)
  )
    triggerIncident(s, 'security');
  productSignals(s);
  for (const i of s.incidents) {
    if (s.time >= i.detectAt && !i.announced) {
      i.announced = true;
      i.awaitingDecision = true;
      s.paused = true;
      log(
        s,
        i.type === 'security' ? 'Security incident detected' : 'Release incident detected',
        incidentText(s, i),
        'danger',
      );
      if (i.type === 'security') {
        s.totals.fines += i.fine;
        charge(s, i.fine, 'penalty');
        s.trust = clamp(s.trust - (i.outcome === 'theft' ? 12 : 8));
        if (i.outcome === 'theft') s.totals.stolenRecords += i.records;
        else s.totals.lostRecords += has(s, 'backup') ? Math.round(i.records * 0.05) : i.records;
        log(
          s,
          'Security impact assessed',
          `$${i.fine} fictional incident penalty. ${i.outcome === 'theft' ? i.records + ' records exposed.' : has(s, 'backup') ? 'Tested backups preserve most records.' : 'Without tested backups, lost records cannot be fully restored.'}`,
          'danger',
        );
      }
    }
    if (i.announced) {
      s.trust = clamp(s.trust - (i.communicated ? 0.008 : 0.045));
    }
  }
  const qualified = requirements(s).every(([, met]) => met);
  if (s.contract.status === 'negotiating' && qualified) {
    s.contract.progress += focus.procurement;
    if (s.contract.progress >= 36) {
      s.contract.status = 'active';
      s.contract.price = s.contract.quotedPrice;
      s.contract.renewalAt = s.time + 90 * DAY;
      log(
        s,
        'Contract signed',
        `Northstar Studio: $${s.contract.price}/month for 90 days. Increased traffic and service obligations.`,
        'good',
      );
    }
  }
  if (s.contract.status === 'active') {
    s.contract.breach = qualified ? Math.max(0, s.contract.breach - 2) : s.contract.breach + 1;
    if (s.contract.breach === 12)
      log(
        s,
        'Contract remediation requested',
        'Northstar needs its service and assurance requirements restored within 8 days.',
        'warning',
      );
    if (s.contract.breach >= 96) {
      s.contract.status = 'prospect';
      s.contract.breach = 0;
      s.trust = clamp(s.trust - 8);
      log(
        s,
        'Contract ended',
        'Northstar left after unresolved obligations. Restore eligibility before approaching them again.',
        'danger',
      );
    } else if (s.time >= s.contract.renewalAt) {
      if (qualified && customerValue(s, 'enterprise', s.pricing.enterprise).interested) {
        s.contract.price = s.pricing.enterprise;
        s.contract.renewalAt = s.time + 90 * DAY;
        log(
          s,
          'Contract renewed',
          `Northstar accepted $${s.contract.price}/month for another 90 days.`,
          'good',
        );
      } else {
        s.contract.status = 'prospect';
        s.contract.breach = 0;
        log(
          s,
          'Contract not renewed',
          'Northstar declined the renewal offer. Review its value for money and service requirements.',
          'warning',
        );
      }
    }
  }
  updateInvestorTargets(s);
  refreshRoadmap(s);
  updateSolvency(s);
  discoverViews(s);
  return s;
}
export function suspendProject(s, id) {
  if (isClosed(s)) return 'Company closed';
  const w = s.work.find((w) => w.id === id);
  if (!w) return 'No unfinished draft';
  w.suspended = true;
  return null;
}
export function resumeProject(s, id) {
  if (isClosed(s) || s.solvency.emergency) return 'Development is unavailable';
  const w = s.work.find((w) => w.id === id);
  if (!w) return 'No unfinished draft';
  if (s.work.filter((w) => !w.suspended).length >= agentPlan(s).slots)
    return 'Pause another draft or increase agent capacity';
  w.suspended = false;
  return null;
}

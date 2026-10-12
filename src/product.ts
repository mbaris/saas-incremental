import type { CompanyContext, ProductProblem, ProductApproach, Project } from './types.ts';
import { DAY } from './constants.ts';
import { PRODUCT_PROBLEMS, PRODUCT_APPROACHES as approaches } from './config/product.ts';
export { PRODUCT_PROBLEMS, PRODUCT_APPROACHES } from './config/product.ts';
export function validateProductCatalog(problems: ProductProblem[], options: ProductApproach[]) {
  const ids = new Set();
  for (const p of problems) {
    if (!p.id || ids.has(p.id) || !p.name || !p.summary || !p.signal)
      throw new Error('Invalid customer need: ' + p.id);
    ids.add(p.id);
  }
  const optionIds = new Set();
  for (const a of options) {
    if (!a.id || optionIds.has(a.id) || !a.name || !ids.has(a.problem))
      throw new Error('Invalid product approach: ' + a.id);
    optionIds.add(a.id);
    for (const key of ['days', 'value', 'small', 'enterprise', 'individual'] as const)
      if (!Number.isFinite(a[key]) || a[key] <= 0)
        throw new Error('Invalid product ' + key + ': ' + a.id);
    for (const key of ['acquisition', 'retention', 'reads', 'app', 'background', 'events'] as const)
      if (!Number.isFinite(a[key]) || a[key] < 0)
        throw new Error('Invalid product ' + key + ': ' + a.id);
    for (const key of ['upkeep', 'effort', 'debt'] as const)
      if (a[key] !== undefined && (!Number.isFinite(a[key]) || a[key] < 0))
        throw new Error('Invalid product ' + key + ': ' + a.id);
  }
  for (const p of problems)
    if (options.filter((a) => a.problem === p.id).length < 2)
      throw new Error('Customer need requires competing approaches: ' + p.id);
}
validateProductCatalog(PRODUCT_PROBLEMS, approaches);
export const PRODUCT_PROJECTS: Project[] = [
  ...approaches.map<Project>((a) => ({
    ...a,
    category: 'Product',
    product: true,
    duration: a.days * DAY,
    release: true,
    stage: 0,
    icon: 'spark',
    benefit: 'Market-dependent value, acquisition, and retention',
    requires: a.requires || [],
  })),
  ...approaches.map<Project>((a) => ({
    id: 'refine_' + a.id,
    name: 'Refine ' + a.name.toLowerCase(),
    problem: a.problem,
    refinementOf: a.id,
    category: 'Product',
    product: true,
    duration: 10 * DAY,
    release: true,
    repeat: true,
    stage: 0,
    icon: 'spark',
    requires: [a.id],
    description: 'Improve the shipped capability using its existing market fit.',
    benefit: 'Diminishing improvements to usefulness',
    tradeoff: 'More maintenance, request work, and technical debt',
  })),
  ...PRODUCT_PROBLEMS.map<Project>((p) => ({
    id: 'analyse_' + p.id,
    name: 'Analyse ' + p.name.toLowerCase(),
    problem: p.id,
    research: true,
    category: 'Research',
    duration: 3 * DAY,
    stage: 0,
    icon: 'search',
    description: 'Clarify market fit and implementation scope.',
    benefit: 'More precise estimates; no direct product benefit',
    tradeoff: 'Occupies an agent slot; consumes time and ongoing tokens',
  })),
];
const hash = (seed: number, key: string) => {
  let n = seed >>> 0;
  for (const c of key) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return (n >>> 0) / 4294967296;
};
const byApproach = new Map(approaches.map((a) => [a.id, a]));
const byProblem = new Map(
  PRODUCT_PROBLEMS.map((p) => [p.id, approaches.filter((a) => a.problem === p.id)]),
);
interface OpportunityPlan {
  needs: ProductProblem[];
  choices: Map<string, ProductApproach[]>;
}
const plans = new Map<string, OpportunityPlan>();
function opportunityPlan(s: CompanyContext): OpportunityPlan {
  const key = s.product.seed + ':' + s.direction;
  if (!plans.has(key)) {
    const seed = s.product.seed;
    const needs = PRODUCT_PROBLEMS.filter((p) => !p.core).toSorted((a, b) => {
      const score = (p: ProductProblem) =>
        Math.pow(hash(seed, 'need:' + p.id), 1 / (p.affinity === s.direction ? 1.8 : 1));
      return score(b) - score(a);
    });
    const choices = new Map(
      PRODUCT_PROBLEMS.map((p) => {
        const all = byProblem.get(p.id)!,
          baseline = all.filter((a) => a.baseline);
        const random = all
          .filter((a) => !a.baseline)
          .toSorted((a, b) => hash(seed, 'choice:' + b.id) - hash(seed, 'choice:' + a.id));
        return [p.id, [...baseline, ...random.slice(0, 3 - baseline.length)]];
      }),
    );
    if (plans.size >= 128) plans.delete(plans.keys().next().value!);
    plans.set(key, { needs, choices });
  }
  return plans.get(key)!;
}
export function availableProductProblems(s: CompanyContext) {
  if (!s.direction) return [];
  // Completed work and the historical customer peak never fall after a rollback.
  const count = Math.min(
    opportunityPlan(s).needs.length,
    2 + Math.floor(s.engineering.completed / 4) * 2 + Math.floor(s.engineering.maxCustomers / 60),
  );
  return [...PRODUCT_PROBLEMS.filter((p) => p.core), ...opportunityPlan(s).needs.slice(0, count)];
}
export function offeredProductApproaches(s: CompanyContext, problem: string) {
  return s.direction && availableProductProblems(s).some((p) => p.id === problem)
    ? opportunityPlan(s).choices.get(problem) || []
    : [];
}
export function productOpportunityBlock(
  s: CompanyContext,
  p: { problem?: string; product?: boolean; refinementOf?: string; id: string },
) {
  if (!availableProductProblems(s).some((problem) => problem.id === p.problem))
    return 'Customer need not discovered yet';
  if (
    p.product &&
    !p.refinementOf &&
    !offeredProductApproaches(s, p.problem ?? '').some((a) => a.id === p.id)
  )
    return 'Not offered in this company’s market';
  return null;
}
export function productParameters(s: CompanyContext, id: string) {
  const a = byApproach.get(id);
  if (!a) return null;
  const direction: Record<string, number> = (
    {
      practical: { setup: 1.05, workflow: 1.2, coordination: 0.9 },
      network: { setup: 0.95, workflow: 0.85, coordination: 1.3 },
      trend: { setup: 1.2, workflow: 0.85, coordination: 1.1 },
      specialist: { setup: 0.9, workflow: 1.3, coordination: 0.95 },
    } as Partial<Record<string, Record<string, number>>>
  )[s.direction ?? ''] || { setup: 1, workflow: 1, coordination: 1 };
  const seed = s.product.seed,
    variation = (segment: string) => 0.8 + hash(seed, `${a.id}:${segment}`) * 0.4;
  const problem = PRODUCT_PROBLEMS.find((p) => p.id === a.problem)!;
  return {
    individualFit:
      a.individual *
      (direction[a.problem] ?? (problem.affinity === s.direction ? 1.2 : 1)) *
      variation('individual'),
    smallFit:
      a.small *
      (direction[a.problem] ?? (problem.affinity === s.direction ? 1.2 : 1)) *
      variation('small'),
    enterpriseFit: a.enterprise * variation('enterprise'),
    scope: 0.85 + hash(seed, a.id + ':scope') * 0.3,
  };
}
export function productEffects(s: CompanyContext) {
  const result = {
    value: 0,
    individualValue: 0,
    individualAcquisition: 0,
    individualRetention: 0,
    enterpriseValue: 0,
    acquisition: 0,
    retention: 0,
    reads: 0,
    app: 0,
    background: 0,
    events: 0,
    collaboration: false,
    features: [] as string[],
    refinements: 0,
  };
  for (const a of approaches)
    if (s.upgrades.includes(a.id)) {
      const fit = productParameters(s, a.id)!,
        n = s.engineering.levels['refine_' + a.id] || 0,
        improvement = 1 + 0.12 * Math.log2(1 + n);
      result.features.push(a.id);
      result.refinements += n;
      result.individualValue += a.value * fit.individualFit * improvement;
      result.individualAcquisition += a.acquisition * fit.individualFit * improvement;
      result.individualRetention += a.retention * fit.individualFit * improvement;
      result.value += a.value * fit.smallFit * improvement;
      result.enterpriseValue += a.value * fit.enterpriseFit * improvement;
      result.acquisition += a.acquisition * fit.smallFit * improvement;
      result.retention += a.retention * fit.smallFit * improvement;
      for (const key of ['reads', 'app', 'background', 'events'] as const)
        result[key] += a[key] + n * 0.004;
      if (a.problem === 'coordination') result.collaboration = true;
    }
  return result;
}
export const hasCapability = (s: CompanyContext, problem: string) =>
  (byProblem.get(problem) || []).some((a) => s.upgrades.includes(a.id));
export function productSignals(s: CompanyContext) {
  if (!s.direction) return;
  const add = (key: string, source: string, problem: string, text: string) => {
    if (!s.product.seenSignals.includes(key)) {
      s.product.seenSignals.push(key);
      s.product.signals.unshift({ key, source, problem, text, time: s.time });
      s.product.signals = s.product.signals.slice(0, 12);
    }
  };
  for (const p of availableProductProblems(s).filter((p) => !p.core))
    add(
      'opportunity:' + p.id,
      s.customers + s.individualCustomers >= 5 ? 'Customers' : 'Prospects',
      p.id,
      p.signal,
    );
  const audienceFit = s.customerTarget === 'individual' ? 'individualFit' : 'smallFit',
    customers = s.customers + s.individualCustomers;
  const ranked = PRODUCT_PROBLEMS.filter((p) => p.core).toSorted(
    (a, b) =>
      Math.max(
        ...offeredProductApproaches(s, b.id).map((p) => productParameters(s, p.id)![audienceFit]),
      ) -
      Math.max(
        ...offeredProductApproaches(s, a.id).map((p) => productParameters(s, p.id)![audienceFit]),
      ),
  );
  add('prospect', 'Prospects', ranked[0].id, ranked[0].signal);
  if (customers >= 5) add('customer', 'Customers', ranked[1].id, ranked[1].signal);
  if (customers >= 20 || s.businessFocus === 'enterprise')
    add('sales', 'Sales conversations', ranked[2].id, ranked[2].signal);
  for (const a of approaches)
    if (s.upgrades.includes(a.id) && s.time - (s.product.shippedAt[a.id] ?? s.time) >= DAY * 7) {
      const fit = productParameters(s, a.id)![audienceFit];
      add(
        'adoption:' + a.id,
        'After release',
        a.problem,
        `${a.name}: ${fit >= 1.15 ? 'strong' : fit >= 0.9 ? 'moderate' : 'limited'} usefulness for ${s.customerTarget === 'individual' ? 'individuals' : 'small teams'}. Based on customer feedback, not measured causal retention.`,
      );
    }
}
export function validateProduct(s: CompanyContext) {
  const p = s.product;
  if (
    !p ||
    !Number.isInteger(p.seed) ||
    p.seed < 0 ||
    p.seed > 4294967295 ||
    (['analysed', 'selected', 'shippedAt'] as const).some(
      (key) => !p[key] || typeof p[key] !== 'object' || Array.isArray(p[key]),
    ) ||
    !Array.isArray(p.signals) ||
    p.signals.length > 12 ||
    !Array.isArray(p.seenSignals) ||
    p.seenSignals.length > 3 + approaches.length + PRODUCT_PROBLEMS.length ||
    new Set(p.seenSignals).size !== p.seenSignals.length ||
    p.seenSignals.some(
      (key) =>
        ![
          'prospect',
          'customer',
          'sales',
          ...PRODUCT_PROBLEMS.filter((p) => !p.core).map((p) => 'opportunity:' + p.id),
          ...approaches.map((a) => 'adoption:' + a.id),
        ].includes(key),
    )
  )
    throw new Error('Invalid product state');
  for (const [problem, id] of Object.entries(p.selected))
    if (!approaches.some((a) => a.problem === problem && a.id === id))
      throw new Error('Invalid product choice');
  const discovered = new Set(availableProductProblems(s).map((p) => p.id));
  for (const [problem, done] of Object.entries(p.analysed))
    if (!discovered.has(problem) || done !== true) throw new Error('Invalid analysis');
  for (const [id, time] of Object.entries(p.shippedAt))
    if (
      !approaches.some((a) => a.id === id) ||
      !s.upgrades.includes(id) ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > s.time
    )
      throw new Error('Invalid product release');
  if (approaches.some((a) => s.upgrades.includes(a.id) && !Object.hasOwn(p.shippedAt, a.id)))
    throw new Error('Missing product release time');
  if (s.work.some((w) => w.id.startsWith('analyse_') && p.analysed[w.id.slice(8)]))
    throw new Error('Completed analysis cannot run again');
  const outstanding = [
    ...s.workQueue,
    ...s.upgrades,
    ...s.work.map((w) => w.id),
    ...s.ready,
    ...(s.release ? [s.release.id] : []),
  ];
  for (const id of outstanding) {
    const a = byApproach.get(id);
    if (a && productOpportunityBlock(s, { ...a, product: true }))
      throw new Error('Unavailable product approach');
    if (id.startsWith('analyse_') && !discovered.has(id.slice(8)))
      throw new Error('Undiscovered customer research');
  }
  for (const problem of PRODUCT_PROBLEMS) {
    const ids = approaches.filter((a) => a.problem === problem.id && outstanding.includes(a.id));
    if (
      ids.length > 1 ||
      (ids.length && p.selected[problem.id] !== ids[0].id) ||
      (!ids.length && p.selected[problem.id])
    )
      throw new Error('Conflicting product approaches');
  }
  if (
    s.upgrades.some((id) => id.startsWith('analyse_')) ||
    s.ready.some((id) => id.startsWith('analyse_')) ||
    s.release?.id.startsWith('analyse_')
  )
    throw new Error('Research cannot be installed or deployed');
  if (s.upgrades.some((id) => id.startsWith('refine_') && !s.upgrades.includes(id.slice(7))))
    throw new Error('Refinement needs a shipped capability');
  for (const signal of p.signals)
    if (
      !p.seenSignals.includes(signal.key) ||
      !PRODUCT_PROBLEMS.some((p) => p.id === signal.problem) ||
      typeof signal.text !== 'string' ||
      typeof signal.source !== 'string' ||
      !Number.isFinite(signal.time) ||
      signal.time < 0 ||
      signal.time > s.time
    )
      throw new Error('Invalid product signal');
}

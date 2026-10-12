import {
  SAVE_VERSION,
  MAX_DRAFTS,
  QUEUE_LIMIT,
  CASH_CLOSE,
  CASH_SUSPEND,
  CASH_GRACE,
} from './constants.ts';
import { CUSTOMER_SEGMENTS, CUSTOMER_TARGETS } from './config/customers.ts';
import {
  AGENT_PLANS,
  PRODUCT_DIRECTIONS,
  ARCHITECTURE_PATHS,
  BUSINESS_FOCUSES,
  FOUNDERS,
  FUNDING_ROUNDS,
} from './config/company.ts';
import { project } from './projects.ts';
import { validateProduct } from './product.ts';
import { projectAvailable, architectureConflict } from './architecture-policy.ts';
import { createGame } from './state.js';
const has = (s, id) => s.upgrades.includes(id);

export function serialize(s) {
  return JSON.stringify(s);
}
export function deserialize(raw) {
  const s = JSON.parse(raw);
  if (
    !CUSTOMER_TARGETS.some((t) => t.id === s.customerTarget) ||
    !Array.isArray(s.individualCohorts) ||
    ['individualCustomers', 'lastIndividualAcquisition', 'lastIndividualChurn'].some(
      (k) => !Number.isFinite(s[k]) || s[k] < 0,
    )
  )
    throw new Error('Invalid customer segments');
  for (const segment of CUSTOMER_SEGMENTS) {
    if (
      !Number.isFinite(s.pricing?.[segment.id]) ||
      s.pricing[segment.id] < segment.minPrice ||
      s.pricing[segment.id] > segment.maxPrice ||
      !Array.isArray(s[segment.cohorts]) ||
      s[segment.cohorts].some(
        (c) =>
          !c ||
          ![c.count, c.price, c.renewAt].every(Number.isFinite) ||
          c.count < 0 ||
          c.price < segment.minPrice ||
          c.price > segment.maxPrice ||
          c.renewAt < 0 ||
          (c.source !== undefined && !['organic', 'paid'].includes(c.source)),
      )
    )
      throw new Error('Invalid customer subscriptions');
  }
  if (Math.abs(s.individualCustomers - s.individualCohorts.reduce((n, c) => n + c.count, 0)) > 1e-6)
    throw new Error('Inconsistent individual subscriptions');
  s.workQueue ??= [];
  if (
    !Array.isArray(s.workQueue) ||
    s.workQueue.length > QUEUE_LIMIT ||
    s.workQueue.some((id) => !project(id))
  )
    throw new Error('Invalid development queue');
  if (
    !s?.marketing ||
    ['budget', 'spent', 'acquired', 'lastPaid'].some(
      (id) => !Number.isFinite(s.marketing[id]) || s.marketing[id] < 0,
    ) ||
    s.marketing.budget > 10000 ||
    s.marketing.budget % 100 ||
    s.cohorts?.some((c) => c.source !== undefined && !['organic', 'paid'].includes(c.source))
  )
    throw new Error('Invalid marketing save');
  const engineering = s?.engineering;
  if (
    !engineering ||
    !Number.isInteger(engineering.completed) ||
    engineering.completed < 0 ||
    !Number.isFinite(engineering.maxCustomers) ||
    engineering.maxCustomers < 0 ||
    !Number.isFinite(engineering.debt) ||
    engineering.debt < 0 ||
    !Number.isFinite(engineering.wear) ||
    engineering.wear < 0 ||
    engineering.wear > 100 ||
    !Array.isArray(engineering.unlocked) ||
    new Set(engineering.unlocked).size !== engineering.unlocked.length ||
    engineering.unlocked.some((id) => !project(id)) ||
    !engineering.levels ||
    typeof engineering.levels !== 'object' ||
    Array.isArray(engineering.levels) ||
    Object.entries(engineering.levels).some(
      ([id, n]) => !project(id)?.repeat || !Number.isInteger(n) || n < 0 || n > 1000000,
    )
  )
    throw new Error('Unsupported engineering progression save');
  if (
    typeof engineering.maintenanceNotified !== 'boolean' ||
    Object.entries(engineering.levels).some(([id, n]) => n > 0 && !s.upgrades?.includes(id))
  )
    throw new Error('Inconsistent engineering levels');
  const solvency = s?.solvency;
  if (
    !solvency ||
    !['healthy', 'grace', 'restricted', 'suspended', 'closed'].includes(solvency.stage) ||
    typeof solvency.emergency !== 'boolean' ||
    ![0, 1, 2].includes(solvency.warningLevel) ||
    [
      solvency.operatingDebt,
      solvency.penaltyDebt,
      s.finance?.operatingPaid,
      s.finance?.penaltiesPaid,
    ].some((n) => !Number.isFinite(n) || n < 0) ||
    [solvency.unpaidSince, solvency.closedAt].some(
      (n) => n !== null && (!Number.isFinite(n) || n < 0 || n > s.time),
    ) ||
    (solvency.stage === 'closed') !== (solvency.closedAt !== null) ||
    s.cash < 0 ||
    Math.abs(s.finance.operatingSpend - s.finance.operatingPaid - solvency.operatingDebt) > 1e-6 ||
    Math.abs(s.totals?.fines - s.finance.penaltiesPaid - solvency.penaltyDebt) > 1e-6
  )
    throw new Error('Unsupported insolvency save');
  const debt = solvency.operatingDebt + solvency.penaltyDebt,
    age = solvency.unpaidSince === null ? 0 : s.time - solvency.unpaidSince;
  const expectedStage =
    debt <= 1e-8
      ? 'healthy'
      : age >= CASH_CLOSE
        ? 'closed'
        : age >= CASH_SUSPEND
          ? 'suspended'
          : age >= CASH_GRACE
            ? 'restricted'
            : 'grace';
  if (
    expectedStage !== solvency.stage ||
    debt > 1e-8 !== (solvency.unpaidSince !== null) ||
    (debt > 1e-8 && !solvency.emergency)
  )
    throw new Error('Inconsistent unpaid-bill deadlines');
  if (
    !s ||
    !AGENT_PLANS.some((p) => p.id === s.agentPlan) ||
    !Array.isArray(s.work) ||
    s.work.length > MAX_DRAFTS ||
    s.work.filter((w) => !w.suspended).length > 3 ||
    s.work.some(
      (w) =>
        (w.suspended !== undefined && typeof w.suspended !== 'boolean') ||
        !project(w?.id) ||
        !Number.isFinite(w.progress) ||
        !Number.isFinite(w.duration) ||
        w.duration <= 0 ||
        w.progress < 0 ||
        w.progress >= w.duration,
    ) ||
    !Array.isArray(s.ready) ||
    s.ready.some((id) => !project(id)?.release)
  )
    throw new Error('Unsupported agent work save');
  if (
    s.release &&
    (!project(s.release.id)?.release ||
      !Number.isFinite(s.release.duration) ||
      s.release.duration <= 0 ||
      !Number.isFinite(s.release.remaining) ||
      s.release.remaining <= 0 ||
      s.release.remaining > s.release.duration ||
      !Number.isFinite(s.release.risk) ||
      s.release.risk < 0.005 ||
      s.release.risk > 0.8)
  )
    throw new Error('Invalid deployment save');
  const pending = [
    ...s.workQueue,
    ...s.work.map((w) => w.id),
    ...s.ready,
    ...(s.release ? [s.release.id] : []),
  ];
  if (s.workQueue.some((id) => has(s, id) && !project(id).repeat))
    throw new Error('Completed work in development queue');
  validateProduct(s);
  if (new Set(pending).size !== pending.length) throw new Error('Duplicate pending project');
  if (s?.direction !== null && !PRODUCT_DIRECTIONS.some((d) => d.id === s?.direction))
    throw new Error('Unsupported product direction');
  if (
    (s?.architecturePath !== null &&
      !ARCHITECTURE_PATHS.some((p) => p.id === s?.architecturePath)) ||
    !BUSINESS_FOCUSES.some((f) => f.id === s?.businessFocus) ||
    !Number.isInteger(s?.functionTier) ||
    s.functionTier < 0 ||
    s.functionTier > 4 ||
    !Number.isInteger(s?.databaseTier) ||
    s.databaseTier < 0 ||
    s.databaseTier > 3
  )
    throw new Error('Unsupported architecture or business focus');
  const f = s?.funding;
  if (
    !FOUNDERS.some((founder) => founder.id === s.founder) ||
    !Number.isFinite(f?.founderCapital) ||
    f.founderCapital < 5000 ||
    f.founderCapital > 500000 ||
    f.founderCapital % 500 ||
    !Array.isArray(s.revealedViews) ||
    new Set(s.revealedViews).size !== s.revealedViews.length ||
    s.revealedViews.some((id) => !['system', 'funding', 'security', 'enterprise'].includes(id))
  )
    throw new Error('Invalid company setup');
  if (
    !f ||
    !Number.isFinite(f.raised) ||
    f.raised < 0 ||
    !Number.isFinite(f.confidence) ||
    f.confidence < 0 ||
    f.confidence > 100 ||
    !Array.isArray(f.shareholders) ||
    !Array.isArray(f.rounds) ||
    f.rounds.length > FUNDING_ROUNDS.length ||
    f.shareholders.length !== f.rounds.length + 1 ||
    f.shareholders[0]?.id !== 'founder' ||
    f.shareholders.some(
      (h) => !Number.isFinite(h.ownership) || h.ownership <= 0 || h.ownership > 1,
    ) ||
    Math.abs(f.shareholders.reduce((n, h) => n + h.ownership, 0) - 1) > 1e-8 ||
    f.rounds.some(
      (r, i) =>
        r.id !== FUNDING_ROUNDS[i].id ||
        f.shareholders[i + 1]?.id !== r.id ||
        r.investment !== FUNDING_ROUNDS[i].investment ||
        ![r.preMoney, r.postMoney, r.dilution, r.closedAt, r.targetRevenue, r.deadline].every(
          Number.isFinite,
        ) ||
        r.preMoney <= 0 ||
        r.postMoney !== r.preMoney + r.investment ||
        Math.abs(r.dilution - r.investment / r.postMoney) > 1e-8 ||
        r.closedAt < 0 ||
        r.deadline <= r.closedAt ||
        r.targetRevenue <= 0 ||
        !['pending', 'met', 'missed'].includes(r.status),
    ) ||
    f.raised !== f.rounds.reduce((n, r) => n + r.investment, 0)
  )
    throw new Error('Unsupported or invalid funding save');
  if (
    !s ||
    s.version !== SAVE_VERSION ||
    !s.pricing ||
    !Array.isArray(s.cohorts) ||
    s.cohorts.some((c) => ![c.count, c.price, c.renewAt].every(Number.isFinite)) ||
    !s.finance ||
    [s.finance.earned, s.finance.operatingSpend].some((n) => !Number.isFinite(n) || n < 0) ||
    !s.background ||
    ['reports', 'notifications', 'analytics'].some(
      (id) =>
        !Number.isFinite(s.background[id]) || s.background[id] < 0 || s.background[id] > 10000,
    ) ||
    !Number.isInteger(s.workerReplicas) ||
    s.workerReplicas < 0 ||
    s.workerReplicas > 7 ||
    !Number.isFinite(s.cash) ||
    !Number.isFinite(s.time) ||
    s.time < 0 ||
    !Number.isFinite(s.customers) ||
    s.customers < 0 ||
    !Array.isArray(s.upgrades) ||
    s.upgrades.some((id) => !project(id)) ||
    !Array.isArray(s.incidents) ||
    !Array.isArray(s.events) ||
    !Array.isArray(s.history) ||
    !s.contract ||
    ![1, 3, 8].includes(s.speed) ||
    [s.trend, s.trust, s.reliability].some((n) => !Number.isFinite(n) || n < 0 || n > 100) ||
    (s.release && !project(s.release.id))
  )
    throw new Error('Unsupported or invalid save');
  for (const release of [s.release, s.lastRelease]) {
    if (!release) continue;
    const p = project(release.id),
      old = release.previousArchitecture;
    if ((p?.migration || p?.extractService) && !old)
      throw new Error('Missing architecture rollback state');
    if (
      old &&
      ((old.path !== null && !ARCHITECTURE_PATHS.some((path) => path.id === old.path)) ||
        !Number.isInteger(old.functionTier) ||
        old.functionTier < 0 ||
        old.functionTier > 4 ||
        !Number.isInteger(old.workerReplicas) ||
        old.workerReplicas < 0 ||
        old.workerReplicas > 7 ||
        !Array.isArray(old.retired) ||
        old.retired.some((id) => !project(id)) ||
        !old.levels ||
        typeof old.levels !== 'object' ||
        Array.isArray(old.levels) ||
        Object.entries(old.levels).some(
          ([id, n]) => !project(id)?.repeat || !Number.isInteger(n) || n < 0,
        ))
    )
      throw new Error('Invalid architecture rollback state');
  }
  if (pending.some((id) => architectureConflict(s, project(id))))
    throw new Error('Conflicting architecture work');
  if (
    s.upgrades.some((id) => !projectAvailable(s, project(id))) ||
    pending.some((id) => !projectAvailable(s, project(id))) ||
    (s.architecturePath !== 'functions' && s.functionTier !== 0) ||
    (s.architecturePath === 'functions' && s.workerReplicas !== 0)
  )
    throw new Error('Conflicting architecture projects');
  return { ...createGame(), ...s, paused: true };
}

import type { CompanyContext, Effect } from './types.ts';
import { ENGINEERING_TASKS, STAGES } from './config/engineering.ts';
export { STAGES } from './config/engineering.ts';
export const EXTRA_PROJECTS = ENGINEERING_TASKS.filter((p) => p.effect);
export const level = (s: Pick<CompanyContext, 'engineering'>, id: string) =>
  s.engineering.levels[id] || 0;
export function roadmapEffects(s: Pick<CompanyContext, 'engineering' | 'upgrades'>) {
  const effects: Record<Exclude<Effect, 'wear' | 'debt'>, number> = {
    value: 0,
    acquisition: 0,
    retention: 0,
    support: 0,
    security: 0,
    release: 0,
    delivery: 0,
    response: 0,
    reads: 0,
    app: 0,
    network: 0,
    efficiency: 0,
    background: 0,
    maintenance: 0,
  };
  for (const p of EXTRA_PROJECTS)
    if (p.effect && p.effect !== 'wear' && p.effect !== 'debt' && s.upgrades.includes(p.id))
      effects[p.effect] += (p.strength ?? 0) * (p.repeat ? Math.log2(1 + level(s, p.id)) : 1);
  return effects;
}
export function debtSummary(s: Pick<CompanyContext, 'engineering'>) {
  const points = s.engineering.debt;
  return {
    points,
    slowdown: 1 + points * 0.012,
    costMultiplier: 1 + points * 0.0015,
    condition: Math.max(0, 100 - s.engineering.wear),
  };
}

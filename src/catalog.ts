import type { Project } from './types.ts';
import { STAGES } from './config/engineering.ts';
const categories = new Set([
  'Product',
  'Research',
  'Infrastructure',
  'Security',
  'Observability',
  'Delivery',
  'Performance',
  'Maintenance',
]);
const effects = new Set([
  'value',
  'acquisition',
  'retention',
  'support',
  'security',
  'release',
  'delivery',
  'response',
  'reads',
  'app',
  'network',
  'efficiency',
  'background',
  'maintenance',
  'wear',
  'debt',
]);
export function validateCatalog(tasks: Project[]) {
  const byId = new Map<string, Project>();
  for (const p of tasks) {
    if (!p.id || byId.has(p.id)) throw new Error('Duplicate or missing task ID: ' + p.id);
    byId.set(p.id, p);
    if (
      !p.name ||
      !categories.has(p.category) ||
      !Number.isFinite(p.duration) ||
      p.duration <= 0 ||
      !Number.isInteger(p.stage ?? 0) ||
      (p.stage ?? 0) < 0 ||
      (p.stage ?? 0) >= STAGES.length
    )
      throw new Error('Invalid task definition: ' + p.id);
    if (
      p.paths &&
      (!Array.isArray(p.paths) ||
        !p.paths.length ||
        p.paths.some((path) => !['monolith', 'services', 'functions'].includes(path)))
    )
      throw new Error('Invalid architecture paths: ' + p.id);
    if (
      p.migration &&
      (!['monolith', 'functions'].includes(p.migration) || !p.release || !p.repeat)
    )
      throw new Error('Invalid architecture migration: ' + p.id);
    if (p.requiresWorkload && !['background', 'reads'].includes(p.requiresWorkload))
      throw new Error('Invalid workload requirement: ' + p.id);
    if (
      (p.requires && !Array.isArray(p.requires)) ||
      (p.effect &&
        (!effects.has(p.effect) || !Number.isFinite(p.strength) || (p.strength ?? 0) <= 0))
    )
      throw new Error('Invalid task effects/dependencies: ' + p.id);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Task dependency cycle: ' + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const required of byId.get(id)!.requires || []) {
      if (!byId.has(required)) throw new Error('Unknown dependency ' + required + ' in ' + id);
      const task = byId.get(id)!,
        dependency = byId.get(required)!;
      if (
        task.paths &&
        dependency.paths &&
        !task.paths.some((path) => dependency.paths!.includes(path))
      )
        throw new Error('Incompatible dependency paths: ' + id + ' requires ' + required);
      visit(required);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return tasks;
}

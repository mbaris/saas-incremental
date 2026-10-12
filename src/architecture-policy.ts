import type { CompanyContext, Project, ArchitecturePath } from './types.ts';
import { project } from './projects.ts';
const has = (s: CompanyContext, id: string) => s.upgrades.includes(id);
export const projectAvailable = (s: CompanyContext, p: Project | undefined) =>
  !!p &&
  (p.migration
    ? p.migration !== (s.architecturePath || 'monolith')
    : !p.paths || p.paths.includes(s.architecturePath || 'monolith'));
export const pendingProjects = (s: CompanyContext) => [
  ...s.work.map((w) => w.id),
  ...s.workQueue,
  ...s.ready,
  ...(s.release ? [s.release.id] : []),
];
export function retiredProjects(s: CompanyContext, target: ArchitecturePath) {
  const removed = new Set(
    s.upgrades.filter((id) => {
      const p = project(id)!;
      return (
        !p.migration &&
        ((p.paths && !p.paths.includes(target)) || (target === 'monolith' && p.extractService))
      );
    }),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const id of s.upgrades)
      if (
        !removed.has(id) &&
        (project(id)!.requires || []).some((required) => removed.has(required))
      ) {
        removed.add(id);
        changed = true;
      }
  }
  return [...removed];
}
export function applyArchitecture(s: CompanyContext, p: Project) {
  if (p.migration) {
    const removed = retiredProjects(s, p.migration);
    s.upgrades = s.upgrades.filter((id) => !removed.includes(id) && !project(id)!.migration);
    s.architecturePath = p.migration;
    s.functionTier = 0;
    if (p.migration === 'functions') s.workerReplicas = 0;
    for (const id of removed) delete s.engineering.levels[id];
  } else if (p.extractService) s.architecturePath = 'services';
}
export function architectureConflict(s: CompanyContext, p: Project) {
  const pending = pendingProjects(s)
    .filter((id) => id !== p.id)
    .map((id) => project(id)!);
  if (
    p.migration &&
    pending.some((other) => other.migration || other.extractService || other.paths)
  )
    return 'Finish or remove architecture-specific work before migrating';
  if ((p.migration || p.extractService || p.paths) && pending.some((other) => other.migration))
    return 'Architecture migration already planned';
  if ((p.id === 'host' && has(s, 'service_scale')) || (p.id === 'service_scale' && has(s, 'host')))
    return 'Application servers already upgraded';
  if (
    (p.id === 'host' && pending.some((other) => other.id === 'service_scale')) ||
    (p.id === 'service_scale' && pending.some((other) => other.id === 'host'))
  )
    return 'Application server upgrade already planned';
  return null;
}

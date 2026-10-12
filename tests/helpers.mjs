import { project, availableProjects } from '../src/game.js';
// Scenario setup only; gameplay changes architecture through engineering projects.
export function chooseArchitecture(s, id) {
  s.architecturePath = id;
  return null;
}
export function grantProjects(s, ids) {
  s.upgrades = ids;
  s.product.selected = {};
  s.product.shippedAt = {};
  for (const id of [
    ...ids,
    ...s.work.map((w) => w.id),
    ...s.ready,
    ...(s.release ? [s.release.id] : []),
  ]) {
    const p = project(id);
    if (p?.product && !p.refinementOf) {
      s.product.selected[p.problem] = id;
      if (ids.includes(id)) s.product.shippedAt[id] = s.time;
    }
  }
  return s;
}
export function allProjects(s) {
  const chosen = ['setup_guide', 'workflow_rules', 'coordination_status'];
  return availableProjects(s)
    .filter(
      (p) => !p.migration && !p.research && (!p.product || chosen.includes(p.refinementOf || p.id)),
    )
    .map((p) => p.id);
}

import { ENGINEERING_TASKS } from './config/engineering.ts';
import { PRODUCT_PROJECTS } from './product.ts';
import { DAY } from './constants.ts';
import { validateCatalog } from './catalog.ts';
import type { Project } from './types.ts';

export const PROJECTS: Project[] = [
  ...ENGINEERING_TASKS.map((p) => ({ ...p, duration: p.days * DAY })),
  ...PRODUCT_PROJECTS,
];
validateCatalog(PROJECTS);
const projectIndex = new Map(PROJECTS.map((p) => [p.id, p]));
export const project = (id: string): Project | undefined => projectIndex.get(id);

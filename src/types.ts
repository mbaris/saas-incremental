export type ArchitecturePath = 'monolith' | 'services' | 'functions';
export type ProductDirection = 'practical' | 'network' | 'trend' | 'specialist';
export type CustomerSegment = 'individual' | 'small';
export type TaskCategory =
  | 'Product'
  | 'Research'
  | 'Infrastructure'
  | 'Security'
  | 'Observability'
  | 'Delivery'
  | 'Performance'
  | 'Maintenance';
export type Effect =
  | 'value'
  | 'acquisition'
  | 'retention'
  | 'support'
  | 'security'
  | 'release'
  | 'delivery'
  | 'response'
  | 'reads'
  | 'app'
  | 'network'
  | 'efficiency'
  | 'background'
  | 'maintenance'
  | 'wear'
  | 'debt';

export interface TaskDefinition {
  id: string;
  name: string;
  category: TaskCategory;
  icon: string;
  description: string;
  benefit: string;
  tradeoff: string;
  days?: number;
  stage?: number;
  requires?: string[];
  paths?: ArchitecturePath[];
  release?: boolean;
  repeat?: boolean;
  initial?: boolean;
  migration?: 'monolith' | 'functions';
  extractService?: boolean;
  requiresWorkload?: 'background' | 'reads';
  effect?: Effect;
  strength?: number;
  debt?: number;
  upkeep?: number;
  effort?: number;
  product?: boolean;
  research?: boolean;
  problem?: string;
  refinementOf?: string;
}
export interface EngineeringTask extends TaskDefinition {
  days: number;
}
export interface Project extends TaskDefinition {
  duration: number;
}
export interface ProductProblem {
  id: string;
  name: string;
  summary: string;
  signal: string;
  capability?: string;
  core?: boolean;
  affinity?: ProductDirection;
}
export type ApproachProfile = 'light' | 'useful' | 'viral' | 'power' | 'enterprise';
export interface ApproachMetrics {
  days: number;
  value: number;
  acquisition: number;
  retention: number;
  reads: number;
  app: number;
  background: number;
  events: number;
  small: number;
  enterprise: number;
  upkeep: number;
  effort: number;
  debt: number;
}
export interface ApproachInput extends Omit<ApproachMetrics, 'upkeep' | 'effort' | 'debt'> {
  id: string;
  name: string;
  problem: string;
  summary: string;
  description: string;
  tradeoff: string;
  requires?: string[];
  profile?: ApproachProfile;
  baseline?: boolean;
  upkeep?: number;
  effort?: number;
  debt?: number;
}
export interface ProductApproach extends ApproachInput {
  individual: number;
}
export interface EngineeringState {
  completed: number;
  maxCustomers: number;
  unlocked: string[];
  levels: Record<string, number>;
  debt: number;
  wear: number;
  maintenanceNotified: boolean;
}
export interface ProductState {
  seed: number;
  analysed: Record<string, boolean>;
  selected: Record<string, string>;
  shippedAt: Record<string, number>;
  signals: { key: string; source: string; problem: string; text: string; time: number }[];
  seenSignals: string[];
}
/** State used by product and topology calculations; no dependency on browser globals. */
export interface CompanyContext {
  direction: ProductDirection | null;
  architecturePath: ArchitecturePath | null;
  businessFocus: string;
  customerTarget: CustomerSegment | 'mixed';
  time: number;
  customers: number;
  individualCustomers: number;
  upgrades: string[];
  product: ProductState;
  engineering: EngineeringState;
  functionTier: number;
  workerReplicas: number;
  work: { id: string; progress: number; duration: number; suspended?: boolean }[];
  workQueue: string[];
  ready: string[];
  release: { id: string } | null;
}

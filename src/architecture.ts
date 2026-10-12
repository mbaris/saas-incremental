import type { CompanyContext } from './types.ts';
interface GraphNode {
  id: string;
  name: string;
  type: string;
  column: number;
  row: number;
  detail: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  workload: string;
}
import { productEffects } from './product.ts';
const installed = (s: CompanyContext, id: string) => s.upgrades.includes(id);

// The graph is the shared inventory for drawing, resource costs, and engineering effort.
export function architecture(s: CompanyContext) {
  const nodes: GraphNode[] = [],
    edges: GraphEdge[] = [],
    has = (id: string) => installed(s, id);
  const processing = productEffects(s).background > 0;
  const functions = s.architecturePath === 'functions',
    services = s.architecturePath === 'services';
  const expanded = [
    'search_service',
    'report_service',
    'jobs',
    'events',
    'notifications',
    'analytics',
  ].some(has);
  const node = (
    id: string,
    name: string,
    type: string,
    column: number,
    row: number,
    detail = '',
  ) => {
    nodes.push({
      id,
      name,
      type,
      column,
      row,
      detail,
      x: 30 + column * 220,
      y: 45 + row * 130,
      width: 170,
      height: 92,
    });
    return id;
  };
  const edge = (from: string, to: string, kind = 'request', workload = 'core') =>
    edges.push({ id: from + '-' + to, from, to, kind, workload });
  node('clients', 'Clients', 'client', 0, 0, 'Subscribers & contracts');
  const apps = has('replicas') ? 2 : 1,
    coreColumn = has('replicas') || functions ? 2 : 1,
    dbColumn = expanded ? 5 : 3;
  if (has('replicas')) {
    node('balancer', 'Balancer', 'balancer', 1, 0, 'Request routing');
    edge('clients', 'balancer');
  }
  if (functions) {
    node('gateway', 'Request gateway', 'balancer', 1, 0, 'Invocation routing');
    edge('clients', 'gateway');
  }
  for (let i = 0; i < apps; i++) {
    node(
      'app-' + i,
      functions
        ? 'Request functions'
        : has('replicas')
          ? 'Core app · ' + (i + 1)
          : services
            ? 'Core service'
            : 'Monolith',
      functions ? 'function' : 'application',
      coreColumn,
      i,
      functions
        ? `${80 * 2 ** s.functionTier} concurrent capacity`
        : has('host') || has('service_scale')
          ? 'Larger instance'
          : 'Small instance',
    );
    edge(functions ? 'gateway' : has('replicas') ? 'balancer' : 'clients', 'app-' + i);
    edge('app-' + i, 'database');
  }
  node(
    'database',
    'Primary database',
    'database',
    dbColumn,
    0,
    functions ? 'Managed storage' : has('database') ? 'Dedicated host' : 'Shares application host',
  );
  if (has('cache')) {
    node('cache', 'Read cache', 'cache', 3, 2, 'Read-through');
    for (let i = 0; i < apps; i++) edge('app-' + i, 'cache', 'request', 'cache');
    edge('cache', 'database', 'request', 'cache');
  }
  if (has('search_service')) {
    node('search-app', 'Read service', 'application', 2, 2, 'Read-heavy requests');
    node('search-db', 'Read store', 'database', 5, 2, 'Dedicated read store');
    for (let i = 0; i < apps; i++) edge('app-' + i, 'search-app', 'request', 'search');
    edge('search-app', 'search-db', 'request', 'search');
  }
  if (has('report_service')) {
    node('report-app', 'Processing service', 'application', 2, 3, 'Processing requests');
    node('report-db', 'Results store', 'database', 5, 3, 'Processing results');
    for (let i = 0; i < apps; i++) edge('app-' + i, 'report-app', 'request', 'reports');
    edge('report-app', 'report-db', 'request', 'reports');
  }
  const workerCount = has('jobs') ? 1 + (s.workerReplicas || 0) : 0;
  if (has('jobs')) {
    node('report-queue', 'Processing queue', 'queue', 3, 4, 'Pending processing jobs');
    edge(has('report_service') ? 'report-app' : 'app-0', 'report-queue', 'job', 'reports');
    for (let i = 0; i < workerCount; i++) {
      node(
        'report-worker-' + i,
        functions ? 'Processing function' : 'Processing consumer · ' + (i + 1),
        functions ? 'function' : 'consumer',
        4,
        4 + i,
        functions ? 'Queue-triggered execution' : 'Processes queued jobs',
      );
      edge('report-queue', 'report-worker-' + i, 'job', 'reports');
      edge(
        'report-worker-' + i,
        has('report_service') ? 'report-db' : 'database',
        'job',
        'reports',
      );
    }
  }
  const eventRow = Math.max(5, 4 + workerCount + 1);
  if (has('events')) {
    node('event-broker', 'Event broker', 'broker', 2, eventRow, 'Publish / subscribe');
    edge('app-0', 'event-broker', 'event', 'events');
    node('work-topic', 'product.updated', 'topic', 3, eventRow, 'Work changes');
    node('activity-topic', 'account.activity', 'topic', 3, eventRow + 1, 'Account events');
    edge('event-broker', 'work-topic', 'event', 'events');
    edge('event-broker', 'activity-topic', 'event', 'events');
    if (processing) {
      node(
        'report-topic',
        'processing.completed',
        'topic',
        3,
        eventRow + 2,
        'Completed processing',
      );
      edge('event-broker', 'report-topic', 'event', 'reports');
      if (has('jobs')) edge('report-worker-0', 'event-broker', 'event', 'reports');
    }
  }
  if (has('notifications')) {
    node('notification-queue', 'Notification queue', 'queue', 4, eventRow, 'Pending notifications');
    node(
      'notification-worker',
      functions ? 'Notify function' : 'Notification worker',
      functions ? 'function' : 'consumer',
      5,
      eventRow,
      functions ? 'Queue-triggered execution' : 'Delivers updates',
    );
    edge('work-topic', 'notification-queue', 'event', 'notifications');
    if (processing) edge('report-topic', 'notification-queue', 'event', 'notifications');
    edge('notification-queue', 'notification-worker', 'job', 'notifications');
  }
  if (has('analytics')) {
    node(
      'analytics-worker',
      functions ? 'Analytics function' : 'Analytics consumer',
      functions ? 'function' : 'consumer',
      4,
      eventRow + 2,
      functions ? 'Event-triggered execution' : 'Aggregates activity',
    );
    node('analytics-db', 'Analytics database', 'database', 5, eventRow + 2, 'Usage aggregates');
    edge('work-topic', 'analytics-worker', 'event', 'analytics');
    edge('activity-topic', 'analytics-worker', 'event', 'analytics');
    edge('analytics-worker', 'analytics-db', 'event', 'analytics');
  }
  const count = (type: string) => nodes.filter((n) => n.type === type).length;
  const resources = nodes.filter((n) => !['client', 'topic'].includes(n.type)).length;
  const complexity =
    1 +
    Math.max(0, resources - 2) * 0.055 +
    Math.max(0, edges.length - 2) * 0.025 +
    (has('access') ? 0.08 : 0) +
    (services ? 0.12 : 0);
  return {
    nodes,
    edges,
    resources,
    complexity,
    applications: count('application'),
    functions: count('function'),
    databases: count('database'),
    consumers: count('consumer'),
    queues: count('queue'),
    topics: count('topic'),
    brokers: count('broker'),
    width: Math.max(850, ...nodes.map((n) => n.x + n.width + 30)),
    height: Math.max(300, ...nodes.map((n) => n.y + n.height + 45)),
  };
}

// Self-service segments. Larger accounts retain their negotiated contract model.
interface SegmentDefinition {
  id: 'individual' | 'small';
  name: string;
  count: 'individualCustomers' | 'customers';
  cohorts: 'individualCohorts' | 'cohorts';
  acquired: 'lastIndividualAcquisition' | 'lastAcquisition';
  departed: 'lastIndividualChurn' | 'lastChurn';
  price: number;
  minPrice: number;
  maxPrice: number;
  baseValue: number;
  valueScale: number;
  minimum: number;
  reach: number;
  churn: number;
  support: number;
  traffic: number;
  dataWeight: number;
}
export const CUSTOMER_SEGMENTS: SegmentDefinition[] = [
  {
    id: 'individual',
    name: 'Individuals',
    count: 'individualCustomers',
    cohorts: 'individualCohorts',
    acquired: 'lastIndividualAcquisition',
    departed: 'lastIndividualChurn',
    price: 9,
    minPrice: 2,
    maxPrice: 60,
    baseValue: 9,
    valueScale: 0.4,
    minimum: 60,
    reach: 4,
    churn: 2,
    support: 0.18,
    traffic: 0.18,
    dataWeight: 0.125,
  },
  {
    id: 'small',
    name: 'Small teams',
    count: 'customers',
    cohorts: 'cohorts',
    acquired: 'lastAcquisition',
    departed: 'lastChurn',
    price: 29,
    minPrice: 5,
    maxPrice: 200,
    baseValue: 32,
    valueScale: 1,
    minimum: 55,
    reach: 1,
    churn: 1,
    support: 1.5,
    traffic: 1.5,
    dataWeight: 1,
  },
];
export const CUSTOMER_TARGETS = [
  { id: 'individual', name: 'Individuals', individual: 1, small: 0 },
  { id: 'small', name: 'Small teams', individual: 0, small: 1 },
  { id: 'mixed', name: 'Both', individual: 0.5, small: 0.5 },
];

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escape = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (character) => entities[character]);
export const money = (value: number) => dollars.format(value);
export const moneyExact = (value: number) => cents.format(value);
export const num = (value: number) => Math.round(value).toLocaleString();

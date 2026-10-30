export function formatRate(rate: number): string {
  return `${rate.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 2 })} din/h`;
}

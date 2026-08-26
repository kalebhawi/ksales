export function conversionRate(sales: number, completed: number) {
  return completed === 0 ? 0 : sales / completed;
}

export function formatPercent(rate: number, fractionDigits = 1) {
  return `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: fractionDigits })}%`;
}

/** Variação relativa entre dois períodos, ou `null` quando não há base de comparação. */
export function relativeChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function formatChange(change: number | null) {
  if (change === null) return { label: "sem base", tone: "neutral" as const };
  if (change === 0) return { label: "estável", tone: "neutral" as const };

  return {
    label: formatPercent(Math.abs(change)),
    tone: change > 0 ? ("positive" as const) : ("negative" as const),
  };
}

const TONES = ["coral", "blue", "yellow", "green", "purple", "orange", "pink"] as const;

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function toneOf(seed: string) {
  let sum = 0;
  for (let index = 0; index < seed.length; index += 1) sum = (sum + seed.charCodeAt(index)) % 9973;

  return TONES[sum % TONES.length];
}

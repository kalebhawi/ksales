import {
  OPERATION_TIME_ZONE,
  operationDateParts,
  startOfOperationDayFor,
  type OperationDateParts,
} from "@/lib/operation-day";

/**
 * Filtro de período da visão geral. Vive separado do banco de propósito: é
 * lógica de calendário, roda no cliente (o seletor) e no servidor (a consulta),
 * e é testável sem subir PostgreSQL.
 */
export type PeriodSpec =
  | { kind: "hoje" }
  | { kind: "ontem" }
  | { kind: "dia"; date: string }
  | { kind: "intervalo"; from: string; to: string }
  | { kind: "mes-atual" }
  | { kind: "mes-passado" }
  | { kind: "mes"; year: number; month: number };

export type PeriodKind = PeriodSpec["kind"];

export const DEFAULT_PERIOD: PeriodSpec = { kind: "hoje" };

export const PERIOD_PRESETS: { kind: PeriodKind; label: string }[] = [
  { kind: "hoje", label: "Hoje" },
  { kind: "ontem", label: "Ontem" },
  { kind: "mes-atual", label: "Mês atual" },
  { kind: "mes-passado", label: "Mês passado" },
];

export const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Faixa defensiva: fora dela o valor é lixo (ou dedo escorregado no campo de ano). */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodParams = Record<string, string | string[] | undefined>;
export type ParsedPeriod = { spec: PeriodSpec; error: string | null };

function firstValue(params: PeriodParams, key: string) {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toYmd({ year, month, day }: OperationDateParts) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function fromYmd(value: string): OperationDateParts {
  const [year, month, day] = value.split("-").map(Number);

  return { year, month, day };
}

/** Aceita só uma data de calendário real: `2026-02-30` é recusado, não empurrado para março. */
function parseYmd(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseYearMonth(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const [year, month] = [Number(match[1]), Number(match[2])];
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;

  return { year, month };
}

/** Valor de um `<input type="month">` (`YYYY-MM`) virando período. */
export function monthSpecFrom(value: string): PeriodSpec | null {
  const month = parseYearMonth(value.trim());

  return month ? { kind: "mes", ...month } : null;
}

/** Valor para preencher um `<input type="month">` a partir do período atual. */
export function monthValueOf(spec: PeriodSpec, fallbackYmd: string) {
  return spec.kind === "mes" ? `${spec.year}-${pad(spec.month)}` : fallbackYmd.slice(0, 7);
}

/**
 * Lê o período da query string. Entrada inválida cai em "hoje" e devolve o
 * motivo — a tela mostra o aviso em vez de exibir número de outro período sem
 * dizer nada.
 */
export function parsePeriod(params: PeriodParams): ParsedPeriod {
  const kind = firstValue(params, "periodo");
  const fail = (error: string): ParsedPeriod => ({ spec: DEFAULT_PERIOD, error });
  const ok = (spec: PeriodSpec): ParsedPeriod => ({ spec, error: null });

  if (!kind) return ok(DEFAULT_PERIOD);

  switch (kind) {
    case "hoje":
    case "ontem":
    case "mes-atual":
    case "mes-passado":
      return ok({ kind });

    case "dia": {
      const date = parseYmd(firstValue(params, "de"));
      return date ? ok({ kind: "dia", date }) : fail("Data inválida.");
    }

    case "intervalo": {
      const from = parseYmd(firstValue(params, "de"));
      const to = parseYmd(firstValue(params, "ate"));
      if (!from || !to) return fail("Informe as duas datas do período.");

      // Datas invertidas: não há outra leitura possível além do intervalo entre
      // as duas, então vira ordem certa em vez de erro.
      return ok(from <= to ? { kind: "intervalo", from, to } : { kind: "intervalo", from: to, to: from });
    }

    case "mes": {
      const month = parseYearMonth(firstValue(params, "mes"));
      return month ? ok({ kind: "mes", ...month }) : fail("Mês inválido.");
    }

    default:
      return fail("Período desconhecido.");
  }
}

/** Query string que reproduz o período — o que os links do seletor usam. */
export function periodQuery(spec: PeriodSpec) {
  switch (spec.kind) {
    case "hoje":
      return "";
    case "dia":
      return `?periodo=dia&de=${spec.date}`;
    case "intervalo":
      return `?periodo=intervalo&de=${spec.from}&ate=${spec.to}`;
    case "mes":
      return `?periodo=mes&mes=${spec.year}-${pad(spec.month)}`;
    default:
      return `?periodo=${spec.kind}`;
  }
}

function shiftMonth(year: number, month: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));

  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

function shiftDay(parts: OperationDateParts, delta: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));

  return toYmd({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

/**
 * Toda escolha vira uma de duas formas: um intervalo de dias ou um mês inteiro.
 * O resto do módulo só conhece essas duas.
 */
type CanonicalPeriod =
  | { kind: "dias"; from: string; to: string }
  | { kind: "mes"; year: number; month: number };

export function canonicalPeriod(spec: PeriodSpec, reference: Date, timeZone = OPERATION_TIME_ZONE): CanonicalPeriod {
  const today = operationDateParts(reference, timeZone);

  switch (spec.kind) {
    case "hoje": {
      const date = toYmd(today);
      return { kind: "dias", from: date, to: date };
    }
    case "ontem": {
      const date = shiftDay(today, -1);
      return { kind: "dias", from: date, to: date };
    }
    case "dia":
      return { kind: "dias", from: spec.date, to: spec.date };
    case "intervalo":
      return { kind: "dias", from: spec.from, to: spec.to };
    case "mes-atual":
      return { kind: "mes", year: today.year, month: today.month };
    case "mes-passado":
      return { kind: "mes", ...shiftMonth(today.year, today.month, -1) };
    case "mes":
      return { kind: "mes", year: spec.year, month: spec.month };
  }
}

export type DateRange = { from: Date; to: Date };

export type ResolvedPeriod = {
  spec: PeriodSpec;
  /** "Hoje", "26/08/2026", "agosto de 2026"... */
  label: string;
  /** Texto do comparativo nos cartões: "vs. ontem", "vs. mês anterior"... */
  comparison: string;
  range: DateRange;
  previous: DateRange;
  /** Mês ou dia ainda em curso: o número não é final e o comparativo é parcial. */
  inProgress: boolean;
};

function dayCount(from: string, to: string) {
  const start = fromYmd(from);
  const end = fromYmd(to);
  const diff = Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day);

  return Math.round(diff / DAY_MS) + 1;
}

/** Dias do mês já vividos: o mês inteiro se ficou para trás, zero se ainda não chegou. */
function elapsedInMonth(year: number, month: number, reference: Date, timeZone: string) {
  const today = operationDateParts(reference, timeZone);

  if (today.year === year && today.month === month) return today.day;
  if (Date.UTC(today.year, today.month - 1) > Date.UTC(year, month - 1)) return daysInMonth(year, month);

  return 0;
}

export function resolvePeriod(spec: PeriodSpec, reference: Date, timeZone = OPERATION_TIME_ZONE): ResolvedPeriod {
  const canonical = canonicalPeriod(spec, reference, timeZone);
  const today = operationDateParts(reference, timeZone);

  if (canonical.kind === "dias") {
    const start = fromYmd(canonical.from);
    const end = fromYmd(canonical.to);
    const days = dayCount(canonical.from, canonical.to);

    const from = startOfOperationDayFor(start.year, start.month, start.day, timeZone);
    const to = startOfOperationDayFor(end.year, end.month, end.day + 1, timeZone);

    return {
      spec,
      label: labelFor(spec, canonical),
      comparison: days === 1 ? (spec.kind === "hoje" ? "vs. ontem" : "vs. dia anterior") : `vs. ${days} dias anteriores`,
      range: { from, to },
      // Mesma duração, colada antes do início: 1 dia vira o dia anterior,
      // 15 dias viram os 15 dias anteriores.
      previous: { from: startOfOperationDayFor(start.year, start.month, start.day - days, timeZone), to: from },
      inProgress: canonical.to >= toYmd(today) && canonical.from <= toYmd(today),
    };
  }

  const { year, month } = canonical;
  const previousMonth = shiftMonth(year, month, -1);
  const elapsed = elapsedInMonth(year, month, reference, timeZone);
  const inProgress = elapsed > 0 && elapsed < daysInMonth(year, month);

  // Mês em curso compara com o mesmo trecho do mês anterior: 26 dias contra os
  // 31 do mês fechado apontariam uma queda que não existe.
  const comparableDays = inProgress ? Math.min(elapsed, daysInMonth(previousMonth.year, previousMonth.month)) : daysInMonth(previousMonth.year, previousMonth.month);

  return {
    spec,
    label: labelFor(spec, canonical),
    comparison: inProgress ? "vs. mesmo trecho do mês anterior" : "vs. mês anterior",
    range: {
      from: startOfOperationDayFor(year, month, 1, timeZone),
      to: startOfOperationDayFor(year, month + 1, 1, timeZone),
    },
    previous: {
      from: startOfOperationDayFor(previousMonth.year, previousMonth.month, 1, timeZone),
      to: startOfOperationDayFor(previousMonth.year, previousMonth.month, 1 + comparableDays, timeZone),
    },
    inProgress,
  };
}

export function formatYmd(value: string) {
  const { year, month, day } = fromYmd(value);

  return `${pad(day)}/${pad(month)}/${year}`;
}

export function formatMonth(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

function labelFor(spec: PeriodSpec, canonical: CanonicalPeriod) {
  if (spec.kind === "hoje") return "Hoje";
  if (spec.kind === "ontem") return "Ontem";

  if (canonical.kind === "mes") return formatMonth(canonical.year, canonical.month);
  if (canonical.from === canonical.to) return formatYmd(canonical.from);

  return `${formatYmd(canonical.from)} até ${formatYmd(canonical.to)}`;
}

export function periodLabel(spec: PeriodSpec, reference: Date, timeZone = OPERATION_TIME_ZONE) {
  return labelFor(spec, canonicalPeriod(spec, reference, timeZone));
}

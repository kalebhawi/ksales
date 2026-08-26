export const OPERATION_TIME_ZONE = process.env.OPERATION_TIME_ZONE ?? "America/Sao_Paulo";

function offsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour") % 24, value("minute"), value("second"));

  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Instante UTC da meia-noite do dia de operação (fuso da loja, não do servidor).
 */
export function startOfOperationDay(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  const offset = offsetMs(reference, timeZone);
  const local = new Date(reference.getTime() + offset);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

  let utc = localMidnight - offset;
  const correctedOffset = offsetMs(new Date(utc), timeZone);
  if (correctedOffset !== offset) utc = localMidnight - correctedOffset;

  return new Date(utc);
}

export type OperationDateParts = { year: number; month: number; day: number };

function localDateParts(date: Date, timeZone: string): OperationDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return { year: value("year"), month: value("month"), day: value("day") };
}

/** Ano, mês (1-12) e dia do calendário da loja para um instante qualquer. */
export function operationDateParts(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  return localDateParts(reference, timeZone);
}

/**
 * Meia-noite de uma data do calendário da loja.
 *
 * Aceita dia e mês fora da faixa de propósito — `Date.UTC` normaliza, e é daí
 * que "dia seguinte" (`day + 1`) e "mês anterior" (`month - 1`) saem de graça,
 * sem aritmética de calendário espalhada pelo código.
 */
export function startOfOperationDayFor(year: number, month: number, day: number, timeZone = OPERATION_TIME_ZONE) {
  const target = Date.UTC(year, month - 1, day);

  // Meio-dia UTC cai no mesmo dia local em quase todo fuso; o ajuste abaixo
  // cobre os extremos (UTC+13, UTC-11) sem depender dessa folga.
  let utc = target + 12 * 60 * 60 * 1000;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = localDateParts(new Date(utc), timeZone);
    const drift = target - Date.UTC(parts.year, parts.month - 1, parts.day);
    if (drift === 0) break;
    utc += drift;
  }

  return startOfOperationDay(new Date(utc), timeZone);
}

export function operationDayRange(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  const from = startOfOperationDay(reference, timeZone);
  const to = startOfOperationDay(new Date(from.getTime() + 36 * 60 * 60 * 1000), timeZone);

  return { from, to };
}

export function previousOperationDayRange(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  const { from } = operationDayRange(reference, timeZone);
  const previous = startOfOperationDay(new Date(from.getTime() - 12 * 60 * 60 * 1000), timeZone);

  return { from: previous, to: from };
}

export function formatOperationDate(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(reference);
}

/**
 * ISO 8601 no fuso da loja, com o deslocamento explícito
 * (`2026-08-26T11:32:05.123-03:00`).
 *
 * A auditoria grava assim para o arquivo ser legível por quem abre — e não
 * ambíguo: o deslocamento no fim mantém o instante exato recuperável.
 */
export function formatOperationTimestamp(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  const offset = offsetMs(reference, timeZone);
  const wallClock = new Date(reference.getTime() + offset).toISOString().slice(0, 23);

  const minutes = Math.round(Math.abs(offset) / 60000);
  const sign = offset < 0 ? "-" : "+";
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${wallClock}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function formatOperationTime(reference: Date, timeZone = OPERATION_TIME_ZONE) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(reference);
}

import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  AUDIT_ACTION_LABELS,
  DEFAULT_AUDIT_PAGE_SIZE,
  auditDateFromFileName,
  auditFileName,
  matchesAuditSearch,
  paginateAudit,
  parseAuditLine,
  type AuditAction,
  type AuditActor,
  type AuditEntry,
  type AuditPageResult,
  type AuditTarget,
} from "@/lib/audit-events";
import { formatOperationTimestamp, operationDateParts } from "@/lib/operation-day";
import { toYmd } from "@/lib/period";

/**
 * Trilha de auditoria em arquivo, um por dia de operação, sempre em modo
 * append: `audit_log_26_08_2026.jsonl`.
 *
 * JSON Lines em vez de texto delimitado porque nome de pessoa pode conter
 * qualquer caractere — com `|` ou quebra de linha um formato delimitado
 * corromperia a linha, e uma trilha de auditoria corrompida não serve para nada.
 * Cada linha continua sendo texto puro, legível e greppável.
 *
 * `?.trim()` e não `??` na pasta: a variável costuma vir declarada e vazia no
 * `.env`, e uma string em branco viraria um caminho absurdo em vez do padrão.
 */
export const AUDIT_LOG_DIR = process.env.AUDIT_LOG_DIR?.trim()
  ? path.resolve(process.env.AUDIT_LOG_DIR.trim())
  : path.join(process.cwd(), "audit-logs");

/** Atalho para o formato de ator a partir da sessão. */
export function auditActor(user: { id: string; name: string; role: string }): AuditActor {
  return { id: user.id, name: user.name, role: user.role };
}

export type AuditInput = {
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  details?: Record<string, unknown>;
  /** Instante do evento; o padrão é agora. */
  at?: Date;
};

/**
 * Grava uma linha. Chame **depois** do commit: nada deve aparecer na trilha se
 * a transação foi desfeita.
 *
 * Uma falha de disco não derruba a resposta — a ação já aconteceu no banco, e
 * devolver erro faria o usuário repetir uma operação que já valeu. A falha vai
 * para o log do servidor, que é onde ela precisa ser vista.
 */
export async function recordAudit({ action, actor, target = null, details = {}, at = new Date() }: AuditInput) {
  const entry: AuditEntry = {
    timestamp: formatOperationTimestamp(at),
    action,
    label: AUDIT_ACTION_LABELS[action],
    actor,
    target,
    details,
  };

  try {
    await mkdir(AUDIT_LOG_DIR, { recursive: true });
    await appendFile(auditFilePath(toYmd(operationDateParts(at))), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("[auditoria] não foi possível gravar a linha", { action, error });
  }
}

/** Várias linhas do mesmo evento em lote (encerrar o dia de todos, por exemplo). */
export async function recordAuditBatch(entries: AuditInput[]) {
  for (const entry of entries) await recordAudit(entry);
}

export function auditFilePath(date: string) {
  return path.join(AUDIT_LOG_DIR, auditFileName(date));
}

export type AuditFileInfo = {
  date: string;
  fileName: string;
  bytes: number;
  entries: number;
};

/** Dias disponíveis no diretório, do mais recente para o mais antigo. */
export async function listAuditFiles(): Promise<AuditFileInfo[]> {
  let names: string[];

  try {
    names = await readdir(AUDIT_LOG_DIR);
  } catch {
    // Diretório ainda não existe: nenhuma ação foi registrada até agora.
    return [];
  }

  const files: AuditFileInfo[] = [];

  for (const name of names) {
    const date = auditDateFromFileName(name);
    if (!date) continue;

    try {
      const info = await stat(path.join(AUDIT_LOG_DIR, name));
      if (!info.isFile()) continue;

      files.push({ date, fileName: name, bytes: info.size, entries: await countEntries(name) });
    } catch {
      continue;
    }
  }

  return files.sort((a, b) => b.date.localeCompare(a.date));
}

async function countEntries(fileName: string) {
  const content = await readFile(path.join(AUDIT_LOG_DIR, fileName), "utf8");

  return content.split("\n").filter((line) => line.trim()).length;
}

/** Conteúdo bruto de um dia, ou `null` se aquele dia não tem arquivo. */
export async function readAuditFile(date: string): Promise<string | null> {
  try {
    return await readFile(auditFilePath(date), "utf8");
  } catch {
    return null;
  }
}

/**
 * Teto de dias lidos de uma vez. Um período aberto de anos carregaria a
 * operação inteira na memória para mostrar 25 linhas; o resultado avisa quantos
 * dias ficaram de fora em vez de fingir que não existem.
 */
export const MAX_QUERY_DAYS = 62;

export type AuditQueryInput = {
  from?: string | null;
  to?: string | null;
  search?: string;
  action?: AuditAction | null;
  page?: number;
  perPage?: number;
};

export type AuditEntriesResult = AuditPageResult<AuditEntry> & {
  /** Faixa efetivamente lida — sem filtro, é o dia mais recente. */
  from: string | null;
  to: string | null;
  days: string[];
  daysLeftOut: number;
  /** Linhas que não puderam ser lidas; aparecem como aviso, não somem calado. */
  corrupted: number;
  actions: { action: AuditAction; label: string; count: number }[];
};

const EMPTY_RESULT: AuditEntriesResult = {
  items: [],
  page: 1,
  pages: 1,
  total: 0,
  perPage: DEFAULT_AUDIT_PAGE_SIZE,
  from: null,
  to: null,
  days: [],
  daysLeftOut: 0,
  corrupted: 0,
  actions: [],
};

/**
 * Linhas da trilha já filtradas e paginadas. Filtro e paginação acontecem no
 * servidor: o arquivo de um dia movimentado não precisa atravessar a rede
 * inteiro para a tela mostrar 25 linhas.
 */
export async function queryAuditEntries(input: AuditQueryInput = {}): Promise<AuditEntriesResult> {
  const files = await listAuditFiles();
  if (files.length === 0) return EMPTY_RESULT;

  const perPage = input.perPage ?? DEFAULT_AUDIT_PAGE_SIZE;
  const latest = files[0].date;
  const earliest = files[files.length - 1].date;

  // Sem filtro nenhum, o dia mais recente — é o que alguém abre a tela querendo ver.
  const requestedFrom = input.from ?? (input.to ? earliest : latest);
  const requestedTo = input.to ?? (input.from ? latest : latest);
  const [from, to] = requestedFrom <= requestedTo ? [requestedFrom, requestedTo] : [requestedTo, requestedFrom];

  const inRange = files.filter((file) => file.date >= from && file.date <= to);
  const days = inRange.slice(0, MAX_QUERY_DAYS);

  const entries: AuditEntry[] = [];
  let corrupted = 0;

  for (const file of days) {
    const content = await readAuditFile(file.date);
    if (!content) continue;

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;

      const entry = parseAuditLine(line);
      if (entry) entries.push(entry);
      else corrupted += 1;
    }
  }

  // Mais recente primeiro. Por instante, não por string: numa virada de horário
  // de verão dois deslocamentos convivem no mesmo arquivo.
  entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const byAction = new Map<AuditAction, number>();
  for (const entry of entries) byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);

  const filtered = entries
    .filter((entry) => !input.action || entry.action === input.action)
    .filter((entry) => matchesAuditSearch(entry, input.search ?? ""));

  return {
    ...paginateAudit(filtered, input.page ?? 1, perPage),
    from,
    to,
    days: days.map((file) => file.date),
    daysLeftOut: inRange.length - days.length,
    corrupted,
    actions: [...byAction.entries()]
      .map(([action, count]) => ({ action, label: AUDIT_ACTION_LABELS[action], count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
  };
}

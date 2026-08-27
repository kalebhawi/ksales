import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  AUDIT_ACTION_LABELS,
  DEFAULT_AUDIT_PAGE_SIZE,
  auditDateFromFileName,
  auditFileName,
  createAuditPager,
  matchesAuditSearch,
  parseAuditLine,
  type AuditAction,
  type AuditActor,
  type AuditEntry,
  type AuditPageResult,
  type AuditStore,
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
  /** Loja do fato. Fica na linha para a trilha responder "onde", não só "quem". */
  store?: AuditStore;
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
/**
 * O diretório é criado uma vez por processo, e não a cada linha: encerrar o dia
 * de uma equipe inteira grava uma linha por vendedor, e cada uma repetia o
 * `mkdir`. Se falhar, a promessa é descartada para a próxima gravação tentar de
 * novo em vez de herdar o erro para sempre.
 */
let logDir: Promise<unknown> | null = null;

function ensureLogDir() {
  logDir ??= mkdir(AUDIT_LOG_DIR, { recursive: true }).catch((error) => {
    logDir = null;
    throw error;
  });

  return logDir;
}

function buildEntry({ action, actor, target = null, store = null, details = {}, at = new Date() }: AuditInput) {
  const entry: AuditEntry = {
    timestamp: formatOperationTimestamp(at),
    action,
    label: AUDIT_ACTION_LABELS[action],
    actor,
    target,
    store,
    details,
  };

  return { entry, day: toYmd(operationDateParts(at)) };
}

export async function recordAudit(input: AuditInput) {
  const { entry, day } = buildEntry(input);

  try {
    await ensureLogDir();
    await appendFile(auditFilePath(day), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("[auditoria] não foi possível gravar a linha", { action: input.action, error });
  }
}

/**
 * Várias linhas de uma vez — encerrar o dia de uma equipe inteira, por exemplo.
 *
 * Uma gravação por dia de operação em vez de uma por linha: antes eram N
 * chamadas sequenciais ao disco para registrar um único comando. Agrupa por dia
 * porque um lote pode atravessar a virada da meia-noite.
 */
export async function recordAuditBatch(inputs: AuditInput[]) {
  if (inputs.length === 0) return;

  const byDay = new Map<string, string[]>();

  for (const input of inputs) {
    const { entry, day } = buildEntry(input);
    const lines = byDay.get(day) ?? [];

    lines.push(JSON.stringify(entry));
    byDay.set(day, lines);
  }

  try {
    await ensureLogDir();

    for (const [day, lines] of byDay) {
      await appendFile(auditFilePath(day), `${lines.join("\n")}\n`, "utf8");
    }
  } catch (error) {
    console.error("[auditoria] não foi possível gravar o lote", { linhas: inputs.length, error });
  }
}

export function auditFilePath(date: string) {
  return path.join(AUDIT_LOG_DIR, auditFileName(date));
}

export type AuditDayInfo = {
  date: string;
  fileName: string;
  bytes: number;
};

export type AuditFileInfo = AuditDayInfo & {
  entries: number;
};

/**
 * Dias disponíveis, do mais recente para o mais antigo, sem abrir arquivo
 * nenhum. É o que basta para escolher o que ler — e o que evita varrer o
 * diretório inteiro para responder a consulta de um dia só.
 */
export async function listAuditDays(): Promise<AuditDayInfo[]> {
  let names: string[];

  try {
    names = await readdir(AUDIT_LOG_DIR);
  } catch {
    // Diretório ainda não existe: nenhuma ação foi registrada até agora.
    return [];
  }

  const days: AuditDayInfo[] = [];

  for (const name of names) {
    const date = auditDateFromFileName(name);
    if (!date) continue;

    try {
      const info = await stat(path.join(AUDIT_LOG_DIR, name));
      if (!info.isFile()) continue;

      days.push({ date, fileName: name, bytes: info.size });
    } catch {
      continue;
    }
  }

  return days.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * O mesmo, com quantas linhas cada dia tem. Só para a lista de download, que
 * exibe esse número: contar exige abrir o arquivo, e é a parte cara.
 */
export async function listAuditFiles(): Promise<AuditFileInfo[]> {
  const days = await listAuditDays();
  const files: AuditFileInfo[] = [];

  for (const day of days) {
    files.push({ ...day, entries: await countEntries(day.fileName) });
  }

  return files;
}

/**
 * Conta as quebras de linha no buffer, sem transformar o arquivo inteiro em
 * string: decodificar dezenas de MB em UTF-8 era o grosso do custo, e o número
 * é o mesmo, porque toda linha gravada termina em quebra.
 */
async function countEntries(fileName: string) {
  const buffer = await readFile(path.join(AUDIT_LOG_DIR, fileName));
  let lines = 0;

  // `indexOf` do Buffer é busca nativa; varrer byte a byte em JavaScript custa
  // ordens de grandeza mais em arquivos de dezenas de MB.
  for (let at = buffer.indexOf(NEWLINE); at !== -1; at = buffer.indexOf(NEWLINE, at + 1)) {
    lines += 1;
  }

  return lines;
}

const NEWLINE = 10;


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
  /** Id da loja; `null` não filtra. */
  store?: string | null;
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
  stores: { id: string; name: string; count: number }[];
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
  stores: [],
};

/**
 * Linhas da trilha já filtradas e paginadas. Filtro e paginação acontecem no
 * servidor: o arquivo de um dia movimentado não precisa atravessar a rede
 * inteiro para a tela mostrar 25 linhas.
 */
export async function queryAuditEntries(input: AuditQueryInput = {}): Promise<AuditEntriesResult> {
  const available = await listAuditDays();
  if (available.length === 0) return EMPTY_RESULT;

  const perPage = input.perPage ?? DEFAULT_AUDIT_PAGE_SIZE;
  const latest = available[0].date;
  const earliest = available[available.length - 1].date;

  // Sem filtro nenhum, o dia mais recente — é o que alguém abre a tela querendo ver.
  const requestedFrom = input.from ?? (input.to ? earliest : latest);
  const requestedTo = input.to ?? (input.from ? latest : latest);
  const [from, to] = requestedFrom <= requestedTo ? [requestedFrom, requestedTo] : [requestedTo, requestedFrom];

  const inRange = available.filter((day) => day.date >= from && day.date <= to);
  const days = inRange.slice(0, MAX_QUERY_DAYS);

  const pager = createAuditPager<AuditEntry>(input.page ?? 1, perPage);
  const byAction = new Map<AuditAction, number>();
  // As lojas saem das próprias linhas, não do banco: uma loja apagada continua
  // aparecendo no filtro enquanto houver rastro dela na trilha.
  const byStore = new Map<string, { name: string; count: number }>();
  let corrupted = 0;

  // Um dia por vez, do mais recente para o mais antigo. Cada arquivo cobre um
  // dia de operação, e dias não se sobrepõem — ordenar dentro do dia e
  // percorrer os dias em ordem dá o mesmo resultado de ordenar tudo junto, sem
  // precisar de tudo junto na memória.
  for (const day of days) {
    const content = await readAuditFile(day.date);
    if (!content) continue;

    const entries: AuditEntry[] = [];

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;

      const entry = parseAuditLine(line);
      if (entry) entries.push(entry);
      else corrupted += 1;
    }

    // Por instante, não por texto: numa virada de horário de verão dois
    // deslocamentos convivem no mesmo arquivo.
    entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    for (const entry of entries) {
      byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);

      if (entry.store) {
        const current = byStore.get(entry.store.id);
        byStore.set(entry.store.id, { name: entry.store.name, count: (current?.count ?? 0) + 1 });
      }

      if (input.action && entry.action !== input.action) continue;
      if (input.store && entry.store?.id !== input.store) continue;
      if (!matchesAuditSearch(entry, input.search ?? "")) continue;

      pager.push(entry);
    }
  }

  return {
    ...pager.result(),
    from,
    to,
    days: days.map((day) => day.date),
    daysLeftOut: inRange.length - days.length,
    corrupted,
    actions: [...byAction.entries()]
      .map(([action, count]) => ({ action, label: AUDIT_ACTION_LABELS[action], count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
    stores: [...byStore.entries()]
      .map(([id, { name, count }]) => ({ id, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

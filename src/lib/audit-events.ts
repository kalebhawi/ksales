/**
 * Vocabulário e nomes de arquivo da auditoria. Módulo puro: não toca disco nem
 * banco, então a tela de download e os testes podem importar à vontade. Quem
 * escreve é `@/lib/audit-log`.
 */
export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "ENTERED_QUEUE",
  "RETURNED_TO_QUEUE",
  "STARTED_SERVICE",
  "COMPLETED_SERVICE",
  "REORDERED_QUEUE",
  "REMOVED_FROM_QUEUE",
  "ENDED_SHIFT",
  "SELLER_CREATED",
  "SELLER_UPDATED",
  "SELLER_DEACTIVATED",
  "SELLER_REACTIVATED",
  "SELLER_PHOTO_UPDATED",
  "SELLER_PHOTO_REMOVED",
  "PROFILE_UPDATED",
  "SUPERVISOR_CREATED",
  "SUPERVISOR_UPDATED",
  "SUPERVISOR_DEACTIVATED",
  "SUPERVISOR_REACTIVATED",
  "SUPERVISOR_STORES_UPDATED",
  "STORE_CREATED",
  "STORE_UPDATED",
  "STORE_SWITCHED",
  "SELLER_STORE_CHANGED",
  "AUDIT_LOG_DOWNLOADED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: "Login",
  LOGIN_FAILED: "Tentativa de login recusada",
  LOGOUT: "Logout",
  PASSWORD_CHANGED: "Senha alterada",
  ENTERED_QUEUE: "Entrada na fila",
  RETURNED_TO_QUEUE: "Volta para a fila",
  STARTED_SERVICE: "Entrada em atendimento",
  COMPLETED_SERVICE: "Conclusão de atendimento",
  REORDERED_QUEUE: "Mudança de posição na fila",
  REMOVED_FROM_QUEUE: "Saída da fila",
  ENDED_SHIFT: "Encerramento do dia",
  SELLER_CREATED: "Vendedor cadastrado",
  SELLER_UPDATED: "Vendedor editado",
  SELLER_DEACTIVATED: "Vendedor desativado",
  SELLER_REACTIVATED: "Vendedor reativado",
  SELLER_PHOTO_UPDATED: "Foto do vendedor atualizada",
  SELLER_PHOTO_REMOVED: "Foto do vendedor removida",
  PROFILE_UPDATED: "Perfil editado pelo próprio usuário",
  SUPERVISOR_CREATED: "Supervisor cadastrado",
  SUPERVISOR_UPDATED: "Supervisor editado",
  SUPERVISOR_DEACTIVATED: "Supervisor desativado",
  SUPERVISOR_REACTIVATED: "Supervisor reativado",
  SUPERVISOR_STORES_UPDATED: "Lojas do supervisor alteradas",
  STORE_CREATED: "Loja cadastrada",
  STORE_UPDATED: "Loja editada",
  STORE_SWITCHED: "Troca da loja em visualização",
  SELLER_STORE_CHANGED: "Vendedor transferido de loja",
  AUDIT_LOG_DOWNLOADED: "Download do log de auditoria",
};

/** Quem fez. `null` quando ainda não há sessão (login recusado, por exemplo). */
export type AuditActor = { id: string; name: string; role: string } | null;

/** Sobre quem foi. Vendedor, supervisor ou usuário — sempre nome + id. */
export type AuditTarget = { id: string; name: string } | null;

/**
 * Em qual loja. `null` no que não pertence a nenhuma (login, download da
 * trilha) e nas linhas gravadas antes de a operação ser multi-loja.
 */
export type AuditStore = { id: string; name: string } | null;

export type AuditEntry = {
  timestamp: string;
  action: AuditAction;
  label: string;
  actor: AuditActor;
  target: AuditTarget;
  store: AuditStore;
  details: Record<string, unknown>;
};

export const AUDIT_FILE_PREFIX = "audit_log_";
export const AUDIT_FILE_EXTENSION = ".jsonl";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const FILE_NAME = /^audit_log_(\d{2})_(\d{2})_(\d{4})\.jsonl$/;

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isAuditDate(value: unknown): value is string {
  const match = typeof value === "string" ? value.match(YMD) : null;

  return match ? isRealDate(Number(match[1]), Number(match[2]), Number(match[3])) : false;
}

/**
 * `2026-08-26` vira `audit_log_26_08_2026.jsonl`.
 *
 * O nome é sempre construído aqui a partir de uma data validada — nenhum nome
 * de arquivo vindo do cliente chega ao disco, então não há travessia de
 * diretório possível pela rota de download.
 */
export function auditFileName(date: string) {
  if (!isAuditDate(date)) throw new Error(`Data inválida para arquivo de auditoria: ${date}`);

  const [year, month, day] = date.split("-");

  return `${AUDIT_FILE_PREFIX}${day}_${month}_${year}${AUDIT_FILE_EXTENSION}`;
}

/** Caminho inverso, para listar o diretório. Devolve `null` para arquivo estranho. */
export function auditDateFromFileName(name: string) {
  const match = name.match(FILE_NAME);
  if (!match) return null;

  const [, day, month, year] = match;

  return isRealDate(Number(year), Number(month), Number(day)) ? `${year}-${month}-${day}` : null;
}

/** Nome do arquivo combinado quando o download cobre mais de um dia. */
export function auditRangeFileName(from: string, to: string) {
  if (from === to) return auditFileName(from);

  const stamp = (date: string) => date.split("-").reverse().join("_");

  return `${AUDIT_FILE_PREFIX}${stamp(from)}_a_${stamp(to)}${AUDIT_FILE_EXTENSION}`;
}

/** Famílias de ação, para a tabela agrupar por cor em vez de virar um bloco cinza. */
export const AUDIT_ACTION_GROUPS = ["acesso", "recusado", "fila", "atendimento", "cadastro", "auditoria"] as const;
export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number];

export const AUDIT_ACTION_GROUP: Record<AuditAction, AuditActionGroup> = {
  LOGIN: "acesso",
  LOGOUT: "acesso",
  PASSWORD_CHANGED: "acesso",
  LOGIN_FAILED: "recusado",
  ENTERED_QUEUE: "fila",
  RETURNED_TO_QUEUE: "fila",
  REORDERED_QUEUE: "fila",
  REMOVED_FROM_QUEUE: "fila",
  ENDED_SHIFT: "fila",
  STARTED_SERVICE: "atendimento",
  COMPLETED_SERVICE: "atendimento",
  SELLER_CREATED: "cadastro",
  SELLER_UPDATED: "cadastro",
  SELLER_DEACTIVATED: "cadastro",
  SELLER_REACTIVATED: "cadastro",
  SELLER_PHOTO_UPDATED: "cadastro",
  SELLER_PHOTO_REMOVED: "cadastro",
  PROFILE_UPDATED: "cadastro",
  SUPERVISOR_CREATED: "cadastro",
  SUPERVISOR_UPDATED: "cadastro",
  SUPERVISOR_DEACTIVATED: "cadastro",
  SUPERVISOR_REACTIVATED: "cadastro",
  SUPERVISOR_STORES_UPDATED: "cadastro",
  STORE_CREATED: "cadastro",
  STORE_UPDATED: "cadastro",
  SELLER_STORE_CHANGED: "cadastro",
  STORE_SWITCHED: "acesso",
  AUDIT_LOG_DOWNLOADED: "auditoria",
};

/**
 * `26/08 11:32:05` a partir do carimbo gravado. Lê os campos direto da string
 * em vez de `new Date`: o horário já está no fuso da loja, e reconverter no
 * navegador mostraria a hora de quem está olhando, não a da operação.
 */
export function formatAuditTimestamp(timestamp: string) {
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return { date: "?", time: timestamp };

  const [, , month, day, hour, minute, second] = match;

  return { date: `${day}/${month}`, time: `${hour}:${minute}:${second}` };
}

export function isAuditAction(value: unknown): value is AuditAction {
  return AUDIT_ACTIONS.includes(value as AuditAction);
}

/**
 * Rótulo das chaves de `details`. O arquivo guarda a chave curta; a tabela
 * mostra o nome por extenso. Chave desconhecida aparece como está — a trilha
 * nunca esconde o que gravou.
 */
export const AUDIT_DETAIL_LABELS: Record<string, string> = {
  posicaoNaFila: "posição na fila",
  posicaoAnterior: "posição anterior",
  posicaoNova: "posição nova",
  totalNaFila: "total na fila",
  motivo: "motivo",
  observacao: "observação",
  origem: "origem",
  status: "desfecho",
  atendimentoId: "atendimento",
  duracaoSegundos: "duração",
  email: "e-mail",
  senhaProvisoria: "senha provisória",
  primeiroAcesso: "primeiro acesso",
  sessoesEncerradas: "sessões encerradas",
  senhaRedefinida: "senha redefinida",
  provisoria: "provisória",
  campos: "campos",
  cracha: "crachá",
  nivel: "nível",
  acesso: "acesso",
  nomeAnterior: "nome anterior",
  situacaoAnterior: "situação anterior",
  acessoRevogado: "acesso revogado",
  tipo: "tipo",
  bytes: "bytes",
  loja: "loja",
  lojaAnterior: "loja anterior",
  lojas: "lojas",
  adicionadas: "adicionadas",
  removidas: "removidas",
  ativa: "ativa",
  de: "de",
  ate: "até",
  dias: "dias",
  linhas: "linhas",
};

/** Valores que vêm de enum e ficariam ilegíveis em CAIXA_ALTA na tabela. */
export const AUDIT_VALUE_LABELS: Record<string, string> = {
  SALE_CONVERTED: "venda concluída",
  SALE_NOT_CONVERTED: "venda não convertida",
  EXCHANGE: "troca",
  OTHER: "outro",
  QUEUED: "na fila",
  IN_SERVICE: "em atendimento",
  OFF_SHIFT: "fora do turno",
  encerrar_dia: "encerrar dia",
  intervalo: "intervalo",
  banheiro: "banheiro",
  outro: "outro",
  desativado: "desativado",
  fila: "fila",
  chamar_o_proximo: "chamar o próximo",
  encerrar_dia_de_todos: "encerrar o dia de todos",
  conclusao_de_atendimento: "conclusão de atendimento",
  proprio_perfil: "próprio perfil",
  propria_conta: "própria conta",
  cadastro_de_vendedor: "cadastro de vendedor",
  cadastro_administrativo: "cadastro administrativo",
  troca_de_loja: "troca de loja",
  cadastro_de_loja: "cadastro de loja",
  email_inexistente: "e-mail inexistente",
  usuario_inativo: "usuário inativo",
  senha_incorreta: "senha incorreta",
  limite_de_tentativas: "limite de tentativas",
};

export function auditDetailLabel(key: string) {
  return AUDIT_DETAIL_LABELS[key] ?? key;
}

export function auditValueLabel(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (Array.isArray(value)) return value.length ? value.map(auditValueLabel).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);

  const text = String(value);

  return AUDIT_VALUE_LABELS[text] ?? text;
}

/** Linha do arquivo virando entrada. `null` para linha em branco ou corrompida. */
export function parseAuditLine(line: string): AuditEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);

    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.timestamp !== "string" || !isAuditAction(parsed.action)) return null;

    return {
      timestamp: parsed.timestamp,
      action: parsed.action,
      label: typeof parsed.label === "string" ? parsed.label : AUDIT_ACTION_LABELS[parsed.action as AuditAction],
      actor: parsed.actor ?? null,
      target: parsed.target ?? null,
      store: parsed.store ?? null,
      details: parsed.details && typeof parsed.details === "object" ? parsed.details : {},
    };
  } catch {
    return null;
  }
}

/** Sem acento e em minúscula: buscar "joao" precisa achar "João". */
export function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Busca livre sobre a linha inteira: quem executou, sobre quem, a ação e os
 * detalhes. É o que alguém auditando digita — um nome, um motivo, um id.
 */
export function matchesAuditSearch(entry: AuditEntry, term: string) {
  const needle = normalizeForSearch(term.trim());
  if (!needle) return true;

  const haystack = [
    entry.timestamp,
    entry.action,
    entry.label,
    entry.actor?.name,
    entry.actor?.id,
    entry.actor?.role,
    entry.target?.name,
    entry.target?.id,
    entry.store?.name,
    ...Object.entries(entry.details).flatMap(([key, value]) => [
      key,
      auditDetailLabel(key),
      auditValueLabel(value),
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeForSearch(haystack).includes(needle);
}

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_AUDIT_PAGE_SIZE = 25;

export function isAuditPageSize(value: unknown): value is number {
  return AUDIT_PAGE_SIZES.includes(Number(value) as (typeof AUDIT_PAGE_SIZES)[number]);
}

export type AuditPageResult<T> = { items: T[]; page: number; pages: number; total: number; perPage: number };

/** Paginação com a página presa à faixa válida: `?pagina=999` cai na última. */
export function paginateAudit<T>(items: T[], page: number, perPage: number): AuditPageResult<T> {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (current - 1) * perPage;

  return { items: items.slice(start, start + perPage), page: current, pages, total: items.length, perPage };
}

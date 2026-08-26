"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileClock, RefreshCw, Search } from "lucide-react";
import {
  AUDIT_ACTION_GROUP,
  AUDIT_PAGE_SIZES,
  DEFAULT_AUDIT_PAGE_SIZE,
  auditDetailLabel,
  auditValueLabel,
  formatAuditTimestamp,
  type AuditAction,
  type AuditEntry,
} from "@/lib/audit-events";
import { apiUrl } from "@/lib/base-path";
import { formatYmd } from "@/lib/period";
import { formatBytes } from "@/lib/seller-rules";

export type AuditFile = {
  date: string;
  fileName: string;
  bytes: number;
  entries: number;
};

export type AuditEntries = {
  items: AuditEntry[];
  page: number;
  pages: number;
  total: number;
  perPage: number;
  from: string | null;
  to: string | null;
  days: string[];
  daysLeftOut: number;
  corrupted: number;
  actions: { action: AuditAction; label: string; count: number }[];
};

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Dia da semana sem `Intl`: o mesmo texto no servidor e no navegador. */
function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function AuditAdmin({
  initialFiles,
  initialEntries,
  todayYmd,
}: {
  initialFiles: AuditFile[];
  initialEntries: AuditEntries;
  todayYmd: string;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [entries, setEntries] = useState(initialEntries);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(DEFAULT_AUDIT_PAGE_SIZE);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  // Pontas invertidas viram ordem certa, em vez de esconder tudo sem explicar.
  const [start, end] = from && to && from > to ? [to, from] : [from, to];

  const filteredFiles = useMemo(
    () => files.filter((file) => (!start || file.date >= start) && (!end || file.date <= end)),
    [files, start, end],
  );

  useEffect(() => {
    const controller = new AbortController();

    // Digitar espera um instante; mudar de página ou de filtro busca na hora.
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ pagina: String(page), porPagina: String(perPage) });
      if (start) query.set("de", start);
      if (end) query.set("ate", end);
      if (search.trim()) query.set("busca", search.trim());
      if (action) query.set("acao", action);

      setLoading(true);

      try {
        const response = await fetch(apiUrl(`/admin/auditoria/entries?${query}`), { signal: controller.signal });

        if (!response.ok) {
          setError("Não foi possível carregar os registros.");
          return;
        }

        setEntries(await response.json());
        setError(null);
      } catch {
        if (!controller.signal.aborted) setError("Falha de conexão com o servidor.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 300 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [start, end, search, action, page, perPage, reloads]);

  /** Qualquer mudança de filtro recomeça na primeira página. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  async function refresh() {
    const response = await fetch(apiUrl("/admin/auditoria"));
    if (response.ok) setFiles(await response.json());

    setReloads((value) => value + 1);
  }

  const rangeHref =
    filteredFiles.length > 0
      ? apiUrl(
          `/admin/auditoria/download?de=${filteredFiles[filteredFiles.length - 1].date}&ate=${filteredFiles[0].date}`,
        )
      : null;

  const firstRow = entries.total === 0 ? 0 : (entries.page - 1) * entries.perPage + 1;
  const lastRow = Math.min(entries.page * entries.perPage, entries.total);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">SEGURANÇA</p>
          <h1>Auditoria</h1>
          <p className="heading-subtitle">
            Um arquivo por dia de operação, em modo append. Cada linha traz o horário, quem executou e sobre quem.
          </p>
        </div>
      </section>

      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
        </div>
      )}

      <section className="audit-toolbar">
        <div className="audit-range">
          <label>
            De
            <input
              type="date"
              max={todayYmd}
              value={from}
              onChange={(event) => changeFilter(() => setFrom(event.target.value))}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              max={todayYmd}
              value={to}
              onChange={(event) => changeFilter(() => setTo(event.target.value))}
            />
          </label>
          <label className="audit-action-filter">
            Ação
            <select value={action} onChange={(event) => changeFilter(() => setAction(event.target.value))}>
              <option value="">Todas</option>
              {entries.actions.map((option) => (
                <option key={option.action} value={option.action}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label className="audit-search">
            Buscar
            <span className="search-field">
              <Search size={15} />
              <input
                type="search"
                placeholder="Nome, motivo, id..."
                value={search}
                onChange={(event) => changeFilter(() => setSearch(event.target.value))}
              />
            </span>
          </label>
          {(from || to || search || action) && (
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                changeFilter(() => {
                  setFrom("");
                  setTo("");
                  setSearch("");
                  setAction("");
                })
              }
            >
              Limpar
            </button>
          )}
        </div>

        <div className="audit-actions">
          <button type="button" className="ghost-button" disabled={loading} onClick={refresh}>
            <RefreshCw size={15} /> Atualizar
          </button>
          {rangeHref && filteredFiles.length > 1 && (
            <a className="primary-button" href={rangeHref}>
              <Download size={16} /> Baixar {filteredFiles.length} dias
            </a>
          )}
        </div>
      </section>

      <section className="section-heading">
        <div>
          <h2>
            Registros <span className="muted-count">{entries.total}</span>
          </h2>
          <p>
            {entries.from
              ? entries.from === entries.to
                ? `${formatYmd(entries.from)}${!from && !to ? " — dia mais recente" : ""}`
                : `${formatYmd(entries.from)} até ${formatYmd(entries.to ?? entries.from)}`
              : "Nenhuma ação registrada ainda."}
          </p>
        </div>
        {loading && <span className="pending-tag">Carregando...</span>}
      </section>

      {entries.daysLeftOut > 0 && (
        <p className="audit-warning">
          O período tem mais dias do que a tela lê de uma vez: {entries.daysLeftOut}{" "}
          {entries.daysLeftOut === 1 ? "dia mais antigo ficou" : "dias mais antigos ficaram"} de fora. Baixe o arquivo
          para ver tudo.
        </p>
      )}

      {entries.corrupted > 0 && (
        <p className="audit-warning">
          {entries.corrupted} {entries.corrupted === 1 ? "linha ilegível" : "linhas ilegíveis"} neste período — o
          arquivo bruto continua no download.
        </p>
      )}

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Ação</th>
              <th>Quem executou</th>
              <th>Sobre quem</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {entries.items.map((entry, index) => (
              <AuditRow key={`${entry.timestamp}-${index}`} entry={entry} />
            ))}
          </tbody>
        </table>

        {entries.items.length === 0 && (
          <div className="empty-state">
            {entries.total === 0 && !search && !action
              ? "Nenhuma ação registrada neste período."
              : "Nenhum registro com esse filtro."}
          </div>
        )}
      </div>

      {entries.total > 0 && (
        <div className="audit-pager">
          <span>
            {firstRow}–{lastRow} de {entries.total}
          </span>
          <label>
            Por página
            <select
              value={perPage}
              onChange={(event) => changeFilter(() => setPerPage(Number(event.target.value)))}
            >
              {AUDIT_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="audit-pager-buttons">
            <button
              type="button"
              className="ghost-button"
              disabled={entries.page <= 1 || loading}
              onClick={() => setPage(entries.page - 1)}
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <span className="audit-page-count">
              {entries.page} / {entries.pages}
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={entries.page >= entries.pages || loading}
              onClick={() => setPage(entries.page + 1)}
            >
              Próxima <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      <section className="section-heading off-shift-heading">
        <div>
          <h2>
            Arquivos <span className="muted-count">{filteredFiles.length}</span>
          </h2>
          <p>Um por dia de operação, no formato bruto (JSON Lines).</p>
        </div>
      </section>

      <div className="available-list">
        {filteredFiles.map((file) => (
          <div className="available-row audit-row" key={file.date}>
            <span className="audit-icon">
              <FileClock size={18} />
            </span>
            <div className="seller-info">
              <strong>{formatYmd(file.date)}</strong>
              <span>
                {weekdayOf(file.date)} <b>·</b> {file.entries} {file.entries === 1 ? "registro" : "registros"}{" "}
                <b>·</b> {formatBytes(file.bytes)}
              </span>
              <span className="audit-file-name">{file.fileName}</span>
            </div>
            <a
              className="row-action"
              href={apiUrl(`/admin/auditoria/download?dia=${file.date}`)}
              title={`Baixar ${file.fileName}`}
              aria-label={`Baixar ${file.fileName}`}
            >
              <Download size={17} />
            </a>
          </div>
        ))}

        {filteredFiles.length === 0 && (
          <div className="empty-state">
            {files.length === 0 ? "Nenhuma ação registrada ainda." : "Nenhum dia registrado neste período."}
          </div>
        )}
      </div>
    </>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const { date, time } = formatAuditTimestamp(entry.timestamp);
  const details = Object.entries(entry.details);

  return (
    <tr>
      <td data-label="Horário">
        <span className="audit-time">{time}</span>
        <span className="audit-day">{date}</span>
      </td>
      <td data-label="Ação">
        <span className={`audit-tag ${AUDIT_ACTION_GROUP[entry.action]}`}>{entry.label}</span>
      </td>
      <td data-label="Quem executou">
        {entry.actor ? (
          <>
            <strong>{entry.actor.name}</strong>
            <span className="audit-id" title={entry.actor.id}>
              {entry.actor.role}
            </span>
          </>
        ) : (
          <span className="audit-id">sem sessão</span>
        )}
      </td>
      <td data-label="Sobre quem">
        {entry.target ? (
          <>
            <strong>{entry.target.name}</strong>
            <span className="audit-id">{entry.target.id}</span>
          </>
        ) : (
          <span className="audit-id">—</span>
        )}
      </td>
      <td data-label="Detalhes">
        {details.length === 0 ? (
          <span className="audit-id">—</span>
        ) : (
          <span className="audit-details">
            {details.map(([key, value]) => (
              <span className="audit-chip" key={key}>
                {auditDetailLabel(key)}: <b>{auditValueLabel(value)}</b>
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}

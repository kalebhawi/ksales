"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Power, PowerOff, Store, X } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import { initialsOf, toneOf } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import type { StoreOption } from "@/lib/store-rules";

export type Supervisor = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  stores: { id: string; name: string }[];
};

export function SupervisorsAdmin({
  initialSupervisors,
  stores,
}: {
  initialSupervisors: Supervisor[];
  stores: StoreOption[];
}) {
  const [supervisors, setSupervisors] = useState(initialSupervisors);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Supervisor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function call(path: string, init: RequestInit) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(apiUrl(path), {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Não foi possível salvar.");
        return false;
      }

      const reloaded = await fetch(apiUrl("/admin/supervisores"));
      if (reloaded.ok) setSupervisors(await reloaded.json());

      return true;
    } catch {
      setError("Falha de conexão com o servidor.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">CADASTRO</p>
          <h1>Supervisores</h1>
          <p className="heading-subtitle">
            Supervisores comandam a fila e cadastram vendedores das lojas vinculadas a eles, mas não criam outros
            supervisores.
          </p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={17} /> Novo supervisor
        </button>
      </section>

      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="admin-table">
        {supervisors.map((supervisor) => (
          <div className={`admin-row ${supervisor.active ? "" : "muted"}`} key={supervisor.id}>
            <div className={`seller-avatar ${toneOf(supervisor.email)}`}>{initialsOf(supervisor.name)}</div>
            <div className="seller-info">
              <strong>{supervisor.name}</strong>
              <span>{supervisor.email}</span>
              <span className="supervisor-stores">
                <Store size={11} />{" "}
                {supervisor.stores.length > 0
                  ? supervisor.stores.map((store) => store.name).join(", ")
                  : "nenhuma loja vinculada"}
              </span>
            </div>
            {supervisor.mustChangePassword && supervisor.active && (
              <span className="admin-badge pending">Senha provisória</span>
            )}
            <span className={`admin-badge ${supervisor.active ? "on" : "off"}`}>
              {supervisor.active ? "Ativo" : "Inativo"}
            </span>
            <button className="row-action" title="Editar" aria-label="Editar" onClick={() => setEditing(supervisor)}>
              <Pencil size={16} />
            </button>
            <button
              className="row-action"
              title={supervisor.active ? "Desativar" : "Reativar"}
              aria-label={supervisor.active ? "Desativar" : "Reativar"}
              disabled={pending}
              onClick={() =>
                void call(
                  `/admin/supervisores/${supervisor.id}`,
                  supervisor.active
                    ? { method: "DELETE" }
                    : { method: "PATCH", body: JSON.stringify({ active: true }) },
                )
              }
            >
              {supervisor.active ? <PowerOff size={16} /> : <Power size={16} />}
            </button>
          </div>
        ))}
        {supervisors.length === 0 && <div className="empty-state">Nenhum supervisor cadastrado.</div>}
      </div>

      {creating && (
        <SupervisorDialog
          title="Novo supervisor"
          stores={stores}
          pending={pending}
          onClose={() => setCreating(false)}
          onSubmit={async (payload) => {
            const ok = await call("/admin/supervisores", { method: "POST", body: JSON.stringify(payload) });
            if (ok) setCreating(false);
          }}
        />
      )}

      {editing && (
        <SupervisorDialog
          title={`Editar ${editing.name}`}
          supervisor={editing}
          stores={stores}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            const ok = await call(`/admin/supervisores/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
            if (ok) setEditing(null);
          }}
        />
      )}
    </>
  );
}

function SupervisorDialog({
  title,
  supervisor,
  stores,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  supervisor?: Supervisor;
  stores: StoreOption[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const isEdit = Boolean(supervisor);
  const [formError, setFormError] = useState<string | null>(null);
  const [storeIds, setStoreIds] = useState<string[]>(supervisor?.stores.map((store) => store.id) ?? []);

  function toggleStore(id: string) {
    setStoreIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setFormError("Nome é obrigatório.");
      return;
    }

    if (storeIds.length === 0) {
      setFormError("Selecione ao menos uma loja: sem loja o supervisor não enxerga vendedor nenhum.");
      return;
    }

    const payload: Record<string, unknown> = { name, storeIds };
    const password = String(form.get("password") ?? "");

    if (!isEdit) {
      const email = String(form.get("email") ?? "").trim();
      if (!email) {
        setFormError("E-mail de acesso é obrigatório.");
        return;
      }
      if (!password) {
        setFormError("Informe a senha provisória.");
        return;
      }
      payload.email = email;
    }

    if (password) payload.password = password;

    onSubmit(payload);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="profile-modal dialog form-dialog" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{title}</h2>

        <label htmlFor="name">Nome</label>
        <input id="name" name="name" defaultValue={supervisor?.name} required />

        {!isEdit && (
          <>
            <label htmlFor="email">E-mail de acesso</label>
            <input id="email" name="email" type="email" autoComplete="off" required />
          </>
        )}

        <span className="field-label">Lojas</span>
        <div className="store-picker">
          {stores.map((store) => (
            <label key={store.id} className={`store-option ${storeIds.includes(store.id) ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={storeIds.includes(store.id)}
                onChange={() => toggleStore(store.id)}
              />
              <Store size={14} /> {store.name}
            </label>
          ))}
          {stores.length === 0 && <p className="field-hint">Cadastre uma loja antes de criar supervisores.</p>}
        </div>
        <p className="field-hint">O supervisor só enxerga a fila, os vendedores e os números das lojas marcadas.</p>

        <label htmlFor="password">
          <KeyRound size={13} /> {isEdit ? "Nova senha (deixe vazio para manter)" : "Senha provisória"}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required={!isEdit}
        />
        <p className="field-hint">
          A senha é provisória: no primeiro acesso o supervisor define a dele.
          {isEdit && " Redefinir aqui encerra as sessões abertas."}
        </p>

        {formError && <p className="login-error">{formError}</p>}

        <button className="primary-button full" type="submit" disabled={pending}>
          Salvar
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, PowerOff, Store, Users, X } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import { MAX_STORE_NAME } from "@/lib/store-rules";

export type AdminStore = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  _count: { sellers: number };
};

export function StoresAdmin({ initialStores }: { initialStores: AdminStore[] }) {
  const router = useRouter();
  const [stores, setStores] = useState(initialStores);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminStore | null>(null);
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

      const reloaded = await fetch(apiUrl("/admin/lojas"));
      if (reloaded.ok) setStores(await reloaded.json());

      // O seletor do topo é renderizado no servidor: sem isto ele só mostraria
      // a loja nova na próxima navegação.
      router.refresh();

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
          <h1>Lojas</h1>
          <p className="heading-subtitle">
            Cada loja tem a própria fila, os próprios vendedores e os próprios números. Supervisores enxergam
            apenas as lojas vinculadas a eles.
          </p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={17} /> Nova loja
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
        {stores.map((store) => (
          <div className={`admin-row ${store.active ? "" : "muted"}`} key={store.id}>
            <div className="seller-avatar store-avatar">
              <Store size={17} />
            </div>
            <div className="seller-info">
              <strong>{store.name}</strong>
              <span>
                <Users size={11} /> {store._count.sellers} vendedor(es)
              </span>
            </div>
            <span className={`admin-badge ${store.active ? "on" : "off"}`}>{store.active ? "Ativa" : "Inativa"}</span>
            <button className="row-action" title="Renomear" aria-label="Renomear" onClick={() => setEditing(store)}>
              <Pencil size={16} />
            </button>
            <button
              className="row-action"
              title={store.active ? "Desativar" : "Reativar"}
              aria-label={store.active ? "Desativar" : "Reativar"}
              disabled={pending}
              onClick={() =>
                void call(`/admin/lojas/${store.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ active: !store.active }),
                })
              }
            >
              {store.active ? <PowerOff size={16} /> : <Power size={16} />}
            </button>
          </div>
        ))}
        {stores.length === 0 && <div className="empty-state">Nenhuma loja cadastrada.</div>}
      </div>

      {creating && (
        <StoreDialog
          title="Nova loja"
          pending={pending}
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const ok = await call("/admin/lojas", { method: "POST", body: JSON.stringify({ name }) });
            if (ok) setCreating(false);
          }}
        />
      )}

      {editing && (
        <StoreDialog
          title={`Renomear ${editing.name}`}
          store={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={async (name) => {
            const ok = await call(`/admin/lojas/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
            if (ok) setEditing(null);
          }}
        />
      )}
    </>
  );
}

function StoreDialog({
  title,
  store,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  store?: AdminStore;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) {
      setFormError("Nome da loja é obrigatório.");
      return;
    }

    onSubmit(name);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="profile-modal dialog form-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{title}</h2>

        <label htmlFor="name">Nome</label>
        <input id="name" name="name" defaultValue={store?.name} maxLength={MAX_STORE_NAME} required />
        <p className="field-hint">É o nome que aparece no seletor do topo e na trilha de auditoria.</p>

        {formError && <p className="login-error">{formError}</p>}

        <button className="primary-button full" type="submit" disabled={pending}>
          Salvar
        </button>
      </form>
    </div>
  );
}

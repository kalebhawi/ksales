"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Store } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import type { StoreOption } from "@/lib/store-rules";
import { useAppLoading } from "./app-loading";

/**
 * Loja aberta na tela. Trocar aqui muda o que a visão geral, a fila e o
 * cadastro mostram — a escolha vai para o servidor, que é quem decide o que
 * cada pessoa pode ver, e a página é recarregada com os dados da nova loja.
 *
 * Quem tem uma loja só (vendedor, supervisor de uma unidade) vê um rótulo:
 * não há o que trocar, mas continua sabendo em que loja está.
 */
export function StoreSwitcher({
  stores,
  activeStoreId,
  canSwitch,
}: {
  stores: StoreOption[];
  activeStoreId: string | null;
  canSwitch: boolean;
}) {
  const { loading, reload, setLoading } = useAppLoading();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();

    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = stores.find((store) => store.id === activeStoreId) ?? null;

  async function select(storeId: string) {
    if (storeId === activeStoreId) {
      setOpen(false);
      return;
    }

    setPending(storeId);
    setError(false);
    // Liga o esqueleto já na ida: o cookie ainda nem foi gravado, mas a tela
    // precisa dizer que a troca começou.
    setLoading(true);

    try {
      const response = await fetch(apiUrl("/lojas/ativa"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      if (!response.ok) {
        setError(true);
        setLoading(false);
        return;
      }

      setOpen(false);
      // Recarrega os dados do servidor da rota atual. O esqueleto só sai quando
      // eles chegam — quem controla isso é a transição, dentro de `reload`.
      reload();
    } catch {
      setError(true);
      setLoading(false);
    } finally {
      setPending(null);
    }
  }

  if (!active) {
    return (
      <div className="workspace-switcher empty" title="Nenhuma loja vinculada à sua conta">
        <Store size={13} /> Sem loja
      </div>
    );
  }

  if (!canSwitch) {
    return (
      <div className="workspace-switcher">
        <span className="workspace-dot" /> {active.name}
      </div>
    );
  }

  return (
    <div className="store-switcher" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`workspace-switcher ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {loading ? <Loader2 className="store-spinner" size={13} /> : <span className="workspace-dot" />}
        <span className="store-name">{active.name}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="context-menu store-dropdown" role="menu">
          <p className="context-menu-title">
            Loja
            <span>{stores.length} disponíveis</span>
          </p>
          {stores.map((store) => (
            <button
              key={store.id}
              type="button"
              className={store.id === activeStoreId ? "current" : ""}
              disabled={pending !== null || loading}
              onClick={() => void select(store.id)}
            >
              <Store size={15} /> {store.name}
              {store.id === activeStoreId && <Check size={14} className="store-check" />}
            </button>
          ))}
          {error && <p className="store-error">Não foi possível trocar de loja.</p>}
        </div>
      )}
    </div>
  );
}

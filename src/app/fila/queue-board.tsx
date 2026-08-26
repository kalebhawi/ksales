"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import {
  ArrowDownUp,
  ChevronRight,
  CornerUpLeft,
  GripVertical,
  LogIn,
  MoonStar,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import type { SessionUser } from "@/lib/auth";
import { REMOVAL_REASONS, REMOVAL_REASON_LABELS, type RemovalReason } from "@/lib/queue";
import type { SellerView } from "@/lib/seller-view";

type ServiceAction = "SALE_CONVERTED" | "SALE_NOT_CONVERTED" | "EXCHANGE" | "OTHER";

const SERVICE_ACTIONS: { action: ServiceAction; label: string }[] = [
  { action: "SALE_CONVERTED", label: "Venda concluída" },
  { action: "SALE_NOT_CONVERTED", label: "Venda não convertida" },
  { action: "EXCHANGE", label: "Troca" },
  { action: "OTHER", label: "Outro" },
];

type MenuState = { seller: SellerView; x: number; y: number } | null;

type DialogState =
  | { kind: "remove"; seller: SellerView }
  | { kind: "service"; seller: SellerView; action: ServiceAction }
  | { kind: "reorder"; seller: SellerView; from: number; to: number; targetIndex: number }
  | { kind: "move"; seller: SellerView; from: number; total: number }
  | { kind: "start"; seller: SellerView; position: number; first: string }
  | null;

/** Coluna sob o cursor durante o arraste, só para o destaque visual. */
type DropTarget = "fila" | "atendimento" | null;

const LONG_PRESS_MS = 500;

/** Lista vazia por causa do filtro é diferente de lista vazia de verdade. */
function emptyRoster(search: string, whenEmpty: string) {
  return search.trim() ? "Nenhum vendedor com esse nome." : whenEmpty;
}

export function QueueBoard({
  user,
  today,
  initialSellers,
}: {
  user: SessionUser;
  today: string;
  initialSellers: SellerView[];
}) {
  const [sellers, setSellers] = useState(initialSellers);
  const [selected, setSelected] = useState<SellerView | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmEndShift, setConfirmEndShift] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  // Estado (e não só ref) porque o fantasma que segue o dedo é renderizado.
  const [touchDragging, setTouchDragging] = useState<SellerView | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(apiUrl("/sellers"));
    if (response.ok) setSellers(await response.json());
  }, []);

  const send = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setPending(true);
      setError(null);

      try {
        const response = await fetch(apiUrl(path), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setError(payload.error ?? "Não foi possível concluir a ação.");
          return false;
        }

        await refresh();
        return true;
      } catch {
        setError("Falha de conexão com o servidor.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  const runQueueOperation = useCallback(
    (id: string, operation: string, extra: Record<string, unknown> = {}) =>
      send("/sellers", { id, operation, ...extra }),
    [send],
  );

  const openMenu = useCallback((seller: SellerView, x: number, y: number) => {
    setMenu({ seller, x, y });
  }, []);

  const { handlers: pressHandlers, consumeSuppressedClick } = useLongPressMenu(openMenu);

  // Arraste HTML5 não existe em toque. No celular a alça do cartão inicia um
  // arraste próprio: o dedo move um fantasma e a coluna sob ele vira o alvo.
  const touchDrag = useRef<{ seller: SellerView; x: number; y: number } | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const dropApi = useRef<{ onQueue: (id: string, index: number) => void; onService: (id: string) => void; size: number }>({
    onQueue: () => {},
    onService: () => {},
    size: 0,
  });

  useEffect(() => {
    if (!menu && !columnMenu) return;

    const close = () => {
      setMenu(null);
      setColumnMenu(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();

    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, columnMenu]);

  const queued = useMemo(() => sellers.filter((seller) => seller.status === "fila"), [sellers]);
  const serving = useMemo(() => sellers.filter((seller) => seller.status === "atendimento"), [sellers]);

  const matchesSearch = useCallback(
    (seller: SellerView) => seller.name.toLowerCase().includes(search.trim().toLowerCase()),
    [search],
  );

  const offShift = useMemo(
    () => sellers.filter((seller) => seller.status === "fora" && matchesSearch(seller)),
    [sellers, matchesSearch],
  );

  function endDrag() {
    setDraggedId(null);
    setDropTarget(null);
  }

  function beginTouchDrag(seller: SellerView, x: number, y: number) {
    if (!seller.canManage) return;

    touchDrag.current = { seller, x, y };
    setDraggedId(seller.id);
    setTouchDragging(seller);
  }

  /**
   * Soltar sobre um card enfileira quem vinha de fora e, para quem já está na
   * fila, propõe a troca de posição. Mudar a ordem da fila mexe em quem atende
   * primeiro, então nunca acontece direto: passa pela confirmação.
   */
  function dropOnQueue(id: string, index: number) {
    const dragged = sellers.find((seller) => seller.id === id);
    if (!dragged) return;

    if (dragged.status !== "fila") {
      void runQueueOperation(id, "enqueue");
      return;
    }

    const from = queued.findIndex((seller) => seller.id === id) + 1;
    const to = Math.min(index + 1, queued.length);
    if (from === to) return;

    setDialog({ kind: "reorder", seller: dragged, from, to, targetIndex: index });
  }

  /**
   * Único caminho para iniciar um atendimento — clique, arraste ou menu passam
   * por aqui. Furar a fila é decisão consciente: quem não é o primeiro só entra
   * em atendimento depois de confirmar, com o nome de quem foi ultrapassado.
   */
  function startService(seller: SellerView) {
    const position = queued.findIndex((entry) => entry.id === seller.id) + 1;

    if (position > 1) {
      setDialog({ kind: "start", seller, position, first: queued[0]?.name ?? "" });
      return;
    }

    void runQueueOperation(seller.id, "start");
  }

  /** Soltar na coluna de atendimento inicia o atendimento, venha de que posição vier. */
  function dropOnService(id: string) {
    const dragged = sellers.find((seller) => seller.id === id);
    if (!dragged) return;

    if (dragged.status !== "fila") {
      setError("Só quem está na fila pode entrar em atendimento.");
      return;
    }

    startService(dragged);
  }

  // Handlers atuais para o efeito abaixo, que só depende do "está arrastando".
  useEffect(() => {
    dropApi.current = { onQueue: dropOnQueue, onService: dropOnService, size: queued.length };
  });

  useEffect(() => {
    if (!touchDragging) return;

    const slotAt = (x: number, y: number) => {
      const slot = document.elementFromPoint(x, y)?.closest("[data-drop]");
      if (!(slot instanceof HTMLElement)) return null;

      const index = slot.dataset.dropIndex;

      return { zone: slot.dataset.drop as Exclude<DropTarget, null>, index: index ? Number(index) : null };
    };

    const paint = (x: number, y: number) => {
      if (ghost.current) ghost.current.style.transform = `translate(${x}px, ${y}px)`;
    };

    const move = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      // Listener não passivo: sem isto a página rola junto com o dedo.
      event.preventDefault();
      paint(touch.clientX, touch.clientY);
      setDropTarget(slotAt(touch.clientX, touch.clientY)?.zone ?? null);
    };

    const finish = (event: globalThis.TouchEvent) => {
      const dragged = touchDrag.current;
      const touch = event.changedTouches[0];

      touchDrag.current = null;
      setTouchDragging(null);
      endDrag();

      if (!dragged || !touch) return;

      const slot = slotAt(touch.clientX, touch.clientY);
      if (!slot) return;

      if (slot.zone === "atendimento") dropApi.current.onService(dragged.seller.id);
      else dropApi.current.onQueue(dragged.seller.id, slot.index ?? dropApi.current.size);
    };

    if (touchDrag.current) paint(touchDrag.current.x, touchDrag.current.y);

    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", finish);
    document.addEventListener("touchcancel", finish);

    return () => {
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", finish);
    };
  }, [touchDragging]);

  function handleCardClick(seller: SellerView) {
    if (consumeSuppressedClick()) return;
    if (seller.status === "fila" && seller.canManage) {
      startService(seller);
      return;
    }
    setSelected(seller);
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{today.toUpperCase()}</p>
          <h1>
            Fila de vendedores <Sparkles className="heading-sparkle" size={19} aria-hidden="true" />
          </h1>
          <p className="heading-subtitle">
            {user.canSuperviseQueue
              ? "Organize o próximo atendimento da equipe."
              : "Você pode movimentar apenas o seu próprio cadastro."}
          </p>
        </div>
      </section>

      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      )}

      <section className="section-heading">
        <div>
          <h2>Atendimentos</h2>
          <p>Clique no cartão para iniciar. Arraste pela alça para mudar de posição ou levar para atendimento.</p>
        </div>
        {pending && <span className="pending-tag">Salvando...</span>}
      </section>

      <section className="queue-layout">
        <div
          className={`queue-column orange ${dropTarget === "fila" ? "drop-active" : ""}`}
          data-drop="fila"
          onDragOver={(event) => {
            if (!draggedId) return;
            event.preventDefault();
            setDropTarget("fila");
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={() => {
            const id = draggedId;
            endDrag();
            // Soltar no vazio da coluna manda para o fim da fila.
            if (id) dropOnQueue(id, queued.length);
          }}
        >
          <div className="queue-column-head">
            <div>
              <h3>
                Fila <span>{queued.length}</span>
              </h3>
              <p>Clique para iniciar atendimento</p>
            </div>
            {user.canSuperviseQueue && (
              <button
                className="column-menu-button"
                aria-label="Ações da fila"
                aria-haspopup="menu"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setColumnMenu({ x: rect.right, y: rect.bottom + 6 });
                }}
              >
                <MoreHorizontal size={19} />
              </button>
            )}
          </div>
          <div className="queue-cards">
            {queued.map((seller, index) => (
              <div
                key={seller.id}
                data-drop="fila"
                data-drop-index={index}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.stopPropagation();
                  const id = draggedId;
                  endDrag();
                  if (id) dropOnQueue(id, index);
                }}
              >
                <QueueCard
                  seller={seller}
                  position={index + 1}
                  onClick={() => handleCardClick(seller)}
                  onDragStart={seller.canManage ? () => setDraggedId(seller.id) : undefined}
                  onDragEnd={endDrag}
                  onTouchDragStart={seller.canManage ? (x, y) => beginTouchDrag(seller, x, y) : undefined}
                  pressHandlers={pressHandlers(seller)}
                />
              </div>
            ))}
            {queued.length === 0 && <div className="empty-state">Arraste um vendedor para cá</div>}
          </div>
        </div>

        <div
          className={`queue-column green ${dropTarget === "atendimento" ? "drop-active" : ""}`}
          data-drop="atendimento"
          onDragOver={(event) => {
            if (!draggedId) return;
            event.preventDefault();
            setDropTarget("atendimento");
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={() => {
            const id = draggedId;
            endDrag();
            if (id) dropOnService(id);
          }}
        >
          <div className="queue-column-head">
            <div>
              <h3>
                Em atendimento <span>{serving.length}</span>
              </h3>
              <p>{user.canSuperviseQueue ? "Arraste da fila para iniciar" : "Atendimentos em andamento"}</p>
            </div>
          </div>
          <div className="queue-cards">
            {serving.map((seller) => (
              <QueueCard
                key={seller.id}
                seller={seller}
                onClick={() => handleCardClick(seller)}
                pressHandlers={pressHandlers(seller)}
              />
            ))}
            {serving.length === 0 && <div className="empty-state">Nenhum atendimento em andamento</div>}
          </div>
        </div>
      </section>

      <section className="available-section">
        <div className="section-heading">
          <div>
            <h2>
              Fora do turno <span className="muted-count">{offShift.length}</span>
            </h2>
            <p>Intervalo, banheiro, dia encerrado ou cadastro que ainda não entrou na fila.</p>
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              placeholder="Buscar vendedor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="available-list">
          {offShift.map((seller) => (
            <SellerRow
              key={seller.id}
              seller={seller}
              muted
              onOpen={() => setSelected(seller)}
              onDragStart={() => setDraggedId(seller.id)}
              onDragEnd={endDrag}
              onTouchDragStart={(x, y) => beginTouchDrag(seller, x, y)}
              onQuickAction={() => void runQueueOperation(seller.id, "enqueue")}
              quickIcon={<CornerUpLeft size={17} />}
              quickLabel="Colocar na fila"
              pressHandlers={pressHandlers(seller)}
              consumeSuppressedClick={consumeSuppressedClick}
            />
          ))}
          {offShift.length === 0 && (
            <div className="empty-state">{emptyRoster(search, "Ninguém fora do turno.")}</div>
          )}
        </div>
      </section>

      {touchDragging && (
        <div className="drag-ghost" ref={ghost} aria-hidden="true">
          <Avatar seller={touchDragging} />
          <strong>{touchDragging.name}</strong>
        </div>
      )}

      {dialog?.kind === "start" && (
        <ConfirmDialog
          title="Chamar fora da ordem"
          pending={pending}
          confirmLabel="Iniciar mesmo assim"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const ok = await runQueueOperation(dialog.seller.id, "start");
            if (ok) setDialog(null);
          }}
        >
          <p>
            <strong>{dialog.seller.name}</strong> está na posição <strong>{dialog.position}</strong> da fila.
          </p>
          {dialog.first && (
            <p className="dialog-note">
              Quem está na vez é <strong>{dialog.first}</strong> e continua na fila.
            </p>
          )}
        </ConfirmDialog>
      )}

      {columnMenu && (
        <div
          className="context-menu"
          style={{ left: Math.max(8, columnMenu.x - 216), top: columnMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <p className="context-menu-title">Fila</p>
          <button
            disabled={queued.length === 0 || pending}
            onClick={() => {
              setColumnMenu(null);
              void runQueueOperation("", "start_next");
            }}
          >
            <Play size={15} /> Chamar o próximo
          </button>
          <button
            disabled={queued.length === 0 || pending}
            onClick={() => {
              setColumnMenu(null);
              setConfirmEndShift(true);
            }}
          >
            <MoonStar size={15} /> Encerrar o dia de todos...
          </button>
        </div>
      )}

      {confirmEndShift && (
        <ConfirmDialog
          title="Encerrar o dia de todos"
          pending={pending}
          onClose={() => setConfirmEndShift(false)}
          onConfirm={async () => {
            const ok = await runQueueOperation("", "end_shift_all");
            if (ok) setConfirmEndShift(false);
          }}
        >
          <p>
            {queued.length === 1
              ? "1 vendedor sai da fila"
              : `${queued.length} vendedores saem da fila`}{" "}
            com o motivo <strong>encerrar dia</strong>, registrado no histórico.
          </p>
          {serving.length > 0 && (
            <p className="dialog-note">
              {serving.length === 1 ? "1 atendimento em andamento continua" : `${serving.length} atendimentos em andamento continuam`}{" "}
              — cada um precisa do próprio desfecho.
            </p>
          )}
        </ConfirmDialog>
      )}

      {menu && (
        <ContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          onProfile={() => setSelected(menu.seller)}
          onEnqueue={() => void runQueueOperation(menu.seller.id, "enqueue")}
          onStart={() => startService(menu.seller)}
          onMove={() =>
            setDialog({
              kind: "move",
              seller: menu.seller,
              from: queued.findIndex((entry) => entry.id === menu.seller.id) + 1,
              total: queued.length,
            })
          }
          onRemove={() => setDialog({ kind: "remove", seller: menu.seller })}
          onServiceAction={(action) =>
            action === "OTHER"
              ? setDialog({ kind: "service", seller: menu.seller, action })
              : void send("/atendimentos", { sellerId: menu.seller.id, action })
          }
        />
      )}

      {dialog?.kind === "reorder" && (
        <ConfirmDialog
          title="Mudar posição na fila"
          pending={pending}
          confirmLabel="Mover"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const ok = await runQueueOperation(dialog.seller.id, "reorder", { targetIndex: dialog.targetIndex });
            if (ok) setDialog(null);
          }}
        >
          <p>
            <strong>{dialog.seller.name}</strong> sai da posição <strong>{dialog.from}</strong> e passa para a{" "}
            <strong>{dialog.to}</strong>.
          </p>
          <p className="dialog-note">
            {dialog.to < dialog.from
              ? `Quem está entre a ${dialog.to} e a ${dialog.from - 1} desce uma posição.`
              : `Quem está entre a ${dialog.from + 1} e a ${dialog.to} sobe uma posição.`}
          </p>
        </ConfirmDialog>
      )}

      {dialog?.kind === "move" && (
        <MoveDialog
          seller={dialog.seller}
          from={dialog.from}
          total={dialog.total}
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={async (position) => {
            const ok = await runQueueOperation(dialog.seller.id, "reorder", { targetIndex: position - 1 });
            if (ok) setDialog(null);
          }}
        />
      )}

      {dialog?.kind === "remove" && (
        <RemoveDialog
          seller={dialog.seller}
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={async (reason, notes) => {
            const ok = await runQueueOperation(dialog.seller.id, "remove", { reason, notes });
            if (ok) setDialog(null);
          }}
        />
      )}

      {dialog?.kind === "service" && (
        <NotesDialog
          title="Descreva o desfecho"
          seller={dialog.seller}
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={async (notes) => {
            const ok = await send("/atendimentos", { sellerId: dialog.seller.id, action: dialog.action, notes });
            if (ok) setDialog(null);
          }}
        />
      )}

      {selected && (
        <ProfileModal
          seller={sellers.find((entry) => entry.id === selected.id) ?? selected}
          pending={pending}
          onClose={() => setSelected(null)}
          onEnqueue={async (id) => {
            const ok = await runQueueOperation(id, "enqueue");
            if (ok) setSelected(null);
          }}
          onServiceAction={async (id, action) => {
            const seller = sellers.find((entry) => entry.id === id);
            if (action === "OTHER" && seller) {
              setSelected(null);
              setDialog({ kind: "service", seller, action });
              return;
            }
            const ok = await send("/atendimentos", { sellerId: id, action });
            if (ok) setSelected(null);
          }}
          onRemove={(id) => {
            const seller = sellers.find((entry) => entry.id === id);
            if (!seller) return;
            setSelected(null);
            setDialog({ kind: "remove", seller });
          }}
        />
      )}
    </>
  );
}

function useLongPressMenu(open: (seller: SellerView, x: number, y: number) => void) {
  const timer = useRef<number | null>(null);
  const suppress = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const handlers = useCallback(
    (seller: SellerView) => ({
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        open(seller, event.clientX, event.clientY);
      },
      onTouchStart: (event: TouchEvent) => {
        const touch = event.touches[0];
        if (!touch) return;

        const { clientX, clientY } = touch;
        clear();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          suppress.current = true;
          open(seller, clientX, clientY);
        }, LONG_PRESS_MS);
      },
      onTouchMove: clear,
      onTouchEnd: (event: TouchEvent) => {
        clear();
        if (!suppress.current) return;

        // Sem isto o navegador sintetiza um clique ao soltar o dedo, que
        // fecharia o menu recém-aberto antes de o usuário conseguir escolher.
        event.preventDefault();
        window.setTimeout(() => {
          suppress.current = false;
        }, LONG_PRESS_MS);
      },
      onTouchCancel: clear,
    }),
    [clear, open],
  );

  const consumeSuppressedClick = useCallback(() => {
    if (!suppress.current) return false;
    suppress.current = false;
    return true;
  }, []);

  return { handlers, consumeSuppressedClick };
}

type PressHandlers = ReturnType<ReturnType<typeof useLongPressMenu>["handlers"]>;

function Avatar({ seller, large = false }: { seller: SellerView; large?: boolean }) {
  const className = `seller-avatar ${seller.tone} ${large ? "large" : ""}`;

  // Sem next/image de propósito: a foto vem de uma rota que exige sessão, e o
  // otimizador do Next busca a URL a partir do servidor, sem o cookie — levaria
  // 401. A imagem também é servida no tamanho final (no máximo 68px).
  if (seller.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`${className} photo`} src={seller.photoUrl} alt="" loading="lazy" />;
  }

  return <div className={className}>{seller.initials}</div>;
}

/**
 * Alça de arraste. No desktop o arraste nativo já funciona no cartão inteiro;
 * no celular é daqui que ele começa — `touch-action: none` no CSS impede a
 * página de rolar quando o dedo encosta justamente aqui.
 */
function DragHandle({ enabled, onStart }: { enabled: boolean; onStart: (x: number, y: number) => void }) {
  if (!enabled) return <span className="drag-handle placeholder" aria-hidden="true" />;

  return (
    <span
      className="drag-handle"
      aria-label="Arrastar"
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;

        // Sem isto o toque longo do cartão também dispararia, abrindo o menu.
        event.stopPropagation();
        onStart(touch.clientX, touch.clientY);
      }}
    >
      <GripVertical size={18} />
    </span>
  );
}

function QueueCard({
  seller,
  position,
  onClick,
  onDragStart,
  onDragEnd,
  onTouchDragStart,
  pressHandlers,
}: {
  seller: SellerView;
  position?: number;
  onClick: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onTouchDragStart?: (x: number, y: number) => void;
  pressHandlers: PressHandlers;
}) {
  return (
    <button
      className="queue-card"
      type="button"
      onClick={onClick}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...pressHandlers}
    >
      {onTouchDragStart && <DragHandle enabled onStart={onTouchDragStart} />}
      {position !== undefined && <span className="queue-position">{position}</span>}
      <Avatar seller={seller} />
      <span className="queue-card-info">
        <strong>{seller.name}</strong>
        <small>
          <span className="status-dot" /> {seller.time ?? "—"}
        </small>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}

function SellerRow({
  seller,
  muted = false,
  onOpen,
  onDragStart,
  onDragEnd,
  onTouchDragStart,
  onQuickAction,
  quickIcon,
  quickLabel,
  pressHandlers,
  consumeSuppressedClick,
}: {
  seller: SellerView;
  muted?: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onTouchDragStart: (x: number, y: number) => void;
  onQuickAction: () => void;
  quickIcon: React.ReactNode;
  quickLabel: string;
  pressHandlers: PressHandlers;
  consumeSuppressedClick: () => boolean;
}) {
  return (
    <div
      className={`available-row ${muted ? "muted" : ""}`}
      draggable={seller.canManage}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => !consumeSuppressedClick() && onOpen()}
      {...pressHandlers}
    >
      <DragHandle enabled={seller.canManage} onStart={onTouchDragStart} />
      <Avatar seller={seller} />
      <div className="seller-info">
        <strong>{seller.name}</strong>
        <span>
          {/* Em coluna estreita os números saem e sobra o motivo, que é o que importa ali. */}
          <span className="seller-figures">
            {seller.calls} atendimentos <b>·</b> {seller.conversion} conversão
          </span>
          {seller.offShiftReason && (
            <>
              <b className="figures-sep">·</b> {seller.offShiftReason}
            </>
          )}
        </span>
      </div>
      <button
        className="row-action"
        title={quickLabel}
        aria-label={quickLabel}
        disabled={!seller.canManage}
        onClick={(event) => {
          event.stopPropagation();
          onQuickAction();
        }}
      >
        {quickIcon}
      </button>
    </div>
  );
}

function ContextMenu({
  state,
  onClose,
  onProfile,
  onEnqueue,
  onStart,
  onMove,
  onRemove,
  onServiceAction,
}: {
  state: NonNullable<MenuState>;
  onClose: () => void;
  onProfile: () => void;
  onEnqueue: () => void;
  onStart: () => void;
  onMove: () => void;
  onRemove: () => void;
  onServiceAction: (action: ServiceAction) => void;
}) {
  const { seller } = state;
  const disabled = !seller.canManage;

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      className="context-menu"
      style={{ left: Math.min(state.x, typeof window === "undefined" ? state.x : window.innerWidth - 230), top: state.y }}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      <p className="context-menu-title">{seller.name}</p>

      {seller.status === "fora" && (
        <button disabled={disabled} onClick={run(onEnqueue)}>
          <LogIn size={15} /> Colocar na fila
        </button>
      )}

      {seller.status === "fila" && (
        <>
          <button disabled={disabled} onClick={run(onStart)}>
            <Play size={15} /> Iniciar atendimento
          </button>
          <button disabled={disabled} onClick={run(onMove)}>
            <ArrowDownUp size={15} /> Mudar posição...
          </button>
          <button disabled={disabled} onClick={run(onRemove)}>
            <X size={15} /> Sair da fila...
          </button>
        </>
      )}

      {seller.status === "atendimento" &&
        SERVICE_ACTIONS.map(({ action, label }) => (
          <button key={action} disabled={disabled} onClick={run(() => onServiceAction(action))}>
            <ShoppingBag size={15} /> {label}
            {action === "OTHER" ? "..." : ""}
          </button>
        ))}

      <button onClick={run(onProfile)}>
        <User size={15} /> Ver perfil
      </button>

      {disabled && <p className="context-menu-hint">Você só pode movimentar o seu próprio cadastro.</p>}
    </div>
  );
}

function ConfirmDialog({
  title,
  pending,
  confirmLabel = "Confirmar",
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  pending: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-modal dialog" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{title}</h2>
        {children}
        <button className="primary-button full" type="button" disabled={pending} onClick={onConfirm}>
          {pending ? "Salvando..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Arraste HTML5 não existe em toque, então o mesmo reposicionamento também sai
 * pelo menu: escolher o número da posição.
 */
function MoveDialog({
  seller,
  from,
  total,
  pending,
  onClose,
  onConfirm,
}: {
  seller: SellerView;
  from: number;
  total: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: (position: number) => void;
}) {
  const [position, setPosition] = useState(String(from));
  const parsed = Number(position);
  const invalid = !Number.isInteger(parsed) || parsed < 1 || parsed > total || parsed === from;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="profile-modal dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) onConfirm(parsed);
        }}
      >
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>Mudar posição na fila</h2>
        <p>
          <strong>{seller.name}</strong> está na posição <strong>{from}</strong> de {total}.
        </p>
        <label className="move-field">
          Nova posição
          <input
            type="number"
            min={1}
            max={total}
            inputMode="numeric"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          />
        </label>
        <button className="primary-button full" type="submit" disabled={invalid || pending}>
          {pending ? "Salvando..." : "Mover"}
        </button>
      </form>
    </div>
  );
}

function RemoveDialog({
  seller,
  pending,
  onClose,
  onConfirm,
}: {
  seller: SellerView;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: RemovalReason, notes: string) => void;
}) {
  const [reason, setReason] = useState<RemovalReason>("intervalo");
  const [notes, setNotes] = useState("");
  const invalid = reason === "outro" && notes.trim().length === 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="profile-modal dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) onConfirm(reason, notes.trim());
        }}
      >
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>Sair da fila</h2>
        <p>
          Selecione o motivo da saída de <strong>{seller.name}</strong>.
        </p>
        <div className="reason-list">
          {REMOVAL_REASONS.map((option) => (
            <label key={option} className={reason === option ? "selected" : ""}>
              <input
                type="radio"
                name="reason"
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
              />
              {REMOVAL_REASON_LABELS[option]}
            </label>
          ))}
        </div>
        {reason === "outro" && (
          <textarea
            placeholder="Descreva o motivo"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        )}
        <button className="primary-button full" type="submit" disabled={invalid || pending}>
          Confirmar saída
        </button>
      </form>
    </div>
  );
}

function NotesDialog({
  title,
  seller,
  pending,
  onClose,
  onConfirm,
}: {
  title: string;
  seller: SellerView;
  pending: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="profile-modal dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (notes.trim()) onConfirm(notes.trim());
        }}
      >
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{title}</h2>
        <p>
          Atendimento de <strong>{seller.name}</strong>.
        </p>
        <textarea
          placeholder="O que aconteceu neste atendimento?"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
        />
        <button className="primary-button full" type="submit" disabled={notes.trim().length === 0 || pending}>
          Concluir atendimento
        </button>
      </form>
    </div>
  );
}

function ProfileModal({
  seller,
  pending,
  onClose,
  onEnqueue,
  onServiceAction,
  onRemove,
}: {
  seller: SellerView;
  pending: boolean;
  onClose: () => void;
  onEnqueue: (id: string) => void;
  onServiceAction: (id: string, action: ServiceAction) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <Avatar seller={seller} large />
        <h2>{seller.name}</h2>
        <span className="profile-role">
          Crachá {seller.badgeNumber} · nível {seller.level}
        </span>
        <p>{seller.description || "Sem descrição cadastrada."}</p>
        <div className="profile-stats">
          <div>
            <strong>{seller.calls}</strong>
            <span>atendimentos</span>
          </div>
          <div>
            <strong>{seller.sales}</strong>
            <span>vendas</span>
          </div>
          <div>
            <strong>{seller.conversion}</strong>
            <span>conversão</span>
          </div>
        </div>

        {!seller.canManage && <p className="profile-hint">Somente o administrador pode movimentar este vendedor.</p>}

        {seller.canManage && seller.status === "atendimento" && (
          <div className="service-actions">
            <strong>Finalizar atendimento</strong>
            {SERVICE_ACTIONS.map(({ action, label }) => (
              <button key={action} disabled={pending} onClick={() => onServiceAction(seller.id, action)}>
                <ShoppingBag size={16} /> {label}
              </button>
            ))}
          </div>
        )}

        {seller.canManage && seller.status === "fila" && (
          <button className="primary-button full" disabled={pending} onClick={() => onRemove(seller.id)}>
            <X size={17} /> Sair da fila
          </button>
        )}

        {seller.canManage && seller.status === "fora" && (
          <button className="primary-button full" disabled={pending} onClick={() => onEnqueue(seller.id)}>
            <Plus size={17} /> Colocar na fila
          </button>
        )}
      </div>
    </div>
  );
}

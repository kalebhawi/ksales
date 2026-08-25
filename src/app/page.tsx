"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock3,
  GripVertical,
  LayoutDashboard,
  MoreHorizontal,
  MoveRight,
  PhoneCall,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";

type Seller = {
  id: number;
  name: string;
  initials: string;
  tone: string;
  status: "fila" | "atendimento" | "disponivel";
  time?: string;
  calls: number;
  sales: number;
  conversion: string;
  description: string;
};

const initialSellers: Seller[] = [
  { id: 1, name: "Marina Costa", initials: "MC", tone: "coral", status: "fila", time: "08:42", calls: 31, sales: 8, conversion: "25,8%", description: "Especialista em planos empresariais e relacionamento." },
  { id: 2, name: "Rafael Martins", initials: "RM", tone: "blue", status: "fila", time: "08:47", calls: 28, sales: 7, conversion: "25,0%", description: "Atendimento consultivo para clientes recorrentes." },
  { id: 3, name: "Beatriz Nunes", initials: "BN", tone: "yellow", status: "atendimento", time: "09:03", calls: 24, sales: 9, conversion: "37,5%", description: "Focada em conversão e primeira experiência do cliente." },
  { id: 4, name: "João Pedro", initials: "JP", tone: "green", status: "atendimento", time: "09:11", calls: 22, sales: 6, conversion: "27,3%", description: "Especialista em suporte e vendas de upgrade." },
  { id: 5, name: "Camila Rocha", initials: "CR", tone: "purple", status: "disponivel", calls: 19, sales: 5, conversion: "26,3%", description: "Atendimento ágil para clientes digitais." },
  { id: 6, name: "Lucas Almeida", initials: "LA", tone: "orange", status: "disponivel", calls: 17, sales: 4, conversion: "23,5%", description: "Boa performance em produtos de entrada." },
  { id: 7, name: "Sofia Mendes", initials: "SM", tone: "pink", status: "disponivel", calls: 15, sales: 4, conversion: "26,7%", description: "Atendimento humanizado e carteira premium." },
];

const navItems = [
  { label: "Visão geral", icon: LayoutDashboard, active: true },
  { label: "Fila de vendedores", icon: Users },
  { label: "Relatórios", icon: BarChart3 },
];

export default function Home() {
  const [sellers, setSellers] = useState(initialSellers);
  const [selected, setSelected] = useState<Seller | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  function moveToQueue(id: number) {
    setSellers((current) => current.map((seller) => seller.id === id ? { ...seller, status: "fila", time: "agora" } : seller));
  }

  function startService(id: number) {
    setSellers((current) => current.map((seller) => seller.id === id ? { ...seller, status: "atendimento", time: "agora" } : seller));
  }

  const queued = sellers.filter((seller) => seller.status === "fila");
  const serving = sellers.filter((seller) => seller.status === "atendimento");
  const available = sellers.filter((seller) => seller.status === "disponivel");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">k</span><span>kalebhawi</span></div>
        <div className="workspace-switcher"><span className="workspace-dot" /> Operação comercial <ChevronDown size={14} /></div>
        <nav className="main-nav">
          <p className="nav-label">Workspace</p>
          {navItems.map(({ label, icon: Icon, active }) => <button className={`nav-item ${active ? "active" : ""}`} key={label}><Icon size={18} /> {label}{label === "Fila de vendedores" && <span className="nav-count">{queued.length}</span>}</button>)}
          <p className="nav-label nav-label-spaced">Gerenciar</p>
          <button className="nav-item"><Settings size={18} /> Configurações</button>
        </nav>
        <div className="sidebar-footer"><div className="mini-avatar coral">AD</div><div><strong>Admin</strong><span>Administrador</span></div><MoreHorizontal size={18} /></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={15} /><strong>Visão geral</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notificações"><Bell size={18} /><i /></button><div className="top-profile"><div className="mini-avatar blue">AD</div><ChevronDown size={15} /></div></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><p className="eyebrow">TERÇA, 25 DE AGOSTO DE 2026</p><h1>Bom dia, Admin <span>✦</span></h1><p className="heading-subtitle">Acompanhe o ritmo da sua operação em tempo real.</p></div><button className="primary-button"><Plus size={17} /> Adicionar vendedor</button></section>

          <section className="metric-grid">
            <MetricCard label="Vendas convertidas" value="38" change="12,5%" detail="vs. ontem" positive icon={<ShoppingBag size={19} />} />
            <MetricCard label="Taxa de conversão" value="28,4%" change="4,2%" detail="vs. ontem" positive icon={<BarChart3 size={19} />} />
            <MetricCard label="Atendimentos hoje" value="134" change="8,1%" detail="vs. ontem" positive icon={<PhoneCall size={19} />} />
            <MetricCard label="Em atendimento" value={String(serving.length)} change="agora" detail="vendedores ativos" icon={<Clock3 size={19} />} />
          </section>

          <section className="section-heading"><div><h2>Fila de vendedores</h2><p>Organize o próximo atendimento da equipe.</p></div><button className="filter-button"><SlidersHorizontal size={16} /> Filtrar</button></section>
          <section className="queue-layout">
            <QueueColumn title="Fila" count={queued.length} accent="orange" hint="Clique para iniciar atendimento" sellers={queued} onClick={startService} onDrop={() => draggedId !== null && moveToQueue(draggedId)} onDragStart={setDraggedId} />
            <QueueColumn title="Em atendimento" count={serving.length} accent="green" hint="Atendimentos em andamento" sellers={serving} onClick={(id) => setSelected(sellers.find((seller) => seller.id === id) ?? null)} onDragStart={setDraggedId} />
          </section>

          <section className="available-section"><div className="section-heading"><div><h2>Disponíveis <span className="muted-count">{available.length}</span></h2><p>Arraste um vendedor para a fila para começar.</p></div><div className="search-field"><Search size={16} /><input placeholder="Buscar vendedor" /></div></div><div className="available-list">{available.map((seller) => <div className="available-row" key={seller.id} draggable onDragStart={() => setDraggedId(seller.id)} onClick={() => setSelected(seller)}><GripVertical size={18} className="drag-handle" /><Avatar seller={seller} /><div className="seller-info"><strong>{seller.name}</strong><span>{seller.calls} atendimentos <b>·</b> {seller.conversion} conversão</span></div><button className="row-action" onClick={(event) => { event.stopPropagation(); moveToQueue(seller.id); }}><MoveRight size={17} /></button></div>)}</div></section>
        </div>
      </main>
      {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="profile-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}><X size={18} /></button><Avatar seller={selected} large /><h2>{selected.name}</h2><span className="profile-role">Vendedor · ativo hoje</span><p>{selected.description}</p><div className="profile-stats"><div><strong>{selected.calls}</strong><span>atendimentos</span></div><div><strong>{selected.sales}</strong><span>vendas</span></div><div><strong>{selected.conversion}</strong><span>conversão</span></div></div><button className="primary-button full" onClick={() => { moveToQueue(selected.id); setSelected(null); }}><Plus size={17} /> Colocar na fila</button></div></div>}
    </div>
  );
}

function MetricCard({ label, value, change, detail, positive, icon }: { label: string; value: string; change: string; detail: string; positive?: boolean; icon: React.ReactNode }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><div className="metric-bottom"><span className={positive ? "positive" : "neutral"}>{positive && <ArrowUpRight size={14} />}{change}</span><span>{detail}</span></div></div>;
}

function Avatar({ seller, large = false }: { seller: Seller; large?: boolean }) {
  return <div className={`seller-avatar ${seller.tone} ${large ? "large" : ""}`}>{seller.initials}</div>;
}

function QueueColumn({ title, count, accent, hint, sellers, onClick, onDrop, onDragStart }: { title: string; count: number; accent: string; hint: string; sellers: Seller[]; onClick: (id: number) => void; onDrop?: () => void; onDragStart: (id: number) => void }) {
  return <div className={`queue-column ${accent}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><div className="queue-column-head"><div><h3>{title} <span>{count}</span></h3><p>{hint}</p></div><MoreHorizontal size={19} /></div><div className="queue-cards">{sellers.map((seller) => <button className="queue-card" key={seller.id} onClick={() => onClick(seller.id)} draggable onDragStart={() => onDragStart(seller.id)}><Avatar seller={seller} /><span className="queue-card-info"><strong>{seller.name}</strong><small><span className="status-dot" /> {seller.time}</small></span><ChevronRight size={17} /></button>)}{sellers.length === 0 && <div className="empty-state">Arraste um vendedor para cá</div>}</div></div>;
}

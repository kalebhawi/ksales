import { ArrowUpRight, BarChart3, Clock3, PhoneCall, ShoppingBag, Sparkles } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import type { DashboardMetrics } from "@/lib/dashboard-data";
import { formatChange, formatPercent } from "@/lib/format";
import type { ResolvedPeriod } from "@/lib/period";
import type { SellerView } from "@/lib/seller-view";
import { PeriodFilter } from "./period-filter";

/**
 * Visão geral: tela de supervisão. Não tem interação — quem movimenta a fila é
 * a tela de fila —, então fica como Server Component.
 */
export function Dashboard({
  user,
  today,
  todayYmd,
  period,
  periodError,
  metrics,
  sellers,
}: {
  user: SessionUser;
  today: string;
  todayYmd: string;
  period: ResolvedPeriod;
  periodError: string | null;
  metrics: DashboardMetrics;
  sellers: SellerView[];
}) {
  const salesChange = formatChange(metrics.salesChange);
  const conversionChange = formatChange(metrics.conversionChange);
  const callsChange = formatChange(metrics.callsChange);

  const serving = sellers.filter((seller) => seller.status === "atendimento");
  const ranking = sellers
    .filter((seller) => seller.calls > 0)
    .sort((a, b) => b.sales - a.sales || b.calls - a.calls || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{today.toUpperCase()}</p>
          <h1>
            Olá, {user.name.split(" ")[0]} <Sparkles className="heading-sparkle" size={19} aria-hidden="true" />
          </h1>
          <p className="heading-subtitle">Acompanhe o ritmo da sua operação em tempo real.</p>
        </div>
        <PeriodFilter spec={period.spec} label={period.label} todayYmd={todayYmd} error={periodError} />
      </section>

      <section className="metric-grid">
        <MetricCard
          label="Vendas convertidas"
          value={String(metrics.sales)}
          change={salesChange.label}
          tone={salesChange.tone}
          detail={period.comparison}
          icon={<ShoppingBag size={19} />}
        />
        <MetricCard
          label="Taxa de conversão"
          value={formatPercent(metrics.conversion)}
          change={conversionChange.label}
          tone={conversionChange.tone}
          detail={period.comparison}
          icon={<BarChart3 size={19} />}
        />
        <MetricCard
          label="Atendimentos"
          value={String(metrics.calls)}
          change={callsChange.label}
          tone={callsChange.tone}
          detail={period.comparison}
          icon={<PhoneCall size={19} />}
        />
        <MetricCard
          label="Em atendimento"
          value={String(metrics.inService)}
          change="agora"
          tone="neutral"
          detail={`${metrics.queued} na fila`}
          icon={<Clock3 size={19} />}
        />
      </section>

      <section className="section-heading">
        <div>
          <h2>Em atendimento agora</h2>
          <p>Quem está com cliente neste momento.</p>
        </div>
      </section>
      <div className="available-list">
        {serving.map((seller) => (
          <div className="available-row" key={seller.id}>
            <Avatar seller={seller} />
            <div className="seller-info">
              <strong>{seller.name}</strong>
              <span>desde {seller.time ?? "—"}</span>
            </div>
          </div>
        ))}
        {serving.length === 0 && <div className="empty-state">Nenhum atendimento em andamento.</div>}
      </div>

      <section className="section-heading off-shift-heading">
        <div>
          <h2>Desempenho · {period.label.toLowerCase()}</h2>
          <p>Ordenado por vendas convertidas.</p>
        </div>
      </section>
      <div className="available-list">
        {ranking.map((seller, index) => (
          <div className="available-row" key={seller.id}>
            <span className="queue-position">{index + 1}</span>
            <Avatar seller={seller} />
            <div className="seller-info">
              <strong>{seller.name}</strong>
              <span>
                {seller.calls} atendimentos <b>·</b> {seller.sales} vendas <b>·</b> {seller.conversion} conversão
              </span>
            </div>
          </div>
        ))}
        {ranking.length === 0 && (
          <div className="empty-state">Nenhum atendimento registrado em {period.label.toLowerCase()}.</div>
        )}
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  change,
  tone,
  detail,
  icon,
}: {
  label: string;
  value: string;
  change: string;
  tone: "positive" | "negative" | "neutral";
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span className={tone}>
          {tone === "positive" && <ArrowUpRight size={14} />}
          {change}
        </span>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function Avatar({ seller }: { seller: SellerView }) {
  if (seller.photoUrl) {
    // Mesmo motivo do queue-board: a foto vem de rota autenticada, que o
    // otimizador do next/image buscaria sem o cookie.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`seller-avatar ${seller.tone} photo`} src={seller.photoUrl} alt="" loading="lazy" />;
  }

  return <div className={`seller-avatar ${seller.tone}`}>{seller.initials}</div>;
}

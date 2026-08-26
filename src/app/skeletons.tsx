/**
 * Placeholders de carregamento.
 *
 * Cada esqueleto imita a forma da tela que vai substituir — mesma grade, mesma
 * quantidade de cartões, mesma altura de linha. É o que evita o pulo de layout
 * quando o conteúdo real chega no lugar dele.
 */
export function SkeletonLine({ width = "100%", height = 12 }: { width?: string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} />;
}

export function MetricsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <section className="metric-grid">
      {Array.from({ length: cards }, (_, index) => (
        <div className="metric-card" key={index}>
          <SkeletonLine width="52%" height={11} />
          <SkeletonLine width="38%" height={28} />
          <SkeletonLine width="64%" height={10} />
        </div>
      ))}
    </section>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="queue-cards">
      {Array.from({ length: count }, (_, index) => (
        <div className="queue-card skeleton-card" key={index}>
          <span className="skeleton skeleton-avatar" />
          <div className="queue-card-info">
            <SkeletonLine width="62%" height={11} />
            <SkeletonLine width="40%" height={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QueueSkeleton() {
  return (
    <>
      <section className="page-heading">
        <div>
          <SkeletonLine width="110px" height={10} />
          <SkeletonLine width="240px" height={26} />
          <SkeletonLine width="320px" height={11} />
        </div>
      </section>

      <div className="queue-layout">
        <div className="queue-column">
          <div className="queue-column-head">
            <SkeletonLine width="45%" height={13} />
          </div>
          <CardsSkeleton count={3} />
        </div>
        <div className="queue-column green">
          <div className="queue-column-head">
            <SkeletonLine width="45%" height={13} />
          </div>
          <CardsSkeleton count={2} />
        </div>
      </div>

      <RowsSkeleton rows={4} />
    </>
  );
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="admin-table skeleton-rows">
      {Array.from({ length: rows }, (_, index) => (
        <div className="admin-row" key={index}>
          <span className="skeleton skeleton-avatar large" />
          <div className="seller-info">
            <SkeletonLine width="34%" height={12} />
            <SkeletonLine width="22%" height={10} />
          </div>
          <SkeletonLine width="70px" height={20} />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      <section className="page-heading">
        <div>
          <SkeletonLine width="130px" height={10} />
          <SkeletonLine width="260px" height={28} />
          <SkeletonLine width="340px" height={11} />
        </div>
      </section>
      <MetricsSkeleton />
      <RowsSkeleton rows={5} />
    </>
  );
}

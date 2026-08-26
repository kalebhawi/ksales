"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, X } from "lucide-react";
import {
  PERIOD_PRESETS,
  monthSpecFrom,
  monthValueOf,
  periodQuery,
  type PeriodSpec,
} from "@/lib/period";

type CustomMode = "dia" | "intervalo" | "mes";

const CUSTOM_MODES: { mode: CustomMode; label: string }[] = [
  { mode: "dia", label: "Dia" },
  { mode: "intervalo", label: "Intervalo" },
  { mode: "mes", label: "Mês" },
];

/**
 * Os atalhos são links de verdade: cada período tem URL própria, dá para
 * favoritar e mandar no WhatsApp. Só o formulário precisa de estado.
 */
export function PeriodFilter({
  spec,
  label,
  todayYmd,
  error,
}: {
  spec: PeriodSpec;
  label: string;
  todayYmd: string;
  error: string | null;
}) {
  const router = useRouter();
  const custom = spec.kind === "dia" || spec.kind === "intervalo" || spec.kind === "mes";

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CustomMode>(custom ? spec.kind : "dia");
  const [day, setDay] = useState(spec.kind === "dia" ? spec.date : todayYmd);
  const [from, setFrom] = useState(spec.kind === "intervalo" ? spec.from : todayYmd);
  const [to, setTo] = useState(spec.kind === "intervalo" ? spec.to : todayYmd);
  const [month, setMonth] = useState(monthValueOf(spec, todayYmd));

  function apply(event: FormEvent) {
    event.preventDefault();

    const next =
      mode === "dia"
        ? ({ kind: "dia", date: day } as PeriodSpec)
        : mode === "intervalo"
          ? ({ kind: "intervalo", from, to } as PeriodSpec)
          : monthSpecFrom(month);

    if (!next) return;

    setOpen(false);
    router.push(`/${periodQuery(next)}`);
  }

  return (
    <div className="period-filter">
      <div className="period-presets">
        {PERIOD_PRESETS.map((preset) => (
          <Link
            key={preset.kind}
            className={`period-chip ${spec.kind === preset.kind ? "active" : ""}`}
            href={`/${periodQuery({ kind: preset.kind } as PeriodSpec)}`}
          >
            {preset.label}
          </Link>
        ))}

        <button
          type="button"
          className={`period-chip ${custom ? "active" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <CalendarRange size={14} />
          {custom ? label : "Escolher..."}
        </button>
      </div>

      {open && (
        <form className="period-panel" onSubmit={apply}>
          <div className="period-modes">
            {CUSTOM_MODES.map((option) => (
              <button
                key={option.mode}
                type="button"
                className={mode === option.mode ? "active" : ""}
                onClick={() => setMode(option.mode)}
              >
                {option.label}
              </button>
            ))}
            <button type="button" className="period-close" aria-label="Fechar" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>

          {mode === "dia" && (
            <label>
              Dia
              <input type="date" required value={day} onChange={(event) => setDay(event.target.value)} />
            </label>
          )}

          {mode === "intervalo" && (
            <div className="period-pair">
              <label>
                De
                <input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label>
                Até
                <input type="date" required value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
          )}

          {mode === "mes" && (
            <label>
              Mês e ano
              <input type="month" required value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
          )}

          <button className="primary-button full" type="submit">
            Aplicar
          </button>
        </form>
      )}

      {error && (
        <p className="period-error" role="alert">
          {error} Mostrando <strong>hoje</strong>.
        </p>
      )}
    </div>
  );
}

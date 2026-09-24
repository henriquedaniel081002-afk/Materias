import { useEffect, useMemo, useState } from "react";
import {
  Box,
  CheckCircle2,
  TriangleAlert,
  PackageX,
  CalendarClock,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  aggregateNeeds,
  date,
  defaultFutureFilters,
  emptyFilters,
  normalized,
  normalizeUnit,
  number,
  uniqueSorted,
} from "../services/calculations";
import type { FutureMaterialNeed, PlannedDemand } from "../types";
import { useData } from "../context/DataContext";
import {
  Badge,
  FilterBar,
  KPI,
  DataTable,
  Detail,
  tooltipStyle,
  type Column,
  EmptyState,
  Drawer,
} from "../components/ui";

type ProjectionTooltipEntry = {
  payload?: {
    stock?: number;
    need?: number;
    incoming?: number | null;
  };
};

function ProjectionTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: ProjectionTooltipEntry[];
  label?: string | number;
  unit: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  const stock = Number(point?.stock ?? 0);
  const need = Number(point?.need ?? 0);
  const incoming = Number(point?.incoming ?? 0);
  const balance = Math.round((stock - need + Number.EPSILON) * 1e6) / 1e6;

  const rowStyle = {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "center",
  } as const;

  return (
    <div style={{ ...tooltipStyle, padding: "10px 12px", minWidth: 220 }}>
      <div style={{ marginBottom: 7, color: "var(--chart-axis)", fontSize: 11 }}>{label}</div>
      <div style={rowStyle}>
        <span style={{ color: "var(--chart-stock)" }}>Estoque disponível</span>
        <strong>{number(stock)} {unit}</strong>
      </div>
      <div style={rowStyle}>
        <span style={{ color: "var(--chart-need)" }}>Necessidade acumulada</span>
        <strong>{number(need)} {unit}</strong>
      </div>
      <div style={{ ...rowStyle, marginTop: 5, paddingTop: 5, borderTop: "1px solid var(--chart-tooltip-border)" }}>
        <span style={{ color: balance < 0 ? "var(--chart-risk-label)" : "var(--chart-balance-positive)" }}>Saldo de estoque</span>
        <strong style={{ color: balance < 0 ? "var(--chart-risk-label)" : "var(--chart-balance-positive)" }}>{number(balance)} {unit}</strong>
      </div>
      {incoming > 0 && (
        <div style={{ ...rowStyle, marginTop: 4 }}>
          <span style={{ color: "var(--chart-incoming)" }}>Entrada FOLLOW UP</span>
          <strong>{number(incoming)} {unit}</strong>
        </div>
      )}
    </div>
  );
}

function Composition({
  rows,
  highlightDates,
}: {
  rows: PlannedDemand[];
  highlightDates?: Set<string>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <div className="composition-with-op">
      <div className="table-scroll composition">
        <table>
          <thead>
            <tr>
              {["Data", "Referência", "Setor", "Qtd. planejada", "Qtd./unidade", "Necessidade"].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const classes = [
                row.date && highlightDates?.has(row.date) ? "rupture-row" : "",
                selectedId === row.id ? "op-row-selected" : "",
              ].filter(Boolean).join(" ");
              return (
                <tr
                  key={row.id}
                  className={classes}
                  onClick={() => setSelectedId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(row.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver dados da OP ${row.op || "não informada"}`}
                >
                  <td>{row.date ? date(row.date) : "Sem data"}</td>
                  <td className="mono">{row.reference}</td>
                  <td>{row.sector}</td>
                  <td className="numeric">{number(row.planned)}</td>
                  <td className="numeric">{number(row.perUnit, 6)}</td>
                  <td className="numeric">{number(row.need)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="composition-click-hint">Clique em uma linha para visualizar os dados da OP.</p>

      {selected && (
        <div
          className="op-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <section
            className="op-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="op-modal-title"
          >
            <header>
              <div>
                <span>DETALHES DA OP</span>
                <h3 id="op-modal-title">OP {selected.op || "não informada"}</h3>
                <p>Informações vinculadas à linha selecionada da necessidade.</p>
              </div>
              <button
                type="button"
                className="op-modal-close"
                onClick={() => setSelectedId(null)}
                aria-label="Fechar detalhes da OP"
              >
                ×
              </button>
            </header>

            <div className="op-modal-grid">
              <div>
                <span>OP</span>
                <strong>{selected.op || "Não informada"}</strong>
              </div>
              <div>
                <span>Qtd. total da OP</span>
                <strong>{selected.opTotal !== null ? number(selected.opTotal) : "Não informada"}</strong>
              </div>
              <div>
                <span>Cliente</span>
                <strong>{selected.client || "Não informado"}</strong>
              </div>
              <div>
                <span>Pedido</span>
                <strong>{selected.order || "Não informado"}</strong>
              </div>
              <div>
                <span>Referência</span>
                <strong className="mono">{selected.reference}</strong>
              </div>
              <div>
                <span>Setor</span>
                <strong>{selected.sector}</strong>
              </div>
              <div>
                <span>Data</span>
                <strong>{selected.date ? date(selected.date) : "Sem data"}</strong>
              </div>
              <div>
                <span>Qtd. planejada</span>
                <strong>{number(selected.planned)}</strong>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function Future() {
  const { plannedDemands, data, version, cascadeEnabled, setCascadeEnabled } = useData();
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<FutureMaterialNeed | null>(null);

  const sectors = useMemo(
    () => uniqueSorted(plannedDemands.map((row) => row.sector)),
    [plannedDemands],
  );
  const references = useMemo(
    () => uniqueSorted(plannedDemands.map((row) => row.reference)),
    [plannedDemands],
  );
  const groups = useMemo(
    () => uniqueSorted(data.fichaTecnica.map((row) => row.grupo_mp)),
    [data.fichaTecnica],
  );
  const units = useMemo(
    () => uniqueSorted(plannedDemands.map((row) => row.unit)),
    [plannedDemands],
  );
  const materialGroups = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.fichaTecnica.forEach((row) => {
      if (!row.grupo_mp) return;
      const key = [row.referencia, row.setor, row.cod_mp, row.un].map(normalized).join("¦");
      const values = map.get(key) || new Set<string>();
      values.add(row.grupo_mp);
      map.set(key, values);
    });
    return map;
  }, [data.fichaTecnica]);
  const matchesGroup = (row: PlannedDemand) =>
    !filters.group ||
    materialGroups
      .get([row.reference, row.sector, row.materialCode, row.unit].map(normalized).join("¦"))
      ?.has(filters.group) === true;
  const filterMaterials = useMemo(() => {
    const materials = new Map<string, { code: string; description: string; unit: string }>();
    plannedDemands.forEach((row) => {
      const key = `${row.materialCode}¦${row.unit}`;
      if (!materials.has(key)) {
        materials.set(key, {
          code: row.materialCode,
          description: row.materialDescription,
          unit: row.unit,
        });
      }
    });
    return [...materials.values()].sort((a, b) =>
      a.code.localeCompare(b.code, "pt-BR", { numeric: true }),
    );
  }, [plannedDemands]);

  useEffect(() => {
    setFilters(defaultFutureFilters(plannedDemands));
    setSelected(null);
  }, [version]);

  useEffect(() => {
    setSelected(null);
  }, [cascadeEnabled]);

  useEffect(() => {
    setSelected(null);
  }, [filters]);

  const rows = useMemo(
    () =>
      aggregateNeeds(
        plannedDemands.filter((row) => matchesGroup(row)),
        data.estoque,
        filters,
        data.followUp,
      ).filter((row) => !filters.material || row.code === filters.material),
    [plannedDemands, data.estoque, data.followUp, filters, materialGroups],
  );

  const covered = rows.filter((row) => row.coverage === "COBRE").length;
  const insufficient = rows.filter(
    (row) => row.coverage === "NÃO COBRE" || row.coverage === "SEM ESTOQUE",
  ).length;
  const zero = rows.filter((row) => row.coverage === "SEM ESTOQUE").length;
  const divergent = rows.filter((row) => row.coverage === "UNIDADE DIVERGENTE").length;
  const undated = rows.filter((row) => row.undated > 0).length;
  const comparable = rows.length - divergent;

  // A seleção da tabela controla somente a análise visual; não altera filtros nem cálculos.
  // O detalhamento abre somente pelo clique explícito em uma linha.
  const active = selected || undefined;
  let accumulatedNeed = 0;
  let availableStock = active?.stock || 0;
  const timeline = active && active.coverage !== "UNIDADE DIVERGENTE"
    ? active.projection.map((point) => {
        accumulatedNeed = Math.round((accumulatedNeed + point.need + Number.EPSILON) * 1e6) / 1e6;
        availableStock = Math.round((availableStock + point.incoming + Number.EPSILON) * 1e6) / 1e6;
        return {
          iso: point.date,
          day: date(point.date).slice(0, 5),
          need: accumulatedNeed,
          dailyNeed: point.need,
          stock: availableStock,
          incoming: point.incoming > 0 ? point.incoming : null,
        };
      })
    : [];

  // Um novo evento de ruptura acontece somente na transição COBRE -> NÃO COBRE.
  // Assim, uma chegada do FOLLOW UP pode recuperar a cobertura e uma necessidade
  // posterior pode gerar uma segunda (ou terceira) ruptura independente.
  const rupturePoints =
    active && active.coverage !== "UNIDADE DIVERGENTE"
      ? timeline.filter((point, index) => {
          const uncovered = point.need > point.stock;
          const previousCovered =
            index === 0 || timeline[index - 1].need <= timeline[index - 1].stock;
          return uncovered && previousCovered;
        })
      : [];
  const rupturePoint = rupturePoints[0];
  const ruptureDates = new Set(rupturePoints.map((point) => point.iso));
  const ruptureRanges = timeline.reduce<Array<{ start: string; end: string }>>((ranges, point, index) => {
    const uncovered = point.need > point.stock;
    const previousUncovered = index > 0 && timeline[index - 1].need > timeline[index - 1].stock;
    if (uncovered && !previousUncovered) {
      ranges.push({ start: point.day, end: point.day });
    }
    if (uncovered && ranges.length) {
      ranges[ranges.length - 1].end = point.day;
    }
    if (!uncovered && previousUncovered && ranges.length) {
      // Estende a faixa até a data em que a entrada recupera a cobertura.
      ranges[ranges.length - 1].end = point.day;
    }
    return ranges;
  }, []);

  // Na composição, todas as datas cuja necessidade acumulada está descoberta
  // permanecem em vermelho até que uma entrada futura recupere a cobertura.
  const uncoveredDates = new Set(
    active && active.coverage !== "UNIDADE DIVERGENTE"
      ? timeline.filter((point) => point.need > point.stock).map((point) => point.iso)
      : [],
  );

  // FOLLOW UP faturado sem PREV ENTREGA não altera o estoque projetado, mas
  // precisa permanecer visível no detalhamento para acompanhamento logístico.
  const undatedBilledReceipts = active
    ? data.followUp
        .filter(
          (row) =>
            normalized(row.cod_mp) === normalized(active.code) &&
            normalizeUnit(row.un) === active.unit &&
            Number(row.qtd_faturada) > 0 &&
            !row.prev_entrega,
        )
        .sort((a, b) =>
          (a.dt_saida_transp || a.dt_ent_transp || "9999-12-31").localeCompare(
            b.dt_saida_transp || b.dt_ent_transp || "9999-12-31",
          ),
        )
    : [];
  const undatedBilledTotal = undatedBilledReceipts.reduce(
    (sum, row) => sum + (Number(row.qtd_faturada) || 0),
    0,
  );

  // Pedidos ainda a faturar são informativos. Eles não compõem receipts,
  // incoming, projection ou saldo projetado; apenas aparecem no detalhamento.
  const openPurchaseOrders = active
    ? data.followUp
        .filter(
          (row) =>
            normalized(row.cod_mp) === normalized(active.code) &&
            normalizeUnit(row.un) === active.unit &&
            Boolean(row.numero_pedido) &&
            Number(row.qtd_a_faturar) > 0,
        )
        .sort((a, b) =>
          (a.mes_atendimento || "").localeCompare(b.mes_atendimento || "", "pt-BR") ||
          (a.numero_pedido || "").localeCompare(b.numero_pedido || "", "pt-BR", { numeric: true }),
        )
    : [];
  const openPurchaseOrdersTotal = openPurchaseOrders.reduce(
    (sum, row) => sum + (Number(row.qtd_a_faturar) || 0),
    0,
  );

  const shortageOnlyWithoutDate =
    !!active &&
    active.balance !== null &&
    active.balance < 0 &&
    !rupturePoint &&
    active.undated > 0;

  const columns: Column<FutureMaterialNeed>[] = [
    {
      key: "code",
      label: "Código MP",
      value: (row) => row.code,
      render: (row) => <span className="mono code">{row.code}</span>,
    },
    {
      key: "desc",
      label: "Descrição MP",
      value: (row) => row.description,
      render: (row) => (
        <span title={row.description} className="truncate">
          {row.description}
        </span>
      ),
    },
    { key: "unit", label: "UN", value: (row) => row.unit },
    {
      key: "stock",
      label: "Estoque atual",
      numeric: true,
      value: (row) => row.stock,
      render: (row) => (
        <span title={row.stockUnit && row.stockUnit !== row.unit ? `Unidade do estoque: ${row.stockUnit}` : undefined}>
          {number(row.stock)}{row.stockUnit && row.stockUnit !== row.unit ? ` ${row.stockUnit}` : ""}
        </span>
      ),
    },
    {
      key: "scheduled",
      label: "Nec. programada",
      numeric: true,
      value: (row) => row.scheduled,
      render: (row) => number(row.scheduled),
    },
    {
      key: "undated",
      label: "Nec. sem data",
      numeric: true,
      value: (row) => row.undated,
      render: (row) => <span className={row.undated ? "" : "muted"}>{number(row.undated)}</span>,
    },
    {
      key: "total",
      label: "Nec. total",
      numeric: true,
      value: (row) => row.total,
      render: (row) => <strong>{number(row.total)}</strong>,
    },
    {
      key: "balance",
      label: "Saldo projetado",
      numeric: true,
      value: (row) => row.balance ?? Number.NEGATIVE_INFINITY,
      render: (row) =>
        row.balance === null ? (
          <span className="muted">Não comparável</span>
        ) : (
          <strong className={row.balance < 0 ? "red" : "emerald"}>
            {row.balance >= 0 ? "+" : ""}
            {number(row.balance)}
          </strong>
        ),
    },
    {
      key: "coverage",
      label: "Cobertura",
      value: (row) => row.coverage,
      render: (row) => <Badge status={row.coverage} />,
    },
  ];

  return (
    <>
      <FilterBar
        future
        filters={filters}
        onChange={setFilters}
        reset={() => setFilters(defaultFutureFilters(plannedDemands))}
        sectors={sectors}
        references={references}
        materials={filterMaterials}
        groups={groups}
        units={units}
      />

      <div className={`cascade-control ${cascadeEnabled ? "enabled" : "disabled"}`}>
        <div className="cascade-copy">
          <span>CASCATA DE PRODUÇÃO</span>
          <strong>{cascadeEnabled ? "Ativada" : "Desativada"}</strong>
          <p>
            {cascadeEnabled
              ? "As datas da Montagem Final são antecipadas pelos dias úteis configurados de cada setor."
              : "Todos os setores usam diretamente a data da Montagem Final, sem antecipação."}
          </p>
        </div>
        <button
          type="button"
          className="cascade-toggle"
          aria-pressed={cascadeEnabled}
          onClick={() => setCascadeEnabled(!cascadeEnabled)}
        >
          <span className="cascade-switch" aria-hidden="true"><i /></span>
          {cascadeEnabled ? "Desativar Cascata" : "Ativar Cascata"}
        </button>
      </div>

      <div className="kpis future-kpis">
        <KPI
          label="MPs necessárias"
          value={rows.length}
          detail="Código + unidade no recorte"
          icon={<Box size={17} />}
        />
        <KPI
          label="Estoque cobre"
          value={covered}
          detail="Saldo suficiente para a demanda"
          icon={<CheckCircle2 size={17} />}
          tone="positive"
        />
        <KPI
          label="Estoque insuficiente"
          value={insufficient}
          detail="Inclui materiais sem estoque"
          icon={<TriangleAlert size={17} />}
          tone="negative"
        />
        <KPI
          label="Sem estoque"
          value={zero}
          detail="Saldo inexistente ou igual a zero"
          icon={<PackageX size={17} />}
        />
        <KPI
          label="Necessidades sem data"
          value={undated}
          detail="Materiais ainda não programados"
          icon={<CalendarClock size={17} />}
        />
      </div>

      <div className="coverage-strip">
        <span>
          <CheckCircle2 size={16} />
          Cobertura dos materiais
        </span>
        <div className="progress-track">
          <div style={{ width: `${comparable ? (covered / comparable) * 100 : 0}%` }} />
        </div>
        <strong>{comparable ? number((covered / comparable) * 100) : "0"}%</strong>
        <small>
          {covered} de {comparable} MPs comparáveis com estoque suficiente
          {divergent ? ` · ${divergent} com unidade divergente` : ""}
        </small>
      </div>

      <div className="section-line">
        <div>
          <span className="section-index">01</span>
          <h2>Posição de materiais</h2>
        </div>
        <span className="muted desktop-note">Programado + sem data = necessidade total</span>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        onRow={setSelected}
        selected={selected?.id}
        title="Necessidade e cobertura"
        subtitle="Plano × ficha técnica, comparado ao saldo atual do estoque"
      />

      {active && (
        <Drawer
          title={active.description}
          subtitle={`${active.code} · ${active.unit}`}
          onClose={() => setSelected(null)}
          className={`future-analysis-modal ${rupturePoint || shortageOnlyWithoutDate ? "has-risk" : ""}`}
        >
          <div className="analysis-modal-topline">
            <div>
              <span className="analysis-modal-eyebrow">ANÁLISE DA PROJEÇÃO</span>
              <p>Estoque atual × necessidade acumulada e composição completa da demanda.</p>
            </div>
            <Badge status={active.coverage} />
          </div>

          {rupturePoint && (
            <div className="detail-rupture-callout analysis-rupture-callout">
              <TriangleAlert size={20} />
              <div>
                <span>PRIMEIRA RUPTURA</span>
                <strong>{date(rupturePoint.iso)}</strong>
                <small>
                  A necessidade acumulada supera o estoque disponível nesta data, após considerar as entradas previstas.
                  {rupturePoints.length > 1 ? ` Há ${rupturePoints.length} períodos de ruptura no intervalo.` : ""}
                </small>
              </div>
            </div>
          )}
          {shortageOnlyWithoutDate && (
            <div className="detail-rupture-callout undated analysis-rupture-callout">
              <CalendarClock size={20} />
              <div>
                <span>FALTA PROJETADA</span>
                <strong>Sem data definida</strong>
                <small>A necessidade sem data é responsável pelo saldo negativo.</small>
              </div>
            </div>
          )}

          <div className="analysis-summary-grid">
            <Detail label="Estoque atual">
              {number(active.stock)} {active.stockUnit || active.unit}
            </Detail>
            <Detail label="Necessidade programada">
              {number(active.scheduled)} {active.unit}
            </Detail>
            <Detail label="Necessidade sem data">
              {number(active.undated)} {active.unit}
            </Detail>
            <Detail label="Necessidade total">
              {number(active.total)} {active.unit}
            </Detail>
            <Detail label="Entradas previstas">
              {number(active.incoming)} {active.unit}
            </Detail>
            <div className={`result-box analysis-balance ${active.balance !== null && active.balance < 0 ? "negative-result" : ""}`}>
              <span>Saldo projetado</span>
              {active.balance === null ? (
                <strong className="muted">Não comparável</strong>
              ) : (
                <strong>
                  {active.balance >= 0 ? "+" : ""}{number(active.balance)} <small>{active.unit}</small>
                </strong>
              )}
            </div>
          </div>

          {openPurchaseOrders.length > 0 && (
            <section className="analysis-modal-section followup-open-section">
              <div className="analysis-section-head">
                <div>
                  <span>PEDIDOS A FATURAR</span>
                  <h3>Material com pedido ainda pendente de faturamento</h3>
                  <p>Informativo apenas: a QTD À FATURAR não entra no estoque projetado, saldo, cobertura ou ruptura.</p>
                </div>
                <strong className="followup-open-total">
                  {number(openPurchaseOrdersTotal)} {active.unit}
                </strong>
              </div>
              <div className="table-scroll composition followup-open-table">
                <table>
                  <thead>
                    <tr>
                      <th>Nº pedido</th>
                      <th>Qtd. à faturar</th>
                      <th>Mês para atendimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPurchaseOrders.map((row, index) => (
                      <tr key={[row.cod_mp, row.numero_pedido, row.qtd_a_faturar, row.mes_atendimento, index].join("¦")}>
                        <td className="mono"><strong>{row.numero_pedido}</strong></td>
                        <td className="numeric"><strong>{number(Number(row.qtd_a_faturar))} {active.unit}</strong></td>
                        <td>{row.mes_atendimento || <span className="muted">Não informado</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {undatedBilledReceipts.length > 0 && (
            <section className="analysis-modal-section followup-undated-section">
              <div className="analysis-section-head">
                <div>
                  <span>FOLLOW UP SEM PREVISÃO</span>
                  <h3>Material faturado aguardando previsão de chegada</h3>
                  <p>Informativo apenas: estas quantidades não aumentam o estoque disponível enquanto não houver PREV ENTREGA.</p>
                </div>
                <strong className="followup-undated-total">
                  {number(undatedBilledTotal)} {active.unit}
                </strong>
              </div>
              <div className="table-scroll composition followup-tracking-table">
                <table>
                  <thead>
                    <tr>
                      <th>Qtd. faturada</th>
                      <th>Previsão de entrega</th>
                      <th>Entrada transportadora</th>
                      <th>Saída transportadora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {undatedBilledReceipts.map((row, index) => (
                      <tr key={[row.cod_mp, row.qtd_faturada, row.dt_ent_transp, row.dt_saida_transp, index].join("¦")}>
                        <td className="numeric"><strong>{number(Number(row.qtd_faturada))} {active.unit}</strong></td>
                        <td><span className="followup-no-date">Sem previsão</span></td>
                        <td>{row.dt_ent_transp ? date(row.dt_ent_transp) : <span className="muted">Não informada</span>}</td>
                        <td>{row.dt_saida_transp ? date(row.dt_saida_transp) : <span className="muted">Não informada</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {active.coverage === "UNIDADE DIVERGENTE" && (
            <div className="unit-warning analysis-unit-warning">
              <TriangleAlert size={15} /> Estoque em {active.stockUnit || "UN não informada"} e necessidade em {active.unit}; saldo não calculado.
            </div>
          )}

          <section className="analysis-modal-section projection-modal-section">
            <div className="analysis-section-head">
              <div>
                <span>PROJEÇÃO DA PROGRAMAÇÃO</span>
                <h3>Estoque × necessidade acumulada</h3>
              </div>
              {rupturePoint && (
                <strong className="analysis-risk-date">
                  <TriangleAlert size={14} />
                  {rupturePoints.length > 1
                    ? `${rupturePoints.length} rupturas · 1ª ${date(rupturePoint.iso)}`
                    : `Ruptura ${date(rupturePoint.iso)}`}
                </strong>
              )}
            </div>

            {rupturePoint && (
              <div className="rupture-banner" role="status">
                <TriangleAlert size={16} />
                <div>
                  <span>Ruptura prevista</span>
                  <strong>{date(rupturePoint.iso)}</strong>
                </div>
                <small>
                  {rupturePoints.length > 1
                    ? `Primeiro de ${rupturePoints.length} períodos de ruptura no intervalo. Novas rupturas são destacadas no gráfico após cada recuperação de cobertura.`
                    : "A necessidade acumulada supera o estoque disponível nesta data."}
                </small>
              </div>
            )}
            {shortageOnlyWithoutDate && (
              <div className="rupture-banner undated-rupture" role="status">
                <CalendarClock size={16} />
                <div>
                  <span>Falta projetada sem data definida</span>
                  <strong>Necessidade sem programação</strong>
                </div>
                <small>O saldo final fica negativo, mas a parcela que causa a falta ainda não possui data.</small>
              </div>
            )}

            <div className="chart analysis-projection-chart">
              {timeline.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline} margin={{ top: rupturePoint ? 30 : 14, right: 30, left: 8, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => number(Number(value))} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} width={60} />
                    <Tooltip content={<ProjectionTooltip unit={active.unit} />} />
                    <ReferenceLine y={0} stroke="var(--chart-zero)" strokeDasharray="3 5" />
                    {ruptureRanges.map((range, index) => (
                      <ReferenceArea
                        key={`rupture-range-${index}-${range.start}`}
                        x1={range.start}
                        x2={range.end}
                        fill="#fb7185"
                        fillOpacity={0.055}
                        strokeOpacity={0}
                      />
                    ))}
                    {rupturePoints.map((point, index) => (
                      <ReferenceLine
                        key={`rupture-${point.iso}`}
                        x={point.day}
                        stroke="#fb7185"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        label={{
                          value: rupturePoints.length > 1
                            ? `Ruptura ${index + 1} · ${point.day}`
                            : `Ruptura ${point.day}`,
                          position: index % 2 === 0 ? "insideTopRight" : "insideBottomRight",
                          fill: "var(--chart-risk-label)",
                          fontSize: 11,
                        }}
                      />
                    ))}
                    <Line
                      dataKey="stock"
                      type="stepAfter"
                      dot={(props) => {
                        const { cx, cy, payload } = props as {
                          cx?: number;
                          cy?: number;
                          payload?: { incoming?: number | null };
                        };
                        if (cx == null || cy == null || !Number(payload?.incoming)) return <></>;
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={5}
                            fill="#fbbf24"
                            stroke="var(--chart-dot-stroke)"
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={false}
                      stroke="#60a5fa"
                      strokeWidth={1.8}
                      strokeDasharray="6 5"
                    />
                    <Line
                      dataKey="need"
                      type="linear"
                      dot={(props) => {
                        const { cx, cy, payload } = props as {
                          cx?: number;
                          cy?: number;
                          payload?: { iso?: string; dailyNeed?: number };
                        };
                        if (cx == null || cy == null || !Number(payload?.dailyNeed)) return <></>;
                        const isRupture = Boolean(payload?.iso && ruptureDates.has(payload.iso));
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isRupture ? 5 : 3}
                            fill={isRupture ? "#fb7185" : "#34d399"}
                            stroke="var(--chart-dot-stroke)"
                            strokeWidth={2}
                          />
                        );
                      }}
                      stroke="#34d399"
                      strokeWidth={2.5}
                    />
                    <Line dataKey="incoming" dot={false} activeDot={false} stroke="transparent" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  text={
                    active.coverage === "UNIDADE DIVERGENTE"
                      ? "Projeção não calculada porque a unidade do estoque diverge da unidade da necessidade."
                      : "Nenhuma demanda ou entrada com data neste período. A necessidade sem programação permanece indicada abaixo."
                  }
                />
              )}
            </div>
            <footer className="chart-legend analysis-projection-legend">
              <span><i className="solid" />Necessidade acumulada</span>
              <span><i className="dashed" />Estoque disponível</span>
              <span><i className="receipt" />Entrada FOLLOW UP</span>
              {rupturePoints.length > 0 && <span className="rupture-legend"><i />Início de ruptura</span>}
              <p><Info size={13} /> O estoque sobe na PREV ENTREGA; cada nova transição para falta é destacada; demandas sem data não compõem a curva.</p>
            </footer>
          </section>

          <section className="analysis-modal-section">
            <div className="analysis-section-head">
              <div>
                <span>DETALHAMENTO DA DEMANDA</span>
                <h3>Composição da necessidade</h3>
                <p>Quantidade planejada × quantidade por unidade · {active.unit}</p>
              </div>
            </div>
            {active.demands.some((demand) => demand.date) ? (
              <Composition
                rows={active.demands.filter((demand) => demand.date).sort((a, b) => a.date!.localeCompare(b.date!))}
                highlightDates={uncoveredDates}
              />
            ) : (
              <p className="muted detail-empty-text">Sem demandas programadas no período.</p>
            )}
          </section>

          <section className="analysis-modal-section">
            <div className="analysis-section-head">
              <div>
                <span>PLANO SEM PROGRAMAÇÃO</span>
                <h3>Quantidade sem data programada</h3>
                <p>Demandas que compõem a necessidade total, mas ainda não entram na curva temporal.</p>
              </div>
            </div>
            {active.demands.some((demand) => !demand.date) ? (
              <Composition rows={active.demands.filter((demand) => !demand.date)} />
            ) : (
              <p className="muted detail-empty-text">Este material não possui demanda sem data.</p>
            )}
          </section>
        </Drawer>
      )}

    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Box, Layers3, Factory, ListChecks, Info } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  LabelList,
} from "recharts";
import {
  date,
  defaultDailyFilters,
  emptyFilters,
  matchesDaily,
  normalized,
  number,
  uniqueSorted,
} from "../services/calculations";
import type { DailyConsumption } from "../types";
import { useData } from "../context/DataContext";
import {
  FilterBar,
  KPI,
  ChartCard,
  DataTable,
  Drawer,
  Detail,
  tooltipStyle,
  type Column,
  EmptyState,
  SearchableSelect,
} from "../components/ui";

export default function Daily() {
  const { daily, data, version } = useData();
  const [filters, setFilters] = useState(emptyFilters);
  const [chartUnit, setChartUnit] = useState("");
  const [chartMaterial, setChartMaterial] = useState("");
  const [selected, setSelected] = useState<DailyConsumption | null>(null);

  const sectors = useMemo(() => uniqueSorted(daily.map((row) => row.sector)), [daily]);
  const references = useMemo(() => uniqueSorted(daily.map((row) => row.reference)), [daily]);
  const groups = useMemo(() => uniqueSorted(data.fichaTecnica.map((row) => row.grupo_mp)), [data.fichaTecnica]);
  const units = useMemo(() => uniqueSorted(daily.map((row) => row.unit)), [daily]);
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
  const matchesGroup = (row: DailyConsumption) =>
    !filters.group ||
    materialGroups
      .get([row.reference, row.sector, row.materialCode, row.unit].map(normalized).join("¦"))
      ?.has(filters.group) === true;
  const availableChartUnits = useMemo(
    () =>
      uniqueSorted(
        daily
          .filter(
            (row) =>
              (!filters.start || row.date >= filters.start) &&
              (!filters.end || row.date <= filters.end) &&
              (!filters.sector || row.sector === filters.sector) &&
              (!filters.reference || row.reference === filters.reference) &&
              matchesGroup(row),
          )
          .map((row) => row.unit),
      ),
    [daily, filters.start, filters.end, filters.sector, filters.reference, filters.group, materialGroups],
  );
  const filterMaterials = useMemo(() => {
    const materials = new Map<string, { code: string; description: string; unit: string }>();
    daily.forEach((row) => {
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
  }, [daily]);

  useEffect(() => {
    setFilters(defaultDailyFilters(daily));
    setSelected(null);
  }, [version, daily]);

  useEffect(() => {
    setSelected(null);
  }, [filters]);

  useEffect(() => {
    setChartMaterial(filters.material);
  }, [filters.material, filters.unit]);

  useEffect(() => {
    if (!availableChartUnits.length) {
      if (chartUnit) setChartUnit("");
      if (filters.unit) {
        setFilters((current) => ({ ...current, unit: "", material: "" }));
      }
      return;
    }

    const currentUnit = filters.unit || chartUnit;
    if (currentUnit && availableChartUnits.includes(currentUnit)) {
      if (chartUnit !== currentUnit) setChartUnit(currentUnit);
      return;
    }

    const nextUnit = availableChartUnits[0];
    setChartUnit(nextUnit);
    if (filters.unit && filters.unit !== nextUnit) {
      setFilters((current) => ({ ...current, unit: nextUnit, material: "" }));
    }
  }, [availableChartUnits, chartUnit, filters.unit]);

  const rows = useMemo(
    () =>
      daily.filter(
        (row) =>
          matchesDaily(row, filters) &&
          matchesGroup(row) &&
          (!filters.material || row.materialCode === filters.material),
      ),
    [daily, filters],
  );
  const unit = filters.unit || chartUnit || availableChartUnits[0] || "";

  const materialOptions = useMemo(() => {
    const map = new Map<string, { code: string; description: string }>();
    rows
      .filter((row) => row.unit === unit)
      .forEach((row) => {
        if (!map.has(row.materialCode)) {
          map.set(row.materialCode, {
            code: row.materialCode,
            description: row.materialDescription,
          });
        }
      });
    return [...map.values()].sort((a, b) =>
      a.code.localeCompare(b.code, "pt-BR", { numeric: true }),
    );
  }, [rows, unit]);

  const effectiveMaterial = materialOptions.some((item) => item.code === chartMaterial)
    ? chartMaterial
    : "";
  const chartRows = rows.filter(
    (row) =>
      row.unit === unit && (!effectiveMaterial || row.materialCode === effectiveMaterial),
  );
  const evolution = Object.entries(
    chartRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.date] = (acc[row.date] || 0) + row.consumption;
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, value]) => ({ iso, day: date(iso).slice(0, 5), value }));

  const top = materialOptions
    .map((material) => ({
      name: material.code,
      description: material.description,
      value: rows
        .filter((row) => row.unit === unit && row.materialCode === material.code)
        .reduce((sum, row) => sum + row.consumption, 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const columns: Column<DailyConsumption>[] = [
    {
      key: "date",
      label: "Data",
      value: (row) => row.date,
      render: (row) => date(row.date),
    },
    {
      key: "code",
      label: "Código MP",
      value: (row) => row.materialCode,
      render: (row) => <span className="mono code">{row.materialCode}</span>,
    },
    {
      key: "desc",
      label: "Descrição MP",
      value: (row) => row.materialDescription,
      render: (row) => (
        <span className="truncate" title={row.materialDescription}>
          {row.materialDescription}
        </span>
      ),
    },
    {
      key: "ref",
      label: "Referência",
      value: (row) => row.reference,
      render: (row) => <span className="mono muted">{row.reference}</span>,
    },
    {
      key: "sector",
      label: "Setor",
      value: (row) => row.sector,
      render: (row) => <span className="sector">{row.sector}</span>,
    },
    {
      key: "produced",
      label: "Qtd. produzida",
      numeric: true,
      value: (row) => row.produced,
      render: (row) => number(row.produced),
    },
    {
      key: "per",
      label: "Qtd./unidade",
      numeric: true,
      value: (row) => row.perUnit,
      render: (row) => number(row.perUnit, 6),
    },
    {
      key: "consumption",
      label: "Consumo",
      numeric: true,
      value: (row) => row.consumption,
      render: (row) => <strong className="emerald">{number(row.consumption)}</strong>,
    },
    { key: "unit", label: "UN", value: (row) => row.unit },
  ];

  return (
    <>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        reset={() => setFilters(defaultDailyFilters(daily))}
        sectors={sectors}
        references={references}
        materials={filterMaterials}
        groups={groups}
        units={units}
      />
      <div className="kpis daily-kpis">
        <KPI
          label="Matérias-primas consumidas"
          value={new Set(rows.map((row) => `${row.materialCode}¦${row.unit}`)).size}
          detail="Materiais distintos no período"
          icon={<Box size={17} />}
        />
        <KPI
          label="Referências produzidas"
          value={new Set(rows.map((row) => row.reference)).size}
          detail="Produtos com consumo registrado"
          icon={<Layers3 size={17} />}
        />
        <KPI
          label="Setores com produção"
          value={new Set(rows.map((row) => row.sector)).size}
          detail="Somente setores mapeados na ficha"
          icon={<Factory size={17} />}
        />
        <KPI
          label="Registros de consumo"
          value={number(rows.length)}
          detail="Combinações de produção e matéria-prima"
          icon={<ListChecks size={17} />}
          tone="accent"
        />
      </div>

      <div className="section-line">
        <div>
          <span className="section-index">01</span>
          <h2>Análise do consumo</h2>
        </div>
        <div className="graph-unit-tools">
          <label className="inline-label">
            Unidade dos gráficos{" "}
            <select
              aria-label="Unidade dos gráficos"
              disabled={!availableChartUnits.length}
              value={unit}
              onChange={(event) => {
                setChartUnit(event.target.value);
                setFilters({
                  ...filters,
                  unit: event.target.value,
                  material:
                    filters.material && event.target.value !== filters.unit
                      ? ""
                      : filters.material,
                });
                setChartMaterial("");
              }}
            >
              {availableChartUnits.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="unit-availability" aria-label="Unidades disponíveis no recorte atual">
            <span>Disponíveis:</span>
            {availableChartUnits.length ? (
              availableChartUnits.map((value) => (
                <b key={value} className={value === unit ? "active" : ""}>
                  {value}
                </b>
              ))
            ) : (
              <em>Nenhuma</em>
            )}
          </div>
        </div>
      </div>

      {filters.unit && (
        <div className="unit-total">
          Consumo total no recorte{" "}
          <strong>
            {number(rows.reduce((sum, row) => sum + row.consumption, 0))} {unit}
          </strong>
        </div>
      )}

      <div className="chart-grid daily-charts">
        <ChartCard
          title="Evolução do consumo"
          subtitle={unit ? `Consumo diário · ${unit}` : "Sem unidade disponível"}
          action={
            <div className="chart-material-select">
              <SearchableSelect
                label="Matéria-prima do gráfico"
                value={effectiveMaterial}
                options={materialOptions.map((material) => ({
                  value: material.code,
                  label: `${material.code} · ${material.description}`,
                }))}
                placeholder={unit ? "Código ou descrição" : "Sem unidade disponível"}
                emptyLabel="Nenhuma matéria-prima encontrada"
                onSelect={setChartMaterial}
              />
            </div>
          }
        >
          {evolution.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolution} margin={{ top: 30, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(196, 255, 222, 0.08)" vertical={false} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#78877f", fontSize: 11 }}
                    minTickGap={25}
                  />
                  <YAxis
                    tickFormatter={(value) => number(Number(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#78877f", fontSize: 11 }}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${number(Number(value))} ${unit}`, "Consumo"]}
                  />
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "#34d399", stroke: "#06100a", strokeWidth: 3 }}
                  >
                    <LabelList
                      dataKey="value"
                      position="top"
                      fill="#aab8b0"
                      fontSize={10}
                      formatter={(value: number) => number(Number(value))}
                    />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState text={daily.length ? "Ajuste os filtros para visualizar o consumo." : "Importe Plano, Apontamento e Ficha Técnica para iniciar."} />
          )}
        </ChartCard>

        <ChartCard
          title="Materiais mais consumidos"
          subtitle={unit ? `Top 5 · comparação em ${unit}` : "Sem unidade disponível"}
        >
          <div className="chart">
            {top.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ top: 7, right: 78, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.18 : 1)]} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={57}
                    tick={{ fill: "#aab8b0", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(52, 211, 153, 0.055)" }}
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${number(Number(value))} ${unit}`, "Consumo"]}
                    labelFormatter={(value) => {
                      const material = top.find((item) => item.name === String(value));
                      return `${value} · ${material?.description || ""}`;
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="#34d399"
                    radius={[0, 7, 7, 0]}
                    barSize={15}
                    label={{
                      position: "right",
                      fill: "#aab8b0",
                      fontSize: 11,
                      formatter: (value: number) => number(value),
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>
        </ChartCard>
      </div>

      <p className="chart-note">
        <Info size={13} /> Consumo = Qtd. produzida × Qtd. por unidade. Os gráficos nunca somam unidades diferentes.
      </p>

      <DataTable
        rows={rows}
        columns={columns}
        onRow={setSelected}
        selected={selected?.id}
        title="Registros de consumo"
        subtitle="Apontamento cruzado com a ficha técnica por Referência + Setor"
        search={filters.search}
        onSearch={(search) => setFilters({ ...filters, search })}
      />

      {selected && (
        <Drawer
          title={selected.materialDescription}
          subtitle={`${selected.materialCode} · ${selected.unit}`}
          onClose={() => setSelected(null)}
        >
          <div className="detail-grid">
            <Detail label="Data">{date(selected.date)}</Detail>
            <Detail label="Referência">{selected.reference}</Detail>
            <Detail label="Setor">{selected.sector}</Detail>
            <Detail label="Unidade">{selected.unit}</Detail>
          </div>
          <h3>Dados da OP</h3>
          <div className="op-detail-card daily-op-detail">
            <div>
              <span>OP</span>
              <strong>{selected.op || "Não informada"}</strong>
            </div>
            <div>
              <span>Qtd. total da OP</span>
              <strong>
                {selected.opTotal !== null
                  ? number(selected.opTotal)
                  : selected.op
                    ? "Não encontrada no Plano"
                    : "Não informada"}
              </strong>
            </div>
            <div>
              <span>Cliente</span>
              <strong>
                {selected.client || (selected.op ? "Não encontrado no Plano" : "Não informado")}
              </strong>
            </div>
            <div>
              <span>Pedido</span>
              <strong>
                {selected.order || (selected.op ? "Não encontrado no Plano" : "Não informado")}
              </strong>
            </div>
          </div>
          <h3>Composição do consumo</h3>
          <div className="calculation">
            <Detail label="Quantidade produzida">{number(selected.produced)} produtos</Detail>
            <span>×</span>
            <Detail label="Quantidade por unidade">
              {number(selected.perUnit, 6)} {selected.unit}
            </Detail>
          </div>
          <div className="result-box">
            <span>Consumo resultante</span>
            <strong>
              {number(selected.consumption)} <small>{selected.unit}</small>
            </strong>
          </div>
        </Drawer>
      )}
    </>
  );
}

import type {
  ApontamentoRow,
  DailyConsumption,
  EstoqueRow,
  FichaTecnicaRow,
  Filters,
  FollowUpRow,
  FutureMaterialNeed,
  PlanoRow,
  PlannedDemand,
  StockProjectionPoint,
} from "../types";

export const number = (n: number, digits = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits })
    : "0";

export const date = (value: string) => {
  if (!value) return "";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export const normalized = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export const normalizeUnit = (value: string | null | undefined) =>
  String(value ?? "").trim().toUpperCase();

const round = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const joinKey = (...parts: string[]) => parts.map(normalized).join("¦");

// A data do Plano representa a Montagem Final. Cada setor consome seus
// materiais alguns dias úteis antes dessa data. A regra fica centralizada
// aqui para que toda a Necessidade Futura use a mesma data industrial.
const businessDaysBeforeFinalAssembly: Record<string, number> = {
  "bobina at": 3,
  "bobina bt": 5,
  ferragem: 7,
  isolante: 7,
  "corte do nucleo": 5,
  mpa: 1,
  "corte do laser": 4,
  "montagem final": 0,
};

export function calculateNeedDate(
  finalAssemblyDate: string | null | undefined,
  sector: string | null | undefined,
  cascadeEnabled = true,
): string | null {
  if (!finalAssemblyDate) return null;

  const iso = finalAssemblyDate.slice(0, 10);
  if (!cascadeEnabled) return iso;
  const leadDays = businessDaysBeforeFinalAssembly[normalized(sector)] ?? 0;
  if (leadDays <= 0) return iso;

  // UTC evita que o fuso horário altere o dia ao manipular datas ISO.
  const cursor = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return iso;

  let remaining = leadDays;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }

  return cursor.toISOString().slice(0, 10);
}

export const emptyFilters = (): Filters => ({
  start: "",
  end: "",
  sector: "",
  reference: "",
  material: "",
  unit: "",
  coverage: "",
  search: "",
});

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bounds(values: Array<string | null | undefined>) {
  const valid = values.filter((v): v is string => Boolean(v)).map((v) => v.slice(0, 10));
  valid.sort();
  return { min: valid[0] || "", max: valid[valid.length - 1] || "" };
}

export function defaultDailyFilters(rows: DailyConsumption[]): Filters {
  const range = bounds(rows.map((r) => r.date));
  return { ...emptyFilters(), start: range.min, end: range.max };
}

export function defaultFutureFilters(rows: PlannedDemand[]): Filters {
  const range = bounds(rows.map((r) => r.date));
  const today = localToday();
  if (!range.min || !range.max) return { ...emptyFilters() };
  if (today < range.min) return { ...emptyFilters(), start: range.min, end: range.max };
  if (today > range.max) return { ...emptyFilters(), start: today, end: today };
  return { ...emptyFilters(), start: today, end: range.max };
}

export function createDailyConsumption(
  apontamento: ApontamentoRow[],
  ficha: FichaTecnicaRow[],
  plano: PlanoRow[] = [],
): DailyConsumption[] {
  const byReferenceSector = new Map<string, FichaTecnicaRow[]>();
  for (const row of ficha) {
    const key = joinKey(row.referencia, row.setor);
    const list = byReferenceSector.get(key) || [];
    list.push(row);
    byReferenceSector.set(key, list);
  }

  const planByOp = new Map<string, PlanoRow>();
  for (const row of plano) {
    if (!row.op) continue;
    const key = joinKey(row.op, row.referencia);
    if (!planByOp.has(key)) planByOp.set(key, row);
  }

  const result: DailyConsumption[] = [];
  for (const production of apontamento) {
    const rows = byReferenceSector.get(joinKey(production.referencia, production.setor));
    if (!rows?.length) continue;
    const planInfo = production.op
      ? planByOp.get(joinKey(production.op, production.referencia))
      : undefined;
    for (const material of rows) {
      const produced = Number(production.qtd_produzida) || 0;
      const perUnit = Number(material.qtd_por_unidade) || 0;
      result.push({
        id: [
          production.data,
          production.referencia,
          production.setor,
          production.op || "SEM_OP",
          material.cod_mp,
          material.un,
        ].join("¦"),
        date: production.data.slice(0, 10),
        reference: production.referencia,
        sector: production.setor,
        op: production.op || null,
        client: planInfo?.cliente || null,
        order: planInfo?.pedido || null,
        opTotal: planInfo?.qtd_total_op ?? null,
        materialCode: material.cod_mp,
        materialDescription: material.descricao_mp || "Sem descrição",
        produced,
        perUnit,
        consumption: round(produced * perUnit),
        unit: normalizeUnit(material.un),
      });
    }
  }
  return result;
}

export function createPlannedDemands(
  plano: PlanoRow[],
  ficha: FichaTecnicaRow[],
  cascadeEnabled = true,
): PlannedDemand[] {
  const byReference = new Map<string, FichaTecnicaRow[]>();
  for (const row of ficha) {
    const key = normalized(row.referencia);
    const list = byReference.get(key) || [];
    list.push(row);
    byReference.set(key, list);
  }

  const result: PlannedDemand[] = [];
  for (const plan of plano) {
    const rows = byReference.get(normalized(plan.referencia));
    if (!rows?.length) continue;
    for (const material of rows) {
      const planned = Number(plan.qtd_planejada) || 0;
      const perUnit = Number(material.qtd_por_unidade) || 0;
      const data = calculateNeedDate(plan.data, material.setor, cascadeEnabled);
      result.push({
        id: [
          data || "SEM_DATA",
          plan.referencia,
          material.setor,
          plan.op || "SEM_OP",
          material.cod_mp,
          material.un,
        ].join("¦"),
        date: data,
        reference: plan.referencia,
        sector: material.setor,
        op: plan.op || null,
        client: plan.cliente || null,
        order: plan.pedido || null,
        opTotal: plan.qtd_total_op ?? null,
        materialCode: material.cod_mp,
        materialDescription: material.descricao_mp || "Sem descrição",
        planned,
        perUnit,
        need: round(planned * perUnit),
        unit: normalizeUnit(material.un),
      });
    }
  }
  return result;
}

export function matchesDaily(row: DailyConsumption, f: Filters) {
  const searchable = normalized(
    [
      row.materialCode,
      row.materialDescription,
      row.reference,
      row.sector,
      row.date ? date(row.date) : "",
      row.unit,
    ].join(" "),
  );
  return (
    (!f.start || row.date >= f.start) &&
    (!f.end || row.date <= f.end) &&
    (!f.sector || row.sector === f.sector) &&
    (!f.reference || row.reference === f.reference) &&
    (!f.unit || row.unit === f.unit) &&
    normalized(`${row.materialCode} ${row.materialDescription}`).includes(normalized(f.material)) &&
    searchable.includes(normalized(f.search))
  );
}

export function matchesDemand(row: PlannedDemand, f: Filters) {
  const dateOk =
    !row.date || ((!f.start || row.date >= f.start) && (!f.end || row.date <= f.end));
  const searchable = normalized(
    [
      row.materialCode,
      row.materialDescription,
      row.reference,
      row.sector,
      row.date ? date(row.date) : "sem data",
      row.unit,
    ].join(" "),
  );
  return (
    dateOk &&
    (!f.sector || row.sector === f.sector) &&
    (!f.reference || row.reference === f.reference) &&
    (!f.unit || row.unit === f.unit) &&
    normalized(`${row.materialCode} ${row.materialDescription}`).includes(normalized(f.material)) &&
    searchable.includes(normalized(f.search))
  );
}

export function aggregateNeeds(
  demands: PlannedDemand[],
  estoque: EstoqueRow[],
  filters: Filters,
  followUp: FollowUpRow[] = [],
): FutureMaterialNeed[] {
  const filtered = demands.filter((row) => matchesDemand(row, filters));
  const grouped = new Map<string, PlannedDemand[]>();
  for (const row of filtered) {
    const key = joinKey(row.materialCode, row.unit);
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }

  const stockByCode = new Map<string, EstoqueRow>();
  estoque.forEach((row) => stockByCode.set(normalized(row.cod_mp), row));

  const result: FutureMaterialNeed[] = [];
  grouped.forEach((rows, id) => {
    const first = rows[0];
    const scheduled = round(
      rows.filter((r) => r.date).reduce((sum, row) => sum + row.need, 0),
    );
    const undated = round(
      rows.filter((r) => !r.date).reduce((sum, row) => sum + row.need, 0),
    );
    const total = round(scheduled + undated);
    const stockRow = stockByCode.get(normalized(first.materialCode));
    const stock = Number(stockRow?.qtd_estoque) || 0;
    const stockUnit = stockRow?.un ? normalizeUnit(stockRow.un) : null;
    const comparable = !stockRow || !stockUnit ? !stockRow : stockUnit === first.unit;
    const receipts = followUp.filter(
      (row) =>
        normalized(row.cod_mp) === normalized(first.materialCode) &&
        normalizeUnit(row.un) === first.unit &&
        Boolean(row.prev_entrega) &&
        Number(row.qtd_faturada) > 0 &&
        (!filters.start || row.prev_entrega! >= filters.start) &&
        (!filters.end || row.prev_entrega! <= filters.end),
    );
    const incoming = round(
      receipts.reduce((sum, row) => sum + (Number(row.qtd_faturada) || 0), 0),
    );
    const projectionByDate = new Map<string, { need: number; incoming: number }>();
    rows.forEach((row) => {
      if (!row.date) return;
      const event = projectionByDate.get(row.date) || { need: 0, incoming: 0 };
      event.need += row.need;
      projectionByDate.set(row.date, event);
    });
    receipts.forEach((row) => {
      if (!row.prev_entrega) return;
      const event = projectionByDate.get(row.prev_entrega) || { need: 0, incoming: 0 };
      event.incoming += Number(row.qtd_faturada) || 0;
      projectionByDate.set(row.prev_entrega, event);
    });
    let runningBalance = stock;
    const projection: StockProjectionPoint[] = [...projectionByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([projectionDate, event]) => {
        runningBalance = round(runningBalance + event.incoming - event.need);
        return {
          date: projectionDate,
          need: round(event.need),
          incoming: round(event.incoming),
          balance: runningBalance,
        };
      });
    const scheduledBalance = projection.at(-1)?.balance ?? stock;
    const projectedBalance = round(scheduledBalance - undated);
    const hasDatedRupture = projection.some((point) => point.balance < 0);

    let coverage: FutureMaterialNeed["coverage"];
    let balance: number | null;
    if (stockRow && !comparable) {
      coverage = "UNIDADE DIVERGENTE";
      balance = null;
    } else if ((!stockRow || stock <= 0) && incoming <= 0) {
      coverage = "SEM ESTOQUE";
      balance = projectedBalance;
    } else if (hasDatedRupture || projectedBalance < 0) {
      coverage = !stockRow || stock <= 0 ? "SEM ESTOQUE" : "NÃO COBRE";
      balance = projectedBalance;
    } else {
      coverage = "COBRE";
      balance = projectedBalance;
    }

    const description =
      stockRow?.descricao_mp || first.materialDescription || "Sem descrição";
    result.push({
      id,
      code: first.materialCode,
      description,
      unit: first.unit,
      stock,
      stockUnit,
      scheduled,
      undated,
      incoming,
      total,
      balance,
      coverage,
      demands: rows,
      receipts,
      projection,
    });
  });

  return result
    .filter((row) => !filters.coverage || row.coverage === filters.coverage)
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }) || a.unit.localeCompare(b.unit));
}

export function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()))].sort(
    (a, b) => a.localeCompare(b, "pt-BR", { numeric: true }),
  );
}

export function dateRangeLabel(values: Array<string | null | undefined>) {
  const range = bounds(values);
  if (!range.min && !range.max) return "Sem dados";
  if (range.min === range.max) return date(range.min);
  return `${date(range.min)} — ${date(range.max)}`;
}

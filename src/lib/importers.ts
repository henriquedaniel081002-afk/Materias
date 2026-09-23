import type {
  ApontamentoRow,
  EstoqueRow,
  FichaTecnicaRow,
  FollowUpImportMetrics,
  FollowUpRow,
  ImportResult,
  PlanoRow,
} from "../types";

interface Workbook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

interface XlsxModule {
  read: (data: ArrayBuffer, options: Record<string, unknown>) => Workbook;
  utils: {
    sheet_to_json: (
      sheet: unknown,
      options: Record<string, unknown>,
    ) => unknown[][];
  };
}

type Cell = string | number | Date | null | undefined;
type Rows = Cell[][];

let xlsxPromise: Promise<XlsxModule> | null = null;
async function getXlsx() {
  if (!xlsxPromise) {
    const source = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
    xlsxPromise = import(/* @vite-ignore */ source) as Promise<XlsxModule>;
  }
  try {
    return await xlsxPromise;
  } catch {
    xlsxPromise = null;
    throw new Error(
      "Não foi possível carregar o leitor de Excel. Verifique a conexão com a internet e tente novamente.",
    );
  }
}

async function openWorkbook(file: File) {
  const xlsx = await getXlsx();
  const data = await file.arrayBuffer();
  return {
    xlsx,
    workbook: xlsx.read(data, { type: "array", cellDates: true }),
  };
}

const text = (value: Cell) => String(value ?? "").trim();
const normalized = (value: Cell) =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const code = (value: Cell) => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
  }
  return text(value).replace(/\.0+$/, "");
};

const quantity = (value: Cell) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let raw = text(value).replace(/\s/g, "");
  if (!raw) return NaN;
  if (raw.includes(",") && raw.includes(".")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (raw.includes(",")) raw = raw.replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isoFromParts = (year: number, month: number, day: number) => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  )
    return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const excelSerialDate = (serial: number) => {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const parsed = new Date(epoch + Math.round(serial * 86400000));
  return isoFromParts(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
};

export function parseDate(value: Cell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Datas de planilha não possuem horário. UTC evita que o fuso do navegador
    // desloque a data civil em um dia.
    return isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") return excelSerialDate(value);
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    return isoFromParts(year, Number(br[2]), Number(br[1]));
  }
  return null;
}

export function localTodayIso(now = new Date()) {
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate())!;
}

const hasValues = (row: Cell[]) => row.some((value) => value !== null && value !== undefined && text(value) !== "");

const months: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};

function inferYear(fileName: string, rows?: Rows) {
  const four = fileName.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  if (four) return Number(four[1]);
  const two = fileName.match(/(?:^|\D)(\d{2})(?:\D|$)/);
  if (two) {
    const year = Number(two[1]);
    if (year >= 20 && year <= 99) return 2000 + year;
  }
  if (rows) {
    for (const row of rows.slice(0, 30)) {
      for (const value of row) {
        const parsed = parseDate(value);
        if (parsed) return Number(parsed.slice(0, 4));
      }
    }
  }
  return new Date().getFullYear();
}

function planHeaderDate(value: Cell, year: number) {
  const direct = parseDate(value);
  if (direct) return direct;
  const raw = normalized(value).replace(/ /g, "/");
  const match = raw.match(/^(\d{1,2})\/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/);
  if (!match) return null;
  return isoFromParts(year, months[match[2]], Number(match[1]));
}

function rowsFromSheet(xlsx: XlsxModule, workbook: Workbook, sheetName: string): Rows {
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  }) as Rows;
}

function namedSheet(workbook: Workbook, names: string[]) {
  return workbook.SheetNames.find((sheet) => {
    const n = normalized(sheet);
    return names.some((name) => n === normalized(name) || n.includes(normalized(name)));
  });
}

function headerIndex(row: Cell[], candidates: string[]) {
  const headers = row.map(normalized);
  for (const candidate of candidates) {
    const target = normalized(candidate);
    const index = headers.findIndex((header) => header === target);
    if (index >= 0) return index;
  }
  return -1;
}

function findHeader(rows: Rows, groups: string[][]) {
  return rows.findIndex((row) =>
    groups.every((candidates) => headerIndex(row, candidates) >= 0),
  );
}

function findSheetWithHeader(
  xlsx: XlsxModule,
  workbook: Workbook,
  groups: string[][],
  preferred: string[] = [],
) {
  const names = [
    ...preferred.map((name) => namedSheet(workbook, [name])).filter((x): x is string => Boolean(x)),
    ...workbook.SheetNames,
  ];
  for (const name of [...new Set(names)]) {
    const rows = rowsFromSheet(xlsx, workbook, name);
    const header = findHeader(rows.slice(0, 30), groups);
    if (header >= 0) return { name, rows, header };
  }
  return null;
}

function groupPlano(rows: PlanoRow[]) {
  const map = new Map<string, PlanoRow>();
  rows.forEach((row) => {
    const key = [
      row.data || "SEM_DATA",
      row.referencia,
      row.op || "SEM_OP",
      row.cliente || "",
      row.pedido || "",
      row.qtd_total_op ?? "",
    ].join("¦");
    const current = map.get(key);
    if (current) current.qtd_planejada += row.qtd_planejada;
    else map.set(key, { ...row });
  });
  return [...map.values()].sort((a, b) =>
    (a.data || "9999-99-99").localeCompare(b.data || "9999-99-99") ||
    a.referencia.localeCompare(b.referencia, "pt-BR", { numeric: true }),
  );
}

function groupApontamento(rows: ApontamentoRow[]) {
  const map = new Map<string, ApontamentoRow>();
  rows.forEach((row) => {
    const key = `${row.data}¦${row.referencia}¦${row.setor}¦${row.op || "SEM_OP"}`;
    const current = map.get(key);
    if (current) current.qtd_produzida += row.qtd_produzida;
    else map.set(key, { ...row });
  });
  return [...map.values()].sort((a, b) =>
    a.data.localeCompare(b.data) ||
    a.referencia.localeCompare(b.referencia, "pt-BR", { numeric: true }) ||
    a.setor.localeCompare(b.setor, "pt-BR"),
  );
}

function normalizeSector(value: Cell) {
  return normalized(value);
}

const importableSectors = new Set([
  "BOBINA AT",
  "BOBINA BT",
  "FERRAGEM",
  "ISOLANTE",
  "CORTE DO NUCLEO",
  "MPA",
  "CORTE DO LASER",
  "MONTAGEM FINAL",
]);

function mappedSector(value: Cell) {
  const sector = normalized(value);
  if (sector.includes("BOBINA AT")) return "BOBINA AT";
  if (sector.includes("BOBINA BT")) return "BOBINA BT";
  if (sector.includes("FERRAGEM")) return "FERRAGEM";
  if (sector.includes("ISOLANTE")) return "ISOLANTE";
  if (sector.includes("NUCLEO")) return "CORTE DO NUCLEO";
  if (sector.includes("PARTE ATIVA")) return "MPA";
  if (sector.includes("TANQUE")) return "CORTE DO LASER";
  return "MONTAGEM FINAL";
}

function groupFicha(rows: FichaTecnicaRow[]) {
  const map = new Map<string, FichaTecnicaRow>();
  rows.forEach((row) => {
    const key = [row.referencia, row.setor, row.cod_mp, row.un].join("¦");
    const current = map.get(key);
    if (current) {
      current.qtd_por_unidade += row.qtd_por_unidade;
      if (!current.grupo_mp && row.grupo_mp) current.grupo_mp = row.grupo_mp;
    } else map.set(key, { ...row });
  });
  return [...map.values()].sort((a, b) =>
    a.referencia.localeCompare(b.referencia, "pt-BR", { numeric: true }) ||
    a.setor.localeCompare(b.setor, "pt-BR") ||
    a.cod_mp.localeCompare(b.cod_mp, "pt-BR", { numeric: true }),
  );
}

export async function parsePlano(file: File): Promise<ImportResult<PlanoRow>> {
  const { xlsx, workbook } = await openWorkbook(file);
  const found = findSheetWithHeader(
    xlsx,
    workbook,
    [["Referência", "COD. REFERÊNCIA", "COD REFERENCIA"], ["Qtd Planejada", "QTD"]],
    ["PLANO", "PLANO DE PRODUÇÃO"],
  );
  if (!found) throw new Error("Não encontrei as colunas do Plano neste arquivo.");
  const headerRow = found.rows[found.header];
  const refIndex = headerIndex(headerRow, ["Referência", "COD. REFERÊNCIA", "COD REFERENCIA"]);
  const simplifiedQtyIndex = headerIndex(headerRow, ["Qtd Planejada"]);
  const opIndex = headerIndex(headerRow, ["OP"]);
  const clientIndex = headerIndex(headerRow, ["Cliente"]);
  const orderIndex = headerIndex(headerRow, ["Pedido"]);
  const opTotalIndex = headerIndex(headerRow, ["Qtd Total OP", "QTD TOTAL OP"]);
  const warnings: string[] = [];

  if (simplifiedQtyIndex >= 0) {
    const dataIndex = headerIndex(headerRow, ["Data"]);
    const rows: PlanoRow[] = [];
    found.rows.slice(found.header + 1).forEach((row) => {
      const referencia = code(row[refIndex]);
      const qtd = quantity(row[simplifiedQtyIndex]);
      if (!referencia || !Number.isFinite(qtd) || qtd === 0) return;
      if (qtd < 0) {
        warnings.push(`Referência ${referencia}: quantidade planejada negativa foi ignorada.`);
        return;
      }
      const qtdTotalOp = opTotalIndex >= 0 ? quantity(row[opTotalIndex]) : NaN;
      rows.push({
        data: dataIndex >= 0 ? parseDate(row[dataIndex]) : null,
        referencia,
        op: opIndex >= 0 ? code(row[opIndex]) || null : null,
        cliente: clientIndex >= 0 ? text(row[clientIndex]) || null : null,
        pedido: orderIndex >= 0 ? code(row[orderIndex]) || text(row[orderIndex]) || null : null,
        qtd_total_op: Number.isFinite(qtdTotalOp) ? qtdTotalOp : null,
        qtd_planejada: qtd,
      });
    });
    return { rows: groupPlano(rows), warnings, source: "simplificado" };
  }

  const totalIndex = headerIndex(headerRow, ["QTD", "QTDE", "QUANTIDADE"]);
  if (totalIndex < 0) throw new Error("A coluna QTD total do Plano não foi encontrada.");
  const year = inferYear(file.name, found.rows);
  const dateColumns = headerRow
    .map((value, index) => ({ index, date: planHeaderDate(value, year) }))
    .filter((item): item is { index: number; date: string } => Boolean(item.date));
  if (!dateColumns.length) warnings.push("Nenhuma coluna de data foi identificada no Plano.");

  const rows: PlanoRow[] = [];
  found.rows.slice(found.header + 1).forEach((row, rowOffset) => {
    const referencia = code(row[refIndex]);
    const total = quantity(row[totalIndex]);
    if (!referencia || !Number.isFinite(total)) return;
    if (total < 0) {
      warnings.push(`Referência ${referencia}: QTD total negativa foi ignorada.`);
      return;
    }
    let scheduled = 0;
    const op = opIndex >= 0 ? code(row[opIndex]) || null : null;
    const cliente = clientIndex >= 0 ? text(row[clientIndex]) || null : null;
    const pedido = orderIndex >= 0 ? code(row[orderIndex]) || text(row[orderIndex]) || null : null;
    dateColumns.forEach(({ index, date }) => {
      const value = quantity(row[index]);
      if (!Number.isFinite(value) || value === 0) return;
      if (value < 0) {
        warnings.push(`Referência ${referencia}: quantidade programada negativa em ${date} foi ignorada.`);
        return;
      }
      scheduled += value;
      rows.push({ data: date, referencia, op, cliente, pedido, qtd_total_op: total, qtd_planejada: value });
    });
    const remainder = total - scheduled;
    if (remainder > 1e-9) {
      rows.push({ data: null, referencia, op, cliente, pedido, qtd_total_op: total, qtd_planejada: remainder });
    }
    else if (remainder < -1e-9)
      warnings.push(
        `Linha ${found.header + rowOffset + 2}: ${referencia} possui ${scheduled} programado para QTD total ${total}.`,
      );
  });
  return { rows: groupPlano(rows), warnings, source: "original" };
}

export async function parseApontamento(
  file: File,
  month?: number,
  year?: number,
): Promise<ImportResult<ApontamentoRow>> {
  const { xlsx, workbook } = await openWorkbook(file);
  const found = findSheetWithHeader(
    xlsx,
    workbook,
    [["Data", "DATA PRODUZIDA"], ["Referência", "CÓD. PRODUTO", "COD PRODUTO"], ["Setor"]],
    ["APONTAMENTO", "APONTAMENTO FINAL"],
  );
  if (!found) throw new Error("Não encontrei as colunas do Apontamento neste arquivo.");
  const headerRow = found.rows[found.header];
  const dataIndex = headerIndex(headerRow, ["Data", "DATA PRODUZIDA"]);
  const refIndex = headerIndex(headerRow, ["Referência", "CÓD. PRODUTO", "COD PRODUTO"]);
  const sectorIndex = headerIndex(headerRow, ["Setor"]);
  const qtyIndex = headerIndex(headerRow, ["Qtd Produzida"]);
  const opIndex = headerIndex(headerRow, ["OP"]);
  const result: ApontamentoRow[] = [];
  const ignoredBySector = new Map<string, number>();
  let invalidQuantity = 0;

  found.rows.slice(found.header + 1).forEach((row) => {
    const data = parseDate(row[dataIndex]);
    const referencia = code(row[refIndex]);
    const setor = normalizeSector(row[sectorIndex]);
    if (!data || !referencia || !setor) return;
    if (month && Number(data.slice(5, 7)) !== month) return;
    if (year && Number(data.slice(0, 4)) !== year) return;

    // Regra definida para a base: setores sem mapeamento na Ficha Técnica
    // não são enviados ao Supabase.
    if (!importableSectors.has(setor)) {
      ignoredBySector.set(setor, (ignoredBySector.get(setor) || 0) + 1);
      return;
    }

    const qtd = qtyIndex >= 0 ? quantity(row[qtyIndex]) : 1;
    if (!Number.isFinite(qtd) || qtd <= 0) {
      invalidQuantity += 1;
      return;
    }
    result.push({
      data,
      referencia,
      setor,
      op: opIndex >= 0 ? code(row[opIndex]) || null : null,
      qtd_produzida: qtd,
    });
  });

  const warnings = [...ignoredBySector.entries()].map(
    ([setor, count]) => `${count} linha(s) do setor ${setor} foram ignoradas por não fazerem parte do mapeamento da Ficha Técnica.`,
  );
  if (invalidQuantity) warnings.push(`${invalidQuantity} linha(s) com quantidade inválida foram ignoradas.`);

  return {
    rows: groupApontamento(result),
    warnings,
    source: qtyIndex >= 0 ? "simplificado" : "original",
  };
}

export async function parseFichaTecnica(
  file: File,
): Promise<ImportResult<FichaTecnicaRow>> {
  const { xlsx, workbook } = await openWorkbook(file);
  const found = findSheetWithHeader(
    xlsx,
    workbook,
    [
      ["Referência"],
      ["Setor", "Descrição PI"],
      ["Cód. MP", "COD MP"],
      ["Qtd por Unidade", "Quantidade"],
      ["UN"],
    ],
    ["FICHA TECNICA", "CONSOLIDADO"],
  );
  if (!found) throw new Error("Não encontrei as colunas da Ficha Técnica neste arquivo.");
  const headerRow = found.rows[found.header];
  const refIndex = headerIndex(headerRow, ["Referência"]);
  const sectorIndex = headerIndex(headerRow, ["Setor"]);
  const piIndex = headerIndex(headerRow, ["Descrição PI"]);
  const codeIndex = headerIndex(headerRow, ["Cód. MP", "COD MP"]);
  const descIndex = headerIndex(headerRow, ["Descrição MP"]);
  const groupIndex = headerIndex(headerRow, ["Grupo MP"]);
  const qtyIndex = headerIndex(headerRow, ["Qtd por Unidade", "Quantidade"]);
  const unitIndex = headerIndex(headerRow, ["UN"]);
  const simplified = sectorIndex >= 0 && headerIndex(headerRow, ["Qtd por Unidade"]) >= 0;
  const result: FichaTecnicaRow[] = [];
  const dataRows = found.rows.slice(found.header + 1).filter(hasValues);
  let ignored = 0;

  dataRows.forEach((row) => {
    const referencia = code(row[refIndex]);
    const codMp = code(row[codeIndex]);
    const qtd = quantity(row[qtyIndex]);
    const un = text(row[unitIndex]).toUpperCase();
    if (!referencia || !codMp || !un || !Number.isFinite(qtd) || qtd < 0) {
      ignored += 1;
      return;
    }
    result.push({
      referencia,
      setor: simplified ? normalizeSector(row[sectorIndex]) : mappedSector(row[piIndex]),
      cod_mp: codMp,
      descricao_mp: descIndex >= 0 ? text(row[descIndex]) || null : null,
      grupo_mp: groupIndex >= 0 ? text(row[groupIndex]) || null : null,
      qtd_por_unidade: qtd,
      un,
    });
  });

  const grouped = groupFicha(result);
  return {
    rows: grouped,
    warnings: [],
    source: simplified ? "simplificado" : "original",
    metrics: {
      linhas_lidas: dataRows.length,
      linhas_validas: result.length,
      linhas_importadas: grouped.length,
      linhas_ignoradas: ignored,
      erros: 0,
    },
  };
}

export async function parseEstoque(file: File): Promise<ImportResult<EstoqueRow>> {
  const { xlsx, workbook } = await openWorkbook(file);
  const found = findSheetWithHeader(
    xlsx,
    workbook,
    [["Código", "cod_mp"], ["Descrição", "descricao_mp"], ["Qtd. Pd", "qtd_estoque"], ["Und. Pd", "UN"]],
    [],
  );
  if (!found) throw new Error("Não encontrei as colunas do Estoque neste arquivo.");
  const headerRow = found.rows[found.header];
  const codeIndex = headerIndex(headerRow, ["Código", "cod_mp"]);
  const descIndex = headerIndex(headerRow, ["Descrição", "descricao_mp"]);
  const qtyIndex = headerIndex(headerRow, ["Qtd. Pd", "qtd_estoque"]);
  const unitIndex = headerIndex(headerRow, ["Und. Pd", "UN"]);
  const byCode = new Map<string, EstoqueRow>();
  const warnings: string[] = [];
  const dataRows = found.rows.slice(found.header + 1).filter(hasValues);
  let valid = 0;
  let ignored = 0;

  dataRows.forEach((row) => {
    const codMp = code(row[codeIndex]);
    const qtd = quantity(row[qtyIndex]);
    const un = text(row[unitIndex]).toUpperCase() || null;
    if (!codMp || !Number.isFinite(qtd) || qtd < 0) {
      ignored += 1;
      return;
    }
    valid += 1;
    const item: EstoqueRow = {
      cod_mp: codMp,
      descricao_mp: text(row[descIndex]) || null,
      qtd_estoque: qtd,
      un,
    };
    const previous = byCode.get(codMp);
    if (!previous) byCode.set(codMp, item);
    else if ((previous.un || "") === (item.un || "")) {
      previous.qtd_estoque += item.qtd_estoque;
      if (!previous.descricao_mp) previous.descricao_mp = item.descricao_mp;
      warnings.push(`Código ${codMp} apareceu mais de uma vez no estoque e foi consolidado.`);
    } else {
      warnings.push(
        `Código ${codMp} apareceu com unidades diferentes (${previous.un || "sem UN"} / ${item.un || "sem UN"}) e a primeira linha foi mantida.`,
      );
    }
  });

  return {
    rows: [...byCode.values()].sort((a, b) => a.cod_mp.localeCompare(b.cod_mp, "pt-BR", { numeric: true })),
    warnings,
    source: headerIndex(headerRow, ["qtd_estoque"]) >= 0 ? "simplificado" : "original",
    metrics: {
      linhas_lidas: dataRows.length,
      linhas_validas: valid,
      linhas_importadas: byCode.size,
      linhas_ignoradas: ignored,
      erros: 0,
    },
  };
}

export function parseFollowUpRows(
  rows: Rows,
  today = localTodayIso(),
): ImportResult<FollowUpRow> {
  const headerRow = rows[0] || [];
  const codeIndex = headerIndex(headerRow, ["COD ITEM"]);
  const descIndex = headerIndex(headerRow, ["DESCRIÇÃO ITEM"]);
  const orderQtyIndex = headerIndex(headerRow, ["QTD"]);
  const unitIndex = headerIndex(headerRow, ["UN"]);
  const billedIndex = headerIndex(headerRow, ["QTD FATURADA"]);
  const deliveryIndex = headerIndex(headerRow, ["PREV ENTREGA"]);
  const carrierEntryIndex = headerIndex(headerRow, ["DT ENT TRANSP"]);
  const carrierExitIndex = headerIndex(headerRow, ["DT SAIDA TRANSP"]);
  if ([codeIndex, descIndex, orderQtyIndex, unitIndex, billedIndex, deliveryIndex].some((index) => index < 0)) {
    throw new Error("Não encontrei as colunas do FOLLOW UP neste arquivo.");
  }
  const dataRows = rows.slice(1).filter(hasValues);
  const result: FollowUpRow[] = [];
  const metrics: FollowUpImportMetrics = {
    linhas_lidas: dataRows.length,
    linhas_faturadas: 0,
    linhas_com_previsao_futura: 0,
    linhas_faturadas_sem_previsao: 0,
    ignoradas_previsao_ate_hoje: 0,
    ignoradas_sem_qtd_faturada: 0,
    erros: 0,
  };

  dataRows.forEach((row) => {
    const codMp = code(row[codeIndex]);
    const billedRaw = row[billedIndex];
    const billed = quantity(billedRaw);
    if (!codMp) {
      metrics.erros += 1;
      return;
    }
    if (text(billedRaw) === "" || billed === 0) {
      metrics.ignoradas_sem_qtd_faturada += 1;
      return;
    }
    if (!Number.isFinite(billed) || billed < 0) {
      metrics.erros += 1;
      return;
    }
    metrics.linhas_faturadas += 1;

    const deliveryRaw = row[deliveryIndex];
    const delivery = parseDate(deliveryRaw);
    if (text(deliveryRaw) !== "" && !delivery) {
      metrics.erros += 1;
      return;
    }
    if (delivery && delivery <= today) {
      metrics.ignoradas_previsao_ate_hoje += 1;
      return;
    }

    const orderQtyRaw = row[orderQtyIndex];
    const orderQty = quantity(orderQtyRaw);
    if (text(orderQtyRaw) !== "" && (!Number.isFinite(orderQty) || orderQty < 0)) metrics.erros += 1;

    const parseOptionalDate = (value: Cell) => {
      const parsed = parseDate(value);
      if (text(value) !== "" && !parsed) metrics.erros += 1;
      return parsed;
    };

    if (delivery) metrics.linhas_com_previsao_futura += 1;
    else metrics.linhas_faturadas_sem_previsao += 1;

    result.push({
      cod_mp: codMp,
      descricao_mp: text(row[descIndex]) || null,
      qtd_pedido: Number.isFinite(orderQty) && orderQty >= 0 ? orderQty : null,
      un: text(row[unitIndex]).toUpperCase() || null,
      qtd_faturada: billed,
      prev_entrega: delivery,
      dt_ent_transp: carrierEntryIndex >= 0 ? parseOptionalDate(row[carrierEntryIndex]) : null,
      dt_saida_transp: carrierExitIndex >= 0 ? parseOptionalDate(row[carrierExitIndex]) : null,
    });
  });

  const warnings = [
    metrics.linhas_faturadas_sem_previsao
      ? `${metrics.linhas_faturadas_sem_previsao} linha(s) faturada(s) sem previsão foram mantidas apenas para acompanhamento.`
      : "",
    metrics.ignoradas_previsao_ate_hoje
      ? `${metrics.ignoradas_previsao_ate_hoje} linha(s) com PREV ENTREGA menor ou igual a ${today} foram ignoradas para evitar duplicidade no estoque atual.`
      : "",
    metrics.ignoradas_sem_qtd_faturada
      ? `${metrics.ignoradas_sem_qtd_faturada} linha(s) sem QTD FATURADA positiva foram ignoradas.`
      : "",
    metrics.erros ? `${metrics.erros} erro(s) de código, quantidade ou data foram identificados.` : "",
  ].filter(Boolean);

  return { rows: result, warnings, source: "original", metrics: { ...metrics } };
}

export async function parseFollowUp(
  file: File,
  today = localTodayIso(),
): Promise<ImportResult<FollowUpRow>> {
  const { xlsx, workbook } = await openWorkbook(file);
  const found = findSheetWithHeader(
    xlsx,
    workbook,
    [["COD ITEM"], ["DESCRIÇÃO ITEM"], ["QTD"], ["UN"], ["QTD FATURADA"], ["PREV ENTREGA"]],
    ["FOLLOW UP"],
  );
  if (!found) throw new Error("Não encontrei as colunas do FOLLOW UP neste arquivo.");
  return parseFollowUpRows(found.rows.slice(found.header), today);
}

export function filterFichaByPlan(
  fichaOriginal: ImportResult<FichaTecnicaRow>,
  references: Iterable<string>,
): ImportResult<FichaTecnicaRow> {
  const planReferences = new Set([...references].map(normalized));
  const ignoredFichaRows = fichaOriginal.rows.filter(
    (row) => !planReferences.has(normalized(row.referencia)),
  );
  const ignoredFichaReferences = new Set(ignoredFichaRows.map((row) => normalized(row.referencia)));
  const fichaRows = fichaOriginal.rows.filter((row) => planReferences.has(normalized(row.referencia)));
  return {
    ...fichaOriginal,
    rows: fichaRows,
    warnings: [
      ...fichaOriginal.warnings,
      ignoredFichaRows.length
        ? `${ignoredFichaRows.length.toLocaleString("pt-BR")} linha(s) de ${ignoredFichaReferences.size.toLocaleString("pt-BR")} referência(s) da Ficha Técnica foram ignoradas por não existirem no Plano.`
        : "",
    ].filter(Boolean),
    metrics: {
      ...(fichaOriginal.metrics || {}),
      linhas_importadas: fichaRows.length,
      linhas_ignoradas_fora_plano: ignoredFichaRows.length,
      referencias_ignoradas_fora_plano: ignoredFichaReferences.size,
    },
  };
}

export async function parseGeneralBundle(file: File, today = localTodayIso()) {
  const plano = await parsePlano(file);
  const [apontamento, fichaOriginal, estoque, followUp] = await Promise.all([
    parseApontamento(file),
    parseFichaTecnica(file),
    parseEstoque(file),
    parseFollowUp(file, today),
  ]);
  const ficha = filterFichaByPlan(fichaOriginal, plano.rows.map((row) => row.referencia));

  if ([plano.source, apontamento.source, ficha.source].some((source) => source !== "simplificado")) {
    throw new Error("O arquivo selecionado não possui as três abas simplificadas esperadas.");
  }
  return { plano, apontamento, ficha, estoque, followUp };
}

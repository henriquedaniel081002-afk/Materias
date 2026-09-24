import type {
  ApontamentoRow,
  DatabaseData,
  EstoqueRow,
  FichaTecnicaRow,
  FollowUpRow,
  PlanoRow,
} from "../types";

const url = (import.meta.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = import.meta.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const supabaseConfigured = Boolean(url && key);

const headers = (extra: Record<string, string> = {}) => ({
  // Publishable keys (sb_publishable_...) are API keys, not JWTs.
  // They must be sent in the apikey header. Authorization is reserved
  // for a signed-in user's JWT and is intentionally omitted here.
  apikey: key,
  "Content-Type": "application/json",
  ...extra,
});

async function parseError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string; details?: string; hint?: string };
    return [body.message, body.details, body.hint].filter(Boolean).join(" · ");
  } catch {
    return text || `${response.status} ${response.statusText}`;
  }
}

async function request(path: string, init: RequestInit = {}) {
  if (!supabaseConfigured) {
    throw new Error("Supabase não configurado. Verifique o arquivo .env.");
  }
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  if (!response.ok) {
    const detail = await parseError(response);
    throw new Error(`Supabase ${response.status}: ${detail || response.statusText}`);
  }
  return response;
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const pageSize = 1000;
  const first = await request(
    `${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=0`,
    { headers: headers({ Prefer: "count=exact" }) },
  );
  const firstRows = (await first.json()) as T[];
  const contentRange = first.headers.get("content-range") || "";
  const totalText = contentRange.split("/")[1];
  const total = totalText && totalText !== "*" ? Number(totalText) : NaN;

  if (!Number.isFinite(total)) {
    const rows = [...firstRows];
    let offset = pageSize;
    while (rows.length && rows.length % pageSize === 0) {
      const response = await request(
        `${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${offset}`,
      );
      const chunk = (await response.json()) as T[];
      rows.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }
    return rows;
  }

  const offsets: number[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) offsets.push(offset);
  const rows = [...firstRows];
  const concurrency = 6;
  for (let i = 0; i < offsets.length; i += concurrency) {
    const batch = offsets.slice(i, i + concurrency);
    const chunks = await Promise.all(
      batch.map(async (offset) => {
        const response = await request(
          `${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${offset}`,
        );
        return (await response.json()) as T[];
      }),
    );
    chunks.forEach((chunk) => rows.push(...chunk));
  }
  return rows;
}

const numeric = <T extends Record<string, unknown>>(row: T, fields: string[]) => {
  const result = { ...row } as Record<string, unknown>;
  fields.forEach((field) => {
    const value = Number(result[field]);
    result[field] = Number.isFinite(value) ? value : 0;
  });
  return result as T;
};

export async function loadDatabase(): Promise<DatabaseData> {
  const [planoRaw, apontamentoRaw, fichaRaw, estoqueRaw, followUpRaw] = await Promise.all([
    fetchAll<Record<string, unknown>>(
      "plano",
      "data,referencia,op,cliente,pedido,qtd_total_op,qtd_planejada",
    ),
    fetchAll<Record<string, unknown>>(
      "apontamento",
      "data,referencia,setor,op,qtd_produzida",
    ),
    fetchAll<Record<string, unknown>>(
      "ficha_tecnica",
      "referencia,setor,cod_mp,descricao_mp,grupo_mp,qtd_por_unidade,un",
    ),
    fetchAll<Record<string, unknown>>(
      "estoque",
      "cod_mp,descricao_mp,qtd_estoque,un",
    ),
    fetchAll<Record<string, unknown>>(
      "follow_up",
      "cod_mp,descricao_mp,qtd_pedido,un,numero_pedido,qtd_a_faturar,qtd_faturada,mes_atendimento,prev_entrega,dt_ent_transp,dt_saida_transp",
    ),
  ]);

  return {
    plano: planoRaw.map((r) => {
      const parsed = numeric(r, ["qtd_planejada"]);
      const opTotal = Number(r.qtd_total_op);
      parsed.qtd_total_op = r.qtd_total_op === null || r.qtd_total_op === undefined
        ? null
        : Number.isFinite(opTotal)
          ? opTotal
          : null;
      return parsed as unknown as PlanoRow;
    }),
    apontamento: apontamentoRaw.map(
      (r) => numeric(r, ["qtd_produzida"]) as unknown as ApontamentoRow,
    ),
    fichaTecnica: fichaRaw.map(
      (r) => numeric(r, ["qtd_por_unidade"]) as unknown as FichaTecnicaRow,
    ),
    estoque: estoqueRaw.map(
      (r) => numeric(r, ["qtd_estoque"]) as unknown as EstoqueRow,
    ),
    followUp: followUpRaw.map((r) => {
      const parsed = numeric(r, ["qtd_faturada"]);
      parsed.qtd_pedido = r.qtd_pedido === null || r.qtd_pedido === undefined
        ? null
        : Number(r.qtd_pedido);
      parsed.qtd_a_faturar = r.qtd_a_faturar === null || r.qtd_a_faturar === undefined
        ? null
        : Number(r.qtd_a_faturar);
      return parsed as unknown as FollowUpRow;
    }),
  };
}

const deleteColumn: Record<string, string> = {
  plano: "referencia",
  apontamento: "referencia",
  ficha_tecnica: "referencia",
  estoque: "cod_mp",
  follow_up: "cod_mp",
};

export async function replaceTable<T extends object>(
  table: "plano" | "apontamento" | "ficha_tecnica" | "estoque" | "follow_up",
  rows: T[],
  onProgress?: (value: number) => void,
  allowEmpty = false,
) {
  if (!rows.length && !allowEmpty) throw new Error("O arquivo não contém registros válidos para importar.");

  const column = deleteColumn[table];
  await request(`${table}?${column}=not.is.null`, { method: "DELETE" });
  onProgress?.(5);

  if (!rows.length) {
    onProgress?.(100);
    return;
  }

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await request(table, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(chunk),
    });
    onProgress?.(5 + Math.round(((i + chunk.length) / rows.length) * 95));
  }
  onProgress?.(100);
}

export async function testConnection() {
  await testGeneralImportTables();
  return true;
}

export async function testGeneralImportTables() {
  await Promise.all(
    ["plano", "apontamento", "ficha_tecnica", "estoque", "follow_up"].map((table) =>
      request(`${table}?select=*&limit=0`),
    ),
  );
  return true;
}

export async function loadPlanReferences() {
  const rows = await fetchAll<{ referencia: string }>("plano", "referencia");
  return rows.map((row) => row.referencia);
}

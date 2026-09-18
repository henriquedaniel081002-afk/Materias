export type Unit = string;

export interface PlanoRow {
  data: string | null;
  referencia: string;
  qtd_planejada: number;
}

export interface ApontamentoRow {
  data: string;
  referencia: string;
  setor: string;
  qtd_produzida: number;
}

export interface FichaTecnicaRow {
  referencia: string;
  setor: string;
  cod_mp: string;
  descricao_mp: string | null;
  grupo_mp: string | null;
  qtd_por_unidade: number;
  un: string;
}

export interface EstoqueRow {
  cod_mp: string;
  descricao_mp: string | null;
  qtd_estoque: number;
  un: string | null;
}

export interface FollowUpRow {
  cod_mp: string;
  descricao_mp: string | null;
  qtd_pedido: number | null;
  un: string | null;
  qtd_faturada: number;
  prev_entrega: string | null;
  dt_ent_transp: string | null;
  dt_saida_transp: string | null;
}

export interface DailyConsumption {
  id: string;
  date: string;
  reference: string;
  sector: string;
  materialCode: string;
  materialDescription: string;
  produced: number;
  perUnit: number;
  consumption: number;
  unit: string;
}

export interface PlannedDemand {
  id: string;
  date: string | null;
  reference: string;
  sector: string;
  materialCode: string;
  materialDescription: string;
  planned: number;
  perUnit: number;
  need: number;
  unit: string;
}

export type Coverage =
  | "COBRE"
  | "NÃO COBRE"
  | "SEM ESTOQUE"
  | "UNIDADE DIVERGENTE";

export interface FutureMaterialNeed {
  id: string;
  code: string;
  description: string;
  unit: string;
  stock: number;
  stockUnit: string | null;
  scheduled: number;
  undated: number;
  incoming: number;
  total: number;
  balance: number | null;
  coverage: Coverage;
  demands: PlannedDemand[];
  receipts: FollowUpRow[];
  projection: StockProjectionPoint[];
}

export interface StockProjectionPoint {
  date: string;
  need: number;
  incoming: number;
  balance: number;
}

export interface Filters {
  start: string;
  end: string;
  sector: string;
  reference: string;
  material: string;
  group?: string;
  unit: string;
  coverage: string;
  search: string;
}

export interface DatabaseData {
  plano: PlanoRow[];
  apontamento: ApontamentoRow[];
  fichaTecnica: FichaTecnicaRow[];
  estoque: EstoqueRow[];
  followUp: FollowUpRow[];
}

export interface TableCounts {
  plano: number;
  apontamento: number;
  ficha_tecnica: number;
  estoque: number;
  follow_up: number;
}

export type ImportKind = "plano" | "apontamento" | "ficha_tecnica" | "estoque";

export interface ImportResult<T> {
  rows: T[];
  warnings: string[];
  source: "simplificado" | "original";
  metrics?: Record<string, number>;
}

export interface FollowUpImportMetrics {
  linhas_lidas: number;
  linhas_faturadas: number;
  linhas_com_previsao_futura: number;
  linhas_faturadas_sem_previsao: number;
  ignoradas_previsao_ate_hoje: number;
  ignoradas_sem_qtd_faturada: number;
  erros: number;
}

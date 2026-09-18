import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DatabaseData, DailyConsumption, PlannedDemand, TableCounts } from "../types";
import { createDailyConsumption, createPlannedDemands } from "../services/calculations";
import { loadDatabase, supabaseConfigured } from "../lib/supabase";

export interface DataContextValue {
  data: DatabaseData;
  daily: DailyConsumption[];
  plannedDemands: PlannedDemand[];
  counts: TableCounts;
  loading: boolean;
  error: string | null;
  connected: boolean;
  version: number;
  refresh: () => Promise<void>;
}

const emptyData: DatabaseData = {
  plano: [],
  apontamento: [],
  fichaTecnica: [],
  estoque: [],
  followUp: [],
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DatabaseData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionValidated, setConnectionValidated] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConnectionValidated(false);
    try {
      const loaded = await loadDatabase();
      setData(loaded);
      setConnectionValidated(true);
      setVersion((value) => value + 1);
    } catch (err) {
      setData(emptyData);
      setConnectionValidated(false);
      setError(err instanceof Error ? err.message : "Falha ao carregar dados do Supabase.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const daily = useMemo(
    () => createDailyConsumption(data.apontamento, data.fichaTecnica),
    [data.apontamento, data.fichaTecnica],
  );
  const plannedDemands = useMemo(
    () => createPlannedDemands(data.plano, data.fichaTecnica),
    [data.plano, data.fichaTecnica],
  );
  const counts = useMemo<TableCounts>(
    () => ({
      plano: data.plano.length,
      apontamento: data.apontamento.length,
      ficha_tecnica: data.fichaTecnica.length,
      estoque: data.estoque.length,
      follow_up: data.followUp.length,
    }),
    [data],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      daily,
      plannedDemands,
      counts,
      loading,
      error,
      connected: supabaseConfigured && connectionValidated && !error,
      version,
      refresh,
    }),
    [data, daily, plannedDemands, counts, loading, error, connectionValidated, version, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData deve ser usado dentro de DataProvider.");
  return context;
}

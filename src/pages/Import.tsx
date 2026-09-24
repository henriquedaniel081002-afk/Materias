import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Database,
  FileSpreadsheet,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  TriangleAlert,
  Boxes,
  Factory,
  ClipboardList,
  PackageOpen,
  Truck,
} from "lucide-react";
import { useData } from "../context/DataContext";
import {
  parseApontamento,
  parseEstoque,
  parseFichaTecnica,
  filterFichaByPlan,
  parsePlano,
  parseGeneralBundle,
} from "../lib/importers";
import {
  loadPlanReferences,
  replaceTable,
  testConnection,
  testGeneralImportTables,
} from "../lib/supabase";
import type { ImportKind } from "../types";

interface TaskState {
  busy: boolean;
  progress: number;
  message: string;
  error: string | null;
  warnings: string[];
  report: string[];
}

const idle = (): TaskState => ({
  busy: false,
  progress: 0,
  message: "",
  error: null,
  warnings: [],
  report: [],
});

function ImportCard({
  icon,
  title,
  description,
  hint,
  accept = ".xlsx,.xlsm",
  disabled,
  task,
  onFile,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  hint: string;
  accept?: string;
  disabled?: boolean;
  task: TaskState;
  onFile: (file: File) => Promise<void>;
  children?: ReactNode;
}) {
  const handle = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await onFile(file);
  };
  return (
    <article className="import-card">
      <div className="import-card-icon">{icon}</div>
      <div className="import-card-copy">
        <h3>{title}</h3>
        <p>{description}</p>
        <small>{hint}</small>
      </div>
      {children}
      <label className={`upload-button ${disabled || task.busy ? "disabled" : ""}`}>
        <UploadCloud size={16} />
        {task.busy ? "Importando..." : "Selecionar Excel"}
        <input
          type="file"
          accept={accept}
          disabled={disabled || task.busy}
          onChange={handle}
        />
      </label>
      {task.busy && (
        <div className="import-progress" aria-label={`Progresso ${task.progress}%`}>
          <span style={{ width: `${task.progress}%` }} />
        </div>
      )}
      {task.message && !task.error && (
        <p className="import-success">
          <CheckCircle2 size={14} /> {task.message}
        </p>
      )}
      {task.error && (
        <p className="import-error" role="alert">
          <TriangleAlert size={14} /> {task.error}
        </p>
      )}
      {!!task.warnings.length && (
        <details className="import-warnings">
          <summary>{task.warnings.length} aviso(s) de validação</summary>
          <ul>
            {task.warnings.slice(0, 20).map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
          {task.warnings.length > 20 && <p>Exibindo os primeiros 20 avisos.</p>}
        </details>
      )}
      {!!task.report.length && (
        <details className="import-warnings">
          <summary>Relatório da importação</summary>
          <ul>
            {task.report.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      )}
    </article>
  );
}

export default function ImportPage() {
  const { counts, connected, error: loadError, refresh } = useData();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [connectionMessage, setConnectionMessage] = useState("");
  const [tasks, setTasks] = useState<Record<string, TaskState>>({
    bundle: idle(),
    plano: idle(),
    apontamento: idle(),
    ficha_tecnica: idle(),
    estoque: idle(),
  });

  const setTask = (key: string, update: Partial<TaskState>) =>
    setTasks((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));

  const tableSummary = useMemo(
    () => [
      { label: "Plano", value: counts.plano, icon: <ClipboardList size={16} /> },
      { label: "Apontamento", value: counts.apontamento, icon: <Factory size={16} /> },
      { label: "Ficha técnica", value: counts.ficha_tecnica, icon: <Boxes size={16} /> },
      { label: "Estoque", value: counts.estoque, icon: <PackageOpen size={16} /> },
      { label: "FOLLOW UP", value: counts.follow_up, icon: <Truck size={16} /> },
    ],
    [counts],
  );

  const runSingle = async (kind: ImportKind, file: File) => {
    const taskKey = kind;
    setTask(taskKey, { busy: true, progress: 1, message: "", error: null, warnings: [], report: [] });
    try {
      if (kind === "plano") {
        const parsed = await parsePlano(file);
        setTask(taskKey, { progress: 4, warnings: parsed.warnings });
        await replaceTable("plano", parsed.rows, (progress) => setTask(taskKey, { progress }));
        setTask(taskKey, { message: `${parsed.rows.length.toLocaleString("pt-BR")} registros importados (${parsed.source}).` });
      } else if (kind === "apontamento") {
        const parsed = await parseApontamento(file, month, year);
        setTask(taskKey, { progress: 4, warnings: parsed.warnings });
        await replaceTable("apontamento", parsed.rows, (progress) => setTask(taskKey, { progress }));
        setTask(taskKey, { message: `${parsed.rows.length.toLocaleString("pt-BR")} registros importados para ${String(month).padStart(2, "0")}/${year}.` });
      } else if (kind === "ficha_tecnica") {
        const planReferences = await loadPlanReferences();
        if (!planReferences.length) {
          throw new Error("Importe o Plano antes da Ficha Técnica.");
        }
        const parsed = filterFichaByPlan(await parseFichaTecnica(file), planReferences);
        setTask(taskKey, { progress: 4, warnings: parsed.warnings });
        await replaceTable("ficha_tecnica", parsed.rows, (progress) => setTask(taskKey, { progress }));
        setTask(taskKey, {
          message: `${parsed.rows.length.toLocaleString("pt-BR")} registros do Plano consolidados e importados.`,
          report: [
            `FICHA TÉCNICA — importadas: ${parsed.metrics?.linhas_importadas || 0} · ignoradas fora do Plano: ${parsed.metrics?.linhas_ignoradas_fora_plano || 0} linha(s) / ${parsed.metrics?.referencias_ignoradas_fora_plano || 0} referência(s)`,
          ],
        });
      } else {
        const parsed = await parseEstoque(file);
        setTask(taskKey, { progress: 4, warnings: parsed.warnings });
        await replaceTable("estoque", parsed.rows, (progress) => setTask(taskKey, { progress }));
        setTask(taskKey, { message: `${parsed.rows.length.toLocaleString("pt-BR")} materiais importados.` });
      }
      await refresh();
    } catch (error) {
      setTask(taskKey, {
        error: error instanceof Error ? error.message : "Falha na importação.",
      });
    } finally {
      setTask(taskKey, { busy: false });
    }
  };

  const runBundle = async (file: File) => {
    setTask("bundle", { busy: true, progress: 1, message: "", error: null, warnings: [], report: [] });
    try {
      const parsed = await parseGeneralBundle(file);
      const warnings = [
        ...parsed.plano.warnings,
        ...parsed.apontamento.warnings,
        ...parsed.ficha.warnings,
        ...parsed.estoque.warnings,
        ...parsed.followUp.warnings,
      ];
      const inventory = parsed.estoque.metrics || {};
      const followUp = parsed.followUp.metrics || {};
      const ficha = parsed.ficha.metrics || {};
      const report = [
        `ESTOQUE — lidas: ${inventory.linhas_lidas || 0} · válidas: ${inventory.linhas_validas || 0} · importadas: ${inventory.linhas_importadas || 0} · ignoradas: ${inventory.linhas_ignoradas || 0} · erros: ${inventory.erros || 0}`,
        `FOLLOW UP — lidas: ${followUp.linhas_lidas || 0} · faturadas: ${followUp.linhas_faturadas || 0} · pedidos em aberto: ${followUp.linhas_pedidos_abertos || 0} · previsão futura: ${followUp.linhas_com_previsao_futura || 0} · faturadas sem previsão: ${followUp.linhas_faturadas_sem_previsao || 0}`,
        `FOLLOW UP — faturadas desconsideradas por previsão até hoje: ${followUp.ignoradas_previsao_ate_hoje || 0} · sem faturamento/pedido aberto: ${followUp.ignoradas_sem_qtd_faturada || 0} · erros: ${followUp.erros || 0}`,
        `FICHA TÉCNICA — importadas: ${ficha.linhas_importadas || 0} · ignoradas fora do Plano: ${ficha.linhas_ignoradas_fora_plano || 0} linha(s) / ${ficha.referencias_ignoradas_fora_plano || 0} referência(s)`,
      ];
      setTask("bundle", { progress: 5, warnings });
      // Verifica as cinco tabelas antes de apagar qualquer base. Assim, a falta
      // da migration do FOLLOW UP não deixa uma importação pela metade.
      await testGeneralImportTables();
      await replaceTable("plano", parsed.plano.rows, (p) => setTask("bundle", { progress: 5 + Math.round(p * 0.15) }));
      await replaceTable("apontamento", parsed.apontamento.rows, (p) => setTask("bundle", { progress: 20 + Math.round(p * 0.15) }));
      await replaceTable("ficha_tecnica", parsed.ficha.rows, (p) => setTask("bundle", { progress: 35 + Math.round(p * 0.30) }));
      await replaceTable("estoque", parsed.estoque.rows, (p) => setTask("bundle", { progress: 65 + Math.round(p * 0.15) }));
      await replaceTable("follow_up", parsed.followUp.rows, (p) => setTask("bundle", { progress: 80 + Math.round(p * 0.20) }), true);
      setTask("bundle", {
        progress: 100,
        report,
        message: `Base carregada: ${parsed.plano.rows.length.toLocaleString("pt-BR")} plano · ${parsed.apontamento.rows.length.toLocaleString("pt-BR")} apontamento · ${parsed.ficha.rows.length.toLocaleString("pt-BR")} ficha técnica · ${parsed.estoque.rows.length.toLocaleString("pt-BR")} estoque · ${parsed.followUp.rows.length.toLocaleString("pt-BR")} FOLLOW UP.`,
      });
      await refresh();
    } catch (error) {
      setTask("bundle", {
        error: error instanceof Error ? error.message : "Falha ao importar a base simplificada.",
      });
    } finally {
      setTask("bundle", { busy: false });
    }
  };

  const verifyConnection = async () => {
    setConnectionMessage("Testando conexão...");
    try {
      await testConnection();
      setConnectionMessage("Conexão com o Supabase validada.");
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? `Falha: ${error.message}` : "Falha ao testar conexão.",
      );
    }
  };

  return (
    <div className="import-page">
      <section className="connection-panel panel">
        <div>
          <span className={`connection-dot ${connected ? "online" : "offline"}`} />
          <div>
            <h2>Supabase</h2>
            <p>{connected ? "Base conectada e disponível." : loadError || "Conexão ainda não validada."}</p>
          </div>
        </div>
        <div className="connection-actions">
          <button className="secondary-button" onClick={() => void refresh()}>
            <RefreshCw size={15} /> Atualizar dados
          </button>
          <button className="secondary-button" onClick={() => void verifyConnection()}>
            <Database size={15} /> Testar conexão
          </button>
        </div>
        {connectionMessage && <p className="connection-message">{connectionMessage}</p>}
      </section>

      <div className="database-counters">
        {tableSummary.map((item) => (
          <div key={item.label}>
            <span>{item.icon}{item.label}</span>
            <strong>{item.value.toLocaleString("pt-BR")}</strong>
          </div>
        ))}
      </div>

      <div className="section-line">
        <div>
          <span className="section-index">01</span>
          <h2>Importação Geral</h2>
        </div>
        <span className="muted desktop-note">Opção recomendada para o arquivo gerado pelo script Python</span>
      </div>

      <ImportCard
        icon={<FileSpreadsheet size={21} />}
        title="BASE MATERIAL"
        description="Importa de uma vez as abas PLANO, APONTAMENTO, FICHA TECNICA, ESTOQUE e FOLLOW UP."
        hint="A importação substitui integralmente os dados atuais das cinco tabelas."
        task={tasks.bundle}
        disabled={!connected}
        onFile={runBundle}
      />

      <div className="section-line">
        <div>
          <span className="section-index">02</span>
          <h2>Importações individuais</h2>
        </div>
        <span className="muted desktop-note">Aceita os arquivos originais ou as abas já simplificadas</span>
      </div>

      <div className="import-grid">
        <ImportCard
          icon={<ClipboardList size={20} />}
          title="Plano de produção"
          description="Lê COD. REFERÊNCIA, QTD total e as colunas de datas."
          hint="A parcela de QTD ainda sem programação é gravada com Data vazia."
          task={tasks.plano}
          disabled={!connected}
          onFile={(file) => runSingle("plano", file)}
        />
        <ImportCard
          icon={<Factory size={20} />}
          title="Apontamento"
          description="Conta a produção por Data + Referência + Setor."
          hint="No arquivo original, somente o mês/ano informado abaixo será importado."
          task={tasks.apontamento}
          disabled={!connected}
          onFile={(file) => runSingle("apontamento", file)}
        >
          <div className="import-period">
            <label>
              Mês
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{String(value).padStart(2, "0")}</option>
                ))}
              </select>
            </label>
            <label>
              Ano
              <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} />
            </label>
          </div>
        </ImportCard>
        <ImportCard
          icon={<Boxes size={20} />}
          title="Ficha técnica"
          description="Mapeia Descrição PI para setor e consolida materiais repetidos."
          hint="Importa somente referências do Plano e agrupa Referência + Setor + Cód. MP + UN."
          task={tasks.ficha_tecnica}
          disabled={!connected}
          onFile={(file) => runSingle("ficha_tecnica", file)}
        />
        <ImportCard
          icon={<PackageOpen size={20} />}
          title="Estoque atual"
          description="Lê Código, Descrição, Qtd. Pd e Und. Pd."
          hint="O saldo importado é o estoque atual usado na comparação com a necessidade futura."
          task={tasks.estoque}
          disabled={!connected}
          onFile={(file) => runSingle("estoque", file)}
        />
      </div>

      <div className="import-rule-note">
        <TriangleAlert size={16} />
        <div>
          <strong>Regra de reimportação</strong>
          <p>Cada importação substitui a tabela correspondente; os registros não são somados aos dados anteriores.</p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChartNoAxesCombined,
  PanelLeftClose,
  PanelLeftOpen,
  Factory,
  ChevronRight,
  Menu,
  X,
  UploadCloud,
  TriangleAlert,
  Settings,
} from "lucide-react";
import Daily from "./pages/Daily";
import Future from "./pages/Future";
import ImportPage from "./pages/Import";
import SettingsPage, { type Theme } from "./pages/Settings";
import { LoadingSkeleton } from "./components/ui";
import { useData } from "./context/DataContext";
import { dateRangeLabel } from "./services/calculations";

type Page = "daily" | "future" | "import" | "settings";

const pageCopy: Record<Page, { title: string; eyebrow: string; description: string }> = {
  daily: {
    title: "Consumo Diário",
    eyebrow: "PRODUÇÃO REALIZADA",
    description: "Acompanhe o consumo real de matéria-prima calculado a partir do apontamento.",
  },
  future: {
    title: "Necessidade Futura",
    eyebrow: "PLANEJAMENTO DE PRODUÇÃO",
    description: "Antecipe a necessidade de materiais e acompanhe o saldo com as entradas previstas.",
  },
  import: {
    title: "Importações",
    eyebrow: "ATUALIZAÇÃO DA BASE",
    description: "Atualize Plano, Apontamento, Ficha Técnica, Estoque e FOLLOW UP diretamente no Supabase.",
  },
  settings: {
    title: "Configurações",
    eyebrow: "PREFERÊNCIAS DA INTERFACE",
    description: "Personalize a aparência do sistema sem alterar dados ou regras de negócio.",
  },
};

export default function App() {
  const { data, daily, loading, error, connected } = useData();
  const [page, setPage] = useState<Page>("daily");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem("itam-materiais-theme");
    const initial: Theme = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = initial;
    return initial;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("itam-materiais-theme", theme);
  }, [theme]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const onResize = () => {
      if (!media.matches) setMobile(false);
    };
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement;
    const menu = document.querySelector<HTMLElement>(".sidebar");
    menu?.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") || []).filter(
        (element) => element.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [mobile]);

  const navigate = (next: Page) => {
    setPage(next);
    setMobile(false);
    window.scrollTo(0, 0);
  };

  const period = useMemo(() => {
    if (page === "daily") return dateRangeLabel(daily.map((row) => row.date));
    if (page === "future") return dateRangeLabel(data.plano.map((row) => row.data));
    if (page === "import") return "5 tabelas operacionais";
    return theme === "dark" ? "Tema escuro" : "Tema claro";
  }, [page, daily, data.plano, theme]);

  const copy = pageCopy[page];

  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main">Pular para conteúdo</a>
      {mobile && (
        <button className="mobile-shade" aria-label="Fechar menu" onClick={() => setMobile(false)} />
      )}

      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src="/itam-logo.png" alt="ITAM Transformadores" />
          <div>
            <strong>ITAM | Materiais</strong>
            <small>INTELIGÊNCIA DE MATERIAIS</small>
          </div>
          <button className="mobile-close icon-button" aria-label="Fechar menu" onClick={() => setMobile(false)}>
            <X size={18} />
          </button>
        </div>

        <span className="nav-label">PLANEJAMENTO INDUSTRIAL</span>
        <nav aria-label="Navegação principal">
          <button
            title="Consumo Diário"
            aria-current={page === "daily" ? "page" : undefined}
            className={page === "daily" ? "active" : ""}
            onClick={() => navigate("daily")}
          >
            <Activity size={19} />
            <span>Consumo Diário</span>
            <ChevronRight size={14} className="nav-arrow" />
          </button>
          <button
            title="Necessidade Futura"
            aria-current={page === "future" ? "page" : undefined}
            className={page === "future" ? "active" : ""}
            onClick={() => navigate("future")}
          >
            <ChartNoAxesCombined size={19} />
            <span>Necessidade Futura</span>
            <ChevronRight size={14} className="nav-arrow" />
          </button>
          <button
            title="Importações"
            aria-current={page === "import" ? "page" : undefined}
            className={page === "import" ? "active" : ""}
            onClick={() => navigate("import")}
          >
            <UploadCloud size={19} />
            <span>Importações</span>
            <ChevronRight size={14} className="nav-arrow" />
          </button>
          <button
            title="Configurações"
            aria-current={page === "settings" ? "page" : undefined}
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings size={19} />
            <span>Configurações</span>
            <ChevronRight size={14} className="nav-arrow" />
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace">
            <Factory size={19} />
            <div>
              <strong>Operação industrial</strong>
              <span>Gestão de materiais</span>
            </div>
          </div>
          <button
            className="collapse-button"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span>Recolher menu</span>
          </button>
          <div className="version">ITAM | MATERIAIS <span>v1.1</span></div>
        </div>
      </aside>

      <div className="main-shell" inert={mobile}>
        <div className="topbar">
          <div>
            <button className="mobile-menu icon-button" onClick={() => setMobile(true)} aria-label="Abrir menu">
              <Menu size={20} />
            </button>
            <span>Materiais</span>
            <ChevronRight size={13} />
            <strong>{copy.title}</strong>
          </div>
          <span className={`data-status ${connected ? "connected" : "disconnected"}`}>
            <span /> {connected ? "SUPABASE CONECTADO" : "SEM CONEXÃO"}
          </span>
        </div>

        <main id="main" tabIndex={-1}>
          <header className="page-header">
            <div>
              <div className="eyebrow">{copy.eyebrow}</div>
              <h1>{copy.title}</h1>
              <p>{copy.description}</p>
            </div>
            <div className="period-context">
              <span>{page === "import" ? "ESTRUTURA" : page === "settings" ? "APARÊNCIA" : "PERÍODO DA BASE"}</span>
              <strong>{period}</strong>
            </div>
          </header>

          {error && page !== "import" && page !== "settings" && (
            <div className="data-error" role="alert">
              <TriangleAlert size={17} />
              <div>
                <strong>Não foi possível carregar os dados do Supabase.</strong>
                <span>{error}</span>
              </div>
              <button onClick={() => navigate("import")}>Abrir importações</button>
            </div>
          )}

          {loading && page !== "import" && page !== "settings" ? (
            <LoadingSkeleton />
          ) : (
            <>
              <div hidden={page !== "daily"}><Daily /></div>
              <div hidden={page !== "future"}><Future /></div>
              <div hidden={page !== "import"}><ImportPage /></div>
              <div hidden={page !== "settings"}><SettingsPage theme={theme} onThemeChange={setTheme} /></div>
            </>
          )}

          <footer className="app-footer">
            <span>ITAM | Materiais · Planejamento de materiais</span>
            <span>{connected ? "Dados reais · Supabase" : "Conexão com banco não disponível"}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

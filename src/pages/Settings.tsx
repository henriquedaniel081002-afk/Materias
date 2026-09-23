import { Check, Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

export default function SettingsPage({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const options: Array<{
    value: Theme;
    title: string;
    description: string;
    icon: typeof Sun;
  }> = [
    {
      value: "light",
      title: "Tema claro",
      description: "Superfícies claras, texto escuro e contraste preservado para uso durante o dia.",
      icon: Sun,
    },
    {
      value: "dark",
      title: "Tema escuro",
      description: "Mantém o visual escuro atual do ITAM | Materiais.",
      icon: Moon,
    },
  ];

  return (
    <section className="settings-page" aria-labelledby="appearance-title">
      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <span>APARÊNCIA</span>
            <h2 id="appearance-title">Tema da interface</h2>
            <p>Escolha como o sistema deve ser exibido neste navegador.</p>
          </div>
          <div className="settings-current-theme" aria-live="polite">
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
            <span>Tema atual</span>
            <strong>{theme === "dark" ? "Escuro" : "Claro"}</strong>
          </div>
        </div>

        <div className="theme-options" role="radiogroup" aria-label="Tema da interface">
          {options.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`theme-option ${active ? "active" : ""}`}
                role="radio"
                aria-checked={active}
                onClick={() => onThemeChange(option.value)}
              >
                <span className="theme-option-icon"><Icon size={20} /></span>
                <span className="theme-option-copy">
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="theme-option-check" aria-hidden="true">
                  {active && <Check size={15} />}
                </span>
              </button>
            );
          })}
        </div>

        <p className="settings-note">
          A preferência fica salva somente neste navegador e não altera dados, cálculos ou configurações do Supabase.
        </p>
      </article>
    </section>
  );
}

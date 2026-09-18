import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
  RotateCcw,
  Package,
  Minus,
  CalendarDays,
  TriangleAlert,
} from "lucide-react";
import type { Coverage, Filters } from "../types";
import { date } from "../services/calculations";
export function Badge({ status }: { status: Coverage }) {
  const tone =
    status === "COBRE"
      ? "good"
      : status === "NÃO COBRE"
        ? "bad"
        : status === "UNIDADE DIVERGENTE"
          ? "warn"
          : "zero";
  return (
    <span className={`badge ${tone}`}>
      {status === "COBRE" ? (
        <Check size={12} />
      ) : status === "NÃO COBRE" ? (
        <X size={12} />
      ) : status === "UNIDADE DIVERGENTE" ? (
        <TriangleAlert size={12} />
      ) : (
        <Minus size={12} />
      )}{" "}
      {status}
    </span>
  );
}
export function KPI({
  label,
  value,
  detail,
  icon,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <article className={`kpi ${tone}`}>
      <div className="kpi-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
export function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel chart-panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function EmptyState({
  text = "Ajuste os filtros para encontrar registros.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <SearchX size={27} />
      <strong>Nenhum resultado encontrado</strong>
      <p>{text}</p>
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div
      aria-label="Carregando dashboard"
      role="status"
      className="skeleton-grid"
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="search">
      <Search size={16} />
      <input
        aria-label="Pesquisa rápida"
        placeholder="Pesquisar nos resultados..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Limpar pesquisa" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export interface MaterialFilterOption {
  code: string;
  description: string;
  unit: string;
}

export function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  emptyLabel,
  onSelect,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label || "";
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => setQuery(selectedLabel), [selectedLabel]);

  const matches = useMemo(() => {
    const normalize = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("pt-BR");
    const term = normalize(query);
    if (!term || (value && query === selectedLabel)) return options;
    return options.filter((option) => normalize(option.label).includes(term));
  }, [options, query, selectedLabel, value]);

  const choose = (next: string) => {
    onSelect(next);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div
      className="searchable-select"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
          setQuery(selectedLabel);
          setActive(-1);
        }
      }}
    >
      <Search size={14} aria-hidden="true" />
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={query}
        onFocus={(event) => {
          setOpen(true);
          if (value) event.currentTarget.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.min(current + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && active >= 0) {
            event.preventDefault();
            choose(matches[active].value);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery(selectedLabel);
          }
        }}
      />
      {(query || value) && (
        <button
          type="button"
          className="combo-clear"
          aria-label={`Limpar ${label.toLowerCase()}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            choose("");
            setQuery("");
          }}
        >
          <X size={13} />
        </button>
      )}
      {open && (
        <div className="combo-options" id={listboxId} role="listbox">
          {matches.length ? (
            matches.slice(0, 100).map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={index === active ? "active" : ""}
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
              >
                {option.label}
                {option.value === value && <Check size={13} />}
              </button>
            ))
          ) : (
            <span className="combo-empty">{emptyLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  filters: f,
  onChange,
  reset,
  sectors,
  references,
  materials,
  groups,
  units,
  future = false,
}: {
  filters: Filters;
  onChange: (v: Filters) => void;
  reset: () => void;
  sectors: string[];
  references: string[];
  materials: MaterialFilterOption[];
  groups: string[];
  units: string[];
  future?: boolean;
}) {
  const set = (k: keyof Filters, v: string) => onChange({ ...f, [k]: v });
  const count = ["sector", "reference", "group", "material", "unit", "coverage"].filter(
    (k) => f[k as keyof Filters],
  ).length;
  return (
    <section className="filter-panel" aria-label="Filtros do dashboard">
      <div className="filter-top">
        <span>
          <SlidersHorizontal size={14} /> Filtros {count > 0 && <b>{count}</b>}
        </span>
        <button className="text-button" onClick={reset}>
          <RotateCcw size={13} />
          Limpar filtros
        </button>
      </div>
      <div className={`filters ${future ? "future-filters" : ""}`}>
        <label>
          Data inicial
          <DateInput
            label="Data inicial"
            value={f.start}
            max={f.end}
            onChange={(v) => set("start", v)}
          />
        </label>
        <label>
          Data final
          <DateInput
            label="Data final"
            value={f.end}
            min={f.start}
            onChange={(v) => set("end", v)}
          />
        </label>
        <label>
          Setor
          <select
            value={f.sector}
            onChange={(e) => set("sector", e.target.value)}
          >
            <option value="">Todos os setores</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Referência
          <SearchableSelect
            label="Referência"
            value={f.reference}
            options={references.map((reference) => ({ value: reference, label: reference }))}
            placeholder="Código ou texto"
            emptyLabel="Nenhuma referência encontrada"
            onSelect={(value) => set("reference", value)}
          />
        </label>
        <label>
          Grupo MP
          <select
            value={f.group || ""}
            onChange={(e) => set("group", e.target.value)}
          >
            <option value="">Todos os grupos</option>
            {groups.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>
        <label className="material-filter">
          Matéria-prima
          <SearchableSelect
            label="Matéria-prima"
            value={f.material && f.unit ? `${f.material}¦${f.unit}` : ""}
            options={materials.map((material) => ({
              value: `${material.code}¦${material.unit}`,
              label: `${material.code} · ${material.description}${material.unit ? ` · ${material.unit}` : ""}`,
            }))}
            placeholder="Código ou descrição"
            emptyLabel="Nenhuma matéria-prima encontrada"
            onSelect={(value) => {
              if (!value) {
                onChange({ ...f, material: "", unit: "" });
                return;
              }
              const option = materials.find(
                (material) => `${material.code}¦${material.unit}` === value,
              );
              if (option) onChange({ ...f, material: option.code, unit: option.unit });
            }}
          />
        </label>
        <label>
          Unidade
          <select
            value={f.unit}
            onChange={(e) =>
              onChange({
                ...f,
                unit: e.target.value,
                material: f.material && e.target.value !== f.unit ? "" : f.material,
              })
            }
          >
            <option value="">Todas</option>
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        {future && (
          <label>
            Cobertura
            <select
              value={f.coverage}
              onChange={(e) => set("coverage", e.target.value)}
            >
              <option value="">Todas as situações</option>
              <option value="COBRE">Estoque cobre</option>
              <option value="NÃO COBRE">Estoque não cobre</option>
              <option value="SEM ESTOQUE">Sem estoque</option>
              <option value="UNIDADE DIVERGENTE">Unidade divergente</option>
            </select>
          </label>
        )}
      </div>
      {f.start && f.end && f.start > f.end && (
        <p className="error" role="alert">
          A data inicial deve ser anterior à data final.
        </p>
      )}
    </section>
  );
}
export interface Column<T> {
  key: string;
  label: string;
  numeric?: boolean;
  value: (r: T) => string | number;
  render?: (r: T) => ReactNode;
}
export function DataTable<T extends { id?: string; code?: string }>({
  rows,
  columns,
  onRow,
  title,
  subtitle,
  search,
  onSearch,
  selected,
}: {
  rows: T[];
  columns: Column<T>[];
  onRow: (r: T) => void;
  title: string;
  subtitle: string;
  search?: string;
  onSearch?: (v: string) => void;
  selected?: string;
}) {
  const [page, setPage] = useState(1),
    [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  const size = 8;
  useEffect(() => setPage(1), [rows]);
  const sorted = [...rows].sort((a, b) => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col || !sort) return 0;
    const av = col.value(a),
      bv = col.value(b);
    return (
      (typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "pt-BR")) * (sort.asc ? 1 : -1)
    );
  });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return (
    <section className="panel table-panel">
      <header className="panel-head">
        <div>
          <h2>
            {title} <span className="count">{rows.length}</span>
          </h2>
          <p>{subtitle}</p>
        </div>
        {onSearch && <SearchInput value={search || ""} onChange={onSearch} />}
      </header>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? "numeric" : ""}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.asc
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() =>
                      setSort({
                        key: c.key,
                        asc: sort?.key === c.key ? !sort.asc : true,
                      })
                    }
                  >
                    {c.label}
                    {sort?.key === c.key ? (
                      sort.asc ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ArrowUpDown size={11} />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice((current - 1) * size, current * size).map((r, i) => (
              <tr
                key={r.id || r.code || i}
                className={selected === (r.id || r.code) ? "selected" : ""}
                onClick={() => onRow(r)}
              >
                {columns.map((c, j) => (
                  <td className={c.numeric ? "numeric" : ""} key={c.key}>
                    {j === 0 ? (
                      <button
                        className="row-open"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRow(r);
                        }}
                        aria-label={`Abrir detalhes ${c.value(r)}`}
                      >
                        {c.render ? c.render(r) : c.value(r)}
                      </button>
                    ) : c.render ? (
                      c.render(r)
                    ) : (
                      c.value(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState />}
      <footer className="table-footer">
        <span>
          {rows.length
            ? `${(current - 1) * size + 1}–${Math.min(current * size, rows.length)} de ${rows.length} registros`
            : "0 registros"}
          <span className="footer-hint">
            {" "}
            · Clique em uma linha para detalhar
          </span>
        </span>
        <div>
          <button
            aria-label="Página anterior"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            aria-label="Próxima página"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </section>
  );
}
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button,a,input,select,[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="drawer-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`drawer ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header>
          <div className="drawer-mark">
            <Package size={19} />
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar detalhes"
          >
            <X size={20} />
          </button>
          <p>DETALHAMENTO DO MATERIAL</p>
          <h2 id="drawer-title">{title}</h2>
          <span>{subtitle}</span>
        </header>
        <div className="drawer-content">{children}</div>
      </div>
    </div>
  );
}
export function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
export const tooltipStyle = {
  background: "#1b2428",
  border: "1px solid #3a494e",
  borderRadius: 8,
  color: "#e8eef0",
  fontSize: 13,
};

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value ? date(value) : "");
  useEffect(() => setDraft(value ? date(value) : ""), [value]);
  const parse = (text: string) => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
    const iso = text.split("/").reverse().join("-");
    const parsed = new Date(iso + "T12:00:00Z");
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === iso
      ? iso
      : null;
  };
  const invalid = !!draft && !parse(draft);
  return (
    <span className="date-field">
      <span className="date-input">
        <input
          className="date-text"
          type="text"
          inputMode="numeric"
          aria-label={label}
          aria-invalid={invalid}
          placeholder="dd/mm/aaaa"
          maxLength={10}
          value={draft}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            const iso = parse(text);
            if (!text || iso) onChange(iso || "");
          }}
        />
        <span className="calendar-control">
          <CalendarDays size={14} aria-hidden="true" />
          <input
            type="date"
            aria-label={`${label} (calendário)`}
            value={value}
            min={min || undefined}
            max={max || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      </span>
      {invalid && (
        <span className="date-error" role="status">
          Use dd/mm/aaaa
        </span>
      )}
    </span>
  );
}

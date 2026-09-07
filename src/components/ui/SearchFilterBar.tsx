import { type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "./Button";

interface SearchFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
  submitLabel?: string;
  ariaLabel?: string;
  filters?: ReactNode;
  className?: string;
}

export function SearchFilterBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Buscar",
  submitLabel = "Buscar",
  ariaLabel = "Buscar",
  filters,
  className = "",
}: SearchFilterBarProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);

  return (
    <div className={`tradearc-search-filter-bar ${className}`.trim()}>
      <form className="tradearc-search-filter-bar__form" onSubmit={onSubmit} role="search">
        <label className="tradearc-search-filter-bar__field">
          <span className="sr-only">{ariaLabel}</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            aria-label={ariaLabel}
            maxLength={240}
          />
        </label>
        <Button type="submit">{submitLabel}</Button>
      </form>
      {filters && <div className="tradearc-search-filter-bar__filters">{filters}</div>}
    </div>
  );
}

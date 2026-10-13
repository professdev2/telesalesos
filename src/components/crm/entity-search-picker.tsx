"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type EntitySearchOption = {
  id: string;
  label: string;
  description?: string;
  /** Present on contact picker results for company autofill. */
  companyId?: string | null;
  companyName?: string | null;
};

type SearchFn = (query: string) => Promise<EntitySearchOption[]>;

export function EntitySearchPicker({
  id,
  name,
  required = false,
  disabled = false,
  placeholder = "Type to search…",
  emptyMessage = "No matches.",
  clearLabel = "Clear selection",
  defaultOption = null,
  search,
  onOptionChange,
  "aria-describedby": ariaDescribedBy,
}: {
  id: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  clearLabel?: string;
  defaultOption?: EntitySearchOption | null;
  search: SearchFn;
  onOptionChange?: (option: EntitySearchOption | null) => void;
  "aria-describedby"?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(defaultOption?.label ?? "");
  const [selected, setSelected] = useState<EntitySearchOption | null>(defaultOption);
  const [options, setOptions] = useState<EntitySearchOption[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    setSelected(defaultOption);
    setQuery(defaultOption?.label ?? "");
  }, [defaultOption?.id, defaultOption?.label]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (selected) setQuery(selected.label);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [selected]);

  function runSearch(nextQuery: string) {
    const idSnapshot = ++requestId.current;
    startTransition(async () => {
      const results = await search(nextQuery.trim());
      if (idSnapshot !== requestId.current) return;
      setOptions(results);
      setHighlight(0);
      setOpen(true);
    });
  }

  function choose(option: EntitySearchOption | null) {
    setSelected(option);
    setQuery(option?.label ?? "");
    setOpen(false);
    onOptionChange?.(option);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="hidden"
        name={name}
        value={selected?.id ?? ""}
        required={required}
      />
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-describedby={ariaDescribedBy}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (selected && value !== selected.label) {
            setSelected(null);
            onOptionChange?.(null);
          }
          runSearch(value);
        }}
        onFocus={() => {
          if (!open) runSearch(query);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((index) =>
              options.length ? Math.min(index + 1, options.length - 1) : 0,
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && options[highlight]) {
            event.preventDefault();
            choose(options[highlight]);
          } else if (event.key === "Escape") {
            setOpen(false);
            if (selected) setQuery(selected.label);
          }
        }}
      />

      {selected && !required ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mt-1 text-xs underline-offset-4 hover:underline"
          onClick={() => choose(null)}
        >
          {clearLabel}
        </button>
      ) : null}

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="border-border bg-popover absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border py-1 shadow-md"
        >
          {options.length === 0 ? (
            <li className="text-muted-foreground px-2.5 py-2 text-sm">
              {pending ? "Searching…" : emptyMessage}
            </li>
          ) : (
            options.map((option, index) => (
              <li key={option.id} role="option" aria-selected={highlight === index}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-muted flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left text-sm",
                    highlight === index && "bg-muted",
                  )}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(option)}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="text-muted-foreground text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

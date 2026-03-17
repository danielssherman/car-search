"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, X, Search } from "lucide-react";

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}

// --- Chip Button (trigger) ---

interface ChipButtonProps {
  label: string;
  selectedSummary: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
}

function ChipButton({
  label,
  selectedSummary,
  isOpen,
  onToggle,
  onClear,
}: ChipButtonProps) {
  const hasSelection = selectedSummary !== null;

  return (
    <button
      onClick={onToggle}
      className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        isOpen
          ? "border-bmw-blue ring-1 ring-bmw-blue text-white"
          : hasSelection
          ? "border-bmw-blue/30 bg-bmw-blue/5 text-bmw-blue"
          : "border-bmw-border bg-bmw-card text-bmw-muted hover:border-bmw-blue/50 hover:text-white"
      }`}
    >
      <span className="whitespace-nowrap">
        {hasSelection ? `${label}: ${selectedSummary}` : label}
      </span>
      {hasSelection ? (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-white/10 transition-colors"
        >
          <X className="h-3 w-3" />
        </span>
      ) : (
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      )}
    </button>
  );
}

// --- Multi-Select Popover ---

export interface FilterOption {
  value: string;
  count?: number;
}

interface MultiSelectPopoverProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}

export function MultiSelectPopover({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: MultiSelectPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  useClickOutside(containerRef, close);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const filteredOptions = searchable && search
    ? options.filter((o) =>
        o.value.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const summary =
    selected.length === 0
      ? null
      : selected.length <= 2
      ? selected.join(", ")
      : `${selected.length} selected`;

  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <ChipButton
        label={label}
        selectedSummary={summary}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        onClear={() => onChange([])}
      />

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[220px] max-w-[320px] rounded-lg border border-bmw-border bg-bmw-card shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          {searchable && (
            <div className="border-b border-bmw-border p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bmw-muted" />
                <input
                  type="text"
                  placeholder={`Search ${label.toLowerCase()}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="w-full rounded-md border border-bmw-border bg-bmw-dark py-1.5 pl-8 pr-3 text-xs text-white placeholder-bmw-muted outline-none focus:border-bmw-blue"
                />
              </div>
            </div>
          )}

          <div className="max-h-[280px] overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-bmw-muted">
                No matches
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 hover:bg-white/5 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(option.value)}
                      className="h-4 w-4 rounded border-bmw-border bg-bmw-dark accent-bmw-blue"
                    />
                    <span
                      className={`flex-1 text-sm ${
                        checked ? "text-white" : "text-bmw-muted"
                      }`}
                    >
                      {option.value}
                    </span>
                    {option.count !== undefined && (
                      <span className="text-xs text-bmw-muted tabular-nums">
                        {option.count}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-bmw-border px-3 py-2">
              <button
                onClick={() => onChange([])}
                className="text-xs text-bmw-muted hover:text-white transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Single-Select Popover ---

interface SingleSelectPopoverProps {
  label: string;
  options: FilterOption[];
  selected: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

export function SingleSelectPopover({
  label,
  options,
  selected,
  defaultValue,
  onChange,
}: SingleSelectPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside(containerRef, close);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const isActive = selected !== defaultValue;
  const summary = isActive ? selected : null;

  return (
    <div ref={containerRef} className="relative">
      <ChipButton
        label={label}
        selectedSummary={summary}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        onClear={() => onChange(defaultValue)}
      />

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] rounded-lg border border-bmw-border bg-bmw-card shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="max-h-[280px] overflow-y-auto p-1">
            {options.map((option) => {
              const checked = selected === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    checked
                      ? "bg-bmw-blue/10 text-bmw-blue"
                      : "text-bmw-muted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex-1">{option.value}</span>
                  {option.count !== undefined && (
                    <span className="text-xs text-bmw-muted tabular-nums">
                      {option.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Price Range Popover ---

interface PriceRangePopoverProps {
  minPrice: string;
  maxPrice: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onClear: () => void;
}

export function PriceRangePopover({
  minPrice,
  maxPrice,
  onMinChange,
  onMaxChange,
  onClear,
}: PriceRangePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside(containerRef, close);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const formatK = (v: string) => {
    const n = parseInt(v);
    if (isNaN(n)) return v;
    return n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
  };

  const hasValue = minPrice || maxPrice;
  let summary: string | null = null;
  if (minPrice && maxPrice) {
    summary = `${formatK(minPrice)}–${formatK(maxPrice)}`;
  } else if (minPrice) {
    summary = `${formatK(minPrice)}+`;
  } else if (maxPrice) {
    summary = `Up to ${formatK(maxPrice)}`;
  }

  return (
    <div ref={containerRef} className="relative">
      <ChipButton
        label="Price"
        selectedSummary={summary}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        onClear={() => {
          onClear();
        }}
      />

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[220px] rounded-lg border border-bmw-border bg-bmw-card p-3 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-bmw-muted">
                Minimum
              </label>
              <input
                type="number"
                placeholder="No min"
                value={minPrice}
                onChange={(e) => onMinChange(e.target.value)}
                className="w-full rounded-md border border-bmw-border bg-bmw-dark px-3 py-2 text-sm text-white placeholder-bmw-muted outline-none focus:border-bmw-blue"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-bmw-muted">
                Maximum
              </label>
              <input
                type="number"
                placeholder="No max"
                value={maxPrice}
                onChange={(e) => onMaxChange(e.target.value)}
                className="w-full rounded-md border border-bmw-border bg-bmw-dark px-3 py-2 text-sm text-white placeholder-bmw-muted outline-none focus:border-bmw-blue"
              />
            </div>
            {hasValue && (
              <button
                onClick={onClear}
                className="text-xs text-bmw-muted hover:text-white transition-colors"
              >
                Clear price range
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

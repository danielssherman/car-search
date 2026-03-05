"use client";

export function StatusBadge({ status }: { status: string }) {
  const isInStock = status === "In Stock";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isInStock
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
          : "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isInStock ? "bg-emerald-400" : "bg-amber-400"
        }`}
      />
      {status}
    </span>
  );
}

"use client";

import { useState } from "react";
import AddTransactionModal from "@/components/AddTransactionModal";

export default function AddTransactionButton({ label = "+ Add Transaction" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
      >
        {label}
      </button>
      {open && (
        <AddTransactionModal
          onClose={() => setOpen(false)}
          onSaved={() => {}}
        />
      )}
    </>
  );
}

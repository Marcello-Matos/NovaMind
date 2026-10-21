'use client';

import { useEffect, useState } from 'react';
import { api, type UsageSummary } from '@/lib/api';

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  useEffect(() => {
    api.usageSummary().then(setSummary).catch(() => {});
  }, []);

  const month = summary?.currentMonth;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Uso e plano</h1>
      <p className="mt-1 text-sm text-slate-400">
        Transparência de consumo — franquia e custos estimados de IA.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Plano atual
          </p>
          <p className="mt-1 text-2xl font-semibold">Gratuito</p>
          <p className="mt-1 text-sm text-slate-400">
            Upgrade disponível na fase de monetização.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Custo estimado (mês)
          </p>
          <p className="mt-1 text-2xl font-semibold">
            US$ {(month?.estimatedCostUsd ?? 0).toFixed(4)}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {month?.events ?? 0} eventos ·{' '}
            {((month?.promptTokens ?? 0) + (month?.completionTokens ?? 0)).toLocaleString(
              'pt-BR',
            )}{' '}
            tokens
          </p>
        </div>
      </div>
    </div>
  );
}

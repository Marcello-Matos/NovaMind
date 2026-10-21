'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type MemoryEntry } from '@/lib/api';

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const load = useCallback(() => {
    api.listMemories().then(setMemories).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !value.trim()) return;
    await api.createMemory({ key: key.trim(), value: value.trim() });
    setKey('');
    setValue('');
    load();
  }

  async function toggle(entry: MemoryEntry) {
    await api.updateMemory(entry.id, { enabled: !entry.enabled });
    load();
  }

  async function remove(id: string) {
    await api.deleteMemory(id);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Memória controlável</h1>
      <p className="mt-1 text-sm text-slate-400">
        O assistente só usa os fatos ativados abaixo. Você pode corrigir,
        desativar ou excluir qualquer um.
      </p>

      <form onSubmit={create} className="mt-6 flex gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Chave (ex.: fuso_horario)"
          className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Valor (ex.: America/Sao_Paulo)"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
          Guardar
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {memories.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
          >
            <div className="flex-1">
              <p className="text-sm font-medium">{m.key}</p>
              <p className="text-sm text-slate-400">{m.value}</p>
            </div>
            <button
              onClick={() => toggle(m)}
              className={`rounded-full px-3 py-1 text-xs ${
                m.enabled
                  ? 'bg-emerald-900/50 text-emerald-300'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {m.enabled ? 'Ativa' : 'Desativada'}
            </button>
            <button
              onClick={() => remove(m.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Excluir
            </button>
          </li>
        ))}
        {!memories.length && (
          <p className="text-sm text-slate-500">
            Nenhum fato memorizado ainda.
          </p>
        )}
      </ul>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Task } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const STATUS_LABEL: Record<Task['status'], string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};

export default function TasksPage() {
  const { activeOrgId } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');

  const load = useCallback(() => {
    api.listTasks(activeOrgId ?? undefined).then(setTasks).catch(() => {});
  }, [activeOrgId]);

  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTask({
      title: title.trim(),
      dueAt: dueAt || undefined,
      organizationId: activeOrgId ?? undefined,
    });
    setTitle('');
    setDueAt('');
    load();
  }

  async function toggle(task: Task) {
    await api.updateTask(task.id, {
      status: task.status === 'DONE' ? 'OPEN' : 'DONE',
    });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Tarefas</h1>
      <p className="mt-1 text-sm text-slate-400">
        {activeOrgId ? 'Tarefas da organização' : 'Suas tarefas pessoais'}
      </p>

      <form onSubmit={create} className="mt-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
          Adicionar
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
          >
            <input
              type="checkbox"
              checked={t.status === 'DONE'}
              onChange={() => toggle(t)}
              className="h-4 w-4 accent-indigo-500"
            />
            <div className="flex-1">
              <p
                className={`text-sm ${t.status === 'DONE' ? 'text-slate-500 line-through' : ''}`}
              >
                {t.title}
              </p>
              {t.dueAt && (
                <p className="text-xs text-slate-500">
                  Vence em {new Date(t.dueAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {STATUS_LABEL[t.status]}
            </span>
          </li>
        ))}
        {!tasks.length && (
          <p className="text-sm text-slate-500">
            Nenhuma tarefa. Peça ao assistente no chat ou crie manualmente.
          </p>
        )}
      </ul>
    </div>
  );
}

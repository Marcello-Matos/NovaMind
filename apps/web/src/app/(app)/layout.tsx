'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/chat', label: 'Chat' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/memory', label: 'Memória' },
  { href: '/documents', label: 'Documentos' },
  { href: '/usage', label: 'Uso e plano' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, activeOrgId, setActiveOrgId, logout } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Carregando…
      </div>
    );
  }
  if (!user) return null;

  const orgs = user.members.map((m) => m.organization);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-6">
          <span className="text-lg font-semibold tracking-tight">NovaMind</span>
        </div>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Ambiente
        </label>
        <select
          value={activeOrgId ?? ''}
          onChange={(e) => setActiveOrgId(e.target.value || null)}
          className="mb-6 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          <option value="">Pessoal</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                pathname.startsWith(item.href)
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-800 pt-3 text-sm">
          <p className="truncate text-slate-300">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <button
            onClick={logout}
            className="mt-2 text-xs text-slate-400 hover:text-red-400"
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}

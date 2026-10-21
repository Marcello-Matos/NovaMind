'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Doc {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const { activeOrgId } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const q = activeOrgId ? `?organizationId=${activeOrgId}` : '';
    fetch(`${API_URL}/v1/knowledge-base/documents${q}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then(setDocs)
      .catch(() => {});
  }, [activeOrgId]);

  useEffect(load, [load]);

  async function upload(file: File) {
    const q = activeOrgId ? `?organizationId=${activeOrgId}` : '';
    const form = new FormData();
    form.append('file', file);
    await fetch(`${API_URL}/v1/knowledge-base/documents${q}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Base de conhecimento</h1>
      <p className="mt-1 text-sm text-slate-400">
        Documentos {activeOrgId ? 'da organização' : 'pessoais'} usados pelo
        assistente como fonte de respostas.
      </p>

      <button
        onClick={() => fileRef.current?.click()}
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
      >
        Enviar documento
      </button>
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />

      <ul className="mt-6 space-y-2">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
          >
            <div className="flex-1">
              <p className="text-sm">{d.fileName}</p>
              <p className="text-xs text-slate-500">
                {(d.sizeBytes / 1024).toFixed(1)} KB · {d.mimeType}
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {d.status}
            </span>
          </li>
        ))}
        {!docs.length && (
          <p className="text-sm text-slate-500">Nenhum documento enviado.</p>
        )}
      </ul>
    </div>
  );
}

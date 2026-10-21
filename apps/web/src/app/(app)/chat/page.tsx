'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type Conversation,
  type Message,
  type PendingAction,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function ChatPage() {
  const { activeOrgId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    api
      .listConversations(activeOrgId ?? undefined)
      .then(setConversations)
      .catch(() => setConversations([]));
  }, [activeOrgId]);

  useEffect(() => {
    setActive(null);
    setMessages([]);
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!active) return;
    api
      .getConversation(active)
      .then((c) => setMessages(c.messages))
      .catch(() => setMessages([]));
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function newConversation() {
    const conv = await api.createConversation({
      organizationId: activeOrgId ?? undefined,
    });
    setConversations((prev) => [conv, ...prev]);
    setActive(conv.id);
    setMessages([]);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setError(null);
    let convId = active;
    if (!convId) {
      const conv = await api.createConversation({
        organizationId: activeOrgId ?? undefined,
      });
      convId = conv.id;
      setActive(convId);
      setConversations((prev) => [conv, ...prev]);
    }
    const content = input.trim();
    setInput('');
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        role: 'USER',
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      const res = await api.sendMessage(convId, content);
      setPending(res.pendingActions ?? []);
      const fresh = await api.getConversation(convId);
      setMessages(fresh.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen">
      <div className="w-72 border-r border-slate-800 p-4">
        <button
          onClick={newConversation}
          className="mb-4 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          + Nova conversa
        </button>
        <div className="space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                active === c.id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              {c.title ?? 'Sem título'}
            </button>
          ))}
          {!conversations.length && (
            <p className="px-3 text-xs text-slate-500">
              Nenhuma conversa ainda.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {!messages.length && (
            <div className="flex h-full items-center justify-center text-center text-slate-500">
              <div>
                <p className="text-lg font-medium text-slate-300">
                  Como posso ajudar?
                </p>
                <p className="mt-1 text-sm">
                  Converse, peça para criar tarefas ou resumir documentos.
                </p>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'USER'
                  ? 'ml-auto bg-indigo-600/30 text-slate-100'
                  : 'bg-slate-800/70 text-slate-200'
              }`}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="max-w-2xl rounded-2xl bg-slate-800/70 px-4 py-3 text-sm text-slate-400">
              Pensando…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {pending.length > 0 && (
          <div className="border-t border-amber-900/50 bg-amber-950/30 px-6 py-3 text-sm text-amber-300">
            {pending.length} ação(ões) sensível(eis) aguardando confirmação:{' '}
            {pending.map((p) => p.tool).join(', ')}
          </div>
        )}
        {error && (
          <div className="border-t border-red-900/50 bg-red-950/30 px-6 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={send} className="border-t border-slate-800 p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                activeOrgId
                  ? 'Pergunte sobre a empresa, leads ou documentos…'
                  : 'Mensagem para o assistente pessoal…'
              }
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

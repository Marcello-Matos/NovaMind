const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'novamind.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Erro ${res.status}`);
  }
  return res.json();
}

export const api = {
  // auth
  register: (data: { name: string; email: string; password: string }) =>
    request<{ accessToken: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  me: () => request<MeResponse>('/auth/me'),

  // organizations
  listOrganizations: () => request<Organization[]>('/organizations'),
  createOrganization: (data: { name: string; slug: string }) =>
    request<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // conversations
  listConversations: (organizationId?: string) =>
    request<Conversation[]>(
      `/conversations${organizationId ? `?organizationId=${organizationId}` : ''}`,
    ),
  createConversation: (data: { organizationId?: string; agent?: string }) =>
    request<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getConversation: (id: string) =>
    request<Conversation & { messages: Message[] }>(`/conversations/${id}`),
  sendMessage: (id: string, content: string) =>
    request<{ message: Message; pendingActions: PendingAction[] }>(
      `/conversations/${id}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) },
    ),

  // tasks
  listTasks: (organizationId?: string) =>
    request<Task[]>(
      `/tasks${organizationId ? `?organizationId=${organizationId}` : ''}`,
    ),
  createTask: (data: Partial<Task> & { title: string }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // memory
  listMemories: () => request<MemoryEntry[]>('/memory'),
  createMemory: (data: { key: string; value: string }) =>
    request<MemoryEntry>('/memory', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateMemory: (id: string, data: Partial<MemoryEntry>) =>
    request<MemoryEntry>(`/memory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteMemory: (id: string) =>
    request(`/memory/${id}`, { method: 'DELETE' }),

  // usage
  usageSummary: () => request<UsageSummary>('/usage/summary'),
};

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface MeResponse extends User {
  members: Array<{
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    organization: Organization;
  }>;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PERSONAL_PRO' | 'BUSINESS' | 'BUSINESS_PRO';
}

export interface Conversation {
  id: string;
  title: string | null;
  agent: 'PERSONAL' | 'BUSINESS_FAQ' | 'BUSINESS_SALES';
  organizationId: string | null;
  updatedAt: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  createdAt: string;
}

export interface PendingAction {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueAt: string | null;
  organizationId: string | null;
}

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface UsageSummary {
  currentMonth: {
    events: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  };
  allTime: {
    events: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  };
}

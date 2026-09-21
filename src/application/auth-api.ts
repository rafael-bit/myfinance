import type { Session as SupabaseSession, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/infra/supabase/client";

export type Session = {
  userId: string;
  unlockedAt: number;
  lastActivityAt: number;
};

let cachedSession: Session | null = null;
let cachedEmail = "";
let ready: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function adopt(auth: SupabaseSession | null) {
  if (!auth?.user) {
    cachedSession = null;
    cachedEmail = "";
    return;
  }
  const at = Date.now();
  const unlockedAt = cachedSession?.userId === auth.user.id ? cachedSession.unlockedAt : at;
  cachedSession = { userId: auth.user.id, unlockedAt, lastActivityAt: at };
  cachedEmail = auth.user.email ?? "";
}

/** Starts (once) the auth listener and resolves when the stored session was restored. */
export function watchAuth(client: SupabaseClient = supabase): Promise<void> {
  if (ready) return ready;
  client.auth.onAuthStateChange((_event, session) => {
    adopt(session);
    queueMicrotask(notify);
  });
  ready = client.auth.getSession().then(({ data }) => {
    adopt(data.session);
    notify();
  });
  return ready;
}

export function sessionReady(client?: SupabaseClient): Promise<void> {
  return watchAuth(client);
}

export function currentSession(): Session | null {
  if (cachedSession) cachedSession.lastActivityAt = Date.now();
  return cachedSession;
}

export function currentEmail(): string {
  return cachedEmail;
}

export function adoptSession(session: SupabaseSession | null) {
  adopt(session);
  notify();
}

export function subscribeAuthChange(listener: () => void) {
  listeners.add(listener);
  void watchAuth();
  return () => {
    listeners.delete(listener);
  };
}

function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "E-mail ou senha inválidos";
  if (text.includes("email not confirmed")) return "Confirme o e-mail antes de entrar";
  if (text.includes("already registered") || text.includes("already exists")) return "Já existe uma conta com este e-mail";
  if (text.includes("password")) return "Senha inválida: use pelo menos 6 caracteres";
  if (text.includes("email address") && text.includes("invalid")) return "Informe um e-mail válido";
  return message;
}

export function assertEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) {
    throw new Error("Informe um e-mail válido");
  }
  return email;
}

function appOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_APP_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://omeufinanceiro.vercel.app";
}

export async function signUpWithPassword(
  client: SupabaseClient,
  params: { email: string; password: string; displayName?: string; currency?: string },
): Promise<Session> {
  const email = assertEmail(params.email);
  const { data, error } = await client.auth.signUp({
    email,
    password: params.password,
    options: {
      emailRedirectTo: `${appOrigin()}/`,
      data: {
        display_name: params.displayName?.trim() || email.split("@")[0],
        currency: params.currency ?? "BRL",
      },
    },
  });
  if (error) throw new Error(translateAuthError(error.message));
  if (data.session) {
    adoptSession(data.session);
    return currentSession()!;
  }
  const fallback = await client.auth.signInWithPassword({ email, password: params.password });
  if (fallback.error || !fallback.data.session) {
    throw new Error("Conta criada. Confirme o e-mail para entrar.");
  }
  adoptSession(fallback.data.session);
  return currentSession()!;
}

export async function signInWithPassword(
  client: SupabaseClient,
  params: { email: string; password: string },
): Promise<Session> {
  const email = assertEmail(params.email);
  const { data, error } = await client.auth.signInWithPassword({ email, password: params.password });
  if (error) throw new Error(translateAuthError(error.message));
  if (!data.session) throw new Error("Não foi possível iniciar a sessão");
  adoptSession(data.session);
  return currentSession()!;
}

export async function signOut(client: SupabaseClient): Promise<void> {
  // Clear locally first: callers often reload the page right after locking.
  adoptSession(null);
  await client.auth.signOut();
}

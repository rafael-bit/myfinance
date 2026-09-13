import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { supabase } from "@/infra/supabase/client";
import { createFinanceService, FinanceService, subscribeAuthChange } from "@/application/finance-service";
import { sessionReady } from "@/application/auth-api";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

type Ctx = {
  service: FinanceService | null;
  persisted: boolean;
  storageType: string;
  error: string | null;
  ready: boolean;
  sessionEpoch: number;
  dbEpoch: number;
  isUnlocked: boolean;
  bump: () => void;
  reloadDatabase: () => Promise<void>;
};

const FinanceCtx = createContext<Ctx>({
  service: null,
  persisted: true,
  storageType: "cloud",
  error: null,
  ready: false,
  sessionEpoch: 0,
  dbEpoch: 0,
  isUnlocked: false,
  bump: () => undefined,
  reloadDatabase: async () => undefined,
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <FinanceBootstrap>{children}</FinanceBootstrap>
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function FinanceBootstrap({ children }: { children: ReactNode }) {
  const [service, setService] = useState<FinanceService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await sessionReady(supabase);
        if (cancelled) return;
        setService(createFinanceService(supabase));
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao conectar ao Supabase");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeAuthChange(() => setSessionEpoch((value) => value + 1)), []);

  const value = useMemo<Ctx>(
    () => ({
      service,
      persisted: true,
      storageType: "cloud",
      error,
      ready: Boolean(service),
      sessionEpoch,
      dbEpoch: 0,
      isUnlocked: Boolean(service?.session),
      bump: () => {
        void qc.invalidateQueries();
      },
      reloadDatabase: async () => {
        await sessionReady(supabase);
        setService(createFinanceService(supabase));
        setSessionEpoch((value) => value + 1);
      },
    }),
    [service, error, sessionEpoch, qc],
  );

  return <FinanceCtx.Provider value={value}>{children}</FinanceCtx.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceCtx);
  if (!ctx.service) throw new Error("Serviço financeiro indisponível");
  return ctx.service;
}

export function useFinanceOptional() {
  return useContext(FinanceCtx);
}

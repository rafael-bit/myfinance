import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { BrandMark } from "@/ui/empty-state";
import { useFinance, useFinanceOptional } from "@/app/providers";

function AuthShell({
  kicker,
  title,
  subtitle,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-5 py-10 md:px-8">
      <div className="w-full max-w-md md:max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-6 w-0.5 bg-signal" aria-hidden />
          <BrandMark className="h-10 w-10" />
        </div>
        <p className="kicker">{kicker}</p>
        <h1 className="mt-3 text-4xl font-medium leading-none tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
        {footer}
      </div>
    </div>
  );
}

export function LoginPage({ onDone, onRegister }: { onDone: () => void; onRegister: () => void }) {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => service.unlock({ email, password }),
    onSuccess: () => {
      bump();
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    void service.getLoginUsername().then((name) => {
      if (name) setEmail(name);
    });
    document.getElementById("login-email")?.focus();
  }, [service]);

  return (
    <AuthShell
      kicker="Meu Financeiro"
      title="Entrar"
      subtitle="Use o e-mail e a senha da sua conta na nuvem."
      footer={
        <button type="button" className="mt-4 w-full text-sm text-muted hover:text-foreground" onClick={onRegister}>
          Não tem conta? <span className="text-foreground">Registrar</span>
        </button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="login-email">E-mail</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="login-password">Senha</Label>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <Button className="w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage({ onDone, onLogin }: { onDone: () => void; onLogin: () => void }) {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      service.onboard({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Conta criada");
      bump();
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <AuthShell
      kicker="Novo acesso"
      title="Registrar"
      subtitle="Crie sua conta com e-mail e senha. Os dados ficam salvos na nuvem."
      footer={
        <button type="button" className="mt-4 w-full text-sm text-muted hover:text-foreground" onClick={onLogin}>
          Já tem conta? <span className="text-foreground">Entrar</span>
        </button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim() || !email.includes("@")) {
            toast.error("Informe um e-mail válido");
            return;
          }
          if (password.length < 6) {
            toast.error("Use pelo menos 6 caracteres na senha");
            return;
          }
          if (password !== confirm) {
            toast.error("As senhas não coincidem");
            return;
          }
          mutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="register-email">E-mail</Label>
          <Input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="register-name">Nome (opcional)</Label>
          <Input
            id="register-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
          />
        </div>
        <div>
          <Label htmlFor="register-password">Senha</Label>
          <Input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label htmlFor="register-confirm">Confirmar senha</Label>
          <Input
            id="register-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button className="w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Criando…" : "Criar conta"}
        </Button>
      </form>
    </AuthShell>
  );
}

/** Kept for compatibility with older imports — recovery is no longer used with cloud auth. */
export function VaultRecoveryPage({
  onRegister,
}: {
  onRetry?: () => Promise<void>;
  onUnlock?: () => void;
  onRegister?: () => void;
  onCreate?: () => void;
}) {
  return (
    <AuthShell kicker="Nuvem" title="Conta na nuvem" subtitle="Faça login ou registre um e-mail para continuar.">
      <Button className="w-full" onClick={onRegister}>
        Ir para registro
      </Button>
    </AuthShell>
  );
}

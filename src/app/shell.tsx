import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Home, List, Plus, PieChart, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { QuickAdd } from "@/features/activity/quick-add";
import { OfflineBanner } from "@/ui/empty-state";
import { SignalMist } from "@/ui/signal-mist";
import { GuideProvider } from "@/features/onboarding/tour";

const NAV = [
  { to: "/", label: "Início", icon: Home, tour: "home" },
  { to: "/activity", label: "Finanças", icon: List, tour: "activity" },
  { to: "/investments", label: "Investir", icon: PieChart, tour: "invest" },
  { to: "/more", label: "Planejar", icon: Menu, tour: "more" },
] as const;

export function AppShell() {
  const [quick, setQuick] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <GuideProvider>
      <div className="relative flex min-h-dvh w-full">
        <SignalMist />
        <aside className="sticky top-0 z-10 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-background/80 px-3 py-8 backdrop-blur-sm md:flex lg:w-64 lg:px-4">
          <div className="mb-10 flex items-center gap-3 px-3">
            <span className="h-5 w-0.5 bg-signal" aria-hidden />
            <p className="text-lg font-medium tracking-tight">Meu Financeiro</p>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-tour={item.tour}
                  data-tour-view="desktop"
                  className={cn(
                    "relative flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors duration-[var(--dur-base)]",
                    active ? "pl-4 font-medium text-foreground" : "text-muted hover:text-foreground",
                  )}
                >
                  {active ? <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-signal" /> : null}
                  <item.icon size={16} strokeWidth={1.5} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            data-tour="add"
            data-tour-view="desktop"
            onClick={() => setQuick(true)}
            className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-signal px-4 text-sm font-medium text-signal-foreground transition-[filter,transform] duration-[var(--dur-base)] hover:brightness-110 active:scale-[0.99]"
          >
            <Plus size={16} strokeWidth={1.75} /> Adicionar
          </button>
        </aside>

        <div className="relative z-10 flex min-h-dvh min-w-0 flex-1 flex-col pb-28 md:pb-0">
          <OfflineBanner />

          <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 overflow-x-hidden px-5 py-6 md:px-8 md:py-8 lg:px-10">
            <Outlet />
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 items-center rounded-2xl border border-border bg-nav px-1.5 py-1.5 backdrop-blur-xl">
            {NAV.slice(0, 2).map((item) => (
              <NavLink key={item.to} {...item} active={pathname === item.to} />
            ))}
            <button
              type="button"
              data-tour="add"
              data-tour-view="mobile"
              aria-label="Adicionar movimentação"
              onClick={() => setQuick(true)}
              className="-mt-6 flex h-12 w-12 items-center justify-center justify-self-center rounded-2xl bg-signal text-signal-foreground transition-transform duration-[var(--dur-base)] active:scale-95"
            >
              <Plus strokeWidth={1.75} size={20} />
            </button>
            {NAV.slice(2).map((item) => (
              <NavLink key={item.to} {...item} active={pathname === item.to} />
            ))}
          </div>
        </nav>

        <QuickAdd open={quick} onOpenChange={setQuick} />
      </div>
    </GuideProvider>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  tour,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  tour: string;
}) {
  return (
    <Link
      to={to}
      data-tour={tour}
      data-tour-view="mobile"
      className={cn(
        "relative flex flex-col items-center gap-0.5 py-1 text-[10px] tracking-wide",
        active ? "font-medium text-foreground" : "text-muted",
      )}
    >
      {active ? <span className="absolute top-0 h-0.5 w-4 bg-signal" /> : null}
      <Icon size={18} strokeWidth={1.5} />
      {label}
    </Link>
  );
}

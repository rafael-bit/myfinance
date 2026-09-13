import { useEffect, useState } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "./shell";
import { useFinanceOptional } from "./providers";
import { LoginPage, RegisterPage } from "@/features/onboarding/onboarding";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ActivityPage } from "@/features/activity/activity-page";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { CardsPage } from "@/features/cards/cards-page";
import { InvestmentsPage } from "@/features/investments/investments-page";
import { MorePage } from "@/features/more/more-page";
import { ImportPage } from "@/features/import/import-page";
import { Splash } from "@/ui/empty-state";

type Gate = "load" | "login" | "register" | "app";

function RootLayout() {
  const { service, ready, error, sessionEpoch } = useFinanceOptional();
  const [gate, setGate] = useState<Gate>("load");

  useEffect(() => {
    if (!ready || !service) return;
    let cancelled = false;
    void (async () => {
      await service.hasUser();
      if (cancelled) return;
      setGate(service.session ? "app" : "login");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, service, sessionEpoch]);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center px-6">
        <p className="text-danger">{error}</p>
      </div>
    );
  }
  if (!ready || gate === "load") return <Splash />;
  if (gate === "register") {
    return (
      <RegisterPage
        onDone={() => setGate("app")}
        onLogin={() => setGate("login")}
      />
    );
  }
  if (gate === "login") {
    return (
      <LoginPage
        onDone={() => setGate("app")}
        onRegister={() => setGate("register")}
      />
    );
  }
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: RootLayout });
const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: "shell", component: AppShell });
const indexRoute = createRoute({ getParentRoute: () => shellRoute, path: "/", component: DashboardPage });
const activityRoute = createRoute({ getParentRoute: () => shellRoute, path: "/activity", component: ActivityPage });
const accountsRoute = createRoute({ getParentRoute: () => shellRoute, path: "/accounts", component: AccountsPage });
const cardsRoute = createRoute({ getParentRoute: () => shellRoute, path: "/cards", component: CardsPage });
const investmentsRoute = createRoute({ getParentRoute: () => shellRoute, path: "/investments", component: InvestmentsPage });
const moreRoute = createRoute({ getParentRoute: () => shellRoute, path: "/more", component: MorePage });
const importRoute = createRoute({ getParentRoute: () => shellRoute, path: "/import", component: ImportPage });

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([indexRoute, activityRoute, accountsRoute, cardsRoute, investmentsRoute, moreRoute, importRoute]),
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}

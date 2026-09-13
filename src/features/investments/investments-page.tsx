import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { PageTitle } from "@/ui/page-title";
import { EmptyState } from "@/ui/empty-state";
import { Sheet } from "@/ui/sheet";
import { todayIsoDate } from "@/shared/dates";

const COLORS = ["#a57c4a", "#243f38", "#7a7268", "#c4b49a", "#8a4b3a"];

export function InvestmentsPage() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const port = useQuery({ queryKey: ["portfolio"], queryFn: () => service.portfolio() });
  const analysis = useQuery({ queryKey: ["analysis"], queryFn: () => service.analyze() });
  const recs = useQuery({ queryKey: ["recs"], queryFn: () => service.recommend() });
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => service.listQuotes() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ symbol: "PETR4", name: "Petrobras", class: "stock", qty: "10", amount: "100" });

  const create = useMutation({
    mutationFn: async () => {
      const accounts = await service.listAccounts();
      let custody = accounts.find((a) => a.type === "investment");
      if (!custody) {
        const created = await service.createAccount({ name: "Corretora", type: "investment", currency: "BRL", initialBalanceMinor: 0 });
        custody = { ...created, balanceMinor: 0 };
      }
      const cash = accounts.find((a) => a.type !== "credit" && a.type !== "investment") ?? custody;
      const instrument = await service.upsertInstrument({ symbol: form.symbol, name: form.name, class: form.class as never, currency: "BRL" });
      return service.recordInvestment({
        custodyAccountId: custody.id,
        instrumentId: instrument.id,
        type: "buy",
        date: todayIsoDate(),
        quantity: Number(form.qty),
        amountMajor: form.amount,
        currency: "BRL",
        cashAccountId: cash.id,
      });
    },
    onSuccess: () => {
      toast.success("Compra registrada");
      bump();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!port.data?.holdings.length) {
    return (
      <div>
        <PageTitle kicker="Carteira">Investir</PageTitle>
        <EmptyState title="Sua carteira está vazia" description="Cadastre a corretora como conta de investimentos e registre a primeira compra. Aportes não são despesa." action="Registrar ativo" onAction={() => setOpen(true)} />
        <InstrumentSheet open={open} onOpenChange={setOpen} form={form} setForm={setForm} onSave={() => create.mutate()} />
      </div>
    );
  }

  const pie = port.data.holdings.map((h) => ({ name: h.instrument?.symbol ?? "?", value: h.marketMinor / 100 }));

  return (
    <div className="space-y-5 pb-8">
      <PageTitle
        kicker="Carteira"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            Evento
          </Button>
        }
      >
        Investir
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <p className="font-display text-4xl leading-none md:text-5xl">
            <MoneyText amountMinor={port.data.totalMarketMinor} />
          </p>
          <p className="text-sm text-muted">
            Custo <MoneyText amountMinor={port.data.totalCostMinor} /> · resultado <MoneyText amountMinor={port.data.totalMarketMinor - port.data.totalCostMinor} signed />
          </p>
          <Card className="h-56 md:h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72}>
                  {pie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <div className="space-y-3">
          {port.data.holdings.map((h) => (
            <Card key={h.instrument?.id} className="flex justify-between gap-4">
              <div>
                <p className="font-medium">{h.instrument?.symbol}</p>
                <p className="text-xs text-muted">{h.position.quantity} un · {h.instrument?.class}</p>
              </div>
              <MoneyText amountMinor={h.marketMinor} className="text-lg" />
            </Card>
          ))}
        </div>
      </div>
      {analysis.data?.alerts.map((alert) => (
        <p key={alert.code} className="text-sm text-muted">
          {alert.message}
        </p>
      ))}
      {recs.data && recs.data.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium">Oportunidades</h2>
          {recs.data.map((rec) => (
            <Card key={rec.product.id} className="mb-2">
              <p className="font-medium">{rec.product.name}</p>
              <p className="text-sm text-muted">{rec.reasons.join(" ")}</p>
            </Card>
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted">Responda o questionário em Mais para ver recomendações justificadas.</p>
      )}
      {quotes.data?.length ? (
        <p className="text-xs text-muted">Selic/CDI/IPCA em cache local quando a rede permitir.</p>
      ) : null}
      <InstrumentSheet open={open} onOpenChange={setOpen} form={form} setForm={setForm} onSave={() => create.mutate()} />
    </div>
  );
}

function InstrumentSheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: { symbol: string; name: string; class: string; qty: string; amount: string };
  setForm: (v: { symbol: string; name: string; class: string; qty: string; amount: string }) => void;
  onSave: () => void;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange} title="Compra de ativo">
      <Label>Ticker</Label>
      <Input className="mb-3" value={props.form.symbol} onChange={(e) => props.setForm({ ...props.form, symbol: e.target.value })} />
      <Label>Nome</Label>
      <Input className="mb-3" value={props.form.name} onChange={(e) => props.setForm({ ...props.form, name: e.target.value })} />
      <Label>Classe</Label>
      <select className="mb-3 h-12 w-full rounded-2xl border border-border bg-card px-3" value={props.form.class} onChange={(e) => props.setForm({ ...props.form, class: e.target.value })}>
        {["tesouro", "cdb", "lci", "lca", "rf", "stock", "fii", "etf", "fund", "crypto", "pension", "other"].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <Label>Quantidade</Label>
      <Input className="mb-3" value={props.form.qty} onChange={(e) => props.setForm({ ...props.form, qty: e.target.value })} />
      <Label>Valor total</Label>
      <Input className="mb-4" value={props.form.amount} onChange={(e) => props.setForm({ ...props.form, amount: e.target.value })} />
      <Button className="mb-4 w-full" onClick={props.onSave}>
        Salvar
      </Button>
    </Sheet>
  );
}

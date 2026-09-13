import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { PageTitle } from "@/ui/page-title";
import { EmptyState } from "@/ui/empty-state";
import { Sheet } from "@/ui/sheet";

export function CardsPage() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const [open, setOpen] = useState(false);
  const cards = useQuery({ queryKey: ["cards"], queryFn: () => service.listCards() });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => service.listAccounts() });
  const [form, setForm] = useState({ name: "", limit: "1000", closing: "8", due: "15", pay: "" });

  const create = useMutation({
    mutationFn: () =>
      service.createCard({
        name: form.name,
        limitMajor: form.limit,
        currency: "BRL",
        closingDay: Number(form.closing),
        dueDay: Number(form.due),
        paymentAccountId: form.pay || undefined,
      }),
    onSuccess: () => {
      toast.success("Cartão criado");
      bump();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 pb-8">
      <PageTitle
        kicker="Limite e faturas"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            Novo
          </Button>
        }
      >
        Cartões
      </PageTitle>
      {cards.data?.length === 0 ? (
        <EmptyState title="Nenhum cartão" description="Cadastre o limite, fechamento e vencimento. Compras no cartão só saem da conta corrente no pagamento da fatura." action="Adicionar cartão" onAction={() => setOpen(true)} />
      ) : (
        cards.data?.map((card) => (
          <Card key={card.id}>
            <p className="text-lg font-semibold">{card.name}</p>
            <p className="mt-1 text-sm text-muted">
              Disponível <MoneyText amountMinor={card.availableMinor} /> de <MoneyText amountMinor={card.limitMinor} />
            </p>
            {card.openInvoice ? (
              <div className="mt-3 text-sm">
                <p>Fatura aberta · fecha {card.openInvoice.closingDate} · vence {card.openInvoice.dueDate}</p>
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    const pay = accounts.data?.find((a) => a.type !== "credit");
                    const amount = prompt("Valor do pagamento");
                    if (amount && pay) void service.payInvoice(card.openInvoice!.id, pay.id, amount).then(() => { toast.success("Fatura paga"); bump(); });
                  }}
                >
                  Pagar fatura
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}
      <Sheet open={open} onOpenChange={setOpen} title="Novo cartão">
        <Label>Nome</Label>
        <Input className="mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Label>Limite</Label>
        <Input className="mb-3" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <Label>Fechamento</Label>
            <Input value={form.closing} onChange={(e) => setForm({ ...form, closing: e.target.value })} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </div>
        </div>
        <Button className="mb-4 w-full" onClick={() => create.mutate()} disabled={!form.name}>
          Salvar
        </Button>
      </Sheet>
    </div>
  );
}

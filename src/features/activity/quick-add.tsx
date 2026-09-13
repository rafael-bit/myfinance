import { useEffect, useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import { toast } from "sonner";

import { Sheet } from "@/ui/sheet";

import { Button } from "@/ui/button";

import { Input } from "@/ui/input";

import { Label } from "@/ui/label";

import { useFinance, useFinanceOptional } from "@/app/providers";

import { todayIsoDate } from "@/shared/dates";



const TYPES = [

  { id: "expense", label: "Despesa" },

  { id: "income", label: "Receita" },

  { id: "transfer", label: "Transferir" },

  { id: "investment", label: "Investir" },

] as const;



const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];



export function QuickAdd({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {

  const service = useFinance();

  const { bump } = useFinanceOptional();

  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("expense");

  const [amount, setAmount] = useState("");

  const [description, setDescription] = useState("");

  const [date, setDate] = useState(todayIsoDate());

  const [accountId, setAccountId] = useState("");

  const [toAccountId, setToAccountId] = useState("");

  const [categoryId, setCategoryId] = useState("");

  const [paymentMode, setPaymentMode] = useState<"account" | "card">("account");

  const [cardId, setCardId] = useState("");

  const [installments, setInstallments] = useState("1");



  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => service.listAccounts(), enabled: open });

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => service.listCategories(), enabled: open });

  const cards = useQuery({ queryKey: ["cards"], queryFn: () => service.listCards(), enabled: open });

  const instruments = useQuery({ queryKey: ["instruments"], queryFn: () => service.listInstruments(), enabled: open && type === "investment" });



  const assets = accounts.data?.filter((a) => a.type !== "credit") ?? [];

  const custodies = accounts.data?.filter((a) => a.type === "investment") ?? [];



  useEffect(() => {

    if (!open) return;

    if (paymentMode === "card" && cards.data?.length && !cardId) {

      setCardId(cards.data[0].id);

    }

  }, [open, paymentMode, cards.data, cardId]);



  const mutation = useMutation({

    mutationFn: async () => {

      const acc = accountId || assets[0]?.id;

      if (!acc) throw new Error("Crie uma conta primeiro");

      if (type === "expense") {

        if (paymentMode === "card") {

          if (!cards.data?.length) throw new Error("Cadastre um cartão em Finanças → Cartões");

          const card = cards.data.find((c) => c.id === cardId) ?? cards.data[0];

          const count = Math.max(1, Number(installments) || 1);

          return service.registerExpense({

            amountMajor: amount,

            currency: "BRL",

            accountId: card.accountId,

            categoryId: categoryId || undefined,

            description: description || "Despesa",

            date,

            cardId: card.id,

            installments: count,

          });

        }

        return service.registerExpense({

          amountMajor: amount,

          currency: "BRL",

          accountId: acc,

          categoryId: categoryId || undefined,

          description: description || "Despesa",

          date,

          installments: 1,

        });

      }

      if (type === "income") {

        return service.registerIncome({

          amountMajor: amount,

          currency: "BRL",

          accountId: acc,

          categoryId: categoryId || undefined,

          description: description || "Receita",

          date,

        });

      }

      if (type === "transfer") {

        if (!toAccountId) throw new Error("Escolha a conta de destino");

        return service.registerTransfer({

          amountMajor: amount,

          currency: "BRL",

          fromAccountId: acc,

          toAccountId,

          description: description || "Transferência",

          date,

        });

      }

      const instrument = instruments.data?.[0];

      const custody = custodies[0]?.id;

      if (!instrument || !custody) throw new Error("Cadastre um ativo e uma conta de investimentos");

      return service.recordInvestment({

        custodyAccountId: custody,

        instrumentId: instrument.id,

        type: "buy",

        date,

        quantity: Number(installments) || 1,

        amountMajor: amount,

        currency: "BRL",

        cashAccountId: acc,

      });

    },

    onSuccess: () => {

      toast.success("Lançamento salvo");

      bump();

      onOpenChange(false);

      setAmount("");

      setDescription("");

      setPaymentMode("account");

      setCardId("");

      setInstallments("1");

    },

    onError: (err) => toast.error(err.message),

  });



  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Adicionar">
      <div className="grid grid-cols-2 gap-2 pb-5">
        {TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setType(item.id)}
            className={`composer-item min-h-14 rounded-[var(--radius-control)] border px-3 text-left text-sm transition-colors ${
              type === item.id
                ? "border-signal bg-signal/10 font-medium text-foreground"
                : "border-border text-muted hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted">Tipo</span>
            <span className="mt-1 block">{item.label}</span>
          </button>
        ))}
      </div>
      <Label htmlFor="amount">Valor</Label>
      <Input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mb-3 amount text-3xl" />

      <Label htmlFor="desc">Descrição</Label>

      <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mb-3" />

      <Label htmlFor="date">Data</Label>

      <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3" />



      {type === "expense" ? (

        <>

          <Label>Forma de pagamento</Label>

          <div className="mb-3 flex gap-2">

            <button

              type="button"

              onClick={() => setPaymentMode("account")}

              className={`min-h-11 flex-1 rounded-full px-3 text-sm ${paymentMode === "account" ? "bg-foreground text-background" : "bg-card hairline text-muted"}`}

            >

              Conta

            </button>

            <button

              type="button"

              onClick={() => setPaymentMode("card")}

              className={`min-h-11 flex-1 rounded-full px-3 text-sm ${paymentMode === "card" ? "bg-foreground text-background" : "bg-card hairline text-muted"}`}

            >

              Cartão

            </button>

          </div>

          {paymentMode === "account" ? (

            <>

              <Label>Conta</Label>

              <select className="select-field mb-3" value={accountId} onChange={(e) => setAccountId(e.target.value)}>

                {assets.map((account) => (

                  <option key={account.id} value={account.id}>

                    {account.name}

                  </option>

                ))}

              </select>

            </>

          ) : (

            <>

              <Label>Cartão</Label>

              {cards.data?.length ? (

                <select className="select-field mb-3" value={cardId} onChange={(e) => setCardId(e.target.value)}>

                  {cards.data.map((card) => (

                    <option key={card.id} value={card.id}>

                      {card.name}

                    </option>

                  ))}

                </select>

              ) : (

                <p className="mb-3 text-sm text-muted">Nenhum cartão cadastrado. Vá em Finanças → Cartões.</p>

              )}

              <Label>Parcelas</Label>

              <select className="select-field mb-3" value={installments} onChange={(e) => setInstallments(e.target.value)}>

                {INSTALLMENT_OPTIONS.map((n) => (

                  <option key={n} value={String(n)}>

                    {n === 1 ? "1x à vista" : `${n}x`}

                  </option>

                ))}

              </select>

            </>

          )}

        </>

      ) : (

        <>

          <Label>Conta</Label>

          <select className="select-field mb-3" value={accountId} onChange={(e) => setAccountId(e.target.value)}>

            {assets.map((account) => (

              <option key={account.id} value={account.id}>

                {account.name}

              </option>

            ))}

          </select>

        </>

      )}



      {type === "transfer" ? (

        <>

          <Label>Para</Label>

          <select className="select-field mb-3" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>

            <option value="">Selecione</option>

            {assets.map((account) => (

              <option key={account.id} value={account.id}>

                {account.name}

              </option>

            ))}

          </select>

        </>

      ) : null}

      {(type === "expense" || type === "income") && (

        <>

          <Label>Categoria</Label>

          <select className="select-field mb-4" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>

            <option value="">Sem categoria</option>

            {categories.data

              ?.filter((c) => c.kind === type && c.active)

              .map((category) => (

                <option key={category.id} value={category.id}>

                  {category.parentId ? "— " : ""}

                  {category.name}

                </option>

              ))}

          </select>

        </>

      )}

      <Button className="mb-4 w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || !amount}>

        Salvar

      </Button>

    </Sheet>

  );

}



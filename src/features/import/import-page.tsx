import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { extractPdfText } from "@/infra/import/pdf-text";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { EmptyState } from "@/ui/empty-state";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { PageTitle } from "@/ui/page-title";

type PreviewItem = {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  type: "income" | "expense" | "transfer" | "unknown";
  externalId?: string;
  duplicate: boolean;
  categoryId?: string;
  decision: "accept" | "skip";
  toAccountId?: string;
};

type PreviewFile = { name: string; source: string; hash: string };

async function hashText(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readStatementFile(file: File): Promise<{ name: string; text: string }> {
  const name = file.name;
  if (name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    return { name, text: await extractPdfText(await file.arrayBuffer()) };
  }
  return { name, text: await file.text() };
}

export function ImportPage() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const navigate = useNavigate();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => service.listAccounts() });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => service.listCategories() });
  const assets = accounts.data?.filter((a) => a.type !== "credit") ?? [];
  const [accountId, setAccountId] = useState("");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [reading, setReading] = useState(false);
  const selectedAccount = assets.find((a) => a.id === (accountId || assets[0]?.id));

  const stats = useMemo(() => {
    const accept = items.filter((i) => i.decision === "accept");
    return {
      total: items.length,
      accept: accept.length,
      skip: items.length - accept.length,
      in: accept.filter((i) => i.type === "income" || (i.type !== "expense" && i.type !== "transfer" && i.amountMinor > 0)).length,
      out: accept.filter((i) => i.type === "expense" || (i.type !== "income" && i.type !== "transfer" && i.amountMinor < 0)).length,
      transfers: accept.filter((i) => i.type === "transfer").length,
    };
  }, [items]);

  const commit = useMutation({
    mutationFn: async () => {
      const acc = selectedAccount;
      if (!acc) throw new Error("Escolha uma conta");
      const missingTransfer = items.find((i) => i.decision === "accept" && i.type === "transfer" && !i.toAccountId);
      if (missingTransfer) throw new Error(`Informe a outra conta de "${missingTransfer.description}"`);
      return service.commitImport(
        items.map((item) => ({
          description: item.description,
          date: item.date,
          amountMinor: item.amountMinor,
          type: item.type === "unknown" ? (item.amountMinor < 0 ? "expense" : "income") : item.type,
          categoryId: item.categoryId,
          decision: item.decision,
          externalId: item.externalId,
          toAccountId: item.toAccountId,
        })),
        acc.id,
        acc.currency || "BRL",
        {
          source: files[0]?.source ?? "csv",
          fileName: files.map((f) => f.name).join(", ") || "import",
          fileHash: files[0]?.hash,
        },
      );
    },
    onSuccess: (result) => {
      toast.success(`${result.accepted} lançamentos gravados${result.skipped ? ` · ${result.skipped} pulados` : ""}`);
      bump();
      void navigate({ to: "/activity" });
    },
    onError: (err) => toast.error(err.message),
  });

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    try {
      const nextItems: PreviewItem[] = [];
      const nextUnknown: string[] = [];
      const nextFiles: PreviewFile[] = [];
      for (const file of [...list]) {
        const { name, text } = await readStatementFile(file);
        const preview = await service.previewImport(name, text);
        nextFiles.push({ name, source: preview.source, hash: await hashText(text) });
        nextItems.push(...preview.items.map((item, index) => ({
          ...item,
          id: `${name}-${item.id}-${index}`,
          type: item.type,
        })));
        nextUnknown.push(...preview.unrecognized);
      }
      setFiles(nextFiles);
      setItems(nextItems);
      setUnrecognized(nextUnknown);
      toast.message(`${nextItems.length} movimentos lidos`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler o extrato");
    } finally {
      setReading(false);
    }
  };

  const patch = (id: string, patch: Partial<PreviewItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  if (!accounts.isLoading && assets.length === 0) {
    return (
      <div className="pb-8">
        <PageTitle kicker="Extrato">Importar</PageTitle>
        <EmptyState
          title="Crie uma conta primeiro"
          description="O extrato precisa de uma conta corrente, poupança ou carteira para receber as entradas e saídas."
          action="Ir para contas"
          onAction={() => void navigate({ to: "/accounts" })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageTitle kicker="Extrato do banco" action={<Button asChild variant="secondary" size="sm"><Link to="/activity">Voltar</Link></Button>}>
        Importar
      </PageTitle>

      <Card className="space-y-4">
        <div>
          <Label>Conta do extrato</Label>
          <select className="select-field" value={accountId || selectedAccount?.id || ""} onChange={(e) => setAccountId(e.target.value)}>
            {assets.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <label
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border px-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
        >
          <p className="font-display text-2xl">Solte o extrato aqui</p>
          <p className="mt-2 text-sm text-muted">CSV, PDF com texto ou OFX. Dá para enviar vários arquivos.</p>
          <input
            type="file"
            accept=".csv,.ofx,.ofc,.pdf,text/csv,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
        {reading ? <p className="text-sm text-muted">Lendo arquivo…</p> : null}
        {files.length ? <p className="text-sm text-muted">{files.map((f) => f.name).join(" · ")}</p> : null}
      </Card>

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {stats.accept} aceitos · {stats.in} entradas · {stats.out} saídas · {stats.transfers} transferências · {stats.skip} pulados
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setItems((rows) => rows.map((row) => ({ ...row, decision: row.duplicate ? "skip" : "accept" })))}>
                Aceitar novos
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setItems((rows) => rows.map((row) => ({ ...row, decision: "skip" })))}>
                Pular todos
              </Button>
            </div>
          </div>

          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-muted">
                        {item.date}
                        {item.duplicate ? " · já existe no app" : ""}
                      </p>
                    </div>
                    <MoneyText amountMinor={item.amountMinor} signed={item.type !== "transfer"} className="shrink-0 text-lg" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      className="select-field h-11"
                      value={item.decision}
                      onChange={(e) => patch(item.id, { decision: e.target.value as PreviewItem["decision"] })}
                    >
                      <option value="accept">Aceitar</option>
                      <option value="skip">Pular</option>
                    </select>
                    <select
                      className="select-field h-11"
                      value={item.type}
                      onChange={(e) => patch(item.id, { type: e.target.value as PreviewItem["type"] })}
                    >
                      <option value="income">Entrada</option>
                      <option value="expense">Saída</option>
                      <option value="transfer">Transferência</option>
                    </select>
                    {item.type === "transfer" ? (
                      <select
                        className="select-field h-11"
                        value={item.toAccountId ?? ""}
                        onChange={(e) => patch(item.id, { toAccountId: e.target.value })}
                      >
                        <option value="">Outra conta</option>
                        {assets.filter((a) => a.id !== selectedAccount?.id).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="select-field h-11"
                        value={item.categoryId ?? ""}
                        onChange={(e) => patch(item.id, { categoryId: e.target.value || undefined })}
                      >
                        <option value="">Sem categoria</option>
                        {categories.data
                          ?.filter((c) => c.active && (item.type === "income" ? c.kind === "income" : c.kind === "expense"))
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {unrecognized.length > 0 ? (
            <Card>
              <p className="font-medium">Linhas não reconhecidas ({unrecognized.length})</p>
              <p className="mt-1 text-sm text-muted">Não serão gravadas. Se o PDF for imagem, exporte CSV no banco.</p>
              <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-muted">
                {unrecognized.slice(0, 30).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Button className="w-full" disabled={commit.isPending || stats.accept === 0} onClick={() => commit.mutate()}>
            {commit.isPending ? "Gravando…" : `Confirmar ${stats.accept} lançamentos`}
          </Button>
        </>
      ) : null}
    </div>
  );
}

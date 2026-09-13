# Meu Financeiro

Sistema pessoal de gestão financeira, patrimônio e investimentos. Offline-first, mobile-first, com razão de partidas dobradas.

## Stack

React, TypeScript, Vite, Tailwind CSS, shadcn-style UI, TanStack Query, TanStack Router, Drizzle ORM, SQLite WASM (SQLocal + OPFS).

## Como rodar

```bash
npm install
npm run dev
npm test
npm run build
```

O servidor de desenvolvimento envia os headers COOP/COEP necessários para persistência OPFS.

## Uso

1. Crie o cofre com senha (mínimo 8 caracteres).
2. Guarde a chave de recuperação fora do navegador.
3. Cadastre uma conta em Finanças → Contas.
4. Lance despesas, receitas e transferências pelo botão +.
5. Exporte backup em Mais → Dados. O armazenamento do navegador **não** é backup.

## Princípios

- Transferência entre contas próprias não é receita nem despesa.
- Compra parcelada entra na competência de cada parcela.
- Compra no cartão só sai da conta corrente no pagamento da fatura.
- Aporte em corretora não é despesa de consumo.
- Cálculos financeiros são determinísticos. IA só explica dados já calculados.

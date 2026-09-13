# Aplicar schema no Supabase

A máquina de desenvolvimento não alcança `db.*.supabase.co` (IPv6). Aplique o SQL manualmente:

1. Abra https://supabase.com/dashboard/project/takhmelwvicuwecyqvpo/sql/new
2. Cole o conteúdo de [`schema.sql`](./schema.sql)
3. Run

Opcional depois (Auth → Providers → Email): desative **Confirm email** para login imediato em desenvolvimento.

Troque a senha do banco no painel (Database → Settings) — ela foi exposta no chat.

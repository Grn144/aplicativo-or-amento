-- 004_rate_limit.sql
-- Janela de tentativas para rotas de autenticação (login, reset de senha, verificação MFA).
-- RLS habilitada SEM policies: somente o service role (admin client) acessa.

CREATE TABLE rate_limit (
  chave         text PRIMARY KEY,
  contagem      integer NOT NULL DEFAULT 1,
  janela_inicio timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit ENABLE ROW LEVEL SECURITY;

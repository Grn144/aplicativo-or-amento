# Aplicativo de Orçamento de Obras

Sistema web para criação e gestão de orçamentos de obras de engenharia. Permite estruturar orçamentos por grupos de disciplinas, lançar itens com custos de mão de obra e material, aplicar margens individualmente e visualizar totais em visão técnica ou comercial — tudo em tempo real.

## Funcionalidades

- **Autenticação com MFA** — login por e-mail + código OTP de 6 dígitos enviado por e-mail (validade 10 min, até 5 tentativas)
- **Lista de obras** — busca por código/nome, filtro por status, acesso rápido ao editor
- **Editor de orçamento**
  - Cabeçalho editável (código, nome, cliente, data, status) com salvamento automático no blur/select
  - Grupos organizados por letra (A, B, C…) com disciplina associada
  - Itens com descrição, local, unidade de medida, quantidade e custos unitários de mão de obra e material
  - Margens de lucro por item (mão de obra e material separadas)
  - Edição inline por duplo clique — totais atualizam em tempo real sem recarregar a página
  - Adição e remoção de grupos e itens
  - Toggle entre **visão técnica** (custos + margens) e **visão comercial** (preços de venda)
- **Preços de venda nunca armazenados** — calculados em tempo real a partir de custo + margem

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) |
| Linguagem | TypeScript (strict) |
| Estilo | Tailwind CSS v4 + shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| E-mail | Resend |
| Testes | Vitest |
| Runtime | Node.js ≥ 20 |

## Estrutura do banco de dados

```
clientes
usuarios          → espelha auth.users do Supabase
disciplinas       → cadastro de disciplinas de engenharia
unidades_medida   → m², m³, un, hr, etc.
obras             → cabeçalho do orçamento (cliente, código, status…)
grupos_orcamento  → grupos A/B/C dentro de uma obra (por disciplina)
itens_orcamento   → itens com custo unitário de MO e material + margens
mfa_pendente      → códigos OTP temporários para autenticação
```

Row Level Security habilitado em todas as tabelas via função `get_user_papel()`.

## Como rodar localmente

### Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com)
- Conta no [Resend](https://resend.com) (envio de e-mail OTP)

### Configuração

1. Clone o repositório:
   ```bash
   git clone https://github.com/Grn144/aplicativo-or-amento.git
   cd aplicativo-or-amento
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie o arquivo `.env.local` na raiz com as variáveis abaixo:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   RESEND_API_KEY=re_<sua-chave>
   EMAIL_FROM=noreply@seudominio.com
   ```

4. Execute as migrations no Supabase SQL Editor (em ordem):
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_rls_policies.sql
   supabase/migrations/003_seed.sql
   ```

5. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

   Acesse [http://localhost:3000](http://localhost:3000).

## Scripts disponíveis

```bash
npm run dev        # servidor de desenvolvimento com Turbopack
npm run build      # build de produção
npm run start      # servidor de produção
npm test           # testes em modo watch
npm run test:run   # testes uma vez (CI)
```

## Testes

```bash
npm run test:run
```

8 testes unitários cobrindo a biblioteca de cálculo (`lib/calculos.ts`): subtotais de custo, preços de venda, lucro, margem efetiva, totais por grupo e totais gerais.

## Fluxo de autenticação

1. Usuário informa e-mail na tela de login
2. Sistema gera código OTP de 6 dígitos via `crypto.randomInt` e envia por e-mail (Resend)
3. Usuário digita o código — até 5 tentativas, expira em 10 minutos
4. Sessão MFA válida por 8 horas (cookie `mfa_verificado` httpOnly)
5. Middleware valida o cookie em todas as rotas protegidas (`/obras/*`)

## Deploy

Compatível com [Vercel](https://vercel.com) (zero configuração para Next.js). Configure as variáveis de ambiente no painel do projeto antes do deploy.

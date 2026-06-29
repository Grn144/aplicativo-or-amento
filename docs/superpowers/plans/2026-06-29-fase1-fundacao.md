# Sistema de Orçamento — Fase 1: Fundação

> **Para execução:** Use superpowers:subagent-driven-development ou superpowers:executing-plans para implementar task por task.

**Goal:** Projeto Next.js 15 rodando com banco Supabase configurado, autenticação com email + senha + MFA por email, e rotas protegidas funcionando.

**Architecture:** Next.js 15 App Router com Supabase Auth. Login em dois passos: senha → código OTP enviado por email. Middleware verifica JWT e cookie de MFA em cada requisição.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL + Auth), Resend (email), Vitest

## Global Constraints

- Node.js ≥ 20
- Next.js 15 com App Router (nunca Pages Router)
- TypeScript strict mode
- Todo texto de UI em português brasileiro
- Variáveis de ambiente nunca commitadas (apenas `.env.local`)
- Supabase project URL e anon key ficam em `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service role key fica em `SUPABASE_SERVICE_ROLE_KEY` (server-only, sem `NEXT_PUBLIC_`)
- Resend API key fica em `RESEND_API_KEY` (server-only)

---

## Pré-requisito: Criar projeto Supabase

Antes de começar as tasks:

1. Acesse [supabase.com](https://supabase.com) → New Project
2. Anote: **Project URL**, **anon key** (Settings → API), **service_role key**
3. Em Authentication → Settings: desabilite "Enable email confirmations" (usaremos nosso próprio MFA)
4. Em Authentication → Email Templates: pode deixar padrão por enquanto
5. Em Authentication → SMTP Settings: configure um SMTP ou use o padrão do Supabase

---

## Mapa de arquivos

```
aplicativo-orcamento/
├── middleware.ts
├── next.config.ts
├── vitest.config.ts
├── .env.local                          ← nunca commitar
├── .env.local.example                  ← commitar este
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       └── 003_seed.sql
├── types/
│   ├── database.ts
│   └── orcamento.ts
├── lib/
│   └── supabase/
│       ├── server.ts
│       └── client.ts
└── app/
    ├── (auth)/
    │   ├── layout.tsx
    │   ├── login/
    │   │   └── page.tsx
    │   └── verificar/
    │       └── page.tsx
    └── (app)/
        ├── layout.tsx
        └── obras/
            └── page.tsx               ← placeholder para Fase 2
```

---

## Task 1: Scaffolding do projeto

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `.env.local.example`, `components.json`

**Interfaces:**
- Produz: projeto Next.js 15 rodando em `localhost:3000` com shadcn/ui e Vitest configurados

- [ ] **Step 1: Criar app Next.js 15**

No diretório `aplicativo-orcamento`:

```bash
npx create-next-app@15 . --typescript --tailwind --app --src-dir=no --import-alias="@/*" --use-npm --yes
```

- [ ] **Step 2: Instalar dependências**

```bash
npm install @supabase/supabase-js @supabase/ssr resend
npm install exceljs
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Inicializar shadcn/ui**

```bash
npx shadcn@latest init --defaults
npx shadcn@latest add button input label card badge dialog select textarea sonner
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 5: Criar `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Criar `.env.local.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Resend (email para MFA)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Criar `.env.local` com valores reais** (não commitar)

Copie `.env.local.example` para `.env.local` e preencha com os valores do seu projeto Supabase e Resend.

- [ ] **Step 8: Adicionar script de test ao `package.json`**

Abra `package.json` e adicione dentro de `"scripts"`:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 9: Verificar que o app sobe**

```bash
npm run dev
```

Esperado: `localhost:3000` carrega a página padrão do Next.js sem erros.

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffolding Next.js 15 + shadcn + Vitest"
```

---

## Task 2: Migrations e seed do banco

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/migrations/002_rls_policies.sql`
- Create: `supabase/migrations/003_seed.sql`

**Interfaces:**
- Produz: banco PostgreSQL com todas as tabelas, políticas RLS e dados iniciais (disciplinas + unidades)

- [ ] **Step 1: Criar `supabase/migrations/001_initial_schema.sql`**

```sql
-- 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clientes
CREATE TABLE clientes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  razao_social text NOT NULL,
  cnpj         text,
  endereco     text,
  criado_em    timestamptz DEFAULT now()
);

-- Usuários (espelha auth.users do Supabase)
CREATE TABLE usuarios (
  id        uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nome      text NOT NULL,
  email     text NOT NULL UNIQUE,
  papel     text NOT NULL CHECK (papel IN ('admin','engenheiro','orcamentista','visualizador')),
  ativo     boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

-- Disciplinas (cadastro aberto)
CREATE TABLE disciplinas (
  id    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome  text NOT NULL UNIQUE,
  ativo boolean DEFAULT true
);

-- Unidades de medida
CREATE TABLE unidades_medida (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sigla     text NOT NULL UNIQUE,
  descricao text
);

-- Obras
CREATE TABLE obras (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id     uuid REFERENCES clientes ON DELETE RESTRICT,
  codigo         text NOT NULL,
  nome           text NOT NULL,
  data_orcamento date,
  status         text NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','enviado','aprovado',
                                   'em_execucao','concluido','cancelado')),
  criado_por     uuid REFERENCES usuarios,
  criado_em      timestamptz DEFAULT now(),
  atualizado_em  timestamptz DEFAULT now()
);

-- Grupos de orçamento (blocos A, B, C... dentro de uma obra)
CREATE TABLE grupos_orcamento (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id       uuid REFERENCES obras ON DELETE CASCADE,
  disciplina_id uuid REFERENCES disciplinas,
  letra         text NOT NULL,
  ordem         integer NOT NULL,
  UNIQUE (obra_id, letra)
);

-- Itens de orçamento
CREATE TABLE itens_orcamento (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  grupo_id            uuid REFERENCES grupos_orcamento ON DELETE CASCADE,
  numero              integer NOT NULL,
  descricao           text NOT NULL,
  local               text,
  unidade_id          uuid REFERENCES unidades_medida,
  quantidade          numeric(15,4) NOT NULL DEFAULT 0,
  custo_unit_mao_obra numeric(15,4) NOT NULL DEFAULT 0,
  custo_unit_material numeric(15,4) NOT NULL DEFAULT 0,
  margem_mao_obra_pct numeric(8,4)  NOT NULL DEFAULT 0,
  margem_material_pct numeric(8,4)  NOT NULL DEFAULT 0,
  observacao          text,
  observacao_2        text,
  ordem               integer NOT NULL,
  UNIQUE (grupo_id, numero)
);

-- Histórico de alterações
CREATE TABLE historico_alteracoes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id        uuid REFERENCES obras ON DELETE CASCADE,
  usuario_id     uuid REFERENCES usuarios,
  campo          text NOT NULL,
  valor_anterior text,
  valor_novo     text,
  alterado_em    timestamptz DEFAULT now()
);

-- Tabela de MFA pendente (código OTP temporário)
CREATE TABLE mfa_pendente (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE,
  codigo     text NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE (user_id)
);

-- Índices
CREATE INDEX ON obras (cliente_id);
CREATE INDEX ON obras (status);
CREATE INDEX ON grupos_orcamento (obra_id);
CREATE INDEX ON itens_orcamento (grupo_id);
CREATE INDEX ON historico_alteracoes (obra_id);
CREATE INDEX ON mfa_pendente (user_id);
```

- [ ] **Step 2: Criar `supabase/migrations/002_rls_policies.sql`**

```sql
-- 002_rls_policies.sql

ALTER TABLE clientes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_medida    ENABLE ROW LEVEL SECURITY;
ALTER TABLE obras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_orcamento   ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_orcamento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_alteracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_pendente       ENABLE ROW LEVEL SECURITY;

-- Helper: retorna papel do usuário autenticado
CREATE OR REPLACE FUNCTION get_user_papel()
RETURNS text AS $$
  SELECT papel FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Clientes
CREATE POLICY "clientes_select" ON clientes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_write" ON clientes
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Usuários: cada um vê os próprios dados; admin vê todos
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR get_user_papel() = 'admin');
CREATE POLICY "usuarios_write" ON usuarios
  FOR ALL TO authenticated
  USING (get_user_papel() = 'admin')
  WITH CHECK (get_user_papel() = 'admin');

-- Disciplinas
CREATE POLICY "disciplinas_select" ON disciplinas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "disciplinas_write" ON disciplinas
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Unidades de medida
CREATE POLICY "unidades_select" ON unidades_medida
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "unidades_write" ON unidades_medida
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Obras
CREATE POLICY "obras_select" ON obras
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "obras_insert" ON obras
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));
CREATE POLICY "obras_update" ON obras
  FOR UPDATE TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'));
CREATE POLICY "obras_delete" ON obras
  FOR DELETE TO authenticated
  USING (get_user_papel() = 'admin');

-- Grupos
CREATE POLICY "grupos_select" ON grupos_orcamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "grupos_write" ON grupos_orcamento
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Itens
CREATE POLICY "itens_select" ON itens_orcamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "itens_write" ON itens_orcamento
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Histórico
CREATE POLICY "historico_select" ON historico_alteracoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "historico_insert" ON historico_alteracoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- MFA: usuário só acessa o próprio registro
CREATE POLICY "mfa_own" ON mfa_pendente
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 3: Criar `supabase/migrations/003_seed.sql`**

```sql
-- 003_seed.sql

INSERT INTO disciplinas (nome) VALUES
  ('SERVIÇOS TÉCNICOS'), ('PRÉ-OBRA'), ('CIVIL'), ('PISO'), ('FORRO'),
  ('ILUMINAÇÃO'), ('ELÉTRICA'), ('AC'), ('PINTURA'), ('SPK'),
  ('DETECÇÃO'), ('INFRAESTRUTURA'), ('MOBILIÁRIO'), ('LIMPEZA'),
  ('DRYWALL'), ('HIDRÁULICA')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO unidades_medida (sigla, descricao) VALUES
  ('M',    'Metro linear'),
  ('M2',   'Metro quadrado'),
  ('UNID', 'Unidade'),
  ('VB',   'Verba'),
  ('PTOS', 'Pontos')
ON CONFLICT (sigla) DO NOTHING;
```

- [ ] **Step 4: Executar as migrations no Supabase**

No dashboard do Supabase → SQL Editor, execute os três arquivos na ordem:
1. `001_initial_schema.sql`
2. `002_rls_policies.sql`
3. `003_seed.sql`

Verificar: Table Editor deve mostrar as tabelas criadas e a tabela `disciplinas` com 16 registros.

- [ ] **Step 5: Criar o primeiro usuário admin manualmente**

No Supabase → Authentication → Users → "Add user":
- Email: seu email
- Password: senha forte
- Clique em "Create user" — anote o `user_id` gerado

No SQL Editor:
```sql
INSERT INTO usuarios (id, nome, email, papel)
VALUES (
  'cole-aqui-o-user-id-do-passo-anterior',
  'Administrador',
  'seu@email.com',
  'admin'
);
```

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: migrations SQL, RLS policies e seed de disciplinas/unidades"
```

---

## Task 3: Types TypeScript + clientes Supabase

**Files:**
- Create: `types/database.ts`
- Create: `types/orcamento.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`

**Interfaces:**
- Produz: `createServerClient()` e `createBrowserClient()` prontos para uso; tipos de todas as tabelas exportados de `@/types/database`

- [ ] **Step 1: Criar `types/database.ts`**

```typescript
export type Papel = 'admin' | 'engenheiro' | 'orcamentista' | 'visualizador'
export type StatusObra = 'rascunho' | 'enviado' | 'aprovado' | 'em_execucao' | 'concluido' | 'cancelado'

export interface Cliente {
  id: string
  razao_social: string
  cnpj: string | null
  endereco: string | null
  criado_em: string
}

export interface Usuario {
  id: string
  nome: string
  email: string
  papel: Papel
  ativo: boolean
  criado_em: string
}

export interface Disciplina {
  id: string
  nome: string
  ativo: boolean
}

export interface UnidadeMedida {
  id: string
  sigla: string
  descricao: string | null
}

export interface Obra {
  id: string
  cliente_id: string
  codigo: string
  nome: string
  data_orcamento: string | null
  status: StatusObra
  criado_por: string
  criado_em: string
  atualizado_em: string
  clientes?: Cliente
  usuarios?: Pick<Usuario, 'id' | 'nome'>
}

export interface GrupoOrcamento {
  id: string
  obra_id: string
  disciplina_id: string
  letra: string
  ordem: number
  disciplinas?: Disciplina
  itens_orcamento?: ItemOrcamento[]
}

export interface ItemOrcamento {
  id: string
  grupo_id: string
  numero: number
  descricao: string
  local: string | null
  unidade_id: string | null
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  margem_mao_obra_pct: number
  margem_material_pct: number
  observacao: string | null
  observacao_2: string | null
  ordem: number
  unidades_medida?: UnidadeMedida
}

export interface HistoricoAlteracao {
  id: string
  obra_id: string
  usuario_id: string
  campo: string
  valor_anterior: string | null
  valor_novo: string | null
  alterado_em: string
  usuarios?: Pick<Usuario, 'nome'>
}
```

- [ ] **Step 2: Criar `types/orcamento.ts`**

```typescript
import { ItemOrcamento, GrupoOrcamento } from './database'

export type TipoVisao = 'tecnica' | 'comercial'
export type TipoExport = 'tecnico' | 'comercial'

export interface ItemCalculado extends ItemOrcamento {
  subtotal_mao_obra_custo: number
  subtotal_material_custo: number
  total_custo: number
  preco_unit_mao_obra_venda: number
  preco_unit_material_venda: number
  subtotal_mao_obra_venda: number
  subtotal_material_venda: number
  total_venda: number
  lucro: number
  margem_efetiva_pct: number
}

export interface TotaisGrupo {
  subtotal_mao_obra_custo: number
  subtotal_material_custo: number
  total_custo: number
  subtotal_mao_obra_venda: number
  subtotal_material_venda: number
  total_venda: number
  lucro: number
}

export interface TotaisGerais {
  total_mao_obra_custo: number
  total_material_custo: number
  total_custo: number
  total_mao_obra_venda: number
  total_material_venda: number
  total_venda: number
  lucro: number
  margem_efetiva_pct: number
}

export interface GrupoCalculado extends GrupoOrcamento {
  itens_calculados: ItemCalculado[]
  totais: TotaisGrupo
}
```

- [ ] **Step 3: Criar `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookies serão setados no middleware
          }
        },
      },
    }
  )
}

export async function createAdminClient() {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 4: Criar `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add types/ lib/
git commit -m "feat: tipos TypeScript e clientes Supabase (server + browser)"
```

---

## Task 4: Middleware de proteção de rotas

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consome: `lib/supabase/server.ts` → `createClient()`
- Produz: middleware que redireciona `/` e rotas `(app)/` para `/login` se sem sessão; redireciona para `/verificar` se MFA pendente; redireciona `/login` e `/verificar` para `/obras` se já autenticado com MFA completo

- [ ] **Step 1: Criar `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/verificar')
  const mfaVerificado = request.cookies.get('mfa_verificado')?.value === 'true'

  // Sem sessão → login
  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Com sessão mas MFA pendente → verificar
  if (user && !mfaVerificado && pathname !== '/verificar' && !pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/verificar', request.url))
  }

  // Já autenticado com MFA → redireciona para obras
  if (user && mfaVerificado && isAuthPage) {
    return NextResponse.redirect(new URL('/obras', request.url))
  }

  // Redireciona raiz para obras ou login
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(user && mfaVerificado ? '/obras' : '/login', request.url)
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verificar que o middleware redireciona corretamente**

```bash
npm run dev
```

Abra `localhost:3000` — deve redirecionar para `/login` (página 404 por enquanto, mas o redirect deve acontecer). Verificar na aba Network do browser.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: middleware de proteção de rotas com verificação de MFA"
```

---

## Task 5: Tela de login (email + senha)

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/api/auth/login/route.ts`

**Interfaces:**
- Consome: `lib/supabase/server.ts`, `createAdminClient()`
- Produz: POST `/api/auth/login` que autentica usuário, gera código OTP de 6 dígitos, grava em `mfa_pendente`, envia por email via Resend, retorna `{ ok: true }`

- [ ] **Step 1: Criar `app/(auth)/layout.tsx`**

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function gerarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return NextResponse.json({ error: 'Email ou senha incorretos' }, { status: 401 })
  }

  const userId = data.user.id
  const codigo = gerarCodigo()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutos

  // Gravar código no banco (upsert — substitui qualquer código anterior)
  const admin = await createAdminClient()
  await admin
    .from('mfa_pendente')
    .upsert({ user_id: userId, codigo, expires_at: expiresAt }, { onConflict: 'user_id' })

  // Enviar email com o código
  await resend.emails.send({
    from: 'Sistema de Orçamentos <noreply@seudominio.com>',
    to: email,
    subject: 'Código de verificação',
    html: `
      <p>Seu código de verificação é:</p>
      <h1 style="font-size:40px;letter-spacing:8px;font-family:monospace">${codigo}</h1>
      <p>Válido por 10 minutos.</p>
    `,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Criar `app/(auth)/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      setErro(data.error || 'Erro ao fazer login')
      setLoading(false)
      return
    }

    router.push('/verificar')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">Sistema de Orçamentos</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {erro && (
            <p className="text-sm text-red-600">{erro}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Testar o login manualmente**

```bash
npm run dev
```

1. Acesse `localhost:3000/login`
2. Entre com o email/senha do usuário admin criado na Task 2
3. Deve redirecionar para `/verificar` (404 por enquanto)
4. Verificar no Supabase → Table Editor → `mfa_pendente`: deve ter um registro com o código

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/ app/api/auth/login/
git commit -m "feat: tela de login e geração de código MFA por email"
```

---

## Task 6: Tela de verificação MFA

**Files:**
- Create: `app/(auth)/verificar/page.tsx`
- Create: `app/api/auth/verificar/route.ts`
- Create: `app/api/auth/logout/route.ts`

**Interfaces:**
- Consome: `mfa_pendente` via `createAdminClient()`
- Produz: POST `/api/auth/verificar` que valida o código, seta cookie `mfa_verificado=true`, redireciona para `/obras`; POST `/api/auth/logout` que limpa sessão e cookie

- [ ] **Step 1: Criar `app/api/auth/verificar/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { codigo } = await request.json()

  if (!codigo) {
    return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 })
  }

  const admin = await createAdminClient()
  const { data: mfa } = await admin
    .from('mfa_pendente')
    .select('codigo, expires_at')
    .eq('user_id', user.id)
    .single()

  if (!mfa) {
    return NextResponse.json({ error: 'Código não encontrado. Faça login novamente.' }, { status: 400 })
  }

  if (new Date(mfa.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Código expirado. Faça login novamente.' }, { status: 400 })
  }

  if (mfa.codigo !== codigo.trim()) {
    return NextResponse.json({ error: 'Código incorreto' }, { status: 400 })
  }

  // Código válido: limpa o registro e seta cookie de MFA verificado
  await admin.from('mfa_pendente').delete().eq('user_id', user.id)

  const response = NextResponse.json({ ok: true })
  response.cookies.set('mfa_verificado', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 horas
    path: '/',
  })

  return response
}
```

- [ ] **Step 2: Criar `app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const response = NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_APP_URL!)
  )
  response.cookies.delete('mfa_verificado')
  return response
}
```

- [ ] **Step 3: Criar `app/(auth)/verificar/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function VerificarPage() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const res = await fetch('/api/auth/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    })

    const data = await res.json()

    if (!res.ok) {
      setErro(data.error || 'Erro ao verificar código')
      setLoading(false)
      return
    }

    router.push('/obras')
    router.refresh()
  }

  async function handleReenviar() {
    // Volta para login para gerar novo código
    router.push('/login')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <CardDescription>
          Enviamos um código de 6 dígitos para o seu email. Digite-o abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código de verificação</Label>
            <Input
              id="codigo"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center text-2xl tracking-widest font-mono"
              required
              autoFocus
            />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" className="w-full" disabled={loading || codigo.length !== 6}>
            {loading ? 'Verificando...' : 'Verificar'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={handleReenviar}
          >
            Reenviar código
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Testar fluxo completo**

```bash
npm run dev
```

1. `localhost:3000` → redireciona para `/login`
2. Login com email + senha → redireciona para `/verificar`
3. Verificar email → inserir código de 6 dígitos
4. Código correto → redireciona para `/obras` (404 por enquanto)
5. Tentar acessar `/login` diretamente → redireciona para `/obras`
6. Código errado → exibe mensagem de erro sem redirecionar

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/verificar/ app/api/auth/
git commit -m "feat: verificação MFA por email e logout"
```

---

## Task 7: Layout protegido + placeholder de obras

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/obras/page.tsx`

**Interfaces:**
- Produz: rota `/obras` acessível apenas após login + MFA completo, com nav lateral contendo links para as seções do sistema

- [ ] **Step 1: Criar `app/(app)/layout.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, papel')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="font-bold text-sm uppercase tracking-wide">Orçamentos</h1>
          <p className="text-xs text-gray-400 mt-1">{usuario?.nome}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <Link
            href="/obras"
            className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-700 transition-colors"
          >
            Obras
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-700 transition-colors"
          >
            Dashboard
          </Link>
          {(usuario?.papel === 'admin' || usuario?.papel === 'engenheiro' || usuario?.papel === 'orcamentista') && (
            <Link
              href="/admin/disciplinas"
              className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-700 transition-colors"
            >
              Cadastros
            </Link>
          )}
        </nav>
        <div className="p-2 border-t border-gray-700">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/(app)/obras/page.tsx`**

```typescript
export default function ObrasPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Obras</h1>
      <p className="text-gray-500 mt-2">Lista de obras — implementado na Fase 2.</p>
    </div>
  )
}
```

- [ ] **Step 3: Testar navegação completa**

```bash
npm run dev
```

1. Login + MFA → `/obras` deve mostrar sidebar + conteúdo placeholder
2. Botão "Sair" → volta para `/login` e cookie `mfa_verificado` é removido
3. Tentar acessar `/obras` sem login → redireciona para `/login`

- [ ] **Step 4: Commit final da Fase 1**

```bash
git add app/\(app\)/
git commit -m "feat: layout protegido com sidebar e placeholder de obras"
```

---

## Checklist de conclusão da Fase 1

- [ ] `npm run dev` sobe sem erros
- [ ] `localhost:3000` redireciona para `/login`
- [ ] Login com email + senha corretos → recebe código por email
- [ ] Código correto → acessa `/obras` com sidebar
- [ ] Código incorreto → mensagem de erro, permanece em `/verificar`
- [ ] Sair → volta para `/login`, não consegue acessar `/obras` diretamente
- [ ] Tabelas no Supabase: 10 tabelas criadas, 16 disciplinas, 5 unidades no seed

Fase 1 concluída. Prosseguir para `2026-06-29-fase2-crud-editor.md`.

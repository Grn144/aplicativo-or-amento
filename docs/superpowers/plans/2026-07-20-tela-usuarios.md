# Tela de Usuários (Fase 2 do módulo de Usuários) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a tela de gerenciamento de usuários (listagem + cadastro/edição em 2 abas — Dados Gerais e Permissões), com convite por email na criação, bloqueio real de usuário desativado, e o item "Usuários" no menu lateral visível só para quem tem permissão.

**Architecture:** Segue os padrões já estabelecidos no projeto: páginas server component que checam permissão e redirecionam, client components com fetch direto (sem lib de state management), modais com Dialog (`@base-ui/react`), tabela simples com filtro/ordenação/paginação client-side (mesmo padrão de `TabelaUltimosOrcamentos`). Reaproveita 100% o motor de permissões da Fase 1 (`lib/permissoes/*`) e a infraestrutura de email (Resend) já usada no fluxo de recuperação de senha.

**Tech Stack:** Next.js 15 (App Router, Route Handlers), Supabase (Auth admin API + Postgres + RLS), `@base-ui/react` (Tabs, Switch — primitivos novos neste plano), TypeScript, Vitest.

## Global Constraints

- Só 2 abas no cadastro (Dados Gerais, Permissões) — Segurança e Auditoria ficam para as Fases 3/4.
- Sem upload de foto, sem CPF, sem observações — só `cargo`, `departamento`, `telefone` como campos novos.
- Criação de usuário nunca tem campo de senha no formulário — sempre convite por email.
- Sem botão de excluir usuário (sistema é soft-delete por princípio) nem de "ver auditoria" (aba não existe ainda).
- Toda rota nova protegida por `obterUsuarioComPermissoes` + `requirePermission` de `@/lib/permissoes/servidor`, seguindo o padrão early-return já usado em todas as rotas da Fase 1.
- Item "Usuários" no menu: nunca aparece desabilitado — some por completo pra quem não tem `editar_usuarios`.
- Todo texto de erro/UI em português.
- Sem teste dedicado para as rotas de API nem para os componentes de tela (convenção já estabelecida no projeto). Testes dedicados só para a lógica pura nova (`calcularOverrides`) e para o novo comportamento do middleware.

---

### Task 1: Migration — colunas novas em `usuarios`

**Files:**
- Create: `supabase/migrations/015_usuarios_dados_gerais.sql`

**Interfaces:**
- Produces: `usuarios.cargo`, `usuarios.departamento`, `usuarios.telefone` (todas `text`, nullable).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/015_usuarios_dados_gerais.sql
-- Fase 2 do módulo de Usuários: campos adicionais de cadastro.
-- Ver docs/superpowers/specs/2026-07-20-tela-usuarios-design.md
--
-- CPF, foto (upload) e observações ficam de fora desta fase — CPF/observações
-- por não terem uso definido ainda, foto por exigir Supabase Storage (uma
-- capacidade nova no projeto, não só colunas de banco).

ALTER TABLE usuarios
  ADD COLUMN cargo        text,
  ADD COLUMN departamento text,
  ADD COLUMN telefone     text;
```

- [ ] **Step 2: Revisar o arquivo lendo de volta**

Confirme que o nome da tabela (`usuarios`) e a ausência de mudança de RLS estão corretos — as policies `usuarios_select`/`usuarios_write` de `002_rls_policies.sql` já cobrem a linha inteira, incluindo colunas novas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_usuarios_dados_gerais.sql
git commit -m "feat: adiciona cargo/departamento/telefone em usuarios (Fase 2 do módulo de Usuários)"
```

---

### Task 2: Estender o tipo `Usuario`

**Files:**
- Modify: `types/database.ts`

**Interfaces:**
- Produces: `Usuario` com `cargo: string | null`, `departamento: string | null`, `telefone: string | null` — usado pelas rotas e componentes das próximas tasks.

- [ ] **Step 1: Atualizar a interface `Usuario`**

Em `types/database.ts`, trocar:

```ts
export interface Usuario {
  id: string
  nome: string
  email: string
  papel: Papel
  ativo: boolean
  criado_em: string
}
```

por:

```ts
export interface Usuario {
  id: string
  nome: string
  email: string
  papel: Papel
  cargo: string | null
  departamento: string | null
  telefone: string | null
  ativo: boolean
  criado_em: string
}
```

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros (ignorar os erros pré-existentes em `*.test.tsx` sobre `describe`/`it`/`expect`/`vi` — já confirmados como não relacionados em fases anteriores).

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "feat: estende tipo Usuario com cargo/departamento/telefone"
```

---

### Task 3: `lib/permissoes/diff-overrides.ts` — cálculo de overrides a partir do conjunto desejado

**Files:**
- Create: `lib/permissoes/diff-overrides.ts`
- Test: `lib/permissoes/diff-overrides.test.ts`

**Interfaces:**
- Consumes: `PERMISSOES`, `MATRIZ_PADRAO`, `Permissao` de `./matriz`; `OverridePermissao` de `./resolver`; `Papel` de `@/types/database`.
- Produces: `calcularOverrides(papel: Papel, permissoesDesejadas: ReadonlySet<Permissao>): OverridePermissao[]` — usado pela rota `PUT /api/usuarios/[id]/permissoes` (Task 11).

- [ ] **Step 1: Escrever o teste**

```ts
// lib/permissoes/diff-overrides.test.ts
import { describe, it, expect } from 'vitest'
import { calcularOverrides } from './diff-overrides'

describe('calcularOverrides', () => {
  it('sem diferenças em relação ao padrão do papel, não gera overrides', () => {
    const desejadas = new Set(['visualizar_dashboard', 'exportar_planilhas'] as const)
    expect(calcularOverrides('comercial', desejadas)).toEqual([])
  })

  it('permissão adicionada além do padrão vira override concedida:true', () => {
    const desejadas = new Set(['visualizar_dashboard', 'exportar_planilhas', 'visualizar_custos'] as const)
    const overrides = calcularOverrides('comercial', desejadas)
    expect(overrides).toEqual([{ permissao: 'visualizar_custos', concedida: true }])
  })

  it('permissão removida do padrão vira override concedida:false', () => {
    const desejadas = new Set(['visualizar_dashboard'] as const) // sem exportar_planilhas, que é padrão do gerente
    const overrides = calcularOverrides('gerente', desejadas)
    expect(overrides.filter(o => o.permissao === 'exportar_planilhas')).toEqual([
      { permissao: 'exportar_planilhas', concedida: false },
    ])
  })

  it('mistura de concessão e revogação no mesmo cálculo', () => {
    const desejadas = new Set(['visualizar_dashboard', 'visualizar_custos'] as const) // visitante ganhando custos
    const overrides = calcularOverrides('visitante', desejadas)
    expect(overrides).toEqual([{ permissao: 'visualizar_custos', concedida: true }])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/permissoes/diff-overrides.test.ts`
Expected: FAIL — `Cannot find module './diff-overrides'`

- [ ] **Step 3: Implementar `lib/permissoes/diff-overrides.ts`**

```ts
// lib/permissoes/diff-overrides.ts
import type { Papel } from '@/types/database'
import { PERMISSOES, MATRIZ_PADRAO, type Permissao } from './matriz'
import type { OverridePermissao } from './resolver'

/**
 * Compara o conjunto de permissões desejado para um usuário contra o padrão
 * do papel dele, retornando só as exceções (overrides). Usado ao salvar a
 * aba Permissões: mantém usuario_permissoes só com desvios reais do papel.
 */
export function calcularOverrides(
  papel: Papel,
  permissoesDesejadas: ReadonlySet<Permissao>
): OverridePermissao[] {
  const padrao = MATRIZ_PADRAO[papel]
  const overrides: OverridePermissao[] = []
  for (const chave of PERMISSOES) {
    const noPadrao = padrao.has(chave)
    const desejada = permissoesDesejadas.has(chave)
    if (noPadrao !== desejada) {
      overrides.push({ permissao: chave, concedida: desejada })
    }
  }
  return overrides
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/permissoes/diff-overrides.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/permissoes/diff-overrides.ts lib/permissoes/diff-overrides.test.ts
git commit -m "feat: calcula overrides de permissão a partir do conjunto desejado"
```

---

### Task 4: Bloqueio de usuário inativo no middleware

**Files:**
- Modify: `middleware.ts`
- Test: `middleware.test.ts` (primeiro teste de middleware do projeto)

**Interfaces:**
- Nenhuma nova — só adiciona uma checagem dentro do middleware já existente.

- [ ] **Step 1: Escrever o teste**

```ts
// middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado: { usuario: { id: string } | null; ativo: boolean | null; signOutChamado: boolean } = {
  usuario: null,
  ativo: null,
  signOutChamado: false,
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: estado.usuario } }),
      signOut: async () => {
        estado.signOutChamado = true
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: estado.ativo === null ? null : { ativo: estado.ativo },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

import { middleware } from './middleware'

function criarRequest(pathname: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(`http://localhost${pathname}`))
  for (const [nome, valor] of Object.entries(cookies)) {
    request.cookies.set(nome, valor)
  }
  return request
}

describe('middleware — bloqueio de usuário inativo', () => {
  beforeEach(() => {
    estado.usuario = { id: 'user-1' }
    estado.ativo = true
    estado.signOutChamado = false
  })

  it('permite acesso e renova o cookie de MFA quando o usuário está ativo', async () => {
    const request = criarRequest('/obras', { mfa_verificado: 'true' })
    const response = await middleware(request)
    expect(response.cookies.get('mfa_verificado')?.value).toBe('true')
    expect(estado.signOutChamado).toBe(false)
  })

  it('desloga e redireciona para /login quando o usuário foi desativado', async () => {
    estado.ativo = false
    const request = criarRequest('/obras', { mfa_verificado: 'true' })
    const response = await middleware(request)
    expect(estado.signOutChamado).toBe(true)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run middleware.test.ts`
Expected: FAIL na segunda asserção (`signOutChamado` continua `false` e a resposta não redireciona) — o middleware ainda não checa `ativo`.

- [ ] **Step 3: Implementar a checagem em `middleware.ts`**

No fim da função `middleware`, trocar:

```ts
  // Janela deslizante: renova o TTL do cookie de MFA a cada atividade de página.
  // Sem atividade por MFA_TTL_SEGUNDOS, o cookie expira e o próximo acesso cai no login.
  if (user && mfaVerificado) {
    supabaseResponse.cookies.set('mfa_verificado', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MFA_TTL_SEGUNDOS,
    })
  }

  return supabaseResponse
```

por:

```ts
  // Janela deslizante: renova o TTL do cookie de MFA a cada atividade de página.
  // Sem atividade por MFA_TTL_SEGUNDOS, o cookie expira e o próximo acesso cai no login.
  if (user && mfaVerificado) {
    // Usuário desativado por um admin: sessão Supabase e MFA continuam válidos,
    // mas o acesso é bloqueado na próxima requisição autenticada.
    const { data: usuarioDb } = await supabase
      .from('usuarios').select('ativo').eq('id', user.id).single()
    if (usuarioDb && !usuarioDb.ativo) {
      await supabase.auth.signOut()
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete('mfa_em_andamento')
      res.cookies.delete('mfa_verificado')
      return res
    }

    supabaseResponse.cookies.set('mfa_verificado', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MFA_TTL_SEGUNDOS,
    })
  }

  return supabaseResponse
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run middleware.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os testes passando, sem regressão.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts middleware.test.ts
git commit -m "feat: bloqueia login de usuário desativado no middleware"
```

---

### Task 5: `components/ui/tabs.tsx` — primitivo de abas (Base UI)

**Files:**
- Create: `components/ui/tabs.tsx`

**Interfaces:**
- Consumes: `Tabs` de `@base-ui/react/tabs` (já instalado — `@base-ui/react` está em `package.json`, sem dependência nova).
- Produces: `Tabs`, `TabsList`, `TabsTab`, `TabsPanel` — usados por `UsuarioModal.tsx` (Task 12).

- [ ] **Step 1: Implementar `components/ui/tabs.tsx`**

Segue exatamente o estilo de `components/ui/dialog.tsx` (mesmo `data-slot`, `cn`, wrapping fino sobre o primitivo do Base UI). Atributos de estado do Base UI usados: `data-active` no `Tabs.Tab` quando selecionado (confirmado em `node_modules/@base-ui/react/tabs/tab/TabsTabDataAttributes.d.ts`).

```tsx
// components/ui/tabs.tsx
'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1',
        className
      )}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        'inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none',
        'data-active:bg-background data-active:text-foreground data-active:shadow-sm',
        'focus-visible:ring-3 focus-visible:ring-ring/50',
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn('outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel }
```

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add components/ui/tabs.tsx
git commit -m "feat: adiciona primitivo de abas (Tabs) baseado em @base-ui/react"
```

---

### Task 6: `components/ui/switch.tsx` — primitivo de switch (Base UI)

**Files:**
- Create: `components/ui/switch.tsx`

**Interfaces:**
- Consumes: `Switch` de `@base-ui/react/switch` (já instalado).
- Produces: `Switch` — usado por `UsuarioModal.tsx` (Task 12).

- [ ] **Step 1: Implementar `components/ui/switch.tsx`**

Atributos de estado do Base UI usados: `data-checked`/`data-unchecked` no `Switch.Root` e no `Switch.Thumb` (confirmado em `node_modules/@base-ui/react/switch/stateAttributesMapping.js`).

```tsx
// components/ui/switch.tsx
'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none',
        'data-checked:bg-primary data-unchecked:bg-input',
        'focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'block size-4 rounded-full bg-background shadow-sm transition-transform',
          'data-checked:translate-x-4 data-unchecked:translate-x-0.5'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
```

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add components/ui/switch.tsx
git commit -m "feat: adiciona primitivo de switch (Switch) baseado em @base-ui/react"
```

---

### Task 7: Parametrizar o tipo do link em `/nova-senha` (recovery vs invite)

**Files:**
- Modify: `app/(auth)/nova-senha/page.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: a página aceita `?tipo=invite` além do `?token_hash=` já existente, usado pelo email de convite (Task 9).

- [ ] **Step 1: Ler o tipo da query string e repassar pro `verifyOtp`**

Em `app/(auth)/nova-senha/page.tsx`, dentro do `useEffect`, trocar:

```ts
    const tokenHash = searchParams.get('token_hash')
    const code = searchParams.get('code')

    if (tokenHash) {
      supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash }).then(({ error }) => {
```

por:

```ts
    const tokenHash = searchParams.get('token_hash')
    const code = searchParams.get('code')
    // ?tipo=invite vem do email de convite de um usuário novo (Fase 2 do
    // módulo de Usuários); ausente ou qualquer outro valor cai em 'recovery',
    // o fluxo original de "esqueci minha senha".
    const tipo = searchParams.get('tipo') === 'invite' ? 'invite' : 'recovery'

    if (tokenHash) {
      supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash }).then(({ error }) => {
```

O restante do fluxo (definir senha, sign out, redirecionar pro login) não muda — `type` só afeta a validação do token.

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros (`verifyOtp` aceita `'invite'` como `EmailOtpType` válido no `@supabase/supabase-js`).

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/nova-senha/page.tsx"
git commit -m "feat: parametriza tipo do link em /nova-senha (recovery ou invite)"
```

---

### Task 8: Menu lateral — item "Usuários" gateado por permissão

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes` de `@/lib/permissoes/servidor` (Fase 1).
- Produces: `Sidebar` passa a receber `permissoes: ReadonlySet<Permissao>`; `PAPEL_LABELS` passa a ser exportado (reaproveitado pelas Tasks 12 e 13).

- [ ] **Step 1: Atualizar `app/(app)/layout.tsx` pra buscar e repassar permissões**

Trocar o arquivo inteiro por:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { SessaoKeepAlive } from '@/components/layout/SessaoKeepAlive'
import { obterUsuarioComPermissoes } from '@/lib/permissoes/servidor'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)

  return (
    <div className="flex min-h-screen bg-background">
      <SessaoKeepAlive />
      <Sidebar
        usuario={{
          nome: usuario?.nome ?? 'Usuário',
          papel: usuario?.papel ?? 'visitante',
        }}
        permissoes={usuario?.permissoes ?? new Set()}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
```

(Isso substitui a query manual `supabase.from('usuarios').select('nome, papel')` por uma única chamada a `obterUsuarioComPermissoes`, que já retorna `nome`/`papel` além das permissões — remove uma duplicação de consulta.)

- [ ] **Step 2: Atualizar `components/layout/Sidebar.tsx`**

No topo do arquivo, trocar o import de ícones:

```ts
import {
  Boxes, Building2, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, Users, X,
} from 'lucide-react'
```

por:

```ts
import {
  Boxes, Building2, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserCog, Users, X,
} from 'lucide-react'
```

Logo abaixo, adicionar o import do tipo de permissão:

```ts
import type { Permissao } from '@/lib/permissoes/matriz'
```

Trocar `const PAPEL_LABELS...` (sem `export`) por (com `export`):

```ts
export const PAPEL_LABELS: Record<Papel, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  orcamentista: 'Orçamentista',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  visitante: 'Visitante',
}
```

Trocar a assinatura da função:

```ts
export function Sidebar({ usuario }: { usuario: { nome: string; papel: Papel } }) {
```

por:

```ts
export function Sidebar({
  usuario, permissoes,
}: { usuario: { nome: string; papel: Papel }; permissoes: ReadonlySet<Permissao> }) {
```

Logo após a declaração de `ITENS` (fora do componente, sem mudar `ITENS` em si), e dentro do componente, antes do `const conteudo = (`, adicionar:

```ts
  const itens = permissoes.has('editar_usuarios')
    ? [...ITENS, { href: '/usuarios', label: 'Usuários', Icone: UserCog }]
    : ITENS
```

Por fim, no JSX do `<nav>`, trocar `{ITENS.map(...)}` por `{itens.map(...)}`.

- [ ] **Step 2: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte inteira passando (nenhum teste existente depende da assinatura antiga do `Sidebar`, já que ele não tem `.test.tsx`).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/layout.tsx" components/layout/Sidebar.tsx
git commit -m "feat: item Usuários no menu lateral, visível só com editar_usuarios"
```

---

### Task 9: Rotas `GET`/`POST /api/usuarios` — listagem e convite

**Files:**
- Create: `app/api/usuarios/route.ts`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`; `createClient`, `createAdminClient` de `@/lib/supabase/server`; `lerJson` de `@/lib/http`.
- Produces: `GET` retorna `Usuario[]`; `POST` cria usuário + envia convite, retorna o `Usuario` criado com status 201.

- [ ] **Step 1: Implementar `app/api/usuarios/route.ts`**

```ts
// app/api/usuarios/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

const resend = new Resend(process.env.RESEND_API_KEY)

const CAMPOS_USUARIO = 'id, nome, email, papel, cargo, departamento, telefone, ativo, criado_em'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para visualizar usuários' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('usuarios')
    .select(CAMPOS_USUARIO)
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar usuários' }, { status: 403 })
  }

  const body = await lerJson<{
    nome?: string
    email?: string
    papel?: string
    cargo?: string
    departamento?: string
    telefone?: string
  }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  const { nome, email, papel, cargo, departamento, telefone } = body
  if (!nome?.trim() || !email?.trim() || !papel) {
    return NextResponse.json({ error: 'Nome, email e papel são obrigatórios' }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: email.trim(),
  })

  if (linkError || !linkData?.user?.id || !linkData.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkError?.message ?? 'Falha ao convidar usuário' },
      { status: 500 }
    )
  }

  const { data: novoUsuario, error: erroInsert } = await supabase
    .from('usuarios')
    .insert({
      id: linkData.user.id,
      nome: nome.trim(),
      email: email.trim(),
      papel,
      cargo: cargo?.trim() || null,
      departamento: departamento?.trim() || null,
      telefone: telefone?.trim() || null,
    })
    .select(CAMPOS_USUARIO)
    .single()

  if (erroInsert) {
    // Falha atômica: reverte o usuário criado no Auth pra não deixar órfão
    await admin.auth.admin.deleteUser(linkData.user.id)
    return NextResponse.json({ error: erroInsert.message }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const link = `${base}/nova-senha?tipo=invite&token_hash=${encodeURIComponent(linkData.properties.hashed_token)}`

  const { error: emailError } = await resend.emails.send({
    from: 'Sistema de Orçamentos <onboarding@resend.dev>',
    to: email.trim(),
    subject: 'Você foi convidado para o Sistema de Orçamentos',
    html: `
      <p>Você foi cadastrado no Sistema de Orçamentos.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Definir minha senha
        </a>
      </p>
      <p>Se o botão não funcionar, copie e cole este endereço no navegador:</p>
      <p style="font-family:monospace;word-break:break-all">${link}</p>
    `,
  })

  if (emailError) {
    // O usuário já foi criado com sucesso; a falha é só no envio do convite.
    // Um admin pode reenviar o acesso usando "Resetar Senha" na listagem.
    console.error('[usuarios] erro no Resend ao enviar convite:', emailError.message ?? emailError.name)
  }

  return NextResponse.json(novoUsuario, { status: 201 })
}
```

- [ ] **Step 2: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte inteira passando.

- [ ] **Step 3: Commit**

```bash
git add app/api/usuarios/route.ts
git commit -m "feat: rotas GET/POST /api/usuarios (listagem e convite de novo usuário)"
```

---

### Task 10: Rotas `GET`/`PUT /api/usuarios/[id]` — detalhe e edição

**Files:**
- Create: `app/api/usuarios/[id]/route.ts`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`; `calcularPermissoes` de `@/lib/permissoes/resolver`; `OverridePermissao` de `@/lib/permissoes/resolver`; `Papel` de `@/types/database`.
- Produces: `GET` retorna `Usuario & { permissoes: Permissao[] }`; `PUT` atualiza dados gerais/papel/ativo e retorna o `Usuario` atualizado.

- [ ] **Step 1: Implementar `app/api/usuarios/[id]/route.ts`**

```ts
// app/api/usuarios/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { calcularPermissoes, type OverridePermissao } from '@/lib/permissoes/resolver'
import type { Papel } from '@/types/database'

const CAMPOS_USUARIO = 'id, nome, email, papel, cargo, departamento, telefone, ativo, criado_em'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuarioLogado = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuarioLogado || !requirePermission(usuarioLogado.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para visualizar usuários' }, { status: 403 })
  }

  const { id } = await params
  const { data: dadosGerais, error } = await supabase
    .from('usuarios')
    .select(CAMPOS_USUARIO)
    .eq('id', id)
    .single()

  if (error || !dadosGerais) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const { data: overrides } = await supabase
    .from('usuario_permissoes')
    .select('permissao, concedida')
    .eq('usuario_id', id)

  const permissoesEfetivas = calcularPermissoes(
    dadosGerais.papel as Papel,
    (overrides ?? []) as OverridePermissao[]
  )

  return NextResponse.json({
    ...dadosGerais,
    permissoes: Array.from(permissoesEfetivas),
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuarioLogado = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuarioLogado || !requirePermission(usuarioLogado.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para editar usuários' }, { status: 403 })
  }

  const { id } = await params
  const body = await lerJson<{
    nome?: string
    papel?: string
    cargo?: string | null
    departamento?: string | null
    telefone?: string | null
    ativo?: boolean
  }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  const campos = ['nome', 'papel', 'cargo', 'departamento', 'telefone', 'ativo'] as const
  const updates: Record<string, unknown> = {}
  for (const campo of campos) {
    if (campo in body) updates[campo] = body[campo]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo enviado' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('usuarios')
    .update(updates)
    .eq('id', id)
    .select(CAMPOS_USUARIO)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte inteira passando.

- [ ] **Step 3: Commit**

```bash
git add "app/api/usuarios/[id]/route.ts"
git commit -m "feat: rotas GET/PUT /api/usuarios/[id] (detalhe e edição)"
```

---

### Task 11: Rota `PUT /api/usuarios/[id]/permissoes` — salvar overrides

**Files:**
- Create: `app/api/usuarios/[id]/permissoes/route.ts`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`; `calcularOverrides` de `@/lib/permissoes/diff-overrides` (Task 3); `Permissao` de `@/lib/permissoes/matriz`; `Papel` de `@/types/database`.

- [ ] **Step 1: Implementar `app/api/usuarios/[id]/permissoes/route.ts`**

```ts
// app/api/usuarios/[id]/permissoes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { calcularOverrides } from '@/lib/permissoes/diff-overrides'
import type { Permissao } from '@/lib/permissoes/matriz'
import type { Papel } from '@/types/database'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuarioLogado = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuarioLogado || !requirePermission(usuarioLogado.permissoes, 'alterar_permissoes')) {
    return NextResponse.json({ error: 'Sem permissão para alterar permissões' }, { status: 403 })
  }

  const { id } = await params
  const body = await lerJson<{ permissoes?: string[] }>(request)
  if (!body || !Array.isArray(body.permissoes)) {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  }

  const { data: alvo, error: erroAlvo } = await supabase
    .from('usuarios').select('papel').eq('id', id).single()
  if (erroAlvo || !alvo) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const permissoesDesejadas = new Set(body.permissoes) as Set<Permissao>
  const overrides = calcularOverrides(alvo.papel as Papel, permissoesDesejadas)

  // Substitui todos os overrides do usuário pelo novo conjunto calculado —
  // mesmo padrão de "apaga e recria" já usado em lib/composicoes/atualizar.ts
  // pros materiais/mão de obra de uma composição.
  const { error: erroDelete } = await supabase
    .from('usuario_permissoes').delete().eq('usuario_id', id)
  if (erroDelete) return NextResponse.json({ error: erroDelete.message }, { status: 500 })

  if (overrides.length > 0) {
    const { error: erroInsert } = await supabase.from('usuario_permissoes').insert(
      overrides.map(o => ({
        usuario_id: id,
        permissao: o.permissao,
        concedida: o.concedida,
        criado_por: user.id,
      }))
    )
    if (erroInsert) return NextResponse.json({ error: erroInsert.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte inteira passando.

- [ ] **Step 3: Commit**

```bash
git add "app/api/usuarios/[id]/permissoes/route.ts"
git commit -m "feat: rota PUT /api/usuarios/[id]/permissoes (salva overrides individuais)"
```

---

### Task 12: `components/usuarios/UsuarioModal.tsx` — modal de criar/editar com abas

**Files:**
- Create: `components/usuarios/UsuarioModal.tsx`

**Interfaces:**
- Consumes: `Tabs`, `TabsList`, `TabsTab`, `TabsPanel` de `@/components/ui/tabs` (Task 5); `Switch` de `@/components/ui/switch` (Task 6); `MATRIZ_PADRAO`, `Permissao` de `@/lib/permissoes/matriz`; `PAPEL_LABELS` de `@/components/layout/Sidebar` (Task 8); `Papel` de `@/types/database`.
- Produces: componente usado por `UsuariosPageClient` (Task 13).

**Props:** `{ aberto: boolean; onOpenChange: (v: boolean) => void; usuarioId: string | null; podeAlterarPermissoes: boolean; onSalvo: () => void }`

- [ ] **Step 1: Implementar `components/usuarios/UsuarioModal.tsx`**

```tsx
// components/usuarios/UsuarioModal.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { PAPEL_LABELS } from '@/components/layout/Sidebar'
import { MATRIZ_PADRAO, type Permissao } from '@/lib/permissoes/matriz'
import type { Papel } from '@/types/database'

const PERMISSAO_LABELS: Record<Permissao, string> = {
  visualizar_dashboard: 'Visualizar dashboard',
  visualizar_indicadores: 'Visualizar indicadores',
  editar_clientes: 'Cadastrar/editar clientes',
  excluir_clientes: 'Excluir clientes',
  criar_obras: 'Criar obras',
  editar_obras: 'Editar obras',
  excluir_obras: 'Excluir obras',
  visualizar_custos: 'Visualizar custos',
  editar_custos: 'Editar custos',
  visualizar_margem: 'Visualizar margem',
  visualizar_lucro: 'Visualizar lucro',
  visualizar_banco_composicoes: 'Visualizar banco de composições',
  cadastrar_composicoes: 'Cadastrar composições',
  editar_composicoes: 'Editar composições',
  excluir_composicoes: 'Excluir composições',
  importar_planilhas: 'Importar planilhas',
  exportar_planilhas: 'Exportar planilhas',
  cadastrar_usuarios: 'Cadastrar usuários',
  editar_usuarios: 'Editar usuários',
  excluir_usuarios: 'Excluir usuários',
  alterar_permissoes: 'Alterar permissões',
  visualizar_auditoria: 'Visualizar auditoria',
  acessar_configuracoes: 'Acessar configurações',
  backup: 'Backup',
  restaurar_banco: 'Restaurar banco',
}

const GRUPOS_PERMISSOES: { titulo: string; permissoes: Permissao[] }[] = [
  { titulo: 'Geral', permissoes: ['visualizar_dashboard', 'visualizar_indicadores'] },
  { titulo: 'Clientes', permissoes: ['editar_clientes', 'excluir_clientes'] },
  { titulo: 'Obras', permissoes: ['criar_obras', 'editar_obras', 'excluir_obras'] },
  { titulo: 'Financeiro', permissoes: ['visualizar_custos', 'editar_custos', 'visualizar_margem', 'visualizar_lucro'] },
  { titulo: 'Composições', permissoes: ['visualizar_banco_composicoes', 'cadastrar_composicoes', 'editar_composicoes', 'excluir_composicoes'] },
  { titulo: 'Planilhas', permissoes: ['importar_planilhas', 'exportar_planilhas'] },
  { titulo: 'Usuários', permissoes: ['cadastrar_usuarios', 'editar_usuarios', 'excluir_usuarios', 'alterar_permissoes'] },
  { titulo: 'Sistema', permissoes: ['visualizar_auditoria', 'acessar_configuracoes', 'backup', 'restaurar_banco'] },
]

type FormDadosGerais = {
  nome: string
  email: string
  papel: Papel
  cargo: string
  departamento: string
  telefone: string
  ativo: boolean
}

const FORM_VAZIO: FormDadosGerais = {
  nome: '', email: '', papel: 'visitante', cargo: '', departamento: '', telefone: '', ativo: true,
}

interface Props {
  aberto: boolean
  onOpenChange: (v: boolean) => void
  usuarioId: string | null
  podeAlterarPermissoes: boolean
  onSalvo: () => void
}

export default function UsuarioModal({ aberto, onOpenChange, usuarioId, podeAlterarPermissoes, onSalvo }: Props) {
  const editando = usuarioId !== null
  const [form, setForm] = useState<FormDadosGerais>(FORM_VAZIO)
  const [permissoesAtivas, setPermissoesAtivas] = useState<Set<Permissao>>(new Set(['visualizar_dashboard']))
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!usuarioId) return
    setCarregando(true)
    const res = await fetch(`/api/usuarios/${usuarioId}`)
    const data = await res.json()
    setCarregando(false)
    if (!res.ok) {
      setErro(data.error ?? 'Erro ao carregar usuário')
      return
    }
    setForm({
      nome: data.nome,
      email: data.email,
      papel: data.papel,
      cargo: data.cargo ?? '',
      departamento: data.departamento ?? '',
      telefone: data.telefone ?? '',
      ativo: data.ativo,
    })
    setPermissoesAtivas(new Set(data.permissoes as Permissao[]))
  }, [usuarioId])

  useEffect(() => {
    if (!aberto) return
    setErro('')
    if (editando) {
      carregar()
    } else {
      setForm(FORM_VAZIO)
      setPermissoesAtivas(new Set(['visualizar_dashboard']))
    }
  }, [aberto, editando, carregar])

  function alterarPapel(papel: Papel) {
    setForm(p => ({ ...p, papel }))
    // No modo criação, os switches partem sempre do padrão do papel escolhido
    // (não existe override ainda, pois o usuário nem foi criado).
    if (!editando) {
      setPermissoesAtivas(new Set(MATRIZ_PADRAO[papel]))
    }
  }

  async function salvar() {
    if (!form.nome.trim() || !form.email.trim()) {
      setErro('Nome e email são obrigatórios')
      return
    }
    setSalvando(true)
    setErro('')

    if (editando) {
      const res = await fetch(`/api/usuarios/${usuarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          papel: form.papel,
          cargo: form.cargo.trim() || null,
          departamento: form.departamento.trim() || null,
          telefone: form.telefone.trim() || null,
          ativo: form.ativo,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSalvando(false)
        setErro(data.error ?? 'Erro ao salvar usuário')
        return
      }
      if (podeAlterarPermissoes) {
        const resPerm = await fetch(`/api/usuarios/${usuarioId}/permissoes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissoes: Array.from(permissoesAtivas) }),
        })
        if (!resPerm.ok) {
          setSalvando(false)
          toast.error('Dados salvos, mas as permissões não puderam ser atualizadas.')
          onSalvo()
          onOpenChange(false)
          return
        }
      }
    } else {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          papel: form.papel,
          cargo: form.cargo.trim() || null,
          departamento: form.departamento.trim() || null,
          telefone: form.telefone.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSalvando(false)
        setErro(data.error ?? 'Erro ao criar usuário')
        return
      }
      toast('Convite enviado por email')
    }

    setSalvando(false)
    onOpenChange(false)
    onSalvo()
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Tabs defaultValue="dados-gerais">
            <TabsList>
              <TabsTab value="dados-gerais">Dados Gerais</TabsTab>
              <TabsTab value="permissoes" disabled={!podeAlterarPermissoes}>Permissões</TabsTab>
            </TabsList>

            <TabsPanel value="dados-gerais">
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label htmlFor="nome">Nome completo *</Label>
                  <Input id="nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email" type="email" value={form.email} disabled={editando}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input id="cargo" value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="departamento">Departamento</Label>
                    <Input id="departamento" value={form.departamento} onChange={e => setForm(p => ({ ...p, departamento: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="papel">Perfil</Label>
                  <NativeSelect id="papel" value={form.papel} onChange={e => alterarPapel(e.target.value as Papel)}>
                    {(Object.keys(PAPEL_LABELS) as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
                  </NativeSelect>
                </div>
                {editando && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.ativo} onCheckedChange={ativo => setForm(p => ({ ...p, ativo }))} />
                    {form.ativo ? 'Ativo' : 'Inativo'}
                  </label>
                )}
              </div>
            </TabsPanel>

            <TabsPanel value="permissoes">
              <div className="max-h-80 space-y-4 overflow-y-auto py-2">
                {GRUPOS_PERMISSOES.map(grupo => (
                  <div key={grupo.titulo}>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{grupo.titulo}</p>
                    <div className="space-y-2">
                      {grupo.permissoes.map(permissao => (
                        <label key={permissao} className="flex items-center justify-between gap-3 text-sm">
                          {PERMISSAO_LABELS[permissao]}
                          <Switch
                            checked={permissoesAtivas.has(permissao)}
                            onCheckedChange={concedida => {
                              setPermissoesAtivas(prev => {
                                const novo = new Set(prev)
                                if (concedida) novo.add(permissao)
                                else novo.delete(permissao)
                                return novo
                              })
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsPanel>
          </Tabs>
        )}

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Convidar usuário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os testes passando.

- [ ] **Step 4: Commit**

```bash
git add components/usuarios/UsuarioModal.tsx
git commit -m "feat: modal de criar/editar usuário com abas Dados Gerais e Permissões"
```

---

### Task 13: `components/usuarios/UsuariosPageClient.tsx` — listagem

**Files:**
- Create: `components/usuarios/UsuariosPageClient.tsx`

**Interfaces:**
- Consumes: `PAPEL_LABELS` de `@/components/layout/Sidebar` (Task 8, agora exportado); `UsuarioModal` (Task 12); tipo `Usuario`, `Papel` de `@/types/database`.
- Produces: componente default usado por `app/(app)/usuarios/page.tsx` (Task 14).

**Props:** `{ podeAlterarPermissoes: boolean }`

- [ ] **Step 1: Implementar `components/usuarios/UsuariosPageClient.tsx`**

```tsx
// components/usuarios/UsuariosPageClient.tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Pencil, KeyRound, Ban, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PAPEL_LABELS } from '@/components/layout/Sidebar'
import UsuarioModal from './UsuarioModal'
import type { Usuario, Papel } from '@/types/database'

type Coluna = 'nome' | 'email' | 'cargo' | 'departamento' | 'papel' | 'status' | 'criado_em'
const COLUNAS: { chave: Coluna; rotulo: string }[] = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'email', rotulo: 'Email' },
  { chave: 'cargo', rotulo: 'Cargo' },
  { chave: 'departamento', rotulo: 'Departamento' },
  { chave: 'papel', rotulo: 'Perfil' },
  { chave: 'status', rotulo: 'Status' },
  { chave: 'criado_em', rotulo: 'Criado em' },
]

function iniciaisDe(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
}

// Switch exaustivo (sem indexação dinâmica de Usuario[coluna]) — 'status' não é
// uma chave real do tipo Usuario (o campo é `ativo`), então acessar por índice
// dinâmico não tipa corretamente; cada coluna sabe explicitamente de onde vem.
function valorOrdenacao(u: Usuario, coluna: Coluna): string | number {
  switch (coluna) {
    case 'nome': return u.nome
    case 'email': return u.email
    case 'cargo': return u.cargo ?? ''
    case 'departamento': return u.departamento ?? ''
    case 'papel': return PAPEL_LABELS[u.papel]
    case 'status': return u.ativo ? 1 : 0
    case 'criado_em': return u.criado_em
  }
}

export default function UsuariosPageClient({ podeAlterarPermissoes }: { podeAlterarPermissoes: boolean }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [filtroPapel, setFiltroPapel] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({ coluna: 'nome', asc: true })
  const [porPagina, setPorPagina] = useState(10)
  const [pagina, setPagina] = useState(0)

  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const [desativando, setDesativando] = useState<Usuario | null>(null)
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const res = await fetch('/api/usuarios')
    const data = await res.json()
    setUsuarios(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    let r = usuarios
    if (filtroPapel) r = r.filter(u => u.papel === filtroPapel)
    if (filtroStatus) r = r.filter(u => (filtroStatus === 'ativo' ? u.ativo : !u.ativo))
    const t = busca.trim().toLowerCase()
    if (t) {
      r = r.filter(u => [u.nome, u.email, u.cargo ?? '', u.departamento ?? ''].some(v => v.toLowerCase().includes(t)))
    }
    const { coluna, asc } = ordem
    return [...r].sort((a, b) => {
      const va = valorOrdenacao(a, coluna)
      const vb = valorOrdenacao(b, coluna)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return asc ? cmp : -cmp
    })
  }, [usuarios, busca, filtroPapel, filtroStatus, ordem])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina)

  function ordenarPor(coluna: Coluna) {
    setOrdem(o => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: true }))
    setPagina(0)
  }

  function abrirNovo() {
    setEditandoId(null)
    setModalAberto(true)
  }
  function abrirEdicao(u: Usuario) {
    setEditandoId(u.id)
    setModalAberto(true)
  }

  async function resetarSenha(u: Usuario) {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email }),
    })
    if (!res.ok) {
      toast.error('Não foi possível enviar o link de redefinição.')
      return
    }
    toast(`Link de redefinição enviado para ${u.email}`)
  }

  async function alternarStatus(u: Usuario) {
    if (u.ativo) {
      setDesativando(u)
      return
    }
    await salvarStatus(u, true)
  }

  async function salvarStatus(u: Usuario, ativo: boolean) {
    setSalvandoStatus(true)
    const res = await fetch(`/api/usuarios/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo }),
    })
    setSalvandoStatus(false)
    if (!res.ok) {
      toast.error(ativo ? 'Não foi possível reativar o usuário.' : 'Não foi possível desativar o usuário.')
      return
    }
    setUsuarios(prev => prev.map(x => (x.id === u.id ? { ...x, ativo } : x)))
    setDesativando(null)
    toast(ativo ? 'Usuário reativado' : 'Usuário desativado')
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <Button onClick={abrirNovo}>+ Novo Usuário</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, email, cargo ou departamento..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPagina(0) }}
          className="max-w-sm"
        />
        <NativeSelect value={filtroPapel} onChange={e => { setFiltroPapel(e.target.value); setPagina(0) }} className="max-w-[180px]">
          <option value="">Todos os perfis</option>
          {(Object.keys(PAPEL_LABELS) as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
        </NativeSelect>
        <NativeSelect value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }} className="max-w-[150px]">
          <option value="">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </NativeSelect>
        <NativeSelect value={String(porPagina)} onChange={e => { setPorPagina(Number(e.target.value)); setPagina(0) }} className="max-w-[140px]">
          <option value="10">10 por página</option>
          <option value="25">25 por página</option>
          <option value="50">50 por página</option>
        </NativeSelect>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  {COLUNAS.map(c => (
                    <th key={c.chave} className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => ordenarPor(c.chave)} className="hover:text-foreground">
                        {c.rotulo}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-center w-32">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(u => (
                  <tr key={u.id} className="border-t border-border/50 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                        {iniciaisDe(u.nome)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{u.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.cargo ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.departamento ?? '—'}</td>
                    <td className="px-4 py-3">{PAPEL_LABELS[u.papel]}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.ativo ? 'default' : 'destructive'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.criado_em).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button type="button" aria-label={`Editar ${u.nome}`} title="Editar"
                          onClick={() => abrirEdicao(u)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" aria-label={`Resetar senha de ${u.nome}`} title="Resetar senha"
                          onClick={() => resetarSenha(u)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <KeyRound className="size-4" />
                        </button>
                        {u.ativo ? (
                          <button type="button" aria-label={`Desativar ${u.nome}`} title="Desativar"
                            onClick={() => alternarStatus(u)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                            <Ban className="size-4" />
                          </button>
                        ) : (
                          <button type="button" aria-label={`Reativar ${u.nome}`} title="Reativar"
                            onClick={() => alternarStatus(u)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-green-500/10 hover:text-green-600">
                            <CheckCircle2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Página {paginaAtual + 1} de {totalPaginas} · {filtrados.length} usuário(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={paginaAtual === 0} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}

      <UsuarioModal
        aberto={modalAberto}
        onOpenChange={setModalAberto}
        usuarioId={editandoId}
        podeAlterarPermissoes={podeAlterarPermissoes}
        onSalvo={carregar}
      />

      <Dialog open={desativando !== null} onOpenChange={aberto => !aberto && setDesativando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar usuário</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            Desativar <strong className="text-foreground">{desativando?.nome}</strong>? O login dele será bloqueado imediatamente.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDesativando(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={salvandoStatus}
              onClick={() => desativando && salvarStatus(desativando, false)}
            >
              {salvandoStatus ? 'Desativando...' : 'Desativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos (`UsuarioModal` já existe desde a Task 12).

- [ ] **Step 3: Commit**

```bash
git add components/usuarios/UsuariosPageClient.tsx
git commit -m "feat: listagem de usuários com filtros, ordenação e paginação"
```

---

### Task 14: `app/(app)/usuarios/page.tsx` — página server component

**Files:**
- Create: `app/(app)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes` de `@/lib/permissoes/servidor`; `UsuariosPageClient` (Task 13).

- [ ] **Step 1: Implementar `app/(app)/usuarios/page.tsx`**

```tsx
// app/(app)/usuarios/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import UsuariosPageClient from '@/components/usuarios/UsuariosPageClient'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_usuarios')) {
    redirect('/dashboard')
  }

  return <UsuariosPageClient podeAlterarPermissoes={usuario.permissoes.has('alterar_permissoes')} />
}
```

- [ ] **Step 2: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte inteira passando — esta é a última peça do fluxo de UI, todas as dependências (`UsuariosPageClient`, motor de permissões) já existem desde as tasks anteriores.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/usuarios/page.tsx"
git commit -m "feat: página /usuarios protegida por editar_usuarios"
```

---

### Task 15: Verificação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Suíte de testes completa**

Run: `npm run test:run`
Expected: todos os testes passam (os novos de `lib/permissoes/diff-overrides.test.ts` e `middleware.test.ts` + todos os já existentes, sem regressão).

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit`
Expected: sem erros (fora dos pré-existentes em `*.test.tsx` sobre globais de teste, já confirmados como não relacionados).

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 4: Teste manual do fluxo de convite**

Como este plano introduz um fluxo novo de ponta a ponta (criar usuário → email de convite → `/nova-senha?tipo=invite` → login), rodar `npm run dev` e testar manualmente: criar um usuário de teste, verificar o email recebido (ou o link logado no console se o Resend falhar em dev), abrir o link, definir senha, logar. Vitest não cobre esse fluxo (depende de infraestrutura de email real).

- [ ] **Step 5: Revisão manual da migration antes de aplicar em produção**

Ler `supabase/migrations/015_usuarios_dados_gerais.sql` mais uma vez e confirmar com o usuário antes de rodar contra o banco do Supabase — aplicar migration tem efeito em dados reais de produção.

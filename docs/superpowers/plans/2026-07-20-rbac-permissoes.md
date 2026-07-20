# RBAC e Permissões (Fase 1 do módulo de Usuários) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender o RBAC atual (4 papéis) para os 6 papéis pedidos, construir um motor de permissões granulares com overrides por usuário, e aplicar essa proteção (com mensagens 403 claras + mascaramento de campos financeiros) nas rotas de API já existentes — sem tocar em nenhuma UI nova.

**Architecture:** Matriz de permissões por perfil fixa em TypeScript (`lib/permissoes/matriz.ts`), resolvida em runtime com overrides individuais vindos de uma nova tabela (`lib/permissoes/resolver.ts`), consumida pelas rotas via helpers (`lib/permissoes/servidor.ts`) que seguem o padrão de early-return já usado em todas as rotas do projeto. Mascaramento de campos financeiros feito por uma função pura recursiva (`lib/permissoes/mascarar.ts`) aplicada na fronteira da API, nunca nos cálculos internos. RLS espelha a mesma lógica via uma função SQL `has_permissao()`, como defesa em profundidade.

**Tech Stack:** Next.js 15 (App Router, Route Handlers), Supabase (Postgres + RLS + `@supabase/ssr`), TypeScript, Vitest.

## Global Constraints

- Autenticação, hashing de senha, JWT e sessão continuam 100% Supabase Auth — nenhuma mudança nisso.
- Nenhuma UI nova nesta fase (sem item de menu, sem tela de usuários) — só backend/RLS.
- Toda checagem de permissão no backend é reforço explícito; a RLS continua como camada de defesa em profundidade, nunca a única barreira.
- Seguir o padrão de rota existente: early-return com `NextResponse.json({ error: '...' }, { status })`, sem middleware/wrapper que mude assinatura de rota.
- Testes cobrem a lógica pura de `lib/permissoes/*`; rotas não ganham teste dedicado (o projeto não tem esse padrão hoje — ver spec).
- Todo texto de erro/UI em português, no mesmo tom direto já usado no projeto (ex.: `'Apenas administradores podem excluir orçamentos'`).

---

### Task 1: Migration — papéis estendidos + tabela de overrides + RLS

**Files:**
- Create: `supabase/migrations/013_rbac_permissoes.sql`

**Interfaces:**
- Produces: papel `usuarios.papel` aceita os 6 valores (`admin`, `gerente`, `orcamentista`, `comercial`, `financeiro`, `visitante`); tabela `usuario_permissoes(usuario_id, permissao, concedida)`; função SQL `has_permissao(chave text) RETURNS boolean`.

- [ ] **Step 1: Escrever a migration completa**

```sql
-- supabase/migrations/013_rbac_permissoes.sql
-- Fase 1 do módulo de Usuários: RBAC estendido (6 perfis) + permissões
-- individuais por usuário (overrides sobre o perfil).
-- Ver docs/superpowers/specs/2026-07-20-rbac-permissoes-design.md

-- 1. Migrar dados existentes ANTES de trocar a constraint (sem perda)
UPDATE usuarios SET papel = 'gerente'   WHERE papel = 'engenheiro';
UPDATE usuarios SET papel = 'visitante' WHERE papel = 'visualizador';

ALTER TABLE usuarios DROP CONSTRAINT usuarios_papel_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('admin','gerente','orcamentista','comercial','financeiro','visitante'));

-- 2. Overrides individuais de permissão (exceção pontual sobre o perfil)
CREATE TABLE usuario_permissoes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id   uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  permissao    text NOT NULL,
  concedida    boolean NOT NULL,
  criado_por   uuid REFERENCES usuarios,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, permissao)
);
CREATE INDEX ON usuario_permissoes (usuario_id);

ALTER TABLE usuario_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_permissoes_select" ON usuario_permissoes
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR get_user_papel() = 'admin');
CREATE POLICY "usuario_permissoes_write" ON usuario_permissoes
  FOR ALL TO authenticated
  USING (get_user_papel() = 'admin')
  WITH CHECK (get_user_papel() = 'admin');

-- 3. has_permissao(): espelha em SQL a mesma matriz padrão de
-- lib/permissoes/matriz.ts, combinada com os overrides de usuario_permissoes.
-- Usada só nas policies onde a diferença entre "papel" e "permissão efetiva"
-- importa pra RLS (hoje: exclusões e visibilidade do banco de composições).
CREATE OR REPLACE FUNCTION has_permissao(chave text)
RETURNS boolean AS $$
DECLARE
  papel_atual text := get_user_papel();
  override boolean;
  padrao boolean;
BEGIN
  SELECT concedida INTO override
  FROM usuario_permissoes
  WHERE usuario_id = auth.uid() AND permissao = chave;

  IF override IS NOT NULL THEN
    RETURN override;
  END IF;

  padrao := CASE papel_atual
    WHEN 'admin' THEN true
    WHEN 'gerente' THEN chave IN (
      'visualizar_dashboard','visualizar_indicadores','editar_clientes',
      'criar_obras','editar_obras','visualizar_custos','visualizar_margem','visualizar_lucro',
      'visualizar_banco_composicoes','cadastrar_composicoes','editar_composicoes',
      'importar_planilhas','exportar_planilhas'
    )
    WHEN 'orcamentista' THEN chave IN (
      'visualizar_dashboard','editar_clientes','criar_obras','editar_obras',
      'visualizar_custos','visualizar_banco_composicoes','importar_planilhas','exportar_planilhas'
    )
    WHEN 'comercial' THEN chave IN ('visualizar_dashboard','exportar_planilhas')
    WHEN 'financeiro' THEN chave IN (
      'visualizar_dashboard','visualizar_indicadores','visualizar_custos',
      'visualizar_margem','visualizar_lucro','visualizar_banco_composicoes',
      'importar_planilhas','exportar_planilhas'
    )
    WHEN 'visitante' THEN chave IN ('visualizar_dashboard')
    ELSE false
  END;

  RETURN COALESCE(padrao, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Policies existentes: troca de 'engenheiro' por 'gerente'
ALTER POLICY "disciplinas_write" ON disciplinas
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "unidades_write" ON unidades_medida
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "obras_insert" ON obras
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "obras_update" ON obras
  USING (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "grupos_write" ON grupos_orcamento
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "itens_write" ON itens_orcamento
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "composicao_versoes_insert" ON composicao_versoes
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "composicao_usos_insert" ON composicao_usos
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

-- 5. Exclusões passam a respeitar has_permissao() (permite overrides individuais)
ALTER POLICY "obras_delete" ON obras
  USING (has_permissao('excluir_obras'));

-- clientes_write cobria INSERT/UPDATE/DELETE junto — separa exclusão pra
-- poder gatear por excluir_clientes (perfil isolado, distinto de editar_clientes)
DROP POLICY "clientes_write" ON clientes;
CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));
CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE TO authenticated
  USING (get_user_papel() IN ('admin','gerente','orcamentista'));
CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE TO authenticated
  USING (has_permissao('excluir_clientes'));

-- composicoes_write cobria admin+engenheiro+orcamentista; a nova matriz
-- restringe cadastrar/editar_composicoes a admin+gerente (orçamentista passa
-- a só consultar o banco, não editá-lo — mudança de comportamento intencional,
-- ver docs/superpowers/specs/2026-07-20-rbac-permissoes-design.md)
DROP POLICY "composicoes_write" ON composicoes;
CREATE POLICY "composicoes_insert" ON composicoes
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','gerente'));
CREATE POLICY "composicoes_update" ON composicoes
  FOR UPDATE TO authenticated
  USING (get_user_papel() IN ('admin','gerente'));
CREATE POLICY "composicoes_delete" ON composicoes
  FOR DELETE TO authenticated
  USING (has_permissao('excluir_composicoes'));

DROP POLICY "composicao_materiais_write" ON composicao_materiais;
CREATE POLICY "composicao_materiais_write" ON composicao_materiais
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','gerente'))
  WITH CHECK (get_user_papel() IN ('admin','gerente'));

DROP POLICY "composicao_mao_obra_write" ON composicao_mao_obra;
CREATE POLICY "composicao_mao_obra_write" ON composicao_mao_obra
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','gerente'))
  WITH CHECK (get_user_papel() IN ('admin','gerente'));

-- 6. Visibilidade do banco de composições: Comercial e Visitante não veem
-- (matriz: visualizar_banco_composicoes = false pra eles)
ALTER POLICY "composicoes_select" ON composicoes
  USING (has_permissao('visualizar_banco_composicoes'));
ALTER POLICY "composicao_materiais_select" ON composicao_materiais
  USING (has_permissao('visualizar_banco_composicoes'));
ALTER POLICY "composicao_mao_obra_select" ON composicao_mao_obra
  USING (has_permissao('visualizar_banco_composicoes'));
ALTER POLICY "composicao_versoes_select" ON composicao_versoes
  USING (has_permissao('visualizar_banco_composicoes'));
```

- [ ] **Step 2: Revisar a migration lendo o arquivo de volta**

Confirme visualmente que:
- A ordem é: UPDATE de dados → troca de constraint → criação de tabela/função → ALTER/DROP+CREATE de policies (nessa ordem, já que `has_permissao()` é usada pelas policies que vêm depois dela no arquivo).
- Nenhum policy name foi digitado errado (comparar com os nomes em `002_rls_policies.sql`, `010_banco_composicoes.sql`, `011_composicao_usos.sql`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_rbac_permissoes.sql
git commit -m "feat: migration da Fase 1 do módulo de Usuários (6 perfis + permissões)"
```

---

### Task 2: Estender o tipo `Papel` e atualizar as referências existentes

**Files:**
- Modify: `types/database.ts:1`
- Modify: `components/layout/Sidebar.tsx:13-18`
- Modify: `app/(app)/layout.tsx:25`
- Modify: `app/privacidade/page.tsx:50`

**Interfaces:**
- Produces: `Papel = 'admin' | 'gerente' | 'orcamentista' | 'comercial' | 'financeiro' | 'visitante'` (usado por `lib/permissoes/*` nas próximas tasks).

- [ ] **Step 1: Atualizar o tipo em `types/database.ts`**

Em `types/database.ts:1`, trocar:

```ts
export type Papel = 'admin' | 'engenheiro' | 'orcamentista' | 'visualizador'
```

por:

```ts
export type Papel = 'admin' | 'gerente' | 'orcamentista' | 'comercial' | 'financeiro' | 'visitante'
```

- [ ] **Step 2: Atualizar `PAPEL_LABELS` no Sidebar**

Em `components/layout/Sidebar.tsx:13-18`, trocar:

```ts
const PAPEL_LABELS: Record<Papel, string> = {
  admin: 'Administrador',
  engenheiro: 'Engenheiro',
  orcamentista: 'Orçamentista',
  visualizador: 'Visualizador',
}
```

por:

```ts
const PAPEL_LABELS: Record<Papel, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  orcamentista: 'Orçamentista',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  visitante: 'Visitante',
}
```

- [ ] **Step 3: Atualizar o fallback de papel em `app/(app)/layout.tsx`**

Em `app/(app)/layout.tsx:25`, trocar `'visualizador'` por `'visitante'`:

```ts
          papel: (usuario?.papel ?? 'visitante') as Papel,
```

- [ ] **Step 4: Atualizar o texto de exemplo em `app/privacidade/page.tsx`**

Em `app/privacidade/page.tsx:50`, trocar o exemplo de papéis citado no texto de LGPD (que hoje cita nomes antigos):

```tsx
            e-mail corporativo, papel de acesso (ex.: administrador, engenheiro) e registros de
```

por:

```tsx
            e-mail corporativo, papel de acesso (ex.: administrador, gerente) e registros de
```

- [ ] **Step 5: Rodar o type-check do projeto**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `Papel` (o `Record<Papel, string>` do Sidebar precisa estar exaustivo, senão o TypeScript acusa chave faltando).

- [ ] **Step 6: Commit**

```bash
git add types/database.ts components/layout/Sidebar.tsx "app/(app)/layout.tsx" app/privacidade/page.tsx
git commit -m "feat: estende Papel para os 6 perfis (admin/gerente/orcamentista/comercial/financeiro/visitante)"
```

---

### Task 3: `lib/permissoes/matriz.ts` — catálogo de permissões e matriz padrão

**Files:**
- Create: `lib/permissoes/matriz.ts`
- Test: `lib/permissoes/matriz.test.ts`

**Interfaces:**
- Consumes: `Papel` de `@/types/database` (Task 2).
- Produces: `PERMISSOES` (array const), `Permissao` (union type), `MATRIZ_PADRAO: Record<Papel, ReadonlySet<Permissao>>` — usados por `resolver.ts` (Task 4) e `mascarar.ts` (Task 5).

- [ ] **Step 1: Escrever o teste da matriz**

```ts
// lib/permissoes/matriz.test.ts
import { describe, it, expect } from 'vitest'
import { MATRIZ_PADRAO, PERMISSOES } from './matriz'

describe('MATRIZ_PADRAO', () => {
  it('admin tem todas as permissões do catálogo', () => {
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.admin.has(permissao)).toBe(true)
    }
  })

  it('gerente tem acesso operacional amplo mas não administra usuários/permissões/configurações', () => {
    const esperado = new Set([
      'visualizar_dashboard', 'visualizar_indicadores', 'editar_clientes',
      'criar_obras', 'editar_obras', 'visualizar_custos', 'visualizar_margem', 'visualizar_lucro',
      'visualizar_banco_composicoes', 'cadastrar_composicoes', 'editar_composicoes',
      'importar_planilhas', 'exportar_planilhas',
    ])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.gerente.has(permissao)).toBe(esperado.has(permissao))
    }
  })

  it('orcamentista monta orçamento mas não vê lucro nem edita o banco de composições', () => {
    const esperado = new Set([
      'visualizar_dashboard', 'editar_clientes', 'criar_obras', 'editar_obras',
      'visualizar_custos', 'visualizar_banco_composicoes', 'importar_planilhas', 'exportar_planilhas',
    ])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.orcamentista.has(permissao)).toBe(esperado.has(permissao))
    }
    expect(MATRIZ_PADRAO.orcamentista.has('visualizar_lucro')).toBe(false)
    expect(MATRIZ_PADRAO.orcamentista.has('cadastrar_composicoes')).toBe(false)
  })

  it('comercial não vê custo, margem, lucro nem o banco de composições', () => {
    const esperado = new Set(['visualizar_dashboard', 'exportar_planilhas'])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.comercial.has(permissao)).toBe(esperado.has(permissao))
    }
  })

  it('financeiro vê tudo que é financeiro mas não edita composições nem usuários', () => {
    const esperado = new Set([
      'visualizar_dashboard', 'visualizar_indicadores', 'visualizar_custos',
      'visualizar_margem', 'visualizar_lucro', 'visualizar_banco_composicoes',
      'importar_planilhas', 'exportar_planilhas',
    ])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.financeiro.has(permissao)).toBe(esperado.has(permissao))
    }
  })

  it('visitante só visualiza o dashboard', () => {
    const esperado = new Set(['visualizar_dashboard'])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.visitante.has(permissao)).toBe(esperado.has(permissao))
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/permissoes/matriz.test.ts`
Expected: FAIL — `Cannot find module './matriz'`

- [ ] **Step 3: Implementar `lib/permissoes/matriz.ts`**

```ts
// lib/permissoes/matriz.ts
import type { Papel } from '@/types/database'

export const PERMISSOES = [
  'visualizar_dashboard',
  'visualizar_indicadores',
  'editar_clientes',
  'excluir_clientes',
  'criar_obras',
  'editar_obras',
  'excluir_obras',
  'visualizar_custos',
  'editar_custos',
  'visualizar_margem',
  'visualizar_lucro',
  'visualizar_banco_composicoes',
  'cadastrar_composicoes',
  'editar_composicoes',
  'excluir_composicoes',
  'importar_planilhas',
  'exportar_planilhas',
  'cadastrar_usuarios',
  'editar_usuarios',
  'excluir_usuarios',
  'alterar_permissoes',
  'visualizar_auditoria',
  'acessar_configuracoes',
  'backup',
  'restaurar_banco',
] as const

export type Permissao = typeof PERMISSOES[number]

function apenas(...permissoes: Permissao[]): ReadonlySet<Permissao> {
  return new Set(permissoes)
}

export const MATRIZ_PADRAO: Record<Papel, ReadonlySet<Permissao>> = {
  admin: new Set(PERMISSOES),
  gerente: apenas(
    'visualizar_dashboard', 'visualizar_indicadores',
    'editar_clientes',
    'criar_obras', 'editar_obras',
    'visualizar_custos', 'visualizar_margem', 'visualizar_lucro',
    'visualizar_banco_composicoes', 'cadastrar_composicoes', 'editar_composicoes',
    'importar_planilhas', 'exportar_planilhas'
  ),
  orcamentista: apenas(
    'visualizar_dashboard',
    'editar_clientes',
    'criar_obras', 'editar_obras',
    'visualizar_custos',
    'visualizar_banco_composicoes',
    'importar_planilhas', 'exportar_planilhas'
  ),
  comercial: apenas(
    'visualizar_dashboard',
    'exportar_planilhas'
  ),
  financeiro: apenas(
    'visualizar_dashboard', 'visualizar_indicadores',
    'visualizar_custos', 'visualizar_margem', 'visualizar_lucro',
    'visualizar_banco_composicoes',
    'importar_planilhas', 'exportar_planilhas'
  ),
  visitante: apenas('visualizar_dashboard'),
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/permissoes/matriz.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/permissoes/matriz.ts lib/permissoes/matriz.test.ts
git commit -m "feat: catálogo de permissões e matriz padrão por perfil"
```

---

### Task 4: `lib/permissoes/resolver.ts` — resolução de permissões efetivas com overrides

**Files:**
- Create: `lib/permissoes/resolver.ts`
- Test: `lib/permissoes/resolver.test.ts`

**Interfaces:**
- Consumes: `MATRIZ_PADRAO`, `Permissao` de `./matriz` (Task 3).
- Produces: `OverridePermissao { permissao: Permissao; concedida: boolean }`, `calcularPermissoes(papel: Papel, overrides?: OverridePermissao[]): Set<Permissao>` — usado por `servidor.ts` (Task 6).

- [ ] **Step 1: Escrever o teste**

```ts
// lib/permissoes/resolver.test.ts
import { describe, it, expect } from 'vitest'
import { calcularPermissoes } from './resolver'

describe('calcularPermissoes', () => {
  it('sem overrides, retorna exatamente a matriz padrão do perfil', () => {
    const permissoes = calcularPermissoes('visitante')
    expect(permissoes.has('visualizar_dashboard')).toBe(true)
    expect(permissoes.has('visualizar_custos')).toBe(false)
  })

  it('override concedida:true adiciona uma permissão que o perfil não tem', () => {
    const permissoes = calcularPermissoes('comercial', [
      { permissao: 'visualizar_custos', concedida: true },
    ])
    expect(permissoes.has('visualizar_custos')).toBe(true)
    // demais permissões do perfil comercial continuam intactas
    expect(permissoes.has('visualizar_margem')).toBe(false)
    expect(permissoes.has('exportar_planilhas')).toBe(true)
  })

  it('override concedida:false revoga uma permissão que o perfil tem', () => {
    const permissoes = calcularPermissoes('gerente', [
      { permissao: 'exportar_planilhas', concedida: false },
    ])
    expect(permissoes.has('exportar_planilhas')).toBe(false)
    expect(permissoes.has('editar_obras')).toBe(true)
  })

  it('não muta a matriz padrão original (Set independente por chamada)', () => {
    calcularPermissoes('comercial', [{ permissao: 'visualizar_custos', concedida: true }])
    const semOverride = calcularPermissoes('comercial')
    expect(semOverride.has('visualizar_custos')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/permissoes/resolver.test.ts`
Expected: FAIL — `Cannot find module './resolver'`

- [ ] **Step 3: Implementar `lib/permissoes/resolver.ts`**

```ts
// lib/permissoes/resolver.ts
import type { Papel } from '@/types/database'
import { MATRIZ_PADRAO, type Permissao } from './matriz'

export interface OverridePermissao {
  permissao: Permissao
  concedida: boolean
}

export function calcularPermissoes(
  papel: Papel,
  overrides: OverridePermissao[] = []
): Set<Permissao> {
  const permissoes = new Set(MATRIZ_PADRAO[papel])
  for (const override of overrides) {
    if (override.concedida) {
      permissoes.add(override.permissao)
    } else {
      permissoes.delete(override.permissao)
    }
  }
  return permissoes
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/permissoes/resolver.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/permissoes/resolver.ts lib/permissoes/resolver.test.ts
git commit -m "feat: resolução de permissões efetivas (matriz padrão + overrides)"
```

---

### Task 5: `lib/permissoes/mascarar.ts` — remoção de campos financeiros sensíveis

**Files:**
- Create: `lib/permissoes/mascarar.ts`
- Test: `lib/permissoes/mascarar.test.ts`

**Interfaces:**
- Consumes: `Permissao` de `./matriz` (Task 3).
- Produces: `mascararCamposFinanceiros<T>(dados: T, permissoes: ReadonlySet<Permissao>): T` — usado nas rotas de obras (Task 9).

- [ ] **Step 1: Escrever o teste**

```ts
// lib/permissoes/mascarar.test.ts
import { describe, it, expect } from 'vitest'
import { mascararCamposFinanceiros } from './mascarar'

function permissoes(...concedidas: string[]) {
  return new Set(concedidas) as Set<import('./matriz').Permissao>
}

describe('mascararCamposFinanceiros', () => {
  it('sem visualizar_custos, remove campos de custo mas mantém o resto', () => {
    const obra = { codigo: 'OB-1', custo_unit_mao_obra: 100, custo_unit_material: 50, quantidade: 2 }
    const resultado = mascararCamposFinanceiros(obra, permissoes())
    expect(resultado).toEqual({ codigo: 'OB-1', quantidade: 2 })
  })

  it('com visualizar_custos, mantém os campos de custo', () => {
    const obra = { custo_unit_mao_obra: 100, custo_unit_material: 50 }
    const resultado = mascararCamposFinanceiros(obra, permissoes('visualizar_custos'))
    expect(resultado).toEqual({ custo_unit_mao_obra: 100, custo_unit_material: 50 })
  })

  it('sem visualizar_margem, remove markup e percentuais de margem', () => {
    const item = { markup_mao_obra: 1.3, markup_material: 1.2, margem_efetiva_pct: 0.25, descricao: 'Item' }
    const resultado = mascararCamposFinanceiros(item, permissoes('visualizar_custos'))
    expect(resultado).toEqual({ descricao: 'Item' })
  })

  it('sem visualizar_lucro, remove o campo lucro', () => {
    const resumo = { lucro: 1000, total_custo: 500 }
    const resultado = mascararCamposFinanceiros(resumo, permissoes('visualizar_custos', 'visualizar_margem'))
    expect(resultado).toEqual({ total_custo: 500 })
  })

  it('com todas as permissões financeiras, não remove nada', () => {
    const dados = { custo_unit_mao_obra: 1, markup_mao_obra: 1.1, lucro: 10 }
    const resultado = mascararCamposFinanceiros(
      dados,
      permissoes('visualizar_custos', 'visualizar_margem', 'visualizar_lucro')
    )
    expect(resultado).toEqual(dados)
  })

  it('mascara recursivamente em estruturas aninhadas (obra → grupos → itens) e em arrays', () => {
    const obras = [
      {
        codigo: 'OB-1',
        grupos_orcamento: [
          {
            letra: 'A',
            itens_orcamento: [
              { descricao: 'Item 1', custo_unit_mao_obra: 10, lucro: 5 },
              { descricao: 'Item 2', custo_unit_material: 20, lucro: 3 },
            ],
          },
        ],
      },
    ]
    const resultado = mascararCamposFinanceiros(obras, permissoes())
    expect(resultado).toEqual([
      {
        codigo: 'OB-1',
        grupos_orcamento: [
          {
            letra: 'A',
            itens_orcamento: [{ descricao: 'Item 1' }, { descricao: 'Item 2' }],
          },
        ],
      },
    ])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/permissoes/mascarar.test.ts`
Expected: FAIL — `Cannot find module './mascarar'`

- [ ] **Step 3: Implementar `lib/permissoes/mascarar.ts`**

```ts
// lib/permissoes/mascarar.ts
import type { Permissao } from './matriz'

const CAMPOS_CUSTO = [
  'custo_unit_mao_obra', 'custo_unit_material',
  'subtotal_mao_obra_custo', 'subtotal_material_custo',
  'total_custo', 'total_mao_obra_custo', 'total_material_custo',
  'custo_direto', 'custo_total', 'custo_com_fee',
] as const

const CAMPOS_MARGEM = [
  'margem_mao_obra_pct', 'margem_material_pct', 'margem_efetiva_pct',
  'markup_mao_obra', 'markup_material', 'markup_sugerido',
] as const

const CAMPOS_LUCRO = ['lucro'] as const

function removerCampos(alvo: unknown, campos: readonly string[]): void {
  if (Array.isArray(alvo)) {
    for (const item of alvo) removerCampos(item, campos)
    return
  }
  if (alvo === null || typeof alvo !== 'object') return

  const objeto = alvo as Record<string, unknown>
  for (const campo of campos) delete objeto[campo]
  for (const valor of Object.values(objeto)) {
    if (valor !== null && typeof valor === 'object') removerCampos(valor, campos)
  }
}

/**
 * Remove por completo (nunca substitui por null) os campos financeiros
 * sensíveis de uma resposta de API, percorrendo arrays e objetos aninhados.
 * Age só na fronteira da API — os cálculos internos não são afetados.
 */
export function mascararCamposFinanceiros<T>(dados: T, permissoes: ReadonlySet<Permissao>): T {
  if (!permissoes.has('visualizar_custos')) removerCampos(dados, CAMPOS_CUSTO)
  if (!permissoes.has('visualizar_margem')) removerCampos(dados, CAMPOS_MARGEM)
  if (!permissoes.has('visualizar_lucro')) removerCampos(dados, CAMPOS_LUCRO)
  return dados
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/permissoes/mascarar.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/permissoes/mascarar.ts lib/permissoes/mascarar.test.ts
git commit -m "feat: mascaramento recursivo de campos financeiros por permissão"
```

---

### Task 6: `lib/permissoes/servidor.ts` — helpers para rotas de API

**Files:**
- Create: `lib/permissoes/servidor.ts`
- Test: `lib/permissoes/servidor.test.ts`

**Interfaces:**
- Consumes: `calcularPermissoes`, `OverridePermissao` de `./resolver` (Task 4); `Permissao` de `./matriz` (Task 3); `Papel` de `@/types/database`.
- Produces: `UsuarioComPermissoes { id, nome, papel, permissoes }`, `obterUsuarioComPermissoes(supabase, userId): Promise<UsuarioComPermissoes | null>`, `requireRole(papel, ...papeisPermitidos): boolean`, `requirePermission(permissoes, chave): boolean` — usados por todas as rotas nas Tasks 7-11.

- [ ] **Step 1: Escrever o teste**

Segue o mesmo padrão de mock de `lib/rate-limit.test.ts` (mock de `@/lib/supabase/server`, mas aqui mockando o client recebido por parâmetro em vez do módulo, já que `obterUsuarioComPermissoes` recebe o client pronto):

```ts
// lib/permissoes/servidor.test.ts
import { describe, it, expect } from 'vitest'
import { obterUsuarioComPermissoes, requireRole, requirePermission } from './servidor'

function supabaseMock(usuario: { id: string; nome: string; papel: string } | null, overrides: { permissao: string; concedida: boolean }[]) {
  return {
    from(tabela: string) {
      if (tabela === 'usuarios') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: usuario, error: null }) }) }) }
      }
      if (tabela === 'usuario_permissoes') {
        return { select: () => ({ eq: async () => ({ data: overrides, error: null }) }) }
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('obterUsuarioComPermissoes', () => {
  it('retorna null quando o usuário não existe', async () => {
    const resultado = await obterUsuarioComPermissoes(supabaseMock(null, []), 'user-1')
    expect(resultado).toBeNull()
  })

  it('retorna usuário com permissões calculadas a partir do perfil', async () => {
    const resultado = await obterUsuarioComPermissoes(
      supabaseMock({ id: 'user-1', nome: 'Ana', papel: 'comercial' }, []),
      'user-1'
    )
    expect(resultado?.papel).toBe('comercial')
    expect(resultado?.permissoes.has('exportar_planilhas')).toBe(true)
    expect(resultado?.permissoes.has('visualizar_custos')).toBe(false)
  })

  it('aplica overrides individuais sobre o perfil', async () => {
    const resultado = await obterUsuarioComPermissoes(
      supabaseMock(
        { id: 'user-1', nome: 'Ana', papel: 'comercial' },
        [{ permissao: 'visualizar_custos', concedida: true }]
      ),
      'user-1'
    )
    expect(resultado?.permissoes.has('visualizar_custos')).toBe(true)
  })
})

describe('requireRole', () => {
  it('true quando o papel está entre os permitidos', () => {
    expect(requireRole('admin', 'admin', 'gerente')).toBe(true)
  })
  it('false quando o papel não está entre os permitidos', () => {
    expect(requireRole('visitante', 'admin', 'gerente')).toBe(false)
  })
})

describe('requirePermission', () => {
  it('true quando a permissão está no conjunto', () => {
    expect(requirePermission(new Set(['exportar_planilhas'] as const), 'exportar_planilhas')).toBe(true)
  })
  it('false quando a permissão não está no conjunto', () => {
    expect(requirePermission(new Set([] as const), 'exportar_planilhas')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/permissoes/servidor.test.ts`
Expected: FAIL — `Cannot find module './servidor'`

- [ ] **Step 3: Implementar `lib/permissoes/servidor.ts`**

```ts
// lib/permissoes/servidor.ts
import { createClient } from '@/lib/supabase/server'
import type { Papel } from '@/types/database'
import { calcularPermissoes, type OverridePermissao } from './resolver'
import type { Permissao } from './matriz'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface UsuarioComPermissoes {
  id: string
  nome: string
  papel: Papel
  permissoes: Set<Permissao>
}

export async function obterUsuarioComPermissoes(
  supabase: SupabaseClient,
  userId: string
): Promise<UsuarioComPermissoes | null> {
  const [{ data: usuario }, { data: overrides }] = await Promise.all([
    supabase.from('usuarios').select('id, nome, papel').eq('id', userId).single(),
    supabase.from('usuario_permissoes').select('permissao, concedida').eq('usuario_id', userId),
  ])
  if (!usuario) return null

  return {
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel as Papel,
    permissoes: calcularPermissoes(usuario.papel as Papel, (overrides ?? []) as OverridePermissao[]),
  }
}

export function requireRole(papel: Papel, ...papeisPermitidos: Papel[]): boolean {
  return papeisPermitidos.includes(papel)
}

export function requirePermission(permissoes: ReadonlySet<Permissao>, chave: Permissao): boolean {
  return permissoes.has(chave)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/permissoes/servidor.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/permissoes/servidor.ts lib/permissoes/servidor.test.ts
git commit -m "feat: helpers de permissão para rotas de API (obterUsuarioComPermissoes, requireRole, requirePermission)"
```

---

### Task 7: Proteger as rotas de clientes

**Files:**
- Modify: `app/api/clientes/route.ts`
- Modify: `app/api/clientes/[id]/route.ts`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor` (Task 6).

- [ ] **Step 1: Proteger `POST /api/clientes` (editar_clientes)**

Em `app/api/clientes/route.ts`, dentro de `POST`, logo após o `if (!user) ...`:

```ts
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
```

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_clientes')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar clientes' }, { status: 403 })
  }
```

- [ ] **Step 2: Proteger `PUT /api/clientes/[id]` (editar_clientes) e `DELETE` (excluir_clientes)**

Em `app/api/clientes/[id]/route.ts`, adicionar o mesmo import e, em `PUT`, após o `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_clientes')) {
    return NextResponse.json({ error: 'Sem permissão para editar clientes' }, { status: 403 })
  }
```

Em `DELETE`, após o `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'excluir_clientes')) {
    return NextResponse.json({ error: 'Sem permissão para excluir clientes' }, { status: 403 })
  }
```

- [ ] **Step 3: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo; todos os testes de `lib/permissoes/*` continuam passando (nenhum teste de rota existe pra quebrar).

- [ ] **Step 4: Commit**

```bash
git add app/api/clientes/route.ts "app/api/clientes/[id]/route.ts"
git commit -m "feat: protege rotas de clientes com editar_clientes/excluir_clientes"
```

---

### Task 8: Proteger as rotas de obras, grupos e itens

**Files:**
- Modify: `app/api/obras/route.ts`
- Modify: `app/api/obras/[id]/route.ts`
- Modify: `app/api/obras/[id]/grupos/route.ts`
- Modify: `app/api/obras/[id]/grupos/[grupoId]/route.ts`
- Modify: `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`
- Modify: `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor` (Task 6).

- [ ] **Step 1: `POST /api/obras` → `criar_obras`**

Em `app/api/obras/route.ts`, adicionar o import de `obterUsuarioComPermissoes, requirePermission` e, em `POST`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'criar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para criar orçamentos' }, { status: 403 })
  }
```

- [ ] **Step 2: `PUT /api/obras/[id]` → `editar_obras`; `DELETE` → `excluir_obras` (substitui a checagem antiga)**

Em `app/api/obras/[id]/route.ts`, adicionar o import e, em `PUT`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para editar orçamentos' }, { status: 403 })
  }
```

Em `DELETE`, trocar o bloco existente:

```ts
  // Só administradores excluem orçamentos (o RLS também bloqueia, mas silenciosamente;
  // a checagem explícita devolve um 403 claro em vez de um "sucesso" que não apaga nada).
  const { data: usuario } = await supabase
    .from('usuarios').select('papel').eq('id', user.id).single()
  if (usuario?.papel !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem excluir orçamentos' }, { status: 403 })
  }
```

por:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'excluir_obras')) {
    return NextResponse.json({ error: 'Sem permissão para excluir orçamentos' }, { status: 403 })
  }
```

- [ ] **Step 3: Grupos e itens → `editar_obras`**

Nos 4 arquivos restantes (`grupos/route.ts` POST, `grupos/[grupoId]/route.ts` PUT e DELETE, `itens/route.ts` POST, `itens/[itemId]/route.ts` PUT e DELETE), adicionar o import e, logo após cada `if (!user) ...` de cada handler:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para editar orçamentos' }, { status: 403 })
  }
```

- [ ] **Step 4: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros; testes de `lib/permissoes/*` e demais testes existentes (`lib/calculos.test.ts`, `lib/composicoes/*.test.ts`, etc.) continuam passando.

- [ ] **Step 5: Commit**

```bash
git add app/api/obras
git commit -m "feat: protege rotas de obras/grupos/itens com criar_obras/editar_obras/excluir_obras"
```

---

### Task 9: Mascarar campos financeiros nas rotas de leitura de obras + gatear exports por indicador/custo

**Files:**
- Modify: `app/api/obras/route.ts` (GET)
- Modify: `app/api/obras/[id]/route.ts` (GET)
- Modify: `app/api/obras/[id]/export/route.ts`
- Modify: `app/api/dashboard/export/route.ts`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`; `mascararCamposFinanceiros` de `@/lib/permissoes/mascarar` (Task 5).

- [ ] **Step 1: Mascarar `GET /api/obras`**

Em `app/api/obras/route.ts`, no `GET`, após buscar `data` e antes do `return NextResponse.json(data)`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes))
```

(remove o `return NextResponse.json(data)` antigo, adicionando os imports de `obterUsuarioComPermissoes` e `mascararCamposFinanceiros` no topo do arquivo).

- [ ] **Step 2: Mascarar `GET /api/obras/[id]`**

Em `app/api/obras/[id]/route.ts`, no `GET`, depois do bloco que ordena `grupos_orcamento`/`itens_orcamento` e antes do `return NextResponse.json(data)` final:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes))
```

- [ ] **Step 3: Gatear a exportação técnica (28 colunas) por `visualizar_custos`**

Em `app/api/obras/[id]/export/route.ts`, logo após a linha que lê `tipo`:

```ts
  const tipo = request.nextUrl.searchParams.get('tipo') === 'tecnico' ? 'tecnico' : 'comercial'
```

adicionar:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'exportar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para exportar orçamentos' }, { status: 403 })
  }
  if (tipo === 'tecnico' && !requirePermission(usuario.permissoes, 'visualizar_custos')) {
    return NextResponse.json({ error: 'Sem permissão para exportar a planilha técnica (com custos)' }, { status: 403 })
  }
```

(a planilha `comercial` não expõe custo/margem/lucro — só a `tecnico` precisa da checagem extra).

- [ ] **Step 4: Gatear `GET /api/dashboard/export` por `visualizar_indicadores`**

Em `app/api/dashboard/export/route.ts`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_indicadores')) {
    return NextResponse.json({ error: 'Sem permissão para exportar indicadores' }, { status: 403 })
  }
```

- [ ] **Step 5: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros; suíte inteira passando.

- [ ] **Step 6: Commit**

```bash
git add app/api/obras/route.ts "app/api/obras/[id]/route.ts" "app/api/obras/[id]/export/route.ts" app/api/dashboard/export/route.ts
git commit -m "feat: mascara campos financeiros na leitura de obras e gateia exports por visualizar_custos/indicadores"
```

---

### Task 10: Proteger as rotas de composições (escrita e visibilidade do banco)

**Files:**
- Modify: `app/api/composicoes/route.ts` (GET e POST)
- Modify: `app/api/composicoes/[id]/route.ts` (GET, PUT, DELETE)
- Modify: `app/api/composicoes/[id]/versoes/route.ts` (GET)
- Modify: `app/api/composicoes/[id]/versoes/[versaoId]/restaurar/route.ts` (POST)

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`.

- [ ] **Step 1: Gatear leitura do banco por `visualizar_banco_composicoes`**

Em `app/api/composicoes/route.ts` (`GET`) e `app/api/composicoes/[id]/route.ts` (`GET`) e `app/api/composicoes/[id]/versoes/route.ts` (`GET`), após `if (!user) ...` em cada um:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_banco_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para acessar o banco de composições' }, { status: 403 })
  }
```

(a RLS da Task 1 já bloqueia no banco; esta checagem dá uma mensagem 403 clara em vez de resultado vazio.)

- [ ] **Step 2: `POST /api/composicoes` → `cadastrar_composicoes`**

Em `app/api/composicoes/route.ts`, em `POST`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'cadastrar_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar composições' }, { status: 403 })
  }
```

- [ ] **Step 3: `PUT /api/composicoes/[id]` → `editar_composicoes`; `DELETE` → `excluir_composicoes`**

Em `app/api/composicoes/[id]/route.ts`, em `PUT`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para editar composições' }, { status: 403 })
  }
```

Em `DELETE`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'excluir_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para excluir composições' }, { status: 403 })
  }
```

- [ ] **Step 4: `POST /api/composicoes/[id]/versoes/[versaoId]/restaurar` → `editar_composicoes`**

Em `app/api/composicoes/[id]/versoes/[versaoId]/restaurar/route.ts`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para restaurar versões de composições' }, { status: 403 })
  }
```

- [ ] **Step 5: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros; suíte inteira passando (inclui `lib/composicoes/*.test.ts` já existentes).

- [ ] **Step 6: Commit**

```bash
git add app/api/composicoes
git commit -m "feat: protege rotas de composições com visualizar_banco_composicoes/cadastrar/editar/excluir_composicoes"
```

---

### Task 11: Proteger import/export de composições e import de obras

**Files:**
- Modify: `app/api/composicoes/import/route.ts` (POST)
- Modify: `app/api/composicoes/export/route.ts` (GET)
- Modify: `app/api/obras/import/route.ts` (POST)
- Modify: `app/api/obras/[id]/import/route.ts` (POST)

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`.

- [ ] **Step 1: `POST /api/composicoes/import` → `importar_planilhas`**

Em `app/api/composicoes/import/route.ts`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'importar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para importar planilhas' }, { status: 403 })
  }
```

- [ ] **Step 2: `GET /api/composicoes/export` → `exportar_planilhas`**

Em `app/api/composicoes/export/route.ts`, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'exportar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para exportar planilhas' }, { status: 403 })
  }
```

- [ ] **Step 3: `POST /api/obras/import` e `POST /api/obras/[id]/import` → `importar_planilhas`**

Em ambos os arquivos, após `if (!user) ...`:

```ts
  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'importar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para importar planilhas' }, { status: 403 })
  }
```

- [ ] **Step 4: Rodar o type-check e a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros; suíte inteira passando.

- [ ] **Step 5: Commit**

```bash
git add app/api/composicoes/import/route.ts app/api/composicoes/export/route.ts app/api/obras/import/route.ts "app/api/obras/[id]/import/route.ts"
git commit -m "feat: protege import/export de composições e import de obras com importar_planilhas/exportar_planilhas"
```

---

### Task 12: Verificação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Suíte de testes completa**

Run: `npm run test:run`
Expected: todos os testes passam (os novos de `lib/permissoes/*` + todos os já existentes, sem nenhuma regressão).

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros (confirma que as novas rotas/imports compilam no bundle do Next).

- [ ] **Step 4: Revisão manual da migration antes de aplicar em produção**

Ler `supabase/migrations/013_rbac_permissoes.sql` mais uma vez de ponta a ponta e confirmar com o usuário antes de rodar contra o banco do Supabase (aplicar migration é uma ação com efeito em dados reais de produção — não rodar automaticamente sem confirmação explícita).

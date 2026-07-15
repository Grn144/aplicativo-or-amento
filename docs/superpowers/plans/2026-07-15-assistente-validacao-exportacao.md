# Assistente Inteligente — Fase 2: Validação antes de exportar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes de exportar o orçamento (técnico ou comercial), verificar 5 problemas estruturais nos itens (descrição ausente, unidade ausente, valor zerado, quantidade inválida, custo inconsistente) e, se houver algum, exigir confirmação explícita do usuário num modal antes de gerar a planilha.

**Architecture:** Lógica pura em `lib/orcamento/validacao-exportacao.ts` (`validarOrcamentoParaExportacao`), rodando inteiramente no cliente sobre os itens já calculados em `EditorOrcamento.tsx` (`gruposCalculados`, que já tem `lucro` calculado por `lib/calculos.ts`) — sem nenhuma chamada nova ao servidor. Um novo modal (`ValidacaoExportacaoModal.tsx`, seguindo o padrão visual de `InserirComposicaoModal.tsx`) mostra a lista de problemas com opção de cancelar ou prosseguir. `EditorOrcamento.tsx` passa a interceptar o clique nos botões de exportar: se a validação encontra problemas, abre o modal em vez de exportar direto; sem problemas, exporta imediatamente como hoje.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Tailwind + shadcn/ui (`Dialog`, `Button`), Vitest.

## Global Constraints

- 5 checks apenas, todos estruturais (sem depender de composição, histórico entre orçamentos, ou amostra mínima): descrição ausente/placeholder, unidade ausente, valor zerado (material E mão de obra ambos zero), quantidade inválida (≤0), custo inconsistente (`lucro < 0`).
- "Itens sem composição" **não** é um check — item manual é um uso normal e comum do app.
- Placeholder de descrição vazia é exatamente o texto `"Novo item"` (usado pela rota de criação manual de item quando nenhuma descrição é informada).
- "Valor zerado" só dispara quando `custo_unit_material === 0` **e** `custo_unit_mao_obra === 0` simultaneamente — um dos dois zerado sozinho não é problema.
- Nunca bloqueia de verdade: a exportação sempre pode prosseguir mediante confirmação explícita ("Exportar mesmo assim"). Sem problemas encontrados, exporta direto sem nenhuma tela extra.
- A validação roda para os dois tipos de exportação (técnico e comercial) da mesma forma — mesmos itens, só muda o layout da planilha depois.
- Sem chamada de rede nova: toda a validação usa dados já carregados no cliente (`gruposCalculados`).

---

### Task 1: `lib/orcamento/validacao-exportacao.ts`

**Files:**
- Create: `lib/orcamento/validacao-exportacao.ts`
- Create: `lib/orcamento/validacao-exportacao.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `ItemParaValidarExportacao`, `TipoProblemaExportacao`, `ProblemaExportacao`, `validarOrcamentoParaExportacao(itens: ItemParaValidarExportacao[]): ProblemaExportacao[]` — usado pela Task 3 (`EditorOrcamento.tsx`) e indiretamente pela Task 2 (que só consome o tipo `ProblemaExportacao`, não a função).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `lib/orcamento/validacao-exportacao.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validarOrcamentoParaExportacao } from './validacao-exportacao'

function itemBase(overrides: Partial<Parameters<typeof validarOrcamentoParaExportacao>[0][0]> = {}) {
  return {
    id: 'item-1',
    numero: 1,
    descricao: 'Pintura interna em parede',
    unidade_id: 'un-m2',
    custo_unit_material: 50,
    custo_unit_mao_obra: 30,
    quantidade: 10,
    lucro: 200,
    ...overrides,
  }
}

describe('validarOrcamentoParaExportacao', () => {
  it('retorna lista vazia para item sem nenhum problema', () => {
    expect(validarOrcamentoParaExportacao([itemBase()])).toEqual([])
  })

  it('sinaliza descrição vazia', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ descricao: '  ' })])
    expect(resultado.some(p => p.tipo === 'descricao_ausente')).toBe(true)
  })

  it('sinaliza descrição igual ao placeholder padrão "Novo item"', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ descricao: 'Novo item' })])
    expect(resultado.some(p => p.tipo === 'descricao_ausente')).toBe(true)
  })

  it('não sinaliza descrição preenchida normalmente', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ descricao: 'Instalação elétrica' })])
    expect(resultado.some(p => p.tipo === 'descricao_ausente')).toBe(false)
  })

  it('sinaliza unidade ausente', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ unidade_id: null })])
    expect(resultado.some(p => p.tipo === 'unidade_ausente')).toBe(true)
  })

  it('sinaliza valor zerado quando material e mão de obra são ambos zero', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ custo_unit_material: 0, custo_unit_mao_obra: 0 })])
    expect(resultado.some(p => p.tipo === 'valor_zerado')).toBe(true)
  })

  it('não sinaliza valor zerado quando só um dos dois custos é zero', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ custo_unit_material: 0, custo_unit_mao_obra: 30 })])
    expect(resultado.some(p => p.tipo === 'valor_zerado')).toBe(false)
  })

  it('sinaliza quantidade zero', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ quantidade: 0 })])
    expect(resultado.some(p => p.tipo === 'quantidade_invalida')).toBe(true)
  })

  it('sinaliza quantidade negativa', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ quantidade: -5 })])
    expect(resultado.some(p => p.tipo === 'quantidade_invalida')).toBe(true)
  })

  it('sinaliza custo inconsistente quando o lucro é negativo', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ lucro: -10 })])
    expect(resultado.some(p => p.tipo === 'custo_inconsistente')).toBe(true)
  })

  it('não sinaliza custo inconsistente quando o lucro é zero ou positivo', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ lucro: 0 })])
    expect(resultado.some(p => p.tipo === 'custo_inconsistente')).toBe(false)
  })

  it('sinaliza múltiplos problemas do mesmo item, um por tipo', () => {
    const resultado = validarOrcamentoParaExportacao([
      itemBase({ descricao: '', unidade_id: null, quantidade: 0 }),
    ])
    expect(resultado).toHaveLength(3)
    expect(resultado.map(p => p.tipo).sort()).toEqual(
      ['descricao_ausente', 'quantidade_invalida', 'unidade_ausente'].sort()
    )
  })

  it('inclui número e descrição do item em cada problema', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ id: 'item-42', numero: 7, unidade_id: null })])
    expect(resultado[0].itemId).toBe('item-42')
    expect(resultado[0].itemNumero).toBe(7)
    expect(resultado[0].itemDescricao).toBe('Pintura interna em parede')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/orcamento/validacao-exportacao.test.ts`
Expected: FAIL — `Cannot find module './validacao-exportacao'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `validarOrcamentoParaExportacao`**

Crie `lib/orcamento/validacao-exportacao.ts`:

```typescript
export interface ItemParaValidarExportacao {
  id: string
  numero: number
  descricao: string
  unidade_id: string | null
  custo_unit_material: number
  custo_unit_mao_obra: number
  quantidade: number
  lucro: number
}

export type TipoProblemaExportacao =
  | 'descricao_ausente'
  | 'unidade_ausente'
  | 'valor_zerado'
  | 'quantidade_invalida'
  | 'custo_inconsistente'

export interface ProblemaExportacao {
  itemId: string
  itemNumero: number
  itemDescricao: string
  tipo: TipoProblemaExportacao
  mensagem: string
}

const DESCRICAO_PLACEHOLDER = 'Novo item'

export function validarOrcamentoParaExportacao(
  itens: ItemParaValidarExportacao[]
): ProblemaExportacao[] {
  const problemas: ProblemaExportacao[] = []

  for (const item of itens) {
    const adicionar = (tipo: TipoProblemaExportacao, mensagem: string) => {
      problemas.push({ itemId: item.id, itemNumero: item.numero, itemDescricao: item.descricao, tipo, mensagem })
    }

    const descricaoNormalizada = item.descricao.trim()
    if (descricaoNormalizada === '' || descricaoNormalizada === DESCRICAO_PLACEHOLDER) {
      adicionar('descricao_ausente', 'Descrição não preenchida')
    }
    if (item.unidade_id == null) {
      adicionar('unidade_ausente', 'Unidade de medida não selecionada')
    }
    if (item.custo_unit_material === 0 && item.custo_unit_mao_obra === 0) {
      adicionar('valor_zerado', 'Custo de material e de mão de obra zerados')
    }
    if (item.quantidade <= 0) {
      adicionar('quantidade_invalida', 'Quantidade zerada ou negativa')
    }
    if (item.lucro < 0) {
      adicionar('custo_inconsistente', 'Preço de venda menor que o custo (margem negativa)')
    }
  }

  return problemas
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/orcamento/validacao-exportacao.test.ts`
Expected: PASS — 13 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/orcamento/validacao-exportacao.ts lib/orcamento/validacao-exportacao.test.ts
git commit -m "feat: validacao estrutural do orcamento antes de exportar"
```

---

### Task 2: `components/orcamento/ValidacaoExportacaoModal.tsx`

**Files:**
- Create: `components/orcamento/ValidacaoExportacaoModal.tsx`

**Interfaces:**
- Consumes: `ProblemaExportacao` (Task 1, só o tipo — não chama `validarOrcamentoParaExportacao` diretamente).
- Produces: componente `ValidacaoExportacaoModal` com props `{ aberto: boolean; onOpenChange: (aberto: boolean) => void; problemas: ProblemaExportacao[]; onConfirmar: () => void }` — usado pela Task 3.

Este componente não tem teste automatizado dedicado — mesmo padrão já usado pelos outros modais do projeto (`ComposicaoModal.tsx`, `InserirComposicaoModal.tsx`), nenhum dos dois tem arquivo `.test.tsx`.

- [ ] **Step 1: Ler `InserirComposicaoModal.tsx` como referência de padrão visual**

Leia `components/composicoes/InserirComposicaoModal.tsx` inteiro — este novo modal deve seguir a mesma estrutura (`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` de `@/components/ui/dialog`, `Button` de `@/components/ui/button`, botão "Cancelar" com `variant="ghost"`).

- [ ] **Step 2: Criar o componente**

Crie `components/orcamento/ValidacaoExportacaoModal.tsx`:

```typescript
'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ProblemaExportacao } from '@/lib/orcamento/validacao-exportacao'

interface Props {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  problemas: ProblemaExportacao[]
  onConfirmar: () => void
}

export default function ValidacaoExportacaoModal({ aberto, onOpenChange, problemas, onConfirmar }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Problemas encontrados no orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Foram encontrados {problemas.length} problema(s) antes de exportar. Revise ou exporte mesmo assim.
          </p>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border">
            {problemas.map((p, i) => (
              <div key={`${p.itemId}-${p.tipo}-${i}`} className="border-b border-border/50 px-3 py-2 text-sm last:border-b-0">
                <span className="font-medium">Item {p.itemNumero}</span>
                {p.itemDescricao && <span className="text-muted-foreground"> — {p.itemDescricao}</span>}
                <span className="text-muted-foreground">: {p.mensagem}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirmar}>Exportar mesmo assim</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo relacionado a este arquivo (ele ainda não é importado por ninguém, então não pode gerar erro de uso incorreto ainda).

- [ ] **Step 4: Commit**

```bash
git add components/orcamento/ValidacaoExportacaoModal.tsx
git commit -m "feat: modal de problemas encontrados antes de exportar o orcamento"
```

---

### Task 3: `EditorOrcamento.tsx` — interceptar exportação com a validação

**Files:**
- Modify: `components/orcamento/EditorOrcamento.tsx`

**Interfaces:**
- Consumes: `validarOrcamentoParaExportacao`, `ProblemaExportacao` (Task 1); `ValidacaoExportacaoModal` (Task 2).
- Produces: nenhuma interface nova — só comportamento.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/orcamento/EditorOrcamento.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar os imports**

Localize:

```typescript
import { calcularAlertasOrcamento, type EstatisticaComposicao } from '@/lib/orcamento/alertas'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais } from '@/types/orcamento'
import InserirComposicaoModal from '@/components/composicoes/InserirComposicaoModal'
import CabecalhoObra from './CabecalhoObra'
import TabelaOrcamento from './TabelaOrcamento'
```

Substitua por:

```typescript
import { calcularAlertasOrcamento, type EstatisticaComposicao } from '@/lib/orcamento/alertas'
import { validarOrcamentoParaExportacao, type ProblemaExportacao } from '@/lib/orcamento/validacao-exportacao'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais } from '@/types/orcamento'
import InserirComposicaoModal from '@/components/composicoes/InserirComposicaoModal'
import ValidacaoExportacaoModal from './ValidacaoExportacaoModal'
import CabecalhoObra from './CabecalhoObra'
import TabelaOrcamento from './TabelaOrcamento'
```

- [ ] **Step 3: Adicionar o estado do modal de validação**

Localize:

```typescript
  const [exportando, setExportando] = useState<'tecnico' | 'comercial' | null>(null)
  const [importando, setImportando] = useState(false)
  const [modalComposicaoAberto, setModalComposicaoAberto] = useState(false)
```

Substitua por:

```typescript
  const [exportando, setExportando] = useState<'tecnico' | 'comercial' | null>(null)
  const [importando, setImportando] = useState(false)
  const [modalComposicaoAberto, setModalComposicaoAberto] = useState(false)
  const [modalValidacaoAberto, setModalValidacaoAberto] = useState(false)
  const [problemasExportacao, setProblemasExportacao] = useState<ProblemaExportacao[]>([])
  const [tipoExportacaoPendente, setTipoExportacaoPendente] = useState<'tecnico' | 'comercial' | null>(null)
```

- [ ] **Step 4: Separar a exportação de fato da validação que a antecede**

Localize a função `exportar` inteira:

```typescript
  async function exportar(tipo: 'tecnico' | 'comercial') {
    setExportando(tipo)
    try {
      const res = await fetch(`/api/obras/${obra.id}/export?tipo=${tipo}`)
      if (!res.ok) { alert('Erro ao gerar exportação'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `orcamento-${tipo}-${obra.codigo}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportando(null)
    }
  }
```

Substitua por:

```typescript
  async function executarExportacao(tipo: 'tecnico' | 'comercial') {
    setExportando(tipo)
    try {
      const res = await fetch(`/api/obras/${obra.id}/export?tipo=${tipo}`)
      if (!res.ok) { alert('Erro ao gerar exportação'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `orcamento-${tipo}-${obra.codigo}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportando(null)
    }
  }

  function exportar(tipo: 'tecnico' | 'comercial') {
    const itens = gruposCalculados.flatMap(g => g.itens_calculados)
    const problemas = validarOrcamentoParaExportacao(itens)
    if (problemas.length > 0) {
      setProblemasExportacao(problemas)
      setTipoExportacaoPendente(tipo)
      setModalValidacaoAberto(true)
      return
    }
    executarExportacao(tipo)
  }

  function confirmarExportacaoComProblemas() {
    setModalValidacaoAberto(false)
    if (tipoExportacaoPendente) {
      executarExportacao(tipoExportacaoPendente)
    }
    setTipoExportacaoPendente(null)
  }
```

Note: `exportar` deixa de ser `async` (a validação é síncrona) — os botões que a chamam (`onClick={() => exportar('tecnico')}`) continuam funcionando sem alteração, já que não dependiam do retorno da função.

- [ ] **Step 5: Renderizar o modal de validação**

Localize o final do JSX, logo depois de `<InserirComposicaoModal ... />` e antes do `</div>` de fechamento:

```typescript
      <InserirComposicaoModal
        aberto={modalComposicaoAberto}
        onOpenChange={setModalComposicaoAberto}
        obraId={obra.id}
        grupos={grupos.map(g => ({ id: g.id, letra: g.letra, disciplinas: g.disciplinas }))}
        onInserido={itemInseridoPorComposicao}
      />
    </div>
  )
}
```

Substitua por:

```typescript
      <InserirComposicaoModal
        aberto={modalComposicaoAberto}
        onOpenChange={setModalComposicaoAberto}
        obraId={obra.id}
        grupos={grupos.map(g => ({ id: g.id, letra: g.letra, disciplinas: g.disciplinas }))}
        onInserido={itemInseridoPorComposicao}
      />

      <ValidacaoExportacaoModal
        aberto={modalValidacaoAberto}
        onOpenChange={setModalValidacaoAberto}
        problemas={problemasExportacao}
        onConfirmar={confirmarExportacaoComProblemas}
      />
    </div>
  )
}
```

- [ ] **Step 6: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros em qualquer arquivo tocado por este plano (Tasks 1-3). `gruposCalculados[].itens_calculados` (tipo `ItemCalculado[]`) já contém todos os campos exigidos por `ItemParaValidarExportacao` (`id`, `numero`, `descricao`, `unidade_id`, `custo_unit_material`, `custo_unit_mao_obra`, `quantidade`, `lucro`) sem necessidade de cast.

- [ ] **Step 7: Commit**

```bash
git add components/orcamento/EditorOrcamento.tsx
git commit -m "feat: valida orcamento e pede confirmacao antes de exportar com problemas"
```

---

### Task 4: Verificação final

**Files:** nenhum (só validação).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos os testes passam, incluindo os 13 novos de `lib/orcamento/validacao-exportacao.test.ts`, sem nenhuma regressão nos testes já existentes.

- [ ] **Step 2: Rodar o typecheck geral**

Run: `npx tsc --noEmit`
Expected: nenhum erro em nenhum arquivo do projeto (fora do ruído pré-existente de globals do Vitest em arquivos `.test.ts(x)`, já confirmado não-relacionado a este ou ao plano anterior).

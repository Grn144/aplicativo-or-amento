# Banco de Composições — Fase B3 (Import/Export Excel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar a biblioteca de composições (respeitando os filtros atuais) para uma planilha `.xlsx` de duas abas, e importar essa mesma planilha criando composições novas — nunca atualizando as existentes.

**Architecture:** A lógica de criação já existente em `POST /api/composicoes` é extraída para `lib/composicoes/criar.ts` (`criarComposicao`), reaproveitada tanto pelo POST quanto pelo import em lote — mesmo padrão de extração já usado em `lib/composicoes/atualizar.ts` na B2. O parsing da planilha é lógica pura isolada em `lib/composicoes/parse-excel.ts` (testável sem Supabase). A montagem do `.xlsx` de export é lógica pura isolada em `lib/excel/export-composicoes.ts` (mesmo padrão de `lib/excel/export-comercial.ts`). As rotas `GET /api/composicoes/export` e `POST /api/composicoes/import` só orquestram: parseiam/consultam o Supabase e chamam essas funções puras. Resolução de disciplina/unidade por nome (criando se não existir) segue o mesmo padrão já usado em `lib/excel/importar-obra.ts`.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres), exceljs, Tailwind + shadcn/ui, lucide-react, Vitest.

## Global Constraints

- Import **nunca** atualiza uma composição existente. Se o código da planilha já existe no banco, é erro só naquela linha — a composição existente não é tocada.
- Dois códigos repetidos dentro da mesma planilha (dentro da aba "Composições") são erro em **ambas** as ocorrências — nenhuma delas é criada.
- Cabeçalhos de coluna das duas abas são definidos no Task 3 (export) e **devem** ser lidos com o texto exato (case-insensitive) pelo parser do Task 2 — os dois lados precisam concordar nesse contrato de texto.
- Toda composição criada pelo import usa exatamente o mesmo caminho de criação do cadastro manual (`criarComposicao`, Task 1): `versao: 1`, snapshot inicial gravado em `composicao_versoes`, `responsavel_id` = usuário autenticado que importou.
- Disciplina/unidade citadas por nome/sigla que não existem no cadastro são criadas automaticamente (mesmo padrão do import de orçamento em `lib/excel/importar-obra.ts`).
- Import é parcial: composições válidas são criadas mesmo que outras da mesma planilha tenham erro. A resposta é sempre `{ criadas: number, erros: { linha: number, codigo: string | null, motivo: string }[] }`.
- Export não pagina — inclui todas as composições ativas que passam pelos filtros (`busca`, `disciplina_id`, `tag`, `favoritos`) recebidos na query string, mesmos filtros e mesma lógica de aplicação que `GET /api/composicoes` já usa.
- Nenhuma rota de API desta fase tem teste automatizado (padrão já estabelecido no projeto — nenhuma rota de `/api` tem teste dedicado). Só a lógica pura (`lib/composicoes/parse-excel.ts`, `lib/excel/export-composicoes.ts`) tem testes.

---

### Task 1: Extrair `criarComposicao` e refatorar o POST existente

**Files:**
- Create: `lib/composicoes/criar.ts`
- Modify: `app/api/composicoes/route.ts:5-6` (imports) e `app/api/composicoes/route.ts:111-189` (função `POST`)

**Interfaces:**
- Consumes: `calcularCustoDireto` (`lib/composicoes/calculos.ts`), `normalizarMateriais`/`normalizarMaoObra`/`MaterialBody`/`MaoObraBody` (`lib/composicoes/normalizar.ts`) — todas já existentes.
- Produces: `criarComposicao(supabase, usuarioId, dados: DadosNovaComposicao): Promise<ResultadoCriacao>` e o tipo `DadosNovaComposicao` — usados pela Task 5 (import).

- [ ] **Step 1: Criar `lib/composicoes/criar.ts`**

```typescript
// lib/composicoes/criar.ts
import { createClient } from '@/lib/supabase/server'
import { calcularCustoDireto } from './calculos'
import { normalizarMateriais, normalizarMaoObra, type MaterialBody, type MaoObraBody } from './normalizar'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface DadosNovaComposicao {
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  materiais: MaterialBody[]
  mao_obra: MaoObraBody[]
}

export interface ResultadoCriacao {
  status: number
  body: Record<string, unknown>
}

/** Cria uma composição nova: valida campos obrigatórios, calcula o custo
 * direto, insere a composição + materiais/mão de obra, e grava o snapshot da
 * versão 1. Reaproveitada por POST /api/composicoes (corpo vem da
 * requisição) e pelo import de planilha (corpo vem de uma linha parseada do
 * Excel, Task 5). */
export async function criarComposicao(
  supabase: SupabaseClient,
  usuarioId: string,
  dados: DadosNovaComposicao
): Promise<ResultadoCriacao> {
  if (!dados.codigo.trim() || !dados.nome.trim() || !dados.descricao_tecnica.trim()) {
    return { status: 400, body: { error: 'Código, nome e descrição técnica são obrigatórios' } }
  }
  if (dados.materiais.length === 0 && dados.mao_obra.length === 0) {
    return {
      status: 400,
      body: { error: 'A composição precisa ter ao menos um material ou item de mão de obra' },
    }
  }

  const custo_direto = calcularCustoDireto(
    dados.materiais.map(m => ({ quantidade: m.quantidade ?? 0, preco_unitario: m.preco_unitario ?? 0 })),
    dados.mao_obra.map(m => ({ horas: m.horas ?? 0, custo_hora: m.custo_hora ?? 0 }))
  )

  const { data: composicao, error: erroComposicao } = await supabase
    .from('composicoes')
    .insert({
      codigo: dados.codigo.trim(),
      nome: dados.nome.trim(),
      disciplina_id: dados.disciplina_id || null,
      descricao_tecnica: dados.descricao_tecnica.trim(),
      unidade_id: dados.unidade_id || null,
      produtividade: dados.produtividade?.trim() || null,
      custo_direto,
      markup_sugerido: dados.markup_sugerido ?? 1,
      observacoes: dados.observacoes?.trim() || null,
      tags: dados.tags ?? [],
      versao: 1,
      responsavel_id: usuarioId,
    })
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()

  if (erroComposicao) return { status: 500, body: { error: erroComposicao.message } }

  const materiaisParaInserir = normalizarMateriais(dados.materiais).map(m => ({
    ...m,
    composicao_id: composicao.id,
  }))
  const maoObraParaInserir = normalizarMaoObra(dados.mao_obra).map(m => ({
    ...m,
    composicao_id: composicao.id,
  }))

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisParaInserir.length > 0
      ? supabase.from('composicao_materiais').insert(materiaisParaInserir).select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraParaInserir.length > 0
      ? supabase.from('composicao_mao_obra').insert(maoObraParaInserir).select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return { status: 500, body: { error: resMateriais.error.message } }
  if (resMaoObra.error) return { status: 500, body: { error: resMaoObra.error.message } }

  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: composicao.id,
    versao: 1,
    snapshot: { composicao, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  return {
    status: 201,
    body: { ...composicao, composicao_materiais: resMateriais.data, composicao_mao_obra: resMaoObra.data },
  }
}
```

- [ ] **Step 2: Refatorar os imports de `app/api/composicoes/route.ts`**

Substitua as linhas 5-6 (atualmente):

```typescript
import { calcularCustoDireto, composicaoIncompleta } from '@/lib/composicoes/calculos'
import { normalizarMateriais, normalizarMaoObra, type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
```

por:

```typescript
import { composicaoIncompleta } from '@/lib/composicoes/calculos'
import { type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
import { criarComposicao } from '@/lib/composicoes/criar'
```

(`calcularCustoDireto`, `normalizarMateriais` e `normalizarMaoObra` só eram usados dentro do `POST`, que passa a delegar para `criarComposicao`; `composicaoIncompleta` continua em uso pelo `GET`.)

- [ ] **Step 3: Substituir o corpo de `POST` (linhas 111-189)**

Substitua toda a função `POST` (da linha `export async function POST(request: NextRequest) {` até o `}` que a fecha, linha 189) por:

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await lerJson<ComposicaoBody>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  const resultado = await criarComposicao(supabase, user.id, {
    codigo: body.codigo ?? '',
    nome: body.nome ?? '',
    disciplina_id: body.disciplina_id ?? null,
    descricao_tecnica: body.descricao_tecnica ?? '',
    unidade_id: body.unidade_id ?? null,
    produtividade: body.produtividade ?? null,
    markup_sugerido: body.markup_sugerido ?? 1,
    observacoes: body.observacoes ?? null,
    tags: body.tags ?? [],
    materiais: body.materiais ?? [],
    mao_obra: body.mao_obra ?? [],
  })

  return NextResponse.json(resultado.body, { status: resultado.status })
}
```

- [ ] **Step 4: Verificar que o projeto compila e os testes existentes passam**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando (nenhum teste cobre a rota diretamente, mas `lib/composicoes/calculos.test.ts` e `lib/composicoes/normalizar.test.ts` não podem quebrar).

- [ ] **Step 5: Verificação manual de paridade de comportamento**

Confirme lendo o novo `POST` e `criarComposicao` lado a lado que o comportamento é idêntico ao código original: mesmas validações, mesma ordem de operações, mesmo formato de resposta (status 201 com composição + materiais + mão de obra; 400/500 com `{ error }`). Isso é importante porque o formulário de criação manual (`ComposicaoModal`) depende desse contrato inalterado.

- [ ] **Step 6: Commit**

```bash
git add lib/composicoes/criar.ts app/api/composicoes/route.ts
git commit -m "refactor: extrai criacao de composicao para lib/composicoes/criar.ts"
```

---

### Task 2: `lib/composicoes/parse-excel.ts` — parser puro da planilha de import

**Files:**
- Create: `lib/composicoes/parse-excel.ts`
- Create: `lib/composicoes/parse-excel.test.ts`

**Interfaces:**
- Consumes: `Celula` (tipo, de `lib/excel/parse-obra.ts`, já existente). A função `resolverCelula` (também já existente) não é usada aqui — é chamada pela Task 5, que converte as abas do `exceljs` em `Celula[][]` antes de invocar este parser.
- Produces: `parseComposicoesExcel(linhasComposicoes: Celula[][], linhasItens: Celula[][]): ResultadoParseExcel`, e os tipos `ComposicaoImportada`, `ItemImportadoComposicao`, `ErroImportacao`, `ResultadoParseExcel` — usados pela Task 5.
- Os textos de cabeçalho de coluna esperados por este parser (case-insensitive) **devem** ser idênticos aos cabeçalhos que a Task 3 escreve na planilha exportada: aba "Composições" → `Código`, `Nome`, `Disciplina`, `Descrição Técnica`, `Unidade`, `Produtividade`, `Markup Sugerido`, `Observações`, `Tags`; aba "Itens" → `Código Composição`, `Tipo`, `Descrição`, `Quantidade`, `Unidade`, `Fornecedor`, `Valor Unitário`.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `lib/composicoes/parse-excel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseComposicoesExcel } from './parse-excel'

const HEADER_COMPOSICOES = [
  'Código', 'Nome', 'Disciplina', 'Descrição Técnica', 'Unidade',
  'Produtividade', 'Markup Sugerido', 'Observações', 'Tags',
]
const HEADER_ITENS = [
  'Código Composição', 'Tipo', 'Descrição', 'Quantidade', 'Unidade', 'Fornecedor', 'Valor Unitário',
]

describe('parseComposicoesExcel', () => {
  it('parseia uma composição válida com materiais e mão de obra', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Alvenaria de bloco', 'Alvenaria', 'Execução de alvenaria de blocos', 'M2', '8 h/m2', 1.3, 'obs 1', 'estrutura, alvenaria'],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Material', 'Bloco cerâmico', 12, 'UN', 'Fornecedor X', 2.5],
      ['COMP-01', 'Mão de obra', 'Pedreiro', 4, '', '', 35],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.erros).toEqual([])
    expect(resultado.composicoes).toEqual([{
      linha: 2,
      codigo: 'COMP-01',
      nome: 'Alvenaria de bloco',
      disciplina: 'Alvenaria',
      descricao_tecnica: 'Execução de alvenaria de blocos',
      unidade: 'M2',
      produtividade: '8 h/m2',
      markup_sugerido: 1.3,
      observacoes: 'obs 1',
      tags: ['estrutura', 'alvenaria'],
      itens: [
        { tipo: 'material', descricao: 'Bloco cerâmico', quantidade: 12, unidade: 'UN', fornecedor: 'Fornecedor X', valor_unitario: 2.5 },
        { tipo: 'mao_obra', descricao: 'Pedreiro', quantidade: 4, unidade: null, fornecedor: null, valor_unitario: 35 },
      ],
    }])
  })

  it('markup sugerido vazio vira 1 (mesmo default do cadastro manual)', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome', 'Disc', 'Descrição', 'UN', '', '', '', ''],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Material', 'Item', 1, 'UN', '', 10],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)
    expect(resultado.composicoes[0].markup_sugerido).toBe(1)
  })

  it('composição sem nenhum item é erro', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [HEADER_ITENS]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: 'COMP-01', motivo: 'A composição precisa ter ao menos um material ou item de mão de obra' },
    ])
  })

  it('código repetido na mesma planilha é erro em ambas as ocorrências', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome A', 'Disc', 'Descrição A', 'UN', '', 1, '', ''],
      ['COMP-01', 'Nome B', 'Disc', 'Descrição B', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Material', 'Item', 1, 'UN', '', 10],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: 'COMP-01', motivo: 'Código duplicado nesta planilha' },
      { linha: 3, codigo: 'COMP-01', motivo: 'Código duplicado nesta planilha' },
    ])
  })

  it('linha de item com Tipo não reconhecido invalida a composição e reporta erro', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Equipamento', 'Item', 1, 'UN', '', 10],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: 'COMP-01', motivo: 'Tipo não reconhecido: "Equipamento"' },
    ])
  })

  it('código, nome ou descrição técnica ausentes são erro', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['', 'Nome', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
      ['COMP-02', '', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [HEADER_ITENS]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: null, motivo: 'Código é obrigatório' },
      { linha: 3, codigo: 'COMP-02', motivo: 'Nome e descrição técnica são obrigatórios' },
    ])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/composicoes/parse-excel.test.ts`
Expected: FAIL — o módulo `./parse-excel` não existe ainda.

- [ ] **Step 3: Implementar `lib/composicoes/parse-excel.ts`**

```typescript
// lib/composicoes/parse-excel.ts
// Só o tipo Celula é usado aqui — resolverCelula (a função) é chamada pelo
// caller (Task 5) para converter as abas do exceljs em Celula[][] antes de
// invocar este parser.
import type { Celula } from '@/lib/excel/parse-obra'

const COLUNAS_COMPOSICOES = [
  'código', 'nome', 'disciplina', 'descrição técnica', 'unidade',
  'produtividade', 'markup sugerido', 'observações', 'tags',
] as const

const COLUNAS_ITENS = [
  'código composição', 'tipo', 'descrição', 'quantidade', 'unidade', 'fornecedor', 'valor unitário',
] as const

export interface ItemImportadoComposicao {
  tipo: 'material' | 'mao_obra'
  descricao: string
  quantidade: number
  unidade: string | null
  fornecedor: string | null
  valor_unitario: number
}

export interface ComposicaoImportada {
  linha: number
  codigo: string
  nome: string
  disciplina: string | null
  descricao_tecnica: string
  unidade: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  itens: ItemImportadoComposicao[]
}

export interface ErroImportacao {
  linha: number
  codigo: string | null
  motivo: string
}

export interface ResultadoParseExcel {
  composicoes: ComposicaoImportada[]
  erros: ErroImportacao[]
}

function texto(v: Celula): string {
  return String(v ?? '').trim()
}

function numero(v: Celula): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function linhaEmBranco(linha: Celula[] | undefined): boolean {
  return !linha || linha.every(c => c === null || c === undefined || c === '')
}

function indiceColunas(cabecalho: Celula[], colunas: readonly string[]): Map<string, number> {
  const indices = new Map<string, number>()
  cabecalho.forEach((valor, i) => {
    const chave = texto(valor).toLowerCase()
    if (colunas.includes(chave)) indices.set(chave, i)
  })
  return indices
}

/** Parser puro (sem Supabase) da planilha de import de composições: aba
 * "Composições" (1 linha por composição) + aba "Itens" (1 linha por
 * material ou cargo de mão de obra, ligada pela coluna "Código
 * Composição"). Cada linha vem como Celula[][] (linha 0 = cabeçalho),
 * mesmo formato já usado pelo import de orçamento (lib/excel/parse-obra.ts).
 * Nunca resolve disciplina/unidade por nome nem verifica duplicidade contra
 * o banco — isso é responsabilidade do chamador (rota de import, Task 5). */
export function parseComposicoesExcel(
  linhasComposicoes: Celula[][],
  linhasItens: Celula[][]
): ResultadoParseExcel {
  const erros: ErroImportacao[] = []

  const idxComp = indiceColunas(linhasComposicoes[0] ?? [], COLUNAS_COMPOSICOES)
  const idxItens = indiceColunas(linhasItens[0] ?? [], COLUNAS_ITENS)

  const composicoesPorCodigo = new Map<string, ComposicaoImportada>()
  const linhasPorCodigo = new Map<string, number[]>()

  for (let i = 1; i < linhasComposicoes.length; i++) {
    const linha = linhasComposicoes[i]
    if (linhaEmBranco(linha)) continue
    const numeroLinha = i + 1

    const codigo = texto(linha[idxComp.get('código') ?? -1])
    if (!codigo) {
      erros.push({ linha: numeroLinha, codigo: null, motivo: 'Código é obrigatório' })
      continue
    }

    const nome = texto(linha[idxComp.get('nome') ?? -1])
    const descricao_tecnica = texto(linha[idxComp.get('descrição técnica') ?? -1])
    if (!nome || !descricao_tecnica) {
      erros.push({ linha: numeroLinha, codigo, motivo: 'Nome e descrição técnica são obrigatórios' })
      continue
    }

    const disciplina = texto(linha[idxComp.get('disciplina') ?? -1]) || null
    const unidade = texto(linha[idxComp.get('unidade') ?? -1]) || null
    const produtividade = texto(linha[idxComp.get('produtividade') ?? -1]) || null
    const markupCelula = linha[idxComp.get('markup sugerido') ?? -1]
    const markup_sugerido =
      markupCelula === null || markupCelula === undefined || markupCelula === ''
        ? 1
        : numero(markupCelula)
    const observacoes = texto(linha[idxComp.get('observações') ?? -1]) || null
    const tagsTexto = texto(linha[idxComp.get('tags') ?? -1])
    const tags = tagsTexto ? tagsTexto.split(',').map(t => t.trim()).filter(Boolean) : []

    const entrada: ComposicaoImportada = {
      linha: numeroLinha, codigo, nome, disciplina, descricao_tecnica, unidade,
      produtividade, markup_sugerido, observacoes, tags, itens: [],
    }
    composicoesPorCodigo.set(codigo, entrada)
    const linhasDoCodigo = linhasPorCodigo.get(codigo) ?? []
    linhasDoCodigo.push(numeroLinha)
    linhasPorCodigo.set(codigo, linhasDoCodigo)
  }

  // Código repetido dentro da própria planilha: ambíguo qual das duas
  // "ganharia" o código — rejeita todas as ocorrências.
  for (const [codigo, linhasDoCodigo] of linhasPorCodigo) {
    if (linhasDoCodigo.length > 1) {
      composicoesPorCodigo.delete(codigo)
      for (const numeroLinha of linhasDoCodigo) {
        erros.push({ linha: numeroLinha, codigo, motivo: 'Código duplicado nesta planilha' })
      }
    }
  }

  const codigosInvalidos = new Set<string>()

  for (let i = 1; i < linhasItens.length; i++) {
    const linha = linhasItens[i]
    if (linhaEmBranco(linha)) continue
    const numeroLinha = i + 1

    const codigo = texto(linha[idxItens.get('código composição') ?? -1])
    const composicao = composicoesPorCodigo.get(codigo)
    if (!composicao) {
      erros.push({ linha: numeroLinha, codigo: codigo || null, motivo: 'Código de composição não encontrado na aba Composições' })
      continue
    }

    const tipoOriginal = texto(linha[idxItens.get('tipo') ?? -1])
    const tipoNormalizado = tipoOriginal.toLowerCase()
    let tipo: 'material' | 'mao_obra'
    if (tipoNormalizado === 'material') {
      tipo = 'material'
    } else if (tipoNormalizado === 'mão de obra' || tipoNormalizado === 'mao de obra') {
      tipo = 'mao_obra'
    } else {
      erros.push({ linha: numeroLinha, codigo, motivo: `Tipo não reconhecido: "${tipoOriginal}"` })
      codigosInvalidos.add(codigo)
      continue
    }

    composicao.itens.push({
      tipo,
      descricao: texto(linha[idxItens.get('descrição') ?? -1]),
      quantidade: numero(linha[idxItens.get('quantidade') ?? -1]),
      unidade: texto(linha[idxItens.get('unidade') ?? -1]) || null,
      fornecedor: texto(linha[idxItens.get('fornecedor') ?? -1]) || null,
      valor_unitario: numero(linha[idxItens.get('valor unitário') ?? -1]),
    })
  }

  for (const codigo of codigosInvalidos) composicoesPorCodigo.delete(codigo)

  const composicoes: ComposicaoImportada[] = []
  for (const composicao of composicoesPorCodigo.values()) {
    if (composicao.itens.length === 0) {
      erros.push({
        linha: composicao.linha,
        codigo: composicao.codigo,
        motivo: 'A composição precisa ter ao menos um material ou item de mão de obra',
      })
      continue
    }
    composicoes.push(composicao)
  }

  return { composicoes, erros: erros.sort((a, b) => a.linha - b.linha) }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/composicoes/parse-excel.test.ts`
Expected: PASS (todos os 6 testes).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add lib/composicoes/parse-excel.ts lib/composicoes/parse-excel.test.ts
git commit -m "feat: parser puro da planilha de import de composicoes"
```

---

### Task 3: `lib/excel/export-composicoes.ts` — monta o `.xlsx` de export

**Files:**
- Create: `lib/excel/export-composicoes.ts`
- Create: `lib/excel/export-composicoes.test.ts`

**Interfaces:**
- Consumes: nada novo (só `exceljs`, já uma dependência do projeto).
- Produces: `montarPlanilhaComposicoes(composicoes: ComposicaoParaExportar[]): ExcelJS.Workbook` e o tipo `ComposicaoParaExportar` — usados pela Task 4 (rota de export).
- Os cabeçalhos de coluna escritos aqui são o contrato lido pelo parser da Task 2 — não altere o texto sem atualizar `lib/composicoes/parse-excel.ts` também.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `lib/excel/export-composicoes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { montarPlanilhaComposicoes, type ComposicaoParaExportar } from './export-composicoes'

const composicoes: ComposicaoParaExportar[] = [{
  codigo: 'COMP-01',
  nome: 'Alvenaria de bloco',
  disciplina_nome: 'Alvenaria',
  descricao_tecnica: 'Execução de alvenaria de blocos',
  unidade_sigla: 'M2',
  produtividade: '8 h/m2',
  markup_sugerido: 1.3,
  observacoes: 'obs 1',
  tags: ['estrutura', 'alvenaria'],
  materiais: [
    { descricao: 'Bloco cerâmico', quantidade: 12, unidade_sigla: 'UN', fornecedor: 'Fornecedor X', preco_unitario: 2.5 },
  ],
  mao_obra: [
    { cargo: 'Pedreiro', horas: 4, custo_hora: 35 },
  ],
}]

describe('montarPlanilhaComposicoes', () => {
  it('cria as duas abas com os nomes esperados', () => {
    const wb = montarPlanilhaComposicoes(composicoes)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Composições', 'Itens'])
  })

  it('aba Composições: cabeçalho e uma linha por composição', () => {
    const wb = montarPlanilhaComposicoes(composicoes)
    const ws = wb.getWorksheet('Composições')!
    expect(ws.getRow(1).values).toEqual([
      undefined, 'Código', 'Nome', 'Disciplina', 'Descrição Técnica', 'Unidade',
      'Produtividade', 'Markup Sugerido', 'Observações', 'Tags',
    ])
    expect(ws.getRow(2).values).toEqual([
      undefined, 'COMP-01', 'Alvenaria de bloco', 'Alvenaria', 'Execução de alvenaria de blocos',
      'M2', '8 h/m2', 1.3, 'obs 1', 'estrutura, alvenaria',
    ])
  })

  it('aba Itens: cabeçalho e uma linha por material/mão de obra', () => {
    const wb = montarPlanilhaComposicoes(composicoes)
    const ws = wb.getWorksheet('Itens')!
    expect(ws.getRow(1).values).toEqual([
      undefined, 'Código Composição', 'Tipo', 'Descrição', 'Quantidade', 'Unidade', 'Fornecedor', 'Valor Unitário',
    ])
    expect(ws.getRow(2).values).toEqual([
      undefined, 'COMP-01', 'Material', 'Bloco cerâmico', 12, 'UN', 'Fornecedor X', 2.5,
    ])
    expect(ws.getRow(3).values).toEqual([
      undefined, 'COMP-01', 'Mão de obra', 'Pedreiro', 4, '', '', 35,
    ])
  })

  it('composição sem disciplina/unidade/produtividade/observações/tags usa vazio', () => {
    const semOpcionais: ComposicaoParaExportar[] = [{
      codigo: 'COMP-02', nome: 'Nome', disciplina_nome: null, descricao_tecnica: 'Descrição',
      unidade_sigla: null, produtividade: null, markup_sugerido: 1, observacoes: null, tags: [],
      materiais: [], mao_obra: [],
    }]
    const wb = montarPlanilhaComposicoes(semOpcionais)
    const ws = wb.getWorksheet('Composições')!
    expect(ws.getRow(2).values).toEqual([
      undefined, 'COMP-02', 'Nome', '', 'Descrição', '', '', 1, '', '',
    ])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/excel/export-composicoes.test.ts`
Expected: FAIL — o módulo `./export-composicoes` não existe ainda.

- [ ] **Step 3: Implementar `lib/excel/export-composicoes.ts`**

```typescript
import ExcelJS from 'exceljs'

// Formato de planilha desenhado do zero para import/export de composições
// (não há template real da empresa para composições, diferente do orçamento).
// Ver docs/superpowers/specs/2026-07-13-banco-composicoes-b3-design.md.
// Os cabeçalhos abaixo são o contrato lido por lib/composicoes/parse-excel.ts.

export interface MaterialParaExportar {
  descricao: string
  quantidade: number
  unidade_sigla: string | null
  fornecedor: string | null
  preco_unitario: number
}

export interface MaoObraParaExportar {
  cargo: string
  horas: number
  custo_hora: number
}

export interface ComposicaoParaExportar {
  codigo: string
  nome: string
  disciplina_nome: string | null
  descricao_tecnica: string
  unidade_sigla: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  materiais: MaterialParaExportar[]
  mao_obra: MaoObraParaExportar[]
}

export function montarPlanilhaComposicoes(composicoes: ComposicaoParaExportar[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Orçamentos'

  const wsComposicoes = wb.addWorksheet('Composições')
  wsComposicoes.columns = [
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Nome', key: 'nome', width: 40 },
    { header: 'Disciplina', key: 'disciplina', width: 20 },
    { header: 'Descrição Técnica', key: 'descricao_tecnica', width: 50 },
    { header: 'Unidade', key: 'unidade', width: 10 },
    { header: 'Produtividade', key: 'produtividade', width: 20 },
    { header: 'Markup Sugerido', key: 'markup', width: 14 },
    { header: 'Observações', key: 'observacoes', width: 30 },
    { header: 'Tags', key: 'tags', width: 24 },
  ]
  for (const c of composicoes) {
    wsComposicoes.addRow({
      codigo: c.codigo,
      nome: c.nome,
      disciplina: c.disciplina_nome ?? '',
      descricao_tecnica: c.descricao_tecnica,
      unidade: c.unidade_sigla ?? '',
      produtividade: c.produtividade ?? '',
      markup: c.markup_sugerido,
      observacoes: c.observacoes ?? '',
      tags: c.tags.join(', '),
    })
  }

  const wsItens = wb.addWorksheet('Itens')
  wsItens.columns = [
    { header: 'Código Composição', key: 'codigo', width: 16 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Quantidade', key: 'quantidade', width: 12 },
    { header: 'Unidade', key: 'unidade', width: 10 },
    { header: 'Fornecedor', key: 'fornecedor', width: 24 },
    { header: 'Valor Unitário', key: 'valor', width: 14 },
  ]
  for (const c of composicoes) {
    for (const m of c.materiais) {
      wsItens.addRow({
        codigo: c.codigo, tipo: 'Material', descricao: m.descricao, quantidade: m.quantidade,
        unidade: m.unidade_sigla ?? '', fornecedor: m.fornecedor ?? '', valor: m.preco_unitario,
      })
    }
    for (const mo of c.mao_obra) {
      wsItens.addRow({
        codigo: c.codigo, tipo: 'Mão de obra', descricao: mo.cargo, quantidade: mo.horas,
        unidade: '', fornecedor: '', valor: mo.custo_hora,
      })
    }
  }

  return wb
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/excel/export-composicoes.test.ts`
Expected: PASS (todos os 4 testes).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add lib/excel/export-composicoes.ts lib/excel/export-composicoes.test.ts
git commit -m "feat: montagem da planilha de export de composicoes (2 abas)"
```

---

### Task 4: `GET /api/composicoes/export`

**Files:**
- Create: `app/api/composicoes/export/route.ts`

**Interfaces:**
- Consumes: `montarPlanilhaComposicoes`/`ComposicaoParaExportar` (Task 3).
- Produces: endpoint `GET /api/composicoes/export?busca=&disciplina_id=&tag=&favoritos=` — usado pela Task 6 (UI).

- [ ] **Step 1: Implementar a rota**

Crie `app/api/composicoes/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { montarPlanilhaComposicoes, type ComposicaoParaExportar } from '@/lib/excel/export-composicoes'

// Mesma lógica de filtros de GET /api/composicoes (busca/disciplina_id/tag/
// favoritos), mas sem paginação/ordenação/merge de favorito-usos-incompleta:
// o export inclui todas as composições ativas que passam pelos filtros.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const disciplinaId = searchParams.get('disciplina_id') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const somenteFavoritos = searchParams.get('favoritos') === 'true'

  function gerarArquivoVazio() {
    return montarPlanilhaComposicoes([])
  }

  let idsFavoritos: string[] = []
  if (somenteFavoritos) {
    const { data: favoritas, error: erroFavoritas } = await supabase
      .from('composicoes_favoritas')
      .select('composicao_id')
      .eq('usuario_id', user.id)
    if (erroFavoritas) return NextResponse.json({ error: erroFavoritas.message }, { status: 500 })
    idsFavoritos = (favoritas ?? []).map(f => f.composicao_id)
  }

  let wb: ReturnType<typeof montarPlanilhaComposicoes>
  if (somenteFavoritos && idsFavoritos.length === 0) {
    wb = gerarArquivoVazio()
  } else {
    let query = supabase
      .from('composicoes')
      .select(`
        codigo, nome, descricao_tecnica, produtividade, markup_sugerido, observacoes, tags,
        disciplinas (nome),
        unidades_medida (sigla),
        composicao_materiais (descricao, quantidade, fornecedor, preco_unitario, unidades_medida (sigla)),
        composicao_mao_obra (cargo, horas, custo_hora)
      `)
      .eq('ativo', true)
      .order('nome')

    if (buscaSanitizada) {
      query = query.or(
        `nome.ilike.%${buscaSanitizada}%,codigo.ilike.%${buscaSanitizada}%,descricao_tecnica.ilike.%${buscaSanitizada}%`
      )
    }
    if (disciplinaId) query = query.eq('disciplina_id', disciplinaId)
    if (tag) query = query.contains('tags', [tag])
    if (somenteFavoritos) query = query.in('id', idsFavoritos)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const composicoes: ComposicaoParaExportar[] = (data ?? []).map(c => ({
      codigo: c.codigo,
      nome: c.nome,
      disciplina_nome: (c.disciplinas as unknown as { nome: string } | null)?.nome ?? null,
      descricao_tecnica: c.descricao_tecnica,
      unidade_sigla: (c.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? null,
      produtividade: c.produtividade,
      markup_sugerido: Number(c.markup_sugerido),
      observacoes: c.observacoes,
      tags: c.tags ?? [],
      materiais: (c.composicao_materiais ?? []).map(m => ({
        descricao: m.descricao,
        quantidade: Number(m.quantidade),
        unidade_sigla: (m.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? null,
        fornecedor: m.fornecedor,
        preco_unitario: Number(m.preco_unitario),
      })),
      mao_obra: (c.composicao_mao_obra ?? []).map(mo => ({
        cargo: mo.cargo,
        horas: Number(mo.horas),
        custo_hora: Number(mo.custo_hora),
      })),
    }))

    wb = montarPlanilhaComposicoes(composicoes)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="composicoes.xlsx"',
    },
  })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual**

Com o servidor rodando (`npm run dev`), autenticado, acesse `http://localhost:3000/api/composicoes/export` no navegador (ou `curl` com cookie de sessão) e confirme que baixa um `.xlsx` com as duas abas e os dados esperados. Repita com `?disciplina_id=<uuid de uma disciplina existente>` e confirme que só as composições dessa disciplina aparecem.

- [ ] **Step 4: Commit**

```bash
git add app/api/composicoes/export/route.ts
git commit -m "feat: rota GET /api/composicoes/export"
```

---

### Task 5: `POST /api/composicoes/import`

**Files:**
- Create: `app/api/composicoes/import/route.ts`

**Interfaces:**
- Consumes: `parseComposicoesExcel`/tipos (Task 2), `criarComposicao`/`DadosNovaComposicao` (Task 1), `resolverCelula`/`Celula` (`lib/excel/parse-obra.ts`, já existente), `MaterialBody`/`MaoObraBody` (`lib/composicoes/normalizar.ts`, já existente).
- Produces: endpoint `POST /api/composicoes/import` (multipart, campo `file`) retornando `{ criadas: number, erros: ErroImportacao[] }` — usado pela Task 6 (UI).

- [ ] **Step 1: Implementar a rota**

Crie `app/api/composicoes/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { resolverCelula, type Celula } from '@/lib/excel/parse-obra'
import { parseComposicoesExcel, type ErroImportacao } from '@/lib/composicoes/parse-excel'
import { criarComposicao } from '@/lib/composicoes/criar'
import type { MaterialBody, MaoObraBody } from '@/lib/composicoes/normalizar'

function linhasDaAba(ws: ExcelJS.Worksheet): Celula[][] {
  const linhas: Celula[][] = []
  ws.eachRow({ includeEmpty: true }, row => {
    const vals = row.values as unknown[]
    linhas.push(vals.slice(1).map(resolverCelula))
  })
  return linhas
}

// Cria composições novas a partir de uma planilha no formato exportado por
// GET /api/composicoes/export. Nunca atualiza composições existentes — um
// código já cadastrado é erro só naquela linha. Import é parcial: linhas
// válidas são criadas mesmo que outras da planilha tenham erro.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
  } catch {
    return NextResponse.json(
      { error: 'Arquivo inválido. Envie uma planilha .xlsx exportada pelo sistema.' },
      { status: 400 }
    )
  }

  const wsComposicoes = wb.getWorksheet('Composições')
  const wsItens = wb.getWorksheet('Itens')
  if (!wsComposicoes || !wsItens) {
    return NextResponse.json(
      { error: 'Planilha inválida. Ela precisa ter as abas "Composições" e "Itens".' },
      { status: 400 }
    )
  }

  const { composicoes, erros: errosParse } = parseComposicoesExcel(
    linhasDaAba(wsComposicoes),
    linhasDaAba(wsItens)
  )

  const erros: ErroImportacao[] = [...errosParse]
  let criadas = 0

  if (composicoes.length > 0) {
    const [{ data: discExistentes }, { data: unidadesExistentes }, { data: codigosExistentesData }] = await Promise.all([
      supabase.from('disciplinas').select('id, nome'),
      supabase.from('unidades_medida').select('id, sigla'),
      supabase.from('composicoes').select('codigo').in('codigo', composicoes.map(c => c.codigo)),
    ])
    const discPorNome = new Map<string, string>()
    for (const d of discExistentes ?? []) discPorNome.set(d.nome.trim().toUpperCase(), d.id)
    const unidadePorSigla = new Map<string, string>()
    for (const u of unidadesExistentes ?? []) unidadePorSigla.set(u.sigla.trim().toUpperCase(), u.id)
    const codigosExistentes = new Set((codigosExistentesData ?? []).map(c => c.codigo))

    async function resolverDisciplina(nome: string | null): Promise<string | null> {
      if (!nome) return null
      const chave = nome.trim().toUpperCase()
      const existente = discPorNome.get(chave)
      if (existente) return existente
      const { data: nova, error } = await supabase.from('disciplinas').insert({ nome: nome.trim() }).select('id').single()
      if (error || !nova) return null
      discPorNome.set(chave, nova.id)
      return nova.id
    }

    async function resolverUnidade(sigla: string | null): Promise<string | null> {
      if (!sigla) return null
      const chave = sigla.trim().toUpperCase()
      const existente = unidadePorSigla.get(chave)
      if (existente) return existente
      const { data: nova, error } = await supabase.from('unidades_medida').insert({ sigla: sigla.trim() }).select('id').single()
      if (error || !nova) return null
      unidadePorSigla.set(chave, nova.id)
      return nova.id
    }

    for (const comp of composicoes) {
      if (codigosExistentes.has(comp.codigo)) {
        erros.push({ linha: comp.linha, codigo: comp.codigo, motivo: 'Já existe uma composição com este código' })
        continue
      }

      const disciplina_id = await resolverDisciplina(comp.disciplina)
      const unidade_id = await resolverUnidade(comp.unidade)

      const materiais: MaterialBody[] = []
      const maoObra: MaoObraBody[] = []
      for (const item of comp.itens) {
        if (item.tipo === 'material') {
          materiais.push({
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade_id: await resolverUnidade(item.unidade),
            fornecedor: item.fornecedor,
            preco_unitario: item.valor_unitario,
          })
        } else {
          maoObra.push({ cargo: item.descricao, horas: item.quantidade, custo_hora: item.valor_unitario })
        }
      }

      const resultado = await criarComposicao(supabase, user.id, {
        codigo: comp.codigo,
        nome: comp.nome,
        disciplina_id,
        descricao_tecnica: comp.descricao_tecnica,
        unidade_id,
        produtividade: comp.produtividade,
        markup_sugerido: comp.markup_sugerido,
        observacoes: comp.observacoes,
        tags: comp.tags,
        materiais,
        mao_obra: maoObra,
      })

      if (resultado.status === 201) {
        criadas++
      } else {
        const motivo = typeof resultado.body.error === 'string' ? resultado.body.error : 'Falha ao criar composição'
        erros.push({ linha: comp.linha, codigo: comp.codigo, motivo })
      }
    }
  }

  return NextResponse.json({ criadas, erros: erros.sort((a, b) => a.linha - b.linha) })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual**

Com o servidor rodando e autenticado: baixe uma planilha via `GET /api/composicoes/export`, edite-a adicionando uma composição nova (código inédito) com ao menos um material, e envie via `curl -F "file=@composicoes.xlsx" http://localhost:3000/api/composicoes/import -b <cookie de sessão>` (ou pela UI, após a Task 6). Confirme:
- a composição nova aparece em `GET /api/composicoes` com `versao: 1`;
- reenviar a mesma planilha sem alterações retorna `criadas: 0` e um erro "Já existe uma composição com este código" para aquele código;
- uma linha com "Tipo" inválido na aba Itens aparece em `erros` e não cria a composição correspondente.

- [ ] **Step 4: Commit**

```bash
git add app/api/composicoes/import/route.ts
git commit -m "feat: rota POST /api/composicoes/import"
```

---

### Task 6: Botões "Exportar" e "Importar planilha" na página de composições

**Files:**
- Modify: `components/composicoes/ComposicoesPageClient.tsx`

**Interfaces:**
- Consumes: `GET /api/composicoes/export` (Task 4), `POST /api/composicoes/import` (Task 5).
- Produces: nada consumido por outra task — é o último elo da cadeia.

- [ ] **Step 1: Adicionar `useRef` ao import de `react` (linha 3)**

Substitua:

```typescript
import { useState, useEffect, useCallback } from 'react'
```

por:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
```

- [ ] **Step 2: Adicionar estado e refs**

Logo após a declaração `const [removendo, setRemovendo] = useState(false)` (dentro do componente `ComposicoesPageClient`), adicione:

```typescript
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{
    criadas: number
    erros: { linha: number; codigo: string | null; motivo: string }[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 3: Adicionar `exportar` e `handleImportFile`**

Logo após a função `carregar` (antes de `useEffect(() => { const timeout = ...`), adicione:

```typescript
  function exportar() {
    setExportando(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    if (disciplinaId) params.set('disciplina_id', disciplinaId)
    if (somenteFavoritos) params.set('favoritos', 'true')
    window.location.href = `/api/composicoes/export?${params.toString()}`
    setExportando(false)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImportando(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/composicoes/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        alert(`Erro ao importar: ${data.error}`)
        return
      }
      setResultadoImportacao(data)
      carregar()
    } finally {
      setImportando(false)
    }
  }
```

- [ ] **Step 4: Atualizar o cabeçalho com os novos botões**

Substitua o bloco (linhas 87-90):

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composições</h1>
        <Button onClick={abrirNovo}>+ Nova composição</Button>
      </div>
```

por:

```tsx
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleImportFile}
      />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composições</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportar} disabled={exportando}>
            ↓ Exportar
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importando}>
            {importando ? 'Importando...' : '↑ Importar planilha'}
          </Button>
          <Button onClick={abrirNovo}>+ Nova composição</Button>
        </div>
      </div>
```

- [ ] **Step 5: Adicionar o modal de resultado da importação**

Logo após o `</Dialog>` que fecha o modal de confirmação de exclusão (o `Dialog` com `open={excluindo !== null}`), antes do `</div>` final que fecha o componente, adicione:

```tsx
      <Dialog open={resultadoImportacao !== null} onOpenChange={aberto => !aberto && setResultadoImportacao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resultado da importação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>
              <strong className="text-foreground">{resultadoImportacao?.criadas ?? 0}</strong> composição(ões) criada(s) com sucesso.
            </p>
            {resultadoImportacao && resultadoImportacao.erros.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-foreground">{resultadoImportacao.erros.length} linha(s) com erro:</p>
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-muted-foreground">
                  {resultadoImportacao.erros.map((erro, i) => (
                    <li key={i}>
                      Linha {erro.linha}{erro.codigo ? ` (${erro.codigo})` : ''}: {erro.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setResultadoImportacao(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Verificação manual no navegador**

Rode `npm run dev`, acesse `/composicoes` autenticado, e confirme:
- clicar em "Exportar" baixa um `.xlsx` com os filtros atuais aplicados;
- clicar em "Importar planilha" abre o seletor de arquivo; selecionar a planilha exportada (com uma linha nova adicionada) mostra o modal de resultado com a contagem de criadas e, se houver, a lista de erros;
- após fechar o modal, a composição nova aparece na tabela sem precisar recarregar a página.

- [ ] **Step 8: Commit**

```bash
git add components/composicoes/ComposicoesPageClient.tsx
git commit -m "feat: botoes de exportar/importar planilha na pagina de composicoes"
```

---

## Critérios de aceite (herdados da spec)

1. Exportar a biblioteca (sem filtro) gera uma planilha com as duas abas, uma linha por composição e uma linha por item.
2. Exportar com um filtro aplicado só inclui as composições que passam nesse filtro.
3. Importar uma planilha com composições novas e válidas cria todas elas, cada uma com versão 1 e snapshot gravado.
4. Importar uma planilha com um código que já existe no banco não altera a composição existente — reporta erro só para aquela linha.
5. Importar uma planilha com composições válidas e inválidas misturadas cria as válidas e lista as inválidas com o motivo.
6. Dois códigos repetidos dentro da mesma planilha são erro em ambas as ocorrências.
7. Disciplina ou unidade citada na planilha que não existe no cadastro é criada automaticamente.
8. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.

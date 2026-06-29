# Design — Sistema de Orçamento de Obras

**Data:** 2026-06-29  
**Status:** Aprovado para implementação

---

## 1. Contexto

Sistema web para substituir planilhas Excel no processo de orçamento de obras de engenharia. A empresa orça obras para clientes corporativos (ex: Unilever, Ford). Cada obra tem grupos/disciplinas (PRÉ-OBRA, CIVIL, PISO, etc.) e itens com custo de mão de obra + material. O sistema precisa manter duas visões dos mesmos dados: **técnica** (custo real + margem, uso interno) e **comercial** (preço de venda, vai ao cliente).

---

## 2. Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend + Backend | Next.js 15 (App Router) + TypeScript | Um repositório, um deploy, SSR integrado |
| Banco de dados | PostgreSQL via Supabase | Auth + banco + RLS gerenciados |
| Hospedagem | Vercel | Deploy automático via git push |
| UI | Tailwind CSS + shadcn/ui | Componentes de tabela densa prontos |
| Excel | exceljs | Import e export com controle total de estilos |

---

## 3. Arquitetura

```
Browser
  → Next.js Middleware (verifica JWT Supabase)
  → App Router (páginas protegidas)
  → Route Handlers em app/api/ (lógica de negócio)
  → Supabase (PostgreSQL + Auth + RLS)
       ↕
  exceljs (import/export — roda nos Route Handlers)
```

Toda lógica de cálculo (custo → preço de venda → margem → lucro) fica em `lib/calculos.ts`, nunca duplicada entre front e back. Preço de venda **nunca é gravado** — sempre calculado em tempo real a partir de custo + margem do item.

### Estrutura de pastas

```
aplicativo-orcamento/
├── app/
│   ├── (auth)/
│   │   ├── login/           # email + senha
│   │   └── verificar/       # código MFA por email
│   ├── (app)/               # rotas protegidas pelo middleware
│   │   ├── obras/
│   │   │   ├── page.tsx     # lista de obras
│   │   │   └── [id]/
│   │   │       └── page.tsx # edição de orçamento
│   │   ├── dashboard/       # rentabilidade
│   │   └── admin/           # disciplinas, unidades, usuários
│   └── api/
│       ├── obras/           # CRUD obras/grupos/itens
│       ├── import/          # recebe .xlsx → popula banco
│       └── export/          # gera .xlsx técnico ou comercial
├── components/
│   ├── orcamento/           # tabela editável, toggle visão
│   └── ui/                  # componentes shadcn
├── lib/
│   ├── supabase/            # cliente server e browser
│   ├── excel/
│   │   ├── import.ts        # parser de planilha → dados do banco
│   │   └── export.ts        # dados do banco → planilha fiel ao template
│   └── calculos.ts          # todas as fórmulas derivadas
├── supabase/
│   └── migrations/          # SQL versionado
└── types/                   # TypeScript compartilhado
```

---

## 4. Banco de dados

### Schema

```sql
-- Clientes
clientes (
  id            uuid PK,
  razao_social  text NOT NULL,
  cnpj          text,
  endereco      text,
  criado_em     timestamptz DEFAULT now()
)

-- Usuários (espelha auth.users do Supabase)
usuarios (
  id         uuid PK REFERENCES auth.users,
  nome       text NOT NULL,
  email      text NOT NULL UNIQUE,
  papel      text NOT NULL CHECK (papel IN ('admin','engenheiro','orcamentista','visualizador')),
  ativo      boolean DEFAULT true,
  criado_em  timestamptz DEFAULT now()
)

-- Disciplinas (cadastro aberto)
disciplinas (
  id    uuid PK,
  nome  text NOT NULL UNIQUE,
  ativo boolean DEFAULT true
)

-- Unidades de medida (cadastro aberto)
unidades_medida (
  id      uuid PK,
  sigla   text NOT NULL UNIQUE,  -- M2, M, UNID, VB, PTOS
  descricao text
)

-- Obras
obras (
  id              uuid PK,
  cliente_id      uuid FK → clientes,
  codigo          text NOT NULL,          -- ex: "08114"
  nome            text NOT NULL,          -- ex: "UNILEVER - WT"
  data_orcamento  date,
  status          text NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','enviado','aprovado',
                                    'em_execucao','concluido','cancelado')),
  criado_por      uuid FK → usuarios,
  criado_em       timestamptz DEFAULT now(),
  atualizado_em   timestamptz DEFAULT now()
)

-- Grupos dentro de um orçamento (blocos A, B, C...)
grupos_orcamento (
  id            uuid PK,
  obra_id       uuid FK → obras ON DELETE CASCADE,
  disciplina_id uuid FK → disciplinas,
  letra         text NOT NULL,    -- A, B, C...
  ordem         integer NOT NULL
)

-- Itens de cada grupo
itens_orcamento (
  id                   uuid PK,
  grupo_id             uuid FK → grupos_orcamento ON DELETE CASCADE,
  numero               integer NOT NULL,          -- sequencial dentro do grupo
  descricao            text NOT NULL,
  local                text,                      -- "3º ANDAR - AUDITÓRIO"
  unidade_id           uuid FK → unidades_medida,
  quantidade           numeric(15,4) NOT NULL DEFAULT 0,
  custo_unit_mao_obra  numeric(15,4) NOT NULL DEFAULT 0,
  custo_unit_material  numeric(15,4) NOT NULL DEFAULT 0,
  margem_mao_obra_pct  numeric(8,4) NOT NULL DEFAULT 0,  -- % de margem
  margem_material_pct  numeric(8,4) NOT NULL DEFAULT 0,
  observacao           text,   -- OBS. coluna 1
  observacao_2         text,   -- OBS. coluna 2
  ordem                integer NOT NULL
)

-- Histórico de alterações
historico_alteracoes (
  id             uuid PK,
  obra_id        uuid FK → obras,
  usuario_id     uuid FK → usuarios,
  campo          text NOT NULL,
  valor_anterior text,
  valor_novo     text,
  alterado_em    timestamptz DEFAULT now()
)
```

### Campos calculados (nunca gravados, sempre derivados)

```
subtotal_mao_obra_custo   = custo_unit_mao_obra × quantidade
subtotal_material_custo   = custo_unit_material × quantidade
total_custo_item          = subtotal_mao_obra_custo + subtotal_material_custo

preco_unit_mao_obra_venda = custo_unit_mao_obra × (1 + margem_mao_obra_pct / 100)
preco_unit_material_venda = custo_unit_material × (1 + margem_material_pct / 100)
subtotal_mao_obra_venda   = preco_unit_mao_obra_venda × quantidade
subtotal_material_venda   = preco_unit_material_venda × quantidade
total_venda_item          = subtotal_mao_obra_venda + subtotal_material_venda

lucro_item                = total_venda_item - total_custo_item
margem_efetiva_pct        = lucro_item / total_venda_item × 100
```

Totais de grupo e totais gerais = soma dos itens na visão correspondente.

---

## 5. Import Excel

### Formato de entrada (baseado nos templates reais analisados)

O arquivo importado tem 14 colunas ativas (A–N) + coluna O (espaçador 5px):

| Col | Header | Campo no banco |
|---|---|---|
| A | ITEM | `grupos_orcamento.letra` |
| B | Nº | `itens_orcamento.numero` |
| C | DESCRIÇÃO | `itens_orcamento.descricao` / nome do grupo |
| D | DISCIPLINA | `disciplinas.nome` |
| E | LOCAL | `itens_orcamento.local` |
| F | UN. | `unidades_medida.sigla` |
| G | QT. | `itens_orcamento.quantidade` |
| H | M. OBRA (preço unit.) | `itens_orcamento.custo_unit_mao_obra` |
| I | MATERIAL (preço unit.) | `itens_orcamento.custo_unit_material` |
| J | M. OBRA (sub total) | ignorado (recalculado) |
| K | MATERIAL (sub total) | ignorado (recalculado) |
| L | TOTAL | ignorado (recalculado) |
| M | OBS. | `itens_orcamento.observacao` |
| N | OBS. | `itens_orcamento.observacao_2` |

### Lógica de parsing

- **Linhas 1–8**: cabeçalho — extrair C2 (cliente), C3 (endereço), C4 (CNPJ), C5 (código + nome da obra), L1 (data serial Excel)
- **Linha de grupo**: `row[0] === row[1]` e é uma letra (A–Z) → cria `grupos_orcamento`
- **Linha de item**: `row[0]` é letra e `row[1]` é número → cria `itens_orcamento`
- **Margens**: todas importadas como 0% — usuário ajusta depois
- **Disciplinas/unidades** novas criadas automaticamente no cadastro se não existirem

---

## 6. Export Excel

### Especificação exata do template (medido dos arquivos reais)

**Larguras de coluna (pixel):**
A=58, B=44, C=724, D=116, E=136, F=51, G=48, H=92, I=100, J=92, K=100, L=81, M=116, N=307, O=5

**Células mescladas:** H7:I7, J7:K7

**Formatos numéricos:**
- Monetário (H–L): `_-* #,##0.00_-;\-* #,##0.00_-;_-* "-"??_-;_-@_-`
- Quantidade (G): `0.00`
- Data (L1): `m/d/yy`

**Estrutura de linhas:**

| Linha | Conteúdo |
|---|---|
| 1 | C1 = "DESCRITIVO TÉCNICO E COMERCIAL", L1 = data do orçamento |
| 2 | C2 = razão social do cliente |
| 3 | C3 = "ENDEREÇO: " + endereço |
| 4 | C4 = "CNPJ: " + cnpj |
| 5 | C5 = código + " " + nome da obra |
| 6 | J6 = total M.Obra, K6 = total Material, L6 = Total Geral |
| 7 | H7 = "PREÇOS UNITÁRIOS" (merged H7:I7), J7 = "SUB TOTAL" (merged J7:K7), L7 = "TOTAL" |
| 8 | ITEM / Nº / DESCRIÇÃO / DISCIPLINA / LOCAL / UN. / QT. / M. OBRA / MATERIAL / M. OBRA / MATERIAL / TOTAL / OBS. / OBS. |
| 9+ | Linhas de grupo e itens |

**Linha de grupo:** A=letra, B=letra, C=nome disciplina, D–I="-", J=subtotal M.Obra, K=subtotal Material, L=total, M=0, N=0

**Linha de item:** A=letra grupo, B=número, C=descrição, D=disciplina, E=local, F=unidade, G=qtd, H=preço unit. M.Obra, I=preço unit. Material, J=subtotal M.Obra, K=subtotal Material, L=total, M=obs1, N=obs2

### Diferença entre os dois exports

**Export Comercial** (vai ao cliente):
- H/I = preços de **venda** (custo × (1 + margem%))
- J/K/L = subtotais e total usando preços de venda
- Colunas A–N apenas — sem informação de custo ou margem

**Export Técnico** (uso interno):
- H/I = preços de **custo**
- J/K/L = subtotais e total usando preços de custo
- Colunas extras após N: margem_mao_obra%, margem_material%, preço_venda_unit_mao_obra, preço_venda_unit_material, lucro_item, margem_efetiva%

---

## 7. Autenticação e Permissões

**Supabase Auth** com MFA por email (OTP de 6 dígitos, fluxo nativo do Supabase).

**Fluxo de login:**
1. Usuário entra com email + senha → Supabase valida
2. Supabase envia código OTP de 6 dígitos para o email do usuário
3. Tela de verificação pede o código
4. Código validado → JWT emitido com claim `papel`
5. Next.js Middleware verifica JWT em cada requisição

**Papéis e permissões:**

| Ação | admin | engenheiro/orçamentista | visualizador |
|---|---|---|---|
| Listar obras | ✅ | ✅ | ✅ |
| Criar/editar obra | ✅ | ✅ | ❌ |
| Ver visão técnica (custos + margens) | ✅ | ✅ | ✅ |
| Ver visão comercial | ✅ | ✅ | ✅ |
| Exportar Excel técnico | ✅ | ✅ | ❌ |
| Exportar Excel comercial | ✅ | ✅ | ✅ |
| Importar planilha | ✅ | ✅ | ❌ |
| Dashboard rentabilidade | ✅ | ✅ | ✅ |
| Cadastros auxiliares | ✅ | ✅ | ❌ |
| Gestão de usuários | ✅ | ❌ | ❌ |

Row Level Security (RLS) no Supabase enforça as permissões diretamente no banco — proteção independente do frontend.

---

## 8. Telas (MVP)

### 8.1 Login (`/login`)
- Campos: email, senha
- Link "esqueci minha senha" (Supabase reset por email)

### 8.2 Verificação MFA (`/verificar`)
- Campo para o código OTP de 6 dígitos
- Botão reenviar código

### 8.3 Lista de obras (`/obras`)
- Tabela: código, nome, cliente, status, data, total geral
- Busca por texto (cliente/código/nome)
- Filtro por status
- Botão "Nova obra" (abre modal de criação)
- Botão "Importar planilha" (upload de .xlsx)

### 8.4 Edição de orçamento (`/obras/[id]`)
- Cabeçalho editável: cliente, endereço, código, nome, data, status
- Toggle **Visão Técnica** ↔ **Visão Comercial** no topo
- Tabela de grupos/itens com edição inline (duplo clique)
- Totais de grupo e totais gerais atualizando em tempo real
- Botões: Adicionar grupo, Adicionar item, Remover grupo, Remover item
- Botões de export: "Baixar Excel Comercial", "Baixar Excel Técnico"
- Histórico de alterações (painel lateral retrátil)

**Visão Técnica mostra:** custo unit. M.Obra, custo unit. Material, subtotal custo, margem%, preço venda, lucro, margem efetiva%

**Visão Comercial mostra:** descrição, local, unidade, qtd, preço unit. venda M.Obra, preço unit. venda Material, subtotal M.Obra, subtotal Material, total venda

### 8.5 Dashboard (`/dashboard`)
- Tabela de obras: código, cliente, total custo, total venda, lucro, margem efetiva%
- Ordenável por qualquer coluna
- Gráfico de barras: comparação de margem por obra

### 8.6 Admin (`/admin`)
- Sub-páginas: Disciplinas, Unidades de medida, Usuários
- CRUD em tabela simples para cada

---

## 9. Regras de negócio

1. Preço de venda **nunca é gravado** — sempre calculado de custo + margem
2. Margem é **editável por item** (pode ter valor padrão por disciplina, sobrescrito linha a linha)
3. Ao **duplicar obra**: copia toda estrutura de grupos/itens com os custos e margens, permite editar livremente
4. **Import**: preços tratados como custo, margem = 0% — usuário ajusta após import
5. **Export comercial**: idêntico ao template fornecido, com preços de venda nas colunas H/I
6. **Export técnico**: mesmo layout base + colunas extras de rentabilidade
7. **Histórico**: toda alteração em `itens_orcamento` grava campo, valor anterior, valor novo, usuário e timestamp

---

## 10. Dados iniciais (seed)

**Disciplinas:** SERVIÇOS TÉCNICOS, PRÉ-OBRA, CIVIL, PISO, FORRO, ILUMINAÇÃO, ELÉTRICA, AC, PINTURA, SPK, DETECÇÃO, INFRAESTRUTURA, MOBILIÁRIO, LIMPEZA, DRYWALL, HIDRÁULICA

**Unidades:** M, M2, UNID, VB, PTOS

Ambas as listas são abertas — usuário pode criar novas via admin.

# Design — Modelo de Orçamento da Empresa (FEE + Markup + Rentabilidade)

**Data:** 2026-07-06
**Status:** Aprovado para implementação
**Referência:** planilha real `08092.01 magalu - deposito.xlsx`

---

## 1. Contexto

O editor de orçamento atual usa o modelo **custo + margem %** (`venda = custo × (1 + margem/100)`). O processo real da empresa, comprovado pela planilha de referência, usa um modelo diferente: **custo → FEE → markup → venda**, com um bloco de rentabilidade (comissão, imposto, líquido). Este design substitui o modelo antigo pelo modelo real, mantendo a nomenclatura idêntica à da planilha. Decisão do usuário: **começar do zero** — obras antigas (de teste) recebem markup padrão; não há migração de dados de margem.

---

## 2. Modelo de cálculo (fonte única: `lib/calculos.ts`)

### Fatores da obra (editáveis por orçamento, com padrão)
- `fee_fator` — padrão **1.02**
- `comissao_pct` — padrão **12**
- `imposto_pct` — padrão **30**

### Entradas por item
`quantidade`, `custo_unit_mao_obra`, `custo_unit_material`, `markup_mao_obra`, `markup_material` (multiplicadores, padrão **1.0**).

### Fórmulas por item (dado `fee_fator` da obra)
```
fee_unit_mao_obra          = custo_unit_mao_obra × fee_fator
fee_unit_material          = custo_unit_material × fee_fator
preco_venda_unit_mao_obra  = fee_unit_mao_obra × markup_mao_obra
preco_venda_unit_material  = fee_unit_material × markup_material

subtotal_mao_obra_custo    = custo_unit_mao_obra × quantidade
subtotal_material_custo    = custo_unit_material × quantidade
total_custo                = subtotal_mao_obra_custo + subtotal_material_custo

subtotal_mao_obra_venda    = preco_venda_unit_mao_obra × quantidade
subtotal_material_venda    = preco_venda_unit_material × quantidade
total_venda                = subtotal_mao_obra_venda + subtotal_material_venda

lucro                      = total_venda − total_custo
```

### Rentabilidade da obra (novo `calcularRentabilidade`)
```
faturamento   = Σ total_venda dos itens
custo_total   = Σ total_custo dos itens
comissao      = faturamento × comissao_pct / 100
imposto       = (faturamento − comissao) × imposto_pct / 100
custo_com_fee = custo_total × fee_fator
liquido       = faturamento − comissao − imposto − custo_com_fee
liquido_pct   = faturamento > 0 ? liquido / faturamento × 100 : null
```

### Verificação contra a planilha (casos de teste)
- Item custo MO=200, MAT=100, markup MO=2.5, MAT=2.0, QT=1, fee=1.02 → $ MO=510, $ MAT=204, total_venda=714, total_custo=300.
- Item custo MO=25, MAT=18, QT=87, markup MO=1.65, MAT=1.45 → $ MO=42.075, $ MAT=26.622.
- Obra `08092.01`: faturamento ≈ 77 124,55; líquido% ≈ 12,49%.

---

## 3. Banco de dados (migration `005_modelo_markup.sql`)

```sql
-- obras: fatores por orçamento
ALTER TABLE obras
  ADD COLUMN fee_fator     numeric(8,4)  NOT NULL DEFAULT 1.02,
  ADD COLUMN comissao_pct  numeric(8,4)  NOT NULL DEFAULT 12,
  ADD COLUMN imposto_pct   numeric(8,4)  NOT NULL DEFAULT 30;

-- itens: markup substitui margem
ALTER TABLE itens_orcamento
  ADD COLUMN markup_mao_obra numeric(8,4) NOT NULL DEFAULT 1,
  ADD COLUMN markup_material numeric(8,4) NOT NULL DEFAULT 1;

ALTER TABLE itens_orcamento
  DROP COLUMN margem_mao_obra_pct,
  DROP COLUMN margem_material_pct;
```

RLS já cobre estas tabelas (colunas novas herdam as políticas existentes). Nenhuma policy nova é necessária.

---

## 4. Tipos (`types/database.ts`, `types/orcamento.ts`)

- `Obra` ganha `fee_fator`, `comissao_pct`, `imposto_pct`.
- `ItemOrcamento`: remove `margem_*_pct`; adiciona `markup_mao_obra`, `markup_material`.
- `ItemCalculado` ganha `fee_unit_mao_obra`, `fee_unit_material` (os demais campos derivados permanecem).
- Novo `Rentabilidade { faturamento; custo_total; comissao; imposto; custo_com_fee; liquido; liquido_pct }`.
- `calcularItem` passa a receber o `fee_fator` (assinatura `calcularItem(item, feeFator)`), pois o FEE depende da obra.

---

## 5. Editor (tela)

### 5.1 Cabeçalho (`CabecalhoObra`)
Campos existentes (cliente, código, nome, data, status) **mais** três campos editáveis: **FEE**, **Comissão %**, **Imposto %**. Ao lado, painel **Resumo de Rentabilidade** (somente leitura, tempo real): Faturamento, Comissão, Imposto, Custo, **Líquido**, **Líquido %**.

### 5.2 Tabela de itens (`TabelaOrcamento`, visão técnica)
Colunas com a nomenclatura da planilha. **Editáveis** (duplo clique / digitação): DESCRIÇÃO, DISCIPLINA, LOCAL, UN., QT., **M. OBRA** (custo unit.), **MAT** (custo unit.), **Markup M.Obra**, **Markup Mat.**, OBS. **Calculadas:** **FEE M.OBRA**, **$ M.OBRA**, **FEE MAT**, **$ MAT**, **SUB TOTAL** M.Obra/Mat (custo e venda) e **TOTAL**. Linha de disciplina soma os itens; rodapé com **TOTAL GERAL** (custo e venda).

A visão comercial mostra apenas descrição/local/un/qt e os preços/subtotais/total de **venda** (sem custo, FEE ou markup).

---

## 6. Export / Import

### 6.1 Export Técnico (`export/route.ts`, reescrito)
Sai **idêntico ao layout da planilha**: cabeçalho (cliente, endereço, CNPJ, código/nome, data), os dois blocos de colunas (custo/FEE e venda) com os nomes exatos (M. OBRA, MAT, SUB TOTAL, TOTAL, FEE M.OBRA, $ M.OBRA, FEE MAT, $ MAT), linhas de disciplina, linhas de item com todas as colunas, e o bloco de resumo (comissão, imposto, custo, líquido, líquido%).

### 6.2 Export Comercial
Mantém apenas preços de venda (sem custo/FEE/markup) — para o cliente.

### 6.3 Import / criar obra a partir de planilha (`lib/excel/parse-obra.ts` atualizado)
O parser passa a ler o formato real:
- Custo M.Obra (coluna "M. OBRA" do primeiro bloco), Custo Material (coluna "MAT").
- **Markup derivado dos valores calculados:** `markup_mao_obra = valor($ M.OBRA) ÷ valor(FEE M.OBRA)`; `markup_material = valor($ MAT) ÷ valor(FEE MAT)`. Quando o FEE é 0 ou ausente, markup = 1.
- Cabeçalho: código e nome de C5 (`08092.01 MAGALU - DEPOSITO`), cliente de C2, endereço de C3, CNPJ de C4.
- Rotas: `POST /api/obras/import` (cria obra + conteúdo) e `POST /api/obras/[id]/import` (só conteúdo) reutilizam o helper `inserirConteudoObra`. Botão "Importar Planilha" na tela de Obras (ao lado de "Nova obra") e no editor (ao lado dos Exportar).

---

## 7. Impacto em telas existentes

- **Dashboard** (`lib/dashboard/metricas.ts`): usa `calcularItem` para `total_venda`/`total_custo`. Precisa passar `fee_fator` da obra ao `calcularItem`. Os KPIs de valor continuam válidos.
- **Lista de obras** (`app/(app)/obras/page.tsx`): idem, o cálculo de total de venda por obra passa a usar `fee_fator`.

---

## 8. Testes (Vitest)

- `calculos.test.ts` reescrito: casos da planilha (item 200/100 markup 2,5/2,0 → 714; item 25/18 → 42,075/26,622); rentabilidade (comissão, imposto sobre (fat−comissão), líquido, líquido% null quando faturamento 0).
- `parse-obra.test.ts`: derivação de markup a partir de $ e FEE; cabeçalho no formato real (C2..C5); linhas de disciplina vs item; total geral ignorado.
- Componentes: célula de markup edita e salva; resumo de rentabilidade renderiza os valores.

---

## 9. Critérios de aceite

1. Um item com os mesmos dados da planilha produz os mesmos $ unit., subtotais e total.
2. O resumo de rentabilidade da obra bate com o bloco do topo da planilha (líquido% ≈ 12,49% no caso `08092.01`).
3. A tela do editor usa a nomenclatura da planilha (M. OBRA, MAT, FEE, $ , SUB TOTAL, TOTAL, DISCIPLINA, LOCAL, UN., QT., OBS.).
4. FEE, comissão e imposto são editáveis por obra e afetam o resumo em tempo real.
5. Exportar Técnico gera Excel com o layout da planilha; Comercial só com venda.
6. Importar uma planilha exportada recria a obra com os mesmos números (markup derivado corretamente).
7. `npm run test:run` verde; `npm run build` sem erros.

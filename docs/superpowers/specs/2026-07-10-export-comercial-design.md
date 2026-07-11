# Export Comercial — Design (layout simples de 14 colunas, preços de venda)

**Data:** 2026-07-10
**Status:** aprovado pelo usuário (design), aguardando revisão da spec

## Problema

Hoje a rota de export usa o **mesmo** gerador (a técnica de 28 colunas) para `tipo=tecnico` e `tipo=comercial`. A comercial da empresa é um layout **diferente e mais simples** (14 colunas), voltado ao cliente: mostra apenas os **preços de venda**, sem custo, sem FEE, sem rentabilidade.

Referência estrutural: `teste/comercial.xlsx` (template real, inspecionado célula a célula em 2026-07-10). Layout idêntico ao `teste/tecnica.xlsx` (ambos são o formato simples).

## Escopo

Criar um gerador dedicado à comercial e fazer a rota escolher o gerador conforme `tipo`. Os preços de venda vêm de `lib/calculos.ts` (`calcularItem`) — sem duplicar fórmula monetária. Não altera o gerador técnico de 28 colunas nem o modelo de cálculo.

Fora de escopo: mudar o layout técnico; alterar o cálculo de venda.

## Layout exato (14 colunas A–N + O espaçadora)

### Colunas
| Col | Header (linha 8) | Conteúdo linha de item `r` |
|-----|------------------|-----------------------------|
| A | ITEM | letra da disciplina |
| B | Nº | `item.numero` |
| C | DESCRIÇÃO | `item.descricao` |
| D | DISCIPLINA | nome da disciplina |
| E | LOCAL | `item.local ?? ""` |
| F | UN. | `item.unidade_sigla` |
| G | QT. | `item.quantidade` |
| H | M. OBRA (preço unit. venda) | `item.preco_unit_mao_obra_venda` (número) |
| I | MATERIAL (preço unit. venda) | `item.preco_unit_material_venda` (número) |
| J | M. OBRA (sub total) | `=H{r}*G{r}` |
| K | MATERIAL (sub total) | `=I{r}*G{r}` |
| L | TOTAL | `=J{r}+K{r}` |
| M | OBS. | `item.observacao ?? ""` |
| N | OBS. | `item.observacao_2 ?? ""` |
| O | (espaçadora) | vazia, largura 0,5 |

`preco_unit_mao_obra_venda` = `custo_unit_mao_obra × fee × markup_mao_obra` e `preco_unit_material_venda` = `custo_unit_material × fee × markup_material`, calculados por `calcularItem` (`lib/calculos.ts`), onde `fee` já resolve o override por item (`fee_mao_obra ?? fee_fator`). A rota passa esses valores prontos; **não recalcular no gerador**.

### Linha de disciplina (antes dos itens do grupo)
`A`,`B` = letra; `C` = nome disciplina (maiúsculas); `D–I` = "-"; `J`,`K` = `=SUM(...)` dos subtotais do grupo; `L` = `=J{grp}+K{grp}`; `M`,`N` (OBS) = vazias. Fill cinza, negrito.

### Cabeçalho (linhas 1–8)
- **1:** `C1`="DESCRITIVO TÉCNICO E COMERCIAL"; `L1`=`=TODAY()` (formato data curto).
- **2:** `C2` = razão social do cliente.
- **3:** `C3` = "ENDEREÇO: " + endereço.
- **4:** `C4` = "CNPJ: " + cnpj.
- **5:** `C5` = `codigo` + " " + `nome`.
- **6 (totais):** `J6=SUM(J9:J{last})/2`, idem `K6`, `L6`.
- **7 (títulos de bloco, mesclados):** `H7:I7`="PREÇOS UNITÁRIOS", `J7:K7`="SUB TOTAL", `L7`="TOTAL".
- **8 (cabeçalhos de coluna):** conforme tabela acima.

### Estilo (fidelidade visual)
- Fonte Calibri tamanho 9; negrito em cabeçalhos e linhas de disciplina.
- Bordas hairline na grade (A–N).
- Fill cinza (`theme 0, tint ~-0.15`) nas linhas de disciplina.
- Larguras (do template): A5.8 B4.4 C72.4 D11.6 E13.6 F5.1 G4.8 H9.2 I10.0 J9.2 K10.0 L8.1 M11.6 N30.7 O0.5.
- Formatos monetários nas colunas H,I,J,K,L; QT (`G`) com `0.00`.
- Painel congelado em `A9`; gridlines ocultas.
- `autoFilter` de A8 até N{last}.
- Mesclagens: H7:I7, J7:K7.

## Mudanças de interface e arquitetura

Novo arquivo `lib/excel/export-comercial.ts`:
- `ObraCabecalho` (mesma forma do técnico: `{ codigo; nome; cliente: { razao_social; endereco; cnpj } | null }`).
- `ItemComercial = { numero: number; descricao: string; disciplina_nome: string; local: string | null; unidade_sigla: string; quantidade: number; preco_unit_mao_obra_venda: number; preco_unit_material_venda: number; observacao: string | null; observacao_2: string | null }`.
- `GrupoComItensComercial = { letra: string; ordem: number; disciplina_nome: string; itens: ItemComercial[] }`.
- `montarPlanilhaComercial(obra: ObraCabecalho, grupos: GrupoComItensComercial[]): ExcelJS.Workbook`.

`app/api/obras/[id]/export/route.ts`:
- Buscar também `markup_mao_obra, markup_material, fee_mao_obra, fee_material` (já buscados hoje após a fase técnica) e `fee_fator`.
- Para `tipo=comercial`: usar `calcularGrupo` (`lib/calculos.ts`) para obter `preco_unit_mao_obra_venda`/`preco_unit_material_venda` por item; montar `GrupoComItensComercial`; chamar `montarPlanilhaComercial`.
- Para `tipo=tecnico`: manter `montarPlanilhaDescritivo` (28 colunas).

## Testes

Novo `lib/excel/export-comercial.test.ts`:
1. Cabeçalho da empresa (C1–C5).
2. Títulos linha 7 (H7, J7, L7) e headers linha 8 (A8…N8).
3. Item: `H`/`I` recebem exatamente `preco_unit_mao_obra_venda`/`preco_unit_material_venda` (número), e `J`/`K`/`L` são fórmulas `H*G`/`I*G`/`J+K`.
4. Totais linha 6: `J6`/`K6`/`L6` = `=SUM(...)/2`.
5. Linha de disciplina: `J`/`K` = `=SUM(...)`, `L` = `=J{grp}+K{grp}`, D–I = "-".

Verificação manual/round-trip (controller): gerar a comercial de uma obra real e conferir que `L6` (TOTAL) bate com o `Y6` (venda total) da técnica da mesma obra.

## Riscos
- Regra do projeto "cálculo monetário só em lib/calculos.ts": o venda unitário DEVE vir de `calcularItem`, não ser recomputado no gerador nem na rota. A rota apenas lê `preco_unit_*_venda` do `ItemCalculado`.

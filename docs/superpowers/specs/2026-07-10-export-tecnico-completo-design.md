# Export Técnico Completo — Design (fiel à planilha original de 28 colunas)

**Data:** 2026-07-10
**Status:** aprovado pelo usuário (design), aguardando revisão da spec

## Problema

O gerador de export técnico atual (`lib/excel/export-template.ts`) produz apenas 14 colunas — só o lado do **custo** (ITEM…TOTAL custo + 2 colunas OBS). A planilha real da empresa (descritivo técnico e comercial) tem **28 colunas (A–AB)**, incluindo os blocos de **FEE**, **venda** e **rentabilidade**. O usuário precisa que o export saia **idêntico** à planilha original, com **todas** as colunas.

Referência estrutural: `07982 sp check-up - mykonos.xlsx` (fora do repo, dados reais de cliente), inspecionado célula a célula em 2026-07-10.

## Escopo

Reescrever `montarPlanilhaDescritivo` para emitir as 28 colunas com fórmulas nativas do Excel (recalcula ao abrir). Estender as interfaces de entrada e a rota de export para carregar markup por item, FEE efetivo por item, `comissao_valor`, `imposto_valor` e `fee_fator`. **Não** altera o modelo de cálculo (`lib/calculos.ts`) nem o import.

Fora de escopo: cadastrar CATEGORIA/FRENTE como campos reais (decisão do usuário: vêm como "-", idênticas ao original).

## Layout exato (28 colunas A–AB)

### Colunas
| Col | Header (linha 8) | Conteúdo linha de item `r` |
|-----|------------------|-----------------------------|
| A | ITEM | letra da disciplina |
| B | Nº | `item.numero` |
| C | DESCRIÇÃO | `item.descricao` |
| D | DISCIPLINA | nome da disciplina |
| E | CATEGORIA | `"-"` |
| F | FRENTE | `"-"` |
| G | LOCAL | `item.local ?? ""` |
| H | UN. | `item.unidade_sigla` |
| I | QT. | `item.quantidade` |
| J | M. OBRA (preço unit. custo) | `item.custo_unit_mao_obra` |
| K | MAT (preço unit. custo) | `item.custo_unit_material` |
| L | M. OBRA (sub total custo) | `=J{r}*I{r}` |
| M | MAT (sub total custo) | `=K{r}*I{r}` |
| N | TOTAL (custo) | `=L{r}+M{r}` |
| O | FEE M.OBRA | `=J{r}*{feeMO}` |
| P | $ M.OBRA | `=O{r}*{markupMO}` |
| Q | FEE MAT | `=K{r}*{feeMAT}` |
| R | $ MAT | `=Q{r}*{markupMAT}` |
| S | UN. | `=H{r}` |
| T | QT. | `=I{r}` |
| U | M. OBRA (preço unit. venda) | `=P{r}` |
| V | MATERIAL (preço unit. venda) | `=R{r}` |
| W | M. OBRA (sub total venda) | `=U{r}*T{r}` |
| X | MATERIAL (sub total venda) | `=V{r}*T{r}` |
| Y | TOTAL (venda) | `=W{r}+X{r}` |
| Z | (espaçadora) | vazia, largura 0,5 |
| AA | (rentabilidade — valores) | ver abaixo |
| AB | (rentabilidade — rótulos) | ver abaixo |

`feeMO` = `item.fee_mao_obra ?? fee_fator`; `feeMAT` = `item.fee_material ?? fee_fator`. `markupMO`/`markupMAT` = markup gravado do item (literal na fórmula, com casas suficientes — usar o número cru).

### Linha de disciplina (antes dos itens do grupo)
`A`,`B` = letra; `C` = nome disciplina (maiúsculas); `D–K`,`O–V` = "-"; `L`,`M`,`N` = `=SUM(...)` dos subtotais custo do grupo; `S` = `=SUM(...)`; `W`,`X`,`Y` = `=SUM(...)` dos subtotais venda do grupo. Fill cinza, negrito.

### Cabeçalho (linhas 1–8)
- **1:** `C1`="DESCRITIVO TÉCNICO E COMERCIAL"; `Y1`=`=TODAY()` (formato de data curto), como no gerador atual.
- **2:** `C2` = razão social do cliente.
- **3:** `C3` = "ENDEREÇO: " + endereço.
- **4:** `C4` = "CNPJ: " + cnpj.
- **5:** `C5` = `codigo` + " " + `nome`.
- **6 (totais):** `L6=SUM(L9:L{last})/2`, idem `M6,N6,W6,X6,Y6`. `AA6`="líq", `AB6`="líq%".
- **7 (títulos de bloco, mesclados):** `J7:K7`="PREÇOS UNITÁRIOS", `L7:M7`="SUB TOTAL", `N7`="TOTAL", `O7`="FEE M.OBRA", `P7`="$ M.OBRA", `Q7`="FEE MAT", `R7`="$ MAT", `U7:V7`="PREÇOS UNITÁRIOS", `W7:X7`="SUB TOTAL", `Y7`="TOTAL". `AA7`=`=Y6-AA8-AA9-AA10` (líq), `AB7`=`=AA7/Y6` (líq%).
- **8 (cabeçalhos de coluna):** conforme tabela acima. `AA8`=`comissao_valor` (número), `AB8`="comissao".

### Bloco rentabilidade (AA/AB)
- `AA8` = `comissao_valor`; `AB8`="comissao"
- `AA9` = `imposto_valor`;  `AB9`="imposto"
- `AA10` = `=N6*{fee_fator}` (custo c/ FEE); `AB10`="custo"
- `AA7` = `=Y6-AA8-AA9-AA10` (líq); `AB7`=`=AA7/Y6` (líq%)
- `AA6`="líq"; `AB6`="líq%" (rótulos)

Decisão do usuário: comissão e imposto usam os **valores manuais** da obra (não a fórmula 30% do template). Se 0, o export mostra 0.

### Estilo (fidelidade visual)
- Fonte Calibri tamanho 9; negrito em cabeçalhos e linhas de disciplina.
- Bordas hairline em todas as células da grade.
- Fill cinza (`theme 0, tint ~-0.15`) nas linhas de disciplina.
- Larguras exatas (da inspeção): A5.8 B4.4 C59.9 D18.1 E9.9 F7.3 G10.3 H5.1 I4.8 J8.5 K7.0 L8.8 M8.8 N8.8 O8.6 P7.2 Q7.0 R7.0 S5.1 T4.8 U8.5 V9.3 W8.8 X9.3 Y8.8 Z0.5 AA8.8 AB6.7.
- Formatos monetários nas colunas de R$ (J..R, U..Y, AA); QT (`I`,`T`) com `0.00`.
- Painel congelado em `A9`; gridlines ocultas.
- `autoFilter` de A8 até Y{last}.
- Mesclagens: J7:K7, L7:M7, U7:V7, W7:X7.

## Mudanças de interface

`export-template.ts`:
- `ItemDescritivo` ganha: `markup_mao_obra`, `markup_material` (number), `fee_mao_obra`/`fee_material` (number|null).
- Nova interface de entrada de fatores da obra: `fee_fator`, `comissao_valor`, `imposto_valor` (number). Assinatura: `montarPlanilhaDescritivo(obra, grupos, fatores)`.

`app/api/obras/[id]/export/route.ts`:
- Incluir `markup_mao_obra, markup_material, fee_mao_obra, fee_material` no select dos itens e `fee_fator, comissao_valor, imposto_valor` no select da obra; passar `fatores`.

## Testes

`export-template.test.ts` reescrito:
1. Estrutura: 28 colunas, cabeçalhos corretos em cada célula-chave (A8…Y8, O7,P7,Q7,R7, AA6/AB6, AB8/AB9/AB10), mesclagens presentes.
2. Fórmulas por item: L,M,N,O,P,Q,R,S,T,U,V,W,X,Y batem com o esperado numa obra de 1 grupo/2 itens (checar `.formula` das células).
3. Rentabilidade: `AA8=comissao_valor`, `AA9=imposto_valor`, `AA10` fórmula `=N6*fee_fator`, `AA7` fórmula do líq.
4. FEE por item: item com `fee_mao_obra=1` gera `O{r}=J{r}*1` (override), material sem override usa `fee_fator`.
5. Totais linha 6: fórmulas `=SUM(...)/2` presentes em L6,M6,N6,W6,X6,Y6.

Verificação manual/round-trip (fora dos testes unitários): gerar o export de uma obra real e conferir na tela que os totais L6…Y6 batem com a planilha original.

## Riscos
- Fórmula com markup literal: usar o número cru do banco (numeric 18,10) na string da fórmula garante que o Excel reproduza o `$` exatamente.
- `Z` espaçadora precisa existir para o bloco AA/AB ficar destacado como no original.

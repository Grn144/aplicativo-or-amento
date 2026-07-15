# Assistente Inteligente — Fase 2: Validação antes de exportar

## Contexto

Continuação do módulo "Assistente Inteligente", depois da Fase 1 (análise contínua do orçamento, concluída e mesclada em 2026-07-15). Esta fase cobre o pedido original de "validação antes de exportar": antes de gerar a planilha (técnica ou comercial), verificar problemas estruturais nos itens do orçamento e apresentar um relatório ao usuário.

Diferente da Fase 1 — que detecta desvios *estatísticos* em relação ao histórico entre orçamentos (precisa de composição vinculada e de pelo menos 3 usos históricos) — esta fase é inteiramente **estrutural**: cada check funciona em qualquer item, com ou sem composição, sem depender de nenhum dado de outros orçamentos. Por isso não reaproveita `lib/orcamento/alertas.ts` — é um módulo novo e independente.

## Escopo

5 checks, todos avaliados sobre os itens já calculados na tela (`gruposCalculados`, incluindo os campos derivados de `lib/calculos.ts` como `lucro`):

1. **Campo obrigatório — descrição vazia ou placeholder**: `descricao` vazia (após `trim()`) ou ainda igual ao valor padrão `"Novo item"` (o placeholder usado pela rota de criação manual de item quando nenhuma descrição é informada).
2. **Campo obrigatório — unidade não preenchida**: `unidade_id` é `null`.
3. **Valor zerado**: `custo_unit_material === 0` **e** `custo_unit_mao_obra === 0` ao mesmo tempo (item que vai custar R$0,00 na planilha exportada).
4. **Quantidade inválida**: `quantidade <= 0`.
5. **Custo inconsistente**: `lucro < 0` (o total de venda, já com markup/FEE aplicado, ficou menor que o custo direto do item — prejuízo).

### Fora de escopo

- **"Itens sem composição"** não entra como check. Criar item manual (sem `composicao_id`) é um caminho normal e frequente do app — tratar isso como "problema" geraria ruído constante sem sinalizar nada de fato acionável.
- Nenhum dos 5 checks depende de histórico entre orçamentos, composição vinculada, ou amostra mínima — todos funcionam em qualquer item, isoladamente.
- Sem bloqueio duro: a exportação sempre pode prosseguir, mediante confirmação explícita quando há problemas.

## Arquitetura

- **Lógica pura e testável** em `lib/orcamento/validacao-exportacao.ts` (novo arquivo), seguindo o mesmo padrão de `lib/orcamento/alertas.ts` e `lib/composicoes/calculos.ts`: uma função `validarOrcamentoParaExportacao(itens)` que recebe os itens já calculados e retorna a lista de problemas encontrados, sem tocar em Supabase nem em nada assíncrono.
- **Roda inteiramente no cliente**, sem nenhuma chamada nova ao servidor: todos os campos necessários (`descricao`, `unidade_id`, `custo_unit_material`, `custo_unit_mao_obra`, `quantidade`, `lucro`) já existem em `gruposCalculados` (computado por `lib/calculos.ts`), disponível em `EditorOrcamento.tsx` no momento em que o usuário clica em exportar.
- A validação é chamada no início da função `exportar(tipo)` existente em `EditorOrcamento.tsx`, sobre os itens de todos os grupos do orçamento — os mesmos itens entram na checagem independente do tipo de exportação escolhido (técnico ou comercial), já que os dois exportam o mesmo conjunto de itens, só mudando o layout da planilha.

## Interface

- Se `validarOrcamentoParaExportacao` não encontra nenhum problema: a exportação prossegue exatamente como hoje, sem nenhuma tela ou clique extra.
- Se encontra problemas: abre um modal listando cada problema (número do item, descrição do item, e a mensagem do problema — um item com múltiplos problemas aparece em múltiplas linhas, uma por problema), com dois botões:
  - **"Cancelar"** — fecha o modal, não exporta nada.
  - **"Exportar mesmo assim"** — fecha o modal e prossegue com a exportação do tipo (técnico/comercial) que o usuário havia clicado originalmente.
- O modal é reaproveitável entre os dois botões de exportação existentes (não é um componente por tipo).

## Tratamento de erros

Não há chamada de rede nem operação assíncrona nesta validação — é síncrona e local, então não há caminho de erro a tratar (diferente da Fase 1, que dependia de uma query ao Supabase).

## Testes

`lib/orcamento/validacao-exportacao.ts` ganha testes unitários cobrindo os 5 checks isoladamente: descrição vazia, descrição igual ao placeholder `"Novo item"`, descrição preenchida normalmente (sem problema), unidade ausente, os dois custos zerados simultaneamente (com apenas um zerado não deve disparar), quantidade zero e negativa, lucro negativo, e um item sem nenhum problema (lista vazia). Também um teste cobrindo um item com múltiplos problemas simultâneos (aparece uma vez por problema no resultado).

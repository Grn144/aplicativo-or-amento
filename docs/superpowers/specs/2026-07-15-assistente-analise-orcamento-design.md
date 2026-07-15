# Assistente Inteligente — Fase 1: Análise contínua do orçamento

## Contexto

O usuário pediu um módulo grande de "Assistente Inteligente de Orçamentos de Engenharia" cobrindo ~7 capacidades independentes: sugestão de composições/materiais compatíveis (já implementado no Banco de Composições, fase B5b), análise contínua do orçamento (duplicados, ausências, valores/markup fora do padrão, quantidades e unidades inconsistentes), sugestão de mão de obra, consulta em linguagem natural, criação assistida de composições, importação assistida do orçamento, e sugestão de fornecedores cadastrados (bloqueado — não existe cadastro de fornecedores no sistema).

Seguindo o mesmo padrão usado no Banco de Composições (decomposto em B1–B5b), essas capacidades foram tratadas como ciclos spec→plano→implementação independentes. Esta spec cobre a primeira: **Análise contínua do orçamento**, escolhida por ser a mais determinística e de menor risco (não depende de LLM novo, só do próprio banco de dados).

## Escopo

Cinco checks, todos calculados a partir dos dados já existentes em `itens_orcamento` e `composicoes` — nenhum LLM ou embedding novo é necessário:

1. **Duplicado** — dois itens no mesmo orçamento com o mesmo `composicao_id`, OU descrição idêntica (comparação case/espaço-insensitive).
2. **Valor fora do padrão** — `custo_unit_material` e `custo_unit_mao_obra` comparados *separadamente* contra a média histórica desse `composicao_id` em todos os orçamentos do usuário (>30% de desvio da média dispara o alerta).
3. **Markup fora da faixa** — mesmo critério do item 2, aplicado a `markup_material` e `markup_mao_obra` separadamente.
4. **Quantidade inconsistente** — `quantidade <= 0` (sempre dispara, sem exigir amostra), OU quantidade >30% fora da média histórica da composição.
5. **Unidade divergente** — `unidade_id` do item difere do `unidade_id` cadastrado na composição vinculada.

### Fora de escopo nesta fase

- **"Serviços possivelmente ausentes"** — adiado. Diferente dos outros 5 checks (que só olham o próprio orçamento/histórico de custo), esse exige definir um baseline de "o que é esperado" num orçamento (comparação com obras semelhantes ou composições típicas por disciplina), o que é um problema à parte a ser brainstormado separadamente.
- Sugestão de mão de obra, consulta em linguagem natural, criação assistida de composições, importação assistida do orçamento, sugestão de fornecedores — cada um vira seu próprio ciclo spec→plano→implementação futuro.
- Painel/resumo agregado de alertas — só o indicador por linha nesta fase.
- Severidade/cor diferenciada por tipo de alerta — todos usam o mesmo ícone neutro.

### Regras de aplicabilidade

- Checks 2, 3, 4 (comparação com histórico) e 5 só se aplicam a itens com `composicao_id` preenchido. Itens manuais (sem composição) só passam pelos checks 1 (duplicado por descrição) e 4 (quantidade ≤ 0).
- Checks 2, 3 e 4 (parte de desvio histórico) só disparam quando a composição já tem **≥3 usos** registrados em `itens_orcamento` (em qualquer orçamento) — evita alertas de "200% acima da média" calculados sobre uma amostra de 1.
- Itens com custo, markup ou quantidade nulos/zerados por padrão (ainda não preenchidos pelo usuário) não entram nas comparações de desvio — evita alerta falso em item recém-criado e ainda incompleto.

## Arquitetura e fluxo de dados

- **Lógica pura e testável** em `lib/orcamento/alertas.ts` (novo arquivo), seguindo o padrão já estabelecido em `lib/composicoes/calculos.ts`: funções puras que recebem os dados já carregados (itens do orçamento + agregados históricos) e retornam a lista de alertas por item, sem chamar o Supabase diretamente.
- **Query de agregados históricos**: em `app/(app)/obras/[id]/page.tsx` (Server Component), depois de buscar os itens do orçamento, roda uma query agrupada (`GROUP BY composicao_id`, com `AVG`/`COUNT` de custo material, custo mão de obra, markup material, markup mão de obra e quantidade) cobrindo apenas os `composicao_id` distintos usados naquele orçamento específico — não escaneia a tabela inteira. Mesmo padrão de agregação cross-obra já usado no dashboard de composições (B4).
- **Unidade da composição**: a query que já busca as composições vinculadas aos itens (existente desde o fix da B5a, que passou a buscar `composicao_id`/`composicao_versao`) passa a incluir também `unidade_id` da composição.
- Os alertas são computados a partir dessas duas fontes e passados como props para `TabelaOrcamento.tsx`, componente client que já desenha a tabela e já tem o indicador de "composição desatualizada" da B5a — o alerta novo reaproveita o mesmo mecanismo visual.
- **Nunca bloqueia nada**: alertas são só indicadores visuais e não impedem salvar, exportar ou continuar editando o orçamento — mesmo princípio de "sempre apresente sugestões, nunca altere dados automaticamente" já seguido no resto do sistema.

## Interface

- Reaproveita o indicador inline já usado na B5a para "composição desatualizada" em `TabelaOrcamento.tsx` — ícone/badge na linha do item.
- Um item pode disparar mais de um alerta simultaneamente (ex: markup fora da faixa **e** quantidade suspeita). Um único ícone de alerta por linha; o tooltip lista todos os motivos daquele item (ex: "Markup de mão de obra 45% acima da média histórica · Quantidade 60% abaixo da média histórica").
- Duplicado é tratado à parte por envolver dois itens: o badge aparece nos dois itens envolvidos, com o tooltip indicando qual outro item (número/descrição) é o duplicado.
- Sem painel resumo agregado nesta fase — só o indicador por linha.

## Tratamento de erros

- Se a query de agregados históricos falhar, a página da obra carrega normalmente sem alertas (nunca quebra a tela por causa disso) — mesmo princípio de "melhor-esforço" usado na geração de embeddings da B5b.

## Testes

`lib/orcamento/alertas.ts` ganha testes unitários cobrindo os 5 checks isoladamente: com/sem composição vinculada, amostra histórica insuficiente (<3 usos), limiar de 30% (dentro/fora), quantidade zero/negativa, duplicado por composição vs. por descrição idêntica, e itens com dados nulos/zerados sendo ignorados na comparação de desvio.

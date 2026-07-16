# Assistente Inteligente — Fase 3: Assistência na criação de composições (clonar como modelo)

## Contexto

Continuação do módulo "Assistente Inteligente", depois das Fases 1 (análise contínua do orçamento) e 2 (validação antes de exportar), ambas concluídas e mescladas em 2026-07-15. Esta fase cobre o pedido original de "criação de composições": ao criar uma composição nova, sugerir nome, unidade, disciplina, materiais, mão de obra, produtividade e markup sugerido; e, se existir composição semelhante, informar antes de criar.

**A parte de "informar composição semelhante antes de criar" já está implementada desde a B5b** — `ComposicaoModal.tsx` já busca semelhantes ao digitar nome/descrição técnica, só no modo de criação (não na edição). Nenhum trabalho novo é necessário para isso.

O que resta é a sugestão dos demais campos. Como o projeto não tem nenhuma capacidade de chat/geração de texto via LLM (só embeddings, desde a B5b — ver `lib/embeddings/gerar.ts`), a única forma determinística e de baixo risco de "sugerir" esses campos é **clonar da composição mais parecida já cadastrada**, escolhida pelo próprio usuário entre as opções que a busca por similaridade já mostra. Geração de verdade via LLM de chat é um escopo maior, ainda não brainstormado (mesma categoria de risco da "consulta em linguagem natural").

## Escopo

- A lista "Composições parecidas já cadastradas" (já existente, exibida só ao criar uma composição nova) passa a **clonar diretamente** a composição escolhida para o formulário em edição, ao ser clicada — mesmo padrão de "clique aplica direto" já usado pela lista de "materiais parecidos" no mesmo formulário (não pelo padrão antigo desta lista específica, que hoje abre em modo leitura).
- Campos clonados a partir da composição escolhida: `disciplina_id`, `unidade_id`, `produtividade`, `markup_sugerido`, a lista completa de **materiais** e a lista completa de **mão de obra**.
- Campos **não** clonados, continuam com o que o usuário já digitou: `codigo`, `nome`, `descricao_tecnica` — foi justamente esse texto que disparou a busca por composições parecidas, não faz sentido sobrescrevê-lo.
- A clonagem substitui qualquer valor já preenchido nesses campos, sem pedido de confirmação adicional — é uma ação explícita do usuário (ele clicou de propósito), mesmo princípio de ação direta já usado em outros botões do sistema.
- Depois de clonar, a sugestão é dispensada da tela (mesmo comportamento que já existe hoje ao selecionar um material parecido).
- `tags` e `observacoes` **não** entram na clonagem — não fazem parte do pedido original.

### Fora de escopo

- Sugestão de nome/código/descrição — continuam 100% digitados pelo usuário.
- Geração via LLM de chat — não existe capacidade de chat no projeto hoje; decisão de provedor fica para quando (e se) a "consulta em linguagem natural" for brainstormada.
- Qualquer mudança na lista de "materiais parecidos" ou na sugestão de composições semelhantes no orçamento (B5b) — ambas continuam exatamente como estão.

## Arquitetura

- Toda a mudança fica dentro de `components/composicoes/ComposicaoModal.tsx` — sem biblioteca nova, sem rota nova. Reaproveita a rota já existente `GET /api/composicoes/[id]` (retorna `ComposicaoCompleta`, incluindo `composicao_materiais` e `composicao_mao_obra`), a mesma que a função `carregar()` já usa para abrir uma composição para edição.
- `onSelecionar` da lista de composições parecidas (hoje ligado a `setComposicaoParaVisualizar(c.id)`, que abre uma visualização somente-leitura) passa a chamar uma nova função `usarComoModelo(id)`, que busca a composição completa e aplica os campos clonáveis (e só eles) ao estado do formulário (`form`, `materiais`, `maoDeObra`) — usando o mesmo mapeamento de materiais/mão-de-obra que `carregar()` já faz, só que aplicado a um subconjunto de campos do formulário (sem tocar `codigo`/`nome`/`descricao_tecnica`).
- **Limpeza de código morto**: como a visualização somente-leitura só era usada por este fluxo específico, o estado `composicaoParaVisualizar` e o modal aninhado que ele controlava (renderizado no fim do componente) ficam sem nenhum uso depois desta mudança e são removidos.

## Interface

- Nenhuma mudança visual no componente `ListaSugestoesSemelhantes` em si (interface genérica reaproveitada por 2 outros fluxos que não devem ser alterados: materiais parecidos e composições parecidas no orçamento).
- Um novo estado local `clonando` (booleano) evita duplo clique enquanto a composição completa é buscada.
- Erro de rede na busca reaproveita o campo `erro` já existente no formulário — sem UI de erro nova.

## Testes

Sem teste automatizado dedicado — mesma convenção já seguida por `ComposicaoModal.tsx` hoje (não tem arquivo `.test.tsx`, nem tinha antes desta mudança).

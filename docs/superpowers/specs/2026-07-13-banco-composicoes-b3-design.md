# Design — Banco de Composições (Fase B3: Import/Export Excel)

**Data:** 2026-07-13
**Status:** Aprovado para implementação
**Pré-requisito:** Fases B1, B2 e B5a — implementadas, mescladas na `master` e rodando em produção.

---

## 1. Contexto e escopo

O escopo original pedia "Integração com Excel — permitir importar e exportar composições preservando a estrutura utilizada pela empresa, garantindo compatibilidade com as planilhas de orçamento existentes." Diferente da B1 (onde o import/export do orçamento precisou bater célula a célula com uma planilha real da empresa), **não existe planilha de composições de referência** — só os templates de orçamento (`templates/orcamento-comercial.xlsx`, `templates/orcamento-tecnico.xlsx`). O formato desta fase é desenhado do zero, refletindo os campos que já existem no cadastro de composições (B1/B2/B5a).

**Nesta fase (B3):**
1. Exportar composições ativas (respeitando os filtros já aplicados na biblioteca) para uma planilha `.xlsx` com duas abas.
2. Importar uma planilha nesse mesmo formato, criando novas composições — nunca atualizando composições existentes.

**Fora de escopo nesta fase:** dashboard de indicadores (B4), qualquer coisa que dependa de LLM (B5b).

---

## 2. Formato da planilha

Duas abas, ligadas pela coluna **Código Composição**:

### Aba "Composições" — 1 linha por composição

| Coluna | Campo | Observação |
|---|---|---|
| Código | `codigo` | obrigatório, único |
| Nome | `nome` | obrigatório |
| Disciplina | nome da disciplina | texto (não UUID) — resolvido/criado no import |
| Descrição Técnica | `descricao_tecnica` | obrigatório |
| Unidade | sigla da unidade | texto (não UUID) — resolvido/criado no import |
| Produtividade | `produtividade` | texto livre, opcional |
| Markup Sugerido | `markup_sugerido` | numérico, default 1 se vazio |
| Observações | `observacoes` | opcional |
| Tags | tags separadas por vírgula | opcional |

**Não exportado** (derivado ou gerenciado pelo sistema): `custo_direto`, `versao`, `ativo`, `responsavel_id`, `criado_em`, `atualizado_em`.

### Aba "Itens" — 1 linha por material ou cargo de mão de obra

| Coluna | Material | Mão de obra |
|---|---|---|
| Código Composição | referência à aba Composições | referência à aba Composições |
| Tipo | `"Material"` | `"Mão de obra"` |
| Descrição | descrição do material | cargo |
| Quantidade | quantidade | horas |
| Unidade | sigla da unidade | vazio |
| Fornecedor | fornecedor (texto livre) | vazio |
| Valor Unitário | preço unitário | custo-hora |

A coluna **Tipo** decide como as demais colunas são interpretadas — "Unidade" e "Fornecedor" só se aplicam a linhas de material.

---

## 3. Export

**Endpoint:** `GET /api/composicoes/export`, aceitando os mesmos query params já usados pela listagem (`busca`, `disciplina_id`, `tag`, `favoritos`) — reaproveita a mesma consulta/filtros de `GET /api/composicoes`, sem paginação, retornando o `.xlsx` gerado com `exceljs` (já usado nos exports de orçamento da B1).

**UI:** botão "Exportar" na página `/composicoes`, ao lado de "+ Nova composição", que aplica os filtros correntes da tela (busca/disciplina/favoritos) à geração.

---

## 4. Import

**Endpoint:** `POST /api/composicoes/import`, recebendo um arquivo `.xlsx` (`multipart/form-data`, mesmo padrão de upload já usado no import de orçamento da B1).

**Processamento, por composição encontrada na aba "Composições":**
1. Validação: `codigo`, `nome`, `descricao_tecnica` obrigatórios; a composição precisa ter ao menos uma linha correspondente na aba "Itens" (material ou mão de obra) — mesmas regras já aplicadas na criação manual (B1).
2. Se o `codigo` já existe no banco: **erro** para essa composição (import nunca atualiza — só cria). Composições existentes continuam só editáveis pelo modal (B1) ou restauráveis por versão (B2).
3. Disciplina/unidade citadas por nome que não existem no cadastro são **criadas automaticamente**, mesmo padrão do import de orçamento da B1.
4. Composição válida é criada exatamente como uma criação manual pelo modal: `versao: 1`, snapshot inicial gravado em `composicao_versoes`, `responsavel_id` = usuário autenticado que importou.

**Import parcial:** composições válidas são criadas; composições com erro são reportadas (linha da planilha + motivo) sem impedir a criação das demais. A resposta da API inclui `{ criadas: number, erros: { linha: number, codigo: string | null, motivo: string }[] }`.

**Reaproveitamento de código:** a lógica de "validar + montar campos + inserir composição + inserir materiais/mão-de-obra + gravar snapshot v1" já existe dentro do handler `POST /api/composicoes` (B1). Esta fase extrai essa lógica para uma função compartilhada (ex: `lib/composicoes/criar.ts`), reaproveitada tanto pelo `POST` de criação individual quanto pelo import em lote — mesmo padrão de extração já usado na B2 (`atualizarComposicaoSeMudou`).

**UI:** botão "Importar planilha" na página `/composicoes`, ao lado de "Exportar". Abre seletor de arquivo, envia, e mostra um resumo do resultado (quantas foram criadas, lista de erros por composição não importada).

---

## 5. Testes

A extração da lógica de criação (`lib/composicoes/criar.ts`) deve preservar exatamente o comportamento já testado manualmente do `POST /api/composicoes` da B1 — sem teste automatizado dedicado à rota (segue o padrão já estabelecido: nenhuma rota de API tem teste automatizado neste projeto). O parsing da planilha (mapear linhas das duas abas para o formato de entrada da criação, resolver disciplina/unidade por nome, agrupar itens por composição) é lógica pura o suficiente para extrair e testar: `lib/composicoes/parse-excel.ts`, com testes cobrindo — planilha válida com materiais e mão de obra; composição sem nenhum item (erro); composição com código repetido dentro da própria planilha (decidir na implementação, ver critério de aceite 6); linha de item com "Tipo" não reconhecido.

---

## 6. Critérios de aceite

1. Exportar a biblioteca (sem filtro) gera uma planilha com as duas abas, uma linha por composição e uma linha por item, nos formatos acima.
2. Exportar com um filtro aplicado (ex: só uma disciplina) só inclui as composições que passam nesse filtro.
3. Importar uma planilha com composições novas e válidas cria todas elas, cada uma com versão 1 e snapshot gravado.
4. Importar uma planilha com um código que já existe no banco não altera a composição existente — reporta erro só para aquela linha.
5. Importar uma planilha com composições válidas e inválidas misturadas cria as válidas e lista as inválidas com o motivo, sem travar o processo inteiro.
6. Dois códigos repetidos dentro da mesma planilha (não no banco, mas entre si): tratado como erro em ambas as ocorrências — evita ambiguidade de qual delas deveria "ganhar" o código.
7. Disciplina ou unidade citada na planilha que não existe no cadastro é criada automaticamente, do mesmo jeito que já acontece no import de orçamento.
8. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.

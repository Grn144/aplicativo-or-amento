# Assistente Inteligente — Fase 3: Clonar composição parecida como modelo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao criar uma composição nova, clicar numa composição parecida (lista já existente desde a B5b) clona `disciplina_id`, `unidade_id`, `produtividade`, `markup_sugerido`, materiais e mão de obra dela para o formulário — em vez de abrir a composição escolhida em modo leitura, como acontece hoje.

**Architecture:** Mudança inteira em `components/composicoes/ComposicaoModal.tsx`. Nova função `usarComoModelo(id)` busca a composição completa via `GET /api/composicoes/[id]` (rota já existente) e aplica os campos clonáveis ao estado do formulário, reaproveitando o mesmo mapeamento de materiais/mão-de-obra que `carregar()` já usa para edição. O estado e o modal aninhado de visualização somente-leitura (usados só por este fluxo) ficam sem uso depois da mudança e são removidos.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Tailwind + shadcn/ui (`Dialog`, `Button`).

## Global Constraints

- Campos clonados: `disciplina_id`, `unidade_id`, `produtividade`, `markup_sugerido`, materiais, mão de obra. **Nunca** `codigo`, `nome`, `descricao_tecnica`, `tags` ou `observacoes` — o texto que o usuário já digitou continua exatamente como está.
- Clonar substitui qualquer valor já preenchido nesses campos, sem confirmação extra — ação explícita do usuário.
- Depois de clonar, a sugestão é dispensada (mesmo comportamento já existente ao selecionar um material parecido: `setSemelhantesDispensado(true)` + limpa a lista).
- Nenhuma mudança na interface do componente genérico `ListaSugestoesSemelhantes` — ele é reaproveitado por outros 2 fluxos (materiais parecidos, composições parecidas no orçamento) que não devem ser alterados.
- Sem biblioteca nova, sem rota nova — só reaproveita `GET /api/composicoes/[id]`, já existente.
- Sem teste automatizado dedicado — `ComposicaoModal.tsx` não tem arquivo `.test.tsx` hoje, e essa mudança não introduz um.

---

### Task 1: `ComposicaoModal.tsx` — clonar em vez de visualizar

**Files:**
- Modify: `components/composicoes/ComposicaoModal.tsx`

**Interfaces:**
- Consumes: `GET /api/composicoes/[id]` (já existente, retorna `ComposicaoCompleta`).
- Produces: nenhuma interface nova exportada — mudança de comportamento interna ao componente.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/composicoes/ComposicaoModal.tsx` inteiro antes de editar.

- [ ] **Step 2: Trocar o estado `composicaoParaVisualizar` por `clonando`**

Localize:

```typescript
  const [composicoesSemelhantes, setComposicoesSemelhantes] = useState<
    { id: string; codigo: string; nome: string; disciplina_nome: string | null }[]
  >([])
  const [semelhantesDispensado, setSemelhantesDispensado] = useState(false)
  const [composicaoParaVisualizar, setComposicaoParaVisualizar] = useState<string | null>(null)
  const [linhaAtivaMaterial, setLinhaAtivaMaterial] = useState<number | null>(null)
```

Substitua por:

```typescript
  const [composicoesSemelhantes, setComposicoesSemelhantes] = useState<
    { id: string; codigo: string; nome: string; disciplina_nome: string | null }[]
  >([])
  const [semelhantesDispensado, setSemelhantesDispensado] = useState(false)
  const [clonando, setClonando] = useState(false)
  const [linhaAtivaMaterial, setLinhaAtivaMaterial] = useState<number | null>(null)
```

- [ ] **Step 3: Adicionar a função `usarComoModelo`**

Localize o final da função `carregar` e o início de `restaurarVersao`:

```typescript
    setCarregando(false)
  }, [composicaoId])

  async function restaurarVersao(versaoId: string) {
```

Substitua por:

```typescript
    setCarregando(false)
  }, [composicaoId])

  async function usarComoModelo(id: string) {
    if (clonando) return
    setClonando(true)
    const res = await fetch(`/api/composicoes/${id}`)
    setClonando(false)
    if (!res.ok) {
      setErro('Não foi possível carregar a composição selecionada.')
      return
    }
    const composicao: ComposicaoCompleta = await res.json()
    setForm(prev => ({
      ...prev,
      disciplina_id: composicao.disciplina_id ?? '',
      unidade_id: composicao.unidade_id ?? '',
      produtividade: composicao.produtividade ?? '',
      markup_sugerido: String(composicao.markup_sugerido),
    }))
    setMateriais(
      composicao.composicao_materiais.map(m => ({
        descricao: m.descricao,
        quantidade: String(m.quantidade),
        unidade_id: m.unidade_id ?? '',
        fornecedor: m.fornecedor ?? '',
        preco_unitario: String(m.preco_unitario),
      }))
    )
    setMaoDeObra(
      composicao.composicao_mao_obra.map(m => ({
        cargo: m.cargo, horas: String(m.horas), custo_hora: String(m.custo_hora),
      }))
    )
    setSemelhantesDispensado(true)
    setComposicoesSemelhantes([])
  }

  async function restaurarVersao(versaoId: string) {
```

- [ ] **Step 4: Ligar o clique da lista de composições parecidas à nova função**

Localize:

```typescript
            {!composicaoId && (
              <ListaSugestoesSemelhantes
                titulo="Composições parecidas já cadastradas"
                itens={composicoesSemelhantes}
                renderItem={c => (
                  <span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.codigo}</span>{' '}
                    {c.nome}
                    {c.disciplina_nome ? ` — ${c.disciplina_nome}` : ''}
                  </span>
                )}
                onSelecionar={c => setComposicaoParaVisualizar(c.id)}
                onDispensar={() => {
                  setSemelhantesDispensado(true)
                  setComposicoesSemelhantes([])
                }}
              />
            )}
```

Substitua por:

```typescript
            {!composicaoId && (
              <ListaSugestoesSemelhantes
                titulo="Composições parecidas já cadastradas"
                itens={composicoesSemelhantes}
                renderItem={c => (
                  <span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.codigo}</span>{' '}
                    {c.nome}
                    {c.disciplina_nome ? ` — ${c.disciplina_nome}` : ''}
                  </span>
                )}
                onSelecionar={c => usarComoModelo(c.id)}
                onDispensar={() => {
                  setSemelhantesDispensado(true)
                  setComposicoesSemelhantes([])
                }}
              />
            )}
```

- [ ] **Step 5: Remover o modal aninhado de visualização (código morto) e o Fragment que só existia por causa dele**

Localize o final do componente:

```typescript
  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
```

Substitua por:

```typescript
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
```

Localize o final do componente (fecho das tags):

```typescript
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? 'Salvando...' : composicaoId ? 'Salvar' : 'Criar composição'}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      {composicaoParaVisualizar !== null && (
        <ComposicaoModal
          aberto={true}
          onOpenChange={aberto => { if (!aberto) setComposicaoParaVisualizar(null) }}
          composicaoId={composicaoParaVisualizar}
          disciplinas={disciplinas}
          unidades={unidades}
          onSalvo={onSalvo}
        />
      )}
    </>
  )
}
```

Substitua por:

```typescript
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? 'Salvando...' : composicaoId ? 'Salvar' : 'Criar composição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Não altere mais nada no arquivo — o resto do JSX (materiais, mão de obra, histórico de versões/uso) fica igual, só a indentação de `<Dialog>`/`</Dialog>` muda (de 6 para 4 espaços, já que deixam de estar dentro de um Fragment).

- [ ] **Step 6: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo `components/composicoes/ComposicaoModal.tsx` (fora do ruído pré-existente de globals do Vitest em arquivos `.test.ts(x)`, já confirmado não-relacionado nas fases anteriores).

- [ ] **Step 7: Commit**

```bash
git add components/composicoes/ComposicaoModal.tsx
git commit -m "feat: clonar composicao parecida como modelo ao criar uma nova"
```

---

### Task 2: Verificação final

**Files:** nenhum (só validação).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos os testes passam, sem nenhuma regressão nos testes já existentes (esta mudança não adiciona testes novos, já que `ComposicaoModal.tsx` não tem arquivo de teste).

- [ ] **Step 2: Rodar o typecheck geral**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo em nenhum arquivo do projeto (fora do ruído pré-existente de globals do Vitest em arquivos `.test.ts(x)`, já confirmado não-relacionado nas fases anteriores).

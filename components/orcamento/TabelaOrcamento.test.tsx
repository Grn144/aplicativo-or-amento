import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'
import { calcularGrupo, calcularTotaisGerais } from '@/lib/calculos'
import TabelaOrcamento from './TabelaOrcamento'

const FEE_FATOR = 1.2

function item(over: Partial<ItemOrcamento> = {}): ItemOrcamento {
  return {
    id: '1',
    grupo_id: 'g1',
    numero: 1,
    descricao: 'Item de teste',
    local: 'Local A',
    unidade_id: 'un1',
    quantidade: 10,
    custo_unit_mao_obra: 100,
    custo_unit_material: 50,
    markup_mao_obra: 2,
    markup_material: 1.5,
    fee_mao_obra: null,
    fee_material: null,
    observacao: null,
    observacao_2: null,
    ordem: 1,
    unidades_medida: { id: 'un1', sigla: 'M2', descricao: null },
    ...over,
  }
}

function montarGrupo(itens: ItemOrcamento[]): GrupoOrcamento & { itens_orcamento: ItemOrcamento[] } {
  return {
    id: 'g1',
    obra_id: 'obra1',
    disciplina_id: 'd1',
    letra: 'A',
    ordem: 1,
    disciplinas: { id: 'd1', nome: 'Estrutura', ativo: true },
    itens_orcamento: itens,
  }
}

function renderTabela(itens: ItemOrcamento[], props: Partial<React.ComponentProps<typeof TabelaOrcamento>> = {}) {
  const grupo = calcularGrupo(montarGrupo(itens), FEE_FATOR)
  const gruposCalculados = [grupo]
  const totais = calcularTotaisGerais(gruposCalculados)
  const onUpdateItem = vi.fn().mockResolvedValue(undefined)

  render(
    <TabelaOrcamento
      gruposCalculados={gruposCalculados}
      totais={totais}
      visao="tecnica"
      obraId="obra1"
      disciplinas={[{ id: 'd1', nome: 'Estrutura' }]}
      unidades={[{ id: 'un1', sigla: 'M2' }]}
      onUpdateItem={onUpdateItem}
      onUpdateUnidade={vi.fn()}
      onAddDisciplina={vi.fn()}
      onRemoveGrupo={vi.fn()}
      onAddItem={vi.fn()}
      onRemoveItem={vi.fn()}
      {...props}
    />
  )

  return { onUpdateItem, grupo }
}

describe('TabelaOrcamento (visão técnica)', () => {
  it('exibe os cabeçalhos com a nomenclatura da planilha', () => {
    renderTabela([item()])

    expect(screen.getByText('M. OBRA')).toBeInTheDocument()
    expect(screen.getByText('MAT')).toBeInTheDocument()
    expect(screen.getByText('FEE M.OBRA')).toBeInTheDocument()
    expect(screen.getByText('$ M.OBRA')).toBeInTheDocument()
    expect(screen.getByText('FEE MAT')).toBeInTheDocument()
    expect(screen.getByText('$ MAT')).toBeInTheDocument()
    expect(screen.getByText('SUB TOTAL M.OBRA')).toBeInTheDocument()
    expect(screen.getByText('SUB TOTAL MAT')).toBeInTheDocument()
    expect(screen.getByText('TOTAL')).toBeInTheDocument()
    expect(screen.getByText('Markup M.Obra')).toBeInTheDocument()
    expect(screen.getByText('Markup Mat.')).toBeInTheDocument()

    // Não deve mais existir a nomenclatura antiga de margem
    expect(screen.queryByText('Mg. MO%')).not.toBeInTheDocument()
    expect(screen.queryByText('Mg. Mat%')).not.toBeInTheDocument()
  })

  it('mostra os valores calculados de FEE/$/subtotal/total de venda', () => {
    const { grupo } = renderTabela([item()])
    const it0 = grupo.itens_calculados[0]

    expect(screen.getByText(it0.fee_unit_mao_obra.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))).toBeInTheDocument()
    expect(screen.getByText(it0.preco_unit_mao_obra_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))).toBeInTheDocument()
    expect(screen.getAllByText(it0.total_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })).length).toBeGreaterThan(0)
  })

  it('edita e salva Markup M.Obra ao duplo clique, digitar e sair do campo', () => {
    const { onUpdateItem } = renderTabela([item({ markup_mao_obra: 2 })])

    const celula = screen.getByText('2,00')
    fireEvent.doubleClick(celula)

    const input = screen.getByDisplayValue('2')
    fireEvent.change(input, { target: { value: '3.5' } })
    fireEvent.blur(input)

    expect(onUpdateItem).toHaveBeenCalledWith('g1', '1', 'markup_mao_obra', 3.5)
  })

  it('edita e salva Markup Mat. ao duplo clique, digitar e sair do campo', () => {
    const { onUpdateItem } = renderTabela([item({ markup_material: 1.5 })])

    const celula = screen.getByText('1,50')
    fireEvent.doubleClick(celula)

    const input = screen.getByDisplayValue('1.5')
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.blur(input)

    expect(onUpdateItem).toHaveBeenCalledWith('g1', '1', 'markup_material', 2)
  })

  it('usa 1 como default quando o markup é apagado (campo vazio)', () => {
    const { onUpdateItem } = renderTabela([item({ markup_mao_obra: 2 })])

    const celula = screen.getByText('2,00')
    fireEvent.doubleClick(celula)

    const input = screen.getByDisplayValue('2')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(onUpdateItem).toHaveBeenCalledWith('g1', '1', 'markup_mao_obra', 1)
  })
})

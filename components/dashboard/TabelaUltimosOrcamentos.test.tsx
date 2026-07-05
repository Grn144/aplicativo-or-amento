import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { LinhaOrcamento } from '@/lib/dashboard/metricas'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { TabelaUltimosOrcamentos } from './TabelaUltimosOrcamentos'

function linha(over: Partial<LinhaOrcamento>): LinhaOrcamento {
  return {
    id: over.id ?? '1', codigo: '08114', cliente: 'ACME', obra: 'Obra X',
    responsavel: 'João', valor: 1000, data: '2026-06-20', status: 'enviado',
    ...over,
  }
}

describe('TabelaUltimosOrcamentos', () => {
  it('mostra empty state sem linhas', () => {
    render(<TabelaUltimosOrcamentos linhas={[]} podeExcluir={false} />)
    expect(screen.getByText(/nenhum orçamento/i)).toBeInTheDocument()
  })

  it('ordena por valor ao clicar no cabeçalho', () => {
    render(
      <TabelaUltimosOrcamentos
        linhas={[linha({ id: '1', codigo: 'A1', valor: 100 }), linha({ id: '2', codigo: 'B2', valor: 900 })]}
        podeExcluir={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^valor$/i }))
    const celulas = screen.getAllByRole('row').slice(1) // pula o header
    expect(within(celulas[0]).getByText('B2')).toBeInTheDocument()
  })

  it('filtra por status', () => {
    render(
      <TabelaUltimosOrcamentos
        linhas={[linha({ id: '1', codigo: 'A1', status: 'aprovado' }), linha({ id: '2', codigo: 'B2', status: 'cancelado' })]}
        podeExcluir={false}
      />
    )
    fireEvent.change(screen.getByLabelText(/filtrar por status/i), { target: { value: 'aprovado' } })
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.queryByText('B2')).not.toBeInTheDocument()
  })

  it('pagina em 10 linhas', () => {
    const linhas = Array.from({ length: 12 }, (_, i) => linha({ id: String(i), codigo: `C${i}` }))
    render(<TabelaUltimosOrcamentos linhas={linhas} podeExcluir={false} />)
    expect(screen.getAllByRole('row')).toHaveLength(11) // header + 10
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }))
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2
  })

  it('esconde a ação excluir sem permissão', () => {
    render(<TabelaUltimosOrcamentos linhas={[linha({})]} podeExcluir={false} />)
    expect(screen.queryByLabelText(/excluir/i)).not.toBeInTheDocument()
  })
})

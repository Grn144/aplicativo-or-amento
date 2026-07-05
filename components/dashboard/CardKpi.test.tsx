import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileText } from 'lucide-react'
import { CardKpi } from './CardKpi'

describe('CardKpi', () => {
  it('mostra título, valor e variação positiva', () => {
    render(<CardKpi titulo="Orçamentos Criados" valor="245" variacaoPct={12.3} icone={FileText} cor="azul" />)
    expect(screen.getByText('Orçamentos Criados')).toBeInTheDocument()
    expect(screen.getByText('245')).toBeInTheDocument()
    expect(screen.getByText(/↑\s*12,3%/)).toBeInTheDocument()
  })
  it('mostra variação negativa com seta para baixo', () => {
    render(<CardKpi titulo="Cancelados" valor="45" variacaoPct={-3} icone={FileText} cor="vermelho" />)
    expect(screen.getByText(/↓\s*3,0%/)).toBeInTheDocument()
  })
  it('mostra travessão quando variação é null', () => {
    render(<CardKpi titulo="Em Análise" valor="38" variacaoPct={null} icone={FileText} cor="laranja" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

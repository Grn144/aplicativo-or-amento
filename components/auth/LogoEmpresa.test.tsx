import { render, screen } from '@testing-library/react'
import { LogoEmpresa } from './LogoEmpresa'
import { MARCA } from './marca'

describe('LogoEmpresa', () => {
  it('exibe o nome da empresa como heading e o subtítulo', () => {
    render(<LogoEmpresa />)
    expect(screen.getByRole('heading', { name: MARCA.nome })).toBeInTheDocument()
    expect(screen.getByText('Sistema Corporativo de Engenharia')).toBeInTheDocument()
  })
})

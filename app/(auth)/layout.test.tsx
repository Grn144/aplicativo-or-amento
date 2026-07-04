import { render, screen } from '@testing-library/react'
import AuthLayout from './layout'
import { MARCA } from '@/components/auth/marca'

describe('AuthLayout', () => {
  it('renderiza o conteúdo e o rodapé com marca e versão', () => {
    render(
      <AuthLayout>
        <p>conteudo-filho</p>
      </AuthLayout>
    )
    expect(screen.getByText('conteudo-filho')).toBeInTheDocument()
    expect(
      screen.getByText(`© 2026 ${MARCA.nome} · Versão ${MARCA.versao}`)
    ).toBeInTheDocument()
  })
})

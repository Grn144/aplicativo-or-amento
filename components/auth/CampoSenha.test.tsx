import { render, screen, fireEvent } from '@testing-library/react'
import { CampoSenha } from './CampoSenha'

describe('CampoSenha', () => {
  it('começa oculto e alterna para visível ao clicar no toggle', () => {
    render(<CampoSenha placeholder="Digite sua senha" />)

    const input = screen.getByPlaceholderText('Digite sua senha')
    expect(input).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('exibe erro com role=alert e marca o input como inválido', () => {
    render(<CampoSenha placeholder="Digite sua senha" erro="Informe sua senha." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Informe sua senha.')
    expect(screen.getByPlaceholderText('Digite sua senha')).toHaveAttribute('aria-invalid', 'true')
  })
})

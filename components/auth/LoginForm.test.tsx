import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from './LoginForm'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function preencher(email: string, senha: string) {
  fireEvent.change(screen.getByPlaceholderText('Digite seu e-mail'), {
    target: { value: email },
  })
  fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
    target: { value: senha },
  })
}

function submeter() {
  fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form')!)
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    push.mockClear()
    localStorage.clear()
  })

  it('não envia com campos vazios e mostra as mensagens', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<LoginForm />)
    submeter()
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mostra "E-mail inválido." no blur com formato errado', () => {
    render(<LoginForm />)
    const email = screen.getByPlaceholderText('Digite seu e-mail')
    fireEvent.change(email, { target: { value: 'nao-e-email' } })
    fireEvent.blur(email)
    expect(screen.getByText('E-mail inválido.')).toBeInTheDocument()
  })

  it('envia credenciais, mostra loading e redireciona para /verificar', async () => {
    let resolver!: (v: Response) => void
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(r => (resolver = r)))
    vi.stubGlobal('fetch', fetchMock)

    render(<LoginForm />)
    preencher('eng@empresa.com', 'segredo123')
    submeter()

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'eng@empresa.com', password: 'segredo123' }),
    })
    expect(screen.getByRole('button', { name: /Entrando/ })).toBeDisabled()

    resolver(new Response(JSON.stringify({}), { status: 200 }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/verificar'))
    expect(screen.getByRole('button', { name: /Autenticado/ })).toBeInTheDocument()
  })

  it('mostra erro do servidor e reabilita o botão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Usuário ou senha incorretos.' }), { status: 401 })
      )
    )
    render(<LoginForm />)
    preencher('eng@empresa.com', 'errada')
    submeter()
    expect(await screen.findByText('Usuário ou senha incorretos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('salva o e-mail no localStorage quando lembrar-me está marcado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    )
    render(<LoginForm />)
    preencher('eng@empresa.com', 'segredo123')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
    submeter()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/verificar'))
    expect(localStorage.getItem('login:email')).toBe('eng@empresa.com')
  })

  it('pré-preenche e-mail salvo e marca o checkbox no mount', () => {
    localStorage.setItem('login:email', 'salvo@empresa.com')
    render(<LoginForm />)
    expect(screen.getByPlaceholderText('Digite seu e-mail')).toHaveValue('salvo@empresa.com')
    expect(screen.getByRole('checkbox', { name: 'Lembrar-me' })).toBeChecked()
  })

  it('lembrar-me desmarcado remove o e-mail salvo no sucesso', async () => {
    localStorage.setItem('login:email', 'salvo@empresa.com')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    )
    render(<LoginForm />)
    expect(screen.getByRole('checkbox', { name: 'Lembrar-me' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
    preencher('salvo@empresa.com', 'segredo123')
    submeter()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/verificar'))
    expect(localStorage.getItem('login:email')).toBeNull()
  })

  it('erro de conexão mostra mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    render(<LoginForm />)
    preencher('eng@empresa.com', 'segredo123')
    submeter()
    expect(await screen.findByText('Erro de conexão. Tente novamente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })
})

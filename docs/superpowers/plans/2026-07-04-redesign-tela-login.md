# Redesign da Tela de Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de login com visual corporativo premium (fundo azul-escuro com planta técnica em SVG, card branco moderno, validação em tempo real, lembrar-me funcional), preservando o fluxo de auth existente (POST `/api/auth/login` → `/verificar`).

**Architecture:** O layout compartilhado `app/(auth)/layout.tsx` ganha o fundo gradiente + SVG decorativo + rodapé (todas as telas de auth herdam). O card de login é decomposto em componentes focados em `components/auth/`: constante de marca, logo, campo de senha com toggle e formulário com toda a lógica.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, shadcn/ui (base-ui), lucide-react, tw-animate-css, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-04-redesign-tela-login-design.md`

## Global Constraints

- **Nenhuma dependência nova** — não instalar Framer Motion nem pacotes de checkbox; animações só com CSS/Tailwind (tw-animate-css já instalado).
- **Não alterar** `/api/auth/*`, middleware, nem as páginas `/verificar`, `/esqueci-senha`, `/nova-senha`.
- Paleta: fundo `#0F172A` (slate-900/950), card `#FFFFFF`, superfícies `#F5F7FA`, botões/acentos `#2563EB` (blue-600).
- Textos exatos: placeholders "Digite seu e-mail" / "Digite sua senha"; erros "Informe seu e-mail." / "Informe sua senha." / "E-mail inválido." / "Usuário ou senha incorretos."; subtítulo "Sistema Corporativo de Engenharia"; rodapé "© 2026 Sistema de Orçamentos · Versão 1.0".
- Testes colocados junto ao código (padrão do repo: `lib/calculos.test.ts`).
- Rodar testes com `npx vitest run <arquivo>` (não `npm test`, que fica em watch mode).
- Commits frequentes, um por task, mensagens em pt-BR no padrão do repo (`feat:`, `test:`...), terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Constante de marca + LogoEmpresa

**Files:**
- Create: `components/auth/marca.ts`
- Create: `components/auth/LogoEmpresa.tsx`
- Test: `components/auth/LogoEmpresa.test.tsx`

**Interfaces:**
- Consumes: nada (task inicial).
- Produces: `MARCA: { nome: string; subtitulo: string; versao: string }` exportado de `components/auth/marca.ts`; componente `LogoEmpresa()` (sem props) exportado de `components/auth/LogoEmpresa.tsx`. Tasks 2 e 5 dependem desses nomes exatos.

- [ ] **Step 1: Escrever o teste que falha**

Criar `components/auth/LogoEmpresa.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run components/auth/LogoEmpresa.test.tsx`
Expected: FAIL — módulo `./LogoEmpresa` não encontrado.

- [ ] **Step 3: Implementar**

Criar `components/auth/marca.ts`:

```ts
// Identidade exibida na tela de login e no rodapé das telas de auth.
// Trocar o nome/versão da empresa = editar somente este arquivo.
export const MARCA = {
  nome: 'Sistema de Orçamentos',
  subtitulo: 'Sistema Corporativo de Engenharia',
  versao: '1.0',
} as const
```

Criar `components/auth/LogoEmpresa.tsx`:

```tsx
import { Building2 } from 'lucide-react'
import { MARCA } from './marca'

export function LogoEmpresa() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
        <Building2 className="size-7 text-white" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {MARCA.nome}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{MARCA.subtitulo}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run components/auth/LogoEmpresa.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add components/auth/marca.ts components/auth/LogoEmpresa.tsx components/auth/LogoEmpresa.test.tsx
git commit -m "feat: constante de marca e componente LogoEmpresa"
```

---

### Task 2: BlueprintBackground + layout compartilhado de auth

**Files:**
- Create: `components/auth/BlueprintBackground.tsx`
- Modify: `app/(auth)/layout.tsx` (substituir o arquivo inteiro — hoje tem 9 linhas)
- Test: `app/(auth)/layout.test.tsx`

**Interfaces:**
- Consumes: `MARCA` de `components/auth/marca.ts` (Task 1).
- Produces: `BlueprintBackground()` (sem props); `AuthLayout` continua sendo o default export de `app/(auth)/layout.tsx` recebendo `{ children }`. Nenhuma outra task depende de nomes daqui.

- [ ] **Step 1: Escrever o teste que falha**

Criar `app/(auth)/layout.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run "app/(auth)/layout.test.tsx"`
Expected: FAIL — o layout atual não tem rodapé.

- [ ] **Step 3: Implementar**

Criar `components/auth/BlueprintBackground.tsx`:

```tsx
// Fundo decorativo: grid + traços de planta técnica em baixa opacidade.
// Puramente visual — sem interação e invisível para leitores de tela.
export function BlueprintBackground() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <defs>
        <pattern id="bp-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0v48" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1440" height="900" fill="url(#bp-grid)" />
      <g stroke="white" strokeOpacity="0.07" strokeWidth="1.5">
        {/* planta baixa — canto superior esquerdo */}
        <path d="M80 120h280v200H80z" />
        <path d="M80 220h120M200 120v100M280 220v100M360 220h-80" />
        <path d="M200 270h60" strokeDasharray="6 6" />
        {/* compasso — canto inferior direito */}
        <circle cx="1240" cy="700" r="120" />
        <circle cx="1240" cy="700" r="80" strokeDasharray="4 8" />
        <path d="M1240 560v280M1100 700h280" />
        {/* treliça estrutural — topo direito */}
        <path d="M1000 80l80 120h-160l80-120z" />
        <path d="M920 200h320M1080 80l80 120M1160 80l80 120h-160" />
        {/* linha de cota — inferior esquerdo */}
        <path d="M120 760h360M120 750v20M480 750v20" />
      </g>
    </svg>
  )
}
```

Substituir `app/(auth)/layout.tsx` por:

```tsx
import { BlueprintBackground } from '@/components/auth/BlueprintBackground'
import { MARCA } from '@/components/auth/marca'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-800 via-slate-900 to-slate-950 px-4 py-10">
      <BlueprintBackground />
      <main className="relative z-10 w-full max-w-md">{children}</main>
      <footer className="relative z-10 mt-8 text-center text-xs text-slate-400">
        © 2026 {MARCA.nome} · Versão {MARCA.versao}
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run "app/(auth)/layout.test.tsx"`
Expected: PASS (1 test).

- [ ] **Step 5: Verificação visual**

Com o dev server rodando (`npm run dev` em background, porta 3000), abrir/checar `http://localhost:3000/login`: fundo azul-escuro com linhas técnicas sutis, card atual centralizado por cima, rodapé visível na base. Checar também `/esqueci-senha` (deve herdar o fundo).

- [ ] **Step 6: Commit**

```bash
git add components/auth/BlueprintBackground.tsx "app/(auth)/layout.tsx" "app/(auth)/layout.test.tsx"
git commit -m "feat: fundo de planta tecnica e rodape no layout de auth"
```

---

### Task 3: CampoSenha (input com mostrar/ocultar)

**Files:**
- Create: `components/auth/CampoSenha.tsx`
- Test: `components/auth/CampoSenha.test.tsx`

**Interfaces:**
- Consumes: `Input` de `@/components/ui/input`.
- Produces: `CampoSenha(props: React.ComponentProps<'input'> & { erro?: string })` — repassa props nativas ao input interno (`value`, `onChange`, `placeholder`, `autoComplete`...); `erro` exibe mensagem com `role="alert"` e marca o input com `aria-invalid`. Task 4 usa exatamente essa assinatura.

- [ ] **Step 1: Escrever o teste que falha**

Criar `components/auth/CampoSenha.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampoSenha } from './CampoSenha'

describe('CampoSenha', () => {
  it('começa oculto e alterna para visível ao clicar no toggle', async () => {
    const user = userEvent.setup()
    render(<CampoSenha placeholder="Digite sua senha" />)

    const input = screen.getByPlaceholderText('Digite sua senha')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('exibe erro com role=alert e marca o input como inválido', () => {
    render(<CampoSenha placeholder="Digite sua senha" erro="Informe sua senha." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Informe sua senha.')
    expect(screen.getByPlaceholderText('Digite sua senha')).toHaveAttribute('aria-invalid', 'true')
  })
})
```

Nota: `@testing-library/user-event` já vem como dependência transitiva de `@testing-library/react` v16? **Não** — verificar com `npm ls @testing-library/user-event`. Se não estiver instalado, usar `fireEvent` no lugar:

```tsx
import { fireEvent } from '@testing-library/react'
// no lugar de await user.click(...):
fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
```

(Não instalar dependência nova — usar `fireEvent` se `user-event` não existir.)

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run components/auth/CampoSenha.test.tsx`
Expected: FAIL — módulo `./CampoSenha` não encontrado.

- [ ] **Step 3: Implementar**

Criar `components/auth/CampoSenha.tsx`:

```tsx
'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'

type CampoSenhaProps = React.ComponentProps<'input'> & { erro?: string }

export function CampoSenha({ erro, id, className, ...props }: CampoSenhaProps) {
  const idGerado = useId()
  const inputId = id ?? idGerado
  const [visivel, setVisivel] = useState(false)

  return (
    <div>
      <div className="relative">
        <Lock
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
        />
        <Input
          id={inputId}
          type={visivel ? 'text' : 'password'}
          className={`h-11 pr-10 pl-9 ${className ?? ''}`}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${inputId}-erro` : undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisivel(v => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
        >
          {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {erro && (
        <p id={`${inputId}-erro`} role="alert" className="mt-1.5 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run components/auth/CampoSenha.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/auth/CampoSenha.tsx components/auth/CampoSenha.test.tsx
git commit -m "feat: componente CampoSenha com toggle de visibilidade"
```

---

### Task 4: LoginForm (lógica completa)

**Files:**
- Create: `components/auth/LoginForm.tsx`
- Test: `components/auth/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `CampoSenha` (Task 3), `Input`/`Button`/`Label` de `components/ui/`, `useRouter` de `next/navigation`, API existente `POST /api/auth/login` (body `{ email, password }`; erro em `{ error }`).
- Produces: `LoginForm()` (sem props), client component. Task 5 o monta na página.

**Comportamento (da spec):**
- `noValidate` no `<form>` — validação é nossa, não do browser.
- Validação no submit e no blur do e-mail: vazio → "Informe seu e-mail."; formato inválido (regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) → "E-mail inválido."; senha vazia → "Informe sua senha.". Com erro, não chama fetch.
- Estados do botão: `idle` ("Entrar") → `carregando` (spinner `Loader2` + "Entrando...", desabilitado) → `sucesso` (`Check` + "Autenticado!") e `router.push('/verificar')`.
- Erro do servidor: usa `data.error` da API ou "Usuário ou senha incorretos."; erro de rede: "Erro de conexão. Tente novamente.".
- Lembrar-me: chave `localStorage` `"login:email"`. No mount, se existir, pré-preenche e marca. No sucesso: marcado → salva; desmarcado → remove.

- [ ] **Step 1: Escrever os testes que falham**

Criar `components/auth/LoginForm.test.tsx`:

```tsx
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
})
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npx vitest run components/auth/LoginForm.test.tsx`
Expected: FAIL — módulo `./LoginForm` não encontrado.

- [ ] **Step 3: Implementar**

Criar `components/auth/LoginForm.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CampoSenha } from './CampoSenha'

const CHAVE_EMAIL_SALVO = 'login:email'
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status = 'idle' | 'carregando' | 'sucesso'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [erroEmail, setErroEmail] = useState('')
  const [erroSenha, setErroSenha] = useState('')
  const [erroServidor, setErroServidor] = useState('')

  useEffect(() => {
    const salvo = localStorage.getItem(CHAVE_EMAIL_SALVO)
    if (salvo) {
      setEmail(salvo)
      setLembrar(true)
    }
  }, [])

  function validarEmail(valor: string): string {
    if (!valor.trim()) return 'Informe seu e-mail.'
    if (!REGEX_EMAIL.test(valor)) return 'E-mail inválido.'
    return ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const msgEmail = validarEmail(email)
    const msgSenha = senha ? '' : 'Informe sua senha.'
    setErroEmail(msgEmail)
    setErroSenha(msgSenha)
    if (msgEmail || msgSenha) return

    setStatus('carregando')
    setErroServidor('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErroServidor(data.error || 'Usuário ou senha incorretos.')
        setStatus('idle')
        return
      }

      if (lembrar) localStorage.setItem(CHAVE_EMAIL_SALVO, email)
      else localStorage.removeItem(CHAVE_EMAIL_SALVO)

      setStatus('sucesso')
      router.push('/verificar')
    } catch {
      setErroServidor('Erro de conexão. Tente novamente.')
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-slate-700">
          E-mail
        </Label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              if (erroEmail) setErroEmail('')
            }}
            onBlur={() => email && setErroEmail(validarEmail(email))}
            placeholder="Digite seu e-mail"
            autoComplete="email"
            className="h-11 pl-9"
            aria-invalid={erroEmail ? true : undefined}
            aria-describedby={erroEmail ? 'email-erro' : undefined}
          />
        </div>
        {erroEmail && (
          <p id="email-erro" role="alert" className="text-sm text-red-600">
            {erroEmail}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha" className="text-slate-700">
          Senha
        </Label>
        <CampoSenha
          id="senha"
          value={senha}
          onChange={e => {
            setSenha(e.target.value)
            if (erroSenha) setErroSenha('')
          }}
          placeholder="Digite sua senha"
          autoComplete="current-password"
          erro={erroSenha}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-slate-600 select-none">
          <input
            type="checkbox"
            checked={lembrar}
            onChange={e => setLembrar(e.target.checked)}
            className="size-4 rounded border-slate-300 accent-blue-600"
          />
          Lembrar-me
        </label>
        <Link
          href="/esqueci-senha"
          className="font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>

      {erroServidor && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {erroServidor}
        </p>
      )}

      <Button
        type="submit"
        disabled={status !== 'idle'}
        className="h-11 w-full bg-blue-600 text-base text-white transition-colors hover:bg-blue-700 disabled:opacity-80"
      >
        {status === 'carregando' && (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" />
            Entrando...
          </>
        )}
        {status === 'sucesso' && (
          <>
            <Check aria-hidden="true" />
            Autenticado!
          </>
        )}
        {status === 'idle' && 'Entrar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npx vitest run components/auth/LoginForm.test.tsx`
Expected: PASS (6 tests). Se o teste de loading falhar porque o botão desabilitado vira `aria-disabled` (base-ui), trocar `toBeDisabled()` por checagem de `aria-disabled` — investigar o DOM real antes de mudar o assert.

- [ ] **Step 5: Commit**

```bash
git add components/auth/LoginForm.tsx components/auth/LoginForm.test.tsx
git commit -m "feat: LoginForm com validacao, estados do botao e lembrar-me"
```

---

### Task 5: Página de login + verificação final

**Files:**
- Modify: `app/(auth)/login/page.tsx` (substituir o arquivo inteiro — a lógica antiga migrou para LoginForm)

**Interfaces:**
- Consumes: `LogoEmpresa` (Task 1), `LoginForm` (Task 4).
- Produces: página final. Nada depende dela.

- [ ] **Step 1: Substituir a página**

Substituir `app/(auth)/login/page.tsx` por:

```tsx
import { LogoEmpresa } from '@/components/auth/LogoEmpresa'
import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl bg-white p-8 shadow-2xl shadow-slate-950/40 duration-500 sm:p-10">
      <LogoEmpresa />
      <LoginForm />
    </div>
  )
}
```

Nota: a página vira server component (sem `'use client'`) — toda a interatividade está no `LoginForm`.

- [ ] **Step 2: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS — todos os testes do repo (incluindo `lib/calculos.test.ts` pré-existente).

- [ ] **Step 3: Verificação visual e funcional no browser**

Com o dev server em `http://localhost:3000`:
1. `/login` carrega com card novo (logo, subtítulo, campos com ícones, checkbox, link, botão azul) sobre o fundo técnico, animação de entrada suave.
2. Submeter vazio → mensagens "Informe seu e-mail." / "Informe sua senha." sem requisição.
3. E-mail `abc` + blur → "E-mail inválido.".
4. Toggle do olho mostra/oculta a senha.
5. Login com credencial inválida → mensagem de erro da API.
6. Tab percorre: e-mail → senha → olho → checkbox → link → botão; Enter no campo envia.
7. Responsivo: estreitar a janela (~375px) — card fluido com padding, sem overflow horizontal.
8. `/esqueci-senha`, `/nova-senha`, `/verificar` continuam funcionais sobre o fundo novo.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/page.tsx"
git commit -m "feat: redesign da pagina de login com visual corporativo"
```

---

## Self-Review (executado na escrita do plano)

- **Cobertura da spec:** layout/fundo/rodapé (Task 2), logo+marca (Task 1), campos com ícones e validação (Task 4), toggle senha (Task 3), lembrar-me funcional (Task 4), estados do botão (Task 4), acessibilidade (roles/aria em Tasks 3–4, checagem de teclado em Task 5), responsividade (Task 5), testes (Tasks 1–4), "não muda" respeitado (nenhuma task toca API/middleware/outras páginas).
- **Placeholders:** nenhum — todo step tem código completo.
- **Consistência de tipos:** `MARCA` (1→2), `CampoSenha({ erro })` (3→4), `LogoEmpresa`/`LoginForm` sem props (1,4→5) conferidos.

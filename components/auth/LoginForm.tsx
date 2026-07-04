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

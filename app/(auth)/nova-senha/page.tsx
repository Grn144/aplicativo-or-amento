'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function NovaSenhaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [sessaoOk, setSessaoOk] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    // O Supabase envia o link com ?code=xxx (PKCE flow)
    const code = searchParams.get('code')
    if (!code) {
      setErro('Link inválido ou expirado. Solicite um novo link de recuperação.')
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setErro('Link inválido ou expirado. Solicite um novo link de recuperação.')
      } else {
        setSessaoOk(true)
      }
    })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha !== confirmar) {
      setErro('As senhas não coincidem.')
      return
    }
    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)
    setErro('')

    const { error } = await supabase.auth.updateUser({ password: senha })

    if (error) {
      setErro('Erro ao atualizar senha. Tente novamente.')
      setLoading(false)
      return
    }

    // Sign out para forçar novo login limpo
    await supabase.auth.signOut()
    setPronto(true)
  }

  if (pronto) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Senha atualizada!</CardTitle>
          <CardDescription>
            Sua senha foi redefinida com sucesso. Faça login com a nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.push('/login')}>
            Ir para o login
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>
          Escolha uma nova senha para sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sessaoOk && !erro && (
          <p className="text-sm text-gray-500 text-center py-4">Validando link...</p>
        )}
        {erro && !sessaoOk && (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{erro}</p>
            <Button variant="outline" className="w-full" onClick={() => router.push('/esqueci-senha')}>
              Solicitar novo link
            </Button>
          </div>
        )}
        {sessaoOk && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senha">Nova senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmar">Confirmar nova senha</Label>
              <Input
                id="confirmar"
                type="password"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                placeholder="Repita a senha"
                required
                autoComplete="new-password"
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function VerificarPage() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    try {
      const res = await fetch('/api/auth/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErro(data.error || `Erro ao verificar código (${res.status})`)
        setLoading(false)
        return
      }

      router.push('/obras')
      router.refresh()
    } catch {
      setErro('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  async function handleReenviar() {
    // Volta para login para gerar novo código
    router.push('/login')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <CardDescription>
          Enviamos um código de 6 dígitos para o seu email. Digite-o abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código de verificação</Label>
            <Input
              id="codigo"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center text-2xl tracking-widest font-mono"
              required
              autoFocus
            />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" className="w-full" disabled={loading || codigo.length !== 6}>
            {loading ? 'Verificando...' : 'Verificar'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={handleReenviar}
          >
            Reenviar código
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

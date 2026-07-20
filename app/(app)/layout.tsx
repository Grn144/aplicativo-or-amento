import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { SessaoKeepAlive } from '@/components/layout/SessaoKeepAlive'
import { obterUsuarioComPermissoes } from '@/lib/permissoes/servidor'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)

  return (
    <div className="flex min-h-screen bg-background">
      <SessaoKeepAlive />
      <Sidebar
        usuario={{
          nome: usuario?.nome ?? 'Usuário',
          papel: usuario?.papel ?? 'visitante',
        }}
        permissoes={usuario?.permissoes ?? new Set()}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}

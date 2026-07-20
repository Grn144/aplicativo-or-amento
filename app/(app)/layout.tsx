import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { SessaoKeepAlive } from '@/components/layout/SessaoKeepAlive'
import type { Papel } from '@/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, papel')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-background">
      <SessaoKeepAlive />
      <Sidebar
        usuario={{
          nome: usuario?.nome ?? 'Usuário',
          papel: (usuario?.papel ?? 'visitante') as Papel,
        }}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}

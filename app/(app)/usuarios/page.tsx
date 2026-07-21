import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import UsuariosPageClient from '@/components/usuarios/UsuariosPageClient'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_usuarios')) {
    redirect('/dashboard')
  }

  return <UsuariosPageClient podeAlterarPermissoes={usuario.permissoes.has('alterar_permissoes')} />
}

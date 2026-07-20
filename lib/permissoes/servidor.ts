import { createClient } from '@/lib/supabase/server'
import type { Papel } from '@/types/database'
import { calcularPermissoes, type OverridePermissao } from './resolver'
import type { Permissao } from './matriz'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface UsuarioComPermissoes {
  id: string
  nome: string
  papel: Papel
  permissoes: Set<Permissao>
}

export async function obterUsuarioComPermissoes(
  supabase: SupabaseClient,
  userId: string
): Promise<UsuarioComPermissoes | null> {
  const [{ data: usuario }, { data: overrides }] = await Promise.all([
    supabase.from('usuarios').select('id, nome, papel').eq('id', userId).single(),
    supabase.from('usuario_permissoes').select('permissao, concedida').eq('usuario_id', userId),
  ])
  if (!usuario) return null

  return {
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel as Papel,
    permissoes: calcularPermissoes(usuario.papel as Papel, (overrides ?? []) as OverridePermissao[]),
  }
}

export function requireRole(papel: Papel, ...papeisPermitidos: Papel[]): boolean {
  return papeisPermitidos.includes(papel)
}

export function requirePermission(permissoes: ReadonlySet<Permissao>, chave: Permissao): boolean {
  return permissoes.has(chave)
}

import type { Papel } from '@/types/database'

export const PERMISSOES = [
  'visualizar_dashboard',
  'visualizar_indicadores',
  'editar_clientes',
  'excluir_clientes',
  'criar_obras',
  'editar_obras',
  'excluir_obras',
  'visualizar_custos',
  'editar_custos',
  'visualizar_margem',
  'visualizar_lucro',
  'visualizar_banco_composicoes',
  'cadastrar_composicoes',
  'editar_composicoes',
  'excluir_composicoes',
  'importar_planilhas',
  'exportar_planilhas',
  'cadastrar_usuarios',
  'editar_usuarios',
  'excluir_usuarios',
  'alterar_permissoes',
  'visualizar_auditoria',
  'acessar_configuracoes',
  'backup',
  'restaurar_banco',
] as const

export type Permissao = typeof PERMISSOES[number]

function apenas(...permissoes: Permissao[]): ReadonlySet<Permissao> {
  return new Set(permissoes)
}

export const MATRIZ_PADRAO: Record<Papel, ReadonlySet<Permissao>> = {
  admin: new Set(PERMISSOES),
  gerente: apenas(
    'visualizar_dashboard', 'visualizar_indicadores',
    'editar_clientes',
    'criar_obras', 'editar_obras',
    'visualizar_custos', 'visualizar_margem', 'visualizar_lucro',
    'visualizar_banco_composicoes', 'cadastrar_composicoes', 'editar_composicoes',
    'importar_planilhas', 'exportar_planilhas'
  ),
  orcamentista: apenas(
    'visualizar_dashboard',
    'editar_clientes',
    'criar_obras', 'editar_obras',
    'visualizar_custos',
    'visualizar_banco_composicoes',
    'importar_planilhas', 'exportar_planilhas'
  ),
  comercial: apenas(
    'visualizar_dashboard',
    'exportar_planilhas'
  ),
  financeiro: apenas(
    'visualizar_dashboard', 'visualizar_indicadores',
    'visualizar_custos', 'visualizar_margem', 'visualizar_lucro',
    'visualizar_banco_composicoes',
    'importar_planilhas', 'exportar_planilhas'
  ),
  visitante: apenas('visualizar_dashboard'),
}

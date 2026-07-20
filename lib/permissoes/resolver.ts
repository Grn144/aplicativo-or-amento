import type { Papel } from '@/types/database'
import { MATRIZ_PADRAO, type Permissao } from './matriz'

export interface OverridePermissao {
  permissao: Permissao
  concedida: boolean
}

export function calcularPermissoes(
  papel: Papel,
  overrides: OverridePermissao[] = []
): Set<Permissao> {
  const permissoes = new Set(MATRIZ_PADRAO[papel])
  for (const override of overrides) {
    if (override.concedida) {
      permissoes.add(override.permissao)
    } else {
      permissoes.delete(override.permissao)
    }
  }
  return permissoes
}

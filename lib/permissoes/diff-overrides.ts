import type { Papel } from '@/types/database'
import { PERMISSOES, MATRIZ_PADRAO, type Permissao } from './matriz'
import type { OverridePermissao } from './resolver'

/**
 * Compara o conjunto de permissões desejado para um usuário contra o padrão
 * do papel dele, retornando só as exceções (overrides). Usado ao salvar a
 * aba Permissões: mantém usuario_permissoes só com desvios reais do papel.
 */
export function calcularOverrides(
  papel: Papel,
  permissoesDesejadas: ReadonlySet<Permissao>
): OverridePermissao[] {
  const padrao = MATRIZ_PADRAO[papel]
  const overrides: OverridePermissao[] = []
  for (const chave of PERMISSOES) {
    const noPadrao = padrao.has(chave)
    const desejada = permissoesDesejadas.has(chave)
    if (noPadrao !== desejada) {
      overrides.push({ permissao: chave, concedida: desejada })
    }
  }
  return overrides
}

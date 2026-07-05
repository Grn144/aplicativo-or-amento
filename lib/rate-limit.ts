import { createAdminClient } from '@/lib/supabase/server'

const JANELA_MS = 15 * 60 * 1000 // 15 minutos

/**
 * Janela fixa de tentativas por chave (ex.: "login:email@x.com").
 * Retorna false quando o limite foi atingido dentro da janela.
 * Fail-open: se o banco falhar, permite e loga — indisponibilidade de
 * infra não pode trancar usuários legítimos para fora.
 */
export async function verificarRateLimit(chave: string, maxTentativas: number): Promise<boolean> {
  try {
    const admin = await createAdminClient()
    const agora = new Date()

    const { data: registro } = await admin
      .from('rate_limit')
      .select('contagem, janela_inicio')
      .eq('chave', chave)
      .maybeSingle()

    const janelaExpirada =
      !registro || agora.getTime() - new Date(registro.janela_inicio).getTime() > JANELA_MS

    if (janelaExpirada) {
      await admin
        .from('rate_limit')
        .upsert({ chave, contagem: 1, janela_inicio: agora.toISOString() })
      return true
    }

    if (registro.contagem >= maxTentativas) {
      return false
    }

    await admin.from('rate_limit').update({ contagem: registro.contagem + 1 }).eq('chave', chave)
    return true
  } catch (e) {
    console.error('[rate-limit] falha ao verificar, permitindo:', e instanceof Error ? e.message : e)
    return true
  }
}

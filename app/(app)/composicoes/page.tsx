import { createClient } from '@/lib/supabase/server'
import ComposicoesPageClient from '@/components/composicoes/ComposicoesPageClient'

export default async function ComposicoesPage() {
  const supabase = await createClient()
  const [disciplinasResult, unidadesResult] = await Promise.all([
    supabase.from('disciplinas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('unidades_medida').select('id, sigla').order('sigla'),
  ])

  return (
    <ComposicoesPageClient
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
    />
  )
}

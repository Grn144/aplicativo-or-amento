'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const TABELAS = ['obras', 'grupos_orcamento', 'itens_orcamento', 'historico_alteracoes']

export function RealtimeRefresh() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let canal = supabase.channel('dashboard-realtime')
    for (const tabela of TABELAS) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela },
        () => {
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => {
            router.refresh()
            toast('Dados atualizados', { duration: 2000 })
          }, 2000)
        }
      )
    }
    canal.subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(canal)
    }
  }, [router])

  return null
}

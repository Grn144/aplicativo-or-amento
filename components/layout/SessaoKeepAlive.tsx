'use client'

import { useEffect, useRef } from 'react'

// Intervalo mínimo entre pings ao servidor. A atividade do usuário é observada
// continuamente, mas só renovamos a sessão no máximo uma vez a cada 5 minutos —
// suficiente para manter viva a janela de 30 min sem gerar tráfego desnecessário.
const INTERVALO_MS = 5 * 60 * 1000

export function SessaoKeepAlive() {
  const ultimoPing = useRef(0)

  useEffect(() => {
    async function pingar() {
      const agora = Date.now()
      if (agora - ultimoPing.current < INTERVALO_MS) return
      ultimoPing.current = agora
      try {
        await fetch('/api/auth/keep-alive', { method: 'POST' })
      } catch {
        // silencioso: se a rede falhar, a sessão simplesmente expira no tempo normal
      }
    }

    const eventos: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll']
    for (const ev of eventos) window.addEventListener(ev, pingar, { passive: true })
    return () => {
      for (const ev of eventos) window.removeEventListener(ev, pingar)
    }
  }, [])

  return null
}

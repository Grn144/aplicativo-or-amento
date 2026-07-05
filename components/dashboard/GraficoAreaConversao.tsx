'use client'

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardGrafico } from './CardGrafico'

export function GraficoAreaConversao({
  dados,
}: { dados: { mes: string; criados: number; enviados: number; aprovados: number }[] }) {
  const vazio = dados.every(d => d.criados === 0)
  return (
    <CardGrafico titulo="Conversão de Orçamentos" vazio={vazio}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados}>
          <defs>
            {(['criados', 'enviados', 'aprovados'] as const).map((k, i) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--chart-${i + 1})`} stopOpacity={0.35} />
                <stop offset="100%" stopColor={`var(--chart-${i + 1})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
          <Area type="monotone" dataKey="criados" name="Criados" stroke="var(--chart-1)" fill="url(#grad-criados)" strokeWidth={2} />
          <Area type="monotone" dataKey="enviados" name="Enviados" stroke="var(--chart-2)" fill="url(#grad-enviados)" strokeWidth={2} />
          <Area type="monotone" dataKey="aprovados" name="Aprovados" stroke="var(--chart-3)" fill="url(#grad-aprovados)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}

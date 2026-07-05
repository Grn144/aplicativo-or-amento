'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardGrafico } from './CardGrafico'

export function GraficoBarrasMensal({ dados }: { dados: { mes: string; quantidade: number }[] }) {
  const vazio = dados.every(d => d.quantidade === 0)
  return (
    <CardGrafico titulo="Orçamentos por Mês" vazio={vazio}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
          <Bar dataKey="quantidade" name="Orçamentos" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}

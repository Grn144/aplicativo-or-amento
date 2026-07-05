'use client'

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '@/lib/format'
import { CardGrafico } from './CardGrafico'

export function GraficoLinhaFinanceiro({
  dados,
}: { dados: { mes: string; orcado: number; aprovado: number; custo: number }[] }) {
  const vazio = dados.every(d => d.orcado === 0 && d.aprovado === 0 && d.custo === 0)
  const fmtEixo = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))
  return (
    <CardGrafico titulo="Evolução Financeira" vazio={vazio}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtEixo} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v) => `R$ ${fmt(Number(v))}`}
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
          <Line type="monotone" dataKey="orcado" name="Valor orçado" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="aprovado" name="Valor aprovado" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="custo" name="Custo previsto" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}

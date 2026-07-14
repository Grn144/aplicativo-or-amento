'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardGrafico } from '@/components/dashboard/CardGrafico'

export function GraficoBarrasUsoMensal({ dados }: { dados: { mes: string; quantidade: number }[] }) {
  const vazio = dados.every(d => d.quantidade === 0)
  return (
    <CardGrafico titulo="Uso Mensal (últimos 12 meses)" vazio={vazio} mensagemVazio="Nenhum uso registrado nos últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Bar dataKey="quantidade" name="Usos" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}

'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { StatusObra } from '@/types/database'
import { CardGrafico } from './CardGrafico'

const COR_POR_STATUS: Record<StatusObra, string> = {
  rascunho: 'var(--muted-foreground)',
  enviado: 'var(--chart-3)',
  aprovado: 'var(--chart-2)',
  em_execucao: 'var(--chart-1)',
  concluido: 'var(--chart-5)',
  cancelado: 'var(--chart-4)',
}

export function GraficoPizzaStatus({
  dados,
}: { dados: { status: StatusObra; label: string; quantidade: number }[] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0)
  return (
    <CardGrafico titulo="Status dos Orçamentos" vazio={total === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={dados}
            dataKey="quantidade"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {dados.map(d => (
              <Cell key={d.status} fill={COR_POR_STATUS[d.status]} stroke="var(--card)" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}

'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CardGrafico } from '@/components/dashboard/CardGrafico'

const CORES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function GraficoPizzaDisciplinas({ dados }: { dados: { nome: string; quantidade: number }[] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0)
  return (
    <CardGrafico titulo="Composições por Disciplina" vazio={total === 0} mensagemVazio="Nenhuma composição cadastrada">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={dados}
            dataKey="quantidade"
            nameKey="nome"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {dados.map((d, i) => (
              <Cell key={d.nome} fill={CORES[i % CORES.length]} stroke="var(--card)" />
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

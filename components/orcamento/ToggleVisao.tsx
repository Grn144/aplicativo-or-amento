'use client'

import type { TipoVisao } from '@/types/orcamento'

interface Props {
  visao: TipoVisao
  onChange: (v: TipoVisao) => void
}

export default function ToggleVisao({ visao, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
      <button
        onClick={() => onChange('comercial')}
        className={`px-4 py-2 transition-colors ${
          visao === 'comercial'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Comercial
      </button>
      <button
        onClick={() => onChange('tecnica')}
        className={`px-4 py-2 transition-colors border-l border-gray-300 ${
          visao === 'tecnica'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Técnica
      </button>
    </div>
  )
}

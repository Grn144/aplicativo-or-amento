export type Papel = 'admin' | 'engenheiro' | 'orcamentista' | 'visualizador'
export type StatusObra = 'rascunho' | 'enviado' | 'aprovado' | 'em_execucao' | 'concluido' | 'cancelado'

export interface Cliente {
  id: string
  razao_social: string
  cnpj: string | null
  endereco: string | null
  criado_em: string
}

export interface Usuario {
  id: string
  nome: string
  email: string
  papel: Papel
  ativo: boolean
  criado_em: string
}

export interface Disciplina {
  id: string
  nome: string
  ativo: boolean
}

export interface UnidadeMedida {
  id: string
  sigla: string
  descricao: string | null
}

export interface Obra {
  id: string
  cliente_id: string
  codigo: string
  nome: string
  data_orcamento: string | null
  status: StatusObra
  fee_fator: number
  comissao_pct: number
  imposto_pct: number
  criado_por: string | null
  criado_em: string
  atualizado_em: string
  clientes?: Cliente
  usuarios?: Pick<Usuario, 'id' | 'nome'>
}

export interface GrupoOrcamento {
  id: string
  obra_id: string
  disciplina_id: string
  letra: string
  ordem: number
  disciplinas?: Disciplina
  itens_orcamento?: ItemOrcamento[]
}

export interface ItemOrcamento {
  id: string
  grupo_id: string
  numero: number
  descricao: string
  local: string | null
  unidade_id: string | null
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  markup_mao_obra: number
  markup_material: number
  observacao: string | null
  observacao_2: string | null
  ordem: number
  unidades_medida?: UnidadeMedida
}

export interface HistoricoAlteracao {
  id: string
  obra_id: string
  usuario_id: string
  campo: string
  valor_anterior: string | null
  valor_novo: string | null
  alterado_em: string
  usuarios?: Pick<Usuario, 'nome'>
}

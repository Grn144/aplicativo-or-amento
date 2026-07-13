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
  comissao_valor: number
  imposto_valor: number
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
  fee_mao_obra: number | null
  fee_material: number | null
  observacao: string | null
  observacao_2: string | null
  ordem: number
  composicao_id: string | null
  composicao_versao: number | null
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

export interface Composicao {
  id: string
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  custo_direto: number
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  versao: number
  ativo: boolean
  responsavel_id: string | null
  criado_em: string
  atualizado_em: string
  disciplinas?: Pick<Disciplina, 'id' | 'nome'> | null
  unidades_medida?: Pick<UnidadeMedida, 'id' | 'sigla'> | null
  favorito?: boolean
  total_usos?: number
  ultimo_uso?: string | null
}

export interface ComposicaoMaterial {
  id: string
  composicao_id: string
  descricao: string
  quantidade: number
  unidade_id: string | null
  fornecedor: string | null
  preco_unitario: number
  ordem: number
  unidades_medida?: Pick<UnidadeMedida, 'id' | 'sigla'> | null
}

export interface ComposicaoMaoObra {
  id: string
  composicao_id: string
  cargo: string
  horas: number
  custo_hora: number
  ordem: number
}

export interface ComposicaoVersao {
  id: string
  composicao_id: string
  versao: number
  usuario_id: string | null
  criado_em: string
  usuarios?: Pick<Usuario, 'nome'> | null
}

export interface ComposicaoCompleta extends Composicao {
  composicao_materiais: ComposicaoMaterial[]
  composicao_mao_obra: ComposicaoMaoObra[]
}

export interface ComposicaoUso {
  id: string
  composicao_id: string
  composicao_versao: number
  obra_id: string
  usuario_id: string | null
  criado_em: string
  obras?: Pick<Obra, 'codigo' | 'nome'> | null
  usuarios?: Pick<Usuario, 'nome'> | null
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('razao_social')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { razao_social, cnpj, endereco } = body

  if (!razao_social?.trim()) {
    return NextResponse.json({ error: 'Razão social é obrigatória' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ razao_social: razao_social.trim(), cnpj: cnpj ?? null, endereco: endereco ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

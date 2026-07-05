import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  try { await supabase.auth.signOut() } catch { /* falha no signOut não impede limpeza do cookie */ }

  const response = NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_APP_URL!)
  )
  response.cookies.delete('mfa_verificado')
  response.cookies.delete('mfa_em_andamento')
  return response
}

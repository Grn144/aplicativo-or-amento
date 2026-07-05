import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/verificar') ||
    pathname.startsWith('/esqueci-senha') ||
    pathname.startsWith('/nova-senha')
  // Páginas públicas: acessíveis com ou sem sessão, sem redirecionamentos
  const isPublica = pathname.startsWith('/privacidade')

  const mfaVerificado = request.cookies.get('mfa_verificado')?.value === 'true'
  // Cookie de sessão setado após login, antes de completar o MFA
  const mfaEmAndamento = request.cookies.get('mfa_em_andamento')?.value === 'true'

  // Sem sessão Supabase → login
  if (!user && !isAuthPage && !isPublica) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Tem sessão Supabase mas sem mfa_verificado
  if (user && !mfaVerificado && !isAuthPage && !isPublica) {
    // Permitir apenas se o MFA estiver em andamento e estiver indo para /verificar
    if (mfaEmAndamento && pathname === '/verificar') {
      return supabaseResponse
    }
    // Caso contrário: sessão antiga (browser reaberto) → deslogar e ir para login
    await supabase.auth.signOut()
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('mfa_em_andamento')
    res.cookies.delete('mfa_verificado')
    return res
  }

  // Já autenticado com MFA → não precisa de páginas de auth
  if (user && mfaVerificado && isAuthPage) {
    return NextResponse.redirect(new URL('/obras', request.url))
  }

  // Raiz
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(user && mfaVerificado ? '/obras' : '/login', request.url)
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

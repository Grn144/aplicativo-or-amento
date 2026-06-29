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
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/verificar')
  const mfaVerificado = request.cookies.get('mfa_verificado')?.value === 'true'

  // Sem sessão → login
  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Com sessão mas MFA pendente → verificar
  if (user && !mfaVerificado && pathname !== '/verificar' && !pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/verificar', request.url))
  }

  // Já autenticado com MFA → redireciona para obras
  if (user && mfaVerificado && isAuthPage) {
    return NextResponse.redirect(new URL('/obras', request.url))
  }

  // Redireciona raiz para obras ou login
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

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, papel')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="font-bold text-sm uppercase tracking-wide">Orçamentos</h1>
          <p className="text-xs text-gray-400 mt-1">{usuario?.nome}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <Link
            href="/obras"
            className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-700 transition-colors"
          >
            Obras
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-700 transition-colors"
          >
            Dashboard
          </Link>
          {(usuario?.papel === 'admin' || usuario?.papel === 'engenheiro' || usuario?.papel === 'orcamentista') && (
            <Link
              href="/admin/disciplinas"
              className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-700 transition-colors"
            >
              Cadastros
            </Link>
          )}
        </nav>
        <div className="p-2 border-t border-gray-700">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}

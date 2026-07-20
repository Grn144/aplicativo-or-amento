'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Boxes, Building2, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserCog, Users, X,
} from 'lucide-react'
import { MARCA } from '@/components/auth/marca'
import type { Papel } from '@/types/database'
import type { Permissao } from '@/lib/permissoes/matriz'

export const PAPEL_LABELS: Record<Papel, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  orcamentista: 'Orçamentista',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  visitante: 'Visitante',
}

const ITENS = [
  { href: '/dashboard', label: 'Dashboard', Icone: LayoutDashboard },
  { href: '/obras', label: 'Obras', Icone: Building2 },
  { href: '/composicoes', label: 'Composições', Icone: Boxes },
  { href: '/clientes', label: 'Clientes', Icone: Users },
]

export function Sidebar({
  usuario, permissoes,
}: { usuario: { nome: string; papel: Papel }; permissoes: ReadonlySet<Permissao> }) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [colapsada, setColapsada] = useState(false)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    setColapsada(localStorage.getItem('sidebar-colapsada') === 'true')
    setMontado(true)
  }, [])

  const escuro = montado && resolvedTheme === 'dark'

  function alternarColapso() {
    const nova = !colapsada
    setColapsada(nova)
    localStorage.setItem('sidebar-colapsada', String(nova))
  }

  const iniciais = usuario.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('')

  const itens = permissoes.has('editar_usuarios')
    ? [...ITENS, { href: '/usuarios', label: 'Usuários', Icone: UserCog }]
    : ITENS

  const conteudo = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-sidebar-border p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
          <Building2 className="size-5 text-white" aria-hidden="true" />
        </div>
        {!colapsada && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{MARCA.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{MARCA.subtitulo}</p>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1 p-2">
        {itens.map(({ href, label, Icone }) => {
          const ativo = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={colapsada ? label : undefined}
              onClick={() => setDrawerAberto(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                ativo
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icone className="size-5 shrink-0" aria-hidden="true" />
              {!colapsada && label}
            </Link>
          )
        })}
      </nav>

      {/* Tema claro/escuro */}
      <button
        type="button"
        onClick={() => setTheme(escuro ? 'light' : 'dark')}
        title={colapsada ? 'Alternar tema' : undefined}
        aria-label="Alternar tema"
        className="mx-2 mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {escuro ? <Sun className="size-5 shrink-0" /> : <Moon className="size-5 shrink-0" />}
        {!colapsada && (escuro ? 'Tema claro' : 'Tema escuro')}
      </button>

      {/* Colapsar (só desktop) */}
      <button
        type="button"
        onClick={alternarColapso}
        className="mx-2 mb-2 hidden items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent md:flex"
        aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
      >
        {colapsada ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        {!colapsada && 'Recolher'}
      </button>

      {/* Perfil */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
            {iniciais}
          </div>
          {!colapsada && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{usuario.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{PAPEL_LABELS[usuario.papel]}</p>
            </div>
          )}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              title="Sair"
              aria-label="Sair"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
        {!colapsada && (
          <Link
            href="/privacidade"
            className="mt-2 block text-center text-xs text-muted-foreground hover:underline"
          >
            Privacidade
          </Link>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Botão hambúrguer mobile */}
      <button
        type="button"
        onClick={() => setDrawerAberto(true)}
        aria-label="Abrir menu"
        className="fixed left-4 top-4 z-40 rounded-xl border border-border bg-card p-2 shadow-sm md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Drawer mobile */}
      {drawerAberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border">
            <button
              type="button"
              onClick={() => setDrawerAberto(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-2 z-10 rounded-lg p-2 text-muted-foreground"
            >
              <X className="size-5" />
            </button>
            {conteudo}
          </aside>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside
        className={`hidden shrink-0 border-r border-sidebar-border transition-all md:block ${
          colapsada ? 'w-16' : 'w-60'
        }`}
      >
        {conteudo}
      </aside>
    </>
  )
}

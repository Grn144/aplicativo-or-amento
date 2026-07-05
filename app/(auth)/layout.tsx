import { BlueprintBackground } from '@/components/auth/BlueprintBackground'
import { MARCA } from '@/components/auth/marca'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tema-claro-fixo relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-linear-to-b from-slate-800 via-slate-900 to-slate-950 px-4 py-10">
      <BlueprintBackground />
      <main className="relative z-10 w-full max-w-md">{children}</main>
      <footer className="relative z-10 mt-8 text-center text-xs text-slate-400">
        © 2026 {MARCA.nome} · Versão {MARCA.versao} ·{' '}
        <a href="/privacidade" className="underline hover:text-slate-200">
          Privacidade
        </a>
      </footer>
    </div>
  )
}

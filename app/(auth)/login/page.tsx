import { LogoEmpresa } from '@/components/auth/LogoEmpresa'
import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl bg-white p-8 shadow-2xl shadow-slate-950/40 duration-500 sm:p-10">
      <LogoEmpresa />
      <LoginForm />
    </div>
  )
}

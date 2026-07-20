import Link from 'next/link'
import type { Metadata } from 'next'
import { MARCA } from '@/components/auth/marca'

export const metadata: Metadata = {
  title: `Aviso de Privacidade — ${MARCA.nome}`,
  description: 'Como este sistema trata dados pessoais, em conformidade com a LGPD.',
}

const CONTATO_PRIVACIDADE = 'guley10gustavo@gmail.com'
const ULTIMA_ATUALIZACAO = '05/07/2026'

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="text-blue-600 hover:underline dark:text-blue-400">
              ← Voltar
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Aviso de Privacidade</h1>
          <p className="text-sm text-muted-foreground">
            {MARCA.nome} · Última atualização: {ULTIMA_ATUALIZACAO}
          </p>
        </header>

        <Secao titulo="1. O que é este sistema">
          <p>
            O {MARCA.nome} é um sistema interno de gestão de orçamentos de obras de engenharia,
            de uso restrito a usuários autorizados. Este aviso explica, em linguagem simples,
            quais dados pessoais o sistema trata e por quê, em atenção à Lei Geral de Proteção
            de Dados (Lei nº 13.709/2018 — LGPD).
          </p>
        </Secao>

        <Secao titulo="2. Quais dados tratamos">
          <p>
            <strong className="text-foreground">Dados de usuários do sistema:</strong> nome,
            e-mail corporativo, papel de acesso (ex.: administrador, gerente) e registros de
            atividade (quem alterou o quê e quando nos orçamentos). São necessários para
            autenticação, controle de acesso e rastreabilidade das alterações.
          </p>
          <p>
            <strong className="text-foreground">Dados de clientes:</strong> razão social, CNPJ e
            endereço de empresas contratantes. Por serem dados de pessoas jurídicas, em regra não
            constituem dados pessoais sob a LGPD, mas recebem o mesmo padrão de proteção.
          </p>
          <p>
            <strong className="text-foreground">Cookies e armazenamento local:</strong> usamos
            apenas cookies essenciais de sessão e verificação em duas etapas (sem cookies de
            publicidade ou rastreamento). A opção &quot;Lembrar-me&quot; guarda o seu e-mail
            somente no seu próprio dispositivo, e é apagada ao desmarcá-la. Preferências de tema
            e de menu também ficam apenas no seu dispositivo.
          </p>
        </Secao>

        <Secao titulo="3. Para que usamos e com que base legal">
          <p>
            Autenticação e segurança da conta (execução de contrato e legítimo interesse);
            registro de alterações em orçamentos para auditoria interna (legítimo interesse);
            envio de códigos de verificação e links de redefinição de senha por e-mail
            (execução de contrato). Não usamos os dados para publicidade nem os vendemos.
          </p>
        </Secao>

        <Secao titulo="4. Com quem os dados são compartilhados">
          <p>
            Os dados ficam hospedados em provedores que atuam como operadores em nosso nome:
            Supabase (banco de dados e autenticação) e Resend (envio de e-mails transacionais).
            Cada um trata os dados conforme seus próprios acordos de processamento de dados.
            Não há compartilhamento com terceiros para fins comerciais.
          </p>
        </Secao>

        <Secao titulo="5. Como protegemos">
          <p>
            Acesso mediante senha e verificação em duas etapas por e-mail; controle de permissões
            por papel aplicado diretamente no banco de dados; comunicação criptografada (HTTPS);
            limite de tentativas nas rotas de autenticação; e registros de servidor sem dados
            pessoais.
          </p>
        </Secao>

        <Secao titulo="6. Por quanto tempo guardamos">
          <p>
            Dados de usuários são mantidos enquanto durar o vínculo com a empresa. Orçamentos e
            seus históricos são mantidos pelo período necessário a obrigações contratuais e
            fiscais. Contas desativadas têm o acesso revogado imediatamente.
          </p>
        </Secao>

        <Secao titulo="7. Seus direitos">
          <p>
            Nos termos do art. 18 da LGPD, você pode solicitar confirmação de tratamento, acesso,
            correção, anonimização ou exclusão dos seus dados pessoais, entre outros direitos.
            Para exercê-los, escreva para{' '}
            <a
              href={`mailto:${CONTATO_PRIVACIDADE}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {CONTATO_PRIVACIDADE}
            </a>
            . Responderemos no prazo legal.
          </p>
        </Secao>

        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
          © 2026 {MARCA.nome} · Versão {MARCA.versao}
        </footer>
      </main>
    </div>
  )
}

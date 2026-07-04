# Redesign da Tela de Login — Design

**Data:** 2026-07-04
**Status:** Aprovado pelo usuário

## Objetivo

Redesenhar a tela de login com visual corporativo premium para um sistema de engenharia, mantendo intacto o fluxo de autenticação existente (login → OTP em `/verificar`). Escopo visual: fundo novo em todas as telas de auth (layout compartilhado), card redesenhado apenas no login.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Marca | Nome genérico + logo SVG criado em código (fácil de trocar depois) |
| Escopo | Fundo e rodapé no layout compartilhado `(auth)`; card redesenhado só no login |
| Animações | Somente CSS/Tailwind (tw-animate-css já instalado) — **não** instalar Framer Motion |
| Lembrar-me | Funcional: salva o e-mail em `localStorage` e pré-preenche no próximo acesso |
| Background | Gradiente azul-escuro `#0F172A` + SVG inline de planta técnica em baixa opacidade |

## Paleta

- Azul escuro (fundo): `#0F172A`
- Branco (card): `#FFFFFF`
- Cinza claro (superfícies secundárias): `#F5F7FA`
- Azul (botões/acentos): `#2563EB`

## Arquitetura de componentes

```
app/(auth)/layout.tsx            → fundo gradiente + BlueprintBackground + rodapé
app/(auth)/login/page.tsx        → composição: LogoEmpresa + LoginForm
components/auth/BlueprintBackground.tsx  → SVG decorativo (aria-hidden)
components/auth/LogoEmpresa.tsx          → logo SVG + nome + subtítulo
components/auth/LoginForm.tsx            → formulário com lógica de auth
components/auth/CampoSenha.tsx           → input senha com toggle mostrar/ocultar
```

### 1. Layout compartilhado (`app/(auth)/layout.tsx`)

- Gradiente azul-escuro cobrindo a viewport (`#0F172A`, levemente mais claro no topo).
- `BlueprintBackground`: SVG inline atrás do conteúdo com linhas de planta baixa (paredes, cotas, círculos de compasso, grid estrutural) em branco, opacidade 5–8%, `aria-hidden="true"`, `pointer-events-none`.
- Conteúdo centralizado vertical/horizontalmente; `max-w-md`, padding lateral no mobile.
- Rodapé na base, discreto (`text-slate-400`): "© 2026 Sistema de Orçamentos · Versão 1.0".
- Nome da empresa/sistema definido em uma constante única (`components/auth/marca.ts` ou similar) usada pelo logo e pelo rodapé — trocar o nome depois é editar um único lugar.
- `/verificar`, `/esqueci-senha` e `/nova-senha` herdam o fundo sem alteração nos seus cards.

### 2. Card de login

- Card branco, `rounded-2xl`, sombra suave ampla, animação de entrada fade-in + leve subida (CSS).
- `LogoEmpresa`: ícone de edifício/estrutura em traço geométrico dentro de quadrado arredondado azul `#2563EB`; nome "Sistema de Orçamentos" em destaque (vindo da constante de marca); subtítulo "Sistema Corporativo de Engenharia".
- `LoginForm` mantém o fluxo atual: POST `/api/auth/login` → sucesso → `router.push('/verificar')`.

### 3. Campos e validação

- **E-mail**: ícone `Mail` dentro do input (esquerda), placeholder "Digite seu e-mail". Validação em tempo real no blur (regex de formato). Erros: "Informe seu e-mail." (vazio), "E-mail inválido." (formato).
- **Senha** (`CampoSenha`): ícone `Lock`, placeholder "Digite sua senha", botão mostrar/ocultar (`Eye`/`EyeOff`) com `aria-label`. Erro: "Informe sua senha." (vazio).
- Submit bloqueado no cliente com campos vazios/inválidos (validação antes do fetch).
- Erro do servidor: "Usuário ou senha incorretos." (ou mensagem retornada pela API).
- Mensagens de erro com `role="alert"` e vinculadas ao campo via `aria-describedby`; borda vermelha no campo inválido.

### 4. Opções e botão

- Linha com checkbox "Lembrar-me" (esquerda) e link "Esqueci minha senha" → `/esqueci-senha` (direita).
- Lembrar-me: marcado ao submeter com sucesso, salva o e-mail em `localStorage`; no mount, pré-preenche o e-mail e marca o checkbox se houver valor salvo; desmarcado, remove o valor.
- Botão "Entrar": largura total, `#2563EB`, hover mais escuro, transição suave. Estados:
  1. Normal: "Entrar"
  2. Carregando: spinner `Loader2` girando + "Entrando..." (desabilitado)
  3. Sucesso: ícone check + "Autenticado!" exibido brevemente antes do redirect

### 5. UX e acessibilidade

- Labels visíveis associadas via `htmlFor`; navegação completa por Tab; Enter envia (comportamento nativo de `<form>`); foco visível com ring azul.
- `autoComplete="email"` / `autoComplete="current-password"`.
- Contraste AA no fundo escuro e dentro do card.
- Responsivo: desktop, tablet e smartphone (card fluido com `max-w-md` + padding).

### 6. Fora do escopo (não muda)

- API de auth (`/api/auth/login`), fluxo OTP, middleware.
- Páginas `/verificar`, `/esqueci-senha`, `/nova-senha` (apenas herdam o fundo novo).
- Nenhuma dependência nova.
- Segurança (JWT/sessão, CSRF, bloqueio de tentativas, 2FA) permanece responsabilidade do backend existente (Supabase + OTP por e-mail); a tela apenas se mantém compatível.

### 7. Testes

Teste de componente (Vitest + Testing Library) para `LoginForm`:

- Não envia com campos vazios; exibe "Informe seu e-mail." / "Informe sua senha."
- Exibe "E-mail inválido." para formato incorreto (no blur).
- Toggle mostrar/ocultar senha alterna o `type` do input.
- Estado de loading: botão desabilitado com "Entrando..." durante o fetch.
- Sucesso: chama `/api/auth/login` com e-mail/senha e redireciona para `/verificar`.
- Lembrar-me: salva/pré-preenche e-mail via `localStorage`.

# Política Interna de Tratamento de Dados — Sistema de Orçamentos

> **MINUTA PARA REVISÃO** — este documento é um ponto de partida técnico e **não substitui
> parecer jurídico**. Antes de considerá-lo vigente: (1) preencher os campos [ENTRE COLCHETES],
> (2) validar com advogado(a) de proteção de dados se o sistema atender terceiros ou crescer.

**Controlador:** [RAZÃO SOCIAL DA EMPRESA — CNPJ]
**Responsável pelo tratamento (encarregado/contato):** [NOME] — guley10gustavo@gmail.com
**Última atualização:** 05/07/2026

---

## 1. Inventário de dados e bases legais

| Dado | Titular | Finalidade | Base legal (LGPD art. 7º) | Onde vive |
|---|---|---|---|---|
| Nome, e-mail, papel de acesso | Usuário interno | Autenticação e controle de acesso | Execução de contrato (V) / Legítimo interesse (IX) | Supabase — tabelas `auth.users`, `usuarios` |
| Registros de atividade (campo alterado, valor anterior/novo, autor, data) | Usuário interno | Auditoria e rastreabilidade de orçamentos | Legítimo interesse (IX) | Supabase — `historico_alteracoes` |
| E-mail no "Lembrar-me" | Usuário interno | Conveniência de login | Consentimento (I) — opt-in por checkbox, revogável ao desmarcar | Somente no navegador do titular (localStorage) |
| Códigos MFA e links de redefinição | Usuário interno | Verificação em duas etapas / recuperação de conta | Execução de contrato (V) | Supabase (`mfa_pendente`, tokens de recovery) + trânsito via Resend |
| Razão social, CNPJ, endereço | Cliente (pessoa jurídica) | Identificação do contratante nos orçamentos | Dados de PJ — fora do escopo da LGPD; tratados com o mesmo padrão de segurança | Supabase — `clientes` |
| Contagem de tentativas de login | (chave técnica por e-mail) | Prevenção de abuso (rate limiting) | Legítimo interesse (IX) | Supabase — `rate_limit` (janela de 15 min) |

**Não tratamos:** dados sensíveis (art. 5º, II), dados de menores, cookies de publicidade,
analytics de terceiros.

## 2. Operadores (art. 39)

| Operador | Serviço | O que processa | Providência |
|---|---|---|---|
| Supabase Inc. | Banco de dados + autenticação | Todos os dados do sistema | [ ] Aceitar/arquivar o DPA (supabase.com/legal/dpa) |
| Resend Inc. | E-mails transacionais | E-mail do destinatário + conteúdo do e-mail | [ ] Aceitar/arquivar o DPA (resend.com/legal/dpa) |
| Vercel Inc. (quando em produção) | Hospedagem da aplicação | Tráfego da aplicação (dados em trânsito) | [ ] Aceitar/arquivar o DPA (vercel.com/legal/dpa) |

Transferência internacional: os três operadores hospedam fora do Brasil — amparada pelos
respectivos DPAs com cláusulas contratuais padrão (art. 33, IX). Banco de dados do projeto:
região São Paulo (sa-east-1).

## 3. Medidas de segurança implementadas (art. 46)

- Autenticação com senha + verificação em duas etapas por e-mail (código de 6 dígitos, CSPRNG, expira em 10 min, máx. 5 tentativas)
- Row Level Security no banco: permissões por papel aplicadas independentemente do frontend
- Cadastro público desabilitado — contas criadas apenas pelo administrador
- Rate limiting nas rotas de autenticação (5 tentativas/15 min por e-mail)
- Links de redefinição de senha de uso único com expiração (≤ 1 h)
- HTTPS em todo o tráfego; cookies httpOnly/secure/sameSite
- Logs de servidor sem dados pessoais (apenas UUIDs e mensagens de erro)
- Respostas de erro que não revelam se um e-mail está cadastrado (anti-enumeração)

## 4. Retenção e descarte

| Dado | Prazo | Gatilho de descarte |
|---|---|---|
| Conta de usuário | Enquanto durar o vínculo | Desligamento → marcar `ativo=false` de imediato; excluir a conta após [90 dias] |
| Histórico de alterações | [5 anos] junto ao orçamento | Exclusão do orçamento (cascata) |
| Orçamentos | Prazos contratuais/fiscais — [5 anos após conclusão] | Revisão anual |
| Códigos MFA | 10 minutos | Automático (expiração + uso único) |
| Registros de rate limit | 15 minutos | Janela expira e é sobrescrita |

## 5. Atendimento a direitos do titular (art. 18)

Canal: guley10gustavo@gmail.com · Prazo de resposta: 15 dias.

Processo (manual, executado pelo administrador):
1. **Acesso/confirmação:** consultar as tabelas `usuarios` e `historico_alteracoes` no painel do Supabase e exportar os registros do titular.
2. **Correção:** editar o registro em `usuarios` (ou via painel Auth para e-mail).
3. **Exclusão:** remover a conta em Authentication → Users (cascata remove `usuarios`); avaliar anonimização do `historico_alteracoes` (trocar referência do autor por "usuário removido") quando a exclusão total conflitar com a auditoria — registrar a ponderação de legítimo interesse.
4. Registrar cada solicitação e resposta em [PLANILHA/PASTA DE REGISTRO].

## 6. Incidentes (art. 48)

Em caso de vazamento ou acesso não autorizado: conter (revogar sessões/chaves no Supabase),
avaliar dados afetados, registrar linha do tempo, e — se houver risco relevante aos titulares —
comunicar a ANPD e os titulares. Responsável: [NOME].

## 7. Pendências para conformidade plena

- [ ] Preencher os campos [ENTRE COLCHETES] e validar prazos de retenção
- [ ] Aceitar/arquivar os DPAs dos três operadores
- [ ] Publicar o aviso de privacidade (já disponível em `/privacidade` no sistema)
- [ ] Definir onde as solicitações de titulares serão registradas
- [ ] Revisão jurídica desta política

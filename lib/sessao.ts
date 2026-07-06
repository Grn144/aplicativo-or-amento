// Tempo de inatividade até exigir novo login (em segundos).
// O cookie mfa_verificado usa este TTL e é renovado a cada requisição de
// página no middleware — enquanto houver atividade, a sessão continua; após
// este período sem uso (ou ao reabrir o app depois dele), o login é exigido.
export const MFA_TTL_SEGUNDOS = 30 * 60 // 30 minutos

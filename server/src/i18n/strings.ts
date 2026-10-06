// Todos os textos que o servidor devolve ao usuário, num lugar só. A interface
// tem o seu próprio (web/src/i18n/strings.ts). Centralizar é o que permite
// traduzir depois sem caçar strings pelo código.
export const t = {
  oauth: {
    network: (m: string) => `Não consegui falar com o Google: ${m}`,
    invalidGrant: 'O Google recusou a autorização (invalid_grant): o acesso expirou ou foi revogado. Reconecte a conta.',
    invalidClient: 'O Google não reconheceu o ID ou o segredo do cliente. Confira o que foi colado na configuração.',
    tokenHttp: (status: number, detail: string) => `O Google respondeu ${status} ao pedir o token: ${detail}`,
    noRefreshToken:
      'O Google não devolveu um refresh token. Remova o acesso do RiftDrive em myaccount.google.com/permissions e tente de novo.',
    accessDenied: 'Você cancelou a autorização no Google.',
    timeout: 'A autorização não chegou em 10 minutos. Tente de novo.',
    pageOkTitle: 'Conectado ao RiftDrive',
    pageOkBody: 'Pode fechar esta aba e voltar ao app.',
    pageDeniedTitle: 'Autorização cancelada',
    pageDeniedBody: 'Nada foi conectado. Volte ao RiftDrive para tentar de novo.',
    pageBadStateTitle: 'Pedido não reconhecido',
    pageBadStateBody: 'Este retorno não corresponde a uma autorização iniciada pelo RiftDrive. Volte ao app e comece de novo.',
  },
  accounts: {
    notFound: 'Conta não encontrada.',
    noClient: 'Configure primeiro o ID e o segredo do OAuth client (passo 1 do assistente).',
  },
  auth: {
    badClientId: 'O ID do cliente precisa terminar em .apps.googleusercontent.com (copie do Google Cloud → Credenciais).',
    badClientSecret: 'O segredo do cliente parece incompleto.',
  },
};

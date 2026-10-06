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
  jobs: {
    waitingDownloadQuota: 'Alguns arquivos atingiram a cota de download do Google; retomo quando ela renovar (~24 h).',
    rateLimited: 'O Google está limitando as chamadas desta conta; retomo em 1 hora.',
    quotaDay: (time: string) => `Cota do dia atingida; retomo às ${time}.`,
    dailyLimit: 'O Google cortou o volume do dia desta conta; tento de novo em 1 hora.',
    auth: 'A conta do Google desconectou. Reconecte para continuar.',
    storage: 'O Drive de destino está sem espaço. Libere espaço e retome.',
    offline: 'Sem conexão. Retomo quando a rede voltar.',
    inspectionExpired: 'A análise expirou. Cole o link de novo para analisar.',
    summary: (p: { done: number; blocked: number; native: number; missing: number; failed: number }) => {
      const parts = [`${p.done} ${p.done === 1 ? 'arquivo copiado' : 'arquivos copiados'}`];
      if (p.blocked) parts.push(`${p.blocked} bloqueado${p.blocked > 1 ? 's' : ''} pelo dono`);
      if (p.native) parts.push(`${p.native} documento${p.native > 1 ? 's' : ''} do Google fora`);
      if (p.missing) parts.push(`${p.missing} sumiu${p.missing > 1 ? 'ram' : ''} da origem`);
      if (p.failed) parts.push(`${p.failed} com falha`);
      return parts.join(' · ');
    },
  },
  transfer: {
    nativeSkipped: 'Documento nativo do Google (Docs, Sheets, Slides…): entre contas diferentes precisa de conversão, então ficou de fora.',
    incomplete: (received: number, total: number) => `O upload terminou incompleto (${received} de ${total} bytes). Vou tentar de novo.`,
  },
  inspect: {
    canceled: 'Leitura da pasta cancelada.',
    invalidLink: 'Isso não parece um link do Google Drive. Cole o link da pasta (drive.google.com/drive/folders/…).',
    notAFolder: 'O link aponta para um arquivo. O RiftDrive copia pastas — cole o link da pasta que contém o arquivo.',
    noAccess: (email: string) =>
      `Nenhuma conta conectada tem acesso a essa pasta. Peça ao dono para compartilhar com ${email}, ou conecte a conta que tem acesso.`,
    destUnreachable: 'A conta de destino não está conectada.',
    shareRequest: (name: string, email: string) =>
      `Oi! Você pode compartilhar a pasta "${name}" com ${email}? Assim eu faço a cópia direto dentro do Google Drive, sem baixar nada. Obrigado!`,
  },
};

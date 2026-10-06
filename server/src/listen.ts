// Superfície mínima que precisamos do Fastify — declarada aqui para o fallback
// poder ser testado sem subir um Fastify inteiro.
interface Listenable {
  listen(opts: { port: number; host: string }): Promise<unknown>;
}

export interface ListenResult {
  port: number;
  /** true quando a porta pedida estava ocupada e o app foi para outra. */
  changed: boolean;
}

/**
 * Sobe o servidor, andando para a próxima porta se a pedida estiver ocupada.
 *
 * Porta ocupada é banal — outro RiftDrive já aberto, ou qualquer serviço que
 * pegou a 7799 antes. Morrer com stack trace nesse caso seria hostil. Qualquer
 * outro erro (permissão, endereço inválido) sobe na hora: procurar portas não
 * resolveria nada.
 */
export async function listenWithFallback(app: Listenable, firstPort: number, host: string, tries = 10): Promise<ListenResult> {
  for (let i = 0; i < tries; i++) {
    const port = firstPort + i;
    try {
      await app.listen({ port, host });
      return { port, changed: i > 0 };
    } catch (err) {
      if ((err as { code?: string }).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(
    `Nenhuma porta livre entre ${firstPort} e ${firstPort + tries - 1}. ` +
      'Feche o que estiver usando essas portas, ou escolha outra com PORT=8080.',
  );
}

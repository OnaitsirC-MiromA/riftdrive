# RiftDrive

**Copie pastas de um Google Drive para outro.** Cole o link ou navegue até a pasta (Compartilhados comigo, Com estrela, busca pelo nome), escolha onde vai parar, e o RiftDrive leva — de preferência **dentro do próprio Google**, sem que um único byte passe pela sua máquina.

Dois caminhos, sempre explícitos:

| | Quando | Como |
|---|---|---|
| **pelo rift** | a pasta está compartilhada com a sua conta (ou é um link público) | cópia servidor-a-servidor no Google. Instantânea por arquivo, não usa sua internet, pode fechar o app no meio |
| **pela sua máquina** | origem e destino são contas diferentes, e a de destino não enxerga a origem | baixa de uma conta e sobe na outra, em blocos, com retomada. Mais lento; precisa do app aberto |

O app diz qual caminho vai usar antes de começar — e, quando é pela máquina, entrega um pedido pronto para o dono compartilhar a pasta com você, o que transforma a cópia em "pelo rift".

---

## Como rodar

**Cole uma linha no terminal. É a instalação inteira.**

Se você tem Node 22.5 ou maior:

```bash
npx riftdrive
```

Se não tem — e não quer instalar nada antes:

```bash
# macOS e Linux
curl -fsSL https://raw.githubusercontent.com/OnaitsirC-MiromA/riftdrive/main/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/OnaitsirC-MiromA/riftdrive/main/install.ps1 | iex
```

O navegador abre sozinho em `http://localhost:7799`. Sem clonar repositório, sem extrair ZIP, sem compilar nada. O instalador baixa um executável com o Node embutido (~110 MB) e confere a soma SHA-256 antes de pôr qualquer coisa no seu PATH.

Para parar, `Ctrl+C`. Se a porta 7799 estiver ocupada, o app sobe na seguinte e diz qual. Para atualizar, `npx riftdrive@latest` ou o instalador de novo — seus dados moram fora da pasta do programa e não são tocados.

## Primeira vez: seu acesso ao Google

O RiftDrive não tem servidor nem conta própria. Ele fala com o Google **em seu nome**, com uma credencial (um "OAuth client") que só você tem — e por isso o Google pede que cada pessoa crie a sua. É uma vez só, uns 8 minutos, e o app guia cada passo com o link certo:

1. criar um projeto no Google Cloud;
2. ativar a Google Drive API;
3. tela de consentimento: tipo **Externo** e **publicar em produção** — este é o passo que todo mundo pula. Em "Teste", o Google desconecta a conta a cada 7 dias; em "Produção" a conexão dura, ao custo de um aviso de "app não verificado" na primeira autorização, que é esperado;
4. criar a credencial: ID do cliente OAuth, tipo **App para computador**;
5. colar o ID e o segredo no RiftDrive e entrar com o Google.

Pode conectar mais de uma conta — é assim que a cópia entre contas (antiga → nova) funciona.

## Cota diária

O Google limita quanto cada conta pode receber por dia (na prática, ~750 GB). Em **Configurações → Cota diária** você escolhe:

- **Limitar a N GB por dia, renovando às HH:00** (padrão: 600 GB às 04:00). Quando a cota acaba, as cópias pausam e retomam sozinhas na renovação. Nunca bate no teto do Google.
- **Sem limite.** Copia até o Google cortar; quando cortar, o RiftDrive pausa, avisa e tenta de novo a cada hora.

## O que fica de fora — e por quê

Nada some em silêncio. Cada arquivo que não entra aparece na lista do job com o motivo:

- **Bloqueado pelo dono** — o dono desativou cópia/download. Nenhuma ferramenta contorna isso; o RiftDrive pula e avisa quantos foram.
- **Documento nativo do Google** (Docs, Sheets, Slides) **entre contas diferentes** — precisaria de conversão. Pelo rift, eles copiam normalmente.
- **Sumiu da origem** — foi removido no meio da cópia.
- **Aguardando** — atingiu a cota de download que o Google impõe a arquivos muito compartilhados; volta sozinho em até 24 h.

Mesclar numa pasta que já existe nunca apaga nada: o que é igual é pulado, o que mudou ganha a versão nova e a antiga é renomeada para "(versão anterior)".

## Verificar novidades

Toda cópia concluída fica registrada. Em **Configurações → Cópias registradas**, "Verificar novidades" compara a origem com o destino e deixa baixar só as pastas que ganharam arquivos novos ou atualizados.

## Onde ficam os dados

Um único banco SQLite (jobs, inventário, tokens, cota), fora da pasta do programa:

| Sistema | Pasta |
|---|---|
| macOS | `~/Library/Application Support/RiftDrive` |
| Windows | `%APPDATA%\RiftDrive` |
| Linux | `$XDG_DATA_HOME/riftdrive` (ou `~/.local/share/riftdrive`) |

`RIFTDRIVE_DATA_DIR` sobrescreve. Outras variáveis: `PORT` (7799), `BIND` (127.0.0.1), `OPEN_BROWSER` (`0` para não abrir).

## Privacidade

Os tokens do Google ficam só no banco local, com permissão restrita ao seu usuário. Não há servidor do RiftDrive, telemetria nem conta. O segredo do OAuth client sai do app apenas para o Google, na troca de tokens. O servidor local escuta só em `127.0.0.1` e recusa pedidos vindos de outras origens (proteção contra páginas maliciosas abertas no mesmo navegador).

## Desenvolvimento

```bash
npm install
npm run dev            # Vite (5173, proxy /api → 7799) + servidor com reload
npm test               # suíte do servidor (Vitest, sem rede: Google Drive em memória)
npm run build          # web → bundled.ts → typecheck → dist/riftdrive.cjs
npm run build:binario  # executável único para esta máquina (SEA)
npm run repo           # audita as referências ao repositório nos instaladores e no README
```

Arquitetura e decisões: `docs/superpowers/specs/2026-10-05-riftdrive-design.md`. Produto e voz: `PRODUCT.md`. Sistema visual: `DESIGN.md`.

## Licença

MIT.

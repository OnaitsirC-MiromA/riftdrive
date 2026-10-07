# RiftDrive — produto

## O que é

RiftDrive copia pastas de um Google Drive para outro. Você cola um link ou navega até a pasta, o app
descobre o que pode e o que não pode copiar, diz por qual caminho vai e leva.

Dois caminhos, sempre explícitos:

- **Pelo rift** — a pasta de origem está acessível pela conta de destino
  (compartilhada com você, atalho, link público). A cópia acontece **dentro do
  Google**, servidor a servidor. Nada passa pela sua máquina, não usa a sua
  internet, pode fechar o app no meio.
- **Pela sua máquina** — origem e destino são contas diferentes e a de destino
  não enxerga a origem. Os bytes descem de uma conta e sobem na outra, em blocos,
  com retomada. Mais lento; precisa do app aberto.

O app empurra para o caminho bom: quando a rota é pela máquina, oferece um pedido
pronto para o dono compartilhar a pasta com a conta de destino.

## Para quem

Quem acumula acervos grandes no Drive — cursos, backups, migração de conta — e
cansou de "fazer uma cópia" arquivo por arquivo ou de ferramentas que baixam tudo
para o disco antes de subir de novo.

## Promessa

**Cole o link, escolha a pasta, a gente leva.** E mostra o progresso com
honestidade: o que foi, o que ficou de fora e por quê.

## Princípios

1. **Caminho honesto.** Toda cópia carrega o chip "pelo rift" ou "pela sua
   máquina". O usuário nunca descobre depois que os 48 GB passaram pelo Wi-Fi.
2. **Nunca apagar.** Em lugar nenhum, em caso nenhum. Mesclar renomeia a versão
   antiga para "(versão anterior)" em vez de substituir.
3. **Progresso confiável.** O inventário por arquivo é a verdade. Fechar o app,
   cair a rede, acabar a cota — tudo retoma de onde parou.
4. **Cota explícita.** O Google limita o volume por dia. O app conta, avisa e
   pausa antes de bater no teto — ou vai até o Google cortar, se o usuário
   escolher "Sem limite". A palavra é **cota**, nunca "orçamento".
5. **Cada um com sua credencial.** Não há servidor nem conta do RiftDrive. O OAuth
   client é do usuário; os tokens ficam só na máquina dele. O assistente de
   primeira vez transforma esse atrito em oito minutos guiados.
6. **Fica de fora com motivo.** Arquivo bloqueado pelo dono, documento nativo do
   Google entre contas, arquivo que sumiu da origem — cada um aparece na lista com
   a explicação, nunca some em silêncio.

## O que não é

- Não é sincronização bidirecional nem backup contínuo.
- Não burla restrições do dono: o que o Google recusa, o RiftDrive pula e avisa.
- Não converte documentos nativos do Google entre contas (v1).
- Não tem conta, nuvem própria nem telemetria.

## Voz

Profissional, direta, em português do Brasil. Explica o porquê em uma frase,
sem jargão e sem sermão. O vocabulário do jogo que inspirou o nome aparece só
no próprio nome e em micro-momentos (o chip "pelo rift"). Nos avisos, o tom é
de quem sabe o que está acontecendo: "A conta do Google desconectou. Reconecte
para continuar." — nunca "Ops! Algo deu errado 😅".

## Irmão do Learnflix

Mesma caixa de distribuição (`npx riftdrive`, instalador de uma linha, executável
único), mesma convenção de código, outro conteúdo. O Learnflix assiste; o
RiftDrive leva.

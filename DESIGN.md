# RiftDrive — sistema visual

Tema escuro por padrão. A tinta é o palco; a superfície levanta os cartões; o
violeta é a ação (o rift); o âmbar é cota, aviso e "pela sua máquina"; o verde é
concluído. Deliberadamente contido: um movimento de marca (a seta atravessando o
portal), nenhum gradiente decorativo fora dele, nenhuma borda lateral colorida.

## Cores (tokens do Tailwind, `web/tailwind.config.js`)

| Token | Valor | Uso | Contraste sobre `ink` |
|---|---|---|---|
| `ink` | `#0B1020` | fundo da página | — |
| `surface` | `#141A33` | cartões, campos | — |
| `surface2` | `#1B2240` | superfície elevada (menus) | — |
| `line` | `rgba(255,255,255,.08)` | bordas | — |
| `fg` | `#F5F3FF` | texto | 17.6 : 1 |
| `muted` | `rgba(245,243,255,.62)` | texto secundário | ≈ 7.4 : 1 |
| `faint` | `rgba(245,243,255,.40)` | rótulos, placeholders (só ≥ 11 px e nunca para conteúdo essencial) | ≈ 4.6 : 1 |
| `violet` | `#A78BFA` | botão primário (texto `ink`), foco, barra de progresso | 7.6 : 1 |
| `violet.strong` | `#C4B5FD` | links, texto de destaque, chip "pelo rift" | 11.2 : 1 |
| `cyan` | `#67E8F9` | brilho do rift (gradiente da barra e do símbolo) | 13.4 : 1 |
| `amber` | `#F2B134` | cota, pausas, chip "pela sua máquina" | 9.9 : 1 |
| `green` | `#34D399` | concluído, conectada | 10.6 : 1 |
| `red` | `#F87171` | erro, ações destrutivas | 7.3 : 1 |

Chips coloridos usam a cor a 16–18% de opacidade como fundo e a cor plena (ou
`.strong`) como texto. Avisos (`Banner`) são superfície tingida a 10%, **sem borda
lateral**.

## Tipografia

- **DM Sans** (self-hosted via `@fontsource/dm-sans`): 400 corpo, 500 ênfase leve,
  600 títulos de seção e botões, 700 marca e títulos de página.
- **JetBrains Mono** 500 (`.num`): números, tamanhos, caminhos de arquivo,
  comandos, links colados. `tabular-nums` sempre.
- Escala: 11 px rótulos (`.label`, caixa alta, tracking .08em), 12–13 px texto de
  apoio e corpo denso, 14 px corpo, 15 px título de cartão, 20 px título de página,
  30 px marca grande. Letter-spacing −0.02em em títulos.

## Espaço e forma

- Espaçamento em múltiplos de 4: 4 / 8 / 12 / 16 / 24 / 32.
- Raios: 6 px (chips), 8 px (botões, campos), 10 px (cartões internos), 14 px
  (cartões de página).
- Coluna única de conteúdo: 672 px (telas) a 768 px (página do job), gutter 16 px
  no celular, 24 px acima.
- Sombra só nos cartões (`shadow-card`), suave.

## Estados

- **Foco:** `ring-2 ring-violet ring-offset-2 ring-offset-ink`, visível em tudo que
  recebe teclado. Nunca removido.
- **Hover:** mudança de fundo (`white/6 → white/11`) ou de borda; sem movimento.
- **Desabilitado:** opacidade 50%, cursor padrão.
- **Carregando:** o portal animado (`PortalMark animated`) + uma frase. Sem
  spinners genéricos.
- **Vazio:** uma frase curta dizendo o que fazer ("Cole um link acima para
  começar.").
- **Erro:** `Banner tone="error"` com a mensagem do servidor, em português.

## Movimento

Um só, de marca: a seta atravessando o portal (`@keyframes rift-cross`, 1,6 s,
ease-in-out). Transições de 150–500 ms só em cor e largura de barra. Tudo
desligado sob `prefers-reduced-motion`.

## Componentes

- `Brand` / `PortalMark` — lockup "Rift**Drive**" e o símbolo.
- `PathChip` — "pelo rift" (violeta) / "pela sua máquina" (âmbar), com `title`
  explicativo. Aparece em toda cópia, sempre.
- `Banner` — info / warn / error / success, superfície tingida.
- `Button` — primary (violeta, texto ink), ghost, danger, link.
- `Field` / `Select` — campos com rótulo em `.label`.
- `JobCard` + `ProgressBar` — barra ciano→violeta; âmbar quando pausada; verde
  quando concluída.
- `FolderPicker` — trilha de navegação a partir de "Meu Drive".
- `QuotaLine` — "Cota de hoje: 288 GB restantes · renova às 04:00".

## Copy

Português do Brasil, direto. "Cota", nunca "orçamento". Verbos no imperativo
suave ("Cole um link", "Reconecte"). Números com vírgula decimal e GB em base
1024. Toda mensagem de erro diz o próximo passo.

## Acessibilidade

Contraste ≥ 4.5:1 em todo texto de conteúdo (tabela acima); teclado em tudo
(cartões são `role="link"` com `tabIndex`); `aria-live` nas áreas que mudam
sozinhas (análise, login); `prefers-reduced-motion` respeitado; `color-scheme:
dark` declarado para os controles nativos.

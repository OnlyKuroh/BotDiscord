# Guia de Estrutura de Embeds

Este arquivo existe para deixar o visual do bot facil de editar sem ter que adivinhar o que cada bloco faz.

## Onde mexer primeiro

- `commands/diversao/lol.js`
  Aqui ficam as paginas visuais do `/lol`.
- `commands/diversao/historylol.js`
  Aqui ficam as 3 telas do `/historylol` e os botoes.
- `utils/lol-dm-tracker.js`
  Aqui ficam os embeds de DM do tracker de partida.
- `utils/system-embeds.js`
  Aqui ficam os embeds compartilhados de logs e sistema.
- `utils/update-notifier.js`
  Aqui fica o jornal do deploy.
- `utils/persistent-panels.js`
  Aqui ficam os paineis fixos tipo verificacao e noticias.

## O que cada setter faz

### EmbedBuilder

```js
const embed = new EmbedBuilder()
    .setColor('#5865F2') // Cor lateral do embed
    .setAuthor({         // Assinatura pequena em cima
        name: 'Nome pequeno do topo',
        iconURL: iconUrl,
    })
    .setTitle('Titulo') // Titulo principal
    .setURL(linkUrl)    // Link clicavel no titulo
    .setDescription('Texto principal') // Corpo do embed
    .setThumbnail(iconUrl) // Imagem pequena no canto
    .setImage(imageUrl)    // Imagem/banner grande
    .addFields(            // Blocos de campo
        {
            name: 'Campo 1',
            value: 'Valor 1',
            inline: true, // true = fica lado a lado, false = ocupa linha inteira
        },
        {
            name: 'Campo 2',
            value: 'Valor 2',
            inline: true,
        },
        {
            name: 'Campo 3',
            value: 'Valor 3',
            inline: true,
        },
    )
    .setFooter({ text: 'Rodape', iconURL: footerIcon })
    .setTimestamp();
```

### Regra pratica de fields

- `inline: true`
  Use quando quiser grade de 2 ou 3 blocos lado a lado.
- `inline: false`
  Use quando o texto e maior ou quando o bloco precisa respirar sozinho.
- Para layout estilo Telemetria:
  tente sempre grupos de `3 fields inline`, depois outro grupo de `3`.

## Components V2

O `/lol` usa `ContainerBuilder` em vez de `EmbedBuilder`.

### Estrutura base

```js
const page = new ContainerBuilder()
    .setAccentColor(0x5865F2) // Cor lateral do card
    .addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                txt('## Titulo da pagina'),
                txt('Subtitulo ou resumo'),
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder({ media: { url: imageUrl } })
            )
    )
    .addSeparatorComponents(sep()) // Linha divisoria
    .addTextDisplayComponents(txt('### Bloco'))
    .addTextDisplayComponents(txt('Conteudo do bloco'));
```

## Padrao recomendado de nomes

Use nomes assim para nao misturar visual com logica:

```js
const embedTitle = 'Titulo';
const embedDescription = 'Descricao';
const embedThumbnailUrl = iconUrl;
const embedImageUrl = bannerUrl;
const embedFields = [
    { name: 'Rank', value: rankText, inline: true },
];
```

### Para paginas

```js
const profilePage = ...
const masteryPage = ...
const historyPage = ...
const statsPage = ...
```

Evite:

```js
const a = ...
const b = ...
const c = ...
```

## Modelo de comentario que vamos usar

```js
// ─── Embed: Header / identidade ─────────────────────────────
// setAuthor = assinatura pequena em cima
// setTitle = titulo principal
// setDescription = texto central

// ─── Embed: Midia ───────────────────────────────────────────
// setThumbnail = imagem pequena lateral
// setImage = banner/imagem grande

// ─── Embed: Fields ──────────────────────────────────────────
// inline true = lado a lado
// inline false = largura inteira

// ─── Embed: Footer ──────────────────────────────────────────
// setFooter = rodape tecnico/informativo
// setTimestamp = horario do evento
```

## Limite real do Discord

- URL de imagem externa **nao vira mini icone dentro do texto**.
- Para ter icones dentro da frase existem so 3 caminhos:
  - emoji custom
  - application emoji
  - imagem/card gerado por canvas

Se a decisao for **nao criar emoji nenhum**, entao os assets da API ficam bem em:

- `setThumbnail`
- `setImage`
- `setAuthor({ iconURL })`
- `setFooter({ iconURL })`
- `ThumbnailBuilder` dentro de `ContainerBuilder`

## Tracker LoL

- Botao que liga/desliga: `commands/diversao/historylol.js`
- Motor que vigia as partidas: `utils/lol-dm-tracker.js`
- Ele manda DM quando entra e quando termina partida.

## Proximo padrao

Sempre que eu criar embed novo daqui pra frente, a ideia e seguir esta ordem:

1. Header
2. Descricao
3. Midia
4. Fields
5. Footer
6. Timestamp

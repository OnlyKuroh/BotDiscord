const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');
const { formatResponse } = require('../../utils/persona');

// ─── Metadata: define cor, emoji e descrição para cada categoria ─────────────
const CATEGORIES = {
    administrador: {
        label: 'Administração',
        emoji: '🛡️',
        color: '#C41230',
        description: 'Comandos de servidor — bans, kicks, logs, roles, welcome, updates.',
        icon: '⚔️',
    },
    utilidade: {
        label: 'Utilidade',
        emoji: '🔧',
        color: '#3498db',
        description: 'Ferramentas do dia a dia — consultas, informações, buscas.',
        icon: '🧰',
    },
    diversao: {
        label: 'Diversão',
        emoji: '🎮',
        color: '#9B59B6',
        description: 'Entretenimento — jogos, anime, memes, League of Legends, clima.',
        icon: '🎲',
    },
};

// ─── Descrições curtas para cada comando (override) ──────────────────────────
const CMD_SHORT = {
    // Admin
    ban:              'Banir membro do servidor',
    kick:             'Expulsar membro do servidor',
    clear:            'Limpar mensagens do canal',
    setlogs:          'Configurar canal de logs',
    setrole:          'Gerenciar cargo por reação/seleção',
    setverificar:     'Sistema de verificação de membros',
    setwelcome:       'Configurar mensagem de boas-vindas',
    setmembercounter: 'Canal contador de membros',
    setnovidades:     'Canal de changelog automatico',
    update:           'Enviar update/anúncio do bot',
    // Utilidade
    help:     'Ver todos os comandos',
    ping:     'Testar latência do bot',
    avatar:   'Ver avatar em alta resolução',
    botinfo:  'Informações técnicas do bot',
    serverinfo: 'Informações do servidor',
    userinfo: 'Informações de um membro',
    cep:      'Consultar endereço por CEP',
    cnpj:     'Consultar empresa por CNPJ',
    cotacao:  'Cotação de moedas em tempo real',
    feriados: 'Listar feriados nacionais',
    fipe:     'Consultar preço FIPE de veículos',
    deputado: 'Consultar deputado federal',
    steam:    'Buscar jogo na Steam',
    telemetria: 'Estatísticas de uso do bot',
    'anime-scene': 'Cena aleatória de anime',
    // Diversão
    '8ball':    'Bola 8 mágica',
    anime:      'Buscar anime no MyAnimeList',
    manga:      'Buscar mangá no MyAnimeList',
    clima:      'Previsão do tempo',
    coinflip:   'Cara ou coroa',
    dice:       'Rolar dados',
    dog:        'Foto aleatória de doguinho',
    dragonball: 'Personagem de Dragon Ball',
    lol:        'Perfil completo de League of Legends',
    meme:       'Meme aleatório do Reddit',
    naruto:     'Personagem de Naruto',
    neko:       'Imagem de neko',
    poke:       'Pokémon aleatório',
    say:        'Bot repetir uma mensagem',
    valorant:   'Perfil de Valorant',
};

// ─── Embeds ──────────────────────────────────────────────────────────────────

function buildHomeEmbed(client) {
    const totalCmds = client.commands.size;

    // Contagem por categoria
    const counts = {};
    for (const cat of Object.keys(CATEGORIES)) {
        counts[cat] = client.commands.filter(c => c.category === cat).size;
    }

    const categoryList = Object.entries(CATEGORIES)
        .map(([key, cat]) => `${cat.emoji} **${cat.label}** — \`${counts[key] || 0}\` comandos`)
        .join('\n');

    return new EmbedBuilder()
        .setColor('#C41230')
        .setAuthor({ name: '呪術廻戦 — ITADORI BOT', iconURL: client.user?.displayAvatarURL() || undefined })
        .setTitle('📋 Central de Comandos')
        .setDescription(
            `Bem-vindo ao arsenal. Use o **menu abaixo** para navegar.\n` +
            `Use \`/help [comando]\` para detalhes de um comando específico.\n\n` +
            `${categoryList}\n\n` +
            `> 🔢 **${totalCmds}** comandos disponíveis`
        )
        .setThumbnail(client.user?.displayAvatarURL({ size: 256 }) || '')
        .setFooter({ text: 'Selecione uma categoria abaixo ↓' })
        .setTimestamp();
}

function buildCategoryEmbed(client, categoryKey) {
    const cat = CATEGORIES[categoryKey];
    if (!cat) return buildHomeEmbed(client);

    const cmds = client.commands
        .filter(c => c.category === categoryKey && c.data.name)
        .sort((a, b) => a.data.name.localeCompare(b.data.name));

    // Formatar comandos em lista compacta e bonita
    let cmdList = '';
    if (cmds.size > 0) {
        cmdList = cmds.map(cmd => {
            const name = cmd.data.name;
            const desc = CMD_SHORT[name] || cmd.data.description || 'Sem descrição';
            const hasSubcmds = cmd.data.options?.some(o => o.toJSON?.()?.type === 1);
            const subTag = hasSubcmds ? ' `📂`' : '';
            return `> \`/${name}\`${subTag} — ${desc}`;
        }).join('\n');
    } else {
        cmdList = '*Nenhum comando nesta categoria ainda.*';
    }

    const embed = new EmbedBuilder()
        .setColor(cat.color)
        .setAuthor({ name: `${cat.icon} ${cat.label.toUpperCase()}`, iconURL: client.user?.displayAvatarURL() || undefined })
        .setDescription(
            `> ${cat.description}\n\n` +
            `${cmdList}\n\n` +
            `📂 = possui subcomandos • Use \`/help [comando]\` para mais detalhes`
        )
        .setFooter({ text: `${cmds.size} comando${cmds.size !== 1 ? 's' : ''} • ${cat.label}` })
        .setTimestamp();

    return embed;
}

function buildCommandEmbed(command) {
    // Detecta subcomandos
    const subcommands = command.data.options
        ?.filter(o => o.toJSON?.()?.type === 1)
        ?.map(o => {
            const sub = o.toJSON();
            return `> \`/${command.data.name} ${sub.name}\` — ${sub.description || 'N/A'}`;
        }) || [];

    // Detecta opções diretas (não subcomandos)
    const options = command.data.options
        ?.filter(o => o.toJSON?.()?.type !== 1 && o.toJSON?.()?.type !== 2)
        ?.map(o => {
            const opt = o.toJSON();
            const req = opt.required ? '`obrigatório`' : '`opcional`';
            return `> \`${opt.name}\` — ${opt.description} ${req}`;
        }) || [];

    const cat = CATEGORIES[command.category];
    const catName = cat?.label || command.category || '?';
    const catEmoji = cat?.emoji || '📁';

    const embed = new EmbedBuilder()
        .setColor(cat?.color || '#C41230')
        .setAuthor({ name: `${catEmoji} ${catName}`, iconURL: undefined })
        .setTitle(`/${command.data.name}`)
        .setDescription(
            command.detailedDescription || command.data.description || 'Sem descrição detalhada.'
        );

    if (subcommands.length > 0) {
        embed.addFields({ name: '📂 Subcomandos', value: subcommands.join('\n'), inline: false });
    }

    if (options.length > 0) {
        embed.addFields({ name: '⚙️ Opções', value: options.join('\n'), inline: false });
    }

    embed.addFields({
        name: '📝 Como Usar',
        value: command.usage || `\`/${command.data.name}\``,
        inline: true
    });

    if (command.aliases?.length) {
        embed.addFields({
            name: '🏷️ Aliases',
            value: command.aliases.map(a => `\`-${a}\``).join(' '),
            inline: true
        });
    }

    if (command.permissions?.length && command.permissions[0]) {
        embed.addFields({
            name: '🔒 Permissões',
            value: command.permissions.filter(Boolean).join(', ') || 'Nenhuma',
            inline: true
        });
    }

    embed.setFooter({ text: `Categoria: ${catName}` });
    return embed;
}

// ─── Select Menu ─────────────────────────────────────────────────────────────

const row = new ActionRowBuilder()
    .addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('⚡ Selecione uma categoria...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Início')
                    .setDescription('Visão geral de todos os comandos')
                    .setValue('inicio')
                    .setEmoji('🏠'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Administração')
                    .setDescription(`Controle do servidor — ban, kick, logs...`)
                    .setValue('administrador')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Utilidade')
                    .setDescription(`Ferramentas úteis — avatar, CEP, CNPJ...`)
                    .setValue('utilidade')
                    .setEmoji('🔧'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Diversão')
                    .setDescription(`Games e anime — LoL, meme, anime...`)
                    .setValue('diversao')
                    .setEmoji('🎮'),
            )
    );

// ─── Module ──────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('📋 Ver todos os comandos disponíveis')
        .addStringOption(option =>
            option.setName('comando')
                .setDescription('Nome do comando para ver detalhes')
                .setRequired(false)
        ),
    aliases: ['ajuda', 'h', 'comandos'],
    detailedDescription: 'Central de comandos do Itadori Bot. Navegue pelas categorias usando o menu dropdown ou consulte um comando específico com `/help [nome]`.',
    usage: '`/help` ou `/help [comando]`',
    permissions: [''],

    async execute(interaction, client) {
        const cmdName = interaction.options.getString('comando');

        if (cmdName) {
            const parsed = cmdName.toLowerCase().replace(/^[\/\-]/, '');
            const cmd = client.commands.get(parsed) || client.commands.get(client.aliases?.get(parsed));
            if (!cmd) {
                return interaction.reply({
                    content: formatResponse(`❌ Comando \`${cmdName}\` não encontrado.\n> Use \`/help\` para ver todos os comandos.`),
                    flags: ['Ephemeral']
                });
            }
            return interaction.reply({ embeds: [buildCommandEmbed(cmd)] });
        }

        await interaction.reply({ embeds: [buildHomeEmbed(client)], components: [row] });
    },

    async executePrefix(message, args, client) {
        const cmdName = args[0];
        if (cmdName) {
            const parsed = cmdName.toLowerCase().replace(/^[\/\-]/, '');
            const cmd = client.commands.get(parsed) || client.commands.get(client.aliases?.get(parsed));
            if (!cmd) {
                return message.reply({
                    content: formatResponse(`❌ Comando \`${cmdName}\` não encontrado.\n> Use \`-help\` para ver todos os comandos.`)
                });
            }
            return message.reply({ embeds: [buildCommandEmbed(cmd)] });
        }

        await message.reply({ embeds: [buildHomeEmbed(client)], components: [row] });
    },

    async handleSelectMenu(interaction, client) {
        const category = interaction.values[0];
        if (!category) return;

        if (interaction.message.interaction && interaction.message.interaction.user.id !== interaction.user.id) {
            return interaction.reply({
                content: formatResponse('❌ Apenas quem usou o comando pode navegar neste menu.'),
                flags: ['Ephemeral']
            });
        }

        const embed = category === 'inicio'
            ? buildHomeEmbed(client)
            : buildCategoryEmbed(client, category);

        await interaction.update({ embeds: [embed], components: [row] });
    }
};

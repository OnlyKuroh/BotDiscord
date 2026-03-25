const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} = require('discord.js');
const { formatResponse } = require('../../utils/persona');
const { isBotOwner } = require('../../utils/owner');

const CATEGORIES = {
    administrador: {
        label: 'Administracao',
        emoji: '🛡️',
        color: '#C41230',
        icon: '⚔️',
        description: 'Controle fino do servidor: moderacao, logs, cargos, welcome, novidades e configuracoes.',
    },
    utilidade: {
        label: 'Utilidade',
        emoji: '🔧',
        color: '#1f7ae0',
        icon: '🧰',
        description: 'Ferramentas do dia a dia para buscar dados, analisar perfis, consultar APIs e obter informacoes.',
    },
    diversao: {
        label: 'Diversao',
        emoji: '🎮',
        color: '#8e44ad',
        icon: '🎲',
        description: 'Comandos de anime, jogos, memes, clima, imagens e outras desgracas divertidas.',
    },
    dono: {
        label: 'Dono',
        emoji: '👑',
        color: '#f39c12',
        icon: '🧠',
        description: 'Ferramentas sensiveis de dono: auditoria global, testes, rastreio, IA administrativa e comandos internos.',
    },
};

const CATEGORY_ORDER = ['administrador', 'utilidade', 'diversao', 'dono'];

const CMD_SHORT = {
    ban: 'Banir membro do servidor.',
    kick: 'Expulsar membro do servidor.',
    clear: 'Limpar mensagens do canal.',
    setlogs: 'Configurar o canal de logs.',
    setrole: 'Gerenciar cargos automatizados.',
    setverificar: 'Configurar verificacao de membros.',
    setwelcome: 'Configurar boas-vindas.',
    setmembercounter: 'Atualizar contador de membros.',
    setnovidades: 'Definir canal de novidades.',
    update: 'Enviar anuncio manual.',
    customcmd: 'Criar comandos personalizados.',
    servidores: 'Gerenciar servidores pelo painel.',
    help: 'Abrir a central de comandos.',
    ping: 'Testar a latencia do bot.',
    avatar: 'Ver avatar em alta resolucao.',
    botinfo: 'Informacoes tecnicas do bot.',
    serverinfo: 'Resumo do servidor atual.',
    userinfo: 'Resumo de um membro.',
    cep: 'Consultar endereco por CEP.',
    cnpj: 'Consultar empresa por CNPJ.',
    cotacao: 'Ver cotacao de moedas.',
    feriados: 'Listar feriados nacionais.',
    fipe: 'Consultar tabela FIPE.',
    deputado: 'Buscar deputado federal.',
    steam: 'Buscar jogo na Steam.',
    telemetria: 'Ver estatisticas do bot.',
    'anime-scene': 'Reconhecer cena de anime.',
    '8ball': 'Bola 8 magica.',
    anime: 'Buscar anime no MAL.',
    manga: 'Buscar manga no MAL.',
    clima: 'Previsao do tempo.',
    coinflip: 'Cara ou coroa.',
    dice: 'Rolar dados.',
    dog: 'Foto de cachorro.',
    dragonball: 'Buscar personagem de Dragon Ball.',
    lol: 'Perfil completo de LoL.',
    meme: 'Meme aleatorio.',
    naruto: 'Buscar personagem de Naruto.',
    neko: 'Imagem de neko.',
    poke: 'Pokemon aleatorio.',
    say: 'Fazer o bot repetir algo.',
    valorant: 'Perfil de Valorant.',
    forcenov: 'Forcar envio de novidade pendente.',
    test: 'Forcar previews e eventos fake.',
};

function getCommandName(command) {
    return command.data?.name || command.prefixOnlyName || 'desconhecido';
}

function getCommandInvoke(command) {
    const name = getCommandName(command);
    return command.data?.name ? `/${name}` : `-${name}`;
}

function getCommandDescription(command) {
    const name = getCommandName(command);
    return CMD_SHORT[name]
        || command.detailedDescription
        || command.data?.description
        || 'Sem descricao registrada.';
}

function getCommandOptions(command) {
    if (!command.data?.options) return [];
    return command.data.options.map((option) => option.toJSON?.() || option).filter(Boolean);
}

function getSubcommands(command) {
    return getCommandOptions(command).filter((option) => option.type === 1);
}

function getDirectOptions(command) {
    return getCommandOptions(command).filter((option) => option.type !== 1 && option.type !== 2);
}

function getCommandBadges(command) {
    const badges = [];
    if (command.data?.name) badges.push('Slash');
    if (command.executePrefix) badges.push('Prefixo');
    if (getSubcommands(command).length > 0) badges.push('Subcomandos');
    if (command.category === 'dono') badges.push('Dono');
    return badges;
}

function getCommandsByCategory(client, categoryKey) {
    return [...client.commands.values()]
        .filter((command) => command.category === categoryKey)
        .sort((a, b) => getCommandName(a).localeCompare(getCommandName(b)));
}

function getCategoryCounts(client) {
    const counts = {};
    for (const key of CATEGORY_ORDER) {
        counts[key] = getCommandsByCategory(client, key).length;
    }
    return counts;
}

function buildMenu(client) {
    const counts = getCategoryCounts(client);

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Navegue pelas categorias do arsenal...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Inicio')
                    .setDescription(`Visao geral dos ${client.commands.size} comandos carregados`)
                    .setValue('inicio')
                    .setEmoji('🏠'),
                ...CATEGORY_ORDER.map((key) => {
                    const category = CATEGORIES[key];
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(category.label)
                        .setDescription(`${counts[key] || 0} comandos em ${category.label.toLowerCase()}`)
                        .setValue(key)
                        .setEmoji(category.emoji);
                }),
            )
    );
}

function buildHomeEmbed(client) {
    const counts = getCategoryCounts(client);
    const total = client.commands.size;
    const slashCount = [...client.commands.values()].filter((command) => command.data?.name).length;
    const prefixOnlyCount = total - slashCount;

    const categoryLines = CATEGORY_ORDER
        .map((key) => {
            const category = CATEGORIES[key];
            return `${category.emoji} **${category.label}**\n\`${counts[key] || 0}\` comandos`;
        })
        .join('\n\n');

    return new EmbedBuilder()
        .setColor('#C41230')

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: '呪術廻戦 • Central do Itadori Bot',
            iconURL: client.user?.displayAvatarURL() || undefined,
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle('Central de Comandos')

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription([
            'O arsenal foi recontado e agora a central considera **todas** as categorias carregadas, incluindo comandos de dono e prefix-only.',
            '',
            'Use o menu abaixo para abrir uma categoria ou rode `/help comando` para focar em uma lamina especifica.',
        ].join('\n'))

        // ─── Thumbnail / Icone do embed ──────────────────────────────────────
        .setThumbnail(client.user?.displayAvatarURL({ size: 512 }) || null)

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(
            {
                name: 'Panorama do Arsenal',
                value: categoryLines,
                inline: true,
            },
            {
                name: 'Leitura Rapida',
                value: [
                    `**Total carregado:** \`${total}\``,
                    `**Slash:** \`${slashCount}\``,
                    `**Prefix-only:** \`${prefixOnlyCount}\``,
                    '',
                    '`/help nome` abre detalhes',
                    '`-help nome` tambem funciona',
                ].join('\n'),
                inline: true,
            },
            {
                name: 'Como Navegar',
                value: [
                    '• escolha uma categoria no menu',
                    '• veja comandos em blocos mais legiveis',
                    '• abra um comando especifico para uso, aliases e permissoes',
                ].join('\n'),
                inline: false,
            },
        )

        // ─── Footer / Metadados finais ───────────────────────────────────────
        .setFooter({
            text: 'Categorias atualizadas dinamicamente a partir dos comandos carregados',
            iconURL: client.user?.displayAvatarURL() || undefined,
        })

        // ─── Timestamp / Momento do evento ───────────────────────────────────
        .setTimestamp();
}

function buildCategoryEmbed(client, categoryKey, viewerId = null) {
    const category = CATEGORIES[categoryKey];
    if (!category) return buildHomeEmbed(client);

    const commands = getCommandsByCategory(client, categoryKey);
    const isOwnerCategory = categoryKey === 'dono';
    const viewerIsOwner = viewerId ? isBotOwner(viewerId) : false;

    const visibleCommands = (!isOwnerCategory || viewerIsOwner)
        ? commands
        : commands;

    const lines = visibleCommands.map((command) => {
        const invoke = getCommandInvoke(command);
        const desc = getCommandDescription(command);
        const badges = getCommandBadges(command);
        const badgeText = badges.length ? ` [${badges.join(' • ')}]` : '';
        return `• \`${invoke}\`${badgeText}\n${desc}`;
    });

    const chunks = chunk(lines, 6);

    const embed = new EmbedBuilder()
        .setColor(category.color)

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: `${category.icon} ${category.label}`,
            iconURL: client.user?.displayAvatarURL() || undefined,
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle(`${category.emoji} Categoria • ${category.label}`)

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription([
            category.description,
            '',
            isOwnerCategory
                ? 'Categoria sensivel. Os comandos abaixo sao voltados para manutencao, auditoria, testes e operacao do bot.'
                : 'Lista refinada para leitura rapida. Cada entrada mostra o gatilho principal e um resumo da funcao.',
        ].join('\n'))

        // ─── Thumbnail / Icone do embed ──────────────────────────────────────
        .setThumbnail(client.user?.displayAvatarURL({ size: 512 }) || null)

        // ─── Footer / Metadados finais ───────────────────────────────────────
        .setFooter({
            text: `${commands.length} comando${commands.length !== 1 ? 's' : ''} nesta categoria • Use /help nome para abrir detalhes`,
            iconURL: client.user?.displayAvatarURL() || undefined,
        })
        .setTimestamp();

    if (chunks.length === 0) {
        embed.addFields({
            name: 'Comandos',
            value: 'Nenhum comando encontrado nesta categoria.',
            inline: false,
        });
        return embed;
    }

    for (let index = 0; index < chunks.length; index += 1) {
        embed.addFields({
            name: `Bloco ${index + 1}`,
            value: chunks[index].join('\n\n').slice(0, 1024),
            inline: false,
        });
    }

    return embed;
}

function buildCommandEmbed(command) {
    const name = getCommandName(command);
    const invoke = getCommandInvoke(command);
    const subcommands = getSubcommands(command);
    const options = getDirectOptions(command);
    const category = CATEGORIES[command.category];
    const badges = getCommandBadges(command);

    const embed = new EmbedBuilder()
        .setColor(category?.color || '#C41230')

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: `${category?.emoji || '📁'} ${category?.label || (command.category || 'Geral')}`,
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle(invoke)

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription(
            command.detailedDescription
            || command.data?.description
            || getCommandDescription(command)
        )

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(
            {
                name: 'Resumo',
                value: [
                    `**Gatilho principal:** \`${invoke}\``,
                    `**Tipo:** ${badges.join(' • ') || 'Nao identificado'}`,
                    `**Categoria:** ${category?.label || command.category || 'Geral'}`,
                ].join('\n'),
                inline: false,
            },
            {
                name: 'Como Usar',
                value: command.usage || `\`${invoke}\``,
                inline: false,
            },
        );

    if (subcommands.length > 0) {
        embed.addFields({
            name: 'Subcomandos',
            value: subcommands
                .map((sub) => `• \`${invoke} ${sub.name}\` — ${sub.description || 'Sem descricao.'}`)
                .join('\n')
                .slice(0, 1024),
            inline: false,
        });
    }

    if (options.length > 0) {
        embed.addFields({
            name: 'Opcoes',
            value: options
                .map((option) => {
                    const required = option.required ? 'obrigatoria' : 'opcional';
                    return `• \`${option.name}\` — ${option.description || 'Sem descricao.'} [${required}]`;
                })
                .join('\n')
                .slice(0, 1024),
            inline: false,
        });
    }

    if (command.aliases?.length) {
        embed.addFields({
            name: 'Aliases',
            value: command.aliases.map((alias) => `\`-${alias}\``).join(' '),
            inline: true,
        });
    }

    if (command.permissions?.length && command.permissions.some(Boolean)) {
        embed.addFields({
            name: 'Permissoes',
            value: command.permissions.filter(Boolean).join(', '),
            inline: true,
        });
    }

    embed
        .setFooter({
            text: 'Detalhe individual do comando',
        })
        .setTimestamp();

    return embed;
}

function resolveCommand(client, rawName) {
    const parsed = String(rawName || '').toLowerCase().replace(/^[\/\-]/, '');
    return client.commands.get(parsed) || client.commands.get(client.aliases?.get(parsed));
}

function chunk(items, size) {
    const output = [];
    for (let i = 0; i < items.length; i += size) {
        output.push(items.slice(i, i + size));
    }
    return output;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Abrir a central de comandos do bot')
        .addStringOption((option) =>
            option
                .setName('comando')
                .setDescription('Nome do comando para abrir os detalhes')
                .setRequired(false)
        ),
    aliases: ['ajuda', 'h', 'comandos'],
    detailedDescription: 'Central de comandos do Itadori Bot. Navegue por categoria no menu ou abra um comando especifico para ver uso, aliases, opcoes e permissoes.',
    usage: '`/help`, `-help` ou `help [comando]`',
    permissions: [''],

    async execute(interaction, client) {
        const commandName = interaction.options.getString('comando');

        if (commandName) {
            const command = resolveCommand(client, commandName);
            if (!command) {
                return interaction.reply({
                    content: formatResponse(`❌ Comando \`${commandName}\` nao encontrado.\n> Use \`/help\` para abrir a central completa.`),
                    flags: ['Ephemeral'],
                });
            }

            return interaction.reply({
                embeds: [buildCommandEmbed(command)],
            });
        }

        return interaction.reply({
            embeds: [buildHomeEmbed(client)],
            components: [buildMenu(client)],
        });
    },

    async executePrefix(message, args, client) {
        const commandName = args[0];

        if (commandName) {
            const command = resolveCommand(client, commandName);
            if (!command) {
                return message.reply({
                    content: formatResponse(`❌ Comando \`${commandName}\` nao encontrado.\n> Use \`-help\` para abrir a central completa.`),
                });
            }

            return message.reply({
                embeds: [buildCommandEmbed(command)],
            });
        }

        return message.reply({
            embeds: [buildHomeEmbed(client)],
            components: [buildMenu(client)],
        });
    },

    async handleSelectMenu(interaction, client) {
        const category = interaction.values[0];
        if (!category) return;

        if (interaction.message.interaction && interaction.message.interaction.user.id !== interaction.user.id) {
            return interaction.reply({
                content: formatResponse('❌ Apenas quem abriu o help pode navegar nesse menu.'),
                flags: ['Ephemeral'],
            });
        }

        const embed = category === 'inicio'
            ? buildHomeEmbed(client)
            : buildCategoryEmbed(client, category, interaction.user.id);

        return interaction.update({
            embeds: [embed],
            components: [buildMenu(client)],
        });
    },
};

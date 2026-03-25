const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');
const { requireOwner } = require('../../utils/owner');
const {
    buildGuildArrivalEmbed,
    buildCuteDogNewsEmbed,
    buildTestLogEmbed,
} = require('../../utils/system-embeds');
const { buildDiscordEmbed } = require('../../utils/update-notifier');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('[DONO] Forca previews de eventos passivos, novidades e comandos.')
        .addSubcommand((sub) =>
            sub
                .setName('logs')
                .setDescription('Envia um log fake para revisar o layout do observatorio.')
                .addStringOption((option) =>
                    option
                        .setName('evento')
                        .setDescription('Evento de log para simular')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Membro Entrou', value: 'MEMBER_JOIN' },
                            { name: 'Cargo Apagado', value: 'ROLE_DELETE' },
                            { name: 'Banimento', value: 'BAN' },
                            { name: 'Mensagem Apagada', value: 'MSG_DELETE' },
                            { name: 'Canal Criado', value: 'CHANNEL_CREATE' },
                            { name: 'Canal Apagado', value: 'CHANNEL_DELETE' },
                            { name: 'Mensagem Editada', value: 'MESSAGE_EDIT' },
                            { name: 'Entrou na Call', value: 'VOICE_JOIN' }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('setlogs')
                .setDescription('Alias de teste para o fluxo visual de logs.')
                .addStringOption((option) =>
                    option
                        .setName('evento')
                        .setDescription('Evento de log para simular')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Membro Entrou', value: 'MEMBER_JOIN' },
                            { name: 'Cargo Apagado', value: 'ROLE_DELETE' },
                            { name: 'Banimento', value: 'BAN' },
                            { name: 'Mensagem Apagada', value: 'MSG_DELETE' }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('setnovidades')
                .setDescription('Forca uma novidade fake no layout do feed.')
                .addStringOption((option) =>
                    option
                        .setName('tipo')
                        .setDescription('Tipo de novidade')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Commit Fake', value: 'commit' },
                            { name: 'Novo Servidor', value: 'guild_join' }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('noticias')
                .setDescription('Envia uma noticia fake de animais com cachorro fofo.')
        )
        .addSubcommand((sub) =>
            sub
                .setName('comando')
                .setDescription('Forca um preview visual de resposta de comando.')
                .addStringOption((option) =>
                    option
                        .setName('tipo')
                        .setDescription('Comando para simular')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ban', value: 'ban' },
                            { name: 'Kick', value: 'kick' }
                        )
                )
        ),

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'logs' || subcommand === 'setlogs') {
            return handleLogsPreview(interaction);
        }

        if (subcommand === 'setnovidades') {
            return handleNovidadesPreview(interaction, client);
        }

        if (subcommand === 'noticias') {
            return handleNoticiasPreview(interaction);
        }

        return handleCommandPreview(interaction);
    },
};

async function handleLogsPreview(interaction) {
    const eventType = interaction.options.getString('evento', true);
    const targetChannel = await resolveConfiguredChannel(interaction, 'logs');
    if (!targetChannel) {
        return interaction.reply({
            content: 'Nao encontrei canal configurado para logs. Usa `/setlogs` antes de testar esse fluxo.',
            flags: ['Ephemeral'],
        });
    }
    const embed = buildTestLogEmbed({
        eventType,
        guildName: interaction.guild?.name || 'Kuroh Community',
        guildId: interaction.guildId || '000000000000000000',
        userName: 'Membro Fake Premium',
        userId: '111111111111111111',
        channelId: interaction.channelId,
        thumbnailUrl: getTestThumbnail(eventType),
    });

    await interaction.reply({
        content: `Preview do log \`${eventType}\` enviado em <#${targetChannel.id}>.`,
        flags: ['Ephemeral'],
    });

    await targetChannel.send({ embeds: [embed] });
}

async function handleNovidadesPreview(interaction, client) {
    const targetChannel = await resolveConfiguredChannel(interaction, 'novidades');
    if (!targetChannel) {
        return interaction.reply({
            content: 'Nao encontrei canal configurado para novidades. Usa `/setnovidades` antes de testar esse fluxo.',
            flags: ['Ephemeral'],
        });
    }
    const kind = interaction.options.getString('tipo', true);

    if (kind === 'commit') {
        const embed = buildDiscordEmbed(client, {
            title: 'Update 4Dev: motor de novidades fake refinado para testes premium',
            lead: 'Uma simulacao completa acabou de atravessar o pipeline de novidades para validar titulo, descricao, blocos de resumo, footer tecnico e acabamento visual antes do deploy real.',
            sections: [
                {
                    icon: '✦',
                    title: 'Commit fake com leitura premium',
                    subtitle: 'O feed agora pode ser testado sem esperar evento real',
                    body: 'O comando `/test setnovidades` monta um changelog de laboratorio, com cara de release seria, para revisar se titulo, narrativa, resumo tecnico e fechamento estao dignos de producao.',
                    calloutLabel: 'Fluxo',
                    calloutText: 'Dispara o preview, entrega no canal configurado e deixa o visual pronto para QA direto no Discord.',
                },
                {
                    icon: '🧪',
                    title: 'Cenario pensado para 4dev',
                    subtitle: 'Menos tentativa cega, mais iteracao visual',
                    body: 'Agora da para lapidar cor, espacamento, thumb, image e footer no proprio canal final, sem depender de um deploy, de um commit novo ou de um evento passivo acontecer do nada.',
                    calloutLabel: 'Resultado',
                    calloutText: 'Mais velocidade para ajustar layout e menos risco de descobrir feiura so em producao.',
                },
                {
                    icon: '🔒',
                    title: 'Controle so do dono',
                    subtitle: 'Preview restrito e seguro',
                    body: 'O fluxo fake continua limitado ao dono do bot, entao o time pode brincar com os cenarios de teste sem poluir os comandos publicos.',
                    calloutLabel: 'Blindagem',
                    calloutText: 'Controle centralizado, sem abrir brecha para uso indevido.',
                },
            ],
            closingText: 'Quando o preview fica bonito aqui, o changelog real ja nasce muito mais pronto.',
            summaryLines: [
                { kind: 'feature', label: '+ Features (Novidades)', text: '01 motor fake de changelog premium para QA visual' },
                { kind: 'improvement', label: '! Improvements (Melhorias)', text: '02 refinamentos no fluxo de testes dos embeds de feed' },
                { kind: 'fix', label: '- Fixes (Correcões)', text: '01 gargalo de validacao visual eliminado antes do deploy' },
                { kind: 'total', label: '# Total de Alteracoes', text: '4 mudancas simuladas para revisar o layout' },
            ],
            createdAt: new Date().toISOString(),
        });

        await interaction.reply({
            content: `Preview de commit fake enviado em <#${targetChannel.id}>.`,
            flags: ['Ephemeral'],
        });

        await targetChannel.send({ embeds: [embed] });
        return;
    }

    const guildName = interaction.guild?.name || 'Servidor de Teste';
    const iconUrl = interaction.guild?.iconURL({ dynamic: true, size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/1.png';
    const embed = buildGuildArrivalEmbed({
        title: `${guildName} • Entrada Simulada`,
        titleUrl: interaction.guild?.iconURL({ dynamic: true, size: 1024 }) || iconUrl,
        summary: [
            `A IA consolidou uma leitura fake de **${guildName}** para o feed de novidades e descreveu o servidor como um ambiente com cara de comunidade ativa, identidade clara e boa densidade de estrutura interna.`,
            `O resumo puxou nome, contagem de membros, idioma, nivel de verificacao e datas principais para virar um anuncio no mesmo espirito visual das noticias automaticas.`,
            'Esse preview existe para voce ajustar thumbnail, banner, hierarquia do texto e footer antes do fluxo real publicar algo para todos.',
        ].join('\n\n'),
        guildName,
        guildId: interaction.guildId || '000000000000000000',
        ownerId: interaction.guild?.ownerId || interaction.user.id,
        memberCount: interaction.guild?.memberCount || 512,
        preferredLocale: interaction.guild?.preferredLocale || 'pt-BR',
        verificationLevel: String(interaction.guild?.verificationLevel || 'MEDIUM'),
        features: interaction.guild?.features?.slice(0, 6) || ['COMMUNITY', 'NEWS'],
        createdAt: interaction.guild?.createdAt || new Date('2024-04-18T18:00:00.000Z'),
        joinedAt: new Date(),
        iconUrl,
        imageUrl: interaction.guild?.bannerURL?.({ size: 2048, extension: 'png' }) || null,
        detectedAfterRestart: false,
    });

    await interaction.reply({
        content: `Preview de entrada em novo servidor enviado em <#${targetChannel.id}>.`,
        flags: ['Ephemeral'],
    });

    await targetChannel.send({ embeds: [embed] });
}

async function handleNoticiasPreview(interaction) {
    const targetChannel = await resolveConfiguredChannel(interaction, 'novidades');
    if (!targetChannel) {
        return interaction.reply({
            content: 'Nao encontrei canal configurado para novidades. Usa `/setnovidades` antes de testar esse fluxo.',
            flags: ['Ephemeral'],
        });
    }
    const newsEmbed = buildCuteDogNewsEmbed({ requestedBy: interaction.user.username });

    await interaction.reply({
        content: `Noticia fake enviada em <#${targetChannel.id}>.`,
        flags: ['Ephemeral'],
    });

    await targetChannel.send({ embeds: [newsEmbed] });
}

async function handleCommandPreview(interaction) {
    const type = interaction.options.getString('tipo', true);
    const embed = buildFakeCommandResultEmbed({
        type,
        executor: interaction.user,
        guildName: interaction.guild?.name || 'Servidor de Teste',
    });

    await interaction.reply({
        content: `Preview do comando \`${type}\` enviado neste canal.`,
        flags: ['Ephemeral'],
    });

    await interaction.channel.send({ embeds: [embed] });
}

async function resolveConfiguredChannel(interaction, kind) {
    if (!interaction.guildId || !interaction.guild) {
        return null;
    }

    const key = kind === 'logs'
        ? `logs_${interaction.guildId}`
        : `novidades_channel_${interaction.guildId}`;

    const configuredId = db.get(key);
    if (!configuredId) {
        return null;
    }

    const configuredChannel = interaction.guild.channels.cache.get(configuredId)
        || await interaction.guild.channels.fetch(configuredId).catch(() => null);

    return configuredChannel?.isTextBased?.() ? configuredChannel : null;
}

function getTestThumbnail(eventType) {
    const thumbnails = {
        MEMBER_JOIN: 'https://media.tenor.com/W4dF4I0FvTAAAAAC/dog-smile.gif',
        ROLE_DELETE: 'https://cdn.discordapp.com/embed/avatars/2.png',
        BAN: 'https://cdn.discordapp.com/embed/avatars/3.png',
        MSG_DELETE: 'https://cdn.discordapp.com/embed/avatars/4.png',
        CHANNEL_CREATE: 'https://cdn.discordapp.com/embed/avatars/1.png',
        CHANNEL_DELETE: 'https://cdn.discordapp.com/embed/avatars/5.png',
        MESSAGE_EDIT: 'https://cdn.discordapp.com/embed/avatars/0.png',
        VOICE_JOIN: 'https://cdn.discordapp.com/embed/avatars/1.png',
    };

    return thumbnails[eventType] || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function buildFakeCommandResultEmbed({ type, executor, guildName }) {
    const meta = {
        ban: {
            color: '#ED4245',
            title: 'Ban fake executado',
            footer: 'Preview de comando • Ban',
            reason: 'Webhook de laboratorio removido num cenario controlado para revisar o visual da resposta.',
        },
        kick: {
            color: '#FEE75C',
            title: 'Kick fake executado',
            footer: 'Preview de comando • Kick',
            reason: 'Membro fake expulso num cenario de teste para validar o embed final do comando.',
        },
    }[type] || {
        color: '#5865F2',
        title: 'Comando fake executado',
        footer: 'Preview de comando',
        reason: 'Preview visual solicitado pelo dono do bot.',
    };

    return new EmbedBuilder()
        .setColor(meta.color)

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: `🧪 Preview de Comando • ${type.toUpperCase()}`,
            iconURL: executor.displayAvatarURL({ dynamic: true }),
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle(meta.title)

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription([
            '**Cenario fake de teste**',
            `O comando \`${type}\` foi simulado pelo dono para revisar o embed final sem precisar executar uma acao real em **${guildName}**.`,
            '',
            '**Motivo do preview**',
            meta.reason,
        ].join('\n'))

        // ─── Thumbnail / Icone do embed ──────────────────────────────────────
        .setThumbnail(executor.displayAvatarURL({ dynamic: true }))

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(
            { name: 'Alvo fake', value: 'Webhook de teste\n`999999999999999999`', inline: true },
            { name: 'Executor', value: `${executor.tag}\n\`${executor.id}\``, inline: true },
            { name: 'Servidor', value: guildName, inline: true },
        )

        // ─── Footer / Metadados finais ───────────────────────────────────────
        .setFooter({
            text: meta.footer,
            iconURL: executor.displayAvatarURL({ dynamic: true }),
        })

        // ─── Timestamp / Momento do evento ───────────────────────────────────
        .setTimestamp();
}

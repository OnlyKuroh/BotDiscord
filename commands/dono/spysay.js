const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const { renderTemplatePlaceholders } = require('../../utils/template-placeholders');
const { ensureWindow, isWindowActive } = require('../../utils/temp-command-window');
const db = require('../../utils/db');

const DEFAULT_MESSAGE = [
    '${OWNER} @everyone',
    '',
    'Olá, estou entrando em contato para notifica-los que adicionaram um bot Brasileiro PT-BR em seu servidor que mal saiu das fraldas.',
    'Caso notem ele OFF e apenas algumas correções e alterações, contamos também com um site:',
    'https://itadori-dashboard.vercel.app/',
    '',
    'Para melhor atende-los e melhor customização.',
    '',
    'E eu também gostaria de saber por onde conheceram e motivo de adicionar meu bot em seu servidor!',
    '',
    'Para responder esta mensagem, basta digitar /msgpriv',
].join('\n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spysay')
        .setDescription('[TEMPORARIO] Envia um recado do dono no servidor alvo.')
        .addStringOption((option) =>
            option
                .setName('mensagem')
                .setDescription('Mensagem com placeholders tipo ${OWNER}')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('servidor')
                .setDescription('ID do servidor alvo. Se vazio, tenta enviar para todos os outros servidores.')
                .setRequired(false)
        ),
    hiddenFromDashboard: true,
    hiddenFromHelp: true,

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        ensureWindow();
        if (!isWindowActive()) {
            return interaction.reply({
                content: 'A janela temporaria do `/spysay` ja expirou.',
                flags: ['Ephemeral'],
            });
        }

        const rawMessage = interaction.options.getString('mensagem') || DEFAULT_MESSAGE;
        const targetGuildId = interaction.options.getString('servidor') || null;

        const guilds = targetGuildId
            ? [client.guilds.cache.get(targetGuildId)].filter(Boolean)
            : client.guilds.cache.filter((guild) => guild.id !== interaction.guildId).map((guild) => guild);

        if (!guilds.length) {
            return interaction.reply({
                content: 'Nao encontrei servidor alvo no cache do bot.',
                flags: ['Ephemeral'],
            });
        }

        const results = [];
        const report = {
            createdAt: new Date().toISOString(),
            authorId: interaction.user.id,
            authorName: interaction.user.username,
            sourceGuildId: interaction.guildId,
            sourceGuildName: interaction.guild?.name || 'Desconhecido',
            targetGuildId: targetGuildId || null,
            messageTemplate: rawMessage,
            deliveries: [],
        };

        for (const guild of guilds) {
            await guild.channels.fetch().catch(() => null);
            const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
            const ownerId = guild.ownerId || await guild.fetchOwner().then((owner) => owner.id).catch(() => null);
            const ownerMention = ownerId ? `<@${ownerId}>` : '@owner';
            const ownerName = ownerId
                ? guild.members.cache.get(ownerId)?.user?.username || 'owner'
                : 'owner';

            const textChannels = guild.channels.cache
                .filter((channel) => channel.type === ChannelType.GuildText)
                .sort((a, b) => a.rawPosition - b.rawPosition);
            const targetChannel = textChannels.find((channel) => {
                const permissions = me ? channel.permissionsFor(me) : null;
                return permissions?.has(PermissionFlagsBits.ViewChannel) && permissions?.has(PermissionFlagsBits.SendMessages);
            });

            if (!targetChannel) {
                results.push(`❌ ${guild.name}: sem canal de texto valido`);
                report.deliveries.push({
                    guildId: guild.id,
                    guildName: guild.name,
                    status: 'failed',
                    reason: 'sem canal de texto valido',
                });
                db.addLog('SPYSAY_FAIL', `SpySay falhou em ${guild.name}: sem canal de texto valido`, guild.id, interaction.user.id, interaction.user.username);
                continue;
            }

            const content = renderTemplatePlaceholders(rawMessage, {
                ownerMention,
                ownerName,
                guildName: guild.name,
            });

            const sendResult = await targetChannel.send({
                content,
                allowedMentions: {
                    parse: ['everyone', 'users'],
                    users: ownerId ? [ownerId] : [],
                },
            }).then((message) => ({ ok: true, message })).catch((error) => ({ ok: false, error }));

            if (!sendResult.ok) {
                const reason = sendResult.error?.message || sendResult.error?.code || 'falha ao enviar';
                results.push(`❌ ${guild.name}: falhou ao enviar em #${targetChannel.name} (${reason})`);
                report.deliveries.push({
                    guildId: guild.id,
                    guildName: guild.name,
                    channelId: targetChannel.id,
                    channelName: targetChannel.name,
                    status: 'failed',
                    reason,
                });
                db.addLog('SPYSAY_FAIL', `SpySay falhou em ${guild.name} / #${targetChannel.name}: ${String(reason).slice(0, 180)}`, guild.id, interaction.user.id, interaction.user.username);
                continue;
            }

            const sentMessage = sendResult.message;
            const messageUrl = `https://discord.com/channels/${guild.id}/${targetChannel.id}/${sentMessage.id}`;
            results.push(`✅ ${guild.name}: enviado em #${targetChannel.name}\n${messageUrl}`);
            report.deliveries.push({
                guildId: guild.id,
                guildName: guild.name,
                channelId: targetChannel.id,
                channelName: targetChannel.name,
                messageId: sentMessage.id,
                messageUrl,
                ownerId,
                status: 'sent',
            });
            db.addLog('SPYSAY', `SpySay enviado em ${guild.name} / #${targetChannel.name}`, guild.id, interaction.user.id, interaction.user.username);
        }

        db.set(`last_spysay_report_${interaction.user.id}`, report);
        db.set('last_spysay_report_global', report);

        return interaction.reply({
            content: results.join('\n').slice(0, 1900) || 'Nada foi enviado.',
            flags: ['Ephemeral'],
        });
    },
};

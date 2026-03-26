const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const { ensureWindow, isWindowActive } = require('../../utils/temp-command-window');
const db = require('../../utils/db');

function getRecentSpyReport(userId) {
    return db.get(`last_spysay_report_${userId}`)
        || db.get('last_spysay_report_global')
        || null;
}

function formatTimestamp(value) {
    const date = new Date(value || Date.now());
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function buildSummaryEmbed(report) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: 'Spy Check • Relatorio' })
        .setTitle('Ultimo disparo do SpySay')
        .setDescription([
            `**Disparo:** ${formatTimestamp(report.createdAt)}`,
            `**Origem:** ${report.sourceGuildName || 'Desconhecido'}`,
            `**Destinos:** ${report.deliveries.length}`,
            '',
            'Aqui fica o resumo cru de onde tentou mandar, onde foi e onde falhou.',
        ].join('\n'))
        .setTimestamp();

    const deliveries = report.deliveries.slice(0, 10);
    if (!deliveries.length) {
        embed.addFields({ name: 'Status', value: 'Nao achei entregas salvas nesse relatorio.', inline: false });
        return embed;
    }

    embed.addFields(deliveries.map((entry, index) => ({
        name: `${index + 1}. ${entry.guildName}`,
        value: entry.status === 'sent'
            ? [
                `**Canal:** #${entry.channelName || 'desconhecido'}`,
                `**Status:** Enviado`,
                `**Link:** ${entry.messageUrl || 'sem link'}`,
            ].join('\n').slice(0, 1024)
            : [
                `**Canal:** #${entry.channelName || 'desconhecido'}`,
                `**Status:** Falhou`,
                `**Motivo:** ${entry.reason || 'sem detalhe'}`,
            ].join('\n').slice(0, 1024),
        inline: false,
    })));

    return embed;
}

function buildMovementsEmbed(report) {
    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setAuthor({ name: 'Spy Check • Movimentos' })
        .setTitle('Ultimas acoes vistas nos servidores alvo')
        .setDescription('Painel de leitura rapida das ultimas 10 movimentacoes salvas de cada servidor que entrou no ultimo disparo.')
        .setTimestamp();

    const guildIds = [...new Set(report.deliveries.map((entry) => entry.guildId).filter(Boolean))];
    if (!guildIds.length) {
        embed.addFields({ name: 'Movimentos', value: 'Sem servidores no relatorio para puxar atividade.', inline: false });
        return embed;
    }

    const fields = guildIds.slice(0, 5).map((guildId) => {
        const delivery = report.deliveries.find((entry) => entry.guildId === guildId);
        const logs = db.getLogsForGuild(guildId, 10);
        const lines = logs.length
            ? logs.map((log) => `\`${String(log.timestamp || '').slice(11, 16)}\` **${log.type}** — ${String(log.content || '').slice(0, 78)}`).join('\n')
            : 'Nenhuma acao recente salva nesse servidor.';

        return {
            name: delivery?.guildName || guildId,
            value: lines.slice(0, 1024),
            inline: false,
        };
    });

    embed.addFields(fields);
    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spycheck')
        .setDescription('[TEMPORARIO] Mostra o ultimo relatorio do /spysay.'),
    hiddenFromDashboard: true,
    hiddenFromHelp: true,

    async execute(interaction) {
        if (await requireOwner(interaction)) return;

        ensureWindow();
        if (!isWindowActive()) {
            return interaction.reply({
                content: 'A janela temporaria do `/spycheck` ja expirou.',
                flags: ['Ephemeral'],
            });
        }

        const report = getRecentSpyReport(interaction.user.id);
        if (!report?.deliveries?.length) {
            return interaction.reply({
                content: 'Ainda nao tenho relatorio salvo do `/spysay` para te mostrar.',
                flags: ['Ephemeral'],
            });
        }

        const summaryEmbed = buildSummaryEmbed(report);
        const movementsEmbed = buildMovementsEmbed(report);
        const sessionId = interaction.id;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`spycheck_summary_${sessionId}`).setLabel('Relatorio').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`spycheck_movements_${sessionId}`).setLabel('Movimentos').setStyle(ButtonStyle.Primary),
        );

        await interaction.reply({
            embeds: [summaryEmbed],
            components: [row],
            flags: ['Ephemeral'],
        });

        const reply = await interaction.fetchReply().catch(() => null);
        if (!reply) return;

        const collector = reply.createMessageComponentCollector({
            filter: (component) => component.user.id === interaction.user.id && component.customId.endsWith(sessionId),
            time: 180000,
        });

        collector.on('collect', async (component) => {
            const nextEmbed = component.customId.startsWith('spycheck_movements_')
                ? movementsEmbed
                : summaryEmbed;

            await component.update({
                embeds: [nextEmbed],
                components: [row],
            });
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => null);
        });
    },
};

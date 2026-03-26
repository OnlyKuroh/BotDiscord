const { SlashCommandBuilder } = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const { ensureWindow, isWindowActive } = require('../../utils/temp-command-window');
const db = require('../../utils/db');

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

        const report = db.get(`last_spysay_report_${interaction.user.id}`) || db.get('last_spysay_report_global');
        if (!report?.deliveries?.length) {
            return interaction.reply({
                content: 'Ainda nao tenho relatorio salvo do `/spysay` para te mostrar.',
                flags: ['Ephemeral'],
            });
        }

        const header = [
            `Ultimo disparo: ${new Date(report.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            `Origem: ${report.sourceGuildName || 'Desconhecido'}`,
            '',
        ];

        const lines = report.deliveries.map((entry, index) => {
            if (entry.status === 'sent') {
                return `${index + 1}. ${entry.guildName} • #${entry.channelName}\n${entry.messageUrl}`;
            }
            return `${index + 1}. ${entry.guildName} • falhou (${entry.reason || 'sem detalhe'})`;
        });

        return interaction.reply({
            content: [...header, ...lines].join('\n').slice(0, 1900),
            flags: ['Ephemeral'],
        });
    },
};

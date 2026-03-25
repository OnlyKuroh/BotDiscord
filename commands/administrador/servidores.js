const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servidores')
        .setDescription('Lista todos os servidores em que o bot está presente.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    aliases: [],
    detailedDescription: 'Exibe todos os servidores onde o Itadori Bot está presente, ordenados por membros.',
    usage: '`/servidores`',
    permissions: ['Administrador'],

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const sorted = [...client.guilds.cache.values()]
            .sort((a, b) => b.memberCount - a.memberCount);

        const totalMembers = sorted.reduce((a, g) => a + g.memberCount, 0);
        const totalServers = sorted.length;

        const header = `## 🌐 Servidores — Itadori Bot\n*Bot presente em **${totalServers}** servidores • **${totalMembers.toLocaleString('pt-BR')}** membros totais*`;

        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const footer = `🕒 Atualizado em ${timestamp} (Horário de Brasília)`;

        // Split into chunks of 10 to avoid hitting text limits
        const chunks = [];
        for (let i = 0; i < sorted.length; i += 10) {
            chunks.push(sorted.slice(i, i + 10));
        }

        const container = new ContainerBuilder().setAccentColor(0xC41230);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(header)
        );

        for (const chunk of chunks) {
            const listText = chunk
                .map((g, idx) => {
                    const globalIdx = sorted.indexOf(g) + 1;
                    return `**${globalIdx}.** ${g.name}\n👥 ${g.memberCount.toLocaleString('pt-BR')} membros • ID: \`${g.id}\``;
                })
                .join('\n\n');

            container.addSeparatorComponents(new SeparatorBuilder());
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(listText)
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footer)
        );

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};

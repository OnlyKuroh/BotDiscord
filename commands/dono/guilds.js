const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireOwner } = require('../../utils/owner');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guilds')
        .setDescription('[DONO] Lista todos os servidores onde o bot está presente.'),
    aliases: ['servidores', 'guildlist'],
    category: 'dono',
    detailedDescription: 'Lista todos os servidores (guilds) onde o bot está, mostrando nome, ID, membros e dono. Exclusivo para OWNER_ID.',
    usage: '`/guilds`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        await interaction.deferReply({ ephemeral: true });
        const guilds = client.guilds.cache.map(g => g);
        if (!guilds.length) {
            return interaction.editReply('O bot não está em nenhum servidor.');
        }

        // Limitar para evitar embed gigante
        const max = 20;
        const embed = new EmbedBuilder()
            .setTitle('Servidores onde o bot está')
            .setColor('#5865F2')
            .setFooter({ text: `Total: ${guilds.length}` });

        let desc = '';
        for (let i = 0; i < Math.min(guilds.length, max); i++) {
            const g = guilds[i];
            desc += `**${g.name}**\nID: \`${g.id}\`\n👑 Dono: <@${g.ownerId}>\n👥 Membros: ${g.memberCount}\n\n`;
        }
        if (guilds.length > max) desc += `...e mais ${guilds.length - max} servidores.`;

        embed.setDescription(desc);
        return interaction.editReply({ embeds: [embed] });
    },
};

const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.GuildRoleDelete,
    async execute(role) {
        if (!role.guild) return;

        const logChannelId = db.get(`logs_${role.guild.id}`);
        if (!logChannelId) return;

        const logChannel = role.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#c0392b') // Vermelho Escuro
            .setAuthor({ name: 'Fardo Destruído (Cargo Deletado)', iconURL: role.guild.iconURL({ dynamic: true }) })
            .setDescription(`🗑️ O cargo outrora chamado **${role.name}** foi dizimado.`)
            .setTimestamp()
            .setFooter({ text: `Cargo ID: ${role.id} • Servidor: ${role.guild.name}`, iconURL: role.guild.iconURL({ dynamic: true }) });

        await logChannel.send({ embeds: [embed] }).catch(() => null);
    },
};

const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.GuildRoleCreate,
    async execute(role) {
        if (!role.guild) return;

        const logChannelId = db.get(`logs_${role.guild.id}`);
        if (!logChannelId) return;

        const logChannel = role.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71') // Verde
            .setAuthor({ name: 'Fardo Forjado (Cargo Criado)', iconURL: role.guild.iconURL({ dynamic: true }) })
            .setDescription(`➕ Um novo cargo nasceu neste domínio: <@&${role.id}>\n\n📝 **Nome do Cargo**\n\`${role.name}\``)
            .setThumbnail(role.guild.iconURL({ dynamic: true }))
            .setTimestamp()
            .setFooter({ text: `Cargo ID: ${role.id} • Servidor: ${role.guild.name}`, iconURL: role.guild.iconURL({ dynamic: true }) });

        await logChannel.send({ embeds: [embed] }).catch(() => null);
    },
};

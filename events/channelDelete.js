const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel) {
        if (!channel.guild) return;

        const logChannelId = db.get(`logs_${channel.guild.id}`);
        if (!logChannelId) return;

        const logChannel = channel.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#c0392b')
            .setAuthor({ name: 'Terreno Aniquilado', iconURL: channel.guild.iconURL({ dynamic: true }) })
            .setDescription(`🔥 O canal outrora chamado de **${channel.name}** foi apagado.\n\n📝 **Nome**\n\`${channel.name}\``)
            .setTimestamp()
            .setFooter({ text: `Canal: ${channel.id} • Servidor: ${channel.guild.name}`, iconURL: channel.guild.iconURL({ dynamic: true }) });
            
        await logChannel.send({ embeds: [embed] }).catch(()=>null);
    },
};

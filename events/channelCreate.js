const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channelInstance) {
        if (!channelInstance.guild) return;

        const logChannelId = db.get(`logs_${channelInstance.guild.id}`);
        if (!logChannelId) return;

        const logchannel = channelInstance.guild.channels.cache.get(logChannelId);
        if (!logchannel) return;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setAuthor({ name: 'Terreno Construído', iconURL: channelInstance.guild.iconURL({ dynamic: true }) })
            .setDescription(`➕ Um novo pedaço de solo brotou: <#${channelInstance.id}>\n\n📝 **Nome**\n\`${channelInstance.name}\``)
            .setTimestamp()
            .setFooter({ text: `Canal: ${channelInstance.id} • Servidor: ${channelInstance.guild.name}`, iconURL: channelInstance.guild.iconURL({ dynamic: true }) });

        await logchannel.send({ embeds: [embed] }).catch(() => null);
    },
};

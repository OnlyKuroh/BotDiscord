const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildChannelDeleteLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel) {
        if (!channel.guild) return;

        const logChannelId = db.get(`logs_${channel.guild.id}`);
        if (!logChannelId) return;

        const logChannel = channel.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        await logChannel.send({ embeds: [buildChannelDeleteLogEmbed(channel)] }).catch(()=>null);
    },
};

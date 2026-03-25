const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildChannelCreateLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channelInstance) {
        if (!channelInstance.guild) return;

        const logChannelId = db.get(`logs_${channelInstance.guild.id}`);
        if (!logChannelId) return;

        const logchannel = channelInstance.guild.channels.cache.get(logChannelId);
        if (!logchannel) return;

        await logchannel.send({ embeds: [buildChannelCreateLogEmbed(channelInstance)] }).catch(() => null);
    },
};

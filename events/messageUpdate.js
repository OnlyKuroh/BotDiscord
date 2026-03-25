const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildMessageEditLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!oldMessage.guild || !oldMessage.author || oldMessage.author.bot) return;
        if (oldMessage.content === newMessage.content) return; // ignora mudanças apenas de embeds do discord

        const logChannelId = db.get(`logs_${oldMessage.guild.id}`);
        if (!logChannelId) return;

        const logChannel = oldMessage.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        await logChannel.send({ embeds: [buildMessageEditLogEmbed(oldMessage, newMessage)] }).catch(()=>null);
        db.addLog('MESSAGE_EDIT', `Mensagem de ${oldMessage.author.username} editada em #${oldMessage.channel.name}`, oldMessage.guild.id, oldMessage.author.id, oldMessage.author.username);
    },
};

const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!oldMessage.guild || !oldMessage.author || oldMessage.author.bot) return;
        if (oldMessage.content === newMessage.content) return; // ignora mudanças apenas de embeds do discord

        const logChannelId = db.get(`logs_${oldMessage.guild.id}`);
        if (!logChannelId) return;

        const logChannel = oldMessage.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#f39c12')
            .setAuthor({ name: 'Fatos Reescritos', iconURL: oldMessage.author.displayAvatarURL({ dynamic: true }) })
            .setDescription(`📝 <@${oldMessage.author.id}> editou uma mensagem em <#${oldMessage.channel.id}>\n[Pular para a mensagem editada](${newMessage.url})`)
            .setThumbnail(oldMessage.author.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Antes', value: `\`\`\`text\n${oldMessage.content ? oldMessage.content.slice(0, 1000) : 'vazio'}\n\`\`\`` },
                { name: 'Depois', value: `\`\`\`text\n${newMessage.content ? newMessage.content.slice(0, 1000) : 'vazio'}\n\`\`\`` }
            )
            .setTimestamp()
            .setFooter({ text: `ID: ${oldMessage.author.id} • ${oldMessage.author.username} • ${oldMessage.guild.name}`, iconURL: oldMessage.author.displayAvatarURL({ dynamic: true }) });

        await logChannel.send({ embeds: [embed] }).catch(()=>null);
        db.addLog('MESSAGE_EDIT', `Mensagem de ${oldMessage.author.username} editada em #${oldMessage.channel.name}`, oldMessage.guild.id, oldMessage.author.id, oldMessage.author.username);
    },
};

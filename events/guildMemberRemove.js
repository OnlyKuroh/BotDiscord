const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const updateMemberCounter = require('../utils/updateMemberCounter');
const { handleMemberLeave } = require('../utils/newsRoleStats');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (!member.guild) return;

        handleMemberLeave(member);

        // --- CONTADOR DE MEMBROS ---
        await updateMemberCounter(member.guild);

        const logChannelId = db.get(`logs_${member.guild.id}`);
        if (!logChannelId) return;

        const logChannel = member.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#e74c3c') // Vermelho - saiu ou kicado/banido
            .setAuthor({ name: 'Alvo Eliminado ou Fuga', iconURL: member.user.displayAvatarURL({ dynamic: true }) })
            .setDescription(`🚪 <@${member.user.id}> abandonou o servidor.`)
            .setTimestamp()
            .setFooter({ text: `ID: ${member.user.id} • ${member.user.username} • ${member.guild.name}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) });

        await logChannel.send({ embeds: [embed] }).catch(() => null);
        db.addLog('MEMBER_LEAVE', `${member.user.username} saiu do servidor`, member.guild.id, member.user.id, member.user.username);
    },
};

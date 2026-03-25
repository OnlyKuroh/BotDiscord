const { Events } = require('discord.js');
const db = require('../utils/db');
const updateMemberCounter = require('../utils/updateMemberCounter');
const { handleMemberLeave } = require('../utils/newsRoleStats');
const { buildMemberLeaveLogEmbed } = require('../utils/system-embeds');
const { evaluatePlatformMilestones } = require('../utils/milestone-announcer');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (!member.guild) return;

        handleMemberLeave(member);

        // --- CONTADOR DE MEMBROS ---
        await updateMemberCounter(member.guild);
        await evaluatePlatformMilestones(member.client);

        const logChannelId = db.get(`logs_${member.guild.id}`);
        if (!logChannelId) return;

        const logChannel = member.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        await logChannel.send({ embeds: [buildMemberLeaveLogEmbed(member)] }).catch(() => null);
        db.addLog('MEMBER_LEAVE', `${member.user.username} saiu do servidor`, member.guild.id, member.user.id, member.user.username);
    },
};

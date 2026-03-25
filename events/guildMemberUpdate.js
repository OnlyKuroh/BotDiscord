const { Events } = require('discord.js');
const db = require('../utils/db');
const { syncRoleCounterDiff } = require('../utils/newsRoleStats');
const {
    buildNicknameUpdateLogEmbed,
    buildRoleUpdateLogEmbed,
    buildTimeoutLogEmbed,
} = require('../utils/system-embeds');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        if(oldMember.guild.id !== newMember.guild.id) return;

        syncRoleCounterDiff(oldMember, newMember);

        const logChannelId = db.get(`logs_${newMember.guild.id}`);
        if (!logChannelId) return;

        const channel = newMember.guild.channels.cache.get(logChannelId);
        if (!channel) return;

        // Se o apelido (nickname) mudou
        if (oldMember.nickname !== newMember.nickname) {
            await channel.send({ embeds: [buildNicknameUpdateLogEmbed(oldMember, newMember)] }).catch(() => null);
        }

        // Se cargos foram alterados
        const oldRoles = oldMember.roles.cache.map(r => String(r.id)).filter(id => id !== newMember.guild.id);
        const newRoles = newMember.roles.cache.map(r => String(r.id)).filter(id => id !== newMember.guild.id);

        if (oldRoles.length !== newRoles.length) {
            const added = newRoles.filter(r => !oldRoles.includes(r));
            const removed = oldRoles.filter(r => !newRoles.includes(r));
            if (added[0]) {
                await channel.send({ embeds: [buildRoleUpdateLogEmbed(newMember, added[0], 'added')] }).catch(() => null);
            }
            if (removed[0]) {
                await channel.send({ embeds: [buildRoleUpdateLogEmbed(newMember, removed[0], 'removed')] }).catch(() => null);
            }
        }

        // Se sofreu castigo (Timeout/Mute em chat)
        if (!oldMember.isCommunicationDisabled() && newMember.isCommunicationDisabled()) {
            await channel.send({ embeds: [buildTimeoutLogEmbed(newMember, 'applied')] }).catch(() => null);
        } else if (oldMember.isCommunicationDisabled() && !newMember.isCommunicationDisabled()) {
            await channel.send({ embeds: [buildTimeoutLogEmbed(newMember, 'removed')] }).catch(() => null);
        }
    },
};

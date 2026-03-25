const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildVoiceLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        if (!newState.guild) return;

        const logChannelId = db.get(`logs_${newState.guild.id}`);
        if (!logChannelId) return;

        const logChannel = newState.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;
        if (!newState.member) return; // membro não está em cache

        // Entrou em call
        if (!oldState.channelId && newState.channelId) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'join', member: newState.member, newChannelId: newState.channelId })] }).catch(()=>null);
            db.addLog('VOICE_JOIN', `${newState.member.user.username} entrou em #${newState.channel?.name}`, newState.guild.id, newState.member.user.id, newState.member.user.username);
        }
        // Saiu da call
        else if (oldState.channelId && !newState.channelId) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'leave', member: newState.member, oldChannelId: oldState.channelId })] }).catch(()=>null);
            db.addLog('VOICE_LEAVE', `${newState.member.user.username} saiu de #${oldState.channel?.name}`, newState.guild.id, newState.member.user.id, newState.member.user.username);
        }
        // Moveu de call
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'move', member: newState.member, oldChannelId: oldState.channelId, newChannelId: newState.channelId })] }).catch(()=>null);
            db.addLog('VOICE_MOVE', `${newState.member.user.username} mudou de call`, newState.guild.id, newState.member.user.id, newState.member.user.username);
        }
        // Servidor mutou na call
        else if (!oldState.serverMute && newState.serverMute) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverMute', member: newState.member })] }).catch(()=>null);
        }
        // Servidor tirou o mute na call
        else if (oldState.serverMute && !newState.serverMute) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverUnmute', member: newState.member })] }).catch(()=>null);
        }
        // Servidor ensurdeceu na call
        else if (!oldState.serverDeaf && newState.serverDeaf) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverDeaf', member: newState.member })] }).catch(()=>null);
        }
        // Servidor liberou audição
        else if (oldState.serverDeaf && !newState.serverDeaf) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverUndeaf', member: newState.member })] }).catch(()=>null);
        }
    },
};

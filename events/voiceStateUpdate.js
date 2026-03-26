const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildVoiceLogEmbed } = require('../utils/system-embeds');
const { startVoiceSession, updateVoiceSession, finishVoiceSession } = require('../utils/jjk-system');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        if (!newState.guild) return;

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        // --- SISTEMA JJK DE PRESENÇA EM CALL ---
        if (!oldState.channelId && newState.channelId) {
            startVoiceSession(member);
        } else if (oldState.channelId && !newState.channelId) {
            await finishVoiceSession(member).catch(() => null);
        } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            updateVoiceSession(member);
        }

        const logChannelId = db.get(`logs_${newState.guild.id}`);
        if (!logChannelId) return;

        const logChannel = newState.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        // Entrou em call
        if (!oldState.channelId && newState.channelId) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'join', member, newChannelId: newState.channelId })] }).catch(()=>null);
            db.addLog('VOICE_JOIN', `${member.user.username} entrou em #${newState.channel?.name}`, newState.guild.id, member.user.id, member.user.username);
        }
        // Saiu da call
        else if (oldState.channelId && !newState.channelId) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'leave', member, oldChannelId: oldState.channelId })] }).catch(()=>null);
            db.addLog('VOICE_LEAVE', `${member.user.username} saiu de #${oldState.channel?.name}`, newState.guild.id, member.user.id, member.user.username);
        }
        // Moveu de call
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'move', member, oldChannelId: oldState.channelId, newChannelId: newState.channelId })] }).catch(()=>null);
            db.addLog('VOICE_MOVE', `${member.user.username} mudou de call`, newState.guild.id, member.user.id, member.user.username);
        }
        // Servidor mutou na call
        else if (!oldState.serverMute && newState.serverMute) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverMute', member })] }).catch(()=>null);
        }
        // Servidor tirou o mute na call
        else if (oldState.serverMute && !newState.serverMute) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverUnmute', member })] }).catch(()=>null);
        }
        // Servidor ensurdeceu na call
        else if (!oldState.serverDeaf && newState.serverDeaf) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverDeaf', member })] }).catch(()=>null);
        }
        // Servidor liberou audição
        else if (oldState.serverDeaf && !newState.serverDeaf) {
            await logChannel.send({ embeds: [buildVoiceLogEmbed({ kind: 'serverUndeaf', member })] }).catch(()=>null);
        }
    },
};

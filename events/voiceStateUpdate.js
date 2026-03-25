const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

const formatTime = (date) => {
    if (!date) return '';
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

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
            const embed = new EmbedBuilder()
                .setColor('#00ff00') // Verde Vívido
                .setAuthor({ name: 'Entrou em Call', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🎶🎤 <@${newState.member.user.id}> entrou em <#${newState.channelId}>\n🎶🎤 **Canal:** <#${newState.channelId}>`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });
            
            await logChannel.send({ embeds: [embed] }).catch(()=>null);
            db.addLog('VOICE_JOIN', `${newState.member.user.username} entrou em #${newState.channel?.name}`, newState.guild.id, newState.member.user.id, newState.member.user.username);
        }
        // Saiu da call
        else if (oldState.channelId && !newState.channelId) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000') // Vermelho Vívido
                .setAuthor({ name: 'Saiu da Call', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🎶🎤 <@${newState.member.user.id}> saiu de <#${oldState.channelId}>\n🎶🎤 **Canal:** <#${oldState.channelId}>`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });
            
            await logChannel.send({ embeds: [embed] }).catch(()=>null);
            db.addLog('VOICE_LEAVE', `${newState.member.user.username} saiu de #${oldState.channel?.name}`, newState.guild.id, newState.member.user.id, newState.member.user.username);
        }
        // Moveu de call
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const embed = new EmbedBuilder()
                .setColor('#f39c12')
                .setAuthor({ name: 'Moveu de Call', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🎶🎤 <@${newState.member.user.id}> mudou de call.\n🎶🎤 **Antigo**: <#${oldState.channelId}>\n🎶🎤 **Novo**: <#${newState.channelId}>`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });
            
            await logChannel.send({ embeds: [embed] }).catch(()=>null);
            db.addLog('VOICE_MOVE', `${newState.member.user.username} mudou de call`, newState.guild.id, newState.member.user.id, newState.member.user.username);
        }
        // Servidor mutou na call
        else if (!oldState.serverMute && newState.serverMute) {
            const embed = new EmbedBuilder()
                .setColor('#e67e22') // Laranja
                .setAuthor({ name: 'Voz Bloqueada (Servidor)', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🔇 <@${newState.member.user.id}> foi silenciado no canal de voz por determinação divina.`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });

            await logChannel.send({ embeds: [embed] }).catch(()=>null);
        }
        // Servidor tirou o mute na call
        else if (oldState.serverMute && !newState.serverMute) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00') // Verde Vívido
                .setAuthor({ name: 'Voz Liberada (Servidor)', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🔊 <@${newState.member.user.id}> teve a voz restituída no canal de voz.`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });

            await logChannel.send({ embeds: [embed] }).catch(()=>null);
        }
        // Servidor ensurdeceu na call
        else if (!oldState.serverDeaf && newState.serverDeaf) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000') // Vermelho Vívido
                .setAuthor({ name: 'Audição Destruída (Servidor)', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🎧 <@${newState.member.user.id}> ficou surdo e mudo no canal (Server Deafen).`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });

            await logChannel.send({ embeds: [embed] }).catch(()=>null);
        }
        // Servidor liberou audição
        else if (oldState.serverDeaf && !newState.serverDeaf) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00') // Verde Vívido
                .setAuthor({ name: 'Audição Restaurada (Servidor)', iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🎧 <@${newState.member.user.id}> teve sua audição restaurada.`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newState.member.user.id} • ${formatTime(new Date())}`, iconURL: newState.member.user.displayAvatarURL({ dynamic: true }) });

            await logChannel.send({ embeds: [embed] }).catch(()=>null);
        }
    },
};

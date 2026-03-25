const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { syncRoleCounterDiff } = require('../utils/newsRoleStats');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        if(oldMember.guild.id !== newMember.guild.id) return;

        syncRoleCounterDiff(oldMember, newMember);

        const logChannelId = db.get(`logs_${newMember.guild.id}`);
        if (!logChannelId) return;

        const channel = newMember.guild.channels.cache.get(logChannelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setAuthor({ name: 'Evolução ou Declínio', iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
            .setTimestamp()
            .setFooter({ text: `ID: ${newMember.user.id} • ${newMember.user.username} • ${newMember.guild.name}`, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) });

        // Se o apelido (nickname) mudou
        if (oldMember.nickname !== newMember.nickname) {
            embed.setDescription(`**${newMember.user.tag}** distorceu sua verdadeira identidade neste servidor.`);
            embed.addFields(
                { name: 'Antiga', value: oldMember.nickname || '*Manteve nome original*', inline: true },
                { name: 'Nova', value: newMember.nickname || '*Voltou ao nome original*', inline: true }
            );
            await channel.send({ embeds: [embed] }).catch(() => null);
        }

        // Se cargos foram alterados
        const oldRoles = oldMember.roles.cache.map(r => String(r.id)).filter(id => id !== newMember.guild.id);
        const newRoles = newMember.roles.cache.map(r => String(r.id)).filter(id => id !== newMember.guild.id);

        if (oldRoles.length !== newRoles.length) {
            const added = newRoles.filter(r => !oldRoles.includes(r));
            const removed = oldRoles.filter(r => !newRoles.includes(r));

            const isAdd = added.length > 0;
            const embedRole = new EmbedBuilder()
                .setColor(isAdd ? '#2ecc71' : '#e74c3c')
                .setAuthor({ name: isAdd ? 'Peso Adicionado' : 'Peso Removido', iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(isAdd ? `🔰 <@${newMember.user.id}> recebeu o fardo <@&${added[0]}>` : `🗑️ <@${newMember.user.id}> perdeu o fardo <@&${removed[0]}>`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newMember.user.id} • ${newMember.user.username} • ${newMember.guild.name}`, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) });

            await channel.send({ embeds: [embedRole] }).catch(() => null);
        }

        // Se sofreu castigo (Timeout/Mute em chat)
        if (!oldMember.isCommunicationDisabled() && newMember.isCommunicationDisabled()) {
            const embedTimeout = new EmbedBuilder()
                .setColor('#e67e22') // Laranja/Aviso - Mutado
                .setAuthor({ name: 'Voz Silenciada', iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🔇 <@${newMember.user.id}> sofreu um castigo e foi mutado no servidor (Timeout) até <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:R>.`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newMember.user.id} • ${newMember.user.username} • ${newMember.guild.name}`, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) });
            
            await channel.send({ embeds: [embedTimeout] }).catch(() => null);
        } else if (oldMember.isCommunicationDisabled() && !newMember.isCommunicationDisabled()) {
            const embedTimeout = new EmbedBuilder()
                .setColor('#2ecc71') // Verde - Desmutado
                .setAuthor({ name: 'Voz Restaurada', iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
                .setDescription(`🔊 <@${newMember.user.id}> teve seu castigo (Timeout) revogado e pode falar novamente.`)
                .setTimestamp()
                .setFooter({ text: `ID: ${newMember.user.id} • ${newMember.user.username} • ${newMember.guild.name}`, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) });

            await channel.send({ embeds: [embedTimeout] }).catch(() => null);
        }
    },
};

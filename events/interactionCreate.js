const { Events } = require('discord.js');
const { formatResponse } = require('../utils/persona');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) return;

            try {
                // Filtro de canais
                const db = require('../utils/db');
                const channelFilter = db.get(`channel_filter_${interaction.guildId}`) || { mode: 'off', channels: [] };
                if (channelFilter.mode !== 'off' && channelFilter.channels.length > 0) {
                    const isInList = channelFilter.channels.includes(interaction.channelId);
                    const blocked = (channelFilter.mode === 'allow' && !isInList) ||
                                    (channelFilter.mode === 'deny'  && isInList);
                    if (blocked) {
                        const allowedList = channelFilter.mode === 'allow'
                            ? channelFilter.channels.map(id => `<#${id}>`).join(', ')
                            : null;
                        const msg = allowedList
                            ? `🚫 Este canal está bloqueado para uso de comandos. Utilize os comandos nos canais permitidos: ${allowedList}`
                            : `🚫 Este canal está bloqueado para uso de comandos.`;
                        return interaction.reply({ content: msg, flags: ['Ephemeral'] });
                    }
                }

                if (command.execute) {
                    await command.execute(interaction, client);

                    const db = require('../utils/db');
                    db.incrementStat('slash_commands_used');
                    db.addLog('COMMAND', `/${interaction.commandName} usado por ${interaction.user.username}`, interaction.guildId, interaction.user.id, interaction.user.username);

                    // LOG DE COMANDO USADO NO DISCORD
                    const logChannelId = db.get(`logs_${interaction.guildId}`);
                    if (logChannelId) {
                        const logChannel = interaction.guild.channels.cache.get(logChannelId);
                        if (logChannel) {
                            const { EmbedBuilder } = require('discord.js');
                            const embedLog = new EmbedBuilder()
                                .setColor('#3498db')
                                .setAuthor({ name: 'Corte Desferido', iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                                .setDescription(`⚔️ <@${interaction.user.id}> usou um comando local em <#${interaction.channelId}>\n\n⚙️ **Comando**\n\`/${interaction.commandName}\``)
                                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                                .setTimestamp()
                                .setFooter({ text: `ID: ${interaction.user.id} • ${interaction.user.username} • ${interaction.guild.name}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
                            await logChannel.send({ embeds: [embedLog] }).catch(()=>null);
                        }
                    }
                }
            } catch (error) {
                console.error(error);
                const msg = 'Encontrei um erro. Mesmo sangrando, não vamos parar.';
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: formatResponse(msg), flags: ['Ephemeral'] });
                } else {
                    await interaction.reply({ content: formatResponse(msg), flags: ['Ephemeral'] });
                }
            }
        } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            // ── HELP MENU ─────────────────────────────────────────────
            if (interaction.customId === 'help_menu') {
                const helpCommand = client.commands.get('help');
                if (helpCommand && helpCommand.handleSelectMenu) {
                    await helpCommand.handleSelectMenu(interaction, client);
                }
            } else if (interaction.customId.startsWith('help_')) {
                const helpCommand = client.commands.get('help');
                if (helpCommand && helpCommand.handleButton) {
                    await helpCommand.handleButton(interaction, client);
                }
            }
        }
    },
};

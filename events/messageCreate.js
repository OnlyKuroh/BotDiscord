const { Events, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../utils/persona');
const { maybeHandleItadoriChat } = require('../utils/itadori-chatbot');
const { trackCommandAbuse } = require('../utils/security-monitor');

const MENTION_RESPONSES = [
    'Oi! Precisando de ajuda? Use `/help` pra ver o que eu consigo fazer. Eu tô aqui, assim como fiquei quando Gojo me disse que eu seria o receptáculo... exceto que dessa vez é só um bot.',
    'Você me chamou? Tô com energia amaldiçoada sobrando. Use `/help` e vamos ao trabalho!',
    'Não precisa me mencionar pra falar comigo — os comandos de barra `/` são minha língua. Tente `/help`.',
    'Sentiu minha presença? Usa `/help` se precisar. Yuji tá de plantão.',
    'Falou comigo? Energia amaldiçoada carregada. Slash commands disponíveis — tenta `/help`.',
];

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        const db = require('../utils/db');
        if (message.author.bot) return;

        if (!message.guild) {
            db.addLog(
                'BOT_DM_INBOUND',
                `DM recebida: ${String(message.content || '[sem texto]').slice(0, 500)}`,
                null,
                message.author.id,
                message.author.username
            );
            return;
        }

        // --- SISTEMA DE VERIFICAÇÃO ---
        const verifyChannelId = db.get(`verify_channel_${message.guild.id}`);

        if (message.channel.id === verifyChannelId) {
            const content = message.content.toLowerCase().trim();
            const verifyConfig = db.get(`verify_config_${message.guild.id}`) || {};
            const keyword = (verifyConfig.keyword || 'verificar').toLowerCase();
            const roleId = db.get(`verify_role_${message.guild.id}`) || '1481553129437921491';
            const roleId2 = db.get(`verify_role2_${message.guild.id}`);

            if (content === keyword) {
                await message.delete().catch(() => null);
                const rolesToAdd = [roleId, roleId2].filter(Boolean);
                if (!message.member.roles.cache.has(roleId)) {
                    await message.member.roles.add(rolesToAdd).catch(() => null);
                    const msg = verifyConfig.message
                        ? verifyConfig.message.replace(/@USER/gi, `<@${message.author.id}>`)
                        : `<@${message.author.id}>, você foi autenticado. O domínio agora está aberto para você.`;
                    const success = await message.channel.send(msg);
                    setTimeout(() => success.delete().catch(() => null), 5000);
                }
                return;
            } else {
                await message.delete().catch(() => null);
                const warn = await message.channel.send(`<@${message.author.id}>, você não pode digitar outras coisas aqui, apenas digite **${keyword}** para liberar os canais do servidor!`);
                setTimeout(() => warn.delete().catch(() => null), 5000);
                return;
            }
        }

        // --- BLACKLIST DE SERVIDOR ---
        if (db.isGuildBlacklisted(message.guild.id)) return;

        // --- CHATBOT ITADORI (Groq) ---
        if (await maybeHandleItadoriChat(message, client)) {
            return;
        }

        // --- MENÇÃO AO BOT (fallback simples) ---
        if (message.mentions.has(client.user)) {
            const customResponse = db.get(`mention_response_${message.guild.id}`);
            const text = customResponse || MENTION_RESPONSES[Math.floor(Math.random() * MENTION_RESPONSES.length)];
            db.addLog('MENTION', `Bot mencionado em <#${message.channel.id}>`, message.guild.id, message.author.id, message.author.username);
            await message.reply(text).catch(() => null);
            return;
        }

        // --- COMANDOS PERSONALIZADOS ---
        const customCmds = db.getCustomCommands(message.guild.id);
        if (customCmds.length > 0) {
            const msgNorm = message.content.toLowerCase().trim();
            for (const cmd of customCmds) {
                if (!cmd.enabled) continue;
                const trigger = cmd.trigger.toLowerCase();
                let match = false;
                if (cmd.trigger_type === 'prefix') match = msgNorm.startsWith(trigger);
                else if (cmd.trigger_type === 'contains') match = msgNorm.includes(trigger);
                else if (cmd.trigger_type === 'exact') match = msgNorm === trigger;
                if (!match) continue;

                // Verificar cargo necessário
                if (cmd.required_role_id && !message.member.roles.cache.has(cmd.required_role_id)) continue;

                // Verificar cooldown individual
                if (cmd.cooldown_seconds > 0) {
                    const cdKey = `customcmd_cd_${message.guild.id}_${cmd.id}_${message.author.id}`;
                    const until = db.get(cdKey);
                    if (until && Date.now() < until) continue;
                    db.set(cdKey, Date.now() + cmd.cooldown_seconds * 1000);
                }

                await message.reply(cmd.response).catch(() => null);
                db.addLog('CUSTOM_CMD_TRIGGER', `Comando customizado "${cmd.trigger}" acionado`, message.guild.id, message.author.id, message.author.username);
                return;
            }
        }

        const prefix = client.prefix;
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName) || client.commands.get(client.aliases.get(commandName));

        if (!command || !command.executePrefix) return;

        // Filtro de canais
        const channelFilter = db.get(`channel_filter_${message.guild.id}`) || { mode: 'off', channels: [] };
        if (channelFilter.mode !== 'off' && channelFilter.channels.length > 0) {
            const isInList = channelFilter.channels.includes(message.channel.id);
            const blocked = (channelFilter.mode === 'allow' && !isInList) ||
                            (channelFilter.mode === 'deny'  && isInList);
            if (blocked) {
                const allowedList = channelFilter.mode === 'allow'
                    ? channelFilter.channels.map(id => `<#${id}>`).join(', ')
                    : null;
                const msg = allowedList
                    ? `🚫 Este canal está bloqueado para uso de comandos. Utilize os comandos nos canais permitidos: ${allowedList}`
                    : `🚫 Este canal está bloqueado para uso de comandos.`;
                const warn = await message.reply({ content: msg }).catch(() => null);
                if (warn) setTimeout(() => warn.delete().catch(() => null), 6000);
                return;
            }
        }

        try {
            await command.executePrefix(message, args, client);
            db.incrementStat('slash_commands_used');
            db.addLog('COMMAND', `${client.prefix}${commandName} usado por ${message.author.username}`, message.guild.id, message.author.id, message.author.username);
            trackCommandAbuse({
                guild: message.guild,
                user: message.author,
                commandName: `${client.prefix}${commandName}`,
                source: 'prefix',
            });

            // LOG DE COMANDO USADO (Prefixo)
            const logChannelId = require('../utils/db').get(`logs_${message.guild.id}`);
            if (logChannelId) {
                const logChannel = message.guild.channels.cache.get(logChannelId);
                if (logChannel) {
                    const { EmbedBuilder } = require('discord.js');
                    const embedLog = new EmbedBuilder()
                        .setColor('#3498db')
                        .setAuthor({ name: 'Corte Desferido', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setDescription(`⚔️ <@${message.author.id}> usou um comando local em <#${message.channel.id}>\n\n⚙️ **Comando**\n\`${client.prefix}${commandName}\``)
                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                        .setTimestamp()
                        .setFooter({ text: `ID: ${message.author.id} • ${message.author.username} • ${message.guild.name}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });
                    await logChannel.send({ embeds: [embedLog] }).catch(()=>null);
                }
            }

        } catch (error) {
            console.error(error);
            db.addLog(
                'COMMAND_ERROR',
                `Erro no comando ${client.prefix}${commandName}: ${String(error?.stack || error).slice(0, 1200)}`,
                message.guild.id,
                message.author.id,
                message.author.username
            );
            const msg = 'Encontrei um erro. Mesmo sangrando, não vamos parar.';
            await message.reply({ content: formatResponse(msg) });
        }
    },
};

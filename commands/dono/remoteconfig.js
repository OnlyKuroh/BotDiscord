const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remoteconfig')
        .setDescription('[DONO] Altera configurações de qualquer servidor remotamente.')
        .addSubcommand(sub =>
            sub.setName('prefix')
                .setDescription('Altera o prefixo de comandos de um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addStringOption(o => o.setName('valor').setDescription('Novo prefixo (ex: !, ?, -)').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('nickname')
                .setDescription('Altera o apelido do bot em um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addStringOption(o => o.setName('valor').setDescription('Novo apelido (vazio = resetar)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('welcome-toggle')
                .setDescription('Ativa ou desativa o welcome de um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addBooleanOption(o => o.setName('ativo').setDescription('true = ativar, false = desativar').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('logs-canal')
                .setDescription('Define o canal de logs de um servidor remotamente.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addStringOption(o => o.setName('channel_id').setDescription('ID do canal de logs').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('mention-response')
                .setDescription('Define a resposta ao ser mencionado em um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addStringOption(o => o.setName('valor').setDescription('Resposta personalizada (vazio = padrão)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Ver todas as configs de um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
        ),
    aliases: ['rc', 'remote'],
    category: 'dono',
    detailedDescription: 'Gerencia configurações de qualquer servidor remotamente sem precisar estar no servidor.',
    usage: '`/remoteconfig <subcommand> [guild_id] [valor]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.options.getString('guild_id', true).trim();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        const guild = client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : guildId;

        if (sub === 'prefix') {
            const valor = interaction.options.getString('valor', true).trim();
            if (valor.length > 5) return interaction.editReply('❌ Prefixo muito longo (máx 5 chars).');
            db.set(`prefix_${guildId}`, valor);
            db.addLog('REMOTE_CONFIG', `Prefixo alterado para "${valor}" remotamente`, guildId, interaction.user.id, interaction.user.username);
            return interaction.editReply(`✅ Prefixo de **${guildName}** alterado para \`${valor}\``);
        }

        if (sub === 'nickname') {
            const valor = interaction.options.getString('valor') || '';
            if (guild?.members?.me) {
                await guild.members.me.setNickname(valor || null).catch(() => null);
            }
            db.addLog('REMOTE_CONFIG', `Nickname alterado para "${valor || 'padrão'}" remotamente`, guildId, interaction.user.id, interaction.user.username);
            return interaction.editReply(`✅ Nickname em **${guildName}** alterado para \`${valor || '(padrão)'}\``);
        }

        if (sub === 'welcome-toggle') {
            const ativo = interaction.options.getBoolean('ativo', true);
            const config = db.get(`welcome_${guildId}`) || {};
            if (ativo) {
                if (!config.channelId) return interaction.editReply('❌ Nenhum canal de welcome configurado para este servidor.');
                db.set(`welcome_${guildId}`, { ...config, enabled: true });
            } else {
                db.set(`welcome_${guildId}`, { ...config, enabled: false });
            }
            return interaction.editReply(`✅ Welcome em **${guildName}** ${ativo ? 'ativado' : 'desativado'}.`);
        }

        if (sub === 'logs-canal') {
            const channelId = interaction.options.getString('channel_id', true).trim();
            db.set(`logs_${guildId}`, channelId);
            db.addLog('REMOTE_CONFIG', `Canal de logs definido para <#${channelId}> remotamente`, guildId, interaction.user.id, interaction.user.username);
            return interaction.editReply(`✅ Canal de logs de **${guildName}** definido para \`${channelId}\``);
        }

        if (sub === 'mention-response') {
            const valor = interaction.options.getString('valor') || '';
            if (valor) {
                db.set(`mention_response_${guildId}`, valor);
            } else {
                db.delete(`mention_response_${guildId}`);
            }
            return interaction.editReply(`✅ Resposta de menção em **${guildName}** ${valor ? 'definida' : 'resetada para padrão'}.`);
        }

        if (sub === 'ver') {
            const prefix = db.get(`prefix_${guildId}`) || '-';
            const welcome = db.get(`welcome_${guildId}`) || {};
            const logsChannel = db.get(`logs_${guildId}`) || null;
            const verifyChannel = db.get(`verify_channel_${guildId}`) || null;
            const iaConfig = db.get(`ia_config_${guildId}`) || {};
            const mentionResp = db.get(`mention_response_${guildId}`) || '(padrão)';
            const customCmds = db.getCustomCommands(guildId);
            const blacklisted = db.isGuildBlacklisted(guildId);
            const autoRoles = db.get(`auto_roles_${guildId}`) || [];
            const channelFilter = db.get(`channel_filter_${guildId}`) || { mode: 'off' };

            const container = new ContainerBuilder().setAccentColor(0x5865F2);

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `## ⚙️ Config Remota — ${guildName}\n**ID:** \`${guildId}\``
            ));
            container.addSeparatorComponents(new SeparatorBuilder());

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
                `**Prefixo:** \`${prefix}\``,
                `**Welcome:** ${welcome.channelId ? `<#${welcome.channelId}> ${welcome.enabled !== false ? '✅' : '❌'}` : '❌ Não configurado'}`,
                `**Logs:** ${logsChannel ? `<#${logsChannel}> ✅` : '❌ Não configurado'}`,
                `**Verificação:** ${verifyChannel ? `<#${verifyChannel}> ✅` : '❌ Não configurado'}`,
                `**IA:** ${iaConfig.enabled !== false ? '✅ Ativa' : '❌ Desativada'} ${iaConfig.dmMode ? '(DM)' : '(canal)'}`,
                `**Auto-Roles:** ${autoRoles.length > 0 ? `${autoRoles.length} cargo(s)` : 'Nenhum'}`,
                `**Filtro Canais:** ${channelFilter.mode}`,
                `**Cmds Custom:** ${customCmds.length}`,
                `**Menção:** ${String(mentionResp).slice(0, 60)}`,
                `**Blacklist:** ${blacklisted ? '🔴 SIM' : '🟢 Não'}`,
            ].join('\n')));

            return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;
        const [sub, guildId, ...rest] = args;
        if (!sub || !guildId) return message.reply('Uso: `-remoteconfig <ver|prefix|nickname> <guild_id> [valor]`');

        if (sub === 'ver') {
            const prefix = db.get(`prefix_${guildId}`) || '-';
            const logsChannel = db.get(`logs_${guildId}`);
            const iaConfig = db.get(`ia_config_${guildId}`) || {};
            return message.reply([
                `⚙️ Config de \`${guildId}\`:`,
                `Prefixo: \`${prefix}\``,
                `Logs: ${logsChannel ? `\`${logsChannel}\`` : 'N/A'}`,
                `IA: ${iaConfig.enabled !== false ? 'Ativa' : 'Desativada'}`,
            ].join('\n'));
        }

        if (sub === 'prefix') {
            const valor = rest.join(' ').trim();
            if (!valor) return message.reply('Informe o novo prefixo.');
            db.set(`prefix_${guildId}`, valor);
            return message.reply(`✅ Prefixo de \`${guildId}\` alterado para \`${valor}\``);
        }

        return message.reply('Subcomandos: `ver`, `prefix`');
    },
};

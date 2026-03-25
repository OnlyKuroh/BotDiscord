const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spy')
        .setDescription('[DONO] Espiona atividade suspeita de um servidor em detalhes.')
        .addStringOption(o =>
            o.setName('guild_id')
                .setDescription('ID do servidor para espionar')
                .setRequired(true)
        ),
    aliases: ['espionar'],
    category: 'dono',
    detailedDescription: 'Investiga um servidor em busca de atividade suspeita: webhooks, convites, audit log, permissões perigosas, comandos recentes.',
    usage: '`/spy [guild_id]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const guildId = interaction.options.getString('guild_id', true).trim();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return interaction.editReply(`❌ Servidor \`${guildId}\` não encontrado no cache.`);
        }

        await guild.members.fetch().catch(() => null);

        // ── 1. Membros com permissões de admin ──
        const admins = guild.members.cache
            .filter(m => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator))
            .map(m => `• **${m.user.username}** (\`${m.id}\`)`);

        const dangerousPerms = guild.members.cache
            .filter(m => !m.user.bot && !m.permissions.has(PermissionFlagsBits.Administrator) && (
                m.permissions.has(PermissionFlagsBits.BanMembers) ||
                m.permissions.has(PermissionFlagsBits.ManageGuild) ||
                m.permissions.has(PermissionFlagsBits.ManageWebhooks)
            ))
            .map(m => {
                const perms = [];
                if (m.permissions.has(PermissionFlagsBits.BanMembers)) perms.push('Ban');
                if (m.permissions.has(PermissionFlagsBits.ManageGuild)) perms.push('ManageGuild');
                if (m.permissions.has(PermissionFlagsBits.ManageWebhooks)) perms.push('Webhooks');
                return `• ${m.user.username} → ${perms.join(', ')}`;
            });

        // ── 2. Webhooks ──
        let webhooksList = [];
        try {
            const webhooks = await guild.fetchWebhooks();
            webhooksList = webhooks.map(w => `• **${w.name}** em <#${w.channelId}> (criador: ${w.owner?.username || '?'})`);
        } catch { webhooksList = ['Sem permissão para ver webhooks.']; }

        // ── 3. Convites ativos ──
        let invitesList = [];
        try {
            const invites = await guild.invites.fetch();
            invitesList = invites.map(i => `• \`${i.code}\` por **${i.inviter?.username || '?'}** — ${i.uses} usos, ${i.maxUses || '∞'} max`);
        } catch { invitesList = ['Sem permissão para ver convites.']; }

        // ── 4. Audit Log resumido ──
        let auditLines = [];
        try {
            const auditLogs = await guild.fetchAuditLogs({ limit: 15 });
            auditLines = auditLogs.entries.map(entry => {
                const time = new Date(entry.createdTimestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
                return `\`${time}\` **${entry.action}** por ${entry.executor?.username || '?'} → ${entry.target?.username || entry.target?.name || '?'}`;
            });
        } catch { auditLines = ['Sem permissão para ver audit log.']; }

        // ── 5. Últimos comandos usados (logs internos) ──
        const recentLogs = db.getLogsForGuild(guildId, 20);
        const logLines = recentLogs.length > 0
            ? recentLogs.map(l => {
                const time = new Date(l.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
                return `\`${time}\` [${l.type}] ${String(l.content).slice(0, 50)} — ${l.user_name || '?'}`;
            })
            : ['Sem logs internos recentes.'];

        // ── 6. Canais suspeitos (permissões override para @everyone) ──
        const suspiciousChannels = guild.channels.cache
            .filter(c => {
                const everyonePerms = c.permissionOverwrites?.cache?.get(guild.id);
                if (!everyonePerms) return false;
                return everyonePerms.allow.has(PermissionFlagsBits.Administrator);
            })
            .map(c => `• #${c.name} (\`${c.id}\`) — @everyone tem Admin!`);

        // ── Build response ──
        const container = new ContainerBuilder().setAccentColor(0xFF4444);

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 🕵️ Espionagem — ${guild.name}\n**ID:** \`${guild.id}\`\n**Dono:** \`${guild.ownerId}\`\n**Membros:** ${guild.memberCount} • **Bots:** ${guild.members.cache.filter(m => m.user.bot).size}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🔑 Admins (${admins.length})\n${admins.slice(0, 10).join('\n') || 'Nenhum.'}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        if (dangerousPerms.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### ⚠️ Permissões Perigosas\n${dangerousPerms.slice(0, 8).join('\n')}`
            ));
            container.addSeparatorComponents(new SeparatorBuilder());
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🪝 Webhooks (${webhooksList.length})\n${webhooksList.slice(0, 8).join('\n') || 'Nenhum.'}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🔗 Convites Ativos (${invitesList.length})\n${invitesList.slice(0, 8).join('\n') || 'Nenhum.'}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📜 Audit Log (últimas 15)\n${auditLines.slice(0, 10).join('\n')}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Logs Internos do Bot\n${logLines.slice(0, 10).join('\n')}`
        ));

        if (suspiciousChannels.length > 0) {
            container.addSeparatorComponents(new SeparatorBuilder());
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 🚨 Canais Suspeitos\n${suspiciousChannels.join('\n')}`
            ));
        }

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;
        const guildId = args[0]?.trim();
        if (!guildId) return message.reply('Uso: `-spy <guild_id>`');

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return message.reply(`❌ Servidor \`${guildId}\` não encontrado.`);

        await guild.members.fetch().catch(() => null);
        const admins = guild.members.cache.filter(m => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator));
        const bots = guild.members.cache.filter(m => m.user.bot);
        const logs = db.getLogsForGuild(guildId, 10);

        const lines = [
            `🕵️ **${guild.name}** (\`${guild.id}\`)`,
            `👑 Dono: \`${guild.ownerId}\``,
            `👥 Membros: ${guild.memberCount} (${bots.size} bots)`,
            `🔑 Admins: ${admins.map(m => m.user.username).join(', ') || 'nenhum'}`,
            `📋 Últimos ${logs.length} logs:`,
            ...logs.map(l => `\`${l.type}\` ${String(l.content).slice(0, 50)}`),
        ];

        await message.reply(lines.join('\n').slice(0, 1900));
    },
};

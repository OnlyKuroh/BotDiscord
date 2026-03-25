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
        .setName('usertrace')
        .setDescription('[DONO] Rastreia um usuário em todos os servidores do bot.')
        .addStringOption(o =>
            o.setName('user_id')
                .setDescription('ID do usuário para rastrear')
                .setRequired(true)
        ),
    aliases: ['rastrear', 'trace'],
    category: 'dono',
    detailedDescription: 'Mostra em quais servidores o usuário está, seus cargos, status de IA e logs recentes envolvendo ele.',
    usage: '`/usertrace [user_id]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const userId = interaction.options.getString('user_id', true).trim();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        // Buscar usuário
        let targetUser = null;
        try {
            targetUser = await client.users.fetch(userId);
        } catch { /* ignore */ }

        const userName = targetUser ? `${targetUser.username}` : userId;

        // ── 1. Em quais guilds está ──
        const presences = [];
        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(userId);
            if (member) {
                const topRoles = member.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .sort((a, b) => b.position - a.position)
                    .first(3);

                const roleNames = topRoles.map(r => r.name).join(', ') || 'Sem cargos';
                const isAdmin = member.permissions.has(8n);

                presences.push({
                    guildName: guild.name,
                    guildId: guild.id,
                    roles: roleNames,
                    isAdmin,
                    joinedAt: member.joinedAt,
                    nickname: member.nickname,
                });
            }
        }

        // ── 2. Status de IA ──
        const Database = require('better-sqlite3');
        const path = require('path');
        const iaStatus = [];
        try {
            const rawDb = new Database(path.join(__dirname, '../../data/database.db'), { readonly: true });
            const rows = rawDb.prepare("SELECT key, value FROM kv_store WHERE key LIKE '%_" + userId + "'").all();
            rawDb.close();
            for (const row of rows) {
                if (row.key.includes('itadori_chat_blocked_')) {
                    const parts = row.key.replace('itadori_chat_blocked_', '').split('_');
                    parts.pop(); // remove userId
                    iaStatus.push(`🔴 Bloqueado em \`${parts.join('_')}\``);
                }
                if (row.key.includes('itadori_chat_cooldown_')) {
                    iaStatus.push(`⏱ Em cooldown`);
                }
                if (row.key.includes('itadori_chat_session_')) {
                    iaStatus.push(`💬 Sessão ativa`);
                }
            }
        } catch { /* ignore */ }

        // ── 3. Logs recentes envolvendo o user ──
        let userLogs = [];
        try {
            const rawDb2 = new Database(path.join(__dirname, '../../data/database.db'), { readonly: true });
            userLogs = rawDb2.prepare(
                "SELECT * FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15"
            ).all(userId);
            rawDb2.close();
        } catch { /* ignore */ }

        // ── Build Response ──
        const container = new ContainerBuilder().setAccentColor(0x5865F2);

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 🔍 Rastreamento — ${userName}\n**ID:** \`${userId}\`\n**Bot:** ${targetUser?.bot ? 'Sim 🤖' : 'Não'}\n**Conta criada:** ${targetUser ? `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>` : '?'}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        if (presences.length === 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 🏠 Servidores\nUsuário não encontrado em nenhum servidor do bot.`
            ));
        } else {
            const guildLines = presences.map(p => {
                const adminBadge = p.isAdmin ? ' 🔑' : '';
                const nickPart = p.nickname ? ` (${p.nickname})` : '';
                return `• **${p.guildName}**${adminBadge}${nickPart}\n  Cargos: ${p.roles}\n  Entrou: <t:${Math.floor(p.joinedAt.getTime() / 1000)}:R>`;
            });

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 🏠 Servidores (${presences.length})\n${guildLines.join('\n\n')}`
            ));
        }
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🤖 Status IA\n${iaStatus.length > 0 ? iaStatus.join('\n') : '✅ Sem restrições.'}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        const logLines = userLogs.length > 0
            ? userLogs.map(l => {
                const time = new Date(l.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
                return `\`${time}\` [${l.type}] ${String(l.content).slice(0, 60)}`;
            })
            : ['Sem logs.'];

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📜 Últimos Logs\n${logLines.join('\n')}`
        ));

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;
        const userId = args[0]?.trim();
        if (!userId) return message.reply('Uso: `-usertrace <user_id>`');

        const guilds = [];
        for (const guild of client.guilds.cache.values()) {
            if (guild.members.cache.has(userId)) {
                guilds.push(guild.name);
            }
        }

        await message.reply([
            `🔍 **Rastreamento de** \`${userId}\``,
            `Encontrado em **${guilds.length}** servidor(es):`,
            guilds.join(', ') || 'Nenhum.',
        ].join('\n'));
    },
};

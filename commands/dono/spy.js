const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');
const { analyzeGuildRisk } = require('../../utils/security-monitor');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spy')
        .setDescription('[DONO] Faz uma leitura profunda e suspeita de um servidor.')
        .addStringOption((option) =>
            option
                .setName('guild_id')
                .setDescription('ID do servidor para analisar')
                .setRequired(true)
        ),
    aliases: ['espionar'],
    category: 'dono',
    detailedDescription: 'Analisa risco, idioma, admins, webhooks, convites, logs do bot, mensagens recentes e sinais operacionais de um servidor.',
    usage: '`/spy [guild_id]` ou `-spy [guild_id]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const guildId = interaction.options.getString('guild_id', true).trim();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        const payload = await inspectGuild(client, guildId);
        if (!payload.ok) {
            return interaction.editReply(payload.message);
        }

        return interaction.editReply({ embeds: payload.embeds });
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const guildId = args[0]?.trim();
        if (!guildId) return message.reply('Uso: `-spy <guild_id>`');

        const payload = await inspectGuild(client, guildId);
        if (!payload.ok) {
            return message.reply(payload.message);
        }

        return message.reply({ embeds: payload.embeds });
    },
};

async function inspectGuild(client, guildId) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        return { ok: false, message: `❌ Servidor \`${guildId}\` não encontrado.` };
    }

    await guild.fetch().catch(() => null);
    await guild.members.fetch().catch(() => null);

    const riskReport = await analyzeGuildRisk(guild, { force: true, maxChannels: 3, maxMessagesPerChannel: 4 });

    const admins = guild.members.cache
        .filter((member) => !member.user.bot && member.permissions.has(PermissionFlagsBits.Administrator))
        .map((member) => `• **${member.user.username}** (\`${member.id}\`)`)
        .slice(0, 10);

    const dangerousPerms = guild.members.cache
        .filter((member) => !member.user.bot && !member.permissions.has(PermissionFlagsBits.Administrator) && (
            member.permissions.has(PermissionFlagsBits.BanMembers) ||
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            member.permissions.has(PermissionFlagsBits.ManageWebhooks)
        ))
        .map((member) => {
            const perms = [];
            if (member.permissions.has(PermissionFlagsBits.BanMembers)) perms.push('Ban');
            if (member.permissions.has(PermissionFlagsBits.ManageGuild)) perms.push('ManageGuild');
            if (member.permissions.has(PermissionFlagsBits.ManageWebhooks)) perms.push('Webhooks');
            return `• **${member.user.username}** → ${perms.join(', ')}`;
        })
        .slice(0, 10);

    let webhooksList = ['Sem permissao para ver webhooks.'];
    let invitesList = ['Sem permissao para ver convites.'];
    let auditLines = ['Sem permissao para ver audit log.'];

    try {
        const webhooks = await guild.fetchWebhooks();
        webhooksList = webhooks.size
            ? webhooks.map((webhook) => `• **${webhook.name}** em <#${webhook.channelId}> (criador: ${webhook.owner?.username || '?'})`).slice(0, 8)
            : ['Nenhum webhook encontrado.'];
    } catch {}

    try {
        const invites = await guild.invites.fetch();
        invitesList = invites.size
            ? invites.map((invite) => `• \`${invite.code}\` por **${invite.inviter?.username || '?'}** — ${invite.uses} usos`).slice(0, 8)
            : ['Nenhum convite ativo encontrado.'];
    } catch {}

    try {
        const auditLogs = await guild.fetchAuditLogs({ limit: 12 });
        auditLines = auditLogs.entries.map((entry) => {
            const time = new Date(entry.createdTimestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
            return `• \`${time}\` **${entry.action}** por ${entry.executor?.username || '?'} → ${entry.target?.username || entry.target?.name || '?'}`;
        }).slice(0, 8);
        if (!auditLines.length) auditLines = ['Nenhum item recente no audit log.'];
    } catch {}

    const recentLogs = db.getLogsForGuild(guild.id, 20);
    const recentAnsi = buildAnsiActivityBlock(recentLogs);
    const recentMessages = riskReport.recentMessages.length
        ? riskReport.recentMessages.map((sample) => `• [#${sample.channelName}] **${sample.authorTag}**: ${sample.content}`).join('\n').slice(0, 1024)
        : 'Nenhuma amostra recente de mensagem foi capturada.';

    const overviewEmbed = new EmbedBuilder()
        .setColor(getRiskColor(riskReport.analysis.riskLevel))

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: `🕵️ Spy Intel • ${guild.name}`,
            iconURL: guild.iconURL({ size: 256 }) || undefined,
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle('Leitura de risco do servidor')

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription([
            `**Score de risco:** \`${riskReport.analysis.score}/100\``,
            `**Nivel:** **${riskReport.analysis.riskLevel.toUpperCase()}**`,
            `**Idioma provavel:** **${riskReport.analysis.likelyLanguage}**`,
            '',
            riskReport.analysis.summary,
        ].join('\n'))

        // ─── Thumbnail / Icone do embed ──────────────────────────────────────
        .setThumbnail(guild.iconURL({ size: 512 }) || null)

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(
            {
                name: 'Identidade',
                value: [
                    `**Guild ID:** \`${guild.id}\``,
                    `**Dono:** <@${guild.ownerId}>`,
                    `**Locale:** \`${guild.preferredLocale || 'desconhecido'}\``,
                    `**Criado em:** <t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`,
                ].join('\n'),
                inline: true,
            },
            {
                name: 'Composicao',
                value: [
                    `**Membros:** \`${guild.memberCount}\``,
                    `**Humanos:** \`${riskReport.snapshot.humanCount}\``,
                    `**Bots:** \`${riskReport.snapshot.botCount}\``,
                    `**Admins:** \`${riskReport.snapshot.adminCount}\``,
                ].join('\n'),
                inline: true,
            },
            {
                name: 'Acoes sugeridas',
                value: riskReport.analysis.recommendedAction || 'Seguir observando o servidor.',
                inline: false,
            },
            {
                name: 'Flags detectadas',
                value: riskReport.analysis.flags.length
                    ? riskReport.analysis.flags.map((flag) => `• ${flag}`).join('\n').slice(0, 1024)
                    : 'Nenhuma flag forte foi detectada no momento.',
                inline: false,
            },
        )
        .setFooter({
            text: 'Analise heuristica + IA sobre postura do servidor',
        })
        .setTimestamp();

    const exposureEmbed = new EmbedBuilder()
        .setColor('#ff9f43')

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: '🛡️ Superficie de ataque',
            iconURL: guild.iconURL({ size: 256 }) || undefined,
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle('Permissoes, convites e exposicao')

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription('Aqui ficam os pontos operacionais mais sensiveis para um bot em servidor suspeito: admins, webhooks, convites e sinais de abuso estrutural.')

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(
            {
                name: `Admins (${admins.length})`,
                value: admins.join('\n') || 'Nenhum admin humano encontrado.',
                inline: false,
            },
            {
                name: 'Permissoes perigosas',
                value: dangerousPerms.join('\n') || 'Nenhum membro extra com poderes perigosos foi encontrado.',
                inline: false,
            },
            {
                name: `Webhooks (${riskReport.snapshot.webhookCount ?? '?'})`,
                value: webhooksList.join('\n').slice(0, 1024),
                inline: false,
            },
            {
                name: `Convites (${riskReport.snapshot.inviteCount ?? '?'})`,
                value: invitesList.join('\n').slice(0, 1024),
                inline: false,
            },
            {
                name: 'Audit log recente',
                value: auditLines.join('\n').slice(0, 1024),
                inline: false,
            },
        )
        .setFooter({
            text: 'Leitura de exposicao administrativa do servidor',
        })
        .setTimestamp();

    const activityEmbed = new EmbedBuilder()
        .setColor('#5865f2')

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({
            name: '📡 Telemetria operacional',
            iconURL: guild.iconURL({ size: 256 }) || undefined,
        })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle('Mensagens e trilha do bot')

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription('Misturei amostra recente de conversa do servidor com o rastro interno do bot para voce enxergar comportamento, idioma e possivel abuso.')

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(
            {
                name: 'Mensagens recentes coletadas',
                value: recentMessages,
                inline: false,
            },
            {
                name: 'Bloco de atividade do bot',
                value: recentAnsi,
                inline: false,
            },
        )
        .setFooter({
            text: 'Verde: atividade normal • Vermelho: erro, spam ou risco',
        })
        .setTimestamp();

    return {
        ok: true,
        embeds: [overviewEmbed, exposureEmbed, activityEmbed],
    };
}

function buildAnsiActivityBlock(logs) {
    if (!logs.length) {
        return '```ansi\n\u001b[1;37mSem logs internos recentes para este servidor.\u001b[0m\n```';
    }

    const lines = logs.slice(0, 12).map((log) => {
        const label = `[${String(log.type || 'LOG').slice(0, 18)}]`;
        const content = String(log.content || '').replace(/\n/g, ' ').slice(0, 74);
        const color = getAnsiColor(log.type);
        return `${color}${label} ${content}\u001b[0m`;
    });

    return `\`\`\`ansi\n${lines.join('\n')}\n\`\`\``.slice(0, 1024);
}

function getAnsiColor(type) {
    const normalized = String(type || '').toUpperCase();
    if (normalized.includes('ERROR') || normalized.includes('SPAM') || normalized.includes('RISK') || normalized.includes('ALERT')) {
        return '\u001b[1;31m';
    }
    if (normalized.includes('COMMAND') || normalized.includes('AI') || normalized.includes('DM_OUTBOUND')) {
        return '\u001b[1;32m';
    }
    return '\u001b[1;33m';
}

function getRiskColor(level) {
    if (level === 'alto') return '#ff4757';
    if (level === 'medio') return '#ffa502';
    return '#2ed573';
}

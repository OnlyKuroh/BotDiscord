const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');

const LOG_TYPE_LABELS = {
    COMMAND: '⚔️ Comando',
    SLASH_COMMAND: '⚔️ Slash',
    BAN: '🔨 Ban',
    KICK: '👢 Kick',
    WELCOME: '👋 Welcome',
    VERIFY_SETUP: '🔐 Verify',
    MEMBER_JOIN: '➕ Entrada',
    MEMBER_LEAVE: '➖ Saída',
    MESSAGE_DELETE: '🗑️ Mensagem deletada',
    MESSAGE_UPDATE: '✏️ Mensagem editada',
    ROLE_CREATE: '🎭 Cargo criado',
    ROLE_DELETE: '🎭 Cargo deletado',
    CHANNEL_CREATE: '📋 Canal criado',
    CHANNEL_DELETE: '📋 Canal deletado',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auditoria')
        .setDescription('[DONO] Exibe logs de auditoria de um servidor.')
        // Ordem reforçada: obrigatórios antes dos opcionais
        .addStringOption(o =>
            o.setName('guild_id')
                .setDescription('ID do servidor para auditar')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('limite')
                .setDescription('Quantidade de logs (máx 30, padrão 15)')
                .setMinValue(1)
                .setMaxValue(30)
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName('tipo')
                .setDescription('Filtrar por tipo de log (ex: COMMAND, BAN, MEMBER_JOIN)')
                .setRequired(false)
        ),
    aliases: ['audit', 'logs-guild'],
    category: 'dono',
    detailedDescription: 'Exibe o histórico de atividade (auditoria) de um servidor específico com filtros por tipo.',
    usage: '`/auditoria [guild_id] [limite?] [tipo?]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const guildId = interaction.options.getString('guild_id', true).trim();
        const limite = interaction.options.getInteger('limite') || 15;
        const tipoFiltro = interaction.options.getString('tipo')?.toUpperCase() || null;

        await interaction.deferReply({ flags: ['Ephemeral'] });

        const guild = client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : guildId;

        const allLogs = db.getLogsForGuild(guildId, 100);
        const filtered = tipoFiltro
            ? allLogs.filter(l => String(l.type).toUpperCase().includes(tipoFiltro))
            : allLogs;

        const logs = filtered.slice(0, limite);

        if (logs.length === 0) {
            return interaction.editReply(`ℹ️ Nenhum log encontrado para **${guildName}**${tipoFiltro ? ` com tipo \`${tipoFiltro}\`` : ''}.`);
        }

        const container = new ContainerBuilder().setAccentColor(0xC41230);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 📜 Auditoria — ${guildName}\n*${logs.length} de ${filtered.length} logs${tipoFiltro ? ` • filtro: \`${tipoFiltro}\`` : ''}*`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        // Divide em chunks para não ultrapassar limite de characters
        const chunkSize = 8;
        for (let i = 0; i < logs.length; i += chunkSize) {
            const chunk = logs.slice(i, i + chunkSize);
            const lines = chunk.map(log => {
                const label = LOG_TYPE_LABELS[log.type] || `📌 ${log.type}`;
                const user = log.user_name ? `**${log.user_name}**` : '';
                const content = String(log.content || '').slice(0, 80);
                const date = new Date(log.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
                return `${label} ${user}\n\`${date}\` — ${content}`;
            }).join('\n\n');

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
            if (i + chunkSize < logs.length) {
                container.addSeparatorComponents(new SeparatorBuilder());
            }
        }

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const guildId = args[0]?.trim();
        const limite = parseInt(args[1]) || 10;
        if (!guildId) return message.reply('Uso: `-auditoria <guild_id> [limite]`');

        const logs = db.getLogsForGuild(guildId, Math.min(limite, 20));
        if (logs.length === 0) return message.reply(`ℹ️ Nenhum log para \`${guildId}\`.`);

        const lines = logs.map(l => `\`${l.type}\` — ${String(l.content).slice(0, 60)} — ${l.user_name || '?'}`).join('\n');
        await message.reply(`📜 **Auditoria \`${guildId}\`:**\n${lines}`.slice(0, 1900));
    },
};

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');
const os = require('os');

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapshot')
        .setDescription('[DONO] Tira uma foto do estado completo do bot.'),
    aliases: ['status', 'health'],
    category: 'dono',
    detailedDescription: 'Exibe um snapshot completo: memória, uptime, guilds, sessões IA, erros, latência.',
    usage: '`/snapshot`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        await interaction.deferReply({ flags: ['Ephemeral'] });

        const mem = process.memoryUsage();
        const uptime = process.uptime();
        const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const topGuilds = [...client.guilds.cache.values()]
            .sort((a, b) => b.memberCount - a.memberCount)
            .slice(0, 5);

        // IA stats
        const Database = require('better-sqlite3');
        const path = require('path');
        let sessions = 0, blocked = 0, cooldowns = 0;
        try {
            const rawDb = new Database(path.join(__dirname, '../../data/database.db'), { readonly: true });
            const rows = rawDb.prepare("SELECT key FROM kv_store WHERE key LIKE 'itadori_chat_%'").all();
            rawDb.close();
            for (const row of rows) {
                if (row.key.includes('_session_')) sessions++;
                else if (row.key.includes('_blocked_')) blocked++;
                else if (row.key.includes('_cooldown_')) cooldowns++;
            }
        } catch { /* ignore */ }

        const blacklist = db.getBlacklist();
        const commandsUsed = db.getStat('slash_commands_used') || 0;

        const container = new ContainerBuilder().setAccentColor(0x00D166);

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 📸 Snapshot — ${client.user.username}\n*${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}*`
        ));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### ⚙️ Sistema`,
            `**Uptime:** ${formatUptime(uptime)}`,
            `**Node.js:** ${process.version}`,
            `**Plataforma:** ${os.platform()} ${os.arch()}`,
            `**CPU:** ${os.cpus()[0]?.model || '?'}`,
            `**OS Uptime:** ${formatUptime(os.uptime())}`,
        ].join('\n')));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### 🧠 Memória`,
            `**Heap Usada:** ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`,
            `**RSS:** ${formatBytes(mem.rss)}`,
            `**External:** ${formatBytes(mem.external)}`,
            `**Array Buffers:** ${formatBytes(mem.arrayBuffers || 0)}`,
        ].join('\n')));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### 📊 Discord`,
            `**Servidores:** ${client.guilds.cache.size}`,
            `**Total Membros:** ${totalMembers.toLocaleString('pt-BR')}`,
            `**Latência WS:** ${client.ws.ping}ms`,
            `**Comandos Usados:** ${commandsUsed.toLocaleString('pt-BR')}`,
            `**Canais em Cache:** ${client.channels.cache.size}`,
        ].join('\n')));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### 🏆 Top 5 Servidores`,
            ...topGuilds.map((g, i) => `**${i + 1}.** ${g.name} — ${g.memberCount} membros`),
        ].join('\n')));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### 🤖 IA Itadori`,
            `**Sessões Ativas:** ${sessions}`,
            `**Em Cooldown:** ${cooldowns}`,
            `**Bloqueados:** ${blocked}`,
        ].join('\n')));
        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### 🔴 Blacklist`,
            `**Servidores bloqueados:** ${blacklist.length}`,
            ...(blacklist.length > 0 ? blacklist.slice(0, 5).map(b => `• \`${b.guild_id}\` — ${b.reason || 'N/A'}`) : ['Nenhum.']),
        ].join('\n')));

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const mem = process.memoryUsage();
        const lines = [
            `📸 **Snapshot**`,
            `⏱ Uptime: ${formatUptime(process.uptime())}`,
            `🧠 Memória: ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`,
            `📡 Ping: ${client.ws.ping}ms`,
            `🏠 Servidores: ${client.guilds.cache.size}`,
            `👥 Membros: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`,
            `⚡ Comandos: ${db.getStat('slash_commands_used') || 0}`,
        ];
        await message.reply(lines.join('\n'));
    },
};

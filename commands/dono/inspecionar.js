const {
    SlashCommandBuilder,
    EmbedBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inspecionar')
        .setDescription('[DONO] Inspeção completa de um servidor.')
        .addStringOption(o =>
            o.setName('guild_id')
                .setDescription('ID do servidor a inspecionar')
                .setRequired(true)
        ),
    aliases: ['inspect'],
    category: 'dono',
    detailedDescription: 'Inspeciona um servidor em detalhes: membros, bots, canais, roles, comandos usados, logs recentes e status de blacklist.',
    usage: '`/inspecionar [guild_id]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const guildId = interaction.options.getString('guild_id', true).trim();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return interaction.editReply(`❌ Servidor \`${guildId}\` não encontrado no cache. O bot pode não estar nesse servidor.`);
        }

        // Fetch members if not cached
        await guild.members.fetch().catch(() => null);

        const allMembers = guild.members.cache;
        const bots = allMembers.filter(m => m.user.bot);
        const humans = allMembers.filter(m => !m.user.bot);
        const onlineCount = allMembers.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.type === 0);
        const voiceChannels = channels.filter(c => c.type === 2);
        const roles = guild.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position);

        const blacklisted = db.isGuildBlacklisted(guildId);
        const recentLogs = db.getLogsForGuild(guildId, 10);

        // Config summary
        const hasWelcome = Boolean(db.get(`welcome_${guildId}`)?.channelId);
        const hasLogs = Boolean(db.get(`logs_${guildId}`));
        const hasVerify = Boolean(db.get(`verify_channel_${guildId}`));
        const eventsConfig = db.get(`events_${guildId}`) || {};
        const activeEvents = Object.entries(eventsConfig).filter(([, v]) => v?.enabled).map(([k]) => k);

        const customCmds = db.getCustomCommands(guildId);

        const botList = bots.size > 0
            ? [...bots.values()].slice(0, 8).map(b => `• ${b.user.username}`).join('\n') + (bots.size > 8 ? `\n+${bots.size - 8} outros` : '')
            : 'Nenhum bot detectado.';

        const topRoles = [...roles.values()].slice(0, 6).map(r => `• ${r.name} (${r.members.size} membros)`).join('\n') || 'Sem cargos.';

        const logsText = recentLogs.length > 0
            ? recentLogs.map(l => `\`${l.type}\` ${String(l.content).slice(0, 60)}`).join('\n')
            : 'Sem logs recentes.';

        const createdAt = new Date(guild.createdTimestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const container = new ContainerBuilder().setAccentColor(blacklisted ? 0xFF0000 : 0xC41230);

        const header = [
            `## 🔍 Inspeção — ${guild.name}`,
            `**ID:** \`${guild.id}\`  •  **Dono:** \`${guild.ownerId}\``,
            `**Criado em:** ${createdAt}  •  **Blacklist:** ${blacklisted ? '🔴 SIM' : '🟢 Não'}`,
        ].join('\n');

        const membersInfo = [
            `### 👥 Membros`,
            `Total: **${guild.memberCount}** • Humanos: **${humans.size}** • Bots: **${bots.size}**`,
            `Online (aprox.): **${onlineCount}**`,
        ].join('\n');

        const channelsInfo = [
            `### 📋 Canais`,
            `Texto: **${textChannels.size}** • Voz: **${voiceChannels.size}** • Total: **${channels.size}**`,
        ].join('\n');

        const configInfo = [
            `### ⚙️ Configuração`,
            `Welcome: ${hasWelcome ? '✅' : '❌'}  Logs: ${hasLogs ? '✅' : '❌'}  Verify: ${hasVerify ? '✅' : '❌'}`,
            `Eventos ativos: ${activeEvents.length > 0 ? activeEvents.join(', ') : 'Nenhum'}`,
            `Cmds personalizados: **${customCmds.length}**`,
        ].join('\n');

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(membersInfo));
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(channelsInfo));
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(configInfo));
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🤖 Bots no servidor\n${botList}`));
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🎭 Top Cargos\n${topRoles}`));
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📜 Últimos 10 logs\n${logsText}`));

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const guildId = args[0]?.trim();
        if (!guildId) return message.reply('Uso: `-inspecionar <guild_id>`');

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return message.reply(`❌ Servidor \`${guildId}\` não encontrado.`);

        const blacklisted = db.isGuildBlacklisted(guildId);
        await guild.members.fetch().catch(() => null);
        const bots = guild.members.cache.filter(m => m.user.bot);
        const humans = guild.members.cache.filter(m => !m.user.bot);
        const customCmds = db.getCustomCommands(guildId);

        const embed = new EmbedBuilder()
            .setTitle(`🔍 ${guild.name}`)
            .setColor(blacklisted ? '#FF0000' : '#C41230')
            .addFields(
                { name: '👥 Membros', value: `Total: ${guild.memberCount}\nHumanos: ${humans.size} • Bots: ${bots.size}`, inline: true },
                { name: '⚙️ Config', value: `Blacklist: ${blacklisted ? '🔴 Sim' : '🟢 Não'}\nCmds custom: ${customCmds.length}`, inline: true },
                { name: '🆔 ID / Dono', value: `\`${guild.id}\`\n\`${guild.ownerId}\``, inline: true }
            )
            .setThumbnail(guild.iconURL({ size: 64 }) || null)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },
};

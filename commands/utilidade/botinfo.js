const {
    SlashCommandBuilder,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('🤖 Informações técnicas e estatísticas do bot'),
    aliases: ['informacao', 'bi'],
    detailedDescription: 'Mostra estatísticas do bot: servidores, membros, uptime, uso de memória, ping e mais.',
    usage: '`/botinfo` ou `-botinfo`',
    permissions: ['Nenhuma'],

    async execute(interaction, client) {
        const components = buildComponents(client, interaction.user);
        await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, client) {
        const components = buildComponents(client, message.author);
        await message.reply({ components, flags: MessageFlags.IsComponentsV2 });
    }
};

function buildComponents(client, user) {
    const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    const totalSeconds = Math.floor(client.uptime / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const uptimeParts = [];
    if (days) uptimeParts.push(`${days}d`);
    if (hours) uptimeParts.push(`${hours}h`);
    uptimeParts.push(`${minutes}m`);
    uptimeParts.push(`${seconds}s`);
    const uptimeStr = uptimeParts.join(' ');

    const wsping = client.ws.ping;
    const pingEmoji = wsping < 100 ? '🟢' : wsping < 200 ? '🟡' : '🔴';

    const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

    const statsText = [
        `📊 **Servidores:** \`${client.guilds.cache.size}\` | 👥 **Membros totais:** \`${totalMembers}\``,
        `📡 **Canais:** \`${client.channels.cache.size}\` | ⚡ **Comandos:** \`${client.commands.size}\``,
        `${pingEmoji} **Ping:** \`${wsping}ms\` | 💾 **RAM:** \`${memUsed} MB\` | ⏱️ **Uptime:** \`${uptimeStr}\``,
    ].join('\n');

    const sortedGuilds = [...client.guilds.cache.values()]
        .sort((a, b) => b.memberCount - a.memberCount);
    const topGuilds = sortedGuilds.slice(0, 10);
    const remaining = sortedGuilds.length - 10;
    const guildLines = topGuilds.map(g => `• **${g.name}** — ${g.memberCount} membros`);
    if (remaining > 0) guildLines.push(`... e mais ${remaining} servidores`);
    const guildText = `### 🌐 Servidores\n${guildLines.join('\n')}`;

    const footerText = `Node.js ${process.version} • discord.js v14 • Solicitado por @${user.username}`;

    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

    const container = new ContainerBuilder()
        .setAccentColor(0xC41230)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## 🤖 ITADORI BOT\n*Grau Especial • Online*')
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }))
                )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(statsText)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(guildText)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footerText)
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('📨 Convidar')
                    .setStyle(ButtonStyle.Link)
                    .setURL(inviteUrl)
            )
        );

    return [container];
}

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
        .setName('broadcast')
        .setDescription('[DONO] Envia um anúncio para todos os servidores via canal de log.')
        .addStringOption(o =>
            o.setName('mensagem')
                .setDescription('Conteúdo do anúncio')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('guild_id')
                .setDescription('Enviar para um servidor específico (deixe vazio para todos)')
                .setRequired(false)
        ),
    aliases: ['anunciar'],
    category: 'dono',
    detailedDescription: 'Envia um embed de anúncio do sistema para o canal de logs de todos os servidores (ou um específico).',
    usage: '`/broadcast [mensagem] [guild_id?]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const mensagem = interaction.options.getString('mensagem', true);
        const targetGuildId = interaction.options.getString('guild_id') || null;

        await interaction.deferReply({ flags: ['Ephemeral'] });

        const guilds = targetGuildId
            ? [client.guilds.cache.get(targetGuildId)].filter(Boolean)
            : [...client.guilds.cache.values()];

        if (guilds.length === 0) {
            return interaction.editReply('❌ Nenhum servidor encontrado para o ID informado.');
        }

        const embed = new EmbedBuilder()
            .setColor('#C41230')
            .setAuthor({ name: '📡 Itadori Bot — Comunicado Oficial', iconURL: client.user.displayAvatarURL() })
            .setDescription(mensagem)
            .setTimestamp()
            .setFooter({ text: 'Comunicado do sistema Itadori' });

        let sent = 0;
        let failed = 0;

        for (const guild of guilds) {
            const logChannelId = db.get(`logs_${guild.id}`);
            if (!logChannelId) { failed++; continue; }
            const channel = guild.channels.cache.get(logChannelId);
            if (!channel) { failed++; continue; }
            const ok = await channel.send({ embeds: [embed] }).then(() => true).catch(() => false);
            ok ? sent++ : failed++;
        }

        await interaction.editReply(
            `📡 Broadcast concluído.\n✅ Enviado: **${sent}** servidor(es)\n❌ Falhou (sem canal de log): **${failed}**`
        );
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const text = args.join(' ').trim();
        if (!text) return message.reply('Uso: `-broadcast <mensagem>`');

        const embed = new EmbedBuilder()
            .setColor('#C41230')
            .setAuthor({ name: '📡 Itadori Bot — Comunicado Oficial', iconURL: client.user.displayAvatarURL() })
            .setDescription(text)
            .setTimestamp()
            .setFooter({ text: 'Comunicado do sistema Itadori' });

        let sent = 0;
        for (const guild of client.guilds.cache.values()) {
            const logChannelId = db.get(`logs_${guild.id}`);
            if (!logChannelId) continue;
            const channel = guild.channels.cache.get(logChannelId);
            if (!channel) continue;
            const ok = await channel.send({ embeds: [embed] }).then(() => true).catch(() => false);
            if (ok) sent++;
        }

        await message.reply(`📡 Broadcast concluído. Enviado para **${sent}** servidor(es).`);
    },
};

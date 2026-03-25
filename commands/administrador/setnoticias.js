const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');

// ─── Mapa de eventos → emoji + label ────────────────────────────────────────
// Cada reação usa um emoji específico para adicionar/remover cargo
// O cargo correspondente é salvo no dashboard em events config (roleId)
const NEWS_REACTIONS = [
    { key: 'anime',        emoji: '🎌', label: 'Anime' },
    { key: 'noticias',     emoji: '📰', label: 'Notícias' },
    { key: 'politica_br',  emoji: '🏛️', label: 'Política BR' },
    { key: 'politica_mun', emoji: '🌍', label: 'Política Mundial' },
    { key: 'ia_news',      emoji: '🤖', label: 'IA News' },
    { key: 'financeiro',   emoji: '💹', label: 'Financeiro' },
    { key: 'cotacao',      emoji: '💱', label: 'Cotações' },
    { key: 'google_news',  emoji: '🔍', label: 'Google News' },
    { key: 'horoscopo',    emoji: '♈', label: 'Horóscopo' },
    { key: 'steam',        emoji: '🎮', label: 'Steam' },
    { key: 'eleicao',      emoji: '🗳️', label: 'Eleições' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setnoticias')
        .setDescription('Cria o painel de inscrição de notícias neste canal.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction, client) {
        const guildId = interaction.guildId;
        const eventsConfig = db.get(`events_${guildId}`) || {};

        // Filtra apenas eventos que estão habilitados E têm roleId configurado
        const activeReactions = NEWS_REACTIONS.filter(btn => {
            const conf = eventsConfig[btn.key];
            return conf?.enabled && conf?.roleId;
        });

        if (!activeReactions.length) {
            return interaction.reply({
                content: formatResponse('Nenhum evento está habilitado com cargo configurado. Configure os cargos na aba **Eventos** do dashboard primeiro.'),
                flags: ['Ephemeral'],
            });
        }

        // Gera descrição com os cargos
        const descLines = activeReactions.map(btn => {
            const conf = eventsConfig[btn.key];
            return `${btn.emoji} **${btn.label}** → <@&${conf.roleId}>`;
        });

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setAuthor({ name: 'Central de Notícias', iconURL: client.user.displayAvatarURL() })
            .setTitle('📢 Inscreva-se nas Notícias')
            .setDescription(
                'Reaja com os emojis abaixo para **receber ou remover** notificações de cada categoria.\n' +
                'Ao reagir, você receberá o cargo correspondente e será mencionado quando houver novidades.\n\n' +
                descLines.join('\n')
            )
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Reaja novamente para remover • Engrenagem Itadori' });

        // Salva referência do canal
        db.set(`news_panel_channel_${guildId}`, interaction.channelId);

        await interaction.reply({
            content: formatResponse('O painel de notícias foi erguido neste canal. Adicionando reações...'),
            flags: ['Ephemeral'],
        });

        // Envia o embed
        const message = await interaction.channel.send({ embeds: [embed] });

        // Adiciona todas as reações ao embed
        for (const btn of activeReactions) {
            try {
                await message.react(btn.emoji);
            } catch (err) {
                console.error(`[SETNOTICIAS] Erro ao adicionar reação ${btn.emoji}:`, err);
            }
        }
    },
};

const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');
const { ensureNewsPanel } = require('../../utils/persistent-panels');

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

        db.set(`news_panel_config_${guildId}`, { customTitle: null, customDesc: null, customColor: null });
        db.set(`news_panel_channel_${guildId}`, interaction.channelId);

        await interaction.reply({
            content: formatResponse('O painel de notícias foi erguido neste canal. Adicionando reações...'),
            flags: ['Ephemeral'],
        });

        await ensureNewsPanel(client, guildId);
    },
};

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

async function traduzir(texto) {
    if (!texto) return 'Sem informação disponível.';
    try { return (await translate(texto.substring(0, 1000), { to: 'pt' })).text; }
    catch { return texto; }
}

const MAP_RATING = { 'G': '🟢 Livre', 'PG': '🟡 PG', 'PG-13': '🟠 PG-13', 'R - 17+': '🔞 +17', 'Rx - Hentai': '❌ Hentai' };
const MAP_STATUS = { 'Finished Airing': '🏁 Finalizado', 'Currently Airing': '🟢 Em Exibição', 'Not yet aired': '⏳ Aguardando' };
const MAP_TYPE = { 'TV': '📺 TV', 'Movie': '🎬 Filme', 'OVA': '💿 OVA', 'ONA': '🌐 ONA', 'Special': '⭐ Especial', 'Music': '🎵 Música' };
const MAP_SEASON = { 'winter': '❄️ Inverno', 'spring': '🌸 Primavera', 'summer': '☀️ Verão', 'fall': '🍂 Outono' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anime')
        .setDescription('🎌 Busca completa de animes com sinopse, ficha, personagens e notícias (MyAnimeList)')
        .addStringOption(opt => opt.setName('titulo').setDescription('Nome do anime').setRequired(true)),

    aliases: ['anime', 'mal', 'animes'],
    detailedDescription: 'Integração completa com MyAnimeList via Jikan API. 4 páginas: Arte + Sinopse, Ficha Técnica, Elenco Principal e Últimas Notícias. Tudo traduzido para PT-BR.',
    usage: '`/anime [titulo]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('titulo').trim();

        try {
            // ── Busca inicial ──
            const searchRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1&sfw=false`);
            const results = searchRes.data.data;
            if (!results?.length) {
                return interaction.editReply({ content: formatResponse(`❌ Nenhum anime encontrado para **${query}**.`) });
            }
            const malId = results[0].mal_id;

            // ── Coleta em paralelo ──
            const [fullRes, charsRes, newsRes] = await Promise.allSettled([
                axios.get(`https://api.jikan.moe/v4/anime/${malId}/full`),
                axios.get(`https://api.jikan.moe/v4/anime/${malId}/characters`),
                axios.get(`https://api.jikan.moe/v4/anime/${malId}/news?limit=3`),
            ]);

            const a = fullRes.status === 'fulfilled' ? fullRes.value.data.data : results[0];
            const sinopse = await traduzir(a.synopsis || 'Sinopse não disponível.');
            const imagem = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '';
            const titulo = a.title_portuguese || a.title || 'Desconhecido';
            const tituloJP = a.title_japanese || '';

            const score = a.score ? `⭐ **${a.score}**/10` : 'N/A';
            const rank = a.rank ? `🏆 **#${a.rank}**` : 'N/A';
            const pop = a.popularity ? `🔥 **#${a.popularity}**` : 'N/A';
            const membros = a.members ? `👥 ${a.members.toLocaleString('pt-BR')} membros` : 'N/A';
            const status = MAP_STATUS[a.status] || a.status || 'N/A';
            const tipo = MAP_TYPE[a.type] || a.type || 'N/A';
            const rating = MAP_RATING[a.rating] || a.rating || 'N/A';
            const episodios = a.episodes ? `${a.episodes} ep` : '? ep';
            const duracao = a.duration || 'N/A';
            const temporada = a.season ? `${MAP_SEASON[a.season] || a.season} ${a.year || ''}` : (a.year?.toString() || 'N/A');
            const estudio = a.studios?.map(s => s.name).join(', ') || 'N/A';
            const generos = a.genres?.map(g => `\`${g.name}\``).slice(0, 6).join(' ') || 'N/A';
            const temas = a.themes?.map(t => `\`${t.name}\``).slice(0, 4).join(' ') || '';
            const demographics = a.demographics?.map(d => `\`${d.name}\``).join(' ') || '';
            const trailer = a.trailer?.url || null;

            // ── Personagens ──
            let personagensDesc = '> Nenhum personagem encontrado.';
            if (charsRes.status === 'fulfilled') {
                const chars = charsRes.value.data.data?.slice(0, 8) || [];
                if (chars.length) {
                    personagensDesc = chars.map((c, i) => {
                        const icone = c.role === 'Main' ? '⭐' : '▸';
                        const papelTrad = { 'Main': 'Protagonista', 'Supporting': 'Suporte', 'Antagonist': 'Antagonista' }[c.role] || c.role;
                        const vaActors = c.voice_actors?.find(va => va.language === 'Japanese');
                        const dvTxt = vaActors ? ` *(voz: ${vaActors.person.name})*` : '';
                        return `${icone} **${c.character.name}** — ${papelTrad}${dvTxt}`;
                    }).join('\n');
                }
            }

            // ── Notícias ──
            let noticiasDesc = '> Nenhuma notícia recente encontrada.';
            if (newsRes.status === 'fulfilled') {
                const noticias = newsRes.value.data.data?.slice(0, 3) || [];
                if (noticias.length) {
                    noticiasDesc = noticias.map(n => {
                        const data = new Date(n.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
                        const excerpt = n.excerpt ? n.excerpt.substring(0, 120) + '...' : '';
                        return `📰 **[${n.title}](${n.url})**\n> ${excerpt}\n> 📅 ${data} • 💬 ${n.comments} comentários`;
                    }).join('\n\n');
                }
            }

            // ── Row de navegação ──
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ani_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ani_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ani_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setLabel('MAL').setURL(`https://myanimelist.net/anime/${malId}`).setStyle(ButtonStyle.Link),
            );

            // ══════════════════════════════════════
            // PÁGINA 1: ARTE + SINOPSE
            // ══════════════════════════════════════
            const embed1 = new EmbedBuilder()
                .setTitle(`🎌 ${titulo}`)
                .setDescription(
                    (tituloJP ? `*${tituloJP}*\n\n` : '') +
                    `> ${sinopse.replace(/\n/g, '\n> ')}`
                )
                .setColor('#2E51A2')
                .setImage(imagem)
                .addFields(
                    { name: '📊 Nota', value: score, inline: true },
                    { name: '🏆 Ranking', value: rank, inline: true },
                    { name: '🔥 Popularidade', value: pop, inline: true },
                    { name: '\u200B', value: membros, inline: false },
                )
                .setFooter({ text: `Página 1/4 • Arte & Sinopse • MyAnimeList` })
                .setTimestamp();

            // ══════════════════════════════════════
            // PÁGINA 2: FICHA TÉCNICA
            // ══════════════════════════════════════
            const embed2 = new EmbedBuilder()
                .setTitle(`📋 Ficha Técnica: ${titulo}`)
                .setColor('#2E51A2')
                .setThumbnail(imagem)
                .addFields(
                    { name: '📺 Tipo', value: tipo, inline: true },
                    { name: '🎬 Status', value: status, inline: true },
                    { name: '🔞 Classificação', value: rating, inline: true },
                    { name: '📅 Episódios', value: `\`${episodios} • ${duracao}\``, inline: true },
                    { name: '🌸 Temporada', value: `\`${temporada}\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '🏭 Estúdio', value: `> ${estudio}`, inline: false },
                    { name: '🏷️ Gêneros', value: generos, inline: false },
                )
                .setFooter({ text: `Página 2/4 • Ficha Técnica • MyAnimeList` });

            if (temas) embed2.addFields({ name: '🎭 Temas', value: temas, inline: false });
            if (demographics) embed2.addFields({ name: '👥 Demographic', value: demographics, inline: false });
            if (trailer) embed2.addFields({ name: '🎬 Trailer', value: `[Assistir no YouTube](${trailer})`, inline: false });

            // ══════════════════════════════════════
            // PÁGINA 3: ELENCO
            // ══════════════════════════════════════
            const embed3 = new EmbedBuilder()
                .setTitle(`🎭 Elenco Principal: ${titulo}`)
                .setColor('#2E51A2')
                .setThumbnail(imagem)
                .setDescription(personagensDesc)
                .setFooter({ text: `Página 3/4 • Elenco • MyAnimeList` });

            // ══════════════════════════════════════
            // PÁGINA 4: NOTÍCIAS
            // ══════════════════════════════════════
            const embed4 = new EmbedBuilder()
                .setTitle(`📰 Últimas Notícias: ${titulo}`)
                .setColor('#2E51A2')
                .setThumbnail(imagem)
                .setDescription(noticiasDesc)
                .setFooter({ text: `Página 4/4 • Notícias Recentes • MyAnimeList` });

            // ── Navegação ──
            const embeds = [embed1, embed2, embed3, embed4];
            let pagAtual = 0;

            await interaction.editReply({ content: formatResponse(''), embeds: [embeds[0]], components: [row] });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.customId.startsWith('ani_') && i.user.id === interaction.user.id,
                time: 90000
            });

            collector.on('collect', async i => {
                if (i.customId === 'ani_prev') pagAtual = pagAtual > 0 ? pagAtual - 1 : embeds.length - 1;
                else if (i.customId === 'ani_next') pagAtual = pagAtual < embeds.length - 1 ? pagAtual + 1 : 0;
                else if (i.customId === 'ani_home') pagAtual = 0;
                await i.update({ embeds: [embeds[pagAtual]], components: [row] });
            });

            collector.on('end', () => interaction.editReply({ components: [] }).catch(() => { }));

        } catch (err) {
            console.error('[ANIME]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao conectar com o MyAnimeList. A API pode estar sob limite de requisições. Tente novamente em instantes.') });
        }
    }
};

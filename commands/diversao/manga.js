const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

const MAL_CLIENT_ID = '2e4c33c540e15d8427f81cc210ee0f5f';

async function traduzir(texto) {
    if (!texto) return 'Sem dados disponíveis.';
    try {
        const res = await translate(texto, { to: 'pt' });
        return res.text;
    } catch {
        return texto;
    }
}

// - Tradutores práticos para os dados frios do MangaDex e MAL
const traduzirDemografia = (demo) => ({ 'shounen': 'Shounen', 'shoujo': 'Shoujo', 'seinen': 'Seinen', 'josei': 'Josei' }[demo] || 'N/A');
const traduzirStatus = (status) => ({ 'ongoing': '🟢 Em Andamento', 'completed': '🏁 Finalizado', 'hiatus': '⏸️ Hiato', 'cancelled': '❌ Cancelado', 'finished': '🏁 Finalizado', 'currently_publishing': '🟢 Em Andamento' }[status] || status);
const traduzirConteudo = (rating) => ({ 'safe': 'Livre', 'suggestive': 'Sugestivo', 'erotica': 'Erótico', 'pornographic': 'Pornográfico' }[rating] || rating);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manga')
        .setDescription('Busca profunda de Mangás (MangaDex + MyAnimeList)')
        .addStringOption(option => option.setName('nome').setDescription('Nome da obra').setRequired(true)),

    aliases: ['manga', 'manhwa', 'comic'],
    detailedDescription: 'Integração total. Filtro de desambiguação inteligente e comparativo de métricas.',
    usage: '`/manga [nome]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('nome');

        try {
            // - Etapa 1: Busca Inicial no MangaDex (Top 5)
            const mdRes = await axios.get(`https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=5&includes[]=cover_art&includes[]=author`);
            const resultadosMD = mdRes.data.data;

            if (resultadosMD.length === 0) {
                return interaction.editReply({ content: formatResponse(`❌ A obra **${query}** não foi encontrada no MangaDex.`) });
            }

            let obraSelecionada = resultadosMD[0];

            // - Etapa 2: Filtro de Desambiguação (Caso ache muitos resultados e o primeiro não seja exato)
            if (resultadosMD.length > 1) {
                const titulos = resultadosMD.map(m => m.attributes.title.en || m.attributes.title['ja-ro'] || Object.values(m.attributes.title)[0] || 'Desconhecido');
                
                // - Se o usuário não digitou o nome EXATO, o bot pede confirmação
                if (titulos[0].toLowerCase() !== query.toLowerCase()) {
                    const listaTitulos = titulos.map(t => `- ${t}`).join('\n');
                    await interaction.editReply({
                        content: formatResponse(`Foram encontrados alguns mangás com este nome. Repita o nome completo do anime no chat para funcionar:\n\n${listaTitulos}`)
                    });

                    const filterMsg = m => m.author.id === interaction.user.id;
                    try {
                        const collected = await interaction.channel.awaitMessages({ filter: filterMsg, max: 1, time: 30000, errors: ['time'] });
                        const resposta = collected.first().content.trim().toLowerCase();
                        const index = titulos.findIndex(t => t.toLowerCase() === resposta);

                        if (index !== -1) {
                            obraSelecionada = resultadosMD[index];
                            await collected.first().delete().catch(() => {}); // Limpa o chat
                            await interaction.editReply({ content: formatResponse('⏳ Puxando os dados completos do servidor...') });
                        } else {
                            return interaction.editReply({ content: formatResponse('❌ Nome não reconhecido na lista. Comando cancelado.') });
                        }
                    } catch (e) {
                        return interaction.editReply({ content: formatResponse('⏳ Tempo esgotado para seleção. Tente novamente.') });
                    }
                }
            }

            // - Etapa 3: Coleta Massiva de Dados do MangaDex
            const mId = obraSelecionada.id;
            const tituloMD = obraSelecionada.attributes.title.en || obraSelecionada.attributes.title['ja-ro'] || Object.values(obraSelecionada.attributes.title)[0];
            const sinopseMD = obraSelecionada.attributes.description.en || 'Sem sinopse no banco de dados.';
            const sinopsePT = await traduzir(sinopseMD);
            
            const coverRel = obraSelecionada.relationships.find(rel => rel.type === 'cover_art');
            const coverFileName = coverRel ? coverRel.attributes.fileName : null;
            const capaUrl = coverFileName ? `https://uploads.mangadex.org/covers/${mId}/${coverFileName}` : 'https://via.placeholder.com/400x600.png?text=Sem+Capa';

            // - Informações detalhadas MangaDex
            const mdDemo = traduzirDemografia(obraSelecionada.attributes.publicationDemographic);
            const mdStatusTxt = traduzirStatus(obraSelecionada.attributes.status);
            const mdRating = traduzirConteudo(obraSelecionada.attributes.contentRating);
            const mdYear = obraSelecionada.attributes.year || 'N/A';
            const mdTags = obraSelecionada.attributes.tags.map(t => `\`${t.attributes.name.en}\``).slice(0, 6).join(' ');

            // - Busca de Estatísticas extras no MangaDex (Notas e Seguidores)
            let mdScore = 'N/A', mdFollows = 'N/A';
            try {
                const statRes = await axios.get(`https://api.mangadex.org/statistics/manga/${mId}`);
                if (statRes.data.statistics && statRes.data.statistics[mId]) {
                    const stats = statRes.data.statistics[mId];
                    mdScore = stats.rating?.average ? `⭐ ${stats.rating.average.toFixed(2)}` : 'N/A';
                    mdFollows = stats.follows ? `👥 ${stats.follows.toLocaleString()}` : 'N/A';
                }
            } catch(e) { console.log("Sem stats no MangaDex"); }

            // - Etapa 4: Coleta de Dados Comparativos do MyAnimeList
            let malScore = 'N/A', malStatus = 'N/A', malRank = 'N/A', malPop = 'N/A', malMembers = 'N/A';
            let malCapitulos = '?', malVolumes = '?';
            let recomendacoesLista = '- Nenhuma recomendação encontrada.';

            try {
                const malRes = await axios.get(`https://api.myanimelist.net/v2/manga?q=${encodeURIComponent(tituloMD)}&limit=1&fields=mean,status,rank,popularity,num_scoring_users,num_chapters,num_volumes,recommendations`, {
                    headers: { 'X-MAL-CLIENT-ID': MAL_CLIENT_ID }
                });
                
                if (malRes.data.data.length > 0) {
                    const mData = malRes.data.data[0].node;
                    malScore = mData.mean ? `⭐ ${mData.mean}` : 'N/A';
                    malStatus = traduzirStatus(mData.status);
                    malRank = mData.rank ? `#${mData.rank}` : 'N/A';
                    malPop = mData.popularity ? `#${mData.popularity}` : 'N/A';
                    malMembers = mData.num_scoring_users ? `👥 ${mData.num_scoring_users.toLocaleString()}` : 'N/A';
                    malCapitulos = mData.num_chapters > 0 ? mData.num_chapters : 'Lançando';
                    malVolumes = mData.num_volumes > 0 ? mData.num_volumes : '-';

                    if (mData.recommendations && mData.recommendations.length > 0) {
                        recomendacoesLista = mData.recommendations.slice(0, 5).map(r => `- **${r.node.title}**`).join('\n');
                    }
                }
            } catch (e) { console.log('Sem dados no MAL.'); }

            // - Etapa 5: Montagem Visual das 3 Páginas
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mg_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('mg_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('mg_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
            );

            // - PÁGINA 1: MangaDex Lore + Visão Geral
            const embedHome = new EmbedBuilder()
                .setTitle(`📚 ${tituloMD}`)
                .setDescription(`> ${sinopsePT.substring(0, 3900)}`)
                .setColor('#F6665C')
                .setImage(capaUrl)
                .setThumbnail(capaUrl)
                .addFields(
                    { name: '🧬 Demografia', value: `> ${mdDemo}`, inline: true },
                    { name: '🔞 Classificação', value: `> ${mdRating}`, inline: true },
                    { name: '📅 Ano', value: `> ${mdYear}`, inline: true },
                    { name: '🏷️ Tags (MangaDex)', value: mdTags || 'N/A', inline: false }
                )
                .setFooter({ text: `Página 1/3 • Dados Completos (MangaDex)` });

            // - PÁGINA 2: O Grande Comparativo MangaDex vs MyAnimeList
            const embedStats = new EmbedBuilder()
                .setTitle(`📊 Comparativo Analítico: ${tituloMD}`)
                .setColor('#2E51A2')
                .setThumbnail(capaUrl)
                .addFields(
                    { name: 'MANGADEX', value: `- Nota: ${mdScore}\n- Leitores: ${mdFollows}\n- Status: ${mdStatusTxt}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: 'MYANIMELIST', value: `- Nota: ${malScore}\n- Membros: ${malMembers}\n- Status: ${malStatus}`, inline: true },
                    
                    { name: '🏆 Ranking (MAL)', value: `> Geral: ${malRank} | Popularidade: ${malPop}`, inline: false },
                    { name: '📖 Progressão (MAL)', value: `> Capítulos: ${malCapitulos} | Volumes: ${malVolumes}`, inline: false }
                )
                .setFooter({ text: `Página 2/3 • Duelo de Plataformas` });

            // - PÁGINA 3: Recomendações
            const embedRecs = new EmbedBuilder()
                .setTitle(`🔗 Obras Semelhantes a ${tituloMD}`)
                .setDescription(`O algoritmo do MyAnimeList sugere que você também leia:\n\n${recomendacoesLista}`)
                .setColor('#2E51A2')
                .setThumbnail(capaUrl)
                .setFooter({ text: `Página 3/3 • Recomendações (MyAnimeList)` });

            // - Lógica de Navegação
            const paginas = [embedHome, embedStats, embedRecs];
            let pagAtual = 0;

            await interaction.editReply({ content: formatResponse(''), embeds: [paginas[pagAtual]], components: [row] });

            const filter = i => i.customId.startsWith('mg_') && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'mg_prev') pagAtual = pagAtual > 0 ? pagAtual - 1 : paginas.length - 1;
                else if (i.customId === 'mg_next') pagAtual = pagAtual < paginas.length - 1 ? pagAtual + 1 : 0;
                else if (i.customId === 'mg_home') pagAtual = 0;
                await i.update({ embeds: [paginas[pagAtual]], components: [row] });
            });

            collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));

        } catch (err) {
            console.error('Manga API error:', err);
            await interaction.editReply({ content: formatResponse('❌ Ocorreu um erro crítico na busca das informações.') });
        }
    }
};
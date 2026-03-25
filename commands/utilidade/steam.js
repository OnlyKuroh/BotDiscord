const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

const STEAM_KEY = process.env.STEAM_API_KEY || '';

async function traduzir(texto) {
    if (!texto) return null;
    try { return (await translate(texto.substring(0, 800), { to: 'pt' })).text; }
    catch { return texto; }
}

function stripHtml(html) {
    return html?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') || '';
}

function formatarHoras(mins) {
    const h = Math.floor(mins / 60);
    return h >= 1 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steam')
        .setDescription('🎮 Busca informações da Steam (jogos, perfis)')
        .addSubcommand(sub => sub
            .setName('jogo')
            .setDescription('🎮 Busca informações de um jogo na Steam Store')
            .addStringOption(opt => opt.setName('nome').setDescription('Nome do jogo').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('perfil')
            .setDescription('👤 Exibe perfil público de um jogador (requer STEAM_API_KEY no .env)')
            .addStringOption(opt => opt.setName('steamid').setDescription('SteamID64 ou URL do perfil').setRequired(true))
        ),

    aliases: ['steam', 'jogo', 'game'],
    detailedDescription: 'Integração com a Steam. `/steam jogo` busca detalhes na Steam Store. `/steam perfil` mostra perfil público com horas e jogos recentes (requer Steam API Key).',
    usage: '`/steam jogo [nome]` ou `/steam perfil [steamid64]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        // ─── JOGO ───────────────────────────────────────────────────────────
        if (sub === 'jogo') {
            const query = interaction.options.getString('nome').trim();
            try {
                // Busca no store (sem key)
                const searchRes = await axios.get(
                    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=br&l=portuguese`,
                    { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
                );

                const items = searchRes.data.items;
                if (!items?.length) {
                    return interaction.editReply({ content: formatResponse(`❌ Nenhum jogo encontrado para **${query}** na Steam.`) });
                }

                const appId = items[0].id;

                // Detalhes do app
                const detailRes = await axios.get(
                    `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=br&l=portuguese`,
                    { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
                );

                const appData = detailRes.data[appId]?.data;
                if (!appData) {
                    return interaction.editReply({ content: formatResponse(`❌ Detalhes do jogo não disponíveis.`) });
                }

                const nome     = appData.name;
                const descRaw  = stripHtml(appData.short_description);
                const desc     = await traduzir(descRaw) || descRaw || 'Sem descrição.';
                const capa     = appData.header_image || '';
                const thumb    = appData.capsule_image || '';
                const generos  = appData.genres?.map(g => `\`${g.description}\``).slice(0, 5).join(' ') || 'N/A';
                const categorias = appData.categories?.map(c => `\`${c.description}\``).slice(0, 4).join(' ') || 'N/A';
                const dev      = appData.developers?.join(', ') || 'N/A';
                const pub      = appData.publishers?.join(', ')  || 'N/A';
                const plats    = Object.entries(appData.platforms || {}).filter(([,v]) => v).map(([k]) =>
                    ({ windows: '🪟 Windows', mac: '🍎 Mac', linux: '🐧 Linux' }[k] || k)
                ).join(' | ') || 'N/A';
                const dataLanc = appData.release_date?.date || 'N/A';
                const metacritic = appData.metacritic?.score ? `🎯 ${appData.metacritic.score}/100` : 'N/A';

                // Preço em BRL
                let precoTxt = '🆓 Gratuito';
                if (appData.price_overview) {
                    const p = appData.price_overview;
                    const final = (p.final / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const original = (p.initial / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    precoTxt = p.discount_percent > 0
                        ? `~~${original}~~ → **${final}** 🔥 -${p.discount_percent}%`
                        : `**${final}**`;
                }

                // Screenshots (até 3)
                const screenshots = appData.screenshots?.slice(0, 3).map(s => s.path_full) || [];

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🛒 Ver na Steam Store')
                        .setURL(`https://store.steampowered.com/app/${appId}/`)
                        .setStyle(ButtonStyle.Link)
                );

                // ── PÁGINA 1: VISUAL ──────────────────────────────────────
                const embed1 = new EmbedBuilder()
                    .setTitle(`🎮 ${nome}`)
                    .setDescription(`> ${desc}`)
                    .setColor('#1B2838')
                    .setImage(capa)
                    .addFields(
                        { name: '💰 Preço (BR)',  value: precoTxt,   inline: true },
                        { name: '🎯 Metacritic',  value: metacritic, inline: true },
                        { name: '📅 Lançamento',  value: `\`${dataLanc}\``, inline: true },
                    )
                    .setFooter({ text: `Página 1/2 • Steam Store • AppID: ${appId}` });

                // ── PÁGINA 2: DETALHES ────────────────────────────────────
                const embed2 = new EmbedBuilder()
                    .setTitle(`📋 Detalhes: ${nome}`)
                    .setColor('#1B2838')
                    .setThumbnail(thumb)
                    .addFields(
                        { name: '🏭 Desenvolvedora', value: `\`${dev}\``, inline: true },
                        { name: '📦 Distribuidora',  value: `\`${pub}\``, inline: true },
                        { name: '\u200B',              value: '\u200B',    inline: true },
                        { name: '🎮 Gêneros',        value: generos,      inline: false },
                        { name: '⚙️ Categorias',     value: categorias,   inline: false },
                        { name: '🖥️ Plataformas',    value: plats,        inline: false },
                    )
                    .setFooter({ text: `Página 2/2 • Steam Store` });

                const rowNav = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('stm_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('stm_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('stm_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setLabel('🛒 Steam').setURL(`https://store.steampowered.com/app/${appId}/`).setStyle(ButtonStyle.Link),
                );

                const embeds = [embed1, embed2];
                let pagAtual = 0;
                await interaction.editReply({ content: formatResponse(''), embeds: [embeds[0]], components: [rowNav] });

                const collector = interaction.channel.createMessageComponentCollector({
                    filter: i => i.customId.startsWith('stm_') && i.user.id === interaction.user.id,
                    time: 60000
                });
                collector.on('collect', async i => {
                    if (i.customId === 'stm_prev')     pagAtual = pagAtual > 0 ? pagAtual - 1 : embeds.length - 1;
                    else if (i.customId === 'stm_next') pagAtual = pagAtual < embeds.length - 1 ? pagAtual + 1 : 0;
                    else if (i.customId === 'stm_home') pagAtual = 0;
                    await i.update({ embeds: [embeds[pagAtual]], components: [rowNav] });
                });
                collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));

            } catch (err) {
                console.error('[STEAM JOGO]', err.message);
                await interaction.editReply({ content: formatResponse('❌ Erro ao buscar jogo na Steam Store.') });
            }
        }

        // ─── PERFIL ──────────────────────────────────────────────────────────
        else if (sub === 'perfil') {
            if (!STEAM_KEY) {
                return interaction.editReply({ content: formatResponse('❌ **STEAM_API_KEY** não configurada no `.env`.\nAdicione `STEAM_API_KEY=SuaChaveAqui` no arquivo `.env` do bot.') });
            }

            const steamInput = interaction.options.getString('steamid').trim();
            // Extrai SteamID64 de URL ou usa diretamente
            const steamIdMatch = steamInput.match(/(\d{17})/);
            const steamId = steamIdMatch ? steamIdMatch[1] : steamInput;

            try {
                const [summaryRes, gamesRes, levelRes] = await Promise.allSettled([
                    axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamId}`),
                    axios.get(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_KEY}&steamid=${steamId}&count=5`),
                    axios.get(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${steamId}`),
                ]);

                const player = summaryRes.status === 'fulfilled'
                    ? summaryRes.value.data.response?.players?.[0]
                    : null;

                if (!player) {
                    return interaction.editReply({ content: formatResponse('❌ Perfil não encontrado ou privado. Verifique o SteamID64.') });
                }

                const statusMap = { 0: '⚫ Offline', 1: '🟢 Online', 2: '🔵 Ocupado', 3: '🟡 Ausente', 4: '🟡 Snooze', 5: '🟢 Querendo trocar', 6: '🟢 Querendo jogar' };
                const statusTxt = statusMap[player.personastate] || '⚫ Offline';
                const nivel     = levelRes.status === 'fulfilled' ? `Nível **${levelRes.value.data.response?.player_level || '?'}**` : 'N/A';
                const criacao   = player.timecreated ? new Date(player.timecreated * 1000).toLocaleDateString('pt-BR') : 'N/A';

                // Jogos recentes
                let jogosText = 'Nenhum jogo recente ou perfil privado.';
                if (gamesRes.status === 'fulfilled') {
                    const games = gamesRes.value.data.response?.games || [];
                    if (games.length) {
                        jogosText = games.map((g, i) => {
                            const horas = formatarHoras(g.playtime_2weeks || g.playtime_forever);
                            const horasTotal = formatarHoras(g.playtime_forever);
                            return `**${i+1}. ${g.name}** — ${horas} (últimas 2 semanas) | Total: ${horasTotal}`;
                        }).join('\n');
                    }
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🎮 Ver Perfil Steam')
                        .setURL(player.profileurl || `https://steamcommunity.com/profiles/${steamId}`)
                        .setStyle(ButtonStyle.Link)
                );

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 ${player.personaname}`)
                    .setThumbnail(player.avatarfull)
                    .setColor('#1B2838')
                    .addFields(
                        { name: '📊 Status',      value: statusTxt, inline: true },
                        { name: '⭐ Nível Steam', value: nivel,      inline: true },
                        { name: '📅 Membro desde',value: `\`${criacao}\``, inline: true },
                    )
                    .addFields({ name: '🕹️ Jogos Recentes', value: jogosText, inline: false })
                    .setFooter({ text: `SteamID64: ${steamId} • Steam API` })
                    .setTimestamp();

                if (player.gameextrainfo) {
                    embed.addFields({ name: '🎮 Jogando agora', value: `**${player.gameextrainfo}**`, inline: false });
                }

                await interaction.editReply({ content: formatResponse(''), embeds: [embed], components: [row] });

            } catch (err) {
                console.error('[STEAM PERFIL]', err.message);
                await interaction.editReply({ content: formatResponse('❌ Erro ao buscar perfil Steam. Verifique o SteamID e tente novamente.') });
            }
        }
    }
};

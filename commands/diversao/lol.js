const {
    SlashCommandBuilder, EmbedBuilder, AttachmentBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const axios = require('axios');
const { Profile } = require('discord-arts');
const { formatResponse } = require('../../utils/persona');

// Tenta importar djs-forge (instale com: npm install djs-forge)
let Paginator, Timestamp, EmbedPresets;
try {
    const forge = require('djs-forge');
    Paginator = forge.Paginator;
    Timestamp = forge.Timestamp;
    EmbedPresets = forge.EmbedPresets;
} catch {
    Paginator = null;
    Timestamp = null;
    EmbedPresets = null;
}

const RIOT_KEY = process.env.RIOT_API_KEY || '';
const DD_VERSION = '14.24.1';

// ─── Rank Data ───────────────────────────────────────────────────────────────
const TIER_DATA = {
    'IRON':        { hex: '#5C5C5C', name: 'Ferro',       order: 0  },
    'BRONZE':      { hex: '#8C5A3C', name: 'Bronze',      order: 1  },
    'SILVER':      { hex: '#7B909A', name: 'Prata',       order: 2  },
    'GOLD':        { hex: '#C89B3C', name: 'Ouro',        order: 3  },
    'PLATINUM':    { hex: '#4E9996', name: 'Platina',     order: 4  },
    'EMERALD':     { hex: '#009B5E', name: 'Esmeralda',   order: 5  },
    'DIAMOND':     { hex: '#576BCE', name: 'Diamante',    order: 6  },
    'MASTER':      { hex: '#9D48E0', name: 'Mestre',      order: 7  },
    'GRANDMASTER': { hex: '#CD4545', name: 'Grão-Mestre', order: 8  },
    'CHALLENGER':  { hex: '#F4C874', name: 'Desafiante',  order: 9  },
    'UNRANKED':    { hex: '#3C3C41', name: 'Sem Rank',    order: -1 },
};

const TIER_EMOJI = {
    'IRON': '🔩', 'BRONZE': '🥉', 'SILVER': '🥈', 'GOLD': '🥇',
    'PLATINUM': '💎', 'EMERALD': '💚', 'DIAMOND': '💠', 'MASTER': '👑',
    'GRANDMASTER': '🔥', 'CHALLENGER': '🏆', 'UNRANKED': '❓'
};

const TIER_BAR_COLORS = {
    'IRON':        ['#5C5C5C', '#8a8a8a'],
    'BRONZE':      ['#8C5A3C', '#CD7F32'],
    'SILVER':      ['#7B909A', '#C0C0C0'],
    'GOLD':        ['#C89B3C', '#FFD700'],
    'PLATINUM':    ['#4E9996', '#00CED1'],
    'EMERALD':     ['#009B5E', '#50C878'],
    'DIAMOND':     ['#576BCE', '#B9F2FF'],
    'MASTER':      ['#9D48E0', '#DA70D6'],
    'GRANDMASTER': ['#CD4545', '#FF6B6B'],
    'CHALLENGER':  ['#F4C874', '#FFD700'],
    'UNRANKED':    ['#3C3C41', '#666666'],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcKDA(k, d, a) {
    return d === 0 ? 'Perfect' : ((k + a) / d).toFixed(2);
}

function progressBar(current, max, size = 10) {
    const filled = Math.round((current / Math.max(max, 1)) * size);
    const empty = size - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getWinRate(wins, losses) {
    const total = wins + losses;
    if (total === 0) return { wr: 0, text: '0%' };
    const wr = (wins / total) * 100;
    return { wr, text: `${wr.toFixed(1)}%` };
}

function formatRankFull(r, showLP = true) {
    if (!r) return '`Unranked`';
    const emoji = TIER_EMOJI[r.tier] || '❓';
    const { text: wrText } = getWinRate(r.wins, r.losses);
    const lpText = showLP ? ` • **${r.leaguePoints} LP**` : '';
    return `${emoji} **${TIER_DATA[r.tier]?.name || r.tier} ${r.rank}**${lpText}\n` +
           `> 📊 ${r.wins}V / ${r.losses}D (${wrText})`;
}

function formatRankCompact(r) {
    if (!r) return 'Unranked';
    const emoji = TIER_EMOJI[r.tier] || '❓';
    return `${emoji} ${TIER_DATA[r.tier]?.name || r.tier} ${r.rank} ${r.leaguePoints}LP`;
}

function timeAgo(timestamp) {
    if (Timestamp) return Timestamp.relative(new Date(timestamp));
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
}

// URLs oficiais
const PROFILE_ICON_URL = (iconId) =>
    `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/profileicon/${iconId}.png`;
const CHAMP_SPLASH_URL = (champId, skinNum = 0) =>
    `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champId}_${skinNum}.jpg`;
const CHAMP_SQUARE_URL = (champId) =>
    `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/champion/${champId}.png`;
const RANK_EMBLEM_URL = (tier) =>
    `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`;

// ─── Module ──────────────────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('lol')
        .setDescription('⚔️ Perfil completo de League of Legends')
        .addSubcommand(sub =>
            sub.setName('perfil')
                .setDescription('📊 Estatísticas completas do invocador')
                .addStringOption(opt =>
                    opt.setName('nome')
                        .setDescription('Riot ID com tag (ex: Faker#KR1)')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('regiao')
                        .setDescription('Região do servidor')
                        .setRequired(false)
                        .addChoices(
                            { name: '🇧🇷 Brasil (BR1)', value: 'br1' },
                            { name: '🇺🇸 NA (NA1)', value: 'na1' },
                            { name: '🇪🇺 EUW (EUW1)', value: 'euw1' },
                            { name: '🇪🇺 EUNE (EUN1)', value: 'eun1' },
                            { name: '🇰🇷 Korea (KR)', value: 'kr' },
                            { name: '🇲🇽 LAN (LA1)', value: 'la1' },
                            { name: '🇦🇷 LAS (LA2)', value: 'la2' },
                            { name: '🇯🇵 Japan (JP1)', value: 'jp1' },
                            { name: '🇹🇷 Turkey (TR1)', value: 'tr1' },
                            { name: '🇷🇺 Russia (RU)', value: 'ru' },
                            { name: '🇵🇭 PH (PH2)', value: 'ph2' },
                            { name: '🇸🇬 SG (SG2)', value: 'sg2' },
                            { name: '🇹🇭 TH (TH2)', value: 'th2' },
                            { name: '🇹🇼 TW (TW2)', value: 'tw2' },
                            { name: '🇻🇳 VN (VN2)', value: 'vn2' },
                            { name: '🌏 OCE (OC1)', value: 'oc1' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('aovivo')
                .setDescription('🔴 Ver partida ao vivo de um invocador')
                .addStringOption(opt =>
                    opt.setName('nome')
                        .setDescription('Riot ID com tag (ex: Faker#KR1)')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('regiao')
                        .setDescription('Região')
                        .setRequired(false)
                        .addChoices(
                            { name: '🇧🇷 Brasil (BR1)', value: 'br1' },
                            { name: '🇺🇸 NA (NA1)', value: 'na1' },
                            { name: '🇪🇺 EUW (EUW1)', value: 'euw1' },
                            { name: '🇰🇷 Korea (KR)', value: 'kr' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('rotacao')
                .setDescription('🔄 Ver campeões gratuitos da semana')
        ),

    aliases: ['lol', 'league', 'invocador', 'summoner'],
    detailedDescription: 'Consulta completa de perfil LoL com discord-arts card, 5 páginas de stats e partida ao vivo.',
    usage: '`/lol perfil [nome#tag]` | `/lol aovivo [nome#tag]` | `/lol rotacao`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();

        if (!RIOT_KEY) {
            return interaction.editReply({
                content: formatResponse('❌ **RIOT_API_KEY** não configurada.\n> Obtenha em: https://developer.riotgames.com')
            });
        }

        const sub = interaction.options.getSubcommand();
        const riotHeaders = { headers: { 'X-Riot-Token': RIOT_KEY } };

        // ══════════════════════════════════════════════════════════════════════
        // SUBCOMANDO: ROTAÇÃO GRATUITA
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'rotacao') {
            try {
                const [rotationRes, ddRes] = await Promise.all([
                    axios.get('https://br1.api.riotgames.com/lol/platform/v3/champion-rotations', riotHeaders),
                    axios.get(`https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/data/pt_BR/champion.json`)
                ]);

                const rotation = rotationRes.data;
                const champsData = ddRes.data.data;
                const champsMap = {};
                Object.values(champsData).forEach(c => { champsMap[c.key] = c; });

                const freeChamps = rotation.freeChampionIds.map(id => champsMap[id]?.name || `#${id}`);
                const newPlayerChamps = rotation.freeChampionIdsForNewPlayers.map(id => champsMap[id]?.name || `#${id}`);

                const randomChamp = rotation.freeChampionIds[Math.floor(Math.random() * rotation.freeChampionIds.length)];
                const splashChamp = champsMap[randomChamp];

                const embed = new EmbedBuilder()
                    .setTitle('🔄 Rotação Gratuita da Semana')
                    .setColor('#C89B3C')
                    .addFields(
                        {
                            name: `🎮 Campeões Gratuitos (${freeChamps.length})`,
                            value: freeChamps.join(', ') || 'N/A',
                            inline: false
                        },
                        {
                            name: `🆕 Para Novos Jogadores (${newPlayerChamps.length})`,
                            value: newPlayerChamps.slice(0, 15).join(', ') + (newPlayerChamps.length > 15 ? '...' : '') || 'N/A',
                            inline: false
                        },
                        {
                            name: '📊 Nível Máximo para Rotação de Novatos',
                            value: `Nível **${rotation.maxNewPlayerLevel}**`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Atualizado semanalmente às terças-feiras' })
                    .setTimestamp();

                if (splashChamp) {
                    embed.setImage(CHAMP_SPLASH_URL(splashChamp.id));
                    embed.setThumbnail(CHAMP_SQUARE_URL(splashChamp.id));
                }

                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('[LOL ROTACAO]', err.message);
                return interaction.editReply({ content: formatResponse('❌ Erro ao buscar rotação gratuita.') });
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // CONFIGURAÇÃO COMUM (perfil e aovivo)
        // ══════════════════════════════════════════════════════════════════════
        const nomeInput = interaction.options.getString('nome').trim();
        const regiao = interaction.options.getString('regiao') || 'br1';
        const routing = ['br1', 'la1', 'la2', 'na1', 'oc1'].includes(regiao) ? 'americas'
                      : ['kr', 'jp1'].includes(regiao) ? 'asia'
                      : ['ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(regiao) ? 'sea'
                      : 'europe';

        const [gameName, tagLine] = nomeInput.includes('#')
            ? nomeInput.split('#')
            : [nomeInput, regiao === 'br1' ? 'BR1' : regiao.toUpperCase()];

        try {
            // ── Conta Riot ───────────────────────────────────────────────────
            const accountRes = await axios.get(
                `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
                riotHeaders
            );
            const account = accountRes.data;
            const puuid = account.puuid;

            // ── Summoner ─────────────────────────────────────────────────────
            const summonerRes = await axios.get(
                `https://${regiao}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                riotHeaders
            );
            const summoner = summonerRes.data;
            const profileIconUrl = PROFILE_ICON_URL(summoner.profileIconId);

            // ══════════════════════════════════════════════════════════════════
            // SUBCOMANDO: AO VIVO
            // ══════════════════════════════════════════════════════════════════
            if (sub === 'aovivo') {
                try {
                    const liveRes = await axios.get(
                        `https://${regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
                        riotHeaders
                    );
                    const game = liveRes.data;

                    let champsMap = {};
                    try {
                        const dd = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/data/pt_BR/champion.json`);
                        Object.values(dd.data.data).forEach(c => { champsMap[c.key] = c; });
                    } catch { }

                    const modeMap = {
                        'CLASSIC': 'Summoner\'s Rift', 'ARAM': 'ARAM', 'CHERRY': 'Arena',
                        'TUTORIAL': 'Tutorial', 'URF': 'URF', 'ONEFORALL': 'Um por Todos', 'NEXUSBLITZ': 'Nexus Blitz',
                    };

                    const gameTypeMap = {
                        'RANKED_SOLO_5x5': '⚔️ Ranqueada Solo/Duo', 'RANKED_FLEX_SR': '👥 Ranqueada Flex',
                        'NORMAL': '🎮 Normal', 'ARAM': '🌉 ARAM', 'CUSTOM': '🔧 Personalizada',
                    };

                    const duracao = formatDuration(Math.floor((Date.now() - game.gameStartTime) / 1000));
                    const modo = modeMap[game.gameMode] || game.gameMode;
                    const tipo = gameTypeMap[game.gameQueueConfigId] || gameTypeMap[game.gameType] || 'Partida';

                    const mePlayer = game.participants.find(p => p.puuid === puuid);
                    const myTeamId = mePlayer?.teamId;

                    const time100 = game.participants.filter(p => p.teamId === 100);
                    const time200 = game.participants.filter(p => p.teamId === 200);

                    function formatTeam(players) {
                        return players.map(p => {
                            const isMe = p.puuid === puuid;
                            const champData = champsMap[p.championId];
                            const champName = champData?.name || `#${p.championId}`;
                            const riotId = p.riotId || 'Jogador';
                            const prefix = isMe ? '**➤ ' : '';
                            const suffix = isMe ? ' (VOCÊ)**' : '';
                            return `${prefix}${champName} — ${riotId}${suffix}`;
                        }).join('\n');
                    }

                    const bans100 = game.bannedChampions?.filter(b => b.teamId === 100).map(b => champsMap[b.championId]?.name || `#${b.championId}`).join(', ') || 'Nenhum';
                    const bans200 = game.bannedChampions?.filter(b => b.teamId === 200).map(b => champsMap[b.championId]?.name || `#${b.championId}`).join(', ') || 'Nenhum';

                    const embed = new EmbedBuilder()
                        .setTitle(`🔴 ${account.gameName} está em partida!`)
                        .setDescription(`> ${tipo}\n> 🗺️ **${modo}** • ⏱️ **${duracao}**`)
                        .setColor('#E74C3C')
                        .setThumbnail(profileIconUrl)
                        .addFields(
                            { name: `🔵 Time Azul${myTeamId === 100 ? ' ⭐' : ''}`, value: formatTeam(time100) || 'N/A', inline: true },
                            { name: `🔴 Time Vermelho${myTeamId === 200 ? ' ⭐' : ''}`, value: formatTeam(time200) || 'N/A', inline: true },
                        )
                        .setFooter({ text: `${regiao.toUpperCase()} • Game ID: ${game.gameId}` })
                        .setTimestamp();

                    if (game.bannedChampions?.length) {
                        embed.addFields(
                            { name: '🚫 Bans Azul', value: bans100, inline: true },
                            { name: '🚫 Bans Vermelho', value: bans200, inline: true },
                        );
                    }

                    if (mePlayer) {
                        const myChampData = champsMap[mePlayer.championId];
                        if (myChampData) embed.setImage(CHAMP_SPLASH_URL(myChampData.id));
                    }

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('OP.GG Live').setURL(`https://op.gg/summoners/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}/ingame`).setStyle(ButtonStyle.Link),
                        new ButtonBuilder().setLabel('Porofessor').setURL(`https://porofessor.gg/live/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
                    );

                    return interaction.editReply({ embeds: [embed], components: [row] });

                } catch (liveErr) {
                    if (liveErr.response?.status === 404) {
                        const embed = new EmbedBuilder()
                            .setTitle(`✅ ${account.gameName} não está em partida`)
                            .setDescription('> O invocador não está em nenhuma partida no momento.')
                            .setColor('#2ECC71')
                            .setThumbnail(profileIconUrl)
                            .setTimestamp();
                        return interaction.editReply({ embeds: [embed] });
                    }
                    throw liveErr;
                }
            }

            // ══════════════════════════════════════════════════════════════════
            // SUBCOMANDO: PERFIL COMPLETO (5 PÁGINAS)
            // ══════════════════════════════════════════════════════════════════

            // ── Coleta massiva de dados em paralelo ──────────────────────────
            const [rankRes, masteryRes, matchIdsRes, challengesRes, ddRes, totalMasteryRes] = await Promise.allSettled([
                axios.get(`https://${regiao}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=10`, riotHeaders),
                axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/challenges/v1/player-data/${puuid}`, riotHeaders),
                axios.get(`https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/data/pt_BR/champion.json`),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/scores/by-puuid/${puuid}`, riotHeaders),
            ]);

            // ── Processar dados ──────────────────────────────────────────────
            let rankSolo = null, rankFlex = null, rankArena = null;
            if (rankRes.status === 'fulfilled') {
                rankSolo = rankRes.value.data.find(r => r.queueType === 'RANKED_SOLO_5x5');
                rankFlex = rankRes.value.data.find(r => r.queueType === 'RANKED_FLEX_SR');
                rankArena = rankRes.value.data.find(r => r.queueType === 'CHERRY');
            }

            const mainRank = rankSolo || rankFlex;
            const tierPrincipal = mainRank?.tier || 'UNRANKED';
            const corTier = TIER_DATA[tierPrincipal]?.hex || '#3C3C41';

            let champsMap = {};
            if (ddRes.status === 'fulfilled') {
                Object.values(ddRes.value.data.data).forEach(c => { champsMap[c.key] = c; });
            }

            const totalMasteryScore = totalMasteryRes.status === 'fulfilled' ? totalMasteryRes.value.data : 0;

            let challengesData = null;
            let titleText = '';
            let categoryLevels = {};
            if (challengesRes.status === 'fulfilled') {
                challengesData = challengesRes.value.data;
                titleText = challengesData.preferences?.title || '';
                if (challengesData.categoryPoints) {
                    for (const [cat, data] of Object.entries(challengesData.categoryPoints)) {
                        categoryLevels[cat] = data;
                    }
                }
            }

            let masteryList = [];
            let topChampId = null;
            let topChampName = null;
            let totalMasteryPoints = 0;
            if (masteryRes.status === 'fulfilled') {
                masteryList = masteryRes.value.data;
                if (masteryList.length) {
                    topChampId = masteryList[0].championId;
                    topChampName = champsMap[topChampId]?.id || null;
                }
                totalMasteryPoints = masteryList.reduce((acc, m) => acc + m.championPoints, 0);
            }

            // Splash do main champion
            const mainSplashUrl = topChampName ? CHAMP_SPLASH_URL(topChampName) : CHAMP_SPLASH_URL('Jinx');
            const mainChampDisplayName = champsMap[topChampId]?.name || 'N/A';

            // ── discord-arts Profile Card (Página 1) ─────────────────────────
            let profileCardAttachment = null;
            try {
                const rankTierForBar = mainRank?.tier || 'UNRANKED';
                const barColors = TIER_BAR_COLORS[rankTierForBar] || ['#fff'];
                const totalGamesRank = mainRank ? (mainRank.wins + mainRank.losses) : 0;

                const profileBuffer = await Profile(interaction.user.id, {
                    customUsername: `${account.gameName}`,
                    customTag: `#${account.tagLine} • ${TIER_DATA[tierPrincipal]?.name || 'Sem Rank'} • ${regiao.toUpperCase()}`,
                    customBackground: mainSplashUrl,
                    borderColor: barColors,
                    borderAllign: 'horizontal',
                    badgesFrame: true,
                    disableBackgroundBlur: true,
                    backgroundBrightness: -30,
                    customDate: `Lvl ${summoner.summonerLevel} • ${totalMasteryScore} champs`,
                    localDateType: 'pt-BR',
                    rankData: {
                        currentXp: mainRank?.leaguePoints || 0,
                        requiredXp: 100,
                        level: summoner.summonerLevel,
                        rank: totalGamesRank > 0 ? totalGamesRank : undefined,
                        barColor: barColors,
                        levelColor: corTier,
                        autoColorRank: true,
                    },
                    presenceStatus: interaction.member?.presence?.status || 'online',
                    squareAvatar: false,
                });

                profileCardAttachment = new AttachmentBuilder(profileBuffer, { name: 'lol-profile.png' });
            } catch (err) {
                console.error('[LOL] discord-arts erro:', err.message);
            }

            // ── Buscar detalhes das partidas ─────────────────────────────────
            let matchDetails = [];
            let stats = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, damage: 0, gold: 0, vision: 0, duration: 0 };
            let champStats = {};

            if (matchIdsRes.status === 'fulfilled' && matchIdsRes.value.data.length) {
                const matchIds = matchIdsRes.value.data;
                const detailsPromises = matchIds.map(id =>
                    axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`, riotHeaders).catch(() => null)
                );
                const detailsResults = await Promise.all(detailsPromises);

                for (const res of detailsResults) {
                    if (!res?.data) continue;
                    const match = res.data;
                    const participant = match.info.participants.find(p => p.puuid === puuid);
                    if (!participant) continue;

                    matchDetails.push({ match, participant });

                    stats.games++;
                    if (participant.win) stats.wins++;
                    stats.kills += participant.kills;
                    stats.deaths += participant.deaths;
                    stats.assists += participant.assists;
                    stats.cs += (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0);
                    stats.damage += participant.totalDamageDealtToChampions || 0;
                    stats.gold += participant.goldEarned || 0;
                    stats.vision += participant.visionScore || 0;
                    stats.duration += match.info.gameDuration || 0;

                    const champName = participant.championName;
                    if (!champStats[champName]) {
                        champStats[champName] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
                    }
                    champStats[champName].games++;
                    if (participant.win) champStats[champName].wins++;
                    champStats[champName].kills += participant.kills;
                    champStats[champName].deaths += participant.deaths;
                    champStats[champName].assists += participant.assists;
                }
            }

            const g = stats.games || 1;
            const avgKDA = calcKDA(stats.kills / g, stats.deaths / g, stats.assists / g);
            const avgCS = (stats.cs / g).toFixed(0);
            const avgDamage = formatNumber(Math.round(stats.damage / g));
            const avgGold = formatNumber(Math.round(stats.gold / g));
            const avgVision = (stats.vision / g).toFixed(1);
            const avgDuration = Math.round(stats.duration / g / 60);
            const wrRecent = stats.games ? `${((stats.wins / stats.games) * 100).toFixed(0)}%` : 'N/A';

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 1: PERFIL + RANK (com discord-arts card)
            // ══════════════════════════════════════════════════════════════════
            const embed1 = new EmbedBuilder()
                .setAuthor({
                    name: `${account.gameName}#${account.tagLine} • ${regiao.toUpperCase()}`,
                    iconURL: profileIconUrl
                })
                .setColor(corTier)
                .setThumbnail(tierPrincipal !== 'UNRANKED' ? RANK_EMBLEM_URL(tierPrincipal) : profileIconUrl)
                .addFields(
                    { name: '🏆 Solo/Duo', value: formatRankFull(rankSolo), inline: true },
                    { name: '👥 Flex 5v5', value: formatRankFull(rankFlex), inline: true },
                    ...(rankArena ? [{ name: '🎯 Arena', value: formatRankFull(rankArena), inline: true }] : []),
                )
                .setFooter({ text: `Página 1/5 • Perfil │ Main: ${mainChampDisplayName}` })
                .setTimestamp();

            if (profileCardAttachment) {
                embed1.setImage('attachment://lol-profile.png');
            } else {
                embed1.setImage(mainSplashUrl);
                embed1.setDescription(
                    (titleText ? `> 🏅 *"${titleText}"*\n` : '') +
                    `> 🌍 **${regiao.toUpperCase()}** • Nível **${summoner.summonerLevel}**\n` +
                    `> 🏆 **${totalMasteryScore}** campeões com maestria`
                );
            }

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 2: ESTATÍSTICAS
            // ══════════════════════════════════════════════════════════════════
            const lpProgress = mainRank ? progressBar(mainRank.leaguePoints, 100, 12) : progressBar(0, 100, 12);
            const wrSolo = rankSolo ? getWinRate(rankSolo.wins, rankSolo.losses) : { wr: 0, text: 'N/A' };
            const wrFlex = rankFlex ? getWinRate(rankFlex.wins, rankFlex.losses) : { wr: 0, text: 'N/A' };

            const embed2 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: profileIconUrl })
                .setTitle('📊 Estatísticas Detalhadas')
                .setColor(corTier)
                .setThumbnail(profileIconUrl)
                .addFields(
                    {
                        name: '⚔️ Ranqueada Solo/Duo',
                        value: rankSolo
                            ? `${formatRankCompact(rankSolo)}\n` +
                              `LP: \`${lpProgress}\` **${rankSolo.leaguePoints}**/100\n` +
                              `**${rankSolo.wins + rankSolo.losses}** partidas • **${wrSolo.text}** WR`
                            : '`Sem dados ranqueados`',
                        inline: false
                    },
                    {
                        name: '👥 Ranqueada Flex',
                        value: rankFlex
                            ? `${formatRankCompact(rankFlex)}\n**${rankFlex.wins + rankFlex.losses}** partidas • **${wrFlex.text}** WR`
                            : '`Sem dados de flex`',
                        inline: true
                    },
                    {
                        name: `📈 Últimas ${stats.games} Partidas`,
                        value: stats.games > 0
                            ? `**${stats.wins}V/${stats.games - stats.wins}D** (${wrRecent})\nKDA: **${avgKDA}**`
                            : '`Sem partidas recentes`',
                        inline: true
                    },
                    { name: '\u200b', value: '─'.repeat(25), inline: false },
                    { name: '🌾 CS/Game', value: `**${avgCS}**`, inline: true },
                    { name: '🗡️ Dano/Game', value: `**${avgDamage}**`, inline: true },
                    { name: '💰 Ouro/Game', value: `**${avgGold}**`, inline: true },
                    { name: '👁️ Visão/Game', value: `**${avgVision}**`, inline: true },
                    { name: '⏱️ Duração Média', value: `**${avgDuration}** min`, inline: true },
                    { name: '🎭 Maestria Total', value: `**${formatNumber(totalMasteryPoints)}** pts`, inline: true },
                )
                .setImage(mainSplashUrl)
                .setFooter({ text: 'Página 2/5 • Estatísticas' });

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 3: TOP CAMPEÕES (MAESTRIA) — com discord-arts card
            // ══════════════════════════════════════════════════════════════════
            const masteryEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            const levelEmojis = { 1: '⬜', 2: '⬜', 3: '⬜', 4: '🟦', 5: '🟪', 6: '🟣', 7: '🔴' };

            const col1 = masteryList.slice(0, 5);
            const col2 = masteryList.slice(5, 10);

            function formatMasteryCol(list, startIdx) {
                if (!list.length) return '`Sem dados`';
                return list.map((m, i) => {
                    const champ = champsMap[m.championId];
                    const champName = champ?.name || `#${m.championId}`;
                    const pts = formatNumber(m.championPoints);
                    const lvl = m.championLevel;
                    const lvlEmoji = levelEmojis[lvl] || '⭐';
                    const chest = m.chestGranted ? '' : '📦';
                    return `${masteryEmojis[startIdx + i]} **${champName}** ${lvlEmoji}\n> ${pts} pts ${chest}`;
                }).join('\n');
            }

            // discord-arts card para maestria (top champion splash)
            let masteryCardAttachment = null;
            try {
                const topMasteryChamp = masteryList.length > 0 ? champsMap[masteryList[0].championId] : null;
                const masterySplash = topMasteryChamp ? CHAMP_SPLASH_URL(topMasteryChamp.id) : mainSplashUrl;
                const topPts = masteryList.length > 0 ? formatNumber(masteryList[0].championPoints) : '0';

                const masteryBuffer = await Profile(interaction.user.id, {
                    customUsername: `${topMasteryChamp?.name || 'N/A'}`,
                    customTag: `Main de ${account.gameName} • ${topPts} pts`,
                    customBackground: masterySplash,
                    borderColor: TIER_BAR_COLORS[tierPrincipal] || ['#fff'],
                    borderAllign: 'horizontal',
                    badgesFrame: true,
                    removeBadges: true,
                    disableBackgroundBlur: true,
                    backgroundBrightness: -20,
                    customDate: `Top ${masteryList.length} Campeões • Lvl ${masteryList[0]?.championLevel || '?'}`,
                    rankData: {
                        currentXp: masteryList[0]?.championPoints || 0,
                        requiredXp: (masteryList[0]?.championPoints || 0) + (masteryList[0]?.championPointsUntilNextLevel || 1),
                        level: masteryList[0]?.championLevel || 0,
                        barColor: TIER_BAR_COLORS[tierPrincipal] || ['#C89B3C', '#FFD700'],
                        levelColor: '#FFD700',
                    },
                    presenceStatus: interaction.member?.presence?.status || 'online',
                    squareAvatar: false,
                });

                masteryCardAttachment = new AttachmentBuilder(masteryBuffer, { name: 'lol-mastery.png' });
            } catch (err) {
                console.error('[LOL] discord-arts mastery erro:', err.message);
            }

            const embed3 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: profileIconUrl })
                .setTitle('🎭 Top 10 Campeões — Maestria')
                .setDescription(`> 🏆 **${totalMasteryScore}** campeões com maestria • **${formatNumber(totalMasteryPoints)}** pontos totais\n> 📦 = Baú de hextech disponível`)
                .setColor(corTier)
                .setThumbnail(profileIconUrl)
                .addFields(
                    { name: '🏅 Top 1-5', value: formatMasteryCol(col1, 0), inline: true },
                    { name: '🎖️ Top 6-10', value: formatMasteryCol(col2, 5), inline: true },
                )
                .setFooter({ text: 'Página 3/5 • Maestria de Campeões' });

            if (masteryCardAttachment) {
                embed3.setImage('attachment://lol-mastery.png');
            } else {
                embed3.setImage(mainSplashUrl);
            }

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 4: HISTÓRICO DE PARTIDAS — com discord-arts card
            // ══════════════════════════════════════════════════════════════════
            let matchHistoryText = '`Nenhuma partida encontrada.`';
            if (matchDetails.length) {
                const lines = matchDetails.slice(0, 6).map((md) => {
                    const p = md.participant;
                    const m = md.match;
                    const win = p.win;
                    const kda = calcKDA(p.kills, p.deaths, p.assists);
                    const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
                    const dur = Math.floor(m.info.gameDuration / 60);
                    const dmg = formatNumber(p.totalDamageDealtToChampions || 0);
                    const when = timeAgo(m.info.gameCreation);

                    const modeMap = { 'CLASSIC': 'SR', 'ARAM': 'ARAM', 'CHERRY': 'Arena' };
                    const mode = modeMap[m.info.gameMode] || m.info.gameMode;

                    const resultEmoji = win ? '🟢' : '🔴';
                    const kdaIcon = kda === 'Perfect' ? '🌟' : parseFloat(kda) >= 3 ? '🔥' : '';

                    let multiKill = '';
                    if (p.pentaKills) multiKill = ' 💀PENTA';
                    else if (p.quadraKills) multiKill = ' 💀QUADRA';
                    else if (p.tripleKills) multiKill = ' 💀TRIPLA';

                    return `${resultEmoji} **${p.championName}** • ${p.kills}/${p.deaths}/${p.assists} (${kda}${kdaIcon})${multiKill}\n` +
                           `> 🗡️${dmg} • 🌾${cs} • ⏱️${dur}m • ${mode} • ${when}`;
                });
                matchHistoryText = lines.join('\n\n');
            }

            const topPlayedChamps = Object.entries(champStats)
                .sort((a, b) => b[1].games - a[1].games)
                .slice(0, 3)
                .map(([name, s]) => {
                    const wr = ((s.wins / s.games) * 100).toFixed(0);
                    const kda = calcKDA(s.kills / s.games, s.deaths / s.games, s.assists / s.games);
                    return `**${name}** — ${s.games}p • ${wr}%WR • ${kda}KDA`;
                })
                .join('\n') || '`N/A`';

            // discord-arts card para histórico (champion mais jogado recente)
            let historyCardAttachment = null;
            try {
                const topRecentChamp = Object.entries(champStats).sort((a, b) => b[1].games - a[1].games)[0];
                const topRecentName = topRecentChamp ? topRecentChamp[0] : null;
                const topRecentSplash = topRecentName ? CHAMP_SPLASH_URL(topRecentName) : mainSplashUrl;
                const topRecentStats = topRecentChamp ? topRecentChamp[1] : null;

                const historyBuffer = await Profile(interaction.user.id, {
                    customUsername: topRecentName || account.gameName,
                    customTag: `${stats.wins}V / ${stats.games - stats.wins}D • ${wrRecent} WR`,
                    customBackground: topRecentSplash,
                    borderColor: stats.wins >= stats.games - stats.wins ? ['#2ECC71', '#27AE60'] : ['#E74C3C', '#C0392B'],
                    borderAllign: 'horizontal',
                    badgesFrame: true,
                    removeBadges: true,
                    disableBackgroundBlur: true,
                    backgroundBrightness: -25,
                    customDate: `${stats.games} partidas • KDA ${avgKDA}`,
                    rankData: {
                        currentXp: stats.wins,
                        requiredXp: Math.max(stats.games, 1),
                        level: stats.games,
                        barColor: stats.wins >= stats.games - stats.wins ? ['#2ECC71', '#27AE60'] : ['#E74C3C', '#C0392B'],
                        levelColor: stats.wins >= stats.games - stats.wins ? '#2ECC71' : '#E74C3C',
                    },
                    presenceStatus: interaction.member?.presence?.status || 'online',
                    squareAvatar: false,
                });

                historyCardAttachment = new AttachmentBuilder(historyBuffer, { name: 'lol-history.png' });
            } catch (err) {
                console.error('[LOL] discord-arts history erro:', err.message);
            }

            const embed4 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: profileIconUrl })
                .setTitle('📜 Histórico de Partidas')
                .setDescription(matchHistoryText)
                .setColor(corTier)
                .setThumbnail(profileIconUrl)
                .addFields(
                    { name: '🎮 Mais Jogados (Recente)', value: topPlayedChamps, inline: false },
                )
                .setFooter({ text: 'Página 4/5 • Histórico' });

            if (historyCardAttachment) {
                embed4.setImage('attachment://lol-history.png');
            } else {
                embed4.setImage(mainSplashUrl);
            }

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 5: DESAFIOS
            // ══════════════════════════════════════════════════════════════════
            const CHALLENGE_CATEGORIES = {
                'IMAGINATION': { name: 'Imaginação', emoji: '🎨' },
                'EXPERTISE':   { name: 'Perícia', emoji: '🎯' },
                'TEAMWORK':    { name: 'Equipe', emoji: '🤝' },
                'COLLECTION':  { name: 'Coleção', emoji: '📦' },
                'VETERANCY':   { name: 'Veterania', emoji: '⭐' },
            };

            const CHALLENGE_LEVEL_EMOJI = {
                'NONE': '⬜', 'IRON': '🔩', 'BRONZE': '🥉', 'SILVER': '🥈',
                'GOLD': '🥇', 'PLATINUM': '💎', 'DIAMOND': '💠', 'MASTER': '👑',
                'GRANDMASTER': '🔥', 'CHALLENGER': '🏆'
            };

            let categoryText = '';
            for (const [cat, data] of Object.entries(categoryLevels)) {
                const catInfo = CHALLENGE_CATEGORIES[cat];
                if (catInfo && data.level) {
                    const emoji = CHALLENGE_LEVEL_EMOJI[data.level] || '⬜';
                    categoryText += `${catInfo.emoji} **${catInfo.name}**: ${emoji} ${data.level}\n`;
                }
            }

            const totalChallengePoints = challengesData?.totalPoints?.current || 0;

            const embed5 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: profileIconUrl })
                .setTitle('🎯 Desafios & Conquistas')
                .setColor(corTier)
                .setThumbnail(profileIconUrl)
                .addFields(
                    { name: '🏅 Pontuação Total', value: `**${formatNumber(totalChallengePoints)}** pontos`, inline: true },
                    { name: '📊 Categorias', value: categoryText || '`Sem dados`', inline: true },
                )
                .setImage(mainSplashUrl)
                .setFooter({ text: 'Página 5/5 • Desafios' });

            // ══════════════════════════════════════════════════════════════════
            // NAVEGAÇÃO com djs-forge Paginator ou fallback manual
            // ══════════════════════════════════════════════════════════════════
            const linksRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('OP.GG').setURL(`https://op.gg/summoners/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
                new ButtonBuilder().setLabel('U.GG').setURL(`https://u.gg/lol/profile/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
                new ButtonBuilder().setLabel('Porofessor').setURL(`https://porofessor.gg/live/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
            );

            // Mapear cada página com seus files e embeds
            const pages = [
                {
                    embeds: [embed1],
                    files: profileCardAttachment ? [profileCardAttachment] : [],
                    components: [linksRow],
                },
                {
                    embeds: [embed2],
                    files: [],
                    components: [linksRow],
                },
                {
                    embeds: [embed3],
                    files: masteryCardAttachment ? [masteryCardAttachment] : [],
                    components: [linksRow],
                },
                {
                    embeds: [embed4],
                    files: historyCardAttachment ? [historyCardAttachment] : [],
                    components: [linksRow],
                },
                {
                    embeds: [embed5],
                    files: [],
                    components: [linksRow],
                },
            ];

            // Tentar usar djs-forge Paginator
            if (Paginator) {
                try {
                    const paginator = new Paginator(pages, {
                        timeout: 180000,
                        showPageCount: true,
                        showStop: true,
                        userId: interaction.user.id,
                        labels: {
                            first: '⏮️',
                            prev: '◀️',
                            next: '▶️',
                            last: '⏭️',
                            stop: '✖️',
                        },
                    });

                    await paginator.reply(interaction);
                    return;
                } catch (paginatorErr) {
                    console.error('[LOL] Paginator erro, usando fallback manual:', paginatorErr.message);
                }
            }

            // ── Fallback: Paginação manual ───────────────────────────────────
            let currentPage = 0;

            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('lol_first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('lol_prev').setEmoji('◀️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('lol_page').setLabel('1/5').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('lol_next').setEmoji('▶️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('lol_last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            );

            await interaction.editReply({
                content: formatResponse(''),
                embeds: [pages[0].embeds[0]],
                files: pages[0].files,
                components: [navRow, linksRow],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.customId.startsWith('lol_') && i.user.id === interaction.user.id,
                time: 180000,
            });

            collector.on('collect', async i => {
                if (i.customId === 'lol_first') currentPage = 0;
                else if (i.customId === 'lol_prev') currentPage = currentPage > 0 ? currentPage - 1 : pages.length - 1;
                else if (i.customId === 'lol_next') currentPage = currentPage < pages.length - 1 ? currentPage + 1 : 0;
                else if (i.customId === 'lol_last') currentPage = pages.length - 1;
                else return;

                navRow.components[2].setLabel(`${currentPage + 1}/5`);

                await i.update({
                    embeds: [pages[currentPage].embeds[0]],
                    files: pages[currentPage].files,
                    components: [navRow, linksRow],
                });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => {});
            });

        } catch (err) {
            if (err.response?.status === 401) {
                return interaction.editReply({
                    content: formatResponse('❌ **API Key expirada (401)**\n\n' +
                        '> A Development Key da Riot expira a cada **24 horas**.\n' +
                        '> 🔄 Gere uma nova em: https://developer.riotgames.com\n' +
                        '> 📝 Atualize no `.env` e reinicie o bot.')
                });
            }
            if (err.response?.status === 403) {
                return interaction.editReply({
                    content: formatResponse('❌ **API Key inválida (403)**\n> Verifique a key em: https://developer.riotgames.com')
                });
            }
            if (err.response?.status === 404) {
                return interaction.editReply({
                    content: formatResponse(`❌ Invocador **${nomeInput}** não encontrado em **${regiao.toUpperCase()}**`)
                });
            }
            if (err.response?.status === 429) {
                return interaction.editReply({
                    content: formatResponse('❌ **Rate limit atingido**\n> Aguarde 2 minutos e tente novamente.')
                });
            }
            console.error('[LOL]', err);
            return interaction.editReply({
                content: formatResponse('❌ Erro ao consultar a Riot API.')
            });
        }
    }
};

const {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ContainerBuilder, SectionBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize, ThumbnailBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder,
    MessageFlags,
} = require('discord.js');
const axios = require('axios');
const { getRiotApiKey } = require('../../utils/riot-api-key');

// ─── Assets oficiais do LoL / Riot + Data Dragon ────────────────────────────
const {
    getLatestDataDragonVersion,
    getChampionCatalog,
    getProfileIconUrl,
    getChampionSplashUrl,
    getChampionSquareUrl,
    getRankEmblemUrl,
} = require('../../utils/lol-assets');

// ─── Helpers visuais inline do LoL ───────────────────────────────────────────
// Hoje este arquivo esta em modo passivo: NAO cria emoji/app emoji.
// Se no futuro voce quiser mexer nisso, o arquivo central e:
// utils/lol-app-emojis.js
const {
    getTierEmoji,
    getRoleEmoji,
    getChampionEmoji,
    getItemEmoji,
    getSummonerSpellEmoji,
    getMasteryLevelEmoji,
    getRuneEmoji,
} = require('../../utils/lol-app-emojis');

// ─── Cache/index de jogadores conhecidos ─────────────────────────────────────
const {
    rememberKnownPlayer,
    indexMatchParticipants,
    pickBestRankText,
    searchKnownPlayers,
    normalizeSearchText,
} = require('../../utils/lol-player-index');

function getRiotKey() {
    return getRiotApiKey();
}

function getRiotHeaders() {
    return { headers: { 'X-Riot-Token': getRiotKey() } };
}

function rotateRiotKey() {
    return null;
}


// ─── Rank Data ───────────────────────────────────────────────────────────────
const TIER_DATA = {
    'IRON': { hex: '#5C5C5C', name: 'Ferro', order: 0 },
    'BRONZE': { hex: '#8C5A3C', name: 'Bronze', order: 1 },
    'SILVER': { hex: '#7B909A', name: 'Prata', order: 2 },
    'GOLD': { hex: '#C89B3C', name: 'Ouro', order: 3 },
    'PLATINUM': { hex: '#4E9996', name: 'Platina', order: 4 },
    'EMERALD': { hex: '#009B5E', name: 'Esmeralda', order: 5 },
    'DIAMOND': { hex: '#576BCE', name: 'Diamante', order: 6 },
    'MASTER': { hex: '#9D48E0', name: 'Mestre', order: 7 },
    'GRANDMASTER': { hex: '#CD4545', name: 'Grão-Mestre', order: 8 },
    'CHALLENGER': { hex: '#F4C874', name: 'Desafiante', order: 9 },
    'UNRANKED': { hex: '#3C3C41', name: 'Sem Rank', order: -1 },
};


// ─── Helpers ─────────────────────────────────────────────────────────────────
// Estas funcoes so formatam texto/numero para o layout. Nao puxam API.
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



function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
}


function buildKnownPlayersReply(query, players) {
    if (!players.length) {
        return [
            `❌ Não achei **${query}** — faltou a hashtag do Riot ID.`,
            'Sem perfis parecidos no cache ainda.',
            '> Use o formato **`Nome#TAG`**, ex: `Velho Tahm#BR1`',
        ].join('\n');
    }

    const lines = players.map((player) => {
        const elo = player.rankText || 'Unranked';
        const lvl = player.level ? ` • Nv${player.level}` : '';
        return `> **${player.riotId}** — ${elo}${lvl}`;
    });

    return [
        `❓ Faltou a hashtag em **${query}**. Perfis encontrados no cache:`,
        '',
        ...lines,
        '',
        '💡 Digite o nome **com a tag** `/lol perfil nome:Velho Tahm#BR1`',
        '*(ou use o autocomplete — comece a digitar e selecione a sugestão)*',
    ].join('\n');
}

function normalizeRole(role) {
    const value = String(role || '').toUpperCase();
    if (value === 'UTILITY') return 'SUPPORT';
    if (value === 'MIDDLE') return 'MID';
    if (value === 'BOTTOM') return 'ADC';
    return value || 'FILL';
}

function formatEmojiLabel(emoji, text) {
    return emoji ? `${emoji} ${text}` : text;
}

function formatQueuePanel(rank, emoji) {
    if (!rank) {
        return '`Unranked`';
    }

    const { text: wrText } = getWinRate(rank.wins, rank.losses);
    return [
        `${formatEmojiLabel(emoji, `**${TIER_DATA[rank.tier]?.name || rank.tier} ${rank.rank}**`)}`,
        `**${rank.leaguePoints} LP** • ${rank.wins}V/${rank.losses}D • ${wrText}`,
    ].join('\n');
}

function formatRecentGameCard(entry, championEmoji = '') {
    if (!entry?.participant || !entry?.match?.info) {
        return '`Sem partida recente.`';
    }

    const { participant, match } = entry;
    const result = participant.win ? 'Vitoria' : 'Derrota';
    const kda = calcKDA(participant.kills, participant.deaths, participant.assists);
    const cs = Number(participant.totalMinionsKilled || 0) + Number(participant.neutralMinionsKilled || 0);
    const duration = Math.floor((match.info.gameDuration || 0) / 60);

    return [
        `${formatEmojiLabel(championEmoji, `**${participant.championName}**`)}`,
        `${result} • ${participant.kills}/${participant.deaths}/${participant.assists} • ${kda} KDA • ${cs} CS • ${duration}m`,
    ].join('\n');
}

function formatCurrentGameCard(liveGame, me, championEmoji = '') {
    if (!liveGame || !me) {
        return '`Jogador nao esta em partida.`';
    }

    return [
        `${formatEmojiLabel(championEmoji, `**${me.championName || 'Campeao atual'}**`)}`,
        `${normalizeRole(me.teamPosition || me.individualPosition || me.lane || 'FILL')} • ${formatDuration(Math.floor((Date.now() - liveGame.gameStartTime) / 1000))}`,
    ].join('\n');
}

function formatMasteryTopLines(masteryEntries, champsMap, emojiMap) {
    if (!masteryEntries.length) return '`Sem dados`';
    return masteryEntries.slice(0, 5).map(entry => {
        const champ = champsMap[entry.championId];
        const champId = champ?.id;
        const champName = champ?.name || `#${entry.championId}`;
        const emoji = emojiMap.get(champId) || '';
        const lvl = entry.championLevel;
        return `${formatEmojiLabel(emoji, `**${champName}**`)} • M${lvl} ${formatNumber(entry.championPoints)}`;
    }).join('\n');
}

function formatRecentChampStats(champStats, emojiMap, overall) {
    const entries = Object.entries(champStats)
        .filter(([, s]) => s.games >= 3)  // mínimo 3 jogos
        .sort((a, b) => {
            const wrA = a[1].wins / a[1].games;
            const wrB = b[1].wins / b[1].games;
            if (wrB !== wrA) return wrB - wrA;  // highest WR first
            return b[1].games - a[1].games;    // tiebreak by games
        })
        .slice(0, 4);
    const lines = [];
    if (overall) lines.push(overall);
    for (const [name, s] of entries) {
        const wr = ((s.wins / s.games) * 100).toFixed(0);
        const emoji = emojiMap.get(name) || '';
        lines.push(`${formatEmojiLabel(emoji, `**${wr}%**`)} (${s.wins}W/${s.games - s.wins}L)`);
    }
    return lines.join('\n') || '`Sem partidas`';
}

// URLs oficiais
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
                        .setDescription('Riot ID com tag (ex: Faker#KR1) ou parte do nome para sugestões')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('aovivo')
                .setDescription('🔴 Ver partida ao vivo de um invocador')
                .addStringOption(opt =>
                    opt.setName('nome')
                        .setDescription('Riot ID com tag (ex: Faker#KR1) ou parte do nome para sugestões')
                        .setRequired(true)
                        .setAutocomplete(true)
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
    detailedDescription: 'Consulta completa de perfil LoL com painel em embeds, botões por função, maestria, histórico e partida ao vivo.',
    usage: '`/lol perfil [nome#tag]` | `/lol aovivo [nome#tag]` | `/lol rotacao`',
    permissions: [''],

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        if (!focused || focused.length < 2) {
            return interaction.respond([]);
        }
        const players = searchKnownPlayers(focused);
        const choices = players.slice(0, 25).map((player) => {
            const elo = player.rankText || 'Unranked';
            const lvl = player.level ? ` • Nv${player.level}` : '';
            return {
                name: `${player.riotId} (${elo}${lvl})`.slice(0, 100),
                value: player.riotId,
            };
        });
        return interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();

        if (!getRiotKey()) {
            return interaction.editReply({
                content: '❌ **RIOT_API_KEY** não configurada.\n> Obtenha em: https://developer.riotgames.com'
            });
        }

        const sub = interaction.options.getSubcommand();
        const patchVersion = await getLatestDataDragonVersion();

        // ══════════════════════════════════════════════════════════════════════
        // SUBCOMANDO: ROTAÇÃO GRATUITA
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'rotacao') {
            try {
                const [rotationRes, champsData] = await Promise.all([
                    axios.get('https://br1.api.riotgames.com/lol/platform/v3/champion-rotations', getRiotHeaders()),
                    getChampionCatalog(patchVersion),
                ]);

                const rotation = rotationRes.data;
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
                    embed.setImage(getChampionSplashUrl(splashChamp.id));
                    embed.setThumbnail(getChampionSquareUrl(patchVersion, splashChamp.id));
                }

                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('[LOL ROTACAO]', err.message);
                return interaction.editReply({ content: '❌ Erro ao buscar rotação gratuita.' });
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

        let gameName, tagLine;
        if (!nomeInput.includes('#')) {
            // Try auto-complete with #BR1 first, show cache on failure
            gameName = nomeInput.trim();
            tagLine = 'BR1';
        } else {
            const parts = nomeInput.split('#');
            gameName = parts[0];
            tagLine = parts[1] || 'BR1';
        }

        try {
            // ── Conta Riot ───────────────────────────────────────────────────
            const accountRes = await axios.get(
                `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
                getRiotHeaders()
            );
            const account = accountRes.data;
            const puuid = account.puuid;

            // ── Summoner ─────────────────────────────────────────────────────
            const summonerRes = await axios.get(
                `https://${regiao}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                getRiotHeaders()
            );
            const summoner = summonerRes.data;
            const profileIconUrl = getProfileIconUrl(patchVersion, summoner.profileIconId);

            // ══════════════════════════════════════════════════════════════════
            // SUBCOMANDO: AO VIVO
            // ══════════════════════════════════════════════════════════════════
            if (sub === 'aovivo') {
                try {
                    const liveRes = await axios.get(
                        `https://${regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${summoner.id}`,
                        getRiotHeaders()
                    );
                    const game = liveRes.data;

                    let champsMap = {};
                    try {
                        const dd = await getChampionCatalog(patchVersion);
                        Object.values(dd).forEach(c => { champsMap[c.key] = c; });
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
                        if (myChampData) embed.setImage(getChampionSplashUrl(myChampData.id));
                    }

                    return interaction.editReply({ embeds: [embed] });

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
            const [rankRes, masteryRes, matchIdsRes, challengesRes, ddRes, totalMasteryRes, liveRes] = await Promise.allSettled([
                axios.get(`https://${regiao}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`, getRiotHeaders()),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=10`, getRiotHeaders()),
                axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`, getRiotHeaders()),
                axios.get(`https://${regiao}.api.riotgames.com/lol/challenges/v1/player-data/${puuid}`, getRiotHeaders()),
                getChampionCatalog(patchVersion),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/scores/by-puuid/${puuid}`, getRiotHeaders()),
                axios.get(`https://${regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${summoner.id}`, getRiotHeaders()),
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

            // Peak rank from API (highestTier/highestRank on the rank entry)
            const peakSolo = rankSolo ? {
                tier: rankSolo.highestTier || rankSolo.tier,
                rank: rankSolo.highestRank || rankSolo.rank,
            } : null;
            const corTier = TIER_DATA[tierPrincipal]?.hex || '#3C3C41';

            let champsMap = {};
            if (ddRes.status === 'fulfilled') {
                Object.values(ddRes.value).forEach(c => { champsMap[c.key] = c; });
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

            const mainChampDisplayName = champsMap[topChampId]?.name || 'N/A';

            rememberKnownPlayer({
                gameName: account.gameName,
                tagLine: account.tagLine,
                regiao,
                puuid,
                summonerId: summoner.id,
                level: summoner.summonerLevel,
                rankText: pickBestRankText([rankSolo, rankFlex, rankArena].filter(Boolean)),
                iconUrl: profileIconUrl,
            });

            // ── Buscar detalhes das partidas ─────────────────────────────────
            let matchDetails = [];
            let stats = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, damage: 0, gold: 0, vision: 0, duration: 0 };
            let champStats = {};
            let roleStats = {}; // will be { ROLE: { games, wins } }

            if (matchIdsRes.status === 'fulfilled' && matchIdsRes.value.data.length) {
                const matchIds = matchIdsRes.value.data;
                const detailsPromises = matchIds.map(id =>
                    axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`, getRiotHeaders()).catch(() => null)
                );
                const detailsResults = await Promise.all(detailsPromises);

                for (const res of detailsResults) {
                    if (!res?.data) continue;
                    const match = res.data;
                    const participant = match.info.participants.find(p => p.puuid === puuid);
                    if (!participant) continue;

                    matchDetails.push({ match, participant });
                    const roleKey = normalizeRole(participant.teamPosition || participant.individualPosition || participant.lane || 'FILL');
                    if (!roleStats[roleKey]) roleStats[roleKey] = { games: 0, wins: 0 };
                    roleStats[roleKey].games++;
                    if (participant.win) roleStats[roleKey].wins++;

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

                indexMatchParticipants(matchDetails.map((entry) => entry.match), regiao);
            }

            const g = stats.games || 1;
            const avgKDA = calcKDA(stats.kills / g, stats.deaths / g, stats.assists / g);
            const avgCS = (stats.cs / g).toFixed(0);
            const avgDamage = formatNumber(Math.round(stats.damage / g));
            const avgGold = formatNumber(Math.round(stats.gold / g));
            const avgVision = (stats.vision / g).toFixed(1);
            const avgDuration = Math.round(stats.duration / g / 60);
            const wrRecent = stats.games ? `${((stats.wins / stats.games) * 100).toFixed(0)}%` : 'N/A';
            const primaryRole = Object.entries(roleStats).sort((a, b) => b[1].games - a[1].games)[0]?.[0] || null;
            const mainChampSquareUrl = topChampName ? getChampionSquareUrl(patchVersion, topChampName) : profileIconUrl;
            const liveGame = liveRes.status === 'fulfilled' ? liveRes.value.data : null;
            const liveParticipant = liveGame?.participants?.find((participant) =>
                participant?.puuid === puuid ||
                participant?.summonerId === summoner.id ||
                normalizeSearchText(participant?.riotIdGameName || participant?.summonerName) === normalizeSearchText(account.gameName)
            ) || null;
            const liveChampionName = liveParticipant?.championId ? (champsMap[String(liveParticipant.championId)]?.id || null) : null;

            const masteryPreview = masteryList.slice(0, 8);
            const recentChampNames = Object.entries(champStats)
                .sort((a, b) => b[1].games - a[1].games)
                .slice(0, 5)
                .map(([name]) => name);

            // ───────────────────────────────────────────────────────────────
            // Assets/Emojis auxiliares da UI
            // Aqui a gente so junta o que APARECEU nas partidas recentes.
            // Isso alimenta os detalhes visuais das paginas.
            // ───────────────────────────────────────────────────────────────
            const recentItemIds = new Set();
            const recentSpellIds = new Set();
            const recentRuneIds = new Set();
            for (const { participant: p } of matchDetails.slice(0, 7)) {
                for (const key of ['item0','item1','item2','item3','item4','item5','item6']) {
                    if (p[key] && p[key] !== 0) recentItemIds.add(p[key]);
                }
                if (p.summoner1Id) recentSpellIds.add(p.summoner1Id);
                if (p.summoner2Id) recentSpellIds.add(p.summoner2Id);
                // perk0 = keystone, perks array dentro de perks.styles
                const keystone = p.perks?.styles?.[0]?.selections?.[0]?.perk;
                if (keystone) recentRuneIds.add(keystone);
            }

            const emojiChampionNames = Array.from(new Set([
                topChampName,
                liveChampionName,
                ...recentChampNames,
                ...masteryPreview.map((entry) => champsMap[entry.championId]?.id),
                matchDetails[0]?.participant?.championName,
            ].filter(Boolean)));

            // ───────────────────────────────────────────────────────────────
            // Buscar os assets auxiliares em paralelo
            // championEmojiMap = bonecos
            // tierEmojiResults = elo/rank
            // item/spell/rune maps = detalhes do historico
            // Hoje isso esta em modo passivo se os emojis nao estiverem ativos.
            // ───────────────────────────────────────────────────────────────
            const [
                championEmojiResults,
                tierEmojiResults,
                itemEmojiResults,
                spellEmojiResults,
                runeEmojiResults,
            ] = await Promise.all([
                Promise.allSettled(emojiChampionNames.map(n => getChampionEmoji(interaction.client, patchVersion, n))),
                Promise.allSettled([
                    getTierEmoji(interaction.client, rankSolo?.tier),
                    getTierEmoji(interaction.client, rankFlex?.tier),
                    getTierEmoji(interaction.client, rankArena?.tier),
                    getRoleEmoji(interaction.client, primaryRole),
                ]),
                Promise.allSettled([...recentItemIds].map(id => getItemEmoji(interaction.client, id).then(e => ({ id, e })))),
                Promise.allSettled([...recentSpellIds].map(id => getSummonerSpellEmoji(interaction.client, id).then(e => ({ id, e })))),
                Promise.allSettled([...recentRuneIds].map(id => getRuneEmoji(interaction.client, patchVersion, id).then(e => ({ id, e })))),
            ]);

            // ─── Mapa final de assets em memoria para a renderizacao ───────
            const championEmojiMap = new Map();
            emojiChampionNames.forEach((n, i) => {
                championEmojiMap.set(n, championEmojiResults[i]?.status === 'fulfilled' ? championEmojiResults[i].value : '');
            });
            const soloTierEmoji  = tierEmojiResults[0]?.status === 'fulfilled' ? tierEmojiResults[0].value : '';
            const flexTierEmoji  = tierEmojiResults[1]?.status === 'fulfilled' ? tierEmojiResults[1].value : '';
            const arenaTierEmoji = tierEmojiResults[2]?.status === 'fulfilled' ? tierEmojiResults[2].value : '';
            const primaryRoleEmoji = tierEmojiResults[3]?.status === 'fulfilled' ? tierEmojiResults[3].value : '';

            const itemEmojiMap = new Map();
            for (const r of itemEmojiResults) {
                if (r?.status === 'fulfilled' && r.value?.id) itemEmojiMap.set(r.value.id, r.value.e);
            }
            const spellEmojiMap = new Map();
            for (const r of spellEmojiResults) {
                if (r?.status === 'fulfilled' && r.value?.id) spellEmojiMap.set(r.value.id, r.value.e);
            }
            const runeEmojiMap = new Map();
            for (const r of runeEmojiResults) {
                if (r?.status === 'fulfilled' && r.value?.id) runeEmojiMap.set(r.value.id, r.value.e);
            }

            const mainChampEmoji = championEmojiMap.get(topChampName) || '';
            const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            // ── Resultado compacto W/L ──
            const wlDot = (win) => win ? '`W`' : '`L`';

            // ── Histórico mini (últimas 10, compacto) ──
            const historicoMini = matchDetails.slice(0, 10).map(m => wlDot(m.participant.win)).join(' ') || '`—`';

            // ── Peak rank ──
            const peakText = peakSolo
                ? `${TIER_DATA[peakSolo.tier]?.name || peakSolo.tier} ${peakSolo.rank}`
                : (rankSolo ? `${TIER_DATA[rankSolo.tier]?.name || rankSolo.tier} ${rankSolo.rank}` : 'Sem histórico');

            // ── Ao Vivo ──
            const isLive = !!(liveGame && liveParticipant);
            const liveChampDisplayName = liveParticipant?.championId ? (champsMap[String(liveParticipant.championId)]?.name || 'Desconhecido') : '';
            const liveDurText = liveGame ? formatDuration(Math.floor((Date.now() - liveGame.gameStartTime) / 1000)) : '';

            // ── WR por role ──
            const LANE_PT = { TOP: 'Topo', JUNGLE: 'Jungle', MID: 'Meio', BOTTOM: 'Atirador', ADC: 'Atirador', SUPPORT: 'Suporte', UTILITY: 'Suporte' };
            const topRoles = Object.entries(roleStats)
                .filter(([l]) => l && l !== 'FILL' && l !== 'UNKNOWN' && l !== 'NONE' && l !== 'INVALID')
                .sort((a, b) => b[1].games - a[1].games)
                .slice(0, 3);

            // ════════════════════════════════════════════════════════════════
            // Helpers visuais do Components V2
            // sessionId = prende os botoes nesta mensagem
            // sep() = linha divisoria entre blocos
            // txt() = bloco de texto; se vier vazio, joga um espaco invisivel
            // buildNavButtons() = linha de botoes para trocar de pagina
            // ════════════════════════════════════════════════════════════════
            const sessionId = interaction.id;

            const sep = (large = false) => new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

            const txt = (content) => new TextDisplayBuilder().setContent(String(content || '\u200b'));

            function buildNavButtons(activeKey) {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`lol_profile_${sessionId}`).setLabel('Perfil').setEmoji('📊').setStyle(ButtonStyle.Success).setDisabled(activeKey === 'profile'),
                    new ButtonBuilder().setCustomId(`lol_mastery_${sessionId}`).setLabel('Maestrias').setEmoji('🏆').setStyle(ButtonStyle.Primary).setDisabled(activeKey === 'mastery'),
                    new ButtonBuilder().setCustomId(`lol_history_${sessionId}`).setLabel('Histórico').setEmoji('📜').setStyle(ButtonStyle.Secondary).setDisabled(activeKey === 'history'),
                    new ButtonBuilder().setCustomId(`lol_stats_${sessionId}`).setLabel('Estatísticas').setEmoji('📈').setStyle(ButtonStyle.Danger).setDisabled(activeKey === 'stats'),
                );
            }

            // ════════════════════════════════════════════════════════════════
            // PÁGINA 1 — PERFIL (Components V2)
            // ════════════════════════════════════════════════════════════════
            const rankSoloLine = rankSolo
                ? `${soloTierEmoji} **${TIER_DATA[rankSolo.tier]?.name || rankSolo.tier} ${rankSolo.rank}** • ${rankSolo.leaguePoints} LP • ${getWinRate(rankSolo.wins, rankSolo.losses).text} WR (${rankSolo.wins}V/${rankSolo.losses}D)`
                : '`Sem rank — Solo/Duo`';
            const rankFlexLine = rankFlex
                ? `${flexTierEmoji} **${TIER_DATA[rankFlex.tier]?.name || rankFlex.tier} ${rankFlex.rank}** • ${rankFlex.leaguePoints} LP • ${getWinRate(rankFlex.wins, rankFlex.losses).text} WR (${rankFlex.wins}V/${rankFlex.losses}D)`
                : '`Sem rank — Flex`';
            const rankArenaLine = rankArena
                ? `${arenaTierEmoji} **${TIER_DATA[rankArena.tier]?.name || rankArena.tier} ${rankArena.rank}** • ${rankArena.leaguePoints} LP (Arena)`
                : null;

            const ultimaP = matchDetails[0];
            const ultimaChampEmoji = ultimaP ? (championEmojiMap.get(ultimaP.participant.championName) || '') : '';
            const ultimaKDA = ultimaP ? calcKDA(ultimaP.participant.kills, ultimaP.participant.deaths, ultimaP.participant.assists) : null;

            const rolesText = topRoles.length
                ? topRoles.map(([lane, s]) => `${primaryRoleEmoji} **${LANE_PT[lane] || lane}** ${((s.wins/s.games)*100).toFixed(0)}% WR (${s.games}p)`).join('  ·  ')
                : 'Sem dados de role';

            // ════════════════════════════════════════════════════════════════
            // page1 = PERFIL
            // Este e o primeiro card do /lol perfil.
            // Blocos:
            // 1. Header com nome, nivel, shard e patch
            // 2. Rank atual
            // 3. Resumo das ultimas partidas
            // 4. Main champion + roles
            // 5. Status ao vivo / ultima partida
            // ════════════════════════════════════════════════════════════════
            const page1 = new ContainerBuilder()
                .setAccentColor(parseInt(corTier.replace('#', ''), 16))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            txt(`## ${account.gameName}#${account.tagLine}`),
                            txt(`Nível **${summoner.summonerLevel}** · ${regiao.toUpperCase()} · Patch **${patchVersion}**\nPeak: **${peakText}**${titleText ? `  ·  *${titleText}*` : ''}`),
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: profileIconUrl } }))
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Rank Ranqueado'))
                .addTextDisplayComponents(txt(`⚔️ Solo/Duo — ${rankSoloLine}`))
                .addTextDisplayComponents(txt(`👥 Flex — ${rankFlexLine}`))
                .addTextDisplayComponents(rankArenaLine ? txt(`🏟️ Arena — ${rankArenaLine}`) : txt('\u200b'))
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Partidas Recentes'))
                .addTextDisplayComponents(txt(
                    `**${stats.games}** partidas · **${wrRecent}** WR · **${stats.wins}V/${stats.games - stats.wins}D**\n` +
                    `KDA médio: **${avgKDA}** · Farm: **${avgCS}** CS · Dano: **${avgDamage}**\n` +
                    `Histórico: ${historicoMini}`
                ))
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Campeão Principal & Roles'))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            txt(`${mainChampEmoji} **${mainChampDisplayName}** · M${masteryList[0]?.championLevel || '—'} · ${formatNumber(totalMasteryPoints)} pts totais`),
                            txt(rolesText),
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: mainChampSquareUrl } }))
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    txt(isLive
                        ? `🔴 **Em partida agora** — ${ultimaChampEmoji || ''} **${liveChampDisplayName}** · ${liveDurText}`
                        : ultimaP
                            ? `Última partida: ${wlDot(ultimaP.participant.win)} ${ultimaChampEmoji} **${ultimaP.participant.championName}** · ${ultimaP.participant.kills}/${ultimaP.participant.deaths}/${ultimaP.participant.assists} (${ultimaKDA} KDA) · ${timeAgo(ultimaP.match.info.gameCreation)}`
                            : '⚫ Nenhuma partida recente encontrada'
                    )
                );

            // ════════════════════════════════════════════════════════════════
            // PÁGINA 2 — MAESTRIAS (Components V2)
            // ════════════════════════════════════════════════════════════════
            const masteryRows = masteryPreview.map((entry, i) => {
                const champ = champsMap[entry.championId];
                const champEmoji = championEmojiMap.get(champ?.id) || '';
                const champName = champ?.name || `#${entry.championId}`;
                const lastPlay = entry.lastPlayTime ? timeAgo(entry.lastPlayTime) : '—';
                const chest = entry.chestGranted ? '✅' : '🔲';
                return `${i + 1}. ${champEmoji} **${champName}** · M${entry.championLevel} · ${formatNumber(entry.championPoints)} pts · ${lastPlay} · ${chest}`;
            });

            // ════════════════════════════════════════════════════════════════
            // page2 = MAESTRIAS
            // Aqui fica so o bloco de mastery/top champions do jogador.
            // ════════════════════════════════════════════════════════════════
            const page2 = new ContainerBuilder()
                .setAccentColor(parseInt(corTier.replace('#', ''), 16))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            txt(`## 🏆 Maestrias — ${account.gameName}`),
                            txt(`**${totalMasteryScore}** campeões · **${formatNumber(totalMasteryPoints)}** pontos totais`),
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: mainChampSquareUrl } }))
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt(masteryRows.join('\n') || '`Sem dados de maestria`'));

            // ════════════════════════════════════════════════════════════════
            // PÁGINA 3 — HISTÓRICO (Components V2)
            // ════════════════════════════════════════════════════════════════
            const modoMap = {
                420: 'Solo/Duo', 440: 'Flex', 450: 'ARAM',
                400: 'Normal', 430: 'Blind', 1700: 'Arena', 1900: 'URF', 900: 'URF',
            };

            const matchLines = matchDetails.slice(0, 7).map((md) => {
                const p = md.participant;
                const m = md.match;
                const kda = calcKDA(p.kills, p.deaths, p.assists);
                const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
                const durSecs = m.info.gameDuration || 0;
                const durMin = Math.max(1, Math.floor(durSecs / 60));
                const cspm = (cs / durMin).toFixed(1);
                const teamKills = m.info.participants.filter(pl => pl.teamId === p.teamId).reduce((s, pl) => s + (pl.kills || 0), 0);
                const kp = teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
                const modo = modoMap[m.info.queueId] || m.info.gameMode;
                const champEmoji = championEmojiMap.get(p.championName) || '';
                const spell1 = spellEmojiMap.get(p.summoner1Id) || '';
                const spell2 = spellEmojiMap.get(p.summoner2Id) || '';
                const keystoneId = p.perks?.styles?.[0]?.selections?.[0]?.perk;
                const keystoneEmoji = keystoneId ? (runeEmojiMap.get(keystoneId) || '') : '';
                const items = [p.item0,p.item1,p.item2,p.item3,p.item4,p.item5]
                    .filter(id => id && id !== 0)
                    .map(id => itemEmojiMap.get(id) || '')
                    .filter(Boolean)
                    .join('');
                let multi = '';
                if (p.pentaKills) multi = ' 🌟**PENTA**';
                else if (p.quadraKills) multi = ' ⚡**QUADRA**';
                else if (p.tripleKills) multi = ' **TRIPLA**';
                return [
                    `${wlDot(p.win)} ${champEmoji} **${p.championName}**${multi}  ·  ${modo}  ·  ${formatDuration(durSecs)}  ·  ${timeAgo(m.info.gameCreation)}`,
                    `${p.kills}/${p.deaths}/${p.assists} (${kda} KDA · ${kp}% KP)  ·  ${cs} CS (${cspm}/min)  ·  👁 ${p.visionScore}  ·  💰 ${formatNumber(p.goldEarned)}`,
                    `${spell1}${spell2}${keystoneEmoji}  ${items}`,
                ].join('\n');
            });

            const topJogados = Object.entries(champStats)
                .sort((a, b) => b[1].games - a[1].games)
                .slice(0, 5)
                .map(([name, s]) => {
                    const wr = ((s.wins / s.games) * 100).toFixed(0);
                    const kda = calcKDA(s.kills / s.games, s.deaths / s.games, s.assists / s.games);
                    const emoji = championEmojiMap.get(name) || '';
                    return `${emoji} **${name}** · ${s.games}p · ${wr}% WR · ${kda} KDA`;
                });

            // ════════════════════════════════════════════════════════════════
            // page3 = HISTORICO
            // Aqui ficam:
            // - linhas das partidas recentes
            // - spells/runas/items capturados
            // - mais jogados no recorte
            // ════════════════════════════════════════════════════════════════
            const page3 = new ContainerBuilder()
                .setAccentColor(parseInt(corTier.replace('#', ''), 16))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            txt(`## 📜 Histórico — ${account.gameName}`),
                            txt(`Últimas **${matchDetails.length}** partidas`),
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: profileIconUrl } }))
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt(matchLines.join('\n\n') || '`Nenhuma partida encontrada`'))
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Mais jogados (recentes)'))
                .addTextDisplayComponents(txt(topJogados.join('\n') || '`Sem dados`'));

            // ════════════════════════════════════════════════════════════════
            // PÁGINA 4 — ESTATÍSTICAS (Components V2)
            // ════════════════════════════════════════════════════════════════
            const CHALLENGE_CATEGORIES = {
                'IMAGINATION': 'Imaginação', 'EXPERTISE': 'Perícia',
                'TEAMWORK': 'Equipe', 'COLLECTION': 'Coleção', 'VETERANCY': 'Veterania',
            };
            const categoryLines = Object.entries(categoryLevels)
                .filter(([cat, data]) => CHALLENGE_CATEGORIES[cat] && data.level)
                .map(([cat, data]) => `**${CHALLENGE_CATEGORIES[cat]}**: ${data.level}`);
            const totalChallengePoints = challengesData?.totalPoints?.current || 0;
            const lpProgress = mainRank ? progressBar(mainRank.leaguePoints, 100, 14) : progressBar(0, 100, 14);
            const wrSolo = rankSolo ? getWinRate(rankSolo.wins, rankSolo.losses) : { wr: 0, text: 'N/A' };
            const wrFlex = rankFlex ? getWinRate(rankFlex.wins, rankFlex.losses) : { wr: 0, text: 'N/A' };

            // ════════════════════════════════════════════════════════════════
            // page4 = ESTATISTICAS
            // Aqui ficam os blocos mais tecnicos:
            // - rank/LP
            // - medias do recorte
            // - desafios
            // - maestria total
            // ════════════════════════════════════════════════════════════════
            const page4 = new ContainerBuilder()
                .setAccentColor(parseInt(corTier.replace('#', ''), 16))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            txt(`## 📈 Estatísticas — ${account.gameName}`),
                            txt(`Patch **${patchVersion}** · ${regiao.toUpperCase()} · Atualizado às **${horaAtual}**`),
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: getRankEmblemUrl(tierPrincipal) } }))
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Rank'))
                .addTextDisplayComponents(txt(
                    `${soloTierEmoji} **Solo/Duo:** ${rankSolo ? `${TIER_DATA[rankSolo.tier]?.name} ${rankSolo.rank} · ${rankSolo.leaguePoints} LP · \`${lpProgress}\`\n${rankSolo.wins + rankSolo.losses} partidas · **${wrSolo.text}** WR` : 'Sem rank'}\n\n` +
                    `${flexTierEmoji} **Flex:** ${rankFlex ? `${TIER_DATA[rankFlex.tier]?.name} ${rankFlex.rank} · ${rankFlex.leaguePoints} LP\n${rankFlex.wins + rankFlex.losses} partidas · **${wrFlex.text}** WR` : 'Sem rank'}` +
                    (rankArena ? `\n\n${arenaTierEmoji} **Arena:** ${TIER_DATA[rankArena.tier]?.name} ${rankArena.rank} · ${rankArena.leaguePoints} LP` : '')
                ))
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Médias das Últimas Partidas'))
                .addTextDisplayComponents(txt(
                    `**${stats.games}p** · **${wrRecent}** WR · **${stats.wins}V/${stats.games - stats.wins}D**\n` +
                    `KDA: **${avgKDA}**  ·  Farm: **${avgCS}** CS  ·  Dano: **${avgDamage}**\n` +
                    `Ouro: **${avgGold}**  ·  Visão: **${avgVision}**  ·  Duração: **${avgDuration}** min`
                ))
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(txt('### Desafios'))
                .addTextDisplayComponents(txt(
                    `**${formatNumber(totalChallengePoints)}** pontos totais\n` +
                    (categoryLines.length ? categoryLines.join('  ·  ') : 'Sem dados de categoria')
                ))
                .addTextDisplayComponents(txt('### Maestria'))
                .addTextDisplayComponents(txt(
                    `**${totalMasteryScore}** campeões · **${formatNumber(totalMasteryPoints)}** pontos totais\n` +
                    `Principal: ${mainChampEmoji} **${mainChampDisplayName}** · M${masteryList[0]?.championLevel || '—'}`
                ));

            // ════════════════════════════════════════════════════════════════
            // ENVIO + COLLECTOR
            // ════════════════════════════════════════════════════════════════
            // pageContainers = mapa que liga o nome da pagina ao card visual
            const pageContainers = { profile: page1, mastery: page2, history: page3, stats: page4 };

            await interaction.editReply({
                flags: MessageFlags.IsComponentsV2,
                components: [page1, buildNavButtons('profile')],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.customId.endsWith(sessionId) && i.user.id === interaction.user.id,
                time: 300000,
            });

            collector.on('collect', async i => {
                let pageKey = 'profile';
                if (i.customId.startsWith('lol_mastery_')) pageKey = 'mastery';
                else if (i.customId.startsWith('lol_history_')) pageKey = 'history';
                else if (i.customId.startsWith('lol_stats_')) pageKey = 'stats';

                await i.update({
                    flags: MessageFlags.IsComponentsV2,
                    components: [pageContainers[pageKey], buildNavButtons(pageKey)],
                }).catch(() => null);
            });

            collector.on('end', () => {
                interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [pageContainers['profile']] }).catch(() => { });
            });

        } catch (err) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                const status = err.response.status;
                return interaction.editReply({
                    content: `❌ **API da Riot recusou a key 2 (${status})**\n\n> Se for key de desenvolvimento, gera outra em: https://developer.riotgames.com`
                });
            }
            if (err.response?.status === 404) {
                if (!nomeInput.includes('#')) {
                    const knownPlayers = searchKnownPlayers(nomeInput);
                    return interaction.editReply({
                        content: buildKnownPlayersReply(nomeInput, knownPlayers),
                    });
                }
                return interaction.editReply({
                    content: `❌ Invocador **${nomeInput}** não encontrado em **BR1**`
                });
            }
            if (err.response?.status === 429) {
                return interaction.editReply({
                    content: '❌ **Rate limit atingido**\n> Aguarde 2 minutos e tente novamente.'
                });
            }
            console.error('[LOL]', err);
            return interaction.editReply({
                content: '❌ Erro ao consultar a Riot API.'
            });
        }
    }
};

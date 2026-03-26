const {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');
const db = require('../../utils/db');
const {
    getLatestDataDragonVersion,
    getChampionCatalog,
    getProfileIconUrl,
    getChampionSplashUrl,
    getChampionSquareUrl,
    getRankEmblemUrl,
    getRankMiniIconUrl,
    getRoleIconUrl,
} = require('../../utils/lol-assets');
const {
    getTierEmoji,
    getRoleEmoji,
    getChampionEmoji,
} = require('../../utils/lol-app-emojis');
const {
    rememberKnownPlayer,
    indexMatchParticipants,
    pickBestRankText,
} = require('../../utils/lol-player-index');

const RIOT_KEY = process.env.RIOT_API_KEY || '';

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
    const { text: wrText } = getWinRate(r.wins, r.losses);
    const lpText = showLP ? ` • **${r.leaguePoints} LP**` : '';
    return `**${TIER_DATA[r.tier]?.name || r.tier} ${r.rank}**${lpText}\n` +
           `> ${r.wins}V / ${r.losses}D (${wrText})`;
}

function formatRankCompact(r) {
    if (!r) return 'Unranked';
    return `${TIER_DATA[r.tier]?.name || r.tier} ${r.rank} ${r.leaguePoints}LP`;
}

function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9#\s_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function searchKnownPlayers(prefix) {
    const normalized = normalizeSearchText(prefix);
    if (!normalized) return [];

    const knownPlayers = db.getEntriesByPrefix('lol_known_player_')
        .map((entry) => entry.value);

    const trackedPlayers = db.getEntriesByPrefix('lol_dm_tracker_')
        .map((entry) => entry.value)
        .map((tracker) => ({
            riotId: tracker?.riotId,
            gameName: tracker?.gameName,
            tagLine: tracker?.tagLine,
            regiao: tracker?.regiao,
            level: tracker?.level || null,
            rankText: tracker?.rankText || null,
            iconUrl: tracker?.profileIconUrl || null,
            updatedAt: tracker?.updatedAt || tracker?.createdAt || null,
        }));

    const deduped = new Map();
    for (const player of [...knownPlayers, ...trackedPlayers]) {
        if (!player?.riotId) continue;
        deduped.set(String(player.riotId).toLowerCase(), player);
    }

    const queryParts = normalized.split(' ').filter(Boolean);

    return [...deduped.values()]
        .map((player) => {
            const gameName = normalizeSearchText(player?.gameName);
            const riotId = normalizeSearchText(player?.riotId);
            const tagLine = normalizeSearchText(player?.tagLine);
            const combined = [gameName, riotId, tagLine].filter(Boolean).join(' ');
            const words = combined.split(' ').filter(Boolean);

            let score = 0;
            if (gameName.startsWith(normalized) || riotId.startsWith(normalized)) score += 100;
            if (words.some((word) => word.startsWith(normalized))) score += 60;
            if (combined.includes(normalized)) score += 30;
            if (queryParts.every((part) => combined.includes(part))) score += 15;

            return { player, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(b.player.updatedAt || '').localeCompare(String(a.player.updatedAt || ''));
        })
        .map((entry) => entry.player)
        .slice(0, 10);
}

function buildKnownPlayersReply(query, players) {
    if (!players.length) {
        return [
            `Nao achei **${query}** porque faltou a hashtag do Riot ID.`,
            'Ainda nao tenho perfis parecidos salvos no cache para te sugerir agora.',
            'Tenta no formato `Nome#TAG`, por exemplo: `Velho#BR1`.',
        ].join('\n');
    }

    return [
        `Nao consegui buscar **${query}** porque faltou a hashtag do Riot ID.`,
        'Os perfis conhecidos que batem com esse comeco de nick sao:',
        '',
        ...players.map((player) => `${player.riotId} - Elo: ${player.rankText || 'Sem rank'} Level: ${player.level || '?'}`),
        '',
        'Manda de novo no formato completo `Nome#TAG` que eu puxo o perfil bonito.',
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
        .sort((a, b) => b[1].games - a[1].games)
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
    detailedDescription: 'Consulta completa de perfil LoL com painel em embeds, botões por função, maestria, histórico e partida ao vivo.',
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
        const patchVersion = await getLatestDataDragonVersion();

        // ══════════════════════════════════════════════════════════════════════
        // SUBCOMANDO: ROTAÇÃO GRATUITA
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'rotacao') {
            try {
                const [rotationRes, champsData] = await Promise.all([
                    axios.get('https://br1.api.riotgames.com/lol/platform/v3/champion-rotations', riotHeaders),
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

        if (!nomeInput.includes('#')) {
            const knownPlayers = searchKnownPlayers(nomeInput);
            return interaction.editReply({
                content: buildKnownPlayersReply(nomeInput, knownPlayers),
            });
        }

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
            const profileIconUrl = getProfileIconUrl(patchVersion, summoner.profileIconId);

            // ══════════════════════════════════════════════════════════════════
            // SUBCOMANDO: AO VIVO
            // ══════════════════════════════════════════════════════════════════
            if (sub === 'aovivo') {
                try {
                    const liveRes = await axios.get(
                        `https://${regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${summoner.id}`,
                        riotHeaders
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
            const [rankRes, masteryRes, matchIdsRes, challengesRes, ddRes, totalMasteryRes, liveRes] = await Promise.allSettled([
                axios.get(`https://${regiao}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=10`, riotHeaders),
                axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=5`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/challenges/v1/player-data/${puuid}`, riotHeaders),
                getChampionCatalog(patchVersion),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/scores/by-puuid/${puuid}`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${summoner.id}`, riotHeaders),
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
            let roleStats = {};

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
                    const roleKey = normalizeRole(participant.teamPosition || participant.individualPosition || participant.lane || 'FILL');
                    roleStats[roleKey] = (roleStats[roleKey] || 0) + 1;

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
            const primaryRole = Object.entries(roleStats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            const mainChampSquareUrl = topChampName ? getChampionSquareUrl(patchVersion, topChampName) : profileIconUrl;
            const primaryRoleIconUrl = primaryRole ? getRoleIconUrl(primaryRole) : null;
            const rankMiniIconUrl = tierPrincipal !== 'UNRANKED' ? getRankMiniIconUrl(tierPrincipal) : profileIconUrl;

            const bestQueue = rankSolo || rankFlex || rankArena || null;
            const liveGame = liveRes.status === 'fulfilled' ? liveRes.value.data : null;
            const liveParticipant = liveGame?.participants?.find((participant) =>
                participant?.puuid === puuid ||
                participant?.summonerId === summoner.id ||
                normalizeSearchText(participant?.riotIdGameName || participant?.summonerName) === normalizeSearchText(account.gameName)
            ) || null;
            const liveChampionName = liveParticipant?.championId ? (champsMap[String(liveParticipant.championId)]?.id || null) : null;

            const masteryPreview = masteryList.slice(0, 8);
            const masteryTop5 = masteryList.slice(0, 5);
            const recentChampNames = Object.entries(champStats)
                .sort((a, b) => b[1].games - a[1].games)
                .slice(0, 5)
                .map(([name]) => name);

            const emojiChampionNames = Array.from(new Set([
                topChampName,
                liveChampionName,
                ...recentChampNames,
                ...masteryPreview.map((entry) => champsMap[entry.championId]?.id),
                matchDetails[0]?.participant?.championName,
            ].filter(Boolean)));

            const championEmojiResults = await Promise.allSettled(
                emojiChampionNames.map((championName) => getChampionEmoji(interaction.client, patchVersion, championName))
            );
            const championEmojiMap = new Map();
            emojiChampionNames.forEach((championName, index) => {
                const result = championEmojiResults[index];
                championEmojiMap.set(championName, result?.status === 'fulfilled' ? result.value : '');
            });

            const [
                primaryTierEmojiRes,
                primaryRoleEmojiRes,
                soloTierEmojiRes,
                flexTierEmojiRes,
                arenaTierEmojiRes,
            ] = await Promise.allSettled([
                getTierEmoji(interaction.client, bestQueue?.tier),
                getRoleEmoji(interaction.client, primaryRole),
                getTierEmoji(interaction.client, rankSolo?.tier),
                getTierEmoji(interaction.client, rankFlex?.tier),
                getTierEmoji(interaction.client, rankArena?.tier),
            ]);

            const primaryTierEmoji = primaryTierEmojiRes.status === 'fulfilled' ? primaryTierEmojiRes.value : '';
            const primaryRoleEmoji = primaryRoleEmojiRes.status === 'fulfilled' ? primaryRoleEmojiRes.value : '';
            const soloTierEmoji = soloTierEmojiRes.status === 'fulfilled' ? soloTierEmojiRes.value : '';
            const flexTierEmoji = flexTierEmojiRes.status === 'fulfilled' ? flexTierEmojiRes.value : '';
            const arenaTierEmoji = arenaTierEmojiRes.status === 'fulfilled' ? arenaTierEmojiRes.value : '';
            const mainChampEmoji = championEmojiMap.get(topChampName) || '';

            const embedHeaderText = [
                titleText ? `**Status:** ${titleText}` : '**Status:** leitura oficial sincronizada.',
                `**Shard:** ${regiao.toUpperCase()} • **Patch:** ${patchVersion}`,
            ].join('\n');
            const levelAndRankText = [
                `Nivel **${summoner.summonerLevel}**`,
                bestQueue
                    ? formatEmojiLabel(primaryTierEmoji, `**${formatRankCompact(bestQueue)}**`)
                    : '`Unranked`',
                primaryRole
                    ? formatEmojiLabel(primaryRoleEmoji, `**${primaryRole}**`)
                    : 'Funcao em leitura',
            ].join('\n');
            const recentGamesText = formatRecentChampStats(
                champStats,
                championEmojiMap,
                `**${wrRecent} WR** (${stats.wins}W/${stats.games - stats.wins}L)`
            );
            const masteryShortText = [
                formatEmojiLabel(mainChampEmoji, `**${mainChampDisplayName}**`),
                `Score **${formatNumber(totalMasteryPoints)}**`,
                `Campeoes **${totalMasteryScore}**`,
            ].join('\n');
            const signalsText = [
                `Visao **${avgVision}**`,
                `Gold **${avgGold}**`,
                `Pool **${Object.keys(champStats).length || 0}** picks`,
            ].join('\n');

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 1: PERFIL REWORKADO
            // ══════════════════════════════════════════════════════════════════
            const embed1 = new EmbedBuilder()
                .setAuthor({
                    name: `${account.gameName}#${account.tagLine} • ${regiao.toUpperCase()}`,
                    iconURL: profileIconUrl
                })
                .setColor(corTier)
                .setTitle(`${account.gameName}'s Profile`)
                .setDescription(embedHeaderText)
                .setThumbnail(mainChampSquareUrl)
                .setImage(topChampName ? getChampionSplashUrl(topChampName) : null)
                .addFields(
                    { name: formatEmojiLabel(primaryTierEmoji, 'Level and Rank'), value: levelAndRankText, inline: true },
                    { name: formatEmojiLabel(mainChampEmoji, 'Top Champions'), value: formatMasteryTopLines(masteryTop5, champsMap, championEmojiMap), inline: true },
                    { name: 'Recent Games', value: recentGamesText, inline: true },
                    { name: formatEmojiLabel(soloTierEmoji, 'Ranked Solo/Duo'), value: formatQueuePanel(rankSolo, soloTierEmoji), inline: true },
                    { name: formatEmojiLabel(flexTierEmoji, 'Ranked Flex'), value: formatQueuePanel(rankFlex, flexTierEmoji), inline: true },
                    { name: formatEmojiLabel(championEmojiMap.get(matchDetails[0]?.participant?.championName), 'Last Game'), value: formatRecentGameCard(matchDetails[0], championEmojiMap.get(matchDetails[0]?.participant?.championName)), inline: true },
                    { name: formatEmojiLabel(championEmojiMap.get(liveChampionName) || primaryRoleEmoji, 'Current Game'), value: formatCurrentGameCard(liveGame, liveParticipant, championEmojiMap.get(liveChampionName)), inline: true },
                    { name: formatEmojiLabel(mainChampEmoji, 'Mastery Snapshot'), value: masteryShortText, inline: true },
                    { name: formatEmojiLabel(arenaTierEmoji, 'Arena / Signals'), value: `${formatQueuePanel(rankArena, arenaTierEmoji)}\n${signalsText}`, inline: true },
                )
                .setFooter({ text: `Perfil 1/5 • Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, iconURL: rankMiniIconUrl || profileIconUrl });

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 2: ESTATÍSTICAS
            // ══════════════════════════════════════════════════════════════════
            const lpProgress = mainRank ? progressBar(mainRank.leaguePoints, 100, 12) : progressBar(0, 100, 12);
            const wrSolo = rankSolo ? getWinRate(rankSolo.wins, rankSolo.losses) : { wr: 0, text: 'N/A' };
            const wrFlex = rankFlex ? getWinRate(rankFlex.wins, rankFlex.losses) : { wr: 0, text: 'N/A' };

            const embed2 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: rankMiniIconUrl || profileIconUrl })
                .setTitle('Estatísticas Detalhadas')
                .setColor(corTier)
                .setThumbnail(getRankEmblemUrl(tierPrincipal))
                .addFields(
                    {
                        name: 'Ranqueada Solo/Duo',
                        value: rankSolo
                            ? `${formatRankCompact(rankSolo)}\n` +
                              `LP: \`${lpProgress}\` **${rankSolo.leaguePoints}**/100\n` +
                              `**${rankSolo.wins + rankSolo.losses}** partidas • **${wrSolo.text}** WR`
                            : '`Sem dados ranqueados`',
                        inline: false
                    },
                    {
                        name: 'Ranqueada Flex',
                        value: rankFlex
                            ? `${formatRankCompact(rankFlex)}\n**${rankFlex.wins + rankFlex.losses}** partidas • **${wrFlex.text}** WR`
                            : '`Sem dados de flex`',
                        inline: true
                    },
                    {
                        name: `Ultimas ${stats.games} Partidas`,
                        value: stats.games > 0
                            ? `**${stats.wins}V/${stats.games - stats.wins}D** (${wrRecent})\nKDA: **${avgKDA}**`
                            : '`Sem partidas recentes`',
                        inline: true
                    },
                    { name: '\u200b', value: '─'.repeat(25), inline: false },
                    { name: 'CS/Game', value: `**${avgCS}**`, inline: true },
                    { name: 'Dano/Game', value: `**${avgDamage}**`, inline: true },
                    { name: 'Ouro/Game', value: `**${avgGold}**`, inline: true },
                    { name: 'Visao/Game', value: `**${avgVision}**`, inline: true },
                    { name: 'Duracao Media', value: `**${avgDuration}** min`, inline: true },
                    { name: 'Maestria Total', value: `**${formatNumber(totalMasteryPoints)}** pts`, inline: true },
                )
                .setFooter({ text: 'Página 2/5 • Estatísticas', iconURL: primaryRoleIconUrl || profileIconUrl });

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 3: TOP CAMPEÕES (MAESTRIA)
            // ══════════════════════════════════════════════════════════════════
            function formatMasteryNameCol(list) {
                if (!list.length) return '`Sem dados`';
                return list.map((entry, index) => {
                    const champ = champsMap[entry.championId];
                    const champId = champ?.id || null;
                    const champName = champ?.name || `#${entry.championId}`;
                    const champEmoji = championEmojiMap.get(champId) || '';
                    return `${index + 1}. ${formatEmojiLabel(champEmoji, `**${champName}**`)} • M${entry.championLevel}\n${formatNumber(entry.championPoints)} pts`;
                }).join('\n');
            }

            function formatMasteryLastPlayedCol(list) {
                if (!list.length) return '`Sem dados`';
                return list.map((entry) => entry.lastPlayTime ? timeAgo(entry.lastPlayTime) : 'Sem leitura').join('\n');
            }

            function formatMasteryChestCol(list) {
                if (!list.length) return '`Sem dados`';
                return list.map((entry) => entry.chestGranted ? 'Chest claimed' : 'Chest unclaimed').join('\n');
            }

            const embed3 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: mainChampSquareUrl })
                .setTitle('Mastery Stats')
                .setDescription(`**${totalMasteryScore}** campeoes com maestria • **${formatNumber(totalMasteryPoints)}** pontos totais`)
                .setColor(corTier)
                .setThumbnail(mainChampSquareUrl)
                .addFields(
                    { name: 'Champion & Mastery', value: formatMasteryNameCol(masteryPreview), inline: true },
                    { name: 'Last Played', value: formatMasteryLastPlayedCol(masteryPreview), inline: true },
                    { name: 'Chest Granted', value: formatMasteryChestCol(masteryPreview), inline: true },
                )
                .setFooter({ text: 'Página 3/5 • Maestria de Campeões' });

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 4: HISTÓRICO DE PARTIDAS
            // ══════════════════════════════════════════════════════════════════
            let matchHistoryText = '`Nenhuma partida encontrada.`';
            if (matchDetails.length) {
                const lines = matchDetails.slice(0, 5).map((md) => {
                    const p = md.participant;
                    const m = md.match;
                    const kda = calcKDA(p.kills, p.deaths, p.assists);
                    const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
                    const durSecs = m.info.gameDuration || 0;
                    const durMin = Math.max(1, Math.floor(durSecs / 60));
                    const csPerMin = (cs / durMin).toFixed(1);
                    const when = timeAgo(m.info.gameCreation);
                    const gold = formatNumber(p.goldEarned || 0);
                    const vision = p.visionScore || 0;

                    const teamKills = m.info.participants
                        .filter(pl => pl.teamId === p.teamId)
                        .reduce((sum, pl) => sum + (pl.kills || 0), 0);
                    const kp = teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;

                    const modeMap = { 'CLASSIC': 'Ranked SR', 'ARAM': 'ARAM', 'CHERRY': 'Arena' };
                    const mode = modeMap[m.info.gameMode] || m.info.gameMode;
                    const resultLabel = p.win ? '🏆 **VITÓRIA**' : '💀 **DERROTA**';

                    let multiKill = '';
                    if (p.pentaKills) multiKill = ' **• PENTA!**';
                    else if (p.quadraKills) multiKill = ' **• QUADRA**';
                    else if (p.tripleKills) multiKill = ' **• TRIPLA**';

                    const champEmoji = championEmojiMap.get(p.championName) || '';
                    return [
                        `${resultLabel} | ${mode} | ${formatDuration(durSecs)} | ${when}`,
                        `${formatEmojiLabel(champEmoji, `**${p.championName}**`)}${multiKill} • ${p.kills}/${p.deaths}/${p.assists} (${kda} KDA · ${kp}% KP)`,
                        `> CS ${cs} (${csPerMin}/min) · 🔭 ${vision} · 💰 ${gold}`,
                    ].join('\n');
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

            const embed4 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: mainChampSquareUrl })
                .setTitle('Historico de Partidas')
                .setDescription(matchHistoryText)
                .setColor(corTier)
                .setThumbnail(mainChampSquareUrl)
                .addFields(
                    { name: 'Mais Jogados (Recente)', value: topPlayedChamps, inline: false },
                )
                .setFooter({ text: 'Página 4/5 • Histórico' });

            // ══════════════════════════════════════════════════════════════════
            // PÁGINA 5: DESAFIOS
            // ══════════════════════════════════════════════════════════════════
            const CHALLENGE_CATEGORIES = {
                'IMAGINATION': { name: 'Imaginacao' },
                'EXPERTISE':   { name: 'Pericia' },
                'TEAMWORK':    { name: 'Equipe' },
                'COLLECTION':  { name: 'Colecao' },
                'VETERANCY':   { name: 'Veterania' },
            };

            let categoryText = '';
            for (const [cat, data] of Object.entries(categoryLevels)) {
                const catInfo = CHALLENGE_CATEGORIES[cat];
                if (catInfo && data.level) {
                    categoryText += `**${catInfo.name}**: ${data.level}\n`;
                }
            }

            const totalChallengePoints = challengesData?.totalPoints?.current || 0;

            const embed5 = new EmbedBuilder()
                .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: rankMiniIconUrl || profileIconUrl })
                .setTitle('Desafios & Conquistas')
                .setColor(corTier)
                .setThumbnail(getRankEmblemUrl(tierPrincipal))
                .addFields(
                    { name: 'Pontuacao Total', value: `**${formatNumber(totalChallengePoints)}** pontos`, inline: true },
                    { name: 'Categorias', value: categoryText || '`Sem dados`', inline: true },
                )
                .setFooter({ text: 'Página 5/5 • Desafios', iconURL: primaryRoleIconUrl || profileIconUrl });

            // ══════════════════════════════════════════════════════════════════
            // NAVEGAÇÃO POR BOTÕES DE FUNÇÃO
            // ══════════════════════════════════════════════════════════════════
            const linksRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('OP.GG').setURL(`https://op.gg/summoners/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
                new ButtonBuilder().setLabel('U.GG').setURL(`https://u.gg/lol/profile/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
                new ButtonBuilder().setLabel('Porofessor').setURL(`https://porofessor.gg/live/${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`).setStyle(ButtonStyle.Link),
            );

            const sessionId = interaction.id;
            const pageButtonsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`lol_profile_${sessionId}`).setLabel('Perfil').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`lol_stats_${sessionId}`).setLabel('Estatísticas').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`lol_mastery_${sessionId}`).setLabel('Maestria').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`lol_history_${sessionId}`).setLabel('Histórico').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`lol_challenges_${sessionId}`).setLabel('Desafios').setStyle(ButtonStyle.Secondary),
            );

            const pages = {
                profile: embed1,
                stats: embed2,
                mastery: embed3,
                history: embed4,
                challenges: embed5,
            };

            await interaction.editReply({
                content: formatResponse(''),
                embeds: [embed1],
                components: [pageButtonsRow, linksRow],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.customId.endsWith(sessionId) && i.user.id === interaction.user.id,
                time: 180000,
            });

            collector.on('collect', async i => {
                const pageKey = i.customId
                    .replace(`lol_profile_${sessionId}`, 'profile')
                    .replace(`lol_stats_${sessionId}`, 'stats')
                    .replace(`lol_mastery_${sessionId}`, 'mastery')
                    .replace(`lol_history_${sessionId}`, 'history')
                    .replace(`lol_challenges_${sessionId}`, 'challenges');

                const nextEmbed = pages[pageKey];
                if (!nextEmbed) return;

                await i.update({
                    embeds: [nextEmbed],
                    components: [pageButtonsRow, linksRow],
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

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');
const { toggleTracker, getTracker } = require('../../utils/lol-dm-tracker');
const db = require('../../utils/db');
const {
    getLatestDataDragonVersion,
    getProfileIconUrl,
} = require('../../utils/lol-assets');
const {
    rememberKnownPlayer,
    indexMatchParticipants,
    pickBestRankText,
} = require('../../utils/lol-player-index');

const RIOT_KEY = process.env.RIOT_API_KEY || '';

const TIER_DATA = {
    IRON: { hex: '#5C5C5C', name: 'Ferro' },
    BRONZE: { hex: '#8C5A3C', name: 'Bronze' },
    SILVER: { hex: '#7B909A', name: 'Prata' },
    GOLD: { hex: '#C89B3C', name: 'Ouro' },
    PLATINUM: { hex: '#4E9996', name: 'Platina' },
    EMERALD: { hex: '#009B5E', name: 'Esmeralda' },
    DIAMOND: { hex: '#576BCE', name: 'Diamante' },
    MASTER: { hex: '#9D48E0', name: 'Mestre' },
    GRANDMASTER: { hex: '#CD4545', name: 'Grao-Mestre' },
    CHALLENGER: { hex: '#F4C874', name: 'Desafiante' },
    UNRANKED: { hex: '#3C3C41', name: 'Sem Rank' },
};

const TIER_EMOJI = {
    IRON: '🔩',
    BRONZE: '🥉',
    SILVER: '🥈',
    GOLD: '🥇',
    PLATINUM: '💎',
    EMERALD: '💚',
    DIAMOND: '💠',
    MASTER: '👑',
    GRANDMASTER: '🔥',
    CHALLENGER: '🏆',
    UNRANKED: '❓',
};

const POSITION_LABELS = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'ADC',
    UTILITY: 'Support',
};

function getRouting(regiao) {
    if (['br1', 'la1', 'la2', 'na1', 'oc1'].includes(regiao)) return 'americas';
    if (['kr', 'jp1'].includes(regiao)) return 'asia';
    if (['ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(regiao)) return 'sea';
    return 'europe';
}

function calcKDA(kills, deaths, assists) {
    return deaths === 0 ? 'Perfect' : ((kills + assists) / Math.max(1, deaths)).toFixed(2);
}

function formatNumber(value) {
    const n = Number(value || 0);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(Math.round(n));
}

function timeAgo(timestamp) {
    const diff = Date.now() - Number(timestamp || 0);
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atras`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atras`;
    return `${Math.floor(hours / 24)}d atras`;
}

function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
    const minutes = Math.floor(totalSeconds / 60);
    const remaining = totalSeconds % 60;
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function getQueueLabel(queueId, gameMode) {
    const queueMap = {
        420: 'Ranqueada Solo/Duo',
        440: 'Ranqueada Flex',
        450: 'ARAM',
        400: 'Normal Draft',
        430: 'Normal Blind',
        700: 'Clash ARAM',
        1700: 'Arena',
    };
    return queueMap[queueId] || gameMode || 'Partida';
}

function getResultEmoji(win) {
    return win ? '🟢' : '🔴';
}

function getTierColor(rank) {
    return TIER_DATA[rank?.tier || 'UNRANKED']?.hex || '#3C3C41';
}

function getTierLabel(rank) {
    if (!rank) return '❓ Sem rank';
    const emoji = TIER_EMOJI[rank.tier] || '❓';
    const tierName = TIER_DATA[rank.tier]?.name || rank.tier;
    return `${emoji} ${tierName} ${rank.rank} • ${rank.leaguePoints} LP`;
}

function getWinRateText(wins, losses) {
    const total = Number(wins || 0) + Number(losses || 0);
    if (total <= 0) return '0%';
    return `${((Number(wins || 0) / total) * 100).toFixed(1)}%`;
}

function safeChampionName(championId, champsByNumericId) {
    return champsByNumericId[String(championId)]?.name || `#${championId}`;
}

function buildMatchLine(match) {
    const { participant, info } = match;
    const cs = Number(participant.totalMinionsKilled || 0) + Number(participant.neutralMinionsKilled || 0);
    const kda = calcKDA(participant.kills, participant.deaths, participant.assists);
    return [
        `${getResultEmoji(participant.win)} **${participant.championName}** • ${participant.kills}/${participant.deaths}/${participant.assists} (${kda})`,
        `> ${getQueueLabel(info.queueId, info.gameMode)} • ${Math.floor((info.gameDuration || 0) / 60)}m • ${cs} CS • ${timeAgo(info.gameCreation)}`,
    ].join('\n');
}

function buildLiveSummary(game, puuid, champsByNumericId) {
    const me = game.participants.find((player) => player.puuid === puuid);
    const myChampion = me ? safeChampionName(me.championId, champsByNumericId) : 'Desconhecido';
    const blueTeam = game.participants
        .filter((player) => player.teamId === 100)
        .map((player) => `${player.puuid === puuid ? '➤ ' : ''}${safeChampionName(player.championId, champsByNumericId)} — ${player.riotId || 'Jogador'}`)
        .join('\n');
    const redTeam = game.participants
        .filter((player) => player.teamId === 200)
        .map((player) => `${player.puuid === puuid ? '➤ ' : ''}${safeChampionName(player.championId, champsByNumericId)} — ${player.riotId || 'Jogador'}`)
        .join('\n');

    return {
        me,
        myChampion,
        blueTeam: blueTeam || 'Sem dados',
        redTeam: redTeam || 'Sem dados',
    };
}

function summarizeRecentStats(matches) {
    const summary = {
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        cs: 0,
        damage: 0,
        vision: 0,
        lanes: {},
        champions: {},
    };

    for (const match of matches) {
        const { participant } = match;
        if (participant.win) summary.wins += 1;
        else summary.losses += 1;

        summary.kills += Number(participant.kills || 0);
        summary.deaths += Number(participant.deaths || 0);
        summary.assists += Number(participant.assists || 0);
        summary.cs += Number(participant.totalMinionsKilled || 0) + Number(participant.neutralMinionsKilled || 0);
        summary.damage += Number(participant.totalDamageDealtToChampions || 0);
        summary.vision += Number(participant.visionScore || 0);

        const lane = participant.teamPosition || participant.lane || 'UNKNOWN';
        summary.lanes[lane] = (summary.lanes[lane] || 0) + 1;

        if (!summary.champions[participant.championName]) {
            summary.champions[participant.championName] = {
                games: 0,
                wins: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
            };
        }

        summary.champions[participant.championName].games += 1;
        if (participant.win) summary.champions[participant.championName].wins += 1;
        summary.champions[participant.championName].kills += Number(participant.kills || 0);
        summary.champions[participant.championName].deaths += Number(participant.deaths || 0);
        summary.champions[participant.championName].assists += Number(participant.assists || 0);
    }

    return summary;
}

function getBestLane(lanes) {
    const sorted = Object.entries(lanes)
        .filter(([lane]) => lane && lane !== 'NONE' && lane !== 'INVALID' && lane !== 'UNKNOWN')
        .sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return 'Nao deu para cravar lane principal nas ultimas partidas.';
    const [lane, count] = sorted[0];
    return `${POSITION_LABELS[lane] || lane} • ${count} partida${count === 1 ? '' : 's'}`;
}

function buildChampionPerformance(summary) {
    const champs = Object.entries(summary.champions)
        .sort((a, b) => b[1].games - a[1].games)
        .slice(0, 5);

    if (!champs.length) return '`Sem partidas suficientes.`';

    return champs.map(([name, stats], index) => {
        const winRate = ((stats.wins / Math.max(1, stats.games)) * 100).toFixed(0);
        const kda = calcKDA(stats.kills / stats.games, stats.deaths / stats.games, stats.assists / stats.games);
        return `${index + 1}. **${name}** • ${stats.games}p • ${winRate}% WR • ${kda} KDA`;
    }).join('\n');
}

function buildMasteryLines(masteryEntries, champsByNumericId) {
    if (!masteryEntries.length) return '`Sem maestrias capturadas.`';
    return masteryEntries.slice(0, 5).map((entry, index) => {
        const champion = champsByNumericId[String(entry.championId)];
        const name = champion?.name || `#${entry.championId}`;
        return `${index + 1}. **${name}** • Nvl ${entry.championLevel} • ${formatNumber(entry.championPoints)} pts`;
    }).join('\n');
}

function buildHeader(account, regiao, rank, summoner, patchVersion) {
    return `${account.gameName}#${account.tagLine} • ${regiao.toUpperCase()} • ${getTierLabel(rank)} • Nivel ${summoner.summonerLevel} • Patch ${patchVersion}`;
}

function buildCurrentEmbed(context) {
    const { account, regiao, rankSolo, summoner, patchVersion, liveGame, latestMatch, liveSummary } = context;
    const embed = new EmbedBuilder()
        .setColor(getTierColor(rankSolo))
        .setAuthor({ name: 'History LoL • Agora', iconURL: context.profileIconUrl })
        .setTitle(`${account.gameName}#${account.tagLine}`)
        .setThumbnail(context.profileIconUrl)
        .setFooter({ text: buildHeader(account, regiao, rankSolo, summoner, patchVersion) })
        .setTimestamp();

    if (liveGame && liveSummary) {
        embed
            .setDescription([
                `**Status:** 🔴 Partida em andamento`,
                `**Fila:** ${getQueueLabel(liveGame.gameQueueConfigId, liveGame.gameMode)}`,
                `**Duracao ao vivo:** ${formatDuration(Math.floor((Date.now() - liveGame.gameStartTime) / 1000))}`,
                `**Campeao atual:** ${liveSummary.myChampion}`,
            ].join('\n'))
            .addFields(
                { name: 'Time Azul', value: liveSummary.blueTeam.slice(0, 1024), inline: true },
                { name: 'Time Vermelho', value: liveSummary.redTeam.slice(0, 1024), inline: true },
            );
        return embed;
    }

    if (latestMatch) {
        const { participant, info } = latestMatch;
        const cs = Number(participant.totalMinionsKilled || 0) + Number(participant.neutralMinionsKilled || 0);
        const kda = calcKDA(participant.kills, participant.deaths, participant.assists);
        embed
            .setDescription([
                `**Status:** ${participant.win ? '🟢 Ultima partida foi vitoria' : '🔴 Ultima partida foi derrota'}`,
                `**Fila:** ${getQueueLabel(info.queueId, info.gameMode)}`,
                `**Campeao:** ${participant.championName}`,
                `**Resultado:** ${participant.kills}/${participant.deaths}/${participant.assists} • ${kda} KDA`,
            ].join('\n'))
            .addFields(
                { name: 'Farm e visao', value: `**${cs} CS** • **${participant.visionScore || 0}** de visao`, inline: true },
                { name: 'Dano e ouro', value: `**${formatNumber(participant.totalDamageDealtToChampions || 0)}** dano • **${formatNumber(participant.goldEarned || 0)}** gold`, inline: true },
                { name: 'Quando rolou', value: `${timeAgo(info.gameCreation)} • ${Math.floor((info.gameDuration || 0) / 60)} min`, inline: false },
            );
        return embed;
    }

    embed.setDescription('Nao achei partida ao vivo nem historico recente suficiente para montar esse bloco agora.');
    return embed;
}

function buildHistoryEmbed(context) {
    const { account, regiao, rankSolo, summoner, patchVersion, matchDetails } = context;
    const historyText = matchDetails.length
        ? matchDetails.slice(0, 10).map((match, index) => `**${index + 1}.** ${buildMatchLine(match)}`).join('\n\n')
        : '`Nenhuma partida encontrada.`';

    return new EmbedBuilder()
        .setColor(getTierColor(rankSolo))
        .setAuthor({ name: 'History LoL • Ultimas 10', iconURL: context.profileIconUrl })
        .setTitle(`${account.gameName}#${account.tagLine}`)
        .setThumbnail(context.profileIconUrl)
        .setDescription(historyText.slice(0, 4096))
        .setFooter({ text: buildHeader(account, regiao, rankSolo, summoner, patchVersion) })
        .setTimestamp();
}

function buildAnalysisEmbed(context) {
    const { account, regiao, rankSolo, rankFlex, summoner, patchVersion, masteryList, recentSummary, averageLp } = context;
    const recentGames = recentSummary.wins + recentSummary.losses;
    const recentWinRate = recentGames > 0 ? `${((recentSummary.wins / recentGames) * 100).toFixed(1)}%` : '0%';
    const avgKda = recentGames > 0
        ? calcKDA(recentSummary.kills / recentGames, recentSummary.deaths / recentGames, recentSummary.assists / recentGames)
        : '0.00';

    return new EmbedBuilder()
        .setColor(getTierColor(rankSolo))
        .setAuthor({ name: 'History LoL • Analise de Perfil', iconURL: context.profileIconUrl })
        .setTitle(`${account.gameName}#${account.tagLine}`)
        .setThumbnail(context.profileIconUrl)
        .setDescription([
            `**Media de PDL atual:** ${averageLp}`,
            `**Solo/Duo:** ${rankSolo ? `${rankSolo.wins}V / ${rankSolo.losses}D • ${getWinRateText(rankSolo.wins, rankSolo.losses)} WR` : 'Sem dados ranqueados'}`,
            `**Flex:** ${rankFlex ? `${rankFlex.wins}V / ${rankFlex.losses}D • ${getWinRateText(rankFlex.wins, rankFlex.losses)} WR` : 'Sem dados de flex'}`,
            `**Recorte recente:** ${recentSummary.wins}V / ${recentSummary.losses}D • ${recentWinRate} WR • ${avgKda} KDA`,
            `**Melhor lane recente:** ${getBestLane(recentSummary.lanes)}`,
        ].join('\n'))
        .addFields(
            {
                name: 'Melhores bonecos no recorte',
                value: buildChampionPerformance(recentSummary),
                inline: false,
            },
            {
                name: 'Top 5 maiores maestrias',
                value: buildMasteryLines(masteryList, context.champsByNumericId),
                inline: false,
            },
            {
                name: 'Top mundial de maestria',
                value: 'A Riot API nao expoe colocacao global oficial de maestria. Para isso, a gente precisaria integrar uma fonte externa separada.',
                inline: false,
            },
        )
        .setFooter({ text: buildHeader(account, regiao, rankSolo, summoner, patchVersion) })
        .setTimestamp();
}

function buildComponentRows(sessionId, baseSummonerUrl, disableInteractive = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`historylol_current_${sessionId}`).setLabel('Agora').setStyle(ButtonStyle.Success).setDisabled(disableInteractive),
            new ButtonBuilder().setCustomId(`historylol_matches_${sessionId}`).setLabel('Historico').setStyle(ButtonStyle.Primary).setDisabled(disableInteractive),
            new ButtonBuilder().setCustomId(`historylol_analysis_${sessionId}`).setLabel('Analise').setStyle(ButtonStyle.Secondary).setDisabled(disableInteractive),
            new ButtonBuilder().setCustomId(`historylol_track_${sessionId}`).setLabel('Tracker DM').setStyle(ButtonStyle.Danger).setDisabled(disableInteractive),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('OP.GG').setStyle(ButtonStyle.Link).setURL(`https://op.gg/summoners/${baseSummonerUrl}`),
            new ButtonBuilder().setLabel('U.GG').setStyle(ButtonStyle.Link).setURL(`https://u.gg/lol/profile/${baseSummonerUrl}`),
            new ButtonBuilder().setLabel('Porofessor').setStyle(ButtonStyle.Link).setURL(`https://porofessor.gg/live/${baseSummonerUrl}`),
        ),
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('historylol')
        .setDescription('Monta o painel vivo de historico, partida atual e analise de um jogador de LoL.')
        .addStringOption((option) =>
            option
                .setName('nick')
                .setDescription('Riot ID com tag. Exemplo: Faker#KR1')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('servidor')
                .setDescription('Servidor do invocador')
                .setRequired(false)
                .addChoices(
                    { name: 'Brasil (BR1)', value: 'br1' },
                    { name: 'NA (NA1)', value: 'na1' },
                    { name: 'EUW (EUW1)', value: 'euw1' },
                    { name: 'EUNE (EUN1)', value: 'eun1' },
                    { name: 'Korea (KR)', value: 'kr' },
                    { name: 'LAN (LA1)', value: 'la1' },
                    { name: 'LAS (LA2)', value: 'la2' },
                    { name: 'Japan (JP1)', value: 'jp1' },
                    { name: 'OCE (OC1)', value: 'oc1' }
                )
        ),
    aliases: ['hlol', 'matchhistorylol'],
    detailedDescription: 'Painel unico de League of Legends com 3 botoes: agora, ultimas 10 partidas e analise do perfil com rank, picks recentes e maestrias.',
    usage: '`/historylol nick:Faker#KR1 servidor:br1`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        await interaction.deferReply();

        if (!RIOT_KEY) {
            return interaction.editReply({
                content: formatResponse('❌ **RIOT_API_KEY** nao configurada.\n> Gera em https://developer.riotgames.com e reinicia o bot.'),
            });
        }

        const nickInput = interaction.options.getString('nick', true).trim();
        const regiao = interaction.options.getString('servidor') || 'br1';
        const routing = getRouting(regiao);
        const riotHeaders = { headers: { 'X-Riot-Token': RIOT_KEY } };
        const [gameName, tagLine] = nickInput.includes('#')
            ? nickInput.split('#')
            : [nickInput, regiao === 'br1' ? 'BR1' : regiao.toUpperCase()];

        try {
            const [patchVersion, accountRes] = await Promise.all([
                getLatestDataDragonVersion(),
                axios.get(
                    `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
                    riotHeaders
                ),
            ]);

            const account = accountRes.data;
            const puuid = account.puuid;

            const [summonerRes, ddRes] = await Promise.allSettled([
                axios.get(`https://${regiao}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, riotHeaders),
                axios.get(`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/data/pt_BR/champion.json`),
            ]);

            if (summonerRes.status !== 'fulfilled') {
                throw summonerRes.reason;
            }

            const summoner = summonerRes.value.data;
            const profileIconUrl = getProfileIconUrl(patchVersion, summoner.profileIconId);

            const [rankRes, masteryRes, matchIdsRes, liveRes] = await Promise.allSettled([
                axios.get(`https://${regiao}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=5`, riotHeaders),
                axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10`, riotHeaders),
                axios.get(`https://${regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${summoner.id}`, riotHeaders),
            ]);

            const ranks = rankRes.status === 'fulfilled' ? rankRes.value.data : [];
            const rankSolo = ranks.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') || null;
            const rankFlex = ranks.find((entry) => entry.queueType === 'RANKED_FLEX_SR') || null;
            const rankedEntries = [rankSolo, rankFlex].filter(Boolean);
            const averageLp = rankedEntries.length
                ? `${(rankedEntries.reduce((sum, entry) => sum + Number(entry.leaguePoints || 0), 0) / rankedEntries.length).toFixed(1)} LP`
                : 'Sem LP oficial disponivel';

            rememberKnownPlayer({
                gameName: account.gameName,
                tagLine: account.tagLine,
                regiao,
                puuid,
                summonerId: summoner.id,
                level: summoner.summonerLevel,
                rankText: pickBestRankText([rankSolo, rankFlex].filter(Boolean)),
                iconUrl: profileIconUrl,
            });

            const champsByNumericId = {};
            if (ddRes.status === 'fulfilled') {
                for (const champion of Object.values(ddRes.value.data.data)) {
                    champsByNumericId[String(champion.key)] = champion;
                }
            }

            const matchIds = matchIdsRes.status === 'fulfilled' ? matchIdsRes.value.data : [];
            const matchResults = await Promise.all(
                matchIds.map((matchId) =>
                    axios.get(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`, riotHeaders).catch(() => null)
                )
            );

            const matchDetails = matchResults
                .filter(Boolean)
                .map((response) => {
                    const info = response.data.info;
                    const participant = info.participants.find((entry) => entry.puuid === puuid);
                    if (!participant) return null;
                    return {
                        id: response.data.metadata?.matchId,
                        info,
                        participant,
                    };
                })
                .filter(Boolean);

            indexMatchParticipants(matchDetails.map((entry) => ({ info: entry.info })), regiao);

            const liveGame = liveRes.status === 'fulfilled' ? liveRes.value.data : null;
            const liveSummary = liveGame ? buildLiveSummary(liveGame, puuid, champsByNumericId) : null;
            const latestMatch = matchDetails[0] || null;
            const masteryList = masteryRes.status === 'fulfilled' ? masteryRes.value.data : [];
            const recentSummary = summarizeRecentStats(matchDetails);

            const context = {
                account,
                regiao,
                patchVersion,
                summoner,
                rankSolo,
                rankFlex,
                profileIconUrl,
                champsByNumericId,
                liveGame,
                liveSummary,
                latestMatch,
                matchDetails,
                masteryList,
                recentSummary,
                averageLp,
            };

            const baseSummonerUrl = `${regiao}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
            const sessionId = `${interaction.id}_${Date.now()}`;
            const rows = buildComponentRows(sessionId, baseSummonerUrl);

            const message = await interaction.editReply({
                embeds: [buildCurrentEmbed(context)],
                components: rows,
            });

            const collector = message.createMessageComponentCollector({
                time: 180000,
                filter: (componentInteraction) =>
                    componentInteraction.user.id === interaction.user.id
                    && componentInteraction.customId.endsWith(sessionId),
            });

            collector.on('collect', async (componentInteraction) => {
                let embed = null;

                if (componentInteraction.customId.startsWith('historylol_current_')) {
                    embed = buildCurrentEmbed(context);
                } else if (componentInteraction.customId.startsWith('historylol_matches_')) {
                    embed = buildHistoryEmbed(context);
                } else if (componentInteraction.customId.startsWith('historylol_analysis_')) {
                    embed = buildAnalysisEmbed(context);
                } else if (componentInteraction.customId.startsWith('historylol_track_')) {
                    const existing = getTracker(componentInteraction.user.id, regiao, gameName, tagLine);
                    if (existing) {
                        toggleTracker({
                            userId: componentInteraction.user.id,
                            riotId: `${account.gameName}#${account.tagLine}`,
                            gameName,
                            tagLine,
                            regiao,
                            puuid,
                            summonerId: summoner.id,
                            profileIconUrl,
                        });
                        return componentInteraction.reply({
                            content: 'Tracker privado de LoL desligado. Nao vou mais te chamar por DM para esse jogador.',
                            flags: ['Ephemeral'],
                        }).catch(() => null);
                    }

                    toggleTracker({
                        userId: componentInteraction.user.id,
                        riotId: `${account.gameName}#${account.tagLine}`,
                        gameName,
                        tagLine,
                        regiao,
                        puuid,
                        summonerId: summoner.id,
                        profileIconUrl,
                    });
                    return componentInteraction.reply({
                        content: 'Tracker privado ativado. A partir de agora eu te aviso por DM quando essa conta entrar e sair de partida.',
                        flags: ['Ephemeral'],
                    }).catch(() => null);
                }

                if (!embed) {
                    return componentInteraction.deferUpdate().catch(() => null);
                }

                await componentInteraction.update({
                    embeds: [embed],
                    components: rows,
                }).catch(() => null);
            });

            collector.on('end', async () => {
                await interaction.editReply({ components: buildComponentRows(sessionId, baseSummonerUrl, true) }).catch(() => null);
            });
        } catch (error) {
            if (error.response?.status === 401) {
                return interaction.editReply({
                    content: formatResponse('❌ **API Key expirada (401)**\n> A key da Riot expira rapido. Gera outra no portal e reinicia o bot.'),
                });
            }

            if (error.response?.status === 403) {
                return interaction.editReply({
                    content: formatResponse('❌ **API Key invalida (403)**\n> Confere a key da Riot no `.env`.'),
                });
            }

            if (error.response?.status === 404) {
                return interaction.editReply({
                    content: formatResponse(`❌ Nao achei o jogador **${nickInput}** em **${regiao.toUpperCase()}**.`),
                });
            }

            if (error.response?.status === 429) {
                return interaction.editReply({
                    content: formatResponse('❌ **Rate limit atingido**\n> A Riot fechou a torneira por alguns instantes. Tenta de novo ja ja.'),
                });
            }

            console.error('[HISTORY LOL]', error);
            return interaction.editReply({
                content: formatResponse('❌ Deu ruim ao montar o painel de history do LoL.'),
            });
        }
    },
};

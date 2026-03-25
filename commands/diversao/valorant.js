const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

// Henrik Dev API — gratuita, sem aprovação da Riot necessária
const HENRIK_KEY = process.env.HENRIK_API_KEY || '';

const RANK_CORES = {
    'Iron':         '#5C3D1E', 'Bronze':  '#7D4E1E', 'Silver': '#909090',
    'Gold':         '#F0B232', 'Platinum':'#00BCD4', 'Diamond':'#7C4DFF',
    'Ascendant':    '#00C853', 'Immortal':'#E53935', 'Radiant':'#FFD700',
    'Unranked':     '#5865F2',
};

function getRankTier(rankName) {
    if (!rankName) return { emoji: '❓', cor: '#5865F2' };
    const tier = rankName.split(' ')[0];
    const cor = RANK_CORES[tier] || '#5865F2';
    const emojis = {
        'Iron':'🔩','Bronze':'🥉','Silver':'🥈','Gold':'🥇','Platinum':'💎',
        'Diamond':'💠','Ascendant':'🌟','Immortal':'🔥','Radiant':'☀️','Unranked':'❓'
    };
    return { emoji: emojis[tier] || '❓', cor };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('valorant')
        .setDescription('🎯 Consulta perfil e estatísticas de Valorant')
        .addStringOption(opt =>
            opt.setName('nome').setDescription('Riot ID com tag (ex: Player#BR1)').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('regiao').setDescription('Região').setRequired(false)
                .addChoices(
                    { name: 'Brasil (BR)',   value: 'br'   },
                    { name: 'NA',           value: 'na'   },
                    { name: 'LATAM',        value: 'latam'},
                    { name: 'Europa (EU)',  value: 'eu'   },
                    { name: 'Ásia (AP)',    value: 'ap'   },
                    { name: 'Coreia (KR)', value: 'kr'   },
                )
        ),

    aliases: ['valorant', 'val', 'valo'],
    detailedDescription: 'Consulta perfil Valorant via Henrik Dev API. 3 páginas: Rank/MMR, Agentes Favoritos e Partidas Recentes. HENRIK_API_KEY opcional no .env para maior rate limit.',
    usage: '`/valorant [nome#tag] [regiao?]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();

        const nomeInput = interaction.options.getString('nome').trim();
        const regiao    = interaction.options.getString('regiao') || 'br';
        const [gameName, tagLine] = nomeInput.includes('#')
            ? nomeInput.split('#')
            : [nomeInput, 'BR1'];

        const headers = HENRIK_KEY ? { 'Authorization': HENRIK_KEY } : {};

        try {
            // ── Conta ──
            const accountRes = await axios.get(
                `https://api.henrikdev.xyz/valorant/v2/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
                { headers }
            );
            if (accountRes.data.status !== 200) {
                return interaction.editReply({ content: formatResponse(`❌ Jogador **${nomeInput}** não encontrado.`) });
            }
            const account = accountRes.data.data;

            // ── MMR e partidas em paralelo ──
            const [mmrRes, matchesRes] = await Promise.allSettled([
                axios.get(`https://api.henrikdev.xyz/valorant/v1/mmr/${regiao}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, { headers }),
                axios.get(`https://api.henrikdev.xyz/valorant/v3/matches/${regiao}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?size=5`, { headers }),
            ]);

            const mmr = mmrRes.status === 'fulfilled' ? mmrRes.value.data.data : null;
            const { emoji: rankEmoji, cor: rankCor } = getRankTier(mmr?.currenttierpatched);

            // ── Stats de partidas ──
            let agentesMap = {};
            let winrate = 'N/A';
            let kda_medio = 'N/A';
            let ultimasPartidasText = '> Nenhuma partida recente disponível.';
            let agentesText = '> Nenhum dado de agente disponível.';

            if (matchesRes.status === 'fulfilled' && matchesRes.value.data?.data?.length) {
                const partidas = matchesRes.value.data.data;
                let wins = 0, total = 0;
                let totalK = 0, totalD = 0, totalA = 0;

                const linhas = [];
                for (const m of partidas.slice(0, 5)) {
                    const me = m.players?.all_players?.find(p =>
                        p.name.toLowerCase() === gameName.toLowerCase() && p.tag.toLowerCase() === tagLine.toLowerCase()
                    );
                    if (!me) continue;

                    total++;
                    const vitoria = me.team === m.teams?.winner;
                    if (vitoria) wins++;

                    totalK += me.stats?.kills  || 0;
                    totalD += me.stats?.deaths || 0;
                    totalA += me.stats?.assists|| 0;

                    const agente = me.character || 'Desconhecido';
                    agentesMap[agente] = (agentesMap[agente] || 0) + 1;

                    const hs  = me.stats?.headshots || 0;
                    const bod = me.stats?.bodyshots || 0;
                    const hsPct = (hs + bod) > 0 ? `${((hs/(hs+bod))*100).toFixed(0)}% HS` : '';
                    const win_emoji = vitoria ? '✅' : '❌';
                    const mapa = m.metadata?.map || 'Mapa desconhecido';
                    const modo = m.metadata?.mode || '';
                    linhas.push(`${win_emoji} **${agente}** — ${me.stats?.kills}/${me.stats?.deaths}/${me.stats?.assists} ${hsPct ? `· ${hsPct}` : ''} · ${mapa} · ${modo}`);
                }

                if (total > 0) {
                    winrate  = `${((wins/total)*100).toFixed(1)}% (${wins}V/${total-wins}D)`;
                    const d  = totalD === 0 ? 1 : totalD;
                    kda_medio = ((totalK + totalA) / d).toFixed(2);
                }
                if (linhas.length) ultimasPartidasText = linhas.join('\n');

                // Top agentes
                const agentesOrdenados = Object.entries(agentesMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
                if (agentesOrdenados.length) {
                    agentesText = agentesOrdenados.map(([agent, count], i) =>
                        `**${i+1}. ${agent}** — ${count} partida${count > 1 ? 's' : ''}`
                    ).join('\n');
                }
            }

            const rank       = mmr?.currenttierpatched || 'Não Ranqueado';
            const rr         = mmr?.ranking_in_tier !== undefined ? `${mmr.ranking_in_tier} RR` : 'N/A';
            const nivel      = account.account_level || '?';
            const cardUrl    = account.card?.wide || account.card?.large || '';

            // ── Row de navegação ──
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('val_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('val_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('val_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setLabel('Tracker').setURL(`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(gameName)}%23${encodeURIComponent(tagLine)}/overview`).setStyle(ButtonStyle.Link),
            );

            // PÁGINA 1: RANK / MMR
            const embed1 = new EmbedBuilder()
                .setTitle(`🎯 ${account.name}#${account.tag}`)
                .setColor(rankCor)
                .setImage(cardUrl || null)
                .addFields(
                    { name: `${rankEmoji} Rank`,    value: `**${rank}**`,  inline: true  },
                    { name: '📍 RR',                value: `\`${rr}\``,    inline: true  },
                    { name: '🎮 Nível',             value: `**${nivel}**`, inline: true  },
                    { name: '📊 Winrate (5 partidas)', value: winrate,    inline: true  },
                    { name: '🔢 KDA Médio',          value: kda_medio,    inline: true  },
                )
                .setFooter({ text: `Página 1/3 • Valorant Ranked • Região: ${regiao.toUpperCase()}` })
                .setTimestamp();

            // PÁGINA 2: AGENTES
            const embed2 = new EmbedBuilder()
                .setTitle(`🦸 Agentes Favoritos: ${account.name}`)
                .setColor(rankCor)
                .setThumbnail(account.card?.small || '')
                .setDescription(agentesText)
                .setFooter({ text: `Página 2/3 • Top Agentes (últimas 5 partidas)` });

            // PÁGINA 3: PARTIDAS
            const embed3 = new EmbedBuilder()
                .setTitle(`📊 Partidas Recentes: ${account.name}`)
                .setColor(rankCor)
                .setThumbnail(account.card?.small || '')
                .setDescription(ultimasPartidasText)
                .setFooter({ text: `Página 3/3 • Últimas 5 partidas` });

            const embeds = [embed1, embed2, embed3];
            let pagAtual = 0;
            await interaction.editReply({ content: formatResponse(''), embeds: [embeds[0]], components: [row] });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.customId.startsWith('val_') && i.user.id === interaction.user.id,
                time: 90000
            });
            collector.on('collect', async i => {
                if (i.customId === 'val_prev')     pagAtual = pagAtual > 0 ? pagAtual - 1 : embeds.length - 1;
                else if (i.customId === 'val_next') pagAtual = pagAtual < embeds.length - 1 ? pagAtual + 1 : 0;
                else if (i.customId === 'val_home') pagAtual = 0;
                await i.update({ embeds: [embeds[pagAtual]], components: [row] });
            });
            collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));

        } catch (err) {
            if (err.response?.status === 404) return interaction.editReply({ content: formatResponse(`❌ Jogador **${nomeInput}** não encontrado.`) });
            if (err.response?.status === 429) return interaction.editReply({ content: formatResponse('❌ Rate limit atingido. Tente em 1 minuto ou adicione HENRIK_API_KEY ao .env.') });
            console.error('[VALORANT]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar a API do Valorant. Tente novamente.') });
        }
    }
};

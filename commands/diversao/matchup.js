const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');
const { callAI, callAIVision, getProviderInfo } = require('../../utils/ollama-client');
const {
    getLatestDataDragonVersion,
    getChampionCatalog,
    getChampionSquareUrl,
} = require('../../utils/lol-assets');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanJsonResponse(text) {
    const raw = String(text || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : raw;
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    return objectMatch ? objectMatch[0] : candidate;
}

function parseJsonObject(text) {
    const cleaned = cleanJsonResponse(text);
    return JSON.parse(cleaned);
}

function toArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (!value) return [];
    return [String(value)];
}

function roleFromText(text) {
    const normalized = normalizeText(text);
    if (/\b(top|topo)\b/.test(normalized)) return 'TOP';
    if (/\b(jg|jungler|jungle|selva)\b/.test(normalized)) return 'JUNGLE';
    if (/\b(mid|meio)\b/.test(normalized)) return 'MID';
    if (/\b(adc|bot|bottom)\b/.test(normalized)) return 'ADC';
    if (/\b(sup|support|suporte)\b/.test(normalized)) return 'SUPPORT';
    return null;
}

function buildChampionEntries(championCatalog) {
    return Object.values(championCatalog || {}).map((champion) => ({
        id: champion.id,
        key: champion.key,
        name: champion.name,
        normalizedName: normalizeText(champion.name),
        aliases: new Set([
            normalizeText(champion.name),
            normalizeText(champion.id),
            normalizeText(champion.name).replace(/\s+/g, ''),
            normalizeText(champion.id).replace(/\s+/g, ''),
        ]),
    }));
}

function resolveChampion(rawName, championEntries) {
    const normalized = normalizeText(rawName);
    if (!normalized) return null;

    const exact = championEntries.find((entry) =>
        entry.aliases.has(normalized) || entry.aliases.has(normalized.replace(/\s+/g, ''))
    );
    if (exact) return exact;

    const startsWith = championEntries.find((entry) =>
        [...entry.aliases].some((alias) => alias.startsWith(normalized) || normalized.startsWith(alias))
    );
    if (startsWith) return startsWith;

    const partial = championEntries.find((entry) =>
        [...entry.aliases].some((alias) => alias.includes(normalized) || normalized.includes(alias))
    );
    return partial || null;
}

function detectChampionsInText(text, championEntries) {
    const normalized = normalizeText(text);
    if (!normalized) return [];

    const matches = [];
    for (const entry of championEntries) {
        for (const alias of entry.aliases) {
            if (!alias || alias.length < 3) continue;
            const index = normalized.indexOf(alias);
            if (index !== -1) {
                matches.push({ entry, index, len: alias.length });
                break;
            }
        }
    }

    const deduped = [];
    const seen = new Set();
    for (const match of matches.sort((a, b) => a.index - b.index || b.len - a.len)) {
        if (seen.has(match.entry.id)) continue;
        seen.add(match.entry.id);
        deduped.push(match.entry);
    }

    return deduped;
}

async function extractScenarioFromText(text, championEntries) {
    const detectedChampions = detectChampionsInText(text, championEntries);
    const fallbackMyChampion = detectedChampions[0] || null;
    const fallbackEnemyChampion = detectedChampions[1] || null;
    const fallbackRole = roleFromText(text);

    const prompt = `
Você é um parser de matchup de League of Legends.
Receba o texto do jogador e devolva APENAS JSON válido.

Campos:
- myChampion: string | null
- enemyChampion: string | null
- role: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | null
- enemyRank: string | null
- concern: string | null
- notes: string | null

Regras:
- não invente campeão que não apareceu.
- se faltar informação, use null.
- se o jogador disser "sou mono" ou algo parecido, deixe isso em notes.

Texto do jogador:
${text}
`.trim();

    try {
        const parsed = parseJsonObject(await callAI([
            { role: 'system', content: 'Você extrai cenários de matchup de League of Legends e responde só JSON.' },
            { role: 'user', content: prompt },
        ], { maxTokens: 250, temperature: 0.1 }));

        return {
            myChampion: parsed.myChampion || fallbackMyChampion?.name || null,
            enemyChampion: parsed.enemyChampion || fallbackEnemyChampion?.name || null,
            role: parsed.role || fallbackRole,
            enemyRank: parsed.enemyRank || null,
            concern: parsed.concern || null,
            notes: parsed.notes || null,
            teammates: [],
            enemies: [],
            source: 'text',
        };
    } catch {
        return {
            myChampion: fallbackMyChampion?.name || null,
            enemyChampion: fallbackEnemyChampion?.name || null,
            role: fallbackRole,
            enemyRank: null,
            concern: null,
            notes: text,
            teammates: [],
            enemies: [],
            source: 'text',
        };
    }
}

async function extractScenarioFromImage(imageUrl, nick) {
    const prompt = `
Analise a imagem de tela de carregamento de uma partida de League of Legends.
Responda APENAS JSON válido com:
- myChampion: string | null
- enemyChampion: string | null
- role: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | null
- teammates: string[]
- enemies: string[]
- notes: string | null

Contexto:
- se o nick do jogador for fornecido, use ele para descobrir qual campeão é dele.
- se não der para ter certeza absoluta, escolha a leitura mais provável e explique em notes.
- foque em identificar os campeões corretamente.
- não escreva nada fora do JSON.

Nick do jogador: ${nick || 'não informado'}
`.trim();

    const parsed = parseJsonObject(await callAIVision(imageUrl, prompt, { maxTokens: 400, temperature: 0.1 }));
    return {
        myChampion: parsed.myChampion || null,
        enemyChampion: parsed.enemyChampion || null,
        role: parsed.role || null,
        enemyRank: null,
        concern: null,
        notes: parsed.notes || null,
        teammates: toArray(parsed.teammates),
        enemies: toArray(parsed.enemies),
        source: 'image',
    };
}

async function buildMatchupAnalysis(scenario, patchVersion) {
    const prompt = `
Você é um coach high elo de League of Legends, falando em português do Brasil de forma natural, direta e útil.
Monte uma recomendação completa de matchup.

Patch atual de referência: ${patchVersion}

Contexto:
- meu campeão: ${scenario.myChampion || 'desconhecido'}
- campeão inimigo: ${scenario.enemyChampion || 'desconhecido'}
- lane/role: ${scenario.role || 'desconhecida'}
- rank inimigo: ${scenario.enemyRank || 'não informado'}
- preocupação principal: ${scenario.concern || 'não informada'}
- observações: ${scenario.notes || 'nenhuma'}
- aliados detectados: ${scenario.teammates?.join(', ') || 'não informados'}
- inimigos detectados: ${scenario.enemies?.join(', ') || 'não informados'}

Responda APENAS JSON válido com:
{
  "headline": "string",
  "summary": "string",
  "runes": ["string"],
  "summoners": ["string"],
  "startItems": ["string"],
  "coreItems": ["string"],
  "situationalItems": ["string"],
  "lanePlan": ["string"],
  "dangerWindows": ["string"],
  "winCondition": "string",
  "coachCall": "string"
}

Regras:
- seja específico para esse matchup.
- não invente dados numéricos de winrate.
- se faltar certeza, fale isso de forma curta no summary ou coachCall.
- dê build adaptada, não genérica.
`.trim();

    const parsed = parseJsonObject(await callAI([
        { role: 'system', content: 'Você é um especialista em League of Legends e responde apenas JSON válido.' },
        { role: 'user', content: prompt },
    ], { maxTokens: 900, temperature: 0.35 }));

    return {
        headline: parsed.headline || 'Leitura de matchup pronta',
        summary: parsed.summary || 'Não consegui montar um resumo forte dessa vez.',
        runes: toArray(parsed.runes),
        summoners: toArray(parsed.summoners),
        startItems: toArray(parsed.startItems),
        coreItems: toArray(parsed.coreItems),
        situationalItems: toArray(parsed.situationalItems),
        lanePlan: toArray(parsed.lanePlan),
        dangerWindows: toArray(parsed.dangerWindows),
        winCondition: parsed.winCondition || 'Sem condição de vitória descrita.',
        coachCall: parsed.coachCall || 'Joga o early com respeito e adapta conforme a lane.',
    };
}

function joinOrFallback(list, fallback = '`Sem leitura suficiente.`') {
    return list.length ? list.map((item) => `• ${item}`).join('\n') : fallback;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('matchup')
        .setDescription('Analisa matchup de LoL por texto ou imagem com ajuda de IA.')
        .addStringOption((option) =>
            option
                .setName('texto')
                .setDescription('Ex.: Estou de Tahm Kench contra Kennen diamante, me ajuda.')
                .setRequired(false)
                .setMaxLength(1500)
        )
        .addAttachmentOption((option) =>
            option
                .setName('imagem')
                .setDescription('Tela de carregamento ou print da partida para análise.')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('nick')
                .setDescription('Seu nick na print, se mandar imagem.')
                .setRequired(false)
                .setMaxLength(50)
        ),

    aliases: ['counterlol', 'lolmatchup'],
    detailedDescription: 'Lê matchup de League of Legends por texto ou imagem, extrai o cenário com IA e devolve build, runas, plano de lane, janelas de risco e condição de vitória.',
    usage: '`/matchup texto:Estou de Tahm Kench contra Kennen diamante` ou `/matchup imagem:<print> nick:SeuNick`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const texto = interaction.options.getString('texto');
        const imagem = interaction.options.getAttachment('imagem');
        const nick = interaction.options.getString('nick');

        if (!texto && !imagem) {
            return interaction.reply({
                content: formatResponse('❌ Manda um `texto` ou uma `imagem` para eu montar o matchup.'),
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            if (imagem && imagem.contentType && !imagem.contentType.startsWith('image/')) {
                return interaction.editReply({
                    content: formatResponse('❌ Esse anexo não parece ser imagem. Me manda um print da loading screen ou da partida.'),
                });
            }

            const providerInfo = getProviderInfo();
            const patchVersion = await getLatestDataDragonVersion();
            const championCatalog = await getChampionCatalog(patchVersion);
            const championEntries = buildChampionEntries(championCatalog);

            let scenario = null;
            if (imagem) {
                scenario = await extractScenarioFromImage(imagem.url, nick);
                if (texto) {
                    scenario.notes = [scenario.notes, texto].filter(Boolean).join(' | ');
                    scenario.concern = texto;
                }
            } else {
                scenario = await extractScenarioFromText(texto, championEntries);
            }

            const myChampion = resolveChampion(scenario.myChampion, championEntries);
            const enemyChampion = resolveChampion(scenario.enemyChampion, championEntries);
            scenario.myChampion = myChampion?.name || scenario.myChampion;
            scenario.enemyChampion = enemyChampion?.name || scenario.enemyChampion;

            if (!scenario.myChampion || !scenario.enemyChampion) {
                return interaction.editReply({
                    content: formatResponse('❌ Eu ainda não consegui identificar direitinho os dois campeões desse matchup. Me manda no formato `Estou de Campeão X contra Campeão Y` ou uma print mais limpa da loading screen.'),
                });
            }

            const analysis = await buildMatchupAnalysis(scenario, patchVersion);
            const thumbnail = myChampion ? getChampionSquareUrl(patchVersion, myChampion.id) : null;

            const embed = new EmbedBuilder()
                .setColor('#C89B3C')
                .setTitle(`${scenario.myChampion} vs ${scenario.enemyChampion}`)
                .setDescription(`**${analysis.headline}**\n${analysis.summary}`)
                .setThumbnail(thumbnail)
                .addFields(
                    {
                        name: 'Leitura da lane',
                        value: [
                            `**Role:** ${scenario.role || 'não identificada'}`,
                            scenario.enemyRank ? `**Rank inimigo:** ${scenario.enemyRank}` : null,
                            scenario.notes ? `**Observação:** ${scenario.notes}` : null,
                        ].filter(Boolean).join('\n'),
                        inline: false,
                    },
                    {
                        name: 'Runas e feitiços',
                        value: [
                            `**Runas:**\n${joinOrFallback(analysis.runes)}`,
                            `**Feitiços:**\n${joinOrFallback(analysis.summoners)}`,
                        ].join('\n\n'),
                        inline: true,
                    },
                    {
                        name: 'Build',
                        value: [
                            `**Start:**\n${joinOrFallback(analysis.startItems)}`,
                            `**Core:**\n${joinOrFallback(analysis.coreItems)}`,
                            `**Situacionais:**\n${joinOrFallback(analysis.situationalItems)}`,
                        ].join('\n\n'),
                        inline: true,
                    },
                    {
                        name: 'Plano de lane',
                        value: joinOrFallback(analysis.lanePlan),
                        inline: false,
                    },
                    {
                        name: 'Janelas de perigo',
                        value: joinOrFallback(analysis.dangerWindows),
                        inline: true,
                    },
                    {
                        name: 'Win condition',
                        value: analysis.winCondition,
                        inline: true,
                    },
                    {
                        name: 'Coach call',
                        value: analysis.coachCall,
                        inline: false,
                    },
                )
                .setFooter({
                    text: `Patch ${patchVersion} • Fonte: ${providerInfo.provider}/${providerInfo.model} • Matchup Lab`,
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[MATCHUP]', error.response?.data || error.message);
            return interaction.editReply({
                content: formatResponse('❌ Dei uma tropeçada montando essa leitura de matchup. Tenta de novo com mais contexto ou com uma imagem mais limpa da loading screen.'),
            });
        }
    },
};

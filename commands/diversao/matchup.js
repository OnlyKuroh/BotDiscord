const { SlashCommandBuilder } = require('discord.js');
const { callAI, callAIVision, getProviderInfo } = require('../../utils/ollama-client');
const {
    getLatestDataDragonVersion,
    getChampionCatalog,
} = require('../../utils/lol-assets');
const { collectMatchupSources } = require('../../utils/lol-matchup-sources');
const {
    DEFAULT_COACH_MODEL,
    startMatchupCoachSession,
    formatInitialCoachText,
} = require('../../utils/lol-matchup-coach');

const DEFAULT_VISION_MODEL = process.env.GROQ_MATCHUP_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

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

    const parsed = parseJsonObject(await callAIVision(imageUrl, prompt, {
        maxTokens: 400,
        temperature: 0.1,
        model: DEFAULT_VISION_MODEL,
    }));
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

async function buildMatchupAnalysis(scenario, patchVersion, sourceBundle) {
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

Base factual aberta disponível:
${sourceBundle?.digest || 'Sem fontes externas abertas adicionais além do patch e do catálogo de campeões.'}

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
- use a base factual acima para entender padrões dos campeões, alcance, perfil de dano, utilidade e função.
- trate qualquer recomendação como consenso prático entre contexto do jogador + base factual disponível, sem fingir fonte que você não recebeu.
`.trim();

    const parsed = parseJsonObject(await callAI([
        { role: 'system', content: 'Você é um especialista em League of Legends e responde apenas JSON válido.' },
        { role: 'user', content: prompt },
    ], { maxTokens: 900, temperature: 0.35, model: DEFAULT_COACH_MODEL }));

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

function formatInitialPlanText(scenario, analysis, patchVersion, providerInfo, sourceBundle) {
    return [
        `${analysis.headline}`,
        `${scenario.myChampion} vs ${scenario.enemyChampion}${scenario.role ? ` • ${scenario.role}` : ''}${scenario.enemyRank ? ` • contra ${scenario.enemyRank}` : ''}`,
        '',
        `Resumo: ${analysis.summary}`,
        sourceBundle?.providerNames?.length ? `Fontes abertas: ${sourceBundle.providerNames.join(', ')}` : 'Fontes abertas: Riot/Data Dragon',
        '',
        `Runas: ${analysis.runes.join(' | ') || 'sem leitura suficiente'}`,
        `Feitiços: ${analysis.summoners.join(' | ') || 'sem leitura suficiente'}`,
        `Start: ${analysis.startItems.join(' | ') || 'sem leitura suficiente'}`,
        `Core: ${analysis.coreItems.join(' | ') || 'sem leitura suficiente'}`,
        `Situacionais: ${analysis.situationalItems.join(' | ') || 'sem leitura suficiente'}`,
        '',
        'Plano de lane:',
        joinOrFallback(analysis.lanePlan, '• sem leitura suficiente'),
        '',
        'Janelas de perigo:',
        joinOrFallback(analysis.dangerWindows, '• sem leitura suficiente'),
        '',
        `Win condition: ${analysis.winCondition}`,
        `Call: ${analysis.coachCall}`,
        '',
        sourceBundle?.digest ? `Base factual:\n${sourceBundle.digest}\n` : null,
        `Coach model: ${DEFAULT_COACH_MODEL} • Vision: ${DEFAULT_VISION_MODEL} • Provider: ${providerInfo.provider}`,
    ].filter(Boolean).join('\n');
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
                content: 'Manda um `texto` ou uma `imagem` para eu montar o matchup.',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            if (imagem && imagem.contentType && !imagem.contentType.startsWith('image/')) {
                return interaction.editReply({
                    content: 'Esse anexo não parece ser imagem. Me manda um print da loading screen ou da partida.',
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
                    content: 'Eu ainda não consegui identificar direitinho os dois campeões desse matchup. Me manda no formato `Estou de Campeão X contra Campeão Y` ou uma print mais limpa da loading screen.',
                });
            }

            const sourceBundle = await collectMatchupSources({
                myChampionId: myChampion?.id,
                enemyChampionId: enemyChampion?.id,
            });
            const analysis = await buildMatchupAnalysis(scenario, patchVersion, sourceBundle);
            const initialPlan = formatInitialPlanText(scenario, analysis, patchVersion, providerInfo, sourceBundle);
            const session = startMatchupCoachSession({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                patchVersion,
                myChampion: scenario.myChampion,
                enemyChampion: scenario.enemyChampion,
                role: scenario.role,
                enemyRank: scenario.enemyRank,
                concern: scenario.concern,
                notes: scenario.notes,
                teammates: scenario.teammates,
                enemies: scenario.enemies,
                sourceDigest: sourceBundle?.digest || '',
                sourceNames: sourceBundle?.providerNames || [],
                initialPlan,
                model: DEFAULT_COACH_MODEL,
            });

            return interaction.editReply({
                content: formatInitialCoachText(session).slice(0, 2000),
            });
        } catch (error) {
            console.error('[MATCHUP]', error.response?.data || error.message);
            return interaction.editReply({
                content: 'Dei uma tropeçada montando essa leitura de matchup. Tenta de novo com mais contexto ou com uma imagem mais limpa da loading screen.',
            });
        }
    },
};

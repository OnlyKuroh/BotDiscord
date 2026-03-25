/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          AGENDADOR DE EVENTOS — BOT DISCORD                     ║
 * ║  Verifica a cada 60s quais eventos estão na hora                ║
 * ║  e dispara os envios configurados por servidor                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * EVENTOS DISPONÍVEIS:
 * ─────────────────────────────────────────────────────────────────
 * anime        │ MyAnimeList — animes da temporada (semanal)
 * noticias     │ TheNewsAPI — notícias gerais (freq. config.)
 * financeiro   │ Finlight — notícias financeiras (6h)
 * cotacao      │ AwesomeAPI — cotações de moedas (diário)
 * politica_br  │ Câmara + Senado + Google News — política BR (3h)
 * politica_mun │ SerpAPI/News — política mundial (4h)
 * ia_news      │ SerpAPI/News — novidades de IA (4h)
 * horoscopo    │ RapidAPI Zodiac — horóscopo diário (diário)
 * google_news  │ SerpAPI — busca personalizada por tópicos (freq. config.)
 * steam        │ Steam API — promoções de jogos (diário)
 * eleicao      │ CivicAPI — alertas eleitorais (4h)
 * ─────────────────────────────────────────────────────────────────
 *
 * TÓPICOS: Virgula separa tópicos diferentes.
 *   "IA, Politica, Comedia" → busca separada para cada um
 */

const axios   = require('axios');
const { EmbedBuilder } = require('discord.js');
const db      = require('../utils/db');
const translate = require('google-translate-api-x');

const CHECK_INTERVAL = 60 * 1000; // 1 minuto

// ═══════════════════════════════════════════════════════════════════
// HORÁRIO DE SÃO PAULO (sem UTC, sem AM/PM)
// ═══════════════════════════════════════════════════════════════════
function horarioSP() {
    return new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

function horaSP() {
    const now = new Date();
    return parseInt(now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
}

function minutoSP() {
    const now = new Date();
    return parseInt(now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', minute: '2-digit' }));
}

// ═══════════════════════════════════════════════════════════════════
// SISTEMA DE DEDUPLICAÇÃO DE NOTÍCIAS
// Armazena títulos enviados no DB para nunca repetir
// ═══════════════════════════════════════════════════════════════════

function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function similaridade(a, b) {
    if (!a || !b) return 0;
    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));
    const intersection = [...wordsA].filter(w => wordsB.has(w) && w.length > 3);
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.length / union.size;
}

function isDuplicate(guildId, eventKey, title) {
    const key = `sent_news_${guildId}_${eventKey}`;
    const sentList = db.get(key) || [];
    const normalized = normalizeTitle(title);

    for (const sent of sentList) {
        if (sent.normalized === normalized) return true;
        if (similaridade(sent.normalized, normalized) > 0.6) return true;
    }
    return false;
}

function markSent(guildId, eventKey, title) {
    const key = `sent_news_${guildId}_${eventKey}`;
    const sentList = db.get(key) || [];
    sentList.push({
        normalized: normalizeTitle(title),
        original: title?.substring(0, 200),
        date: new Date().toISOString(),
    });
    if (sentList.length > 200) sentList.splice(0, sentList.length - 200);
    db.set(key, sentList);
}

// ─── Tradução segura ──────────────────────────────────────────────────────────
async function traduzir(texto) {
    if (!texto) return '';
    try { return (await translate(String(texto).substring(0, 1500), { to: 'pt' })).text; }
    catch { return texto; }
}

async function traduzirSeNecessario(texto) {
    if (!texto) return '';
    // Se contém predominantemente caracteres ASCII, provavelmente está em inglês
    const ascii = texto.replace(/[^a-zA-Z]/g, '').length;
    const total = texto.replace(/\s/g, '').length;
    if (total > 0 && ascii / total > 0.7) return await traduzir(texto);
    return texto;
}

// ─── Gerador de Descrições Expandidas ─────────────────────────────────────────
// Garante que as notícias tenham pelo menos 5 linhas de descrição (~400 chars),
// enriquecendo com contexto real e informações úteis quando a API retorna pouco texto.
function expandirDescricao(descricao, titulo, fonte, tema, extras = {}) {
    if (!descricao) descricao = '';
    if (!titulo) titulo = 'Notícia sem título';

    // Mínimo de ~400 caracteres (aprox. 5 linhas de 80 chars)
    const MIN_CHARS = 400;

    if (descricao.length >= MIN_CHARS) return descricao;

    const partes = [descricao];

    // 1. Contexto sobre o assunto baseado no tema
    const contextoPorTema = {
        'Política BR': `Esta notícia está relacionada ao cenário político brasileiro, abrangendo atividades do Congresso Nacional, decisões do governo federal, votações e projetos de lei em tramitação.`,
        'Política Mundial': `Esta notícia trata de acontecimentos geopolíticos internacionais, relações diplomáticas entre nações, decisões de organismos internacionais e seus impactos globais.`,
        'IA & Inteligência Artificial': `Novidade no campo da inteligência artificial que impacta o desenvolvimento tecnológico, pesquisa em machine learning, modelos de linguagem e automação de processos.`,
        'Financeiro': `Informação relevante para o mercado financeiro, com impacto potencial em investimentos, bolsa de valores, câmbio e indicadores econômicos.`,
        'Games': `Oportunidade para gamers! Confira os detalhes desta promoção e aproveite enquanto o desconto está ativo na loja.`,
        'Eleições': `Acompanhe o processo eleitoral com informações sobre candidatos, resultados parciais, pesquisas e datas importantes para o cidadão.`,
        'Anime': `Confira as novidades do mundo dos animes e mangás — sinopses, notas, gêneros e estúdios responsáveis pela produção.`,
    };

    // 2. Adiciona contexto temático se a descrição ainda é curta
    if (partes.join('\n').length < MIN_CHARS && tema && contextoPorTema[tema]) {
        partes.push(`\n${contextoPorTema[tema]}`);
    }

    // 3. Informações extras passadas pelo handler (autor, data, status, etc.)
    if (extras.autor && partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Autor:** ${extras.autor}`);
    }
    if (extras.data && partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Data:** ${extras.data}`);
    }
    if (extras.status && partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Status:** ${extras.status}`);
    }
    if (extras.tags && partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Tags:** ${extras.tags}`);
    }

    // 4. Fonte e categoria
    if (fonte && partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Fonte:** ${fonte}`);
    }
    if (tema && partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Categoria:** ${tema}`);
    }

    // 5. Data de publicação
    if (partes.join('\n').length < MIN_CHARS) {
        partes.push(`**Publicado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    }

    // 6. Call-to-action
    if (partes.join('\n').length < MIN_CHARS) {
        partes.push(`_Clique no título acima para acessar a matéria completa com todos os detalhes e atualizações._`);
    }

    return partes.join('\n');
}

// ─── Helpers de tempo ─────────────────────────────────────────────────────────
function passouFrequencia(lastSent, frequenciaHoras) {
    if (!lastSent) return true;
    const diff = (Date.now() - new Date(lastSent).getTime()) / (1000 * 60 * 60);
    return diff >= frequenciaHoras;
}

function eHorario(horaConfig) {
    if (!horaConfig) return false;
    const [hConf] = horaConfig.split(':').map(Number);
    return horaSP() === hConf && minutoSP() < 5;
}

function hoje() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ─── Parser de tópicos por vírgula ───────────────────────────────────────────
function parseTopicos(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return input.split(',').map(t => t.trim()).filter(Boolean);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isConfiguredSecret(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return false;

    const placeholderHints = [
        'SEU_',
        'YOUR_',
        'API_KEY_AQUI',
        'CHANGE_ME',
        'CHANGEME',
        'TOKEN_AQUI',
        'EXEMPLO',
    ];

    return !placeholderHints.some(hint => normalized.includes(hint));
}

function getHttpStatus(err) {
    return err?.response?.status || null;
}

function formatHttpError(err) {
    const status = getHttpStatus(err);
    if (status) return `HTTP ${status}`;
    return err?.message || 'Erro desconhecido';
}

async function axiosGetWithRetry(url, config = {}, options = {}) {
    const attempts = options.attempts || 3;
    const retryStatuses = options.retryStatuses || [429, 500, 502, 503, 504];
    const label = options.label || 'REQUEST';
    const baseDelayMs = options.baseDelayMs || 1250;

    let lastErr;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await axios.get(url, {
                timeout: 12000,
                ...config,
            });
        } catch (err) {
            lastErr = err;
            const status = getHttpStatus(err);
            const shouldRetry = status && retryStatuses.includes(status) && attempt < attempts;

            if (!shouldRetry) throw err;

            console.warn(`[${label}] tentativa ${attempt}/${attempts} falhou com HTTP ${status}; tentando novamente...`);
            await sleep(baseDelayMs * attempt);
        }
    }

    throw lastErr;
}

// ═══════════════════════════════════════════════════════════════════
// EMBED PADRÃO DE NOTÍCIA
// Garante que todas as notícias tenham descrição de pelo menos 5 linhas
// ═══════════════════════════════════════════════════════════════════

function buildNewsEmbed({ titulo, descricao, link, fonte, tema, cor, imagem, thumbnail, extras }) {
    const tituloFinal = (titulo || 'Sem título').substring(0, 256);
    const linkFinal = link || 'https://news.google.com';

    // Expande a descrição para ter pelo menos 5 linhas (~400 chars)
    let descFinal = expandirDescricao(descricao || '', titulo, fonte, tema, extras || {});

    if (descFinal.length > 600) {
        descFinal = descFinal.substring(0, 600) + `... [continue lendo](${linkFinal})`;
    } else if (descFinal.length > 0) {
        descFinal += `\n\n[Leia a notícia completa](${linkFinal})`;
    }

    const embed = new EmbedBuilder()
        .setTitle(tituloFinal)
        .setURL(linkFinal)
        .setColor(cor || '#2b2d31')
        .setFooter({ text: `Tema: ${tema || 'Geral'} • ${horarioSP()}` });

    if (descFinal) embed.setDescription(descFinal);
    if (fonte) embed.addFields({ name: '📰 Fonte', value: fonte, inline: true });
    if (imagem) embed.setImage(imagem);
    if (thumbnail && !imagem) embed.setThumbnail(thumbnail);

    return embed;
}

// ─── Envio para canal ─────────────────────────────────────────────────────────
// Se roleId existir, envia @CARGO acima do embed
async function enviarEmbed(client, channelId, embed, roleId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        const content = roleId ? `<@&${roleId}>` : undefined;
        await channel.send({ content, embeds: [embed] });
    } catch (err) {
        console.error(`[EVENTS] Erro ao enviar embed para canal ${channelId}:`, err.message);
    }
}

async function enviarMulti(client, channelId, embeds, roleId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        const content = roleId ? `<@&${roleId}>` : undefined;
        await channel.send({ content, embeds });
    } catch (err) {
        console.error(`[EVENTS] Erro ao enviar embeds para canal ${channelId}:`, err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════

// ── 1. ANIME (Jikan / MyAnimeList) ─────────────────────────────────────────
// API: https://api.jikan.moe/v4
// Descrição: Busca animes da temporada atual no MyAnimeList
// Requer Key: Não (gratuita, rate limit de 3 req/s)
// Frequência: Semanal (24*7 horas)
async function fireEventoAnime(client, guildId, conf) {
    try {
        const res = await axios.get('https://api.jikan.moe/v4/seasons/now?limit=10');
        const animes = res.data.data?.slice(0, 5) || [];
        if (!animes.length) return;

        for (const a of animes.slice(0, 3)) {
            if (isDuplicate(guildId, 'anime', a.title)) continue;

            const sinopse = a.synopsis
                ? await traduzir(a.synopsis.substring(0, 500))
                : 'Sinopse não disponível.';
            const generos = a.genres?.map(g => g.name).join(', ') || 'N/A';
            const estudio = a.studios?.[0]?.name || 'N/A';

            const embed = new EmbedBuilder()
                .setTitle(`🎌 ${a.title}`)
                .setDescription(`> ${sinopse}`)
                .setColor('#2E51A2')
                .setThumbnail(a.images?.jpg?.image_url || '')
                .addFields(
                    { name: '⭐ Nota',       value: a.score ? `**${a.score}**/10` : 'N/A', inline: true },
                    { name: '📺 Episódios',  value: `**${a.episodes || '?'}**`,             inline: true },
                    { name: '🏭 Estúdio',   value: estudio,                                 inline: true },
                    { name: '🏷️ Gêneros',  value: generos,                                 inline: false },
                )
                .setURL(`https://myanimelist.net/anime/${a.mal_id}`)
                .setFooter({ text: `Tema: Anime • ${horarioSP()}` });

            markSent(guildId, 'anime', a.title);
            await enviarEmbed(client, conf.channelId, embed, conf.roleId);
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) { console.error('[EVENT ANIME]', err.message); }
}

// ── 2. NOTÍCIAS GERAIS (TheNewsAPI) ────────────────────────────────────────
// API: https://api.thenewsapi.com
// Descrição: Top manchetes por categoria (Tech, Esportes, Política, etc)
// Requer Key: Sim (NEWS_API_KEY no .env)
// Frequência: Configurável (padrão 6 horas)
async function fireEventoNoticias(client, guildId, conf) {
    const NEWS_KEY  = process.env.NEWS_API_KEY || '';
    const categoria = conf.categoria || 'general';
    if (!NEWS_KEY) { console.warn('[EVENT NOTICIAS] NEWS_API_KEY não configurada no .env'); return; }

    try {
        const res = await axios.get('https://api.thenewsapi.com/v1/news/top', {
            params: { api_token: NEWS_KEY, locale: 'br', language: 'pt', categories: categoria, limit: 5 }
        });

        const articles = res.data.data?.slice(0, 5) || [];
        const categoriaNome = {
            'general': 'Notícias Gerais', 'tech': 'Tecnologia', 'sports': 'Esportes',
            'politics': 'Política', 'entertainment': 'Entretenimento', 'science': 'Ciência',
            'health': 'Saúde', 'business': 'Negócios',
        }[categoria] || 'Notícias';

        for (const art of articles) {
            if (isDuplicate(guildId, 'noticias', art.title)) continue;

            const descricao = art.description || art.snippet || '';
            const descTraduzida = await traduzirSeNecessario(descricao);

            const embed = buildNewsEmbed({
                titulo: await traduzirSeNecessario(art.title),
                descricao: descTraduzida,
                link: art.url,
                fonte: art.source || 'Fonte desconhecida',
                tema: categoriaNome,
                cor: '#E74C3C',
                imagem: art.image_url || null,
            });

            markSent(guildId, 'noticias', art.title);
            await enviarEmbed(client, conf.channelId, embed, conf.roleId);
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch (err) { console.error('[EVENT NOTICIAS]', err.message); }
}

// ── 3. FINANCEIRO (Finlight) ──────────────────────────────────────────────
// API: https://api.finlight.me
// Descrição: Notícias financeiras com análise de sentimento (positivo/negativo/neutro)
// Requer Key: Sim (FINLIGHT_API_KEY no .env)
// Frequência: 6 horas
async function fireEventoFinanceiro(client, guildId, conf) {
    const FINLIGHT_KEY = process.env.FINLIGHT_API_KEY || '';
    if (!isConfiguredSecret(FINLIGHT_KEY)) {
        console.warn('[EVENT FINANCEIRO] FINLIGHT_API_KEY ausente ou com placeholder no .env');
        return;
    }

    try {
        const res = await axios.post('https://api.finlight.me/v2/articles', {
            query: conf.topico || 'mercado financeiro brasil',
            language: ['pt', 'en'],
            limit: 5,
        }, {
            headers: { 'x-api-key': FINLIGHT_KEY },
            timeout: 10000,
        });

        const articles = res.data?.articles?.slice(0, 5) || [];

        for (const art of articles) {
            if (isDuplicate(guildId, 'financeiro', art.title)) continue;

            const sentimento = {
                'positive': '📈 Positivo', 'negative': '📉 Negativo', 'neutral': '➡️ Neutro'
            }[art.sentiment?.label] || '➡️ Neutro';
            const corSent = {
                'positive': '#57F287', 'negative': '#ED4245', 'neutral': '#FEE75C'
            }[art.sentiment?.label] || '#FEE75C';

            const tituloTrad = await traduzirSeNecessario(art.title);
            const descTrad = await traduzirSeNecessario(art.summary || art.title || '');

            const embed = buildNewsEmbed({
                titulo: tituloTrad,
                descricao: descTrad,
                link: art.url,
                fonte: art.source || 'N/A',
                tema: 'Financeiro',
                cor: corSent,
                imagem: art.imageUrl || null,
            });
            embed.addFields({ name: '📊 Sentimento', value: sentimento, inline: true });

            if (art.companies?.length) {
                const empresas = art.companies.slice(0, 3).map(c => `\`${c.ticker || c.name}\``).join(' ');
                embed.addFields({ name: '🏢 Empresas', value: empresas, inline: true });
            }

            markSent(guildId, 'financeiro', art.title);
            await enviarEmbed(client, conf.channelId, embed, conf.roleId);
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch (err) {
        const status = getHttpStatus(err);
        if (status === 401) {
            console.error('[EVENT FINANCEIRO] FINLIGHT_API_KEY rejeitada pela API (HTTP 401)');
            return;
        }

        console.error('[EVENT FINANCEIRO]', formatHttpError(err));
    }
}

// ── 4. COTAÇÃO (AwesomeAPI) ─────────────────────────────────────────────────
// API: https://economia.awesomeapi.com.br
// Descrição: Cotações de moedas e criptomoedas em tempo real (USD, EUR, BTC, ARS, GBP)
// Requer Key: Não (gratuita)
// Frequência: Diário (horário configurável, padrão 09:00)
async function fireEventoCotacao(client, guildId, conf) {
    try {
        const moedas = ['USD', 'EUR', 'BTC', 'ARS', 'GBP'];
        const pares  = moedas.map(m => `${m}-BRL`).join(',');
        const res    = await axios.get(`https://economia.awesomeapi.com.br/json/last/${pares}`);
        const data   = res.data;

        const campos = moedas.filter(m => data[`${m}BRL`]).map(m => {
            const c    = data[`${m}BRL`];
            const pct  = parseFloat(c.pctChange || '0');
            const seta = pct >= 0 ? '▲' : '▼';
            const bid  = parseFloat(c.bid);
            const txt  = bid > 10000
                ? `R$ ${bid.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
                : `R$ ${bid.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
            return { name: `💱 ${m}/BRL`, value: `**${txt}** ${seta} ${Math.abs(pct).toFixed(2)}%`, inline: true };
        });

        const embed = new EmbedBuilder()
            .setTitle('💱 Cotações do Dia')
            .setDescription('> Valores em tempo real contra o **Real Brasileiro (BRL)**')
            .setColor('#009C3B')
            .addFields(campos)
            .setFooter({ text: `Tema: Cotações • ${horarioSP()}` });

        await enviarEmbed(client, conf.channelId, embed, conf.roleId);
    } catch (err) { console.error('[EVENT COTACAO]', err.message); }
}

// ═══════════════════════════════════════════════════════════════════
// 5. POLÍTICA BRASILEIRA (Câmara + Senado + Google News)
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ ORGANIZADOR DE APIS DE POLÍTICA BRASILEIRA                     │
// │                                                                │
// │ Este evento puxa notícias de múltiplas fontes de política      │
// │ brasileira. Para adicionar novas APIs, siga esta estrutura:    │
// │                                                                │
// │ 1. ADICIONE UM BLOCO TRY/CATCH PARA CADA API NOVA             │
// │ 2. COPIE UM DOS BLOCOS EXISTENTES (5a, 5b, 5c, etc)           │
// │ 3. TROQUE A URL DA API PELA SUA NOVA FONTE                     │
// │ 4. AJUSTE O PARSING DO RESPONSE (res.data.???)                │
// │ 5. USE isDuplicate() PARA EVITAR REPETIÇÃO                    │
// │ 6. USE buildNewsEmbed() PARA MONTAR O EMBED                   │
// │ 7. ADICIONE O EMBED AO ARRAY: embeds.push(embed)              │
// │ 8. MARQUE COMO ENVIADO: markSent()                            │
// │                                                                │
// │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
// │                                                                │
// │ 📋 APIS GRATUITAS RECOMENDADAS PARA POLÍTICA BR:              │
// │                                                                │
// │ • Gov.br Notícias                                              │
// │   URL: https://www.gov.br/api/noticias                        │
// │   Descrição: Notícias oficiais do governo brasileiro          │
// │   Requer Key: Não                                              │
// │                                                                │
// │ • TSE (Tribunal Superior Eleitoral)                            │
// │   URL: https://dadosabertos.tse.jus.br                        │
// │   Descrição: Dados de eleições, candidatos e resultados       │
// │   Requer Key: Não                                              │
// │                                                                │
// │ • STF (Supremo Tribunal Federal)                               │
// │   URL: https://portal.stf.jus.br/api                          │
// │   Descrição: Decisões e julgamentos do STF                    │
// │   Requer Key: Não                                              │
// │                                                                │
// │ • Portal da Transparência                                      │
// │   URL: https://api.portaltransparencia.gov.br                 │
// │   Descrição: Gastos públicos e transparência governamental    │
// │   Requer Key: Sim (gratuita)                                   │
// │                                                                │
// │ • Diário Oficial da União                                      │
// │   URL: https://api-gestao.dados.gov.br                        │
// │   Descrição: Publicações oficiais do governo                  │
// │   Requer Key: Não                                              │
// │                                                                │
// │ • Agência Brasil (EBC)                                         │
// │   URL: https://agenciabrasil.ebc.com.br/api                   │
// │   Descrição: Notícias da Empresa Brasil de Comunicação        │
// │   Requer Key: Não                                              │
// │                                                                │
// └─────────────────────────────────────────────────────────────────┘
//
// ═══════════════════════════════════════════════════════════════════
async function fireEventoPoliticaBR(client, guildId, conf) {
    const embeds = [];

    // ── 5a. CÂMARA DOS DEPUTADOS — Votações recentes ─────────────
    // API: https://dadosabertos.camara.leg.br/swagger/api.html
    // Gratuita, sem key. Retorna votações do plenário do dia.
    try {
        const dataHoje = hoje();
        const resCamara = await axiosGetWithRetry(
            `https://dadosabertos.camara.leg.br/api/v2/votacoes?dataInicio=${dataHoje}&dataFim=${dataHoje}&itens=5&ordem=DESC&ordenarPor=dataHoraRegistro`,
            {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'BOT DISCORD/1.0',
                },
            },
            { label: 'POLITICA_BR Câmara' }
        );
        const votacoes = resCamara.data.dados || [];

        for (const v of votacoes.slice(0, 3)) {
            const desc = v.descricao || 'Sem descrição';
            if (isDuplicate(guildId, 'politica_br', desc)) continue;

            const aprovado = v.aprovacao === 1 ? '✅ **APROVADO**' : v.aprovacao === 0 ? '❌ **REJEITADO**' : '🔵 Em votação';

            const embed = buildNewsEmbed({
                titulo: `🏛️ Câmara — Votação no Plenário`,
                descricao: desc.substring(0, 500),
                link: `https://www.camara.leg.br/presenca-comissoes/votacao-portal?visaoVotacao=1`,
                fonte: 'Câmara dos Deputados',
                tema: 'Política BR',
                cor: v.aprovacao === 1 ? '#57F287' : v.aprovacao === 0 ? '#ED4245' : '#5865F2',
            });
            embed.addFields(
                { name: '📊 Resultado', value: aprovado, inline: true },
                { name: '📅 Data', value: v.dataHoraRegistro ? new Date(v.dataHoraRegistro).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : dataHoje, inline: true },
            );

            markSent(guildId, 'politica_br', desc);
            embeds.push(embed);
        }
    } catch (err) { console.error('[POLITICA_BR] Câmara:', formatHttpError(err)); }

    // ── 5b. CÂMARA — Proposições recentes (PLs, PECs, etc) ────────
    // API: mesma da Câmara. Retorna proposições registradas no dia.
    try {
        const dataHoje = hoje();
        const resProp = await axiosGetWithRetry(
            `https://dadosabertos.camara.leg.br/api/v2/proposicoes?dataInicio=${dataHoje}&dataFim=${dataHoje}&itens=5&ordem=DESC&ordenarPor=id`,
            {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'BOT DISCORD/1.0',
                },
            },
            { label: 'POLITICA_BR Proposições' }
        );
        const props = resProp.data.dados || [];

        for (const p of props.slice(0, 3)) {
            const ementa = p.ementa || 'Sem ementa';
            if (isDuplicate(guildId, 'politica_br', ementa)) continue;

            const tipo = p.siglaTipo || 'PROP';
            const numero = p.numero || '?';
            const ano = p.ano || '';

            const embed = buildNewsEmbed({
                titulo: `📝 ${tipo} ${numero}/${ano}`,
                descricao: ementa.substring(0, 500),
                link: p.urlInteiroTeor || `https://www.camara.leg.br/propostas-legislativas/${p.id}`,
                fonte: 'Câmara dos Deputados',
                tema: 'Política BR',
                cor: '#1565C0',
            });

            markSent(guildId, 'politica_br', ementa);
            embeds.push(embed);
        }
    } catch (err) { console.error('[POLITICA_BR] Proposições:', formatHttpError(err)); }

    // ── 5c. SENADO FEDERAL — Matérias em tramitação ─────────────────
    // API: https://legis.senado.leg.br/dadosabertos/dados-abertos.html
    // Gratuita, sem key. Retorna matérias em tramitação no Senado.
    try {
        const resSenado = await axios.get(
            'https://legis.senado.leg.br/dadosabertos/materia/pesquisa/lista?v=7&tramitando=S',
            { headers: { Accept: 'application/json' }, timeout: 10000 }
        );

        const materias = resSenado.data?.PesquisaBasicaMateria?.Materias?.Materia || [];
        for (const m of (Array.isArray(materias) ? materias : [materias]).slice(0, 3)) {
            const ementa = m.DadosBasicosMateria?.EmentaMateria || 'Sem ementa';
            if (isDuplicate(guildId, 'politica_br', ementa)) continue;

            const sigla = m.IdentificacaoMateria?.SiglaSubtipoMateria || 'MAT';
            const num = m.IdentificacaoMateria?.NumeroMateria || '?';
            const ano = m.IdentificacaoMateria?.AnoMateria || '';
            const autor = m.DadosBasicosMateria?.Autoria?.Autor?.[0]?.NomeAutor || 'Senado';

            const embed = buildNewsEmbed({
                titulo: `🏛️ Senado — ${sigla} ${num}/${ano}`,
                descricao: ementa.substring(0, 500),
                link: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${m.IdentificacaoMateria?.CodigoMateria || ''}`,
                fonte: `Senado Federal — ${autor}`,
                tema: 'Política BR',
                cor: '#006B3F',
            });

            markSent(guildId, 'politica_br', ementa);
            embeds.push(embed);
        }
    } catch (err) { console.error('[POLITICA_BR] Senado:', err.message); }

    // ── 5d. GOOGLE NEWS — Política Brasil (complemento) ───────────
    // API: SerpAPI (precisa de SERP_API_KEY no .env)
    // Busca notícias do Google por tópicos configurados no dashboard
    // Tópicos separados por vírgula = buscas independentes
    const SERP_KEY = process.env.SERP_API_KEY || '';
    if (SERP_KEY) {
        const topicos = parseTopicos(conf.topicos) || [];
        const queries = topicos.length
            ? topicos
            : ['política brasil congresso governo federal'];

        for (const query of queries.slice(0, 3)) {
            try {
                const resNews = await axios.get('https://serpapi.com/search.json', {
                    params: { engine: 'google_news', q: query, hl: 'pt-BR', gl: 'br', api_key: SERP_KEY, num: 5 }
                });

                const noticias = resNews.data.news_results?.slice(0, 3) || [];
                for (const n of noticias) {
                    if (isDuplicate(guildId, 'politica_br', n.title)) continue;

                    const tituloTrad = await traduzirSeNecessario(n.title || '');
                    const descTrad = await traduzirSeNecessario(n.snippet || '');

                    const embed = buildNewsEmbed({
                        titulo: tituloTrad,
                        descricao: descTrad,
                        link: n.link,
                        fonte: n.source?.name || 'Google News',
                        tema: 'Política BR',
                        cor: '#1B5E20',
                        imagem: n.thumbnail || null,
                    });

                    markSent(guildId, 'politica_br', n.title);
                    embeds.push(embed);
                }
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) { console.error('[POLITICA_BR] Google News:', err.message); }
        }
    }

    if (!embeds.length) return;
    for (let i = 0; i < embeds.length; i += 3) {
        await enviarMulti(client, conf.channelId, embeds.slice(i, i + 3), conf.roleId);
        if (i + 3 < embeds.length) await new Promise(r => setTimeout(r, 2000));
    }
}

// ═══════════════════════════════════════════════════════════════════
// 6. POLÍTICA MUNDIAL — Google News via SerpAPI
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ ORGANIZADOR DE APIS DE POLÍTICA MUNDIAL                        │
// │                                                                │
// │ Este evento puxa notícias de política internacional.           │
// │ Para adicionar novas APIs, siga a mesma estrutura do           │
// │ Política BR:                                                   │
// │                                                                │
// │ 1. ADICIONE UM BLOCO TRY/CATCH ANTES DO LOOP DO SERPAPI       │
// │ 2. FAÇA A REQUEST COM AXIOS PARA SUA API                      │
// │ 3. USE isDuplicate(guildId, 'politica_mun', titulo)           │
// │ 4. USE buildNewsEmbed() + traduzirSeNecessario()              │
// │ 5. embeds.push(embed) + markSent()                            │
// │                                                                │
// │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
// │                                                                │
// │ 📋 APIS GRATUITAS RECOMENDADAS PARA POLÍTICA MUNDIAL:         │
// │                                                                │
// │ • Reuters API (RSS)                                            │
// │   URL: https://www.reuters.com/tools/rss                      │
// │   Descrição: Notícias internacionais da Reuters               │
// │   Requer Key: Não (RSS público)                                │
// │                                                                │
// │ • NewsAPI.org                                                  │
// │   URL: https://newsapi.org                                     │
// │   Descrição: Agregador de notícias mundial                    │
// │   Requer Key: Sim (100 requests/dia grátis)                   │
// │                                                                │
// │ • GNews API                                                    │
// │   URL: https://gnews.io                                        │
// │   Descrição: Notícias internacionais em 15 idiomas            │
// │   Requer Key: Sim (100 requests/dia grátis)                   │
// │                                                                │
// │ • Mediastack                                                   │
// │   URL: https://mediastack.com                                  │
// │   Descrição: Notícias de 7500+ fontes globais                 │
// │   Requer Key: Sim (500 requests/mês grátis)                   │
// │                                                                │
// │ • The Guardian API                                             │
// │   URL: https://open-platform.theguardian.com                  │
// │   Descrição: Artigos do jornal The Guardian                   │
// │   Requer Key: Sim (gratuita para uso não-comercial)           │
// │                                                                │
// └─────────────────────────────────────────────────────────────────┘
//
// ═══════════════════════════════════════════════════════════════════
async function fireEventoPoliticaMundial(client, guildId, conf) {
    const SERP_KEY = process.env.SERP_API_KEY || '';
    if (!SERP_KEY) { console.warn('[EVENT POLITICA_MUN] SERP_API_KEY não configurada no .env'); return; }

    const topicos = parseTopicos(conf.topicos);
    const queries = topicos.length
        ? topicos
        : ['world politics breaking news', 'geopolitics international relations'];

    try {
        const embeds = [];

        for (const topico of queries.slice(0, 4)) {
            const res = await axios.get('https://serpapi.com/search.json', {
                params: { engine: 'google_news', q: topico, hl: 'pt-BR', gl: 'br', api_key: SERP_KEY, num: 4 }
            });

            const noticias = res.data.news_results?.slice(0, 3) || [];
            for (const n of noticias) {
                if (isDuplicate(guildId, 'politica_mun', n.title)) continue;

                const titulo = await traduzirSeNecessario(n.title?.substring(0, 200) || 'Notícia');
                const descricao = n.snippet ? await traduzirSeNecessario(n.snippet) : '';

                const embed = buildNewsEmbed({
                    titulo: `🌍 ${titulo}`,
                    descricao,
                    link: n.link,
                    fonte: n.source?.name || 'Google News',
                    tema: 'Política Mundial',
                    cor: '#0D47A1',
                    imagem: n.thumbnail || null,
                });

                markSent(guildId, 'politica_mun', n.title);
                embeds.push(embed);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!embeds.length) return;
        for (let i = 0; i < embeds.length; i += 3) {
            await enviarMulti(client, conf.channelId, embeds.slice(i, i + 3), conf.roleId);
            if (i + 3 < embeds.length) await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) { console.error('[EVENT POLITICA_MUN]', err.message); }
}

// ═══════════════════════════════════════════════════════════════════
// 7. IA NEWS — Novidades de Inteligência Artificial
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ ORGANIZADOR DE APIS DE INTELIGÊNCIA ARTIFICIAL                 │
// │                                                                │
// │ Este evento puxa notícias sobre IA, machine learning, LLMs,    │
// │ e tecnologias relacionadas.                                    │
// │                                                                │
// │ Tópicos separados por vírgula = buscas independentes           │
// │ Exemplo: "ChatGPT, Claude, Gemini, Machine Learning"           │
// │                                                                │
// │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
// │                                                                │
// │ 📋 APIS GRATUITAS RECOMENDADAS PARA IA NEWS:                  │
// │                                                                │
// │ • Papers With Code                                             │
// │   URL: https://paperswithcode.com/api                         │
// │   Descrição: Papers de research de IA e ML                    │
// │   Requer Key: Não                                              │
// │                                                                │
// │ • Arxiv API                                                    │
// │   URL: https://arxiv.org/help/api                             │
// │   Descrição: Papers científicos sobre IA                      │
// │   Requer Key: Não                                              │
// │                                                                │
// │ • Hugging Face                                                 │
// │   URL: https://huggingface.co/api                             │
// │   Descrição: Modelos e datasets de ML                         │
// │   Requer Key: Sim (gratuita)                                   │
// │                                                                │
// │ • GitHub Trending                                              │
// │   URL: https://api.github.com/search/repositories             │
// │   Descrição: Repositórios trending de IA                      │
// │   Requer Key: Não (rate limit público)                        │
// │                                                                │
// └─────────────────────────────────────────────────────────────────┘
//
// Tópicos separados por vírgula = buscas independentes
// ═══════════════════════════════════════════════════════════════════
async function fireEventoIANews(client, guildId, conf) {
    const SERP_KEY = process.env.SERP_API_KEY || '';
    if (!SERP_KEY) { console.warn('[EVENT IA_NEWS] SERP_API_KEY não configurada no .env'); return; }

    const topicos = parseTopicos(conf.topicos);
    const queries = topicos.length
        ? topicos
        : ['artificial intelligence AI news', 'ChatGPT Claude Gemini LLM update', 'inteligência artificial novidades'];

    try {
        const embeds = [];

        for (const topico of queries.slice(0, 4)) {
            const res = await axios.get('https://serpapi.com/search.json', {
                params: { engine: 'google_news', q: topico, hl: 'pt-BR', gl: 'br', api_key: SERP_KEY, num: 4 }
            });

            const noticias = res.data.news_results?.slice(0, 3) || [];
            for (const n of noticias) {
                if (isDuplicate(guildId, 'ia_news', n.title)) continue;

                const titulo = await traduzirSeNecessario(n.title?.substring(0, 256) || 'IA News');
                const descricao = n.snippet ? await traduzirSeNecessario(n.snippet) : '';

                const embed = buildNewsEmbed({
                    titulo: `🤖 ${titulo}`,
                    descricao,
                    link: n.link,
                    fonte: n.source?.name || 'Google News',
                    tema: 'IA & Inteligência Artificial',
                    cor: '#7C3AED',
                    imagem: n.thumbnail || null,
                });

                markSent(guildId, 'ia_news', n.title);
                embeds.push(embed);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!embeds.length) return;
        for (let i = 0; i < embeds.length; i += 3) {
            await enviarMulti(client, conf.channelId, embeds.slice(i, i + 3), conf.roleId);
            if (i + 3 < embeds.length) await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) { console.error('[EVENT IA_NEWS]', err.message); }
}

// ═══════════════════════════════════════════════════════════════════
// 8. HORÓSCOPO DIÁRIO — RapidAPI Multilingual Zodiac
//
// API: https://multilingual-ai-zodiac-customized-horoscopes-for-all-signs.p.rapidapi.com
// Descrição: Previsões detalhadas dos 12 signos em PT-BR com número da sorte,
//            cor da sorte, humor e compatibilidade
// Requer Key: Sim (RAPIDAPI_KEY no .env)
// Frequência: Diário (horário configurável, padrão 08:00)
// Endpoint correto: horoscope-detailed.php
// ═══════════════════════════════════════════════════════════════════
async function fireEventoHoroscopo(client, guildId, conf) {
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '077d8eb14emsh6e1e2a5d3b65f38p13e424jsn0534141c7964';

    const SIGNOS = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
    const SIGNOS_PT = {
        'aries':'Áries','taurus':'Touro','gemini':'Gêmeos','cancer':'Câncer',
        'leo':'Leão','virgo':'Virgem','libra':'Libra','scorpio':'Escorpião',
        'sagittarius':'Sagitário','capricorn':'Capricórnio','aquarius':'Aquário','pisces':'Peixes'
    };
    const SIGNOS_EMOJIS = {
        'aries':'♈','taurus':'♉','gemini':'♊','cancer':'♋','leo':'♌','virgo':'♍',
        'libra':'♎','scorpio':'♏','sagittarius':'♐','capricorn':'♑','aquarius':'♒','pisces':'♓'
    };
    const SIGNO_COR = {
        'aries':'#FF6B6B','taurus':'#8BC34A','gemini':'#FFEB3B','cancer':'#80DEEA',
        'leo':'#FFA726','virgo':'#A5D6A7','libra':'#CE93D8','scorpio':'#B71C1C',
        'sagittarius':'#7986CB','capricorn':'#78909C','aquarius':'#4FC3F7','pisces':'#80CBC4'
    };

    const signosEnviar = conf.signos?.length ? conf.signos : SIGNOS;
    const dataHoje = hoje();

    for (const signo of signosEnviar.slice(0, 12)) {
        try {
            const res = await axios.get(
                'https://multilingual-ai-zodiac-customized-horoscopes-for-all-signs.p.rapidapi.com/horoscope-detailed.php',
                {
                    params: {
                        sign: signo,
                        date: dataHoje,
                        mode: 'daily',
                        period: 'day',
                        notes: 'For all ages',
                        lang: 'Portuguese',
                    },
                    headers: {
                        'x-rapidapi-key': RAPIDAPI_KEY,
                        'x-rapidapi-host': 'multilingual-ai-zodiac-customized-horoscopes-for-all-signs.p.rapidapi.com',
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );

            let texto = res.data?.horoscope || res.data?.text || res.data?.prediction || res.data?.description || '';
            if (typeof res.data === 'string') texto = res.data;
            if (!texto && res.data) {
                // Tenta pegar qualquer campo de texto do response
                const vals = Object.values(res.data).filter(v => typeof v === 'string' && v.length > 50);
                if (vals.length) texto = vals[0];
            }

            if (!texto) continue;

            // Se veio em outro idioma, traduzir
            texto = await traduzirSeNecessario(texto);

            const emoji = SIGNOS_EMOJIS[signo] || '⭐';
            const nomePT = SIGNOS_PT[signo] || signo;

            const embed = new EmbedBuilder()
                .setTitle(`${emoji} Horóscopo de ${nomePT}`)
                .setDescription(`> ${texto.substring(0, 1800)}`)
                .setColor(SIGNO_COR[signo] || '#9B59B6')
                .setFooter({ text: `Tema: Horóscopo • ${horarioSP()}` });

            // Adicionar campos extras se disponíveis
            if (res.data?.lucky_number) embed.addFields({ name: '🍀 Número da Sorte', value: `${res.data.lucky_number}`, inline: true });
            if (res.data?.lucky_color) embed.addFields({ name: '🎨 Cor da Sorte', value: `${res.data.lucky_color}`, inline: true });
            if (res.data?.mood) embed.addFields({ name: '😊 Humor', value: `${res.data.mood}`, inline: true });
            if (res.data?.compatibility) embed.addFields({ name: '💕 Compatibilidade', value: `${res.data.compatibility}`, inline: true });

            await enviarEmbed(client, conf.channelId, embed, conf.roleId);
            await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
            console.error(`[EVENT HOROSCOPO] Erro para ${signo}:`, err.message);
        }
    }
}

// ── 9. GOOGLE NEWS (SerpAPI) — Busca personalizada ────────────────────────
// API: https://serpapi.com
// Descrição: Busca personalizada de notícias via Google News sobre qualquer tópico
// Requer Key: Sim (SERP_API_KEY no .env)
// Frequência: Configurável (padrão 6 horas)
// Tópicos separados por vírgula = buscas independentes
async function fireEventoGoogleNews(client, guildId, conf) {
    const SERP_KEY = process.env.SERP_API_KEY || '';
    if (!SERP_KEY) { console.warn('[EVENT GOOGLE NEWS] SERP_API_KEY não configurada no .env'); return; }

    const topicos = parseTopicos(conf.topico);
    if (!topicos.length) return;

    try {
        for (const topico of topicos.slice(0, 5)) {
            const res = await axios.get('https://serpapi.com/search.json', {
                params: { engine: 'google_news', q: topico, hl: 'pt-BR', gl: 'br', api_key: SERP_KEY, num: 5 }
            });

            const noticias = res.data.news_results?.slice(0, 5) || [];

            for (const n of noticias) {
                if (isDuplicate(guildId, 'google_news', n.title)) continue;

                const tituloTrad = await traduzirSeNecessario(n.title);
                const descTrad = n.snippet ? await traduzirSeNecessario(n.snippet) : '';

                const embed = buildNewsEmbed({
                    titulo: tituloTrad,
                    descricao: descTrad,
                    link: n.link,
                    fonte: n.source?.name || 'Fonte desconhecida',
                    tema: topico,
                    cor: '#4285F4',
                    imagem: n.thumbnail || null,
                });

                markSent(guildId, 'google_news', n.title);
                await enviarEmbed(client, conf.channelId, embed, conf.roleId);
                await new Promise(r => setTimeout(r, 1500));
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) { console.error('[EVENT GOOGLE NEWS]', err.message); }
}

// ── 10. STEAM — Promoções ──────────────────────────────────────────────────
// API: https://store.steampowered.com/api
// Descrição: Jogos em destaque com desconto na Steam Store Brasil
// Requer Key: Não (gratuita)
// Frequência: Diário (horário configurável, padrão 12:00)
// Filtro: Apenas jogos com desconto >= 30%
async function fireEventoSteam(client, guildId, conf) {
    try {
        const res = await axios.get(
            'https://store.steampowered.com/api/featuredcategories/?cc=br&l=portuguese'
        );
        const deals = res.data?.specials?.items?.slice(0, 5) || [];

        for (const item of deals) {
            const desconto = item.discount_percent || 0;
            if (desconto < 30) continue;
            if (isDuplicate(guildId, 'steam', item.name)) continue;

            const original = (item.original_price / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const final_   = (item.final_price / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const embed = buildNewsEmbed({
                titulo: `🔥 ${item.name}`,
                descricao: `Em promoção na Steam Store Brasil!\n\n~~${original}~~ → **${final_}** (**-${desconto}%**)`,
                link: `https://store.steampowered.com/app/${item.id}/`,
                fonte: 'Steam Store',
                tema: 'Games',
                cor: '#1B2838',
                imagem: item.large_capsule_image || item.header_image || null,
            });

            markSent(guildId, 'steam', item.name);
            await enviarEmbed(client, conf.channelId, embed, conf.roleId);
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch (err) { console.error('[EVENT STEAM]', err.message); }
}

// ── 11. ELEIÇÕES (CivicAPI) ────────────────────────────────────────────────
// API: https://civicapi.org/api/v2/race/search
// Descrição: Resultados eleitorais recentes ao redor do mundo
// Requer Key: Não (gratuita)
// Frequência: 4 horas
async function fireEventoEleicao(client, guildId, conf) {
    try {
        const country = String(conf.pais || 'br').trim().toUpperCase();
        const res = await axios.get('https://civicapi.org/api/v2/race/search', {
            params: { country, limit: 5 },
            timeout: 10000,
        });
        const elections = Array.isArray(res.data?.races) ? res.data.races.slice(0, 2) : [];

        for (const race of elections) {
            const raceName = race.election_name || race.type || 'Processo Eleitoral';
            const dedupeKey = `${race.id || raceName}:${raceName}`;
            if (isDuplicate(guildId, 'eleicao', dedupeKey)) continue;

            const candidatos = Array.isArray(race.candidates)
                ? [...race.candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0))
                : [];
            const destaque = candidatos.find(c => c.winner) || candidatos[0] || null;
            const apuracao = typeof race.percent_reporting === 'number'
                ? `${race.percent_reporting}%`
                : 'N/A';
            const escopo = [race.election_type, race.province, race.municipality, race.district]
                .filter(Boolean)
                .join(' • ') || 'N/A';
            const descricao = [
                race.type ? `Disputa para ${race.type}.` : null,
                race.province ? `Cobertura em ${race.province}.` : null,
                destaque ? `Destaque atual: ${destaque.name} com ${destaque.percent ?? 'N/A'}%.` : null,
            ].filter(Boolean).join(' ');

            const embed = buildNewsEmbed({
                titulo: `🗳️ ${raceName}`,
                descricao: descricao || 'Informações atualizadas sobre resultados eleitorais.',
                link: 'https://civicapi.org/results',
                fonte: 'civicAPI',
                tema: 'Eleições',
                cor: '#1565C0',
            });
            embed.addFields(
                {
                    name: '📅 Data',
                    value: race.election_date
                        ? new Date(race.election_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                        : 'N/A',
                    inline: true,
                },
                { name: '🌎 País', value: race.country || country, inline: true },
                { name: '📊 Apuração', value: apuracao, inline: true },
                { name: '🧭 Escopo', value: escopo.substring(0, 1024), inline: false },
            );

            if (destaque) {
                embed.addFields({
                    name: '🏆 Destaque',
                    value: `${destaque.name} (${destaque.party || 'Sem partido'})${destaque.percent != null ? ` • ${destaque.percent}%` : ''}`,
                    inline: false,
                });
            }

            markSent(guildId, 'eleicao', dedupeKey);
            await enviarEmbed(client, conf.channelId, embed, conf.roleId);
        }
    } catch (err) { console.error('[EVENT ELEICAO]', formatHttpError(err)); }
}

// ═══════════════════════════════════════════════════════════════════
// ORQUESTRADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

const EVENT_REGISTRY = {
    anime:        { handler: fireEventoAnime,           freq: 24 * 7, type: 'interval' },
    noticias:     { handler: fireEventoNoticias,        freq: 6,      type: 'interval' },
    financeiro:   { handler: fireEventoFinanceiro,      freq: 6,      type: 'interval' },
    cotacao:      { handler: fireEventoCotacao,          freq: 20,     type: 'horario', hora: '09:00' },
    politica_br:  { handler: fireEventoPoliticaBR,      freq: 3,      type: 'interval' },
    politica_mun: { handler: fireEventoPoliticaMundial, freq: 4,      type: 'interval' },
    ia_news:      { handler: fireEventoIANews,          freq: 4,      type: 'interval' },
    horoscopo:    { handler: fireEventoHoroscopo,        freq: 20,     type: 'horario', hora: '08:00' },
    google_news:  { handler: fireEventoGoogleNews,      freq: 6,      type: 'interval' },
    steam:        { handler: fireEventoSteam,            freq: 20,     type: 'horario', hora: '12:00' },
    eleicao:      { handler: fireEventoEleicao,         freq: 4,      type: 'interval' },
    // Retrocompat
    camara:       { handler: fireEventoPoliticaBR,      freq: 4,      type: 'interval' },
};

async function checkAndFireEvents(client) {
    try {
        client.guilds.cache.forEach(async guild => {
            const guildId = guild.id;
            const config  = db.get(`events_${guildId}`) || {};

            for (const [eventKey, registry] of Object.entries(EVENT_REGISTRY)) {
                const conf = config[eventKey];
                if (!conf?.enabled || !conf?.channelId) continue;

                let shouldFire = false;

                if (registry.type === 'horario') {
                    const hora = conf.hora || registry.hora;
                    shouldFire = eHorario(hora) && passouFrequencia(conf.lastSent, registry.freq);
                } else {
                    const freq = parseInt(conf.frequencia) || registry.freq;
                    shouldFire = passouFrequencia(conf.lastSent, freq);
                }

                if (shouldFire) {
                    try {
                        await registry.handler(client, guildId, conf);
                        db.set(`events_${guildId}`, {
                            ...config,
                            [eventKey]: { ...conf, lastSent: new Date().toISOString() }
                        });
                    } catch (err) {
                        console.error(`[EVENT ${eventKey.toUpperCase()}] Erro:`, err.message);
                    }
                }
            }
        });
    } catch (err) {
        console.error('[EVENTS-SCHEDULER] Erro geral:', err.message);
    }
}

// ─── Exporta ─────────────────────────────────────────────────────────────────
module.exports = {
    start(client) {
        setInterval(() => checkAndFireEvents(client), CHECK_INTERVAL);
        console.log('[EVENTS] ✅ Agendador de eventos iniciado (verificação a cada 60s)');
        console.log(`[EVENTS] 📋 ${Object.keys(EVENT_REGISTRY).length} tipos de evento registrados`);
    },

    handlers: {
        anime:        fireEventoAnime,
        noticias:     fireEventoNoticias,
        financeiro:   fireEventoFinanceiro,
        cotacao:      fireEventoCotacao,
        politica_br:  fireEventoPoliticaBR,
        politica_mun: fireEventoPoliticaMundial,
        ia_news:      fireEventoIANews,
        horoscopo:    fireEventoHoroscopo,
        google_news:  fireEventoGoogleNews,
        steam:        fireEventoSteam,
        eleicao:      fireEventoEleicao,
        camara:       fireEventoPoliticaBR,
    },

    registry: EVENT_REGISTRY,
};

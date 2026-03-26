/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          CLIENTE DE IA — Groq + Ollama (local)                  ║
 * ║  Troca entre providers via AI_PROVIDER no .env                  ║
 * ║  AI_PROVIDER=groq  → usa Groq API (padrão)                      ║
 * ║  AI_PROVIDER=ollama → usa Ollama local (localhost:11434)         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Variáveis de ambiente:
 *   AI_PROVIDER          = 'groq' | 'ollama'       (padrão: 'groq')
 *   GROQ_API_KEY         = chave da API Groq
 *   GROQ_MODEL           = modelo Groq              (padrão: llama-3.1-8b-instant)
 *   OLLAMA_MODEL         = modelo Ollama texto      (padrão: llama3.2)
 *   OLLAMA_VISION_MODEL  = modelo Ollama visão      (padrão: llava)
 *   OLLAMA_BASE_URL      = base URL do Ollama       (padrão: http://localhost:11434)
 */

const axios = require('axios');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_GROQ_VISION_MODEL = 'llava-v1.5-7b-4096-preview';

function getOllamaBase() {
    return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
}

function getProvider() {
    return (process.env.AI_PROVIDER || 'groq').toLowerCase();
}

/**
 * Chama Groq API
 * @param {Array} messages - array no formato OpenAI [{role, content}]
 * @param {Object} opts - { maxTokens, temperature, model }
 * @returns {Promise<string>}
 */
async function callGroq(messages, opts = {}) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env');

    const { maxTokens = 400, temperature = 0.4, model = null } = opts;

    const response = await axios.post(
        GROQ_URL,
        {
            model: model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
            temperature,
            max_completion_tokens: maxTokens,
            messages,
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Chama Ollama local (API compatível com OpenAI)
 * @param {Array} messages
 * @param {Object} opts - { maxTokens, temperature, model }
 * @returns {Promise<string>}
 */
async function callOllama(messages, opts = {}) {
    const { maxTokens = 400, temperature = 0.4, model = null } = opts;
    const base = getOllamaBase();

    const response = await axios.post(
        `${base}/v1/chat/completions`,
        {
            model: model || process.env.OLLAMA_MODEL || 'llama3.2',
            temperature,
            max_tokens: maxTokens,
            messages,
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
        }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Função principal — escolhe o provider automaticamente
 * Com fallback: se Ollama estiver configurado mas não responder, usa Groq
 *
 * @param {Array} messages - array [{role: 'system'|'user'|'assistant', content: string}]
 * @param {Object} opts - { maxTokens, temperature, model }
 * @returns {Promise<string>}
 */
async function callAI(messages, opts = {}) {
    const provider = getProvider();

    if (provider === 'ollama') {
        try {
            return await callOllama(messages, opts);
        } catch (err) {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                console.warn('[AI CLIENT] Ollama não disponível, fazendo fallback para Groq...');
                return await callGroq(messages, opts);
            }
            throw err;
        }
    }

    return await callGroq(messages, opts);
}

/**
 * Análise de imagem com visão
 * Usa Ollama (llava) se provider=ollama, Groq vision se provider=groq
 *
 * @param {string} imageUrl - URL pública da imagem
 * @param {string} prompt - instrução para análise
 * @param {Object} opts - { maxTokens, temperature }
 * @returns {Promise<string>}
 */
async function callAIVision(imageUrl, prompt, opts = {}) {
    const provider = getProvider();
    const { maxTokens = 400, temperature = 0.3, model = null } = opts;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } },
            ],
        },
    ];

    if (provider === 'ollama') {
        try {
        return await callOllama(messages, {
            maxTokens,
            temperature,
            model: model || process.env.OLLAMA_VISION_MODEL || 'llava',
        });
        } catch (err) {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                console.warn('[AI CLIENT] Ollama vision não disponível, fazendo fallback para Groq vision...');
            } else {
                throw err;
            }
        }
    }

    // Groq vision
    return await callGroq(messages, {
        maxTokens,
        temperature,
        model: model || DEFAULT_GROQ_VISION_MODEL,
    });
}

/**
 * Retorna info do provider atual (útil para exibir no dashboard)
 * @returns {{ provider: string, model: string, visionModel: string }}
 */
function getProviderInfo() {
    const provider = getProvider();
    if (provider === 'ollama') {
        return {
            provider: 'ollama',
            model: process.env.OLLAMA_MODEL || 'llama3.2',
            visionModel: process.env.OLLAMA_VISION_MODEL || 'llava',
            baseUrl: getOllamaBase(),
        };
    }
    return {
        provider: 'groq',
        model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        visionModel: DEFAULT_GROQ_VISION_MODEL,
        baseUrl: GROQ_URL,
    };
}

module.exports = {
    callAI,
    callAIVision,
    getProviderInfo,
};

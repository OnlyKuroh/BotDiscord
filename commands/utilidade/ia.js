'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { callAI, getProviderInfo } = require('../../utils/ollama-client');

const IA_SYSTEM_PROMPT = `Você é o Itadori, assistente do Discord baseado em Yuji Itadori de Jujutsu Kaisen.
Seja útil, direto e objetivo. Responda sempre em português do Brasil.
Use referências leves ao universo do anime (energia amaldiçoada, domínio, feiticeiro) quando fizer sentido, mas sem exagerar.
Não use markdown pesado. Seja conciso.`.trim();

async function perguntarAI(userText) {
    const provider = getProviderInfo();

    if (provider.provider === 'groq' && !process.env.GROQ_API_KEY) {
        throw new Error('NO_API_KEY');
    }

    const messages = [
        { role: 'system', content: IA_SYSTEM_PROMPT },
        { role: 'user', content: userText.slice(0, 1500) },
    ];

    const content = await callAI(messages, { maxTokens: 400, temperature: 0.5 });
    return { content, model: provider.model };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ia')
        .setDescription('Interaja com o assistente de IA do Itadori Bot')
        .addSubcommand(sub =>
            sub
                .setName('perguntar')
                .setDescription('Faça uma pergunta ao assistente de IA')
                .addStringOption(opt =>
                    opt
                        .setName('texto')
                        .setDescription('O que você quer perguntar?')
                        .setRequired(true)
                        .setMaxLength(1500)
                )
        ),

    aliases: [],
    category: '',
    usage: '/ia perguntar [texto]',
    detailedDescription: 'Envia uma pergunta ao assistente de IA com personalidade do Itadori (Jujutsu Kaisen) e retorna a resposta via Groq (llama-3.1-8b-instant) ou Ollama se configurado.',
    permissions: [],

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub !== 'perguntar') {
            return interaction.reply({ content: 'Subcomando desconhecido.', ephemeral: true });
        }

        if (sub === 'perguntar') {
            const texto = interaction.options.getString('texto');

            await interaction.deferReply();

            let result;
            try {
                result = await perguntarAI(texto);
            } catch (err) {
                if (err.message === 'NO_API_KEY') {
                    const embed = new EmbedBuilder()
                        .setColor(0x7c3aed)
                        .setTitle('⚠️ IA não configurada')
                        .setDescription('A chave de API para o assistente de IA não está configurada. Peça ao administrador do bot para definir `GROQ_API_KEY` no `.env`.')
                        .setFooter({ text: 'Itadori Bot • IA' });

                    return interaction.editReply({ embeds: [embed] });
                }

                console.error('[/ia perguntar]', err.response?.status || err.message);

                const embed = new EmbedBuilder()
                    .setColor(0x7c3aed)
                    .setTitle('❌ Erro ao consultar a IA')
                    .setDescription('Minha energia amaldiçoada caiu por um momento. Tente novamente em alguns segundos.')
                    .setFooter({ text: 'Itadori Bot • IA' });

                return interaction.editReply({ embeds: [embed] });
            }

            const resposta = result.content || 'Não consegui gerar uma resposta. Tente reformular a pergunta.';

            const embed = new EmbedBuilder()
                .setColor(0x7c3aed)
                .setTitle('🤖 Itadori responde')
                .setDescription(resposta.slice(0, 4096))
                .addFields({ name: 'Pergunta', value: texto.slice(0, 1024) })
                .setFooter({ text: `Modelo: ${result.model} • Itadori Bot` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },
};

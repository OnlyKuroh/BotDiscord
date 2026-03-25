const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

// Dica: No futuro, coloque isso num arquivo .env
const api = '648jsbe72cdt2oqf7cpjasd6s29o1t82jd0hooez';

// - Função rápida de tradução (com fallback de segurança)
async function traduzir(texto) {
    if (!texto) return 'Desconhecido';
    try {
        const res = await translate(texto, { to: 'pt' });
        return res.text;
    } catch {
        return texto;
    }
}

// - Tradução limpa e mapeada da precipitação
function traduzPrecipitacao(tipo) {
    const map = {
        'none': 'Nenhuma',
        'rain': 'Chuva',
        'snow': 'Neve',
        'rain_snow': 'Chuva e Neve',
        'ice pellets': 'Granizo',
        'frozen rain': 'Chuva Congelada'
    };
    return map[tipo] || tipo;
}

// - Remove acentos para garantir que a Meteosource encontre a cidade
function normalizeCity(city) {
    return city.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clima')
        .setDescription('Comando para obter informações sobre o clima')
        .addStringOption(option => option.setName('cidade').setDescription('Nome da Cidade').setRequired(false)),

    aliases: ['clima', 'weather', 'tempo'],
    detailedDescription: 'Comando para obter informações climáticas detalhadas. O design foi otimizado para uma leitura clara.',
    usage: '`/clima [cidade]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        
        // UX Inteligente: Se não digitar nada, assume a cidade padrão
        const query = interaction.options.getString('cidade') || 'Goiânia';

        try {
            // 1. Pega o ID correto da cidade (Forçamos 'en' para não dar erro 422)
            const normalizedQuery = normalizeCity(query);
            const urlFind = `https://www.meteosource.com/api/v1/free/find_places?text=${encodeURIComponent(normalizedQuery)}&language=en&key=${api}`;
            
            const resFind = await axios.get(urlFind);
            if (!resFind.data || resFind.data.length === 0) {
                const embedErro = new EmbedBuilder()
                    .setTitle('❌ Local não encontrado')
                    .setDescription(`Não consegui localizar a cidade **${query}** no radar.`)
                    .setColor('#ED4245');
                return interaction.editReply({ embeds: [embedErro] });
            }

            const placeId = resFind.data[0].place_id;

            // 2. Busca os dados climáticos atuais (Sem o language=pt para evitar quebra)
            const urlWeather = `https://www.meteosource.com/api/v1/free/point?place_id=${placeId}&sections=current&language=en&units=metric&key=${api}`;
            const resWeather = await axios.get(urlWeather);
            const c = resWeather.data.current;

            if (!c) throw new Error("Dados climáticos vazios.");

            // 3. Traduzindo o resumo na hora
            const resumoTraduzido = await traduzir(c.summary);

            // 4. Construindo um visual de alto nível (Grid Estático 3x3 com respiros)
            const embedInfo = new EmbedBuilder()
                .setTitle(`🌤️ Clima em ${resFind.data[0].name}`)
                .setDescription(`> **${resumoTraduzido}**`)
                .setColor('#2F3136')
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ text: `Radar ativado por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: '🌡️ Temperatura', value: `\`${c.temperature}°C\``, inline: true },
                    { name: '💧 Umidade', value: `\`${c.humidity}%\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // Respiro

                    { name: '💨 Vento', value: `\`${c.wind.speed} m/s\` (${c.wind.dir})`, inline: true },
                    { name: '☔ Precipitação', value: `\`${c.precipitation.total}mm\` (${traduzPrecipitacao(c.precipitation.type)})`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // Respiro

                    { name: '☁️ Nuvens', value: `\`${c.cloud_cover}%\``, inline: true },
                    { name: '☀️ Índice UV', value: `\`${c.uv_index}\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true } // Respiro
                );

            await interaction.editReply({ content: formatResponse(''), embeds: [embedInfo] });

        } catch (err) {
            console.error('clima error:', err);
            const embedErro = new EmbedBuilder()
                .setTitle('❌ Falha na Conexão')
                .setDescription('As antenas meteorológicas estão fora do ar. Tente novamente mais tarde.')
                .setColor('#ED4245');
            await interaction.editReply({ content: formatResponse(''), embeds: [embedErro] });
        }
    }
};
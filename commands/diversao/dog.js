const translate = require('google-translate-api-x');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const api = 'live_10sQm2L0HfPdTu0zlOPr3muyDtIzDmFWLd1wEjoOYqFGKkN9cxC0HxU2h1PSJxhI';

// - Transforma o código do país na bandeira em emoji
function getFlagEmoji(countryCode) {
    if (!countryCode) return '🌍';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

// - Limpa o texto sujo da API e troca palavras por emojis para o peso e altura
function formatarTamanho(str) {
    if (!str) return 'Desconhecido';
    return str.replace(/Male:/ig, '♂️ ').replace(/Female:/ig, '♀️ ').replace(/;/g, ' | ');
}

// - Função auxiliar para traduzir tudo de uma vez sem tomar block do Google
async function traduzirLote(textos) {
    const textoAgrupado = textos.join('\n');
    try {
        const res = await translate(textoAgrupado, { to: 'pt' });
        return res.text.split('\n');
    } catch (e) {
        return textos; // Fallback: se der erro, volta o original em inglês
    }
}

// - Função Levenshtein para similaridade de nomes (pesquisa inteligente)
function getClosestBreed(query, breedData) {
    function levenshtein(a, b) {
        if (!a || !b) return Math.max(a.length, b.length);
        const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
        for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        return matrix[a.length][b.length];
    }
    let minDist = Infinity;
    let closest = null;
    for (const breed of breedData) {
        const dist = levenshtein(query.toLowerCase(), breed.name.toLowerCase());
        if (dist < minDist) {
            minDist = dist;
            closest = breed;
        }
    }
    return closest;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Comando para obter informações sobre raças de cachorros')
        .addStringOption(option => option.setName('raça').setDescription('Nome da raça').setRequired(false)),

    aliases: ['dog', 'cachorro', 'raça', 'dogs'],
    detailedDescription: 'Use este comando para obter informações sobre raças de cachorros. Você pode fornecer o nome da raça ou deixar em branco para uma raça aleatória.',
    usage: '`/dog [Nome da Raça]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('raça') || '';
        let url = 'https://api.thedogapi.com/v1/breeds';
        let breedData = [];
        const headers = { 'x-api-key': api };

        try {
            const res = await axios.get(url, { headers });
            breedData = res.data;
        } catch (err) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Erro ao buscar raças')
                .setDescription('Não foi possível conectar com a API de cachorros no momento.')
                .setColor('#ED4245');
            return interaction.editReply({ content: 'Ops, falha na conexão. Tente novamente mais tarde.', embeds: [embed] });
        }

        let breed = null;
        if (query) {
            breed = breedData.find(b => b.name.toLowerCase().includes(query.toLowerCase()));
            if (!breed) breed = getClosestBreed(query, breedData);
        }
        if (!breed) breed = breedData[Math.floor(Math.random() * breedData.length)];

        let imageUrl = breed.image?.url || '';

        // - Montando array para tradução em lote
        const textosParaTraduzir = [
            breed.description || 'Sem descrição detalhada disponível para esta raça.',
            breed.origin || 'Desconhecida',
            breed.temperament || 'Desconhecido',
            breed.life_span || 'Desconhecida',
            breed.bred_for || 'Desconhecido',
            breed.breed_group || 'Desconhecido'
        ];

        const traduzidos = await traduzirLote(textosParaTraduzir);
        
        const desc = traduzidos[0] || textosParaTraduzir[0];
        const origem = traduzidos[1] || textosParaTraduzir[1];
        const temperamento = traduzidos[2] || textosParaTraduzir[2];
        const vida = traduzidos[3] || textosParaTraduzir[3];
        const criadoPara = traduzidos[4] || textosParaTraduzir[4];
        const grupo = traduzidos[5] || textosParaTraduzir[5];

        // - Tratamento visual dos dados
        const bandeira = breed.country_code ? getFlagEmoji(breed.country_code) : '🌍';
        const origemFormatada = origem !== 'Desconhecida' ? `${bandeira} ${origem}` : '🌍 Desconhecida';
        const pesoTratado = formatarTamanho(breed.weight?.metric) + ' kg';
        const alturaTratada = formatarTamanho(breed.height?.metric) + ' cm';

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('dog_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dog_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('dog_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
            );

        const embedHome = new EmbedBuilder()
            .setTitle(`🐾 | Raça: ${breed.name}`)
            .setDescription(`> ${desc}`)
            .setColor('#2b2d31')
            .setImage(imageUrl)
            .setThumbnail(imageUrl)
            .setTimestamp()
            .setFooter({ text: `Pedido por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

        await interaction.editReply({ embeds: [embedHome], components: [row] });

        const embedInfo = new EmbedBuilder()
            .setTitle(`📋 | Ficha Técnica: ${breed.name}`)
            .setColor('#2b2d31')
            .setThumbnail(imageUrl)
            .setTimestamp()
            .setFooter({ text: `Pedido por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .addFields(
                { name: '🌍 Origem', value: origemFormatada, inline: true },
                { name: '⏳ Vida Útil', value:`\`${vida}\``, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '⚖️ Peso', value: `> ${pesoTratado}`, inline: false },
                { name: '📏 Altura', value: `> ${alturaTratada}`, inline: false },
                { name: '🧠 Temperamento', value: temperamento, inline: false },
                { name: '🛠️ Função Original', value: criadoPara, inline: true },
                { name: '🗂️ Grupo', value: grupo, inline: true }
            );

        const filter = i => i.customId.startsWith('dog_') && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'dog_home' || i.customId === 'dog_prev') {
                await i.update({ embeds: [embedHome], components: [row] });
            } else if (i.customId === 'dog_next') {
                await i.update({ embeds: [embedInfo], components: [row] });
            }
        });

        collector.on('end', () => {
            // Desativa os botões após 1 minuto para não deixar lixo interativo no chat
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('dog_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('dog_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('dog_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },

    async run(message, args) {
        // - Mesma lógica robusta para o comando de prefixo
        const query = args.join(' ') || '';
        let url = 'https://api.thedogapi.com/v1/breeds';
        let breedData = [];
        const headers = { 'x-api-key': api };

        try {
            const res = await axios.get(url, { headers });
            breedData = res.data;
        } catch (err) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Erro ao buscar raças')
                .setDescription('Não foi possível conectar com a API de cachorros no momento.')
                .setColor('#ED4245');
            return message.reply({ content: 'Ops, falha na conexão. Tente novamente mais tarde.', embeds: [embed] });
        }

        let breed = null;
        if (query) {
            breed = breedData.find(b => b.name.toLowerCase().includes(query.toLowerCase()));
            if (!breed) breed = getClosestBreed(query, breedData);
        }
        if (!breed) breed = breedData[Math.floor(Math.random() * breedData.length)];

        let imageUrl = breed.image?.url || '';

        const textosParaTraduzir = [
            breed.description || 'Sem descrição detalhada disponível para esta raça.',
            breed.origin || 'Desconhecida',
            breed.temperament || 'Desconhecido',
            breed.life_span || 'Desconhecida',
            breed.bred_for || 'Desconhecido',
            breed.breed_group || 'Desconhecido'
        ];

        const traduzidos = await traduzirLote(textosParaTraduzir);
        
        const desc = traduzidos[0] || textosParaTraduzir[0];
        const origem = traduzidos[1] || textosParaTraduzir[1];
        const temperamento = traduzidos[2] || textosParaTraduzir[2];
        const vida = traduzidos[3] || textosParaTraduzir[3];
        const criadoPara = traduzidos[4] || textosParaTraduzir[4];
        const grupo = traduzidos[5] || textosParaTraduzir[5];

        const bandeira = breed.country_code ? getFlagEmoji(breed.country_code) : '🌍';
        const origemFormatada = origem !== 'Desconhecida' ? `${bandeira} ${origem}` : '🌍 Desconhecida';
        const pesoTratado = formatarTamanho(breed.weight?.metric) + ' kg';
        const alturaTratada = formatarTamanho(breed.height?.metric) + ' cm';

        const embed = new EmbedBuilder()
            .setTitle(`🐾 | Ficha Técnica: ${breed.name}`)
            .setDescription(`> ${desc}`)
            .setColor('#2b2d31')
            .setTimestamp()
            .addFields(
                { name: '🌍 Origem', value: origemFormatada, inline: true },
                { name: '⏳ Vida Útil', value:`\`${vida}\``, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '⚖️ Peso', value: `> ${pesoTratado}`, inline: false },
                { name: '📏 Altura', value: `> ${alturaTratada}`, inline: false },
                { name: '🧠 Temperamento', value: temperamento, inline: false },
                { name: '🛠️ Função Original', value: criadoPara, inline: true },
                { name: '🗂️ Grupo', value: grupo, inline: true }
            );

        if (imageUrl) embed.setImage(imageUrl);

        await message.reply({ embeds: [embed] });
    }
};
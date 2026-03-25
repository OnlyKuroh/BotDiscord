const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

// - Função auxiliar para traduzir em lote (super rápida)
async function traduzirLote(textos) {
    const textoAgrupado = textos.join('\n');
    try {
        const res = await translate(textoAgrupado, { to: 'pt' });
        return res.text.split('\n');
    } catch (e) {
        return textos; // Fallback se o Google bloquear
    }
}

// - Função estética para alinhar o gênero
function formatarGenero(gender) {
    if (!gender) return 'Desconhecido';
    if (gender.toLowerCase() === 'male') return '♂️ Masculino';
    if (gender.toLowerCase() === 'female') return '♀️ Feminino';
    return `⚧️ ${gender}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dragonball')
        .setDescription('Comando para buscar informações sobre personagens da série Dragon Ball')
        .addStringOption(option => option.setName('query').setDescription('Nome do personagem').setRequired(true)), // Mudei para true para evitar busca vazia quebrando a API

    aliases: ['dragonballapi', 'dbapi', 'dbz'],
    detailedDescription: 'Busque informações completas sobre personagens da série Dragon Ball. Puxa dados como Ki, Planeta e Raça, tudo traduzido.',
    usage: '`/dragonball [nome]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query');

        try {
            // 1. Busca relâmpago para achar o ID do personagem
            const searchUrl = `https://dragonball-api.com/api/characters?name=${encodeURIComponent(query)}`;
            const searchRes = await axios.get(searchUrl);
            const characters = searchRes.data;

            if (!Array.isArray(characters) || characters.length === 0) {
                const embedErro = new EmbedBuilder()
                    .setTitle('❌ Personagem não encontrado')
                    .setDescription(`Não consegui achar ninguém com o nome **${query}** nos registros do Universo 7.`)
                    .setColor('#ED4245');
                return interaction.editReply({ embeds: [embedErro] });
            }

            // 2. Com o ID em mãos, puxamos o banco de dados completo dele
            const charId = characters[0].id;
            const fullRes = await axios.get(`https://dragonball-api.com/api/characters/${charId}`);
            const char = fullRes.data;

            // Separando textos para tradução em uma paulada só
            const textosParaTraduzir = [
                char.description || 'Nenhuma descrição disponível nos arquivos.',
                char.race || 'Desconhecida',
                char.affiliation || 'Desconhecida',
                char.originPlanet?.name || 'Desconhecido'
            ];

            const traduzidos = await traduzirLote(textosParaTraduzir);
            
            const desc = traduzidos[0] || textosParaTraduzir[0];
            const raca = traduzidos[1] || textosParaTraduzir[1];
            const afiliacao = traduzidos[2] || textosParaTraduzir[2];
            const planeta = traduzidos[3] || textosParaTraduzir[3];

            // Montagem dos botões de navegação
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('dbz_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('dbz_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('dbz_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
                );

            // PÁGINA 1: Estética visual (Foco na arte e na história)
            const embedHome = new EmbedBuilder()
                .setTitle(`🐉 ${char.name}`)
                .setDescription(`> ${desc}`)
                .setColor('#FF8C00') // Laranja clássico do DBZ
                .setImage(char.image)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ text: `Rastreador de Ki ligado por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

            await interaction.editReply({ content: formatResponse(''), embeds: [embedHome], components: [row] });

            // PÁGINA 2: Dados frios e calculistas (Foco em grid perfeito)
            const embedInfo = new EmbedBuilder()
                .setTitle(`📊 Ficha de Combate: ${char.name}`)
                .setColor('#FF8C00')
                .setThumbnail(char.image)
                .setTimestamp()
                .setFooter({ text: `Rastreador de Ki ligado por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: '🧬 Raça', value: raca, inline: true },
                    { name: '⚧️ Gênero', value: formatarGenero(char.gender), inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // Respiro visual
                    
                    { name: '💥 Ki Base', value: `\`${char.ki}\``, inline: true },
                    { name: '🔥 Ki Máximo', value: `\`${char.maxKi}\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // Respiro visual
                    
                    { name: '🛡️ Afiliação', value: afiliacao, inline: true },
                    { name: '🪐 Planeta Nativo', value: planeta, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true } // Respiro visual
                );

            // Collector para interagir com os botões
            const filter = i => i.customId.startsWith('dbz_') && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'dbz_home' || i.customId === 'dbz_prev') {
                    await i.update({ embeds: [embedHome], components: [row] });
                } else if (i.customId === 'dbz_next') {
                    await i.update({ embeds: [embedInfo], components: [row] });
                }
            });

            collector.on('end', () => {
                // Desliga os botões para manter o chat limpo
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('dbz_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('dbz_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId('dbz_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });

        } catch (err) {
            console.error('dragonball error:', err);
            await interaction.editReply({ content: formatResponse('Ops, o Scouter quebrou tentando buscar os dados. Tente novamente mais tarde.') });
        }
    }
};
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cena')
        .setDescription('Descubra de qual anime é uma imagem/print (Com múltiplas opções)')
        .addAttachmentOption(option => option.setName('imagem').setDescription('Envie o print da cena').setRequired(true)),

    aliases: ['cena', 'trace', 'qual-anime'],
    detailedDescription: 'Faz uma busca reversa de imagem usando trace.moe e lista os 5 resultados mais prováveis em um carrossel.',
    usage: '`/cena [imagem]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const anexo = interaction.options.getAttachment('imagem');

        // Validação rápida de formato
        if (!anexo.contentType || !anexo.contentType.startsWith('image/')) {
            return interaction.editReply({ content: formatResponse('❌ Por favor, envie um arquivo de imagem válido (PNG, JPG).') });
        }

        try {
            // Busca na API
            const res = await axios.get(`https://api.trace.moe/search?anilistInfo&url=${encodeURIComponent(anexo.url)}`);
            const resultados = res.data.result;

            if (!resultados || resultados.length === 0) {
                return interaction.editReply({ content: formatResponse('❌ Não consegui identificar essa cena nos meus registros.') });
            }

            // Pega os 5 melhores resultados para montarmos a galeria
            const topResultados = resultados.slice(0, 5);
            let pagAtual = 0;

            // Função para renderizar o Embed dinamicamente
            const gerarEmbed = (index) => {
                const match = topResultados[index];
                const similaridade = (match.similarity * 100).toFixed(1);
                const tituloAnime = match.anilist.title.romaji || match.anilist.title.english || 'Título Desconhecido';
                const episodio = match.episode || 'Filme/Especial';
                
                const minutos = Math.floor(match.from / 60);
                const segundos = Math.floor(match.from % 60).toString().padStart(2, '0');
                const tempoExato = `${minutos}:${segundos}`;

                return new EmbedBuilder()
                    .setTitle(`🔍 Busca Visual - Opção ${index + 1} de ${topResultados.length}`)
                    .setDescription(`> Correspondência de **${similaridade}%** com a arte original enviada.`)
                    .setColor('#2F3136')
                    .setImage(match.image) // O frame exato que a API achou
                    .setThumbnail(anexo.url) // A imagem que você mandou, para comparação lado a lado
                    .addFields(
                        { name: '📺 Obra Oficial', value: `\`${tituloAnime}\``, inline: true },
                        { name: '🎞️ Episódio', value: `\`${episodio}\``, inline: true },
                        { name: '⏱️ Minutagem', value: `\`${tempoExato}\``, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Análise solicitada por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
            };

            // Função para ligar/desligar as setinhas dependendo da página
            const atualizarBotoes = (index, total) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('cena_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
                    new ButtonBuilder().setCustomId('cena_home').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('cena_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(index === total - 1)
                );
            };

            // Dispara a primeira página
            await interaction.editReply({
                content: formatResponse(''),
                embeds: [gerarEmbed(pagAtual)],
                components: [atualizarBotoes(pagAtual, topResultados.length)]
            });

            // Coletor de cliques
            const filter = i => i.customId.startsWith('cena_') && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'cena_prev' && pagAtual > 0) pagAtual--;
                else if (i.customId === 'cena_next' && pagAtual < topResultados.length - 1) pagAtual++;
                else if (i.customId === 'cena_home') {
                    collector.stop();
                    return; 
                }
                await i.update({ embeds: [gerarEmbed(pagAtual)], components: [atualizarBotoes(pagAtual, topResultados.length)] });
            });

            collector.on('end', () => {
                const botoesDesativados = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('cena_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('cena_home').setEmoji('⏹️').setStyle(ButtonStyle.Danger).setDisabled(true),
                    new ButtonBuilder().setCustomId('cena_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                interaction.editReply({ components: [botoesDesativados] }).catch(() => {});
            });

        } catch (err) {
            console.error('Trace.moe erro:', err);
            await interaction.editReply({ content: formatResponse('❌ Houve um erro de conexão com a base de busca visual.') });
        }
    }
};
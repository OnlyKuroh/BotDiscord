const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

// Tradutor otimizado
async function traduzirLote(textos) {
    const limpos = textos.map(t => t ? t : 'Desconhecido');
    try {
        const res = await translate(limpos.join(' | '), { to: 'pt' });
        return res.text.split(' | ');
    } catch {
        return limpos; // Fallback anti-quebra
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('naruto')
        .setDescription('Consulte os arquivos secretos do Universo Naruto (Dattebayo API)')
        .addStringOption(option => option.setName('ninja').setDescription('Nome do Personagem').setRequired(true)),

    aliases: ['dattebayo', 'shinobi', 'ninja'],
    detailedDescription: 'Sistema focado em design. Página 1: Arte, Página 2: Ficha Ninja, Página 3: Arsenal de Jutsus.',
    usage: '`/naruto [nome]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('ninja').trim();

        try {
            // Requisição direto na base da Dattebayo API
            const res = await axios.get(`https://dattebayo-api.onrender.com/characters?name=${encodeURIComponent(query)}`);
            const personagens = res.data.characters;

            if (!personagens || personagens.length === 0) {
                return interaction.editReply({ content: formatResponse(`❌ Dossiê de **${query}** não foi encontrado nos arquivos da ANBU.`) });
            }

            const ninja = personagens[0];
            const imagem = ninja.images[0] || 'https://via.placeholder.com/300x400.png?text=Sem+Imagem';
            
            // Dados estruturais
            const clã = ninja.personal?.clan || 'Desconhecido';
            const vila = (ninja.personal?.affiliation && Array.isArray(ninja.personal.affiliation)) ? ninja.personal.affiliation[0] : (ninja.personal?.affiliation || 'Desconhecida');
            const rank = ninja.personal?.classification || 'Desconhecido';
            const jutsusArray = ninja.jutsu || [];
            
            // Traduzindo informações importantes simultaneamente
            const [claPT, vilaPT, rankPT] = await traduzirLote([clã, vila, rank]);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('nar_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('nar_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('nar_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
            );

            // =====================================
            // PÁGINA 1: IMPACTO VISUAL (A Arte)
            // =====================================
            const embedHome = new EmbedBuilder()
                .setTitle(`📜 Registro Shinobi: ${ninja.name}`)
                .setDescription(`> Este Dossiê pertence a **${ninja.name}**. Acesse as páginas seguintes para ler os dados de inteligência de combate, herança genética e histórico de missões do livro bingo.`)
                .setColor('#FF7A00') // Laranja clássico
                .setImage(imagem)
                .setFooter({ text: `Página 1/3 • Acessado por ${interaction.user.username}` });

            // =====================================
            // PÁGINA 2: DADOS CADASTRAIS (Fria e calculista)
            // =====================================
            const embedStats = new EmbedBuilder()
                .setTitle(`🗂️ Inteligência Tática: ${ninja.name}`)
                .setColor('#FF7A00')
                .setThumbnail(imagem)
                .addFields(
                    { name: '🧬 Clã', value: `\`${claPT}\``, inline: true },
                    { name: '🛡️ Afiliação', value: `\`${vilaPT}\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '🎖️ Classificação', value: `> ${rankPT}`, inline: false }
                );
            
            // Tratamento das naturezas de Chakra
            if (ninja.natureType && ninja.natureType.length > 0) {
                const naturezas = ninja.natureType.map(n => `\`${n}\``).join(' ');
                embedStats.addFields({ name: '🌀 Naturezas de Chakra', value: naturezas, inline: false });
            }
            embedStats.setFooter({ text: `Página 2/3 • Acessado por ${interaction.user.username}` });

            // =====================================
            // PÁGINA 3: ARSENAL E JUTSUS
            // =====================================
            const embedJutsus = new EmbedBuilder()
                .setTitle(`⚔️ Arsenal de Combate: ${ninja.name}`)
                .setColor('#FF7A00')
                .setThumbnail(imagem);

            if (jutsusArray.length > 0) {
                // Seleciona no máximo os 10 primeiros jutsus para não estourar o limite do Embed do Discord
                const jutsusListados = jutsusArray.slice(0, 10).map(j => `• ${j}`).join('\n');
                embedJutsus.setDescription(`**Jutsus Conhecidos:**\n\`\`\`\n${jutsusListados}\n\`\`\`\n*(Apenas os 10 primeiros registrados nas crônicas)*`);
            } else {
                embedJutsus.setDescription('Nenhum Jutsu documentado para este usuário.');
            }
            embedJutsus.setFooter({ text: `Página 3/3 • Acessado por ${interaction.user.username}` });

            // Lógica de navegação
            let pagAtual = 0;
            const embeds = [embedHome, embedStats, embedJutsus];

            await interaction.editReply({ content: formatResponse(''), embeds: [embeds[0]], components: [row] });

            const collector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 60000 });
            collector.on('collect', async i => {
                if (i.customId === 'nar_prev') pagAtual = (pagAtual > 0) ? pagAtual - 1 : embeds.length - 1;
                else if (i.customId === 'nar_home') pagAtual = 0;
                else if (i.customId === 'nar_next') pagAtual = (pagAtual < embeds.length - 1) ? pagAtual + 1 : 0;
                
                await i.update({ embeds: [embeds[pagAtual]], components: [row] });
            });

            collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));

        } catch (err) {
            console.error('Dattebayo error:', err);
            await interaction.editReply({ content: formatResponse('❌ Os pergaminhos estão selados. Ocorreu um erro ao conectar com a base de dados.') });
        }
    }
};
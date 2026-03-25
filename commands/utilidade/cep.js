const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cep')
        .setDescription('🇧🇷 Consulta endereço completo de um CEP brasileiro')
        .addStringOption(opt =>
            opt.setName('cep').setDescription('CEP (somente números, ex: 01310100)').setRequired(true)
        ),

    aliases: ['cep', 'endereco', 'endereço'],
    detailedDescription: 'Consulta endereço completo via BrasilAPI. Retorna logradouro, bairro, cidade, estado e coordenadas geográficas.',
    usage: '`/cep [numero]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const cepRaw = interaction.options.getString('cep').replace(/\D/g, '');

        if (cepRaw.length !== 8) {
            return interaction.editReply({ content: formatResponse('❌ CEP inválido. Informe apenas os 8 dígitos, ex: `01310100`.') });
        }

        try {
            const res = await axios.get(`https://brasilapi.com.br/api/cep/v2/${cepRaw}`);
            const d = res.data;

            const estadoNome = d.state || 'N/A';
            const cidadeNome = d.city  || 'N/A';
            const bairro     = d.neighborhood || 'N/A';
            const logradouro = d.street || 'N/A';
            const lat        = d.location?.coordinates?.latitude;
            const lng        = d.location?.coordinates?.longitude;

            // Cores por região
            const corEstado = {
                'SP': '#FF6B00', 'RJ': '#009B3A', 'MG': '#4B0082', 'RS': '#DC143C',
                'SC': '#0047AB', 'PR': '#228B22', 'BA': '#DAA520', 'GO': '#FF8C00',
                'DF': '#1E90FF', 'AM': '#006400', 'CE': '#8B0000',
            };
            const cor = corEstado[estadoNome] || '#009C3B';

            const mapLink = lat && lng
                ? `https://maps.google.com/?q=${lat},${lng}`
                : `https://maps.google.com/?q=${encodeURIComponent(`${logradouro}, ${bairro}, ${cidadeNome} - ${estadoNome}`)}`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('📍 Ver no Mapa').setURL(mapLink).setStyle(ButtonStyle.Link)
            );

            const embed = new EmbedBuilder()
                .setTitle(`📮 CEP ${cepRaw.replace(/(\d{5})(\d{3})/, '$1-$2')}`)
                .setColor(cor)
                .addFields(
                    { name: '📍 Logradouro', value: `> ${logradouro}`, inline: false },
                    { name: '🏘️ Bairro',     value: `\`${bairro}\``,   inline: true  },
                    { name: '🏙️ Cidade',     value: `\`${cidadeNome}\``, inline: true },
                    { name: '🗺️ Estado',     value: `\`${estadoNome}\``, inline: true },
                )
                .setFooter({ text: `Consultado por ${interaction.user.username} • BrasilAPI` })
                .setTimestamp();

            if (lat && lng) {
                embed.addFields({
                    name: '🌐 Coordenadas',
                    value: `\`${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}\``,
                    inline: false
                });
            }

            await interaction.editReply({ content: formatResponse(''), embeds: [embed], components: [row] });

        } catch (err) {
            if (err.response?.status === 404) {
                return interaction.editReply({ content: formatResponse(`❌ CEP **${cepRaw}** não encontrado. Verifique o número e tente novamente.`) });
            }
            console.error('[CEP]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar o CEP. Tente novamente mais tarde.') });
        }
    }
};

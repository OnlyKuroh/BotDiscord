const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fipe')
        .setDescription('🚗 Consulta preço FIPE de veículo pelo código ou pesquisa por modelo')
        .addStringOption(opt =>
            opt.setName('codigo_ou_modelo').setDescription('Código FIPE (ex: 004223-1) ou nome do veículo (ex: Civic)').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('tipo').setDescription('Tipo de veículo').setRequired(false)
                .addChoices(
                    { name: '🚗 Carros', value: 'carros' },
                    { name: '🏍️ Motos',  value: 'motos'  },
                    { name: '🚚 Caminhões', value: 'caminhoes' },
                )
        ),

    aliases: ['fipe', 'carro', 'veiculo', 'veículo', 'moto'],
    detailedDescription: 'Consulta a tabela FIPE de veículos via BrasilAPI. Pesquise pelo código FIPE direto ou pelo nome do modelo.',
    usage: '`/fipe [codigo ou modelo] [tipo?]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('codigo_ou_modelo').trim();
        const tipo  = interaction.options.getString('tipo') || 'carros';

        // Detecta se é código FIPE (ex: 004223-1 ou 004223)
        const isCodigoFipe = /^\d{6}-?\d$/.test(query.replace(/\s/g, ''));

        try {
            if (isCodigoFipe) {
                // Consulta direta pelo código
                const codigo = query.replace(/\s/g, '');
                const res = await axios.get(`https://brasilapi.com.br/api/fipe/preco/v1/${codigo}`);
                const data = Array.isArray(res.data) ? res.data : [res.data];
                await enviarResultadosFipe(interaction, data, codigo);
            } else {
                // Busca por marcas → veículos → filtra por nome
                await interaction.editReply({ content: formatResponse('🔍 Buscando na tabela FIPE, aguarde...') });

                const marcasRes = await axios.get(`https://brasilapi.com.br/api/fipe/marcas/v1/${tipo}`);
                const marcas    = marcasRes.data;

                // Filtra marcas que coincidem com a query (nome do modelo pode incluir a marca)
                const termosQuery = query.toLowerCase().split(' ');
                let veiculosEncontrados = [];

                // Busca em até 5 marcas relevantes para não travar
                const marcasFiltradas = marcas.filter(m =>
                    termosQuery.some(t => m.nome.toLowerCase().includes(t))
                ).slice(0, 5);

                // Se não encontrou marca, busca nas 3 primeiras marcas mais populares
                const marcasBuscar = marcasFiltradas.length ? marcasFiltradas :
                    marcas.filter(m => ['FIAT','CHEVROLET','VOLKSWAGEN','FORD','HONDA','TOYOTA','HYUNDAI']
                        .some(p => m.nome.includes(p))).slice(0, 4);

                for (const marca of marcasBuscar) {
                    try {
                        const veicRes = await axios.get(`https://brasilapi.com.br/api/fipe/veiculos/v1/${tipo}/${marca.valor}`);
                        const encontrados = veicRes.data.filter(v =>
                            termosQuery.every(t => v.nome.toLowerCase().includes(t))
                        ).slice(0, 2);
                        veiculosEncontrados.push(...encontrados);
                        if (veiculosEncontrados.length >= 5) break;
                    } catch { /* continua */ }
                }

                if (!veiculosEncontrados.length) {
                    return interaction.editReply({ content: formatResponse(`❌ Nenhum veículo encontrado para **${query}**. Tente usar o código FIPE direto.`) });
                }

                // Pega o primeiro resultado e busca o preço
                const veiculo = veiculosEncontrados[0];
                const precoRes = await axios.get(`https://brasilapi.com.br/api/fipe/preco/v1/${veiculo.valor}`);
                const data = Array.isArray(precoRes.data) ? precoRes.data : [precoRes.data];
                await enviarResultadosFipe(interaction, data, veiculo.valor, veiculosEncontrados);
            }

        } catch (err) {
            if (err.response?.status === 404) {
                return interaction.editReply({ content: formatResponse(`❌ Código FIPE **${query}** não encontrado.`) });
            }
            console.error('[FIPE]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar a tabela FIPE. Tente novamente.') });
        }
    }
};

async function enviarResultadosFipe(interaction, data, codigo, outrosVeiculos = []) {
    const v = data[0]; // Referência mais recente

    const corTipo = {
        'Carros': '#FF6B00',
        'Motos':  '#5865F2',
        'Caminhões': '#8B4513',
    }[v.tipoVeiculo] || '#009C3B';

    // Histórico de preços (múltiplas referências)
    let historico = '';
    if (data.length > 1) {
        historico = data.slice(0, 5).map(h =>
            `• **${h.mesReferencia}**: \`${h.valor}\``
        ).join('\n');
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🔍 Ver no FIPE')
            .setURL(`https://www.tabelafipe.com.br/`)
            .setStyle(ButtonStyle.Link)
    );

    const embed = new EmbedBuilder()
        .setTitle(`🚗 ${v.modelo}`)
        .setColor(corTipo)
        .addFields(
            { name: '🏷️ Código FIPE', value: `\`${codigo}\``,                 inline: true },
            { name: '🏭 Marca',        value: `\`${v.marca}\``,                inline: true },
            { name: '📅 Ano',          value: `\`${v.anoModelo}\``,            inline: true },
            { name: '⛽ Combustível',  value: `\`${v.combustivel}\``,          inline: true },
            { name: '📆 Referência',   value: `\`${v.mesReferencia}\``,        inline: true },
            { name: '🚙 Tipo',         value: `\`${v.tipoVeiculo}\``,          inline: true },
        )
        .addFields({
            name: '💰 Preço FIPE',
            value: `# ${v.valor}`,
            inline: false
        })
        .setFooter({ text: 'Tabela FIPE • Os valores são de referência e podem variar no mercado' })
        .setTimestamp();

    if (historico) {
        embed.addFields({ name: '📈 Histórico de Preços', value: historico, inline: false });
    }

    if (outrosVeiculos.length > 1) {
        const outros = outrosVeiculos.slice(1, 4).map(v => `• ${v.nome} (\`${v.valor}\`)`).join('\n');
        embed.addFields({ name: '🔎 Outros resultados encontrados', value: outros + '\n*Use o código FIPE para buscar diretamente*', inline: false });
    }

    await interaction.editReply({ content: null, embeds: [embed], components: [row] });
}

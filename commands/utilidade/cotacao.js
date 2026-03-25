const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

const MOEDAS = {
    'USD': { nome: 'Dólar Americano',   emoji: '🇺🇸', cor: '#1DA462' },
    'EUR': { nome: 'Euro',              emoji: '🇪🇺', cor: '#003087' },
    'GBP': { nome: 'Libra Esterlina',   emoji: '🇬🇧', cor: '#CF142B' },
    'ARS': { nome: 'Peso Argentino',    emoji: '🇦🇷', cor: '#74ACDF' },
    'BTC': { nome: 'Bitcoin',           emoji: '₿',   cor: '#F7931A' },
    'ETH': { nome: 'Ethereum',          emoji: '💎',  cor: '#627EEA' },
    'JPY': { nome: 'Iene Japonês',      emoji: '🇯🇵', cor: '#BC002D' },
    'CAD': { nome: 'Dólar Canadense',   emoji: '🇨🇦', cor: '#FF0000' },
    'AUD': { nome: 'Dólar Australiano', emoji: '🇦🇺', cor: '#00843D' },
    'CHF': { nome: 'Franco Suíço',      emoji: '🇨🇭', cor: '#FF0000' },
    'CNY': { nome: 'Yuan Chinês',       emoji: '🇨🇳', cor: '#DE2910' },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cotacao')
        .setDescription('💱 Consulta cotação em tempo real de moedas e criptomoedas vs BRL')
        .addStringOption(opt =>
            opt.setName('moeda').setDescription('Código da moeda (ex: USD, EUR, BTC)').setRequired(false)
                .addChoices(
                    { name: '🇺🇸 Dólar (USD)',      value: 'USD' },
                    { name: '🇪🇺 Euro (EUR)',         value: 'EUR' },
                    { name: '🇬🇧 Libra (GBP)',        value: 'GBP' },
                    { name: '🇦🇷 Peso AR (ARS)',      value: 'ARS' },
                    { name: '₿ Bitcoin (BTC)',         value: 'BTC' },
                    { name: '💎 Ethereum (ETH)',       value: 'ETH' },
                    { name: '🇯🇵 Iene (JPY)',          value: 'JPY' },
                    { name: '🇨🇳 Yuan (CNY)',           value: 'CNY' },
                )
        ),

    aliases: ['cotacao', 'cotação', 'dolar', 'dólar', 'euro', 'bitcoin', 'moeda'],
    detailedDescription: 'Cotação em tempo real de moedas vs BRL usando AwesomeAPI. Sem moeda: exibe painel com USD, EUR, BTC e ARS.',
    usage: '`/cotacao [moeda?]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const moedaSelecionada = interaction.options.getString('moeda');

        try {
            const codigosBuscar = moedaSelecionada
                ? [moedaSelecionada]
                : ['USD', 'EUR', 'BTC', 'ARS', 'GBP', 'ETH'];

            const pares = codigosBuscar.map(m => `${m}-BRL`).join(',');
            const res   = await axios.get(`https://economia.awesomeapi.com.br/json/last/${pares}`);
            const data  = res.data;

            const formatarPreco = (val, moeda) => {
                const num = parseFloat(val);
                if (['BTC','ETH'].includes(moeda)) {
                    return num > 100000 ? `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` :
                                          `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
                return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
            };

            if (moedaSelecionada && data[`${moedaSelecionada}BRL`]) {
                // Embed detalhado de uma moeda
                const c    = data[`${moedaSelecionada}BRL`];
                const info = MOEDAS[moedaSelecionada] || { nome: moedaSelecionada, emoji: '💱', cor: '#5865F2' };
                const pctChange  = parseFloat(c.pctChange || '0');
                const isPositive = pctChange >= 0;
                const varEmoji   = isPositive ? '📈' : '📉';
                const varSinal   = isPositive ? '+' : '';

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('📊 Ver Gráfico')
                        .setURL(`https://economia.awesomeapi.com.br/${moedaSelecionada}/7`)
                        .setStyle(ButtonStyle.Link)
                );

                const embed = new EmbedBuilder()
                    .setTitle(`${info.emoji} ${info.nome} → BRL`)
                    .setColor(isPositive ? '#57F287' : '#ED4245')
                    .addFields(
                        { name: '💰 Compra',     value: `**${formatarPreco(c.bid, moedaSelecionada)}**`,   inline: true },
                        { name: '💸 Venda',      value: `**${formatarPreco(c.ask, moedaSelecionada)}**`,   inline: true },
                        { name: '\u200B',         value: '\u200B',                                          inline: true },
                        { name: '📊 Abertura',   value: `\`${formatarPreco(c.open, moedaSelecionada)}\``,  inline: true },
                        { name: '📉 Mínima',     value: `\`${formatarPreco(c.low, moedaSelecionada)}\``,   inline: true },
                        { name: '📈 Máxima',     value: `\`${formatarPreco(c.high, moedaSelecionada)}\``,  inline: true },
                        { name: `${varEmoji} Variação (24h)`, value: `**${varSinal}${pctChange.toFixed(2)}%**`, inline: true },
                        { name: '🕐 Atualização', value: `\`${new Date(parseInt(c.timestamp) * 1000).toLocaleTimeString('pt-BR')}\``, inline: true },
                    )
                    .setFooter({ text: `${moedaSelecionada}/BRL • AwesomeAPI • Consultado por ${interaction.user.username}` })
                    .setTimestamp();

                return interaction.editReply({ content: formatResponse(''), embeds: [embed], components: [row] });
            }

            // Painel multi-moeda
            const fields = codigosBuscar
                .filter(m => data[`${m}BRL`])
                .map(m => {
                    const c    = data[`${m}BRL`];
                    const info = MOEDAS[m] || { emoji: '💱' };
                    const pct  = parseFloat(c.pctChange || '0');
                    const seta = pct >= 0 ? '▲' : '▼';
                    const sinalPct = pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
                    return {
                        name:   `${info.emoji} ${m}/BRL`,
                        value:  `**${formatarPreco(c.bid, m)}**\n${seta} ${sinalPct}`,
                        inline: true
                    };
                });

            const embed = new EmbedBuilder()
                .setTitle('💱 Painel de Cotações → BRL')
                .setDescription('> Cotações em tempo real contra o **Real Brasileiro (BRL)**')
                .setColor('#009C3B')
                .addFields(fields)
                .setFooter({ text: `Consultado por ${interaction.user.username} • AwesomeAPI` })
                .setTimestamp();

            await interaction.editReply({ content: formatResponse(''), embeds: [embed] });

        } catch (err) {
            console.error('[COTACAO]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar cotações. Tente novamente.') });
        }
    }
};

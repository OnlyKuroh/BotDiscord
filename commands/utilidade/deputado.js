const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

const CAMARA_BASE = 'https://dadosabertos.camara.leg.br/api/v2';

function formatarMoeda(val) {
    if (!val && val !== 0) return 'N/A';
    return parseFloat(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(str) {
    if (!str) return 'N/A';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString('pt-BR');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deputado')
        .setDescription('🏛️ Consulta dados completos de um Deputado Federal (Câmara dos Deputados)')
        .addStringOption(opt =>
            opt.setName('nome').setDescription('Nome do deputado (ex: Gleisi Hoffmann, Nikolas Ferreira)').setRequired(true)
        ),

    aliases: ['deputado', 'politico', 'político', 'camara', 'câmara'],
    detailedDescription: 'Consulta completa via API da Câmara dos Deputados. 4 páginas: Perfil, Gastos (CEAP), Votações Recentes e Proposições. Dados públicos oficiais.',
    usage: '`/deputado [nome]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('nome').trim();

        try {
            // ── Busca o deputado ──
            const buscaRes = await axios.get(`${CAMARA_BASE}/deputados?nome=${encodeURIComponent(query)}&itens=5&ordem=ASC&ordenarPor=nome`);
            const lista = buscaRes.data.dados;

            if (!lista?.length) {
                return interaction.editReply({ content: formatResponse(`❌ Nenhum deputado encontrado para **${query}**.`) });
            }

            const depBasico = lista[0];
            const id        = depBasico.id;

            // ── Coleta em paralelo ──
            const [detalhesRes, despesasRes, votacoesRes, proposicoesRes] = await Promise.allSettled([
                axios.get(`${CAMARA_BASE}/deputados/${id}`),
                axios.get(`${CAMARA_BASE}/deputados/${id}/despesas?itens=6&ordem=DESC&ordenarPor=mes`),
                axios.get(`${CAMARA_BASE}/deputados/${id}/votacoes?itens=5&ordem=DESC&ordenarPor=dataVotacao`),
                axios.get(`${CAMARA_BASE}/deputados/${id}/proposicoes?itens=5&ordem=DESC&ordenarPor=dataVotacao`),
            ]);

            const d    = detalhesRes.status === 'fulfilled' ? detalhesRes.value.data.dados : depBasico;
            const foto = d.ultimoStatus?.urlFoto || depBasico.urlFoto || '';
            const nome = d.ultimoStatus?.nomeEleitoral || d.nome || depBasico.nome;
            const partido  = d.ultimoStatus?.siglaPartido || depBasico.siglaPartido || 'N/A';
            const uf       = d.ultimoStatus?.siglaUf || depBasico.siglaUf || 'N/A';
            const cargo    = d.ultimoStatus?.descricaoStatus || 'Deputado(a) Federal';
            const gabinete = d.ultimoStatus?.gabinete;
            const redeSocial = d.redeSocial?.[0] || null;
            const email    = d.ultimoStatus?.email || null;
            const escolaridade = d.escolaridade || 'N/A';
            const nascimento   = d.dataNascimento ? formatarData(d.dataNascimento) : 'N/A';
            const profissao    = Array.isArray(d.profissoes) ? d.profissoes.map(p => p.titulo).join(', ') : 'N/A';

            // ── Despesas (CEAP) ──
            let despesasText = '> Nenhum gasto recente encontrado.';
            let totalDespesas = 0;
            if (despesasRes.status === 'fulfilled') {
                const despesas = despesasRes.value.data.dados || [];
                if (despesas.length) {
                    totalDespesas = despesas.reduce((acc, d) => acc + (parseFloat(d.valorDocumento) || 0), 0);
                    despesasText = despesas.slice(0, 5).map(d => {
                        const tipo = d.tipoDespesa?.substring(0, 35) || 'N/A';
                        const valor = formatarMoeda(d.valorDocumento);
                        const mesRef = d.mes && d.ano ? `${String(d.mes).padStart(2,'0')}/${d.ano}` : 'N/A';
                        const fornecedor = d.nomeFornecedor?.substring(0, 25) || 'N/A';
                        return `• **${tipo}**\n  ${valor} — *${fornecedor}* (${mesRef})`;
                    }).join('\n\n');
                }
            }

            // ── Votações recentes ──
            let votacoesText = '> Nenhuma votação recente encontrada.';
            if (votacoesRes.status === 'fulfilled') {
                const votos = votacoesRes.value.data.dados || [];
                if (votos.length) {
                    votacoesText = votos.slice(0, 5).map(v => {
                        const data    = formatarData(v.dataVotacao || v.data);
                        const desc    = (v.descricao || v.proposicao_?.ementa || 'Sem descrição').substring(0, 60);
                        const votoTxt = v.voto
                            ? { 'Sim': '✅ Sim', 'Não': '❌ Não', 'Abstenção': '⬜ Abstenção', 'Obstrução': '🚫 Obstrução' }[v.voto] || v.voto
                            : '❓';
                        return `${votoTxt} — *${desc}...*\n> 📅 ${data}`;
                    }).join('\n\n');
                }
            }

            // ── Proposições ──
            let proposicoesText = '> Nenhuma proposição recente.';
            if (proposicoesRes.status === 'fulfilled') {
                const props = proposicoesRes.value.data.dados || [];
                if (props.length) {
                    proposicoesText = props.slice(0, 4).map(p => {
                        const sigla   = p.siglaTipo || 'PL';
                        const numero  = p.numero || '?';
                        const ano     = p.ano || '?';
                        const ementa  = (p.ementa || 'Sem ementa').substring(0, 80);
                        return `📜 **${sigla} ${numero}/${ano}**\n> ${ementa}...`;
                    }).join('\n\n');
                }
            }

            // ── Row de navegação ──
            const buttons = [
                new ButtonBuilder().setCustomId('dep_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dep_home').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('dep_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setLabel('Câmara.leg.br').setURL(`https://www.camara.leg.br/deputados/${id}`).setStyle(ButtonStyle.Link),
            ];
            if (redeSocial) {
                buttons.push(new ButtonBuilder().setLabel('Rede Social').setURL(redeSocial).setStyle(ButtonStyle.Link));
            }
            const row = new ActionRowBuilder().addComponents(buttons.slice(0, 5));

            // ══════════════════════════════════════
            // PÁGINA 1: PERFIL
            // ══════════════════════════════════════
            const embed1 = new EmbedBuilder()
                .setTitle(`🏛️ ${nome}`)
                .setDescription(`> ${cargo}`)
                .setColor('#1A5276')
                .setThumbnail(foto)
                .addFields(
                    { name: '🗳️ Partido',      value: `**${partido}**`,   inline: true },
                    { name: '🗺️ Estado (UF)',  value: `**${uf}**`,         inline: true },
                    { name: '\u200B',            value: '\u200B',            inline: true },
                    { name: '🎓 Escolaridade', value: `\`${escolaridade}\``,inline: true },
                    { name: '🎂 Nascimento',   value: `\`${nascimento}\``,  inline: true },
                    { name: '💼 Profissão',    value: `\`${profissao}\``,   inline: true },
                )
                .setFooter({ text: `Página 1/4 • Perfil • Câmara dos Deputados` })
                .setTimestamp();

            if (gabinete?.predio) {
                embed1.addFields({
                    name: '🏢 Gabinete',
                    value: `Sala ${gabinete.sala || '?'} — Prédio ${gabinete.predio || '?'}`,
                    inline: false
                });
            }
            if (email) embed1.addFields({ name: '📧 E-mail oficial', value: `\`${email}\``, inline: false });

            if (lista.length > 1) {
                embed1.addFields({
                    name: '⚠️ Outros deputados com nome similar',
                    value: lista.slice(1, 4).map(d => `• ${d.nome} (${d.siglaPartido}/${d.siglaUf})`).join('\n'),
                    inline: false
                });
            }

            // ══════════════════════════════════════
            // PÁGINA 2: GASTOS CEAP
            // ══════════════════════════════════════
            const embed2 = new EmbedBuilder()
                .setTitle(`💰 Cota Parlamentar (CEAP): ${nome}`)
                .setDescription(despesasText)
                .setColor('#C0392B')
                .setThumbnail(foto)
                .addFields({
                    name: '📊 Total dos gastos listados',
                    value: `**${formatarMoeda(totalDespesas)}**`,
                    inline: false
                })
                .setFooter({ text: `Página 2/4 • Gastos CEAP • Dados públicos oficiais` });

            // ══════════════════════════════════════
            // PÁGINA 3: VOTAÇÕES
            // ══════════════════════════════════════
            const embed3 = new EmbedBuilder()
                .setTitle(`🗳️ Votações Recentes: ${nome}`)
                .setDescription(votacoesText)
                .setColor('#1A5276')
                .setThumbnail(foto)
                .setFooter({ text: `Página 3/4 • Votações Plenárias` });

            // ══════════════════════════════════════
            // PÁGINA 4: PROPOSIÇÕES
            // ══════════════════════════════════════
            const embed4 = new EmbedBuilder()
                .setTitle(`📜 Proposições: ${nome}`)
                .setDescription(proposicoesText)
                .setColor('#1A5276')
                .setThumbnail(foto)
                .setFooter({ text: `Página 4/4 • Proposições Legislativas` });

            // ── Navegação ──
            const embeds = [embed1, embed2, embed3, embed4];
            let pagAtual = 0;
            await interaction.editReply({ content: formatResponse(''), embeds: [embeds[0]], components: [row] });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.customId.startsWith('dep_') && i.user.id === interaction.user.id,
                time: 90000
            });
            collector.on('collect', async i => {
                if (i.customId === 'dep_prev')     pagAtual = pagAtual > 0 ? pagAtual - 1 : embeds.length - 1;
                else if (i.customId === 'dep_next') pagAtual = pagAtual < embeds.length - 1 ? pagAtual + 1 : 0;
                else if (i.customId === 'dep_home') pagAtual = 0;
                await i.update({ embeds: [embeds[pagAtual]], components: [row] });
            });
            collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));

        } catch (err) {
            console.error('[DEPUTADO]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar a API da Câmara. Tente novamente.') });
        }
    }
};

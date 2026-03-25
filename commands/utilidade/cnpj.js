const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

function formatarCNPJ(cnpj) {
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatarTelefone(tel) {
    if (!tel) return null;
    const d = tel.replace(/\D/g, '');
    return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` :
           d.length === 10 ? `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}` : tel;
}

function formatarCapital(v) {
    if (!v) return 'N/A';
    return `R$ ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cnpj')
        .setDescription('🏢 Consulta dados de uma empresa pelo CNPJ')
        .addStringOption(opt =>
            opt.setName('numero').setDescription('CNPJ (somente números, ex: 00000000000191)').setRequired(true)
        ),

    aliases: ['cnpj', 'empresa', 'receita'],
    detailedDescription: 'Consulta dados completos de empresa via BrasilAPI/ReceitaFederal. Mostra razão social, situação, endereço, sócios e atividade econômica.',
    usage: '`/cnpj [numero]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const cnpjRaw = interaction.options.getString('numero').replace(/\D/g, '');

        if (cnpjRaw.length !== 14) {
            return interaction.editReply({ content: formatResponse('❌ CNPJ inválido. Informe os 14 dígitos, ex: `00000000000191`.') });
        }

        try {
            const res = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpjRaw}`);
            const d = res.data;

            const situacao = d.descricao_situacao_cadastral || 'Desconhecida';
            const corSituacao = {
                'ATIVA': '#57F287',
                'BAIXADA': '#ED4245',
                'SUSPENSA': '#FEE75C',
                'INAPTA': '#FF6B6B',
                'NULA': '#808080',
            }[situacao.toUpperCase()] || '#5865F2';

            const emojiSituacao = {
                'ATIVA': '🟢', 'BAIXADA': '🔴', 'SUSPENSA': '🟡', 'INAPTA': '🟠', 'NULA': '⚫'
            }[situacao.toUpperCase()] || '🔵';

            const cnaeDescricao = d.cnae_fiscal_descricao || 'N/A';
            const naturezaJuridica = d.descricao_natureza_juridica || 'N/A';
            const porte = d.porte || 'N/A';
            const dataAbertura = d.data_inicio_atividade
                ? new Date(d.data_inicio_atividade + 'T00:00:00').toLocaleDateString('pt-BR')
                : 'N/A';

            const endereco = [
                d.logradouro,
                d.numero !== '0' ? d.numero : null,
                d.complemento || null,
                d.bairro,
                `${d.municipio} - ${d.uf}`,
                d.cep ? d.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : null,
            ].filter(Boolean).join(', ');

            const telefone = d.ddd_telefone_1
                ? formatarTelefone((d.ddd_telefone_1 || '').trim())
                : null;
            const email = d.email ? d.email.toLowerCase() : null;

            // Sócios (máximo 3)
            const socios = Array.isArray(d.qsa) && d.qsa.length > 0
                ? d.qsa.slice(0, 3).map(s => `• **${s.nome_socio}** — ${s.qualificacao_socio}`).join('\n')
                : null;

            // ── Row de busca ──
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('🔍 Verificar na Receita')
                    .setURL(`https://servicos.receita.fazenda.gov.br/servicos/cnpjreva/valida.asp?cnpj=${cnpjRaw}`)
                    .setStyle(ButtonStyle.Link)
            );

            const embed = new EmbedBuilder()
                .setTitle(`🏢 ${d.razao_social || 'Razão Social não disponível'}`)
                .setDescription(
                    d.nome_fantasia && d.nome_fantasia !== d.razao_social
                        ? `**Nome Fantasia:** ${d.nome_fantasia}`
                        : null
                )
                .setColor(corSituacao)
                .addFields(
                    { name: '📋 CNPJ',           value: `\`${formatarCNPJ(cnpjRaw)}\``,  inline: true  },
                    { name: `${emojiSituacao} Situação`, value: `**${situacao}**`,          inline: true  },
                    { name: '📅 Abertura',        value: `\`${dataAbertura}\``,             inline: true  },
                    { name: '🏭 Atividade (CNAE)',value: `> ${cnaeDescricao}`,              inline: false },
                    { name: '⚖️ Natureza Jurídica',value: `\`${naturezaJuridica}\``,       inline: true  },
                    { name: '🏗️ Porte',           value: `\`${porte}\``,                   inline: true  },
                    { name: '💰 Capital Social',  value: `\`${formatarCapital(d.capital_social)}\``, inline: true },
                    { name: '📍 Endereço',        value: `> ${endereco || 'N/A'}`,          inline: false },
                )
                .setFooter({ text: `Consultado por ${interaction.user.username} • BrasilAPI / Receita Federal` })
                .setTimestamp();

            if (telefone) embed.addFields({ name: '📞 Telefone', value: `\`${telefone}\``, inline: true });
            if (email)    embed.addFields({ name: '📧 E-mail',   value: `\`${email}\``,    inline: true });

            if (socios) {
                embed.addFields({
                    name: `👤 Quadro Societário (${Math.min(d.qsa?.length || 0, 3)} de ${d.qsa?.length || 0})`,
                    value: socios,
                    inline: false
                });
            }

            // CNAEs secundários
            if (d.cnaes_secundarios?.length) {
                const sec = d.cnaes_secundarios.slice(0, 3).map(c => `\`${c.descricao}\``).join('\n');
                embed.addFields({ name: '🔧 Atividades Secundárias', value: sec, inline: false });
            }

            await interaction.editReply({ content: formatResponse(''), embeds: [embed], components: [row] });

        } catch (err) {
            if (err.response?.status === 404) {
                return interaction.editReply({ content: formatResponse(`❌ CNPJ **${formatarCNPJ(cnpjRaw)}** não encontrado na base da Receita Federal.`) });
            }
            console.error('[CNPJ]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar o CNPJ. Tente novamente mais tarde.') });
        }
    }
};

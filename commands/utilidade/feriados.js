const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { formatResponse } = require('../../utils/persona');

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_COMPLETOS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feriados')
        .setDescription('🇧🇷 Lista todos os feriados nacionais do Brasil para o ano informado')
        .addIntegerOption(opt =>
            opt.setName('ano').setDescription('Ano (padrão: ano atual)').setRequired(false)
                .setMinValue(2020).setMaxValue(2035)
        ),

    aliases: ['feriados', 'feriado', 'folga'],
    detailedDescription: 'Consulta e lista todos os feriados nacionais brasileiros do ano via BrasilAPI. Destaca o próximo feriado e separa por trimestre.',
    usage: '`/feriados [ano?]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const ano = interaction.options.getInteger('ano') || new Date().getFullYear();

        try {
            const res = await axios.get(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
            const feriados = res.data;

            if (!feriados?.length) {
                return interaction.editReply({ content: formatResponse(`❌ Nenhum feriado encontrado para ${ano}.`) });
            }

            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);

            // Encontra próximo feriado
            let proximoIdx = -1;
            let diasAteProximo = Infinity;
            feriados.forEach((f, i) => {
                const dataFeriado = new Date(f.date + 'T00:00:00');
                const diff = Math.ceil((dataFeriado - hoje) / (1000 * 60 * 60 * 24));
                if (diff >= 0 && diff < diasAteProximo) {
                    diasAteProximo = diff;
                    proximoIdx = i;
                }
            });

            // Monta lista por meses
            const porMes = {};
            feriados.forEach((f, i) => {
                const dt   = new Date(f.date + 'T00:00:00');
                const mes  = dt.getMonth();
                if (!porMes[mes]) porMes[mes] = [];

                const diaSemana = DIAS_SEMANA[dt.getDay()];
                const diaNum    = dt.getDate().toString().padStart(2, '0');
                const mesAbr    = MESES[mes];
                const isPast    = dt < hoje;
                const isProximo = i === proximoIdx;

                let linha = isPast
                    ? `~~**${diaNum}/${mesAbr}**~~ — *${f.name}*`
                    : `**${diaNum}/${mesAbr}** (${diaSemana}) — ${f.name}`;

                if (isProximo) linha = `🎯 ${linha} ← **PRÓXIMO**`;
                porMes[mes].push(linha);
            });

            // Separa em trimestres para caber em 3 fields
            const q1 = [0,1,2];
            const q2 = [3,4,5];
            const q3 = [6,7,8];
            const q4 = [9,10,11];

            const buildField = (meses) => {
                let txt = '';
                meses.forEach(m => {
                    if (porMes[m]?.length) {
                        txt += `**${MESES_COMPLETOS[m]}**\n${porMes[m].join('\n')}\n\n`;
                    }
                });
                return txt.trim() || 'Nenhum feriado';
            };

            const totalFeriados  = feriados.length;
            const jaPassaram     = feriados.filter(f => new Date(f.date + 'T00:00:00') < hoje).length;
            const aVir           = totalFeriados - jaPassaram;

            // Próximo feriado destaque
            let proximoInfo = '';
            if (proximoIdx >= 0) {
                const pf = feriados[proximoIdx];
                const dt = new Date(pf.date + 'T00:00:00');
                const diaSemanaProx = DIAS_SEMANA[dt.getDay()];
                const faltam = diasAteProximo === 0 ? '**HOJE!** 🎉' : `em **${diasAteProximo} dias**`;
                proximoInfo = `🎯 **${pf.name}** — ${dt.getDate()}/${MESES[dt.getMonth()]} (${diaSemanaProx}) ${faltam}`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🇧🇷 Feriados Nacionais ${ano}`)
                .setDescription(
                    `${proximoInfo}\n\n` +
                    `📊 **${totalFeriados} feriados** — ${aVir} ainda a vir · ${jaPassaram} já passaram`
                )
                .setColor('#009C3B')
                .addFields(
                    { name: '🌱 1º Trimestre (Jan–Mar)', value: buildField(q1), inline: false },
                    { name: '☀️ 2º Trimestre (Abr–Jun)', value: buildField(q2), inline: false },
                    { name: '🍂 3º Trimestre (Jul–Set)', value: buildField(q3), inline: false },
                    { name: '❄️ 4º Trimestre (Out–Dez)', value: buildField(q4), inline: false },
                )
                .setFooter({ text: `Consultado por ${interaction.user.username} • BrasilAPI` })
                .setTimestamp();

            await interaction.editReply({ content: formatResponse(''), embeds: [embed] });

        } catch (err) {
            console.error('[FERIADOS]', err.message);
            await interaction.editReply({ content: formatResponse('❌ Erro ao consultar os feriados. Tente novamente.') });
        }
    }
};

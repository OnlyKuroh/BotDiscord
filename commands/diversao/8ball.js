const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

const RESPOSTAS = [
    { texto: "Os fatos são frios e a resposta é sim.", tipo: 'sim' },
    { texto: "Sem dúvida. Está marcado nas engrenagens.", tipo: 'sim' },
    { texto: "A probabilidade esmaga o oposto: sim e absolutamente.", tipo: 'sim' },
    { texto: "Não importa o quanto lute, isso acontecerá.", tipo: 'sim' },
    { texto: "Concentre-se no corte e pergunte direito. O véu está turvo.", tipo: 'talvez' },
    { texto: "Se eu responder agora, as apostas não seriam mais suas. Continue lutando.", tipo: 'talvez' },
    { texto: "Há chance de falha absoluta, reavalie os resultados.", tipo: 'talvez' },
    { texto: "A dor dessa resposta recai em você: não.", tipo: 'nao' },
    { texto: "Nem com o Santuário ativo os resultados virariam a seu favor.", tipo: 'nao' },
    { texto: "Se afaste dessa ideia. O destino rasgou.", tipo: 'nao' },
];

const CORES = { sim: '#57F287', talvez: '#FEE75C', nao: '#ED4245' };
const ICONES = { sim: '🟢', talvez: '🟡', nao: '🔴' };

function buildEmbed(question, resposta, user) {
    return new EmbedBuilder()
        .setAuthor({ name: `${user.displayName} consultou o destino`, iconURL: user.displayAvatarURL() })
        .setColor(CORES[resposta.tipo])
        .addFields(
            { name: '❓ Pergunta', value: `> ${question}` },
            { name: `${ICONES[resposta.tipo]} Resposta`, value: `> ${resposta.texto}` },
        )
        .setFooter({ text: '🎱 Bola 8 Mística' })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Olhe para as correntes do destino.')
        .addStringOption(option => option.setName('pergunta').setDescription('O que consome a sua dúvida?').setRequired(true)),
    aliases: ['bola8', 'pergunta'],
    detailedDescription: 'O destino moldado responde a suas dúvidas. Se quiser encará-las com firmeza, use essa lâmina.',
    usage: '`/8ball [pergunta]`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const question = interaction.options.getString('pergunta');
        const resposta = RESPOSTAS[Math.floor(Math.random() * RESPOSTAS.length)];
        const embed = buildEmbed(question, resposta, interaction.user);
        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        const question = args.join(' ');
        if (!question) return message.reply(formatResponse('Diga palavras ou fique calado. Eu não prevejo o vazio.'));
        const resposta = RESPOSTAS[Math.floor(Math.random() * RESPOSTAS.length)];
        const embed = buildEmbed(question, resposta, message.author);
        await message.reply({ embeds: [embed] });
    }
};

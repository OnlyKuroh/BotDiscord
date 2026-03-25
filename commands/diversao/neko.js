const { SlashCommandBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');
const axios = require('axios');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('neko')
        .setDescription('Comando para obter uma imagem aleatória de neko (gato em japonês).'),
    aliases: ['nekocat', 'neeko', 'catgirl'],
    detailedDescription: 'Obtenha uma imagem aleatória de neko (gato em japonês) para alegrar seu dia! Perfeito para quem ama gatos e cultura japonesa.',
    usage: '`/neko [mensagem]` e `-neko [mensagem]`',
    permissions: [''], // requer permissões para não permitir flood absurdo por usuários normais

    async execute(interaction) {
        try {
            const res = await axios.get('https://api.nekosia.cat/api/v1/images/catgirl');
            const nekoData = res.data;
            const user = interaction.user;
            const imageUrl = nekoData?.image?.original?.url || 'https://i.imgur.com/8eQfFQF.png';
            const artist = nekoData?.attribution?.artist?.username || 'Desconhecido';

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle(`Artista: ${artist}`)
                .setImage(imageUrl)
                .setColor('#2b2d31');

            await interaction.reply({ content: formatResponse(''), embeds: [embed] });
        } catch (err) {
            console.error(err.stack);
            await interaction.reply({ content: 'Erro ao buscar imagem do neko.', ephemeral: true });
        }
    },

    async executePrefix(message, args, client) {
        try {
            const res = await axios.get('https://api.nekosia.cat/api/v1/images/catgirl');
            const nekoData = res.data;
            const user = message.author;
            const imageUrl = nekoData?.image?.original?.url || 'https://i.imgur.com/8eQfFQF.png';
            const artist = nekoData?.attribution?.artist?.username || 'Desconhecido';

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle(`Artista: ${artist}`)
                .setImage(imageUrl)
                .setColor('Random')
                .setFooter({ text: `NekoAPI • Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() });

            await message.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err.stack);
            await message.reply({ content: 'Erro ao buscar imagem do neko.' });
        }
    }
};
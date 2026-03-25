const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Um meme aleatório direto do Reddit.'),
    aliases: ['piada'],
    detailedDescription: 'Puxa memes aleatórios dos melhores subreddits de memes.',
    usage: '`/meme`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        await interaction.deferReply();
        const embed = await fetchMeme();
        await interaction.editReply({ embeds: [embed] });
    },

    async executePrefix(message) {
        const embed = await fetchMeme();
        await message.reply({ embeds: [embed] });
    }
};

async function fetchMeme() {
    const subreddits = ['memes', 'dankmemes', 'me_irl', 'programmerhumor', 'funny'];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];

    try {
        const res = await axios.get(`https://meme-api.com/gimme/${sub}`, { timeout: 8000 });
        const data = res.data;

        if (!data || data.nsfw) return fallbackEmbed();

        return new EmbedBuilder()
            .setTitle(data.title?.substring(0, 256) || 'Meme')
            .setImage(data.url)
            .setColor('#FF4500')
            .addFields(
                { name: '👍 Upvotes', value: `**${data.ups?.toLocaleString() || '?'}**`, inline: true },
                { name: '📂 Subreddit', value: `r/${data.subreddit || sub}`, inline: true },
                { name: '👤 Autor', value: `u/${data.author || '?'}`, inline: true },
            )
            .setURL(data.postLink || `https://reddit.com/r/${sub}`)
            .setFooter({ text: `Tema: Memes • r/${data.subreddit || sub}` })
            .setTimestamp();
    } catch {
        return fallbackEmbed();
    }
}

function fallbackEmbed() {
    const frases = [
        { texto: "A API de memes está em modo preguiça. Tente novamente.", emoji: '😴' },
        { texto: "Os memes estão recarregando. O Reddit deve estar ocupado.", emoji: '🔄' },
        { texto: "Nenhum meme encontrado dessa vez. Tente de novo!", emoji: '🤷' },
    ];
    const f = frases[Math.floor(Math.random() * frases.length)];

    return new EmbedBuilder()
        .setTitle(`${f.emoji} Ops!`)
        .setDescription(`> ${f.texto}`)
        .setColor('#FEE75C')
        .setFooter({ text: '🎭 Memes' })
        .setTimestamp();
}

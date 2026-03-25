const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const translate = require('google-translate-api-x');
const { formatResponse } = require('../../utils/persona');

// --- DICIONÁRIOS ESTÁTICOS ---
const typeMap = {
    normal: '⚪ Normal', fire: '🔥 Fogo', water: '💧 Água', electric: '⚡ Elétrico',
    grass: '🌿 Planta', ice: '❄️ Gelo', fighting: '🥊 Lutador', poison: '☠️ Venenoso',
    ground: '🪨 Terra', flying: '🦅 Voador', psychic: '🔮 Psíquico', bug: '🐛 Inseto',
    rock: '🪨 Pedra', ghost: '👻 Fantasma', dragon: '🐉 Dragão', dark: '🌑 Sombrio',
    steel: '⚙️ Aço', fairy: '🧚 Fada'
};

const colorMap = {
    normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C',
    grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1',
    ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
    rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705898',
    steel: '#B7B7CE', fairy: '#D685AD'
};

const statMap = {
    'hp': '❤️ HP', 'attack': '⚔️ Ataque', 'defense': '🛡️ Defesa',
    'special-attack': '🔮 Atq. Esp.', 'special-defense': '🪄 Def. Esp.', 'speed': '💨 Velocidade'
};

async function traduzir(texto) {
    if (!texto) return 'Sem registro na Pokédex.';
    try {
        const textoLimpo = texto.replace(/[\n\f\r]/g, ' '); 
        const res = await translate(textoLimpo, { to: 'pt' });
        return res.text;
    } catch {
        return texto;
    }
}

function capitalizar(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokedex')
        .setDescription('Acesse o banco de dados oficial da PokéAPI')
        .addStringOption(option => option.setName('pokemon').setDescription('Nome ou ID do Pokémon').setRequired(true)),

    aliases: ['pokedex', 'poke', 'pokemon'],
    detailedDescription: 'Busca informações de um Pokémon com design focado na arte primeiro, e atributos depois.',
    usage: '`/pokedex [nome ou id]`',
    permissions: [''],

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('pokemon').toLowerCase().trim();

        try {
            const resData = await axios.get(`https://pokeapi.co/api/v2/pokemon/${query}`);
            const p = resData.data;

            let loreText = 'Registro não encontrado.';
            try {
                const resSpecies = await axios.get(p.species.url);
                const entry = resSpecies.data.flavor_text_entries.find(e => e.language.name === 'en');
                if (entry) loreText = await traduzir(entry.flavor_text);
            } catch (e) {}

            const primaryType = p.types[0].type.name;
            const embedColor = colorMap[primaryType] || '#2F3136';
            const imageUrl = p.sprites.other['official-artwork'].front_default || p.sprites.front_default;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('poke_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('poke_home').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('poke_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
            );

            // PÁGINA 1: Exclusiva para Arte e História (Design Limpo)
            const embedHome = new EmbedBuilder()
                .setTitle(`Pokédex #${p.id} - ${capitalizar(p.name)}`)
                .setDescription(`> ${loreText}`)
                .setColor(embedColor)
                .setImage(imageUrl)
                .setFooter({ text: `Página 1/2 • Consultado por ${interaction.user.username}` });

            // PÁGINA 2: A Ficha Técnica (Tabelas, Dados e Biometria)
            const tipos = p.types.map(t => typeMap[t.type.name] || capitalizar(t.type.name)).join(' | ');
            const habilidades = p.abilities.map(a => capitalizar(a.ability.name.replace('-', ' '))).join(', ');
            const pesoKg = (p.weight / 10).toFixed(1);
            const alturaM = (p.height / 10).toFixed(1);

            const embedStats = new EmbedBuilder()
                .setTitle(`Ficha Técnica: ${capitalizar(p.name)}`)
                .setColor(embedColor)
                .setThumbnail(imageUrl)
                .addFields(
                    { name: '🧬 Tipagem', value: `\`${tipos}\``, inline: false },
                    { name: '⚖️ Peso', value: `\`${pesoKg} kg\``, inline: true },
                    { name: '📏 Altura', value: `\`${alturaM} m\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }
                );

            let statsAdded = 0;
            p.stats.forEach(s => {
                embedStats.addFields({ name: statMap[s.stat.name] || capitalizar(s.stat.name), value: `\`${s.base_stat}\``, inline: true });
                statsAdded++;
                if (statsAdded % 2 === 0 && statsAdded !== 6) embedStats.addFields({ name: '\u200B', value: '\u200B', inline: true });
            });

            embedStats.addFields({ name: '🌟 Habilidades', value: `> ${habilidades}`, inline: false })
                      .setFooter({ text: `Página 2/2 • Consultado por ${interaction.user.username}` });

            await interaction.editReply({ content: formatResponse(''), embeds: [embedHome], components: [row] });

            const collector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 60000 });
            collector.on('collect', async i => {
                if (i.customId === 'poke_home' || i.customId === 'poke_prev') await i.update({ embeds: [embedHome], components: [row] });
                else if (i.customId === 'poke_next') await i.update({ embeds: [embedStats], components: [row] });
            });
            collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));

        } catch (err) {
            await interaction.editReply({ content: formatResponse('❌ Pokémon não encontrado ou erro na API.') });
        }
    }
};
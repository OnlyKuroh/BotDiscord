const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Anuncia uma nova versão para os administradores verem.')
        .addStringOption(option => option.setName('titulo').setDescription('Nome do aviso').setRequired(true))
        .addStringOption(option => option.setName('corpo').setDescription('Texto principal do pilar').setRequired(true))
        .addAttachmentOption(option => option.setName('imagem').setDescription('Anexo').setRequired(false)),
    aliases: ['atualizacao'],
    detailedDescription: 'Envia um aviso massivo de atualização no servidor.',
    usage: '`/update [titulo] [corpo]`',
    permissions: ['Desenvolvedor / Dono'],
    
    async execute(interaction, client) {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: formatResponse('Apenas o pilar desse servidor emite as atualizações principais.'), flags: ['Ephemeral'] });
        }

        const title = interaction.options.getString('titulo');
        const desc = interaction.options.getString('corpo');
        const img = interaction.options.getAttachment('imagem');

        const embed = new EmbedBuilder()
            .setColor('#2ecc71') // Verde das atualizações
            .setAuthor({ name: 'Itadori Yuji © System v2.1', iconURL: client.user.displayAvatarURL() })
            .setTitle(title)
            .setDescription(desc);

        if (img) embed.setImage(img.url);

        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: 'Aviso expurgado na base.', flags: ['Ephemeral'] });
    },

    async executePrefix(message, args, client) {
        if (message.author.id !== message.guild.ownerId) {
            return message.reply(formatResponse('Apenas o pilar desse servidor emite atualizações principais. Você não é a fonte.'));
        }

        const raw = args.join(' ');
        const parts = raw.split('|');
        if (parts.length < 2) return message.reply('O corte exige o Título e a Descrição separados por `|`. Tente: `-update Título Frio | Corpo.`');

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setAuthor({ name: 'Itadori Yuji © System v2.1', iconURL: client.user.displayAvatarURL() })
            .setTitle(parts[0].trim())
            .setDescription(parts[1].trim());

        const attachment = message.attachments.first();
        if (attachment) embed.setImage(attachment.url);

        await message.delete().catch(()=>null);
        await message.channel.send({ embeds: [embed] });
    }
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');
const {
    buildShopView,
    buyFreeze,
    isJjkGuild,
    JJK_GUILD_ID,
    formatRelativeDuration,
} = require('../../utils/jjk-system');

function buildLojaEmbed(member, shopView) {
    const { profile, grace, items } = shopView;
    const congelamento = items[0];

    return new EmbedBuilder()
        .setColor('#f77f00')
        .setAuthor({ name: 'Loja Jujutsu • Arsenal da Comunidade', iconURL: member.user.displayAvatarURL({ dynamic: true }) })
        .setTitle('Catálogo do momento')
        .setDescription([
            `**Ryō disponível:** \`${profile.money}\``,
            grace?.active
                ? `**Refrescagem aberta:** mais ${formatRelativeDuration(grace.remainingMs)} para salvar a chama.`
                : '**Refrescagem fechada:** o Congelamento só aparece quando alguém entra na janela de risco da sequência.',
            '',
            `**${congelamento.name}**`,
            `${congelamento.description}`,
            '',
            `**Preço:** \`${congelamento.price}\` Ryō`,
            `**Status:** ${congelamento.available ? 'Liberado para compra agora' : 'Bloqueado até existir uma janela de refrescagem'}`,
        ].join('\n'))
        .setFooter({ text: 'Use /loja comprar congelamento quando a janela estiver aberta' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loja')
        .setDescription('Abre a loja Jujutsu do servidor principal.')
        .addSubcommand((sub) =>
            sub.setName('ver').setDescription('Abre a loja e mostra os itens do momento')
        )
        .addSubcommand((sub) =>
            sub
                .setName('comprar')
                .setDescription('Compra um item da loja Jujutsu')
                .addStringOption((option) =>
                    option
                        .setName('item')
                        .setDescription('Item que vai comprar')
                        .setRequired(true)
                        .addChoices({ name: 'Congelamento', value: 'congelamento' })
                )
        ),
    aliases: ['shop', 'arsenal'],
    detailedDescription: 'Loja do sistema JJK. Por enquanto o item principal é o Congelamento, usado para segurar a sequência de foguinhos durante a janela de refrescagem.',
    usage: '`/loja ver`, `/loja comprar item:congelamento` ou `-loja comprar congelamento`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        if (!isJjkGuild(interaction.guildId)) {
            return interaction.reply({ content: formatResponse(`A loja JJK está ativa só no servidor \`${JJK_GUILD_ID}\`.`), flags: ['Ephemeral'] });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'comprar') {
            const item = interaction.options.getString('item', true);
            if (item !== 'congelamento') {
                return interaction.reply({ content: formatResponse('Esse item ainda não foi liberado na loja.'), flags: ['Ephemeral'] });
            }

            const result = await buyFreeze({ guild: interaction.guild, userId: interaction.user.id });
            if (!result.ok) {
                const reasons = {
                    sem_graca: 'Você só pode comprar o **Congelamento** quando entrar na janela de refrescagem do foguinho.',
                    sem_money: `Faltou grana. Junta mais Ryō e volta depois.`,
                    guild_invalida: 'A loja JJK está ligada apenas no servidor principal.',
                };

                return interaction.reply({ content: formatResponse(reasons[result.reason] || 'Não consegui concluir essa compra agora.'), flags: ['Ephemeral'] });
            }

            return interaction.reply({
                content: formatResponse('Compra concluída. O Congelamento segurou tua sequência, mas o bônus da chama ficou 25% mais fraco por um dia.'),
                flags: ['Ephemeral'],
            });
        }

        const embed = buildLojaEmbed(interaction.member, buildShopView(interaction.guildId, interaction.user.id));
        return interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        if (!isJjkGuild(message.guild?.id)) {
            return message.reply(formatResponse(`A loja JJK está ativa só no servidor \`${JJK_GUILD_ID}\`.`));
        }

        const action = String(args[0] || 'ver').toLowerCase();
        const item = String(args[1] || '').toLowerCase();

        if (action === 'comprar') {
            if (item !== 'congelamento') {
                return message.reply(formatResponse('No momento a compra liberada é só `congelamento`.'));
            }

            const result = await buyFreeze({ guild: message.guild, userId: message.author.id });
            if (!result.ok) {
                const reasons = {
                    sem_graca: 'Você só pode comprar o **Congelamento** quando entrar na janela de refrescagem do foguinho.',
                    sem_money: 'Faltou Ryō pra fechar essa compra.',
                    guild_invalida: 'A loja JJK está ligada apenas no servidor principal.',
                };
                return message.reply(formatResponse(reasons[result.reason] || 'Não consegui concluir essa compra agora.'));
            }

            return message.reply(formatResponse('Compra concluída. O Congelamento segurou tua sequência, mas o bônus da chama caiu 25% por um dia.'));
        }

        const embed = buildLojaEmbed(message.member, buildShopView(message.guild.id, message.author.id));
        return message.reply({ embeds: [embed] });
    },
};

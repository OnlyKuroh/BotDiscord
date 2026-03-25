const { requireOwner } = require('../../utils/owner');
const { forceDeliverPendingUpdate } = require('../../utils/update-notifier');

module.exports = {
    prefixOnlyName: 'forcenov',
    aliases: ['fnov'],
    detailedDescription: '[DONO] Reenvia a ultima novidade pendente ou a ultima update ainda nao entregue neste servidor.',
    usage: '`-forcenov`',
    permissions: ['Dono do bot'],

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        await message.delete().catch(() => null);

        if (!message.guild) {
            return sendTemp(message, 'Esse comando precisa ser usado dentro de um servidor.');
        }

        const result = await forceDeliverPendingUpdate(client, message.guild.id);

        if (result.ok) {
            const suffix = result.status === 'already_delivered'
                ? 'Essa novidade ja tinha sido entregue antes.'
                : `Novidade enviada em <#${result.channelId}>.`;
            return sendTemp(message, suffix);
        }

        if (result.status === 'missing_channel' || result.status === 'invalid_channel') {
            return sendTemp(message, 'Nao encontrei um canal valido de novidades. Configure com `-setnovidades #canal` primeiro.');
        }

        if (result.status === 'nothing_pending') {
            return sendTemp(message, 'Nao achei nenhuma novidade pendente ou update nao entregue para este servidor.');
        }

        return sendTemp(message, 'Tentei forcar a novidade, mas ainda falhou. Verifica o canal configurado e as permissoes de envio do bot.');
    },
};

async function sendTemp(message, content) {
    const reply = await message.channel.send(content).catch(() => null);
    if (reply) {
        setTimeout(() => reply.delete().catch(() => null), 8000);
    }
}

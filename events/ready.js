const { Events, ActivityType } = require('discord.js');
const { reconcileKnownGuilds } = require('../utils/guild-join-announcer');
const { evaluatePlatformMilestones } = require('../utils/milestone-announcer');
const { reconcilePersistentArtifacts } = require('../utils/persistent-panels');

const statusMessages = [
    "A engrenagem não para. Use /help para acessar o arsenal.",
    "O carrasco está a postos. Entenda nosso sistema com /info.",
    "Abrindo caminho a cortes. Conheça as /regras antes que eu aja.",
    "Colocando um fim no ciclo. Digite /comandos e faça sua parte."
];

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Logado como ${client.user.tag}. O ciclo continua.`);
        
        let index = 0;
        const updateStatus = () => {
            client.user.setPresence({
                activities: [{ name: 'custom', type: ActivityType.Custom, state: statusMessages[index] }],
                status: 'dnd',
            });
            index = (index + 1) % statusMessages.length;
        };

        updateStatus();
        setInterval(updateStatus, 15 * 1000);

        await reconcileKnownGuilds(client);
        await reconcilePersistentArtifacts(client);
        await evaluatePlatformMilestones(client);
    },
};

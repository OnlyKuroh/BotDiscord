const { EmbedBuilder } = require('discord.js');

const db = require('./db');

const OWNER_SERVER_EVENTS_CHANNEL_ID = process.env.SERVER_EVENTS_CHANNEL_ID || '1482889916680634389';

async function evaluatePlatformMilestones(client) {
    const guildCount = client.guilds.cache.size;
    const totalMembers = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);

    await maybeAnnounceServerThreshold(client, guildCount);
    await maybeAnnounceMemberThreshold(client, totalMembers);
}

async function maybeAnnounceServerThreshold(client, guildCount) {
    const nextMilestone = Math.ceil(guildCount / 5) * 5;
    const warningTarget = nextMilestone - 1;
    const lastServerMilestone = db.get('milestone_server_last') || 0;
    const lastServerWarning = db.get('milestone_server_warning_last') || 0;

    if (guildCount >= 5 && guildCount % 5 === 0 && guildCount > lastServerMilestone) {
        db.set('milestone_server_last', guildCount);
        await sendOwnerEmbed(client, buildMilestoneEmbed({
            title: `Batemos ${guildCount} servidores`,
            description: `Po, papo reto: o bot acabou de cruzar a marca de **${guildCount} servidores**. A tropa ta crescendo e o monitoramento ja ficou de olho no proximo passo.`,
            color: '#5865f2',
            fields: [
                { name: 'Total de servidores', value: `\`${guildCount}\``, inline: true },
                { name: 'Proxima meta', value: `\`${guildCount + 5}\``, inline: true },
            ],
        }));
    } else if (guildCount === warningTarget && warningTarget >= 4 && warningTarget > lastServerWarning) {
        db.set('milestone_server_warning_last', warningTarget);
        await sendOwnerEmbed(client, buildMilestoneEmbed({
            title: `Falta 1 para ${nextMilestone} servidores`,
            description: `Ja deixa o olho aberto porque falta so **1 servidor** para bater a meta de **${nextMilestone}**. Se entrar mais um, eu te aviso bonitinho.`,
            color: '#f39c12',
            fields: [
                { name: 'Agora', value: `\`${guildCount}\` servidores`, inline: true },
                { name: 'Meta', value: `\`${nextMilestone}\` servidores`, inline: true },
            ],
        }));
    }
}

async function maybeAnnounceMemberThreshold(client, totalMembers) {
    const milestone = Math.floor(totalMembers / 100) * 100;
    const lastMilestone = db.get('milestone_member_last') || 0;
    const lastWarning = db.get('milestone_member_warning_last') || 0;

    if (milestone >= 100 && totalMembers >= milestone && milestone > lastMilestone) {
        db.set('milestone_member_last', milestone);
        await sendOwnerEmbed(client, buildMilestoneEmbed({
            title: `Passamos de ${milestone} membros no ecossistema`,
            description: `Ficou bonito, hein. O bot agora soma **${totalMembers} membros** espalhados pelos servidores onde ele ta rodando. O corre ta rendendo.`,
            color: '#2ecc71',
            fields: [
                { name: 'Membros agora', value: `\`${totalMembers}\``, inline: true },
                { name: 'Proxima marca', value: `\`${milestone + 100}\``, inline: true },
            ],
        }));
    } else if (totalMembers >= 99 && totalMembers % 100 === 99 && totalMembers > lastWarning) {
        db.set('milestone_member_warning_last', totalMembers);
        await sendOwnerEmbed(client, buildMilestoneEmbed({
            title: 'Falta 1 para o proximo marco de membros',
            description: `Falta so **1 membro** para bater a proxima marca cheia de gente no ecossistema do bot. Ja fica esperto que o aviso bonito ta no gatilho.`,
            color: '#00b894',
            fields: [
                { name: 'Membros agora', value: `\`${totalMembers}\``, inline: true },
                { name: 'Meta', value: `\`${totalMembers + 1}\``, inline: true },
            ],
        }));
    }
}

function buildMilestoneEmbed({ title, description, color, fields = [] }) {
    return new EmbedBuilder()
        .setColor(color)

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor({ name: '📣 Radar de Crescimento do Itadori' })

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle(title)

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription(description)

        // ─── Campos do embed ─────────────────────────────────────────────────
        .addFields(fields)

        // ─── Footer / Metadados finais ───────────────────────────────────────
        .setFooter({ text: 'Milestone automatico do ecossistema do bot' })
        .setTimestamp();
}

async function sendOwnerEmbed(client, embed) {
    const channel = client.channels.cache.get(OWNER_SERVER_EVENTS_CHANNEL_ID)
        || await client.channels.fetch(OWNER_SERVER_EVENTS_CHANNEL_ID).catch(() => null);

    if (channel?.isTextBased?.()) {
        await channel.send({ embeds: [embed] }).catch(() => null);
    }
}

module.exports = {
    evaluatePlatformMilestones,
};

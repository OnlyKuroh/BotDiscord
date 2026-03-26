const axios = require('axios');
const { getMerakiChampionUrl } = require('./lol-assets');

function safeChampionSlug(championId) {
    return String(championId || '').replace(/[^A-Za-z0-9]/g, '');
}

function joinList(list, fallback = 'sem leitura suficiente') {
    return Array.isArray(list) && list.length ? list.join(', ') : fallback;
}

function toNumber(value, digits = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return digits > 0 ? num.toFixed(digits) : String(Math.round(num));
}

function buildAbilityLine(spells = {}, spellKey) {
    const spell = Array.isArray(spells?.[spellKey]) ? spells[spellKey][0] : null;
    if (!spell) return null;

    const parts = [
        `${spellKey}: ${spell.name || 'sem nome'}`,
        spell.targeting || null,
        spell.damageType ? String(spell.damageType).replace(/_/g, ' ').toLowerCase() : null,
        spell.blurb || null,
    ].filter(Boolean);

    return parts.join(' • ').slice(0, 320);
}

function summarizeChampionMeraki(data) {
    if (!data) return null;

    const attackRange = toNumber(data?.stats?.attackRange?.flat);
    const moveSpeed = toNumber(data?.stats?.movespeed?.flat);
    const abilityLines = ['Q', 'W', 'E', 'R']
        .map((key) => buildAbilityLine(data.abilities, key))
        .filter(Boolean);

    return {
        key: data.key,
        name: data.name,
        positions: data.positions || [],
        roles: data.roles || [],
        attributeRatings: data.attributeRatings || {},
        attackType: data.attackType || null,
        resource: data.resource || null,
        attackRange,
        moveSpeed,
        damageProfile: data.adaptiveType || null,
        abilityLines,
        source: 'Meraki Analytics',
    };
}

async function fetchMerakiChampion(championId) {
    const slug = safeChampionSlug(championId);
    if (!slug) return null;

    try {
        const response = await axios.get(getMerakiChampionUrl(slug), { timeout: 8000 });
        return summarizeChampionMeraki(response.data);
    } catch {
        return null;
    }
}

function buildSourceDigest({ myChampion, enemyChampion }) {
    const sections = [];

    if (myChampion) {
        sections.push([
            `Fonte aberta: ${myChampion.source}`,
            `Seu campeão: ${myChampion.name}`,
            `Posições conhecidas: ${joinList(myChampion.positions)}`,
            `Classes: ${joinList(myChampion.roles)}`,
            `Perfil: ${myChampion.attackType || 'desconhecido'} • ${myChampion.damageProfile || 'desconhecido'} • recurso ${myChampion.resource || 'desconhecido'}`,
            `Alcance: ${myChampion.attackRange || '?'} • movespeed: ${myChampion.moveSpeed || '?'}`,
            `Ratings: dano ${myChampion.attributeRatings?.damage ?? '?'} | tank ${myChampion.attributeRatings?.toughness ?? '?'} | controle ${myChampion.attributeRatings?.control ?? '?'} | mobilidade ${myChampion.attributeRatings?.mobility ?? '?'} | utilidade ${myChampion.attributeRatings?.utility ?? '?'}`,
            `Skills: ${myChampion.abilityLines.join(' || ') || 'sem leitura suficiente'}`,
        ].join('\n'));
    }

    if (enemyChampion) {
        sections.push([
            `Fonte aberta: ${enemyChampion.source}`,
            `Campeão inimigo: ${enemyChampion.name}`,
            `Posições conhecidas: ${joinList(enemyChampion.positions)}`,
            `Classes: ${joinList(enemyChampion.roles)}`,
            `Perfil: ${enemyChampion.attackType || 'desconhecido'} • ${enemyChampion.damageProfile || 'desconhecido'} • recurso ${enemyChampion.resource || 'desconhecido'}`,
            `Alcance: ${enemyChampion.attackRange || '?'} • movespeed: ${enemyChampion.moveSpeed || '?'}`,
            `Ratings: dano ${enemyChampion.attributeRatings?.damage ?? '?'} | tank ${enemyChampion.attributeRatings?.toughness ?? '?'} | controle ${enemyChampion.attributeRatings?.control ?? '?'} | mobilidade ${enemyChampion.attributeRatings?.mobility ?? '?'} | utilidade ${enemyChampion.attributeRatings?.utility ?? '?'}`,
            `Skills: ${enemyChampion.abilityLines.join(' || ') || 'sem leitura suficiente'}`,
        ].join('\n'));
    }

    return sections.join('\n\n');
}

async function collectMatchupSources({ myChampionId, enemyChampionId }) {
    const [myChampion, enemyChampion] = await Promise.all([
        fetchMerakiChampion(myChampionId),
        fetchMerakiChampion(enemyChampionId),
    ]);

    const providerNames = [myChampion?.source, enemyChampion?.source].filter(Boolean);

    return {
        myChampion,
        enemyChampion,
        providerNames: [...new Set(providerNames)],
        digest: buildSourceDigest({ myChampion, enemyChampion }),
    };
}

module.exports = {
    collectMatchupSources,
};

// Emojis LoL inline por imagem externa não funcionam no texto do Discord do jeito
// que a gente queria. Então este helper fica em modo passivo: não cria nada,
// não sobe emoji no app e simplesmente retorna vazio para o layout seguir vivo.

async function getTierEmoji() {
    return '';
}

async function getRoleEmoji() {
    return '';
}

async function getChampionEmoji() {
    return '';
}

async function getItemEmoji() {
    return '';
}

async function getSummonerSpellEmoji() {
    return '';
}

async function getMasteryLevelEmoji() {
    return '';
}

async function getRuneEmoji() {
    return '';
}

module.exports = {
    getTierEmoji,
    getRoleEmoji,
    getChampionEmoji,
    getItemEmoji,
    getSummonerSpellEmoji,
    getMasteryLevelEmoji,
    getRuneEmoji,
};

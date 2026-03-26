function getRiotApiKey() {
    return process.env.RIOT_API_KEY_2 || '';
}

module.exports = {
    getRiotApiKey,
};

/**
 * O utilitário da Engrenagem. O peso que carregamos.
 */

const personaPhrases = [
    "Girando pela eternidade.",
    "O carrasco das maldições.",
    "O próprio Santuário.",
    "A mesma moeda.",
    "Não preciso de motivos, sou uma engrenagem e vou continuar girando para esmagar o mal.",
    "Tudo que me feriu agora é o corte que uso para abrir caminho.",
    "Alguém precisa colocar um fim nesse ciclo, e esse alguém sou eu.",
    "Continue se levantando, mesmo que pareça não ter fim.",
    "Não existem respostas limpas para isso."
];

function formatResponse(text) {
    const phrase = personaPhrases[Math.floor(Math.random() * personaPhrases.length)];
    return `${text}\n\n*${phrase}*`;
}

function injectPersona(text, addPhrase = true) {
    if (!addPhrase) return text;
    return formatResponse(text);
}

module.exports = {
    injectPersona,
    formatResponse,
    personaPhrases
};

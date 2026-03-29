/**
 * utils/lol-app-emojis.js
 *
 * Mapa de Application Emojis subidos no Discord Developer Portal.
 * Uso: <:nome:id> em qualquer mensagem do bot.
 */

const APP_EMOJIS = {
    // ─── UI / Geral ───────────────────────────────────────────────────────────
    Exc:              '1450795276150243328',
    wumpus:           '1450795279963127911',
    special:          '1450795282009948210',
    zoom_glass:       '1450795293363666967',
    home:             '1450795294773219480',
    github:           '1450795299604922448',
    ile:              '1450795301085515827',
    right_arrow:      '1450795303316881418',
    affiliate:        '1450795304994476134',
    chat:             '1450795306760540252',
    gavel:            '1450795308819808326',
    community:        '1450795310438813696',
    staffbadge:       '1486835266848030790',
    category:         '1486835268609773691',
    choose:           '1486835269889163264',
    staff:            '1486835271793377481',
    member:           '1486835273617772564',
    mark:             '1486835275589222651',
    select:           '1486835277199704074',
    upload:           '1486835279401586933',
    members:          '1486835280718725260',
    delivery:         '1486835281972957325',
    '5upload':        '1486835284132757544',
    rating:           '1486835286389428274',

    // ─── LoL Branding ────────────────────────────────────────────────────────
    LeagueLogo:       '1486837051654410363',
    riotgames:        '1486837181518708857',
    ping_missing:     '1486837101772279868',

    // ─── Lanes / Posições ────────────────────────────────────────────────────
    Top:              '1486661120616829099',
    Bot:              '1486813706536095744',
    Selva:            '1486813708037656667',
    Meio:             '1486813709543149630',
    Suporte:          '1486813712592670720',
    Aleatorio:        '1486813710927527967',

    // ─── Ranks (emblemas grandes) ────────────────────────────────────────────
    Ferro:            '1486830568359334019',
    Bronze:           '1486830562453885131',
    Prata:            '1486830551011954880',
    Ouro:             '1486830552173645876',
    Platina:          '1486830559362547793',
    Esmeralda:        '1486830570448359585',
    Diamante:         '1486830565427773531',
    Mestre:           '1486830557903196341',
    Grao_Mestre:      '1486830556342779995',
    Desafiante:       '1486830554707001525',

    // ─── Ranks (mini crests — lowercase, para inline) ────────────────────────
    iron:             '1486831434697150617',
    bronze:           '1486831433329803546',
    silver:           '1486831435984670800',
    gold:             '1486831428430856302',
    platinum:         '1486831430859362385',
    emerald:          '1486830570448359585', // usa o grande como fallback
    diamond:          '1486831421501739079',
    master:           '1486831426384040026',
    grandmaster:      '1486831423359815712',
    challenger:       '1486831418159136869',
    unranked:         '1486831419782201406',

    // ─── Maestria ────────────────────────────────────────────────────────────
    Maestria_2:       '1486832730007277669',
    Maestria_3:       '1486832727998070845',
    Maestria_6:       '1486832731936653451',
    Maestria_7:       '1486832733887135885',
    Maestria_8:       '1486832735678107739',
    Maestria_9:       '1486832725393674342',
    Maestria_10:      '1486832723493388469',

    // ─── Honra ────────────────────────────────────────────────────────────────
    Honra_1:          '1486833156358148196',
    Honra_2:          '1486833154449870888',
    Honra_3:          '1486833153023803574',
    Honra_4:          '1486833146191151215',
    Honra_5:          '1486833149676752987',

    // ─── Campeões ────────────────────────────────────────────────────────────
    TahmKench:        '1486661103923495022',
    Yasuo:            '1486661105370529802',
    Ivern:            '1486661106423566347',
    Sett:             '1486661107056771257',
    Ashe:             '1486661108592017469',
    Teemo:            '1486661110596767759',
    Jhin:             '1486661112295456870',
    Twitch:           '1486661113268535389',
    Heimerdinger:     '1486661115386794036',
    Shyvana:          '1486661116787691621',
    Vayne:            '1486835838531932170',

    // ─── Skins Vayne ─────────────────────────────────────────────────────────
    Vayne_heartseeker:  '1486835839882362922',
    Vayne_skt:          '1486835841354567763',
    Vayne_fpxvayne:     '1486835843296657569',
    Vayne_project:      '1486835845200613617',
    Vayne_aristocrat:   '1486835846916341973',
    Vayne_vindicator:   '1486835848266649741',
    Vayne_prestige:     '1486835850145697964',
    Vayne_spiritblossom:'1486835852037460218',
    Vayne_oldvayne:     '1486835853752795319',
    Vayne_dragonslayer: '1486835855573389372',
    Vayne_arclight:     '1486835857116889118',
    Vayne_soulstealer:  '1486835858836295740',
    Vayne_firecracker:  '1486835860363284541',

    // ─── Skins Ashe ──────────────────────────────────────────────────────────
    Ash:              '1486836379257274488',
    Ash_Skin1:        '1486836369946054766',
    Ash_Skin2:        '1486836371451674624',
    Ash_Skin3:        '1486836373423132844',
    Ash_Skin4:        '1486836374924562622',
    Ash_Skin5:        '1486836376677777470',
    Ash_Skin6:        '1486836382050680903',
    Ash_Skin7:        '1486836384085053563',
    Ash_Skin8:        '1486836386647773244',
    Ash_Skin9:        '1486836388857909311',
    Ash_Skin10:       '1486836390389088336',

    // ─── Itens (por ID numérico) ──────────────────────────────────────────────
    '1318legend':     '1486834217445757210',
    '1844legend':     '1486834225016737872',
    '2654legend':     '1486834226480283698',
    '3392legend':     '1486834228040564928',
    '4428legend':     '1486834263231037611',
    '4842legend':     '1486834229366231211',
    '5268legend':     '1486834264837456013',
    '5573legend':     '1486834230385180693',
    '5933legend':     '1486834233434575030',
    '6262legend':     '1486834266179371038',
    '7723legend':     '1486834241718325338',
    '7759legend':     '1486834244029517864',
    '7849legend':     '1486834245774082088',
    '8267legend':     '1486834254829846748',
    '9287legend':     '1486834256368898138',
    '9288legend':     '1486834258294345859',
    '9350legend':     '1486834259942576300',
    '9627legend':     '1486834261850984498',

    // ─── Itens especiais ─────────────────────────────────────────────────────
    guinsoo:          '1486837579297980468',

    // ─── Regiões LoL ─────────────────────────────────────────────────────────
    shurima:          '1486834504772485321',
    ixtal:            '1486834506156474660',
    thevoid:          '1486834507662491668',
    noxus:            '1486834509306396792',
    piltover:         '1486834510917275678',
    bandlecity:       '1486834512552788010',
    frelijord:        '1486834513991569511',
    shadowisle:       '1486834515597852803',
    ionia:            '1486834517548335114',
    mounttargon:      '1486834519070867667',
    bilgewater:       '1486834520874287264',
    zaun:             '1486834523315634277',

    // ─── Emotes / Diversão ───────────────────────────────────────────────────
    dancarina_fantasma:     '1486837582162694244',
    boosthand:              '1486838065770004550',
    star_guardian_jinx:     '1486838191523758080',
    star_guardian_ahri:     '1486838193667051762',
    katarina_disgust:       '1486838195147636746',
    star_guardian_syndra:   '1486838196502270004',
};

/**
 * Retorna a string de emoji formatada para Discord: <:nome:id>
 * Se não encontrar, retorna fallback (padrão: string vazia).
 */
function e(name, fallback = '') {
    const id = APP_EMOJIS[name];
    if (!id) return fallback;
    return `<:${name}:${id}>`;
}

/**
 * Emoji de rank pelo tier (aceita uppercase ou lowercase).
 * Usa os mini crests (lowercase) por padrão; passa large=true para emblema grande.
 */
function rankEmoji(tier, large = false) {
    if (!tier) return e('unranked');
    const t = String(tier).toLowerCase();
    if (large) {
        const capMap = {
            iron: 'Ferro', bronze: 'Bronze', silver: 'Prata', gold: 'Ouro',
            platinum: 'Platina', emerald: 'Esmeralda', diamond: 'Diamante',
            master: 'Mestre', grandmaster: 'Grao_Mestre', challenger: 'Desafiante',
        };
        return e(capMap[t] || 'unranked');
    }
    return e(t) || e('unranked');
}

/** Emoji de maestria por nível (1–10). */
function masteryEmoji(level) {
    const l = Math.min(Math.max(Number(level) || 1, 1), 10);
    // Maestria_1, 4, 5 não foram subidos — usa o mais próximo disponível
    const available = [2, 3, 6, 7, 8, 9, 10];
    const key = available.includes(l) ? l : available.reduce((a, b) => Math.abs(b - l) < Math.abs(a - l) ? b : a);
    return e(`Maestria_${key}`);
}

/** Emoji de honra por nível (0–5). */
function honorEmoji(level) {
    const l = Math.min(Math.max(Number(level) || 0, 0), 5);
    if (l === 0) return '';
    return e(`Honra_${l}`);
}

/** Emoji de lane/posição (aceita top/bot/jungle/mid/support/fill/adc e variações). */
function laneEmoji(role) {
    const map = {
        top: 'Top', toplane: 'Top',
        jungle: 'Selva', jng: 'Selva', jg: 'Selva',
        mid: 'Meio', middle: 'Meio', midlane: 'Meio',
        bot: 'Bot', bottom: 'Bot', adc: 'Bot',
        support: 'Suporte', utility: 'Suporte', sup: 'Suporte',
        fill: 'Aleatorio', unselected: 'Aleatorio',
    };
    const key = map[String(role || '').toLowerCase()];
    return key ? e(key) : '';
}

/** Emoji de campeão pelo championId (ex: "Vayne", "Shyvana"). */
function championEmoji(championId) {
    return e(championId) || e(String(championId).replace(/\s/g, ''));
}

/** Emoji de item pelo ID numérico (ex: 3392). */
function itemEmoji(itemId) {
    return e(`${itemId}legend`) || '';
}

/** Emoji de região (ex: "noxus", "ionia"). */
function regionEmoji(region) {
    return e(String(region || '').toLowerCase());
}

module.exports = {
    APP_EMOJIS,
    e,
    rankEmoji,
    masteryEmoji,
    honorEmoji,
    laneEmoji,
    championEmoji,
    itemEmoji,
    regionEmoji,
    // aliases para compatibilidade com código existente
    getTierEmoji:          (tier) => rankEmoji(tier),
    getRoleEmoji:          (role) => laneEmoji(role),
    getChampionEmoji:      (id)   => championEmoji(id),
    getItemEmoji:          (id)   => itemEmoji(id),
    getSummonerSpellEmoji: ()     => '',   // spells não foram subidas ainda
    getMasteryLevelEmoji:  (lvl)  => masteryEmoji(lvl),
    getRuneEmoji:          ()     => '',   // runas não foram subidas ainda
};

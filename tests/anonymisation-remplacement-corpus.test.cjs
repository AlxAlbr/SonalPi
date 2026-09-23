const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

function environnement(t, { regles, entretiens, html, echecSonal = false, echecCrp = false }) {
    const dom = new JSDOM('<!doctype html><body></body>', {
        runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    t.after(() => dom.window.close());
    for (const fichier of [
        'modules/Anonymisation/anon-detection.js',
        'modules/Anonymisation/anon-regles.js',
        'modules/Anonymisation/tableau_base.js',
    ]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', fichier), 'utf8'), dom.getInternalVMContext(), { filename: fichier });
    }
    const w = dom.window;
    const copie = valeur => JSON.parse(JSON.stringify(valeur));
    let etatRegles = copie(regles);
    let etatEnt = copie(entretiens);
    let etatHtml = copie(html);
    let nbSauvegardesCrp = 0;
    let nbSonal = 0;
    w.electronAPI = {
        getAnon: async () => copie(etatRegles),
        setAnon: async valeur => { etatRegles = copie(valeur); },
        getEnt: async () => copie(etatEnt),
        setEnt: async valeur => { etatEnt = copie(valeur); },
        getHtml: async index => etatHtml[index],
        setHtml: async (index, valeur) => { etatHtml[index] = valeur; },
        getEntCur: async () => -1,
    };
    w.majFichierSonal = async () => {
        nbSonal++;
        if (echecSonal && nbSonal === 1) throw new Error('disque Sonal indisponible');
    };
    w.sauvegarderCorpus = async () => {
        nbSauvegardesCrp++;
        return echecCrp && nbSauvegardesCrp === 1
            ? { success: false, error: 'disque corpus indisponible' }
            : { success: true };
    };
    w.question = async () => 'remplacer';
    return {
        w,
        etat: () => ({ regles: copie(etatRegles), entretiens: copie(etatEnt), html: copie(etatHtml), nbSonal, nbSauvegardesCrp }),
    };
}

function run(entite, pseudo, rk) {
    return `<span class="anon debsel finsel" data-rk="${rk}" data-pseudo="${pseudo}">${entite}</span>`;
}

const regleAlice = { entite: 'Alice', remplacement: 'Martin' };

function local(entite = 'Alice', pseudo = 'Martin', extra = {}) {
    return { entite, remplacement: pseudo, portee: 'corpus', occurrences: 1, matchPositions: [], ...extra };
}

test('remplacement corpus mono-pseudo : texte et entretien à libellé seul sont persistés', async t => {
    const env = environnement(t, {
        regles: [regleAlice],
        entretiens: [
            { nom: 'Texte', tabAnon: [local()] },
            { nom: 'Locuteur', tabAnon: [local('Alice', 'Martin', { occurrences: 0 })] },
        ],
        html: [
            run('Alice', 'Martin', 1),
            '<div class="ligloc loc-anon" data-nomloc="Alice" data-locpseudo="Martin"></div>',
        ],
    });

    const resultat = await env.w.demanderRemplacementPseudoCorpus('Alice', 'Martin', 'Durand');
    assert.equal(resultat.ok, true);
    const etat = env.etat();
    assert.equal(etat.regles[0].remplacement, 'Durand');
    assert.match(etat.html[0], /data-pseudo="Durand"/);
    assert.match(etat.html[1], /data-locpseudo="Durand"/);
    assert.equal(etat.entretiens[0].tabAnon[0].remplacement, 'Durand');
    assert.equal(etat.entretiens[1].tabAnon[0].remplacement, 'Durand');

    // Cycle fermeture/réouverture : la fusion garde la nouvelle règle et l'export structurel ne
    // contient ni l'ancien pseudo ni le vrai nom confirmé.
    const rouvertes = env.w.fusionnerTabAnon(etat.regles, etat.entretiens[0].tabAnon);
    assert.deepEqual(Array.from(env.w.pseudosDe(rouvertes[0])), ['Durand']);
    const exporte = env.w.preparerDocumentAnonymise(etat.html[0], []).html;
    assert.match(exporte, /\[Durand\]/);
    assert.doesNotMatch(exporte, /Martin|>Alice</);

    assert.equal(etat.nbSonal, 2);
    assert.equal(etat.nbSauvegardesCrp, 1);
});

test('renommer l’alternative cible seulement cette entité et préserve statuts et primaire', async t => {
    const env = environnement(t, {
        regles: [
            { entite: 'Alice', remplacement: 'A', remplacementAlt: 'B' },
            { entite: 'Bob', remplacement: 'B' },
        ],
        entretiens: [{
            nom: 'Mixte',
            tabAnon: [local('Alice', 'A', { remplacementAlt: 'B' }), local('Bob', 'B')],
        }],
        html: [`
            ${run('Alice', 'A', 1)} ${run('Alice', 'B', 2)}
            <span class="anon-exception" data-rk="3">Alice</span><span data-rk="4">Alice</span>
            ${run('Bob', 'B', 5)}
            <div class="ligloc loc-suggere-refuse" data-nomloc="Alice" data-locpseudo-suggere="B"></div>
        `],
    });

    const resultat = await env.w.demanderRemplacementPseudoCorpus('Alice', 'B', 'C');
    assert.equal(resultat.ok, true);
    const etat = env.etat();
    assert.deepEqual(etat.regles.map(r => [r.entite, r.remplacement, r.remplacementAlt]), [
        ['Alice', 'A', 'C'], ['Bob', 'B', undefined],
    ]);
    const racine = env.w.document.createElement('div');
    racine.innerHTML = etat.html[0];
    assert.equal(racine.querySelector('[data-rk="1"]').dataset.pseudo, 'A');
    assert.equal(racine.querySelector('[data-rk="2"]').dataset.pseudo, 'C');
    assert.equal(racine.querySelector('[data-rk="3"]').classList.contains('anon-exception'), true);
    assert.equal(racine.querySelector('[data-rk="4"]').hasAttribute('data-pseudo'), false);
    assert.equal(racine.querySelector('[data-rk="5"]').dataset.pseudo, 'B');
    const loc = racine.querySelector('.ligloc');
    assert.equal(loc.classList.contains('loc-suggere-refuse'), true);
    assert.equal(loc.dataset.locpseudoSuggere, 'C');
});

test('une règle document indépendante bloque le remplacement avant toute écriture', async t => {
    const initial = {
        regles: [regleAlice],
        entretiens: [{ nom: 'Indépendant', tabAnon: [local('Alice', 'Martin', { portee: 'document' })] }],
        html: [run('Alice', 'Martin', 1)],
    };
    const env = environnement(t, initial);
    let diagnostic = '';
    env.w.question = async message => { diagnostic = message; return 'ok'; };

    const resultat = await env.w.demanderRemplacementPseudoCorpus('Alice', 'Martin', 'Durand');
    assert.equal(resultat.bloque, true);
    assert.match(diagnostic, /indépendantes/i);
    assert.deepEqual(env.etat().regles, initial.regles);
    assert.deepEqual(env.etat().html, initial.html);
    assert.equal(env.etat().nbSonal, 0);
});

test('annuler la confirmation ne mute ni règles ni marquages', async t => {
    const initial = {
        regles: [regleAlice],
        entretiens: [{ nom: 'Test', tabAnon: [local()] }],
        html: [run('Alice', 'Martin', 1)],
    };
    const env = environnement(t, initial);
    env.w.question = async () => 'annuler';
    const resultat = await env.w.demanderRemplacementPseudoCorpus('Alice', 'Martin', 'Durand');
    assert.equal(resultat.annule, true);
    assert.deepEqual(env.etat().regles, initial.regles);
    assert.deepEqual(env.etat().html, initial.html);
    assert.equal(env.etat().nbSonal, 0);
});

test('les actions du conflit ajoutent, conservent ou annulent sans créer une troisième variante', async t => {
    for (const [choix, attendu] of [['ajouter', ['Martin', 'Durand']], ['conserver', ['Martin']], ['annuler', ['Martin']]]) {
        const env = environnement(t, { regles: [regleAlice], entretiens: [], html: [] });
        env.w.question = async (_message, boutons) => {
            assert.ok(boutons.every(b => typeof b === 'object'));
            return choix;
        };
        const resultat = await env.w.resoudreConflitCorpus('Alice', { remplacement: 'Durand' });
        assert.equal(!!resultat.annule, choix === 'annuler');
        assert.deepEqual(env.etat().regles.flatMap(r => env.w.pseudosDe(r)), attendu);
    }

    const env = environnement(t, {
        regles: [{ entite: 'Alice', remplacement: 'A', remplacementAlt: 'B' }], entretiens: [], html: [],
    });
    let ids = [];
    env.w.question = async (_message, boutons) => { ids = boutons.map(b => b.id); return 'annuler'; };
    await env.w.resoudreConflitCorpus('Alice', { remplacement: 'A', remplacementAlt: 'C' });
    assert.equal(ids.includes('ajouter'), false);
    assert.deepEqual(env.etat().regles[0], { entite: 'Alice', remplacement: 'A', remplacementAlt: 'B' });
});

for (const [nom, options] of [
    ['échec .Sonal', { echecSonal: true }],
    ['échec .crp', { echecCrp: true }],
]) {
    test(`${nom} : règles, HTML et modèles sont restaurés`, async t => {
        const initial = {
            regles: [regleAlice],
            entretiens: [{ nom: 'Test', tabAnon: [local()] }],
            html: [run('Alice', 'Martin', 1)],
        };
        const env = environnement(t, { ...initial, ...options });
        const resultat = await env.w.demanderRemplacementPseudoCorpus('Alice', 'Martin', 'Durand');
        assert.equal(resultat.ok, false);
        assert.ok(resultat.erreur);
        assert.deepEqual(env.etat().regles, initial.regles);
        assert.deepEqual(env.etat().entretiens, initial.entretiens);
        assert.deepEqual(env.etat().html, initial.html);
        assert.ok(env.etat().nbSauvegardesCrp >= 1);
    });
}

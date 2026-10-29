const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parserSousTitres } = require('../modules/import_sous_titres');
const { convertSRT, convertVTT, convertJSON } = require('../modules/conversions');

function srt(textes) {
    return textes.map((texte, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i + 1},500\n${texte}\n`).join('\n');
}

function navigateur(t, fichiers = []) {
    const dom = new JSDOM('<!doctype html><body></body>', {
        runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    t.after(() => dom.window.close());
    for (const fichier of fichiers) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', fichier), 'utf8'), dom.getInternalVMContext(), { filename: fichier });
    }
    return dom.window;
}

const copie = valeur => JSON.parse(JSON.stringify(valeur));

test('SRT : noms accentués, espaces avant les deux-points et lignes de continuation', () => {
    const r = parserSousTitres(srt(['Élodie Martin : Bonjour\ntout le monde : oui !', 'Jean-Paul: Bien reçu.', 'Élodie Martin: Merci.']));
    assert.deepEqual(r.locut, ['', 'Élodie Martin', 'Jean-Paul']);
    assert.deepEqual(r.tabSeg.map(s => s[3]), [1, 2, 1]);
    assert.equal(r.tabSeg[0][4], 'Bonjour tout le monde : oui ! ');
    assert.equal(r.tabSeg[0][1], 0);
    assert.equal(r.tabSeg[0][2], 1.5);
    assert.deepEqual(r.avertissements, []);
});

test('SRT : Speaker à plusieurs chiffres, non contigus et hors ordre, sans effacer les mentions internes', () => {
    const r = parserSousTitres(srt(['Speaker 12: Première.', 'Speaker 0 : On cite Speaker 12: ici.', 'Speaker 12: Dernière.']));
    assert.deepEqual(r.locut, ['', 'Speaker 13', 'Speaker 1']);
    assert.deepEqual(r.tabSeg.map(s => s[3]), [1, 2, 1]);
    assert.equal(r.tabSeg[1][4], 'On cite Speaker 12: ici. ');
});

test('SRT : la convention Speaker +1 ne renomme pas les noms dans une liste mixte', () => {
    const r = parserSousTitres(srt(['Speaker 12: Bonjour.', 'Enquêtrice: Merci.']));
    assert.deepEqual(r.locut, ['', 'Speaker 12', 'Enquêtrice']);
});

test('SRT : ancien préfixe Speaker sans deux-points', () => {
    const r = parserSousTitres(srt(['Speaker 10 Bonjour.', 'Speaker 0 Merci.']));
    assert.deepEqual(r.locut, ['', 'Speaker 11', 'Speaker 1']);
    assert.equal(r.tabSeg[0][4], 'Bonjour. ');
});

test('SRT mixte : aucune suppression partielle de préfixe, avertissement explicite', () => {
    const r = parserSousTitres(srt(['Alice: Bonjour.', 'Une réponse sans préfixe.']));
    assert.deepEqual(r.locut, ['']);
    assert.equal(r.tabSeg[0][3], 0);
    assert.equal(r.tabSeg[0][4], 'Alice: Bonjour. ');
    assert.equal(r.avertissements.length, 1);
});

test('SRT sans locuteur : nombres, heure, URL et flèche dans le texte sont conservés', () => {
    const r = parserSousTitres(srt(['123\n456\nÀ demain.', '12:30', 'https://exemple.fr', 'A --> B']));
    assert.deepEqual(r.locut, ['']);
    assert.deepEqual(r.tabSeg.map(s => s[4]), ['123 456 À demain. ', '12:30 ', 'https://exemple.fr ', 'A --> B ']);
});

test('SRT : BOM, CR seuls, préambule whispurge et absence de saut final', () => {
    const r = parserSousTitres('\uFEFFUn entretien\rExporté par whispurge\r\r1\r00:00:00,125 --> 00:00:01,500\rAlice: Bonjour.');
    assert.equal(r.tabSeg.length, 1);
    assert.equal(r.tabSeg[0][1], 0.125);
    assert.equal(r.tabSeg[0][4], 'Bonjour. ');
});

test('SRT : cues sans numéros ni lignes vides, coordonnées de positionnement', () => {
    const r = parserSousTitres('00:00:00.1 --> 00:00:01.25 X1:0 X2:100\nBonjour\n00:00:02.000 --> 00:00:03.000\nAu revoir');
    assert.equal(r.tabSeg.length, 2);
    assert.equal(r.tabSeg[0][4], 'Bonjour ');
    assert.equal(r.tabSeg[0][2], 1.25);
});

test('SRT : préfixe vide autorisé, sans affecter les coordonnées du segment suivant', () => {
    const r = parserSousTitres(srt(['Alice:', 'Bob: Une réponse.']));
    assert.deepEqual(r.locut, ['', 'Alice', 'Bob']);
    assert.equal(r.tabSeg[0][4], '');
    assert.equal(r.tabSeg[1][1], 1);
    assert.equal(r.tabSeg[1][3], 2);
});

test('Sous-titres invalides : vide, sans cue, temps invalides ou fin avant début', () => {
    for (const fichier of ['', 'du texte sans coordonnées', '00:00:01,000 --> 00:00:02,000\n',
        '00:60:00,000 --> 01:01:00,000\nBonjour', '00:00:02,000 --> 00:00:01,000\nBonjour',
        '00:AA:02,000 --> 00:00:03,000\nBonjour', '-00:00:01,000 --> 00:00:03,000\nBonjour']) {
        assert.throws(() => parserSousTitres(fichier));
    }
});

const vtt = 'WEBVTT\n\nNOTE commentaire\nÀ ignorer\n\nSTYLE\n::cue { color: red; }\n\nREGION\nid:region\n\nidentifiant\n00:00.000 --> 00:01.500 align:start position:0%\n<v.classe Alice><b>Bonjour</b> &amp; bienvenue\nsur deux lignes.</v>\n\nautre-id\n00:02.000 --> 00:03.000\n<v Bob>Merci.</v>\n';

test('VTT : métadonnées, voix natives, identifiants, positions et contenu multiligne', () => {
    const r = parserSousTitres(vtt, 'vtt');
    assert.deepEqual(r.locut, ['', 'Alice', 'Bob']);
    assert.equal(r.tabSeg.length, 2);
    assert.equal(r.tabSeg[0][4], 'Bonjour & bienvenue sur deux lignes. ');
    assert.equal(r.tabSeg[0][2], 1.5);
});

test('Conversion Sonal : HTML littéral et entités préservés, pas de balise injectée', async t => {
    const w = navigateur(t);
    const texte = 'A & B < C > D <img src=x onerror=alert(1)> </script>';
    const r = await convertSRT(srt([texte]));
    const doc = new w.DOMParser().parseFromString(r.formatSonal, 'text/html');
    const seg = doc.querySelector('.lblseg');
    assert.equal(seg.textContent, texte + ' ');
    assert.equal(seg.querySelector('img'), null);
    assert.equal(seg.dataset.deb, '0');
    assert.equal(seg.dataset.loc, '0');
    assert.equal(Number(seg.firstElementChild.dataset.len), (texte + ' ').match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g).length);
});

test('Conversion Sonal : nom de locuteur contenant </script> sérialisé sans casser le JSON', async t => {
    const w = navigateur(t);
    const nom = 'Alice </script><script>alert(1)</script>';
    const r = await convertSRT(srt([nom + ': Bonjour.']));
    const doc = new w.DOMParser().parseFromString(r.formatSonal, 'text/html');
    assert.deepEqual(JSON.parse(doc.querySelector('#loc-json').textContent), ['', nom]);
    assert.equal(doc.querySelectorAll('body script').length, 1);
});

test('JSON Whisper : tableau et objet segments produisent un vrai fichier Sonal', async t => {
    const w = navigateur(t);
    const segments = [{ start: 0, end: 2.5, text: 'Speaker 12: Bonjour.', avg_logprob: -0.4 }];
    for (const contenu of [segments, { segments }]) {
        const r = await convertJSON(contenu);
        const doc = new w.DOMParser().parseFromString(r.formatSonal, 'text/html');
        assert.equal(doc.querySelector('.lblseg').textContent, 'Bonjour. ');
        assert.equal(doc.querySelector('.lblseg').dataset.loc, '1');
        assert.deepEqual(r.locut, ['', 'Speaker 13']);
    }
    await assert.rejects(convertJSON({}), /Aucun segment/);
    await assert.rejects(convertJSON([{ start: 0, end: -1, text: 'invalide' }]), /invalide/);
});

test('Conversions SRT/VTT : pas de dépendance au TimeToSec ou convertSpeaker global', async () => {
    assert.equal((await convertSRT(srt(['Bonjour.']))).tabSeg.length, 1);
    assert.equal((await convertVTT(vtt)).tabSeg.length, 2);
});

function corpus(t) {
    const w = navigateur(t, ['modules/import_sous_titres.js', 'modules/conversions.js', 'modules/gestion_entretiens.js']);
    const entretiens = [], ecritures = [], messages = [];
    let contenu = '';
    w.tabVar = [];
    w.tabDic = [];
    w.question = async message => { messages.push(message); return 'ok'; };
    w.electronAPI = {
        setTabLoc: async () => {},
        getCorpus: async () => ({ type: 'local', folder: '/corpus' }),
        readFileContent: async () => contenu,
        createPath: async (dossier, fichier) => dossier + '/' + fichier,
        doesFileExists: async () => false,
        sauvegarderFichier: async (chemin, html) => { ecritures.push({ chemin, html }); return { success: true }; },
        getEnt: async () => copie(entretiens),
        setEnt: async nouveaux => { entretiens.splice(0, entretiens.length, ...copie(nouveaux)); },
    };
    return { w, entretiens, ecritures, messages, contenu: valeur => { contenu = valeur; } };
}

test('Ajout corpus : branche VTT dédiée et remise à zéro des métadonnées entre fichiers', async t => {
    const env = corpus(t);
    env.w.tabLocImport = ['Ancien'];
    env.w.tabAnonImport = [{ entite: 'Ancienne règle' }];
    env.contenu(vtt);
    await env.w.ajouterEntretien('/source/Entretien.VTT', null, true);
    assert.deepEqual(env.entretiens[0].tabLoc, ['', 'Alice', 'Bob']);
    assert.deepEqual(env.entretiens[0].tabAnon, []);
    assert.equal(env.ecritures[0].chemin, '/corpus/Entretien.sonal');
    env.w.tabAnonImport = [{ entite: 'Autre ancienne règle' }];
    env.contenu(srt(['Une transcription sans locuteur.']));
    await env.w.ajouterEntretien('/source/autre.srt', null, true);
    assert.deepEqual(env.entretiens[1].tabLoc, ['']);
    assert.deepEqual(env.entretiens[1].tabAnon, []);
    assert.equal(env.messages.length, 0);
});

test('Ajout corpus : un fichier invalide n’écrit et n’ajoute aucun entretien', async t => {
    const env = corpus(t);
    env.contenu('00:00:02,000 --> 00:00:01,000\nErreur');
    await env.w.ajouterEntretien('/source/invalide.srt', null, true);
    assert.equal(env.ecritures.length, 0);
    assert.equal(env.entretiens.length, 0);
    assert.match(env.messages[0], /invalide.srt.*\nHorodatage invalide/);
    env.contenu(srt(['Alice: Bonjour.', 'Sans préfixe.']));
    await env.w.ajouterEntretien('/source/mixte.srt', null, true);
    assert.equal(env.entretiens.length, 1);
    assert.match(env.messages[1], /préfixes ont été conservés/);
});

test('Ajout corpus : le JSON est décodé après normalisation, pas traité comme une string', async t => {
    const env = corpus(t);
    env.contenu('\uFEFF' + JSON.stringify({ segments: [{ start: 0, end: 1, text: 'Speaker 10: Bonjour.' }] }));
    await env.w.ajouterEntretien('/source/whisper.json', null, true);
    assert.equal(env.entretiens.length, 1);
    assert.deepEqual(env.entretiens[0].tabLoc, ['', 'Speaker 11']);
    assert.match(env.ecritures[0].html, /class="lblseg sautlig"/);
    env.contenu('{JSON cassé');
    await env.w.ajouterEntretien('/source/casse.json', null, true);
    assert.equal(env.entretiens.length, 1);
    assert.equal(env.messages.length, 1);
});

test('Éditeur : même parseur, coordonnées conservées, pas de mutation en cas d’erreur', t => {
    const w = navigateur(t, ['modules/import_sous_titres.js', 'modules/gestion_fichiers.js']);
    w.alert = () => {};
    w.lignesFich = srt(['Alice: Bonjour', 'Bob: Merci']).split('\n');
    w.convertSRT();
    assert.deepEqual(copie(w.locut), ['', 'Alice', 'Bob']);
    assert.equal(w.TabSeg.length, 2);
    assert.equal(w.TabSeg[1][1], 1);
    const precedent = w.TabSeg;
    w.lignesFich = ['invalide'];
    assert.throws(() => w.convertSRT());
    assert.equal(w.TabSeg, precedent);
    w.lignesFich = vtt.split('\n');
    w.convertVTT();
    assert.deepEqual(copie(w.locut), ['', 'Alice', 'Bob']);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

function contexte(t, html = '<!doctype html><html><head></head><body></body></html>') {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    t.after(() => dom.window.close());
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '..', 'modules/thematisation.js'), 'utf8'),
        dom.getInternalVMContext(),
        { filename: 'modules/thematisation.js' },
    );
    return dom.window;
}

test('persister les catégories met à jour la mémoire avant de sauvegarder le corpus', async t => {
    const w = contexte(t);
    const appels = [];
    const categories = [{ code: 'cat_001', nom: 'Nouvelle catégorie' }];

    w.electronAPI = {
        setThm: async valeur => {
            appels.push(['setThm', valeur]);
            return true;
        },
    };
    w.sauvegarderCorpus = async avecBackup => {
        appels.push(['sauvegarderCorpus', avecBackup]);
        return { success: true };
    };

    const resultat = await w.persisterCategoriesCorpus(categories);

    assert.deepEqual(appels, [
        ['setThm', categories],
        ['sauvegarderCorpus', false],
    ]);
    assert.deepEqual(resultat, { success: true });
});

test('créer puis modifier une catégorie déclenche chaque fois la sauvegarde du corpus', async t => {
    const w = contexte(t, `<!doctype html><html><head></head><body>
        <div id="cat-form-dock"></div>
        <div id="fond-thm-edit"></div>
        <form id="cat-form" data-rkthm="-1" data-placerapres="-2"></form>
        <input id="lblCodeCat" value="042">
        <textarea id="lblNomCat">Catégorie persistée</textarea>
        <span id="lblrang">0</span>
        <input id="chkcatcoul" type="checkbox">
        <input id="colorFond" value="#ffffff">
        <input id="chkcatpol" type="checkbox">
        <span class="lblTaillePol">18</span>
    </body></html>`);

    let categories = [];
    let sauvegardes = 0;
    w.electronAPI = {
        getThm: async () => categories,
        setThm: async valeur => {
            categories = valeur;
            return true;
        },
    };
    w.sauvegarderCorpus = async () => {
        sauvegardes++;
        return { success: true };
    };

    await w.validerModifsThm();

    assert.equal(sauvegardes, 1);
    assert.equal(categories.length, 1);
    assert.equal(categories[0].code, 'cat_042');
    assert.equal(categories[0].nom, 'Catégorie persistée');

    w.document.getElementById('lblNomCat').value = 'Catégorie modifiée';
    await w.validerModifsThm();

    assert.equal(sauvegardes, 2);
    assert.equal(categories.length, 1);
    assert.equal(categories[0].nom, 'Catégorie modifiée');
});

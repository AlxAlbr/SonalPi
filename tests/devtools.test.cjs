const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function demarrer(isPackaged) {
    const fenetres = [];
    const app = new EventEmitter();
    Object.assign(app, {
        isPackaged,
        commandLine: { appendSwitch() {} },
        getPath: () => '/profil-test',
        getVersion: () => '1.0.82',
    });
    class BrowserWindow extends EventEmitter {
        constructor() {
            super();
            this.devToolsOuverts = false;
            this.webContents = {
                openDevTools: () => { this.devToolsOuverts = true; },
                executeJavaScript: async () => {},
            };
            fenetres.push(this);
        }
        loadFile(fichier) { this.fichier = fichier; }
        maximize() {}
        setIcon() {}
        setMenu() {}
        show() {}
    }
    const autoUpdater = new EventEmitter();
    autoUpdater.checkForUpdatesAndNotify = async () => null;
    const electron = {
        app, BrowserWindow,
        ipcMain: { handle() {}, on() {} },
        Menu: { buildFromTemplate() {}, setApplicationMenu() {} },
    };
    const contexte = vm.createContext({
        require: nom => {
            if (nom === 'electron') return electron;
            if (nom === 'electron-updater') return { autoUpdater };
            if (nom === 'electron-store') return class {};
            if (['fs', 'path', 'http', 'https'].includes(nom)) return require(nom);
            return {};
        },
        __dirname: path.join(__dirname, '..'),
        module: { exports: {} },
        process: { platform: process.platform, argv: [] },
        console: { log() {}, warn() {}, error() {} },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), contexte, { filename: 'main.js' });
    app.emit('ready');
    fenetres[0].emit('ready-to-show');
    vm.runInContext('editerEntretien(mainWindow, 0)', contexte);
    fenetres[1].emit('ready-to-show');
    return fenetres;
}

for (const isPackaged of [true, false]) {
    test(`DevTools : ${isPackaged ? 'fermés dans le paquet distribué' : 'ouverts en développement'}, corpus et éditeur`, () => {
        const fenetres = demarrer(isPackaged);
        assert.equal(fenetres.length, 2);
        assert.match(fenetres[0].fichier, /index\.html$/);
        assert.equal(fenetres[1].fichier, 'edition_entretien.html');
        for (const fenetre of fenetres) {
            assert.equal(fenetre.devToolsOuverts, !isPackaged, fenetre.fichier);
        }
    });
}

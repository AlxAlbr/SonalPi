////////////////////////////////////////////////////////////////////////
// PARAMÈTRES DE PSEUDONYMISATION (niveau CORPUS)
//
// Éditeur des réglages partagés par tout le corpus, persistés dans le .crp via
// window.paramsAnonCorpus (résolu par getMotsLiaison() / setParamsAnon).
// Aujourd'hui : la liste des MOTS DE LIAISON utilisée par la détection d'affixes
// (« à Lyon » → proposer « Lyon »). Point d'extension pour de futurs réglages.
// Voir modules/Anonymisation/plan-affixes-liaison.md (phase 2).
////////////////////////////////////////////////////////////////////////

// Brouillon en cours d'édition (copie de travail). On ne touche window.paramsAnonCorpus
// qu'à l'Enregistrer ; Annuler/✕ jettent ce brouillon sans rien persister.
let _motsLiaisonBrouillon = [];

/** Liste effective courante des mots de liaison (corpus si défini, sinon défauts). */
function _motsLiaisonEffectifs() {
    if (typeof getMotsLiaison === 'function') return getMotsLiaison().slice();
    if (typeof MOTS_LIAISON_DEFAUT !== 'undefined') return MOTS_LIAISON_DEFAUT.slice();
    return [];
}

/**
 * Ouvre la modale « Paramètres de pseudonymisation ». Amorce le brouillon avec la liste
 * effective courante (donc les défauts si le corpus n'a jamais été réglé).
 */
function ouvrirParamsAnonCorpus() {
    if (document.getElementById('params-anon-overlay')) return; // déjà ouverte
    _motsLiaisonBrouillon = _motsLiaisonEffectifs();

    const overlay = document.createElement('div');
    overlay.id = 'params-anon-overlay';
    overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);' +
        'display:flex;justify-content:center;align-items:center;z-index:10000;';

    overlay.innerHTML = `
        <div style="background:white;border-radius:8px;padding:28px;max-width:640px;width:90%;
                    max-height:85vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.2);
                    font-family:Arial,sans-serif;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <h2 style="margin:0;color:#333;">⚙ Paramètres de pseudonymisation</h2>
                <button onclick="fermerParamsAnonCorpus()" title="Fermer sans enregistrer"
                        style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
            </div>

            <h3 style="color:#2196F3;margin:18px 0 6px;">Mots de liaison</h3>
            <p style="color:#555;line-height:1.5;margin:0 0 12px;">
                Quand vous pseudonymisez une expression qui <strong>commence par un de ces mots</strong>
                suivi d'un nom propre (« <em>à&nbsp;Lyon</em> »), SonalPi vous propose aussi la règle
                générale dégraissée (« <em>Lyon</em> »), pour capter l'entité partout. Réglage
                <strong>partagé par tout le corpus</strong>.
            </p>

            <div id="params-liaison-chips"
                 style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid #ccc;
                        border-radius:6px;padding:8px;min-height:44px;"></div>

            <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
                <input id="params-liaison-input" type="text" autocomplete="off" placeholder="ajouter un mot…"
                       style="flex:1;padding:7px 9px;border:1px solid #ccc;border-radius:6px;font-size:0.95rem;">
                <button id="params-liaison-add" style="padding:7px 14px;background:#2196F3;color:white;
                        border:none;border-radius:6px;cursor:pointer;">Ajouter</button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;">
                <button onclick="reinitMotsLiaison()" title="Revenir à la liste fournie par défaut"
                        style="padding:8px 14px;background:#f0f0f0;color:#333;border:1px solid #ccc;
                               border-radius:6px;cursor:pointer;">↺ Réinitialiser</button>
                <div>
                    <button onclick="fermerParamsAnonCorpus()"
                            style="padding:8px 16px;background:#f0f0f0;color:#333;border:1px solid #ccc;
                                   border-radius:6px;cursor:pointer;margin-right:8px;">Annuler</button>
                    <button onclick="enregistrerParamsAnonCorpus()"
                            style="padding:8px 16px;background:#4CAF50;color:white;border:none;
                                   border-radius:6px;cursor:pointer;font-weight:bold;">Enregistrer</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Fermer en cliquant hors de la boîte
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) fermerParamsAnonCorpus(); });

    const input = document.getElementById('params-liaison-input');
    document.getElementById('params-liaison-add').addEventListener('click', () => _ajouterMotDepuisInput());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _ajouterMotDepuisInput(); }
    });
    input.focus();

    _renderChipsLiaison();
}

/** Ferme la modale sans rien persister (le brouillon est abandonné). */
function fermerParamsAnonCorpus() {
    const overlay = document.getElementById('params-anon-overlay');
    if (overlay) overlay.remove();
    _motsLiaisonBrouillon = [];
}

/** (Re)dessine les chips depuis le brouillon courant. */
function _renderChipsLiaison() {
    const box = document.getElementById('params-liaison-chips');
    if (!box) return;
    box.innerHTML = '';

    if (_motsLiaisonBrouillon.length === 0) {
        const vide = document.createElement('span');
        vide.style.cssText = 'color:#999;font-style:italic;';
        vide.textContent = 'Aucun mot — la détection d\'affixes est désactivée.';
        box.appendChild(vide);
        return;
    }

    _motsLiaisonBrouillon.forEach((mot) => {
        const chip = document.createElement('span');
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:5px;padding:3px 6px 3px 10px;border-radius:14px;' +
            'font-size:0.9rem;background:#e3f2fd;border:1px solid #90caf9;color:#0d47a1;';

        const label = document.createElement('span');
        label.textContent = mot;
        chip.appendChild(label);

        const x = document.createElement('button');
        x.textContent = '✕';
        x.title = 'Retirer';
        x.style.cssText =
            'background:none;border:none;cursor:pointer;color:inherit;font-size:0.8rem;line-height:1;padding:0;';
        x.addEventListener('click', () => {
            _motsLiaisonBrouillon = _motsLiaisonBrouillon.filter((m) => m !== mot);
            _renderChipsLiaison();
        });
        chip.appendChild(x);

        box.appendChild(chip);
    });
}

/** Lit le champ de saisie, normalise, ajoute le mot s'il est valide et nouveau. */
function _ajouterMotDepuisInput() {
    const input = document.getElementById('params-liaison-input');
    if (!input) return;
    const brut = (input.value || '').trim().toLowerCase();
    input.value = '';
    input.focus();
    if (!brut) return;
    if (/\s/.test(brut)) { // un mot = un token
        if (typeof afficherNotification === 'function')
            afficherNotification('Un seul mot à la fois (pas d\'espace).', 'error');
        return;
    }
    if (_motsLiaisonBrouillon.includes(brut)) return; // déjà présent
    _motsLiaisonBrouillon.push(brut);
    _renderChipsLiaison();
}

/** Remet le brouillon aux valeurs fournies par défaut (MOTS_LIAISON_DEFAUT). */
function reinitMotsLiaison() {
    _motsLiaisonBrouillon = (typeof MOTS_LIAISON_DEFAUT !== 'undefined') ? MOTS_LIAISON_DEFAUT.slice() : [];
    _renderChipsLiaison();
}

/**
 * Persiste le brouillon : met à jour window.paramsAnonCorpus, le pousse dans le process main
 * (setParamsAnon) puis déclenche une sauvegarde du corpus (écriture dans le .crp).
 */
async function enregistrerParamsAnonCorpus() {
    const motsLiaison = _motsLiaisonBrouillon.slice();
    const params = Object.assign({}, window.paramsAnonCorpus || {}, { motsLiaison });
    window.paramsAnonCorpus = params; // lu (synchrone) par getMotsLiaison()

    try {
        await window.electronAPI.setParamsAnon(params);
        await window.sauvegarderCorpus(false);
        if (typeof afficherNotification === 'function')
            afficherNotification('Paramètres de pseudonymisation enregistrés', 'success');
    } catch (e) {
        console.error('[enregistrerParamsAnonCorpus] erreur:', e);
        if (typeof afficherNotification === 'function')
            afficherNotification('Erreur à l\'enregistrement des paramètres', 'error');
    }

    fermerParamsAnonCorpus();
}

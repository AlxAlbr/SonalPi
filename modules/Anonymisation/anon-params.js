////////////////////////////////////////////////////////////////////////
// PARAMÈTRES DE PSEUDONYMISATION (niveau CORPUS)
//
// Éditeur des réglages partagés par tout le corpus, persistés dans le .crp via
// window.paramsAnonCorpus (résolu par getMotsLiaison() / setParamsAnon).
// Aujourd'hui : la liste des MOTS DE LIAISON utilisée par la détection d'affixes
// (« à Lyon » → proposer « Lyon ») et son interrupteur (motsLiaisonActif, ACTIVÉ par
// défaut — lu par getMotsLiaisonActif, tableau_base.js). Point d'extension pour de
// futurs réglages. Voir modules/Anonymisation/plan-affixes-liaison.md (phase 2).
////////////////////////////////////////////////////////////////////////

// Brouillon en cours d'édition (copie de travail). On ne touche window.paramsAnonCorpus
// qu'à l'Enregistrer ; Annuler/✕ jettent ce brouillon sans rien persister.
let _motsLiaisonBrouillon = [];

// Brouillon de l'interrupteur des mots de liaison (ACTIVÉ par défaut — comportement historique).
// Désactivé → la détection d'affixes ne propose plus de règle cœur ; la liste reste conservée.
let _motsLiaisonActifBrouillon = true;

// Brouillon des THÉMATIQUES d'entités (fonctionnalité opt-in, cf. plan-thematiques-entites.md).
// Même principe que _motsLiaisonBrouillon : copie de travail amorcée à l'ouverture, persistée
// seulement à l'Enregistrer. { actif:boolean, liste:string[] } (liste en MAJUSCULES).
let _thematiquesBrouillon = { actif: false, liste: [] };

// Brouillon de la PRIORITÉ DE VALIDATION ('corpus' défaut | 'entretien') : quelle portée applique
// la touche Entrée nue au niveau entretien (Maj inverse). Voir getPrioriteValidation (tableau_base.js).
let _prioriteBrouillon = 'corpus';

/**
 * Liste courante des mots de liaison POUR L'ÉDITEUR (corpus si défini, sinon défauts).
 * Lecture BRUTE de window.paramsAnonCorpus, pas via getMotsLiaison() : celle-ci renvoie []
 * quand l'interrupteur est désactivé, or la modale doit continuer d'afficher la liste.
 */
function _motsLiaisonEffectifs() {
    const p = window.paramsAnonCorpus;
    if (p && Array.isArray(p.motsLiaison) && p.motsLiaison.length) return p.motsLiaison.slice();
    if (typeof MOTS_LIAISON_DEFAUT !== 'undefined') return MOTS_LIAISON_DEFAUT.slice();
    return [];
}

/** Réglage effectif courant des thématiques (corpus si défini, sinon défauts). Copie profonde. */
function _thematiquesEffectives() {
    if (typeof getThematiques === 'function') {
        const t = getThematiques();
        return { actif: !!t.actif, liste: (t.liste || []).slice() };
    }
    return { actif: false, liste: (typeof THEMES_DEFAUT !== 'undefined') ? THEMES_DEFAUT.slice() : [] };
}

/** Priorité de validation effective courante ('corpus' par défaut). */
function _prioriteEffective() {
    return (typeof getPrioriteValidation === 'function') ? getPrioriteValidation() : 'corpus';
}

/**
 * Ouvre la modale « Paramètres de pseudonymisation ». Amorce le brouillon avec la liste
 * effective courante (donc les défauts si le corpus n'a jamais été réglé).
 */
function ouvrirParamsAnonCorpus() {
    if (document.getElementById('params-anon-overlay')) return; // déjà ouverte
    _motsLiaisonBrouillon = _motsLiaisonEffectifs();
    _motsLiaisonActifBrouillon = (typeof getMotsLiaisonActif === 'function') ? getMotsLiaisonActif() : true;
    _thematiquesBrouillon = _thematiquesEffectives();
    _prioriteBrouillon = _prioriteEffective();

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

            
            <h3 style="color:#333;font-weight:600;margin:26px 0 6px;">1) Priorité de validation</h3>
            <p style="color:#555;line-height:1.5;margin:0 0 12px;">
                Au niveau d'un entretien, choisit la portée appliquée par Entrée quand vous
                validez une ligne (Maj&nbsp;+&nbsp;Entrée fait l'inverse).
            </p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
                    <input type="radio" name="params-priorite" value="corpus" style="margin-top:3px;">
                    <span>Priorité corpus (défaut) — Entrée&nbsp;→&nbsp;📁&nbsp;corpus,
                        Maj+Entrée&nbsp;→&nbsp;📄&nbsp;document.</span>
                </label>
                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
                    <input type="radio" name="params-priorite" value="entretien" style="margin-top:3px;">
                    <span>Priorité entretien — Entrée&nbsp;→&nbsp;📄&nbsp;document,
                        Maj+Entrée&nbsp;→&nbsp;📁&nbsp;corpus.</span>
                </label>
            </div>


            <style>
                /* Toggle stylé (interrupteur) de la section Thématiques */
                #params-anon-overlay .switch { position:relative; display:inline-block; width:44px; height:24px; }
                #params-anon-overlay .switch input { opacity:0; width:0; height:0; }
                #params-anon-overlay .switch .slider {
                    position:absolute; cursor:pointer; inset:0; background:#ccc; transition:.2s; border-radius:24px; }
                #params-anon-overlay .switch .slider:before {
                    position:absolute; content:""; height:18px; width:18px; left:3px; bottom:3px;
                    background:white; transition:.2s; border-radius:50%; }
                #params-anon-overlay .switch input:checked + .slider { background:#4CAF50; }
                #params-anon-overlay .switch input:checked + .slider:before { transform:translateX(20px); }
            </style>

            <div style="display:flex;align-items:center;gap:10px;margin:26px 0 6px;">
                <h3 style="color:#333;font-weight:600;margin:0;">2) Thématiques d'entités</h3>
                <label class="switch" title="Activer / désactiver les thématiques">
                    <input id="params-themes-actif" type="checkbox">
                    <span class="slider"></span>
                </label>
            </div>
            <p style="color:#555;line-height:1.5;margin:0 0 12px;">
                Catégorisez chaque entité par une thématique (PER, LOC, ORG, DAT…) via un
                badge dans la colonne Actions, puis retrouvez toutes les entités d'un thème
                en tapant son nom dans la case « Rechercher ». Fonctionnalité optionnelle,
                réglage partagé par tout le corpus.
            </p>

            <div id="params-themes-body">
                <div id="params-themes-chips"
                     style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid #ccc;
                            border-radius:6px;padding:8px;min-height:44px;"></div>

                <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
                    <input id="params-themes-input" type="text" autocomplete="off" placeholder="ajouter une thématique…"
                           style="flex:1;padding:7px 9px;border:1px solid #ccc;border-radius:6px;font-size:0.95rem;">
                    <button id="params-themes-add" style="padding:7px 14px;background:#2196F3;color:white;
                            border:none;border-radius:6px;cursor:pointer;">Ajouter</button>
                    <button onclick="reinitThematiques()" title="Revenir à la liste fournie par défaut"
                            style="padding:7px 12px;background:#f0f0f0;color:#333;border:1px solid #ccc;
                                   border-radius:6px;cursor:pointer;">↺ Réinitialiser</button>
                </div>
            </div>
            
            
            <div style="display:flex;align-items:center;gap:10px;margin:18px 0 6px;">
                <h3 style="color:#333;font-weight:600;margin:0;">3) Mots de liaison</h3>
                <label class="switch" title="Activer / désactiver la proposition de règle générale">
                    <input id="params-liaison-actif" type="checkbox">
                    <span class="slider"></span>
                </label>
            </div>
            <p style="color:#555;line-height:1.5;margin:0 0 12px;">
                Quand vous pseudonymisez une expression qui commence par un de ces mots
                suivi d'un nom propre (« <em>à&nbsp;Lyon</em> »), SonalPi vous propose aussi la règle
                générale sans mot de liaison (« <em>Lyon</em> »), pour capter l'entité partout. Réglage
                partagé par tout le corpus.
            </p>

            <div id="params-liaison-body">
                <div id="params-liaison-chips"
                     style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid #ccc;
                            border-radius:6px;padding:8px;min-height:44px;"></div>

                <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
                    <input id="params-liaison-input" type="text" autocomplete="off" placeholder="ajouter un mot…"
                           style="flex:1;padding:7px 9px;border:1px solid #ccc;border-radius:6px;font-size:0.95rem;">
                    <button id="params-liaison-add" style="padding:7px 14px;background:#2196F3;color:white;
                            border:none;border-radius:6px;cursor:pointer;">Ajouter</button>
                    <button onclick="reinitMotsLiaison()" title="Revenir à la liste fournie par défaut"
                            style="padding:7px 12px;background:#f0f0f0;color:#333;border:1px solid #ccc;
                                   border-radius:6px;cursor:pointer;">↺ Réinitialiser</button>
                </div>
            </div>


            <div style="display:flex;justify-content:flex-end;align-items:center;margin-top:20px;">
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

    // Câblage de l'interrupteur des mots de liaison
    const liaisonActif = document.getElementById('params-liaison-actif');
    liaisonActif.checked = !!_motsLiaisonActifBrouillon;
    liaisonActif.addEventListener('change', () => {
        _motsLiaisonActifBrouillon = liaisonActif.checked;
        _syncEtatSectionLiaison();
    });
    _syncEtatSectionLiaison();

    // Câblage de la section Thématiques
    const themeInput = document.getElementById('params-themes-input');
    const themeActif = document.getElementById('params-themes-actif');
    themeActif.checked = !!_thematiquesBrouillon.actif;
    document.getElementById('params-themes-add').addEventListener('click', () => _ajouterThemeDepuisInput());
    themeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _ajouterThemeDepuisInput(); }
    });
    themeActif.addEventListener('change', () => {
        _thematiquesBrouillon.actif = themeActif.checked;
        _syncEtatSectionThemes();
    });
    _renderChipsThematiques();
    _syncEtatSectionThemes();

    // Câblage de la priorité de validation (radios)
    document.querySelectorAll('input[name="params-priorite"]').forEach((r) => {
        r.checked = (r.value === _prioriteBrouillon);
        r.addEventListener('change', () => { if (r.checked) _prioriteBrouillon = r.value; });
    });
}

/** Grise/dé-grise l'éditeur des mots de liaison selon l'état de l'interrupteur (activé par défaut). */
function _syncEtatSectionLiaison() {
    const body = document.getElementById('params-liaison-body');
    if (!body) return;
    const off = !_motsLiaisonActifBrouillon;
    body.style.opacity = off ? '0.45' : '1';
    body.style.pointerEvents = off ? 'none' : 'auto';
}

/** Grise/dé-grise l'éditeur de thématiques selon l'état de l'interrupteur (opt-in). */
function _syncEtatSectionThemes() {
    const body = document.getElementById('params-themes-body');
    if (!body) return;
    const off = !_thematiquesBrouillon.actif;
    body.style.opacity = off ? '0.45' : '1';
    body.style.pointerEvents = off ? 'none' : 'auto';
}

/** Ferme la modale sans rien persister (le brouillon est abandonné). */
function fermerParamsAnonCorpus() {
    const overlay = document.getElementById('params-anon-overlay');
    if (overlay) overlay.remove();
    _motsLiaisonBrouillon = [];
    _motsLiaisonActifBrouillon = true;
    _thematiquesBrouillon = { actif: false, liste: [] };
    _prioriteBrouillon = 'corpus';
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

/** (Re)dessine les chips de thématiques depuis le brouillon courant (couleur = palette indexée). */
function _renderChipsThematiques() {
    const box = document.getElementById('params-themes-chips');
    if (!box) return;
    box.innerHTML = '';

    if (_thematiquesBrouillon.liste.length === 0) {
        const vide = document.createElement('span');
        vide.style.cssText = 'color:#999;font-style:italic;';
        vide.textContent = 'Aucune thématique — ajoutez-en pour catégoriser les entités.';
        box.appendChild(vide);
        return;
    }

    _thematiquesBrouillon.liste.forEach((theme, i) => {
        // Couleur = position dans la liste (ordre d'arrivée), gris au-delà de la palette.
        const bg = (typeof PALETTE_THEMES !== 'undefined' && i < PALETTE_THEMES.length)
            ? PALETTE_THEMES[i] : (typeof COULEUR_THEME_INCONNU !== 'undefined' ? COULEUR_THEME_INCONNU : '#9e9e9e');

        const chip = document.createElement('span');
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:5px;padding:3px 6px 3px 10px;border-radius:14px;' +
            `font-size:0.9rem;background:${bg};border:1px solid rgba(0,0,0,0.15);color:#fff;`;

        const label = document.createElement('span');
        label.textContent = theme;
        chip.appendChild(label);

        const x = document.createElement('button');
        x.textContent = '✕';
        x.title = 'Retirer';
        x.style.cssText =
            'background:none;border:none;cursor:pointer;color:inherit;font-size:0.8rem;line-height:1;padding:0;';
        x.addEventListener('click', () => {
            _thematiquesBrouillon.liste = _thematiquesBrouillon.liste.filter((t) => t !== theme);
            _renderChipsThematiques();
        });
        chip.appendChild(x);

        box.appendChild(chip);
    });
}

/** Lit le champ, normalise (trim, un seul token, MAJUSCULES), ajoute la thématique si valide et nouvelle. */
function _ajouterThemeDepuisInput() {
    const input = document.getElementById('params-themes-input');
    if (!input) return;
    const brut = (input.value || '').trim().toUpperCase();
    input.value = '';
    input.focus();
    if (!brut) return;
    if (/\s/.test(brut)) { // un thème = un token (cohérent avec la recherche « match exact »)
        if (typeof afficherNotification === 'function')
            afficherNotification('Une seule thématique à la fois (pas d\'espace).', 'error');
        return;
    }
    if (_thematiquesBrouillon.liste.some((t) => t.toUpperCase() === brut)) return; // déjà présent
    _thematiquesBrouillon.liste.push(brut);
    _renderChipsThematiques();
}

/** Remet la liste de thématiques aux valeurs fournies par défaut (THEMES_DEFAUT). */
function reinitThematiques() {
    _thematiquesBrouillon.liste = (typeof THEMES_DEFAUT !== 'undefined') ? THEMES_DEFAUT.slice() : [];
    _renderChipsThematiques();
}

/**
 * Persiste le brouillon : met à jour window.paramsAnonCorpus, le pousse dans le process main
 * (setParamsAnon) puis déclenche une sauvegarde du corpus (écriture dans le .crp).
 */
async function enregistrerParamsAnonCorpus() {
    const motsLiaison = _motsLiaisonBrouillon.slice();
    const motsLiaisonActif = !!_motsLiaisonActifBrouillon;
    const thematiques = { actif: !!_thematiquesBrouillon.actif, liste: _thematiquesBrouillon.liste.slice() };
    const prioriteValidation = (_prioriteBrouillon === 'entretien') ? 'entretien' : 'corpus';
    const params = Object.assign({}, window.paramsAnonCorpus || {}, { motsLiaison, motsLiaisonActif, thematiques, prioriteValidation });
    window.paramsAnonCorpus = params; // lu (synchrone) par getMotsLiaison() / getThematiques() / getPrioriteValidation()

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

    // Le panneau Pseudos corpus est déjà affiché (le bouton ⚙ y vit) : refléter à chaud
    // l'activation/désactivation des thématiques (badges + placeholder), sans re-render lourd.
    if (typeof rafraichirBadgesThematiquesCorpus === 'function') rafraichirBadgesThematiquesCorpus();

    fermerParamsAnonCorpus();
}

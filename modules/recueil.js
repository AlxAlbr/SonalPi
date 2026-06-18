// ACCES AUX FICHIERS RECUEIL (.rcl)
async function recueilsDsDossierProjet() {
    const result = await window.electronAPI.listerRecueils();
    if (!result.success) {
        console.error('❌ Impossible de lister les recueils:', result.error);
        return [];
    }
    return result.files;
}

function creerRecueil(nomRecueil = "", fileRecueil = null) {

    const recueil = {
        
        "nom": nomRecueil,
        "file": fileRecueil,
        "items": []
    };
    return recueil;
}

    function creerItemExtrait(rang, rgdep, rgfin, texte, commentaire = "") {
        return { rang, type: "extrait", rgdep, rgfin, texte, commentaire };
    }

    function creerItemTitre(rang, niveau, libelle) {
        return { rang, type: "titre", niveau, libelle };
    }

    function creerItemTexte(rang, texte) {
        return { rang, type: "texte", texte };
    }


async function sauverRecueil(recueil) {
    if (!recueil || !recueil.file) {
        console.error('❌ sauverRecueil : attribut "file" manquant dans le recueil');
        return { success: false, error: 'Attribut "file" manquant' };
    }

    const contenu = JSON.stringify(recueil, null, '\t');
    const chemin = recueil.file;

    try {
        const corpus = (typeof Corpus !== 'undefined' && Corpus.type)
            ? Corpus
            : await window.electronAPI.getCorpus();
        if (corpus.type === 'local') {
            return await window.electronAPI.sauvegarderFichier(chemin, contenu);
        } else {
            return await window.electronAPI.sauvegarderSurServeur(chemin, contenu);
        }
    } catch (err) {
        console.error('❌ sauverRecueil exception:', err);
        return { success: false, error: err.message || String(err) };
    }
}

function ouvrirRecueil(recueil, conteneur) {
    if (!recueil || !conteneur) return;

    conteneur.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'rcl-header';
    header.textContent = recueil.nom || '';
    conteneur.appendChild(header);

    (recueil.items || []).forEach(item => {
        let el;

        switch (item.type) {

            case 'titre':
                el = document.createElement('div');
                el.className = `rcl-titre rcl-titre-niv${item.niveau || 1}`;
                el.textContent = item.libelle || '';
                break;

            case 'extrait':
                el = document.createElement('div');
                el.className = 'rcl-extrait';
                el.innerHTML =
                    `<blockquote class="rcl-extrait-texte">${escapeHtml(item.texte || '')}</blockquote>` +
                    (item.commentaire
                        ? `<p class="rcl-commentaire">${escapeHtml(item.commentaire)}</p>`
                        : '');
                break;

            case 'texte':
                el = document.createElement('div');
                el.className = 'rcl-texte';
                el.textContent = item.texte || '';
                break;

            default:
                return;
        }

        el.dataset.rang = item.rang;
        conteneur.appendChild(el);
    });
}

// -----------------------------------------------------------
// AFFICHAGE ET ÉDITION DES ITEMS D'UN RECUEIL DANS LE PANNEAU
// -----------------------------------------------------------

function afficherItemsRecueil(recueil, conteneur) {
    conteneur.innerHTML = '';

    const titreRow = document.createElement('div');
    titreRow.className = 'rcl-titre-recueil-row';

    const btnRetour = document.createElement('button');
    btnRetour.className = 'btn-rcl-retour-liste';
    btnRetour.type = 'button';
    btnRetour.title = 'Retour à la liste des recueils';
    btnRetour.textContent = '←';
    btnRetour.addEventListener('click', () => afficherListeRecueilsDansPanneau(conteneur));
    titreRow.appendChild(btnRetour);

    const titreEdit = document.createElement('div');
    titreEdit.id = 'titre-panneau-recueil';
    titreEdit.className = 'rcl-titre-recueil-edit';
    titreEdit.contentEditable = 'true';
    titreEdit.spellcheck = false;
    titreEdit.title = 'Cliquer pour renommer';
    titreEdit.textContent = recueil.nom || '';
    titreEdit.addEventListener('input', () => { recueil.nom = titreEdit.textContent.trim(); });
    titreEdit.addEventListener('blur',  () => { if (_recueilCourant) sauverRecueil(_recueilCourant); });
    titreEdit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            titreEdit.blur();
        }
    });
    titreRow.appendChild(titreEdit);
    conteneur.appendChild(titreRow);

    const liste = document.createElement('div');
    liste.id = 'liste-items-recueil';
    liste.className = 'liste-items-recueil';
    conteneur.appendChild(liste);
    renderItemsRecueil(recueil, liste, conteneur);

    // Drop zone : accepte les extraits glissés depuis la synthèse
    let _dropIndicator = null;

    function _getInsertIdx(e) {
        const items = [...liste.querySelectorAll('.rcl-item-edit')];
        for (let i = 0; i < items.length; i++) {
            const rect = items[i].getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) return i;
        }
        return items.length;
    }

    function _showDropIndicator(insertIdx) {
        if (!_dropIndicator) {
            _dropIndicator = document.createElement('div');
            _dropIndicator.className = 'rcl-drop-indicator';
        }
        const items = [...liste.querySelectorAll('.rcl-item-edit')];
        if (insertIdx >= items.length) {
            liste.appendChild(_dropIndicator);
        } else {
            liste.insertBefore(_dropIndicator, items[insertIdx]);
        }
    }

    function _removeDropIndicator() {
        if (_dropIndicator && _dropIndicator.parentNode) {
            _dropIndicator.parentNode.removeChild(_dropIndicator);
        }
    }

    liste.addEventListener('dragover', e => {
        if ([...e.dataTransfer.types].includes('application/sonal-extrait')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            liste.classList.add('rcl-drop-zone-active');
            _showDropIndicator(_getInsertIdx(e));
        }
    });
    liste.addEventListener('dragleave', e => {
        if (!liste.contains(e.relatedTarget)) {
            liste.classList.remove('rcl-drop-zone-active');
            _removeDropIndicator();
        }
    });
    liste.addEventListener('drop', e => {
        liste.classList.remove('rcl-drop-zone-active');
        const insertIdx = _getInsertIdx(e);
        _removeDropIndicator();
        const extIdxStr = e.dataTransfer.getData('application/sonal-extrait');
        if (!extIdxStr) return;
        e.preventDefault();
        const extIdx = parseInt(extIdxStr);
        if (isNaN(extIdx) || !tabExt || !tabExt[extIdx] || !_recueilCourant) return;
        const ext = tabExt[extIdx];
        const item = creerItemExtrait(
            insertIdx,
            ext.debut,
            ext.fin,
            ext.texteTraite || '',
            ''
        );
        _recueilCourant.items.splice(insertIdx, 0, item);
        reindexerItems(_recueilCourant);
        sauverRecueil(_recueilCourant);
        renderItemsRecueil(_recueilCourant, liste, conteneur);
    });

    // Barre d'ajout d'items
    const barre = document.createElement('div');
    barre.className = 'barre-ajout-recueil';
    barre.innerHTML = '<span style="font-size:0.8rem;color:#888;display:block;margin-bottom:6px;">Ajouter :</span>';

    const mkBtn = (label, fn) => {
        const b = document.createElement('button');
        b.className = 'btn-ajout-rcl';
        b.textContent = label;
        b.addEventListener('click', fn);
        barre.appendChild(b);
    };
    mkBtn('Titre', () => {
        recueil.items.push(creerItemTitre(recueil.items.length, 1, 'Nouveau titre'));
        reindexerItems(recueil); sauverRecueil(recueil); renderItemsRecueil(recueil, liste, conteneur);
        requestAnimationFrame(() => {
            const inputs = liste.querySelectorAll('.rcl-item-titre .rcl-edit-libelle');
            const last = inputs[inputs.length - 1];
            if (last) { last.focus(); last.select(); }
        });
    });
    mkBtn('Texte', () => {
        recueil.items.push(creerItemTexte(recueil.items.length, ''));
        reindexerItems(recueil); sauverRecueil(recueil); renderItemsRecueil(recueil, liste, conteneur);
    });
    conteneur.appendChild(barre);

    // Bouton Enregistrer
    const btnSave = document.createElement('button');
    btnSave.id = 'btn-sauver-recueil';
    btnSave.className = 'btn btn-primary';
    btnSave.style.cssText = 'margin-top:10px; width:100%;';
    btnSave.textContent = '💾 Enregistrer';
    btnSave.addEventListener('click', async () => {
        if (!_recueilCourant) return;
        const res = await sauverRecueil(_recueilCourant);
        if (res && res.success) {
            btnSave.textContent = '✔ Enregistré';
            setTimeout(() => { btnSave.textContent = '💾 Enregistrer'; }, 1500);
        } else {
            btnSave.textContent = '❌ Erreur';
            setTimeout(() => { btnSave.textContent = '💾 Enregistrer'; }, 2000);
        }
    });
    conteneur.appendChild(btnSave);

}

function reindexerItems(recueil) {
    recueil.items.forEach((item, i) => { item.rang = i; });
}

/**
 * Renvoie le nombre d'items qui forment le groupe d'un titre :
 * le titre lui-même + tous les items suivants jusqu'au prochain titre
 * de niveau égal ou supérieur (inférieur numériquement).
 * Pour tout item non-titre, la taille du groupe est 1.
 */
function getGroupSize(items, from) {
    const item = items[from];
    if (!item || item.type !== 'titre') return 1;
    const niv = item.niveau || 1;
    let end = from + 1;
    while (end < items.length) {
        const next = items[end];
        if (next.type === 'titre' && (next.niveau || 1) <= niv) break;
        end++;
    }
    return end - from;
}

const _rclCollapsed = new WeakSet();
let _rclDragFrom = -1;
let _rclDragGroupSize = 0;

function applyCollapsed(liste, recueil) {
    const divs = [...liste.querySelectorAll('.rcl-item-edit')];
    divs.forEach(d => d.style.display = '');
    for (let i = 0; i < divs.length; i++) {
        const div = divs[i];
        if (!div.classList.contains('rcl-item-titre')) continue;
        const idx = parseInt(div.dataset.idx);
        const item = recueil.items[idx];
        if (!item || !_rclCollapsed.has(item)) continue;
        const niv = item.niveau || 1;
        for (let j = i + 1; j < divs.length; j++) {
            const next = divs[j];
            if (next.classList.contains('rcl-item-titre')) {
                const nextIdx = parseInt(next.dataset.idx);
                const nextItem = recueil.items[nextIdx];
                if (nextItem && (nextItem.niveau || 1) <= niv) break;
            }
            next.style.display = 'none';
        }
    }
}

async function renderItemsRecueil(recueil, liste, conteneur) {
    liste.innerHTML = '';
    let currentNiveau = 0;
    recueil.items.forEach((item, idx) => {
        if (item.type === 'titre') currentNiveau = item.niveau || 1;
        const div = document.createElement('div');
        div.className = 'rcl-item-edit rcl-item-' + item.type +
            (item.type === 'titre' ? ' rcl-item-titre-niv' + (item.niveau || 1) : '');
        div.draggable = true;
        div.dataset.idx = idx;
        if (item.type === 'extrait') div.dataset.niveau = currentNiveau;

        const ctrl = document.createElement('div');
        ctrl.className = 'rcl-item-ctrl';

        const btnHaut = document.createElement('button');
        btnHaut.className = 'btn-rcl-mv';
        btnHaut.title = 'Monter';
        btnHaut.textContent = '▲';
        btnHaut.addEventListener('click', () => {
            if (idx === 0) return;
            [recueil.items[idx - 1], recueil.items[idx]] = [recueil.items[idx], recueil.items[idx - 1]];
            reindexerItems(recueil); sauverRecueil(recueil); renderItemsRecueil(recueil, liste, conteneur);
        });

        const btnBas = document.createElement('button');
        btnBas.className = 'btn-rcl-mv';
        btnBas.title = 'Descendre';
        btnBas.textContent = '▼';
        btnBas.addEventListener('click', () => {
            if (idx >= recueil.items.length - 1) return;
            [recueil.items[idx], recueil.items[idx + 1]] = [recueil.items[idx + 1], recueil.items[idx]];
            reindexerItems(recueil); sauverRecueil(recueil); renderItemsRecueil(recueil, liste, conteneur);
        });

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-rcl-del';
        btnDel.title = 'Supprimer cet item';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', async () => {

            // question de confirmation si c'est un titre avec des items en dessous
            
            if (item.type === 'titre') {
                const sousItems = recueil.items.slice(idx + 1).filter(i => i.niveau > (item.niveau || 1));
                if (sousItems.length > 0) {
                    let rep;
                    
                        rep = await question(
                            `Supprimer cette partie? \n Attention, cette action est irr\u00e9versible.`,
                            ['Supprimer', 'Annuler']
                        );
                    
                    
                    if (rep !== 'supprimer') return;

                }
            }
                
            recueil.items.splice(idx, 1);
            reindexerItems(recueil); sauverRecueil(recueil); renderItemsRecueil(recueil, liste, conteneur);
        });

        ctrl.appendChild(btnHaut);
        ctrl.appendChild(btnBas);

        if (item.type === 'extrait' || item.type === 'titre') {
            const btnAjoutTitre = document.createElement('button');
            btnAjoutTitre.className = 'btn-rcl-mv btn-rcl-add-title';
            btnAjoutTitre.title = 'Ajouter un titre après cet item';
            btnAjoutTitre.textContent = '+';
            btnAjoutTitre.addEventListener('click', () => {
                const niveauTitre = item.type === 'titre'
                    ? Math.max(1, item.niveau || 1)
                    : Math.max(1, currentNiveau || 1);
                recueil.items.splice(idx + 1, 0, creerItemTitre(idx + 1, niveauTitre, 'Nouveau titre de partie'));
                reindexerItems(recueil);
                sauverRecueil(recueil);
                renderItemsRecueil(recueil, liste, conteneur);
                requestAnimationFrame(() => {
                    const nouveauTitre = liste.querySelector(`.rcl-item-edit[data-idx="${idx + 1}"] .rcl-edit-libelle`);
                    if (nouveauTitre) {
                        nouveauTitre.focus();
                        nouveauTitre.select();
                    }
                });
            });
            ctrl.appendChild(btnAjoutTitre);
        }

        div.appendChild(ctrl);
        div.appendChild(btnDel);

        if (item.type === 'titre') {
            // Bouton accordéon (via classe + CSS ::after, comme les thématiques)
            const btnToggle = document.createElement('button');
            btnToggle.className = 'btn-rcl-toggle';
            if (_rclCollapsed.has(item)) div.classList.add('rcl-titre-collapsed');
            btnToggle.addEventListener('click', () => {
                if (_rclCollapsed.has(item)) {
                    _rclCollapsed.delete(item);
                    div.classList.remove('rcl-titre-collapsed');
                } else {
                    _rclCollapsed.add(item);
                    div.classList.add('rcl-titre-collapsed');
                }
                applyCollapsed(liste, recueil);
            });
            div.appendChild(btnToggle);
            const numSpan = document.createElement('span');
            numSpan.className = 'rcl-num';
            div.appendChild(numSpan);
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'rcl-edit-libelle';
            inp.value = item.libelle || '';
            inp.placeholder = 'Libellé du titre…';
            inp.addEventListener('input',  () => { item.libelle = inp.value; });
            inp.addEventListener('change', () => sauverRecueil(recueil));
            div.appendChild(inp);
            // Contrôles de niveau (◀ H1 ▶) à droite, visibles au survol
            const nivCtrl = document.createElement('div');
            nivCtrl.className = 'rcl-niv-ctrl';
            const btnNivG = document.createElement('button');
            btnNivG.className = 'btn-rcl-niv';
            btnNivG.textContent = '◀';
            btnNivG.title = 'Réduire le niveau';
            const lblNiv = document.createElement('span');
            lblNiv.className = 'rcl-niv-label';
            lblNiv.textContent = (item.niveau || 1);
            const btnNivD = document.createElement('button');
            btnNivD.className = 'btn-rcl-niv';
            btnNivD.textContent = '▶';
            btnNivD.title = 'Augmenter le niveau';
            const updateNiv = () => {
                lblNiv.textContent = (item.niveau || 1);
                div.className = 'rcl-item-edit rcl-item-titre rcl-item-titre-niv' + (item.niveau || 1);
                sauverRecueil(recueil);
            };
            btnNivG.addEventListener('click', () => {
                item.niveau = Math.max(1, (item.niveau || 1) - 1);
                updateNiv();
            });
            btnNivD.addEventListener('click', () => {
                item.niveau = Math.min(4, (item.niveau || 1) + 1);
                updateNiv();
            });
            nivCtrl.appendChild(btnNivG);
            nivCtrl.appendChild(lblNiv);
            nivCtrl.appendChild(btnNivD);
            div.appendChild(nivCtrl);

        } else if (item.type === 'extrait') {
            const bloc = document.createElement('div');
            bloc.className = 'rcl-extrait-edit-bloc';
            const cit = document.createElement('blockquote');
            cit.className = 'rcl-extrait-texte';
            cit.contentEditable = 'true';
            cit.textContent = item.texte || '';
            cit.addEventListener('input', () => { item.texte = cit.textContent; });
            cit.addEventListener('blur',  () => sauverRecueil(recueil));
            // Nom du locuteur (début du texte : "NomLoc: ")
            const matchLoc = (item.texte || '').match(/^([^:\n]{1,50}):\s*/);
            if (matchLoc) {
                const locDiv = document.createElement('div');
                locDiv.className = 'rcl-locuteur';
                locDiv.textContent = matchLoc[1].trim();
                bloc.appendChild(cit);
                bloc.appendChild(locDiv);
            } else {
                bloc.appendChild(cit);
            }
            const com = document.createElement('textarea');
            com.className = 'rcl-edit-commentaire';
            com.placeholder = 'Commentaire…';
            com.value = item.commentaire || '';
            com.addEventListener('input',  () => { item.commentaire = com.value; });
            com.addEventListener('change', () => sauverRecueil(recueil));
            bloc.appendChild(com);
            div.appendChild(bloc);

        } else if (item.type === 'texte') {
            const ta = document.createElement('textarea');
            ta.className = 'rcl-edit-texte';
            ta.placeholder = 'Texte libre…';
            ta.value = item.texte || '';
            ta.addEventListener('input',  () => { item.texte = ta.value; });
            ta.addEventListener('change', () => sauverRecueil(recueil));
            div.appendChild(ta);
        }

        div.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', String(idx));
            _rclDragFrom = idx;
            _rclDragGroupSize = getGroupSize(recueil.items, idx);
            div.classList.add('rcl-dragging');
            // Marquer visuellement tous les items du groupe
            if (_rclDragGroupSize > 1) {
                const allDivs = [...liste.querySelectorAll('.rcl-item-edit')];
                for (let gi = 1; gi < _rclDragGroupSize; gi++) {
                    const gDiv = allDivs.find(d => parseInt(d.dataset.idx) === idx + gi);
                    if (gDiv) gDiv.classList.add('rcl-dragging');
                }
            }
        });
        div.addEventListener('dragend', () => {
            _rclDragFrom = -1;
            _rclDragGroupSize = 0;
            [...liste.querySelectorAll('.rcl-dragging')].forEach(d => d.classList.remove('rcl-dragging'));
        });
        div.addEventListener('dragover',  e => {
            e.preventDefault();
            if ([...e.dataTransfer.types].includes('application/sonal-extrait')) return;
            // Ne pas indiquer le survol sur les items faisant partie du groupe déplacé
            if (_rclDragFrom >= 0 && idx >= _rclDragFrom && idx < _rclDragFrom + _rclDragGroupSize) return;
            div.classList.add('rcl-dragover');
        });
        div.addEventListener('dragleave', () => div.classList.remove('rcl-dragover'));
        div.addEventListener('drop', e => {
            e.preventDefault();
            div.classList.remove('rcl-dragover');
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            if (isNaN(from)) return;
            const groupSize = getGroupSize(recueil.items, from);
            // Ignorer si on dépose sur un item appartenant au groupe lui-même
            if (idx >= from && idx < from + groupSize) return;
            if (idx === from) return;
            // Extraire le groupe, puis insérer à la bonne position
            const group = recueil.items.splice(from, groupSize);
            const to = idx > from ? idx - groupSize : idx;
            recueil.items.splice(to, 0, ...group);
            reindexerItems(recueil); sauverRecueil(recueil); renderItemsRecueil(recueil, liste, conteneur);
        });

        liste.appendChild(div);
    });
    applyCollapsed(liste, recueil);
    majNumerotationRecueil(liste);
}

function majNumerotationRecueil(liste) {
    const compteurs = [0, 0, 0, 0]; // indices 0..3 pour niveaux 1..4
    liste.querySelectorAll('.rcl-item-edit.rcl-item-titre').forEach(div => {
        let niv = 1;
        for (let n = 4; n >= 1; n--) {
            if (div.classList.contains('rcl-item-titre-niv' + n)) { niv = n; break; }
        }
        // Remettre à zéro les niveaux inférieurs
        for (let i = niv; i < 4; i++) compteurs[i] = 0;
        compteurs[niv - 1]++;
        const numSpan = div.querySelector('.rcl-num');
        if (numSpan) numSpan.textContent = compteurs.slice(0, niv).join('.') + '. ';
    });
}

// ---------------------------------------------------------------
// PANNEAU RECUEIL
// ---------------------------------------------------------------
let _recueilCourant = null;

async function afficherPanneauRecueil() {
    if (document.getElementById('panneau-recueil')) {
        fermerPanneauRecueil();
        return;
    }
    const divSynthese = document.getElementById('divSynthese');
    const fondSynth   = document.getElementById('fondSynthese');
    if (!divSynthese || !fondSynth) return;

    const panneau = document.createElement('div');
    panneau.id = 'panneau-recueil';
    panneau.className = 'panneau-recueil';

    const hdr = document.createElement('div');
    hdr.className = 'panneau-recueil-header';
    hdr.innerHTML =
        '<span>Recueils</span>' +
        '<button id="btn-export-recueil-header" class="btn btn-secondary" title="Exporter" style="margin-left:auto; margin-right:8px;">📥 Exporter</button>' +
        '<button class="btn-fermer-panneau-recueil" title="Fermer" onclick="fermerPanneauRecueil()">\u2716</button>';
    panneau.appendChild(hdr);

    const btnExportHeader = hdr.querySelector('#btn-export-recueil-header');
    if (btnExportHeader) {
        btnExportHeader.disabled = true;
        btnExportHeader.addEventListener('click', () => {
            if (!_recueilCourant) return;
            exportRecueil(_recueilCourant);
        });
    }

    // Poignée de redimensionnement (bord gauche du panneau)
    const handle = document.createElement('div');
    handle.id = 'recueil-resize-handle';
    handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX     = e.clientX;
        const startWidth = panneau.offsetWidth;
        const onMove = ev => {
            const delta    = startX - ev.clientX;
            const newWidth = Math.max(200, Math.min(900, startWidth + delta));
            panneau.style.width         = newWidth + 'px';
            fondSynth.style.marginRight = (newWidth + 2) + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
    panneau.appendChild(handle);

    const corpsPanneau = document.createElement('div');
    corpsPanneau.id = 'corps-panneau-recueil';
    corpsPanneau.className = 'corps-panneau-recueil';
    panneau.appendChild(corpsPanneau);

    divSynthese.appendChild(panneau);
    fondSynth.style.marginRight = '365px';

    await afficherListeRecueilsDansPanneau(corpsPanneau);
}

function fermerPanneauRecueil() {
    const panneau   = document.getElementById('panneau-recueil');
    const fondSynth = document.getElementById('fondSynthese');
    if (panneau)   panneau.remove();
    if (fondSynth) fondSynth.style.marginRight = '';
    _recueilCourant = null;
}

// ---------------------------------------------------------------
// MODALE RECUEILS (accessible depuis le bouton dans le header)
// ---------------------------------------------------------------
async function ouvrirModaleRecueils() {
    // Bascule : si déjà ouverte, fermer
    const existing = document.getElementById('divModaleRecueils');
    if (existing) { existing.remove(); _recueilCourant = null; return; }

    const divModale = document.createElement('div');
    divModale.id = 'divModaleRecueils';
    divModale.classList.add('fondtabdat');

    // En-tête (même style que Synthèse / Base de données)
    const divEntete = document.createElement('div');
    divEntete.style.cssText = 'height:50px; border-bottom:1px solid #ccc;';
    divEntete.classList.add('header-tabdat');
    divEntete.innerHTML = `
        <h3 style="margin-left:10px;">📌 Recueils
            <label class="btn btn-secondary" style="padding:10px;float:right;margin-top:-5px;margin-right:8px;cursor:pointer;"
                onclick="document.getElementById('divModaleRecueils').remove(); _recueilCourant=null;">
                Quitter ✖️
            </label>
            <button id="btn-export-recueil-header" class="btn btn-secondary" title="Exporter le recueil affiché"
                style="padding:10px;float:right;margin-top:-5px;margin-right:4px;" disabled>
                📥 Exporter
            </button>
        </h3>`;
    divModale.appendChild(divEntete);

    // Activation du bouton export
    const btnExport = divEntete.querySelector('#btn-export-recueil-header');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (!_recueilCourant) return;
            exportRecueil(_recueilCourant);
        });
    }

    // Corps défilant
    const corps = document.createElement('div');
    corps.id = 'corps-modale-recueils';
    corps.style.overflow = 'auto';
    corps.style.maxHeight = 'calc(100vh - 80px)';
    corps.style.padding = '10px 16%';
    divModale.appendChild(corps);

    document.body.appendChild(divModale);
    await afficherListeRecueilsDansPanneau(corps);
}

async function afficherListeRecueilsDansPanneau(conteneur) {
    _recueilCourant = null;
    const btnExportHeader = document.getElementById('btn-export-recueil-header');
    if (btnExportHeader) btnExportHeader.disabled = true;
    conteneur.innerHTML = '';

    let fichiers = await recueilsDsDossierProjet();
    const corpus = await window.electronAPI.getCorpus();

    const itemsListe = fichiers && fichiers.length > 0
        ? await Promise.all(fichiers.map(async f => {
            try {
                let contenu;
                if (corpus.type === 'local') {
                    contenu = await window.electronAPI.readFileContent(f.path);
                } else {
                    const res = await window.electronAPI.lireFichierServeur(f.path);
                    contenu = res.content;
                }
                const json = JSON.parse(contenu);
                return { f, nom: json.nom || f.name.replace(/\.rcl$/i, '') };
            } catch (e) {
                return { f, nom: f.name.replace(/\.rcl$/i, '') };
            }
        }))
        : [];

    const liste = document.createElement('ul');
    liste.className = 'liste-recueils';
    itemsListe.forEach(({ f, nom }) => {
        const li = document.createElement('li');
        li.className = 'item-liste-recueil';

        const lblNom = document.createElement('span');
        lblNom.textContent = nom;
        lblNom.style.flex = '1';
        lblNom.style.cursor = 'pointer';
        lblNom.addEventListener('click', () => chargerEtAfficherRecueil(f, conteneur));

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-rcl-del-liste';
        btnDel.title = 'Supprimer ce recueil';
        btnDel.textContent = '\u2715';
        btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            supprimerRecueil(f.path, nom, conteneur);
        });

        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.title = f.path;
        li.appendChild(lblNom);
        li.appendChild(btnDel);
        liste.appendChild(li);
    });
    conteneur.appendChild(liste);

    const btnNew = document.createElement('button');
    btnNew.className = 'btn btn-secondary';
    btnNew.style.cssText = 'margin-top:12px; width:100%;';
    btnNew.textContent = '+ Nouveau recueil';
    btnNew.addEventListener('click', () => creerNouveauRecueilDansPanneau(conteneur));
    conteneur.appendChild(btnNew);
}

function _modalNomRecueil() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

        const boite = document.createElement('div');
        boite.style.cssText = 'background:var(--couleur-block,#fff);border-radius:8px;padding:24px 28px;min-width:300px;box-shadow:0 6px 32px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:12px;';

        const titre = document.createElement('p');
        titre.textContent = 'Nom du nouveau recueil';
        titre.style.cssText = 'margin:0;font-weight:600;font-size:1rem;';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = 'nouveau';
        input.style.cssText = 'padding:7px 10px;border:1px solid #ccc;border-radius:5px;font-size:1rem;width:100%;box-sizing:border-box;';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

        const btnAnnuler = document.createElement('button');
        btnAnnuler.className = 'btn btn-secondary';
        btnAnnuler.textContent = 'Annuler';

        const btnOk = document.createElement('button');
        btnOk.className = 'btn btn-primary';
        btnOk.textContent = 'Cr\u00e9er';

        const fermer = (valeur) => { overlay.remove(); resolve(valeur); };
        btnAnnuler.addEventListener('click', () => fermer(null));
        btnOk.addEventListener('click', () => fermer(input.value.trim() || null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  fermer(input.value.trim() || null);
            if (e.key === 'Escape') fermer(null);
        });
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) fermer(null); });

        btns.appendChild(btnAnnuler);
        btns.appendChild(btnOk);
        boite.appendChild(titre);
        boite.appendChild(input);
        boite.appendChild(btns);
        overlay.appendChild(boite);
        document.body.appendChild(overlay);
        input.select();
    });
}

async function creerNouveauRecueilDansPanneau(conteneur) {
    const nom = await _modalNomRecueil();
    if (!nom) return;
    const corpus  = await window.electronAPI.getCorpus();
    const nomFich = nom.trim().replace(/[<>:"/\\|?*]/g, '_') + '.rcl';
    const chemin  = corpus.type === 'local'
        ? await window.electronAPI.createPath(corpus.folder, nomFich)
        : corpus.folder + '/' + nomFich;
    const rcl = creerRecueil(nom.trim(), chemin);
    rcl.items.push(creerItemTitre(0, 1, nom.trim()));
    await sauverRecueil(rcl);
    await chargerEtAfficherRecueil({ name: nomFich, path: chemin }, conteneur);
}

async function chargerEtAfficherRecueil(fichier, conteneur) {
    conteneur.innerHTML = '<p style="padding:10px;color:gray;">Chargement\u2026</p>';
    try {
        let contenu;
        const corpus = await window.electronAPI.getCorpus();
        if (corpus.type === 'local') {
            contenu = await window.electronAPI.readFileContent(fichier.path);
        } else {
            const res = await window.electronAPI.lireFichierServeur(fichier.path);
            contenu = res.content;
        }
        const json = JSON.parse(contenu);
        json.file = fichier.path;
        _recueilCourant = json;
        const btnExportHeader = document.getElementById('btn-export-recueil-header');
        if (btnExportHeader) btnExportHeader.disabled = false;
        afficherItemsRecueil(json, conteneur);
    } catch (e) {
        conteneur.innerHTML = '<p style="color:red;padding:10px;">Erreur : ' + escapeHtml(e.message) + '</p>';
    }
}

async function supprimerRecueil(filePath, nom, conteneur) {
    const rep = await question(
        `Supprimer le recueil \u00ab ${nom} \u00bb ?\nCette action est irr\u00e9versible.`,
        ['Supprimer', 'Annuler']
    );
    if (rep !== 'supprimer') return;
    const res = await window.electronAPI.supprimerRecueil(filePath);
    if (res && res.success) {
        if (_recueilCourant && _recueilCourant.file === filePath) _recueilCourant = null;
        await afficherListeRecueilsDansPanneau(conteneur);
    } else {
        const msg = (res && res.error) || 'Erreur inconnue';
        console.error('Erreur suppression recueil :', msg);
        notifErreur(`Impossible de supprimer le recueil \u00ab ${nom} \u00bb : ${msg}`);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------
// MENU CONTEXTUEL "AJOUTER À UN RECUEIL"
// ---------------------------------------------------------------

async function ouvrirMenuAjoutRecueil(deb, fin, texte, anchorEl) {
    fermerMenuAjoutRecueil();

    // Capturer la position de l'ancre avant de fermer le menu courant
    let menuTop = 100;
    let menuRight = '27px';
    if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        menuTop = Math.max(10, Math.min(rect.top - 40, window.innerHeight - 400));
    }

    // Fermer le menu de sélection s'il est ouvert
    if (typeof fermerMenuSel === 'function') fermerMenuSel();

    const menu = document.createElement('div');
    menu.id = 'menu-ajout-recueil';
    menu.className = 'menu-ajout-recueil';
    menu.style.top   = menuTop + 'px';
    menu.style.right = menuRight;
    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('mousedown', _fermerMenuAjoutRecueilSiHors);
    }, 0);

    await _marListeRecueils(menu, deb, fin, texte);
}

function fermerMenuAjoutRecueil() {
    const m = document.getElementById('menu-ajout-recueil');
    if (m) m.remove();
    document.removeEventListener('mousedown', _fermerMenuAjoutRecueilSiHors);
}

function _fermerMenuAjoutRecueilSiHors(e) {
    const m = document.getElementById('menu-ajout-recueil');
    if (m && !m.contains(e.target)) fermerMenuAjoutRecueil();
}

async function _marListeRecueils(menu, deb, fin, texte) {
    menu.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.className = 'mar-header';
    hdr.innerHTML = '<span style="flex:1">Choisir un recueil</span>' +
        '<span class="mar-close" onmousedown="fermerMenuAjoutRecueil()">✕</span>';
    menu.appendChild(hdr);

    const loading = document.createElement('div');
    loading.className = 'mar-msg';
    loading.textContent = 'Chargement…';
    menu.appendChild(loading);

    const fichiers = await recueilsDsDossierProjet();
    const corpus = await window.electronAPI.getCorpus();

    const items = fichiers && fichiers.length > 0
        ? await Promise.all(fichiers.map(async f => {
            try {
                let contenu;
                if (corpus.type === 'local') {
                    contenu = await window.electronAPI.readFileContent(f.path);
                } else {
                    const res = await window.electronAPI.lireFichierServeur(f.path);
                    contenu = res.content;
                }
                const json = JSON.parse(contenu);
                json.file = f.path;
                return { nom: json.nom || f.name.replace(/\.rcl$/i, ''), json };
            } catch {
                return { nom: f.name.replace(/\.rcl$/i, ''), json: null };
            }
        }))
        : [];

    loading.remove();

    if (items.length === 0) {
        const vide = document.createElement('div');
        vide.className = 'mar-msg';
        vide.textContent = 'Aucun recueil disponible.';
        menu.appendChild(vide);
        return;
    }

    const liste = document.createElement('div');
    liste.className = 'mar-liste';
    items.forEach(({ nom, json }) => {
        const el = document.createElement('div');
        el.className = 'mar-item';
        el.textContent = nom;
        el.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            if (!json) return;
            _marSections(menu, json, deb, fin, texte);
        });
        liste.appendChild(el);
    });
    menu.appendChild(liste);
}

function _marSections(menu, recueil, deb, fin, texte) {
    menu.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.className = 'mar-header';

    const btnRetour = document.createElement('button');
    btnRetour.className = 'mar-btn-retour';
    btnRetour.textContent = '←';
    btnRetour.title = 'Retour à la liste des recueils';
    btnRetour.addEventListener('mousedown', async e => {
        e.preventDefault();
        e.stopPropagation();
        await _marListeRecueils(menu, deb, fin, texte);
    });

    const nomSpan = document.createElement('span');
    nomSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nomSpan.textContent = recueil.nom || '';

    const btnClose = document.createElement('span');
    btnClose.className = 'mar-close';
    btnClose.textContent = '✕';
    btnClose.addEventListener('mousedown', () => fermerMenuAjoutRecueil());

    hdr.appendChild(btnRetour);
    hdr.appendChild(nomSpan);
    hdr.appendChild(btnClose);
    menu.appendChild(hdr);

    const liste = document.createElement('div');
    liste.className = 'mar-liste';

    // Option "En tête du recueil"
    const debut = document.createElement('div');
    debut.className = 'mar-item mar-item-sp';
    debut.textContent = '↑ En tête du recueil';
    debut.addEventListener('mousedown', async e => {
        e.preventDefault();
        await _marInserer(recueil, 0, deb, fin, texte);
    });
    liste.appendChild(debut);

    // Titres du recueil (avec indentation selon le niveau)
    (recueil.items || []).forEach((item, idx) => {
        if (item.type !== 'titre') return;
        const el = document.createElement('div');
        el.className = 'mar-item mar-niv' + (item.niveau || 1);
        el.textContent = item.libelle || '(sans titre)';
        el.title = 'Insérer au début de cette section';
        el.addEventListener('mousedown', async e => {
            e.preventDefault();
            await _marInserer(recueil, idx + 1, deb, fin, texte);
        });
        liste.appendChild(el);
    });

    // Option "Fin du recueil"
    const finEl = document.createElement('div');
    finEl.className = 'mar-item mar-item-sp';
    finEl.textContent = '↓ Fin du recueil';
    finEl.addEventListener('mousedown', async e => {
        e.preventDefault();
        await _marInserer(recueil, (recueil.items || []).length, deb, fin, texte);
    });
    liste.appendChild(finEl);

    menu.appendChild(liste);
}

async function _marInserer(recueil, idx, deb, fin, texte) {
    const item = creerItemExtrait(idx, deb, fin, texte, '');
    recueil.items.splice(idx, 0, item);
    reindexerItems(recueil);
    try {
        const res = await sauverRecueil(recueil);
        fermerMenuAjoutRecueil();
        if (res && res.success) {
            const msg = '✔ Ajouté à « ' + (recueil.nom || 'recueil') + ' »';
            if (typeof afficherNotification === 'function') {
                afficherNotification(msg, 'success');
            } else {
                const notif = document.createElement('div');
                notif.className = 'notification notification-success';
                notif.textContent = msg;
                document.body.appendChild(notif);
                setTimeout(() => notif.classList.add('show'), 10);
                setTimeout(() => { notif.classList.remove('show'); setTimeout(() => notif.remove(), 300); }, 3000);
            }
        } else {
            console.error('❌ _marInserer : sauverRecueil a échoué', res);
            if (typeof notifErreur === 'function') notifErreur('Impossible d\'ajouter au recueil : ' + ((res && res.error) || 'erreur inconnue'));
        }
    } catch (err) {
        console.error('❌ _marInserer exception:', err);
        fermerMenuAjoutRecueil();
        if (typeof notifErreur === 'function') notifErreur('Impossible d\'ajouter au recueil : ' + (err.message || err));
    }
}



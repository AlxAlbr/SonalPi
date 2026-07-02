////////////////////////////////////////////////////////////////////////
// GESTION DU SYSTEME D'AIDE POUR L'ANONYMISATION
////////////////////////////////////////////////////////////////////////

/**
 * Ouvre la fenêtre modale d'aide pour l'anonymisation (niveau ENTRETIEN)
 */
function ouvrirAideAnonymisation() {
    const aideHtml = `
        <div id="aide-anonymisation-overlay" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center;
            align-items: center; z-index: 10000;
        ">
            <div style="
                background: white; border-radius: 8px; padding: 30px;
                max-width: 720px; max-height: 85vh; overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); font-family: Arial, sans-serif;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h2 style="margin: 0; color: #333;">📖 Pseudonymiser un entretien</h2>
                    <button onclick="fermerAideAnonymisation()" style="
                        background: none; border: none; font-size: 24px; cursor: pointer; color: #999;
                    ">✕</button>
                </div>

                <div style="color: #555; line-height: 1.55;">
                    <p style="margin-top:0;"><strong>Principe :</strong> on repère une entité (nom, lieu…),
                    on lui donne un <em>pseudonyme</em>, et on choisit sa <strong>portée</strong> selon
                    qu'elle est locale à cet entretien ou partagée avec tout le corpus.</p>

                    <h3 style="color:#2196F3;margin-top:18px;">1️⃣ Repérer une entité</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Sélectionnez le texte : <strong>double-clic</strong> sur un mot, ou clic au
                        début puis à la fin pour un groupe de mots.</li>
                        <li>Elle se surligne et s'ajoute sur la dernière ligne vide du tableau
                        (colonne <strong>Nom</strong>).</li>
                    </ul>

                    <h3 style="color:#2196F3;">2️⃣ Donner un pseudo et choisir la portée</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Saisissez le pseudo dans la colonne <strong>Pseudo</strong>.</li>
                        <li>Par défaut (« priorité corpus ») : <strong>Entrée</strong> → portée
                        <strong>corpus</strong> (partagé : la règle vaut pour tous les entretiens),
                        <strong>Maj (⇧) + Entrée</strong> → portée <strong>document</strong> (local à cet entretien).</li>
                        <li>Ce mapping est <strong>inversable</strong> dans <strong>⚙ Paramètres → Priorité de
                        validation</strong> : en « priorité entretien », <strong>Entrée</strong> vise le
                        <strong>document</strong> et <strong>Maj + Entrée</strong> le <strong>corpus</strong>.</li>
                        <li>Toutes les occurrences de l'entité sont traitées d'un coup.</li>
                    </ul>

                    <h3 style="color:#2196F3;">3️⃣ Les trois portées : 🚧 brouillon · 📄 document · 📁 corpus</h3>
                    <div style="background:#f5f5f5;padding:12px 15px;border-radius:4px;margin:8px 0;">
                        Un <strong>slider</strong> sous chaque ligne déplace la règle d'une portée à
                        l'autre ; la <strong>typo</strong> la rappelle : <em>italique</em> = brouillon ·
                        normal = document · <strong>gras</strong> = corpus.
                        <ul style="margin:8px 0 0;padding-left:20px;">
                            <li>🚧 <strong>Brouillon</strong> : règle <em>repérée mais pas appliquée</em>
                            (aucun marquage dans le texte). Pour parquer une entité incertaine, ou à
                            traiter ailleurs.</li>
                            <li>📄 <strong>Document</strong> : appliquée, mais confinée à cet entretien.</li>
                            <li>📁 <strong>Corpus</strong> : appliquée et partagée. Un <strong>🔒</strong>
                            apparaît si elle est déjà utilisée dans un autre entretien (elle ne peut plus
                            être rétrogradée).</li>
                        </ul>
                    </div>

                    <h3 style="color:#2196F3;">4️⃣ Repérer sans marquer : brouillon + loupe 🔍</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Laissez une règle en brouillon, puis cliquez sa <strong>loupe 🔍</strong> :
                        les occurrences se surlignent et une navigation <strong>◄ i / N ►</strong> les
                        parcourt — sans rien modifier dans le texte.</li>
                    </ul>

                    <h3 style="color:#2196F3;">5️⃣ Lire les compteurs d'une ligne</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li><strong>À anonymiser</strong> (🟧) : occurrences encore <em>en clair</em>.</li>
                        <li><strong>Anonymisé</strong> (🟩) : occurrences déjà remplacées par le pseudo.</li>
                        <li><strong>Exception</strong> : occurrences laissées volontairement en clair.</li>
                        <li>Fond de la ligne : 🟩 tout traité · 🟧 il reste des « à anonymiser » ·
                        ⬜ brouillon.</li>
                    </ul>

                    <h3 style="color:#2196F3;">6️⃣ Exceptions — garder une occurrence en clair</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Cliquez une occurrence anonymisée → <strong>« Garder en clair »</strong> :
                        utile quand une règle a sur-capté un mot (ex. « Olivier » le prénom vs
                        « un olivier » l'arbre).</li>
                        <li><strong>↩ Remettre en à anonymiser</strong> pour défaire.</li>
                    </ul>

                    <h3 style="color:#2196F3;">7️⃣ Éditer / supprimer · re-scanner 🔄</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>✏️ <strong>Éditer</strong> : retire le marquage et rouvre les champs.
                        🗑️ <strong>Supprimer</strong> : retire la règle et son marquage.</li>
                        <li>🔄 <strong>Re-scanner</strong> : après des corrections, re-vérifie tout
                        l'entretien et signale ce qui reste « à anonymiser » (objectif :
                        <strong>tout vert</strong> avant l'export).</li>
                    </ul>

                    <h3 style="color:#2196F3;">8️⃣ Import / export de la table</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>💾 exporter / 📁 importer la table de correspondance (JSON) pour garder une
                        cohérence entre fichiers.</li>
                        <li>En cas de conflit (entité déjà connue) : <strong>aligner</strong> sur
                        l'existant ou <strong>garder les deux</strong> pseudos.</li>
                    </ul>
                </div>

                <div style="margin-top: 20px; text-align: right;">
                    <button onclick="fermerAideAnonymisation()" style="
                        padding: 8px 16px; background-color: #2196F3; color: white; border: none;
                        border-radius: 4px; cursor: pointer; font-weight: bold;
                    ">Fermer</button>
                </div>
            </div>
        </div>
    `;

    const overlayContainer = document.createElement('div');
    overlayContainer.innerHTML = aideHtml;
    document.body.appendChild(overlayContainer);
}

/**
 * Ferme la fenêtre modale d'aide (entretien)
 */
function fermerAideAnonymisation() {
    const overlay = document.getElementById('aide-anonymisation-overlay');
    if (overlay) {
        overlay.parentElement.remove();
    }
}

////////////////////////////////////////////////////////////////////////
// AIDE NIVEAU CORPUS
////////////////////////////////////////////////////////////////////////

/**
 * Ouvre la fenêtre modale d'aide pour l'anonymisation (niveau CORPUS). Premier jet — synthétique.
 */
function ouvrirAideCorpus() {
    const aideHtml = `
        <div id="aide-corpus-overlay" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center;
            align-items: center; z-index: 10000;
        ">
            <div style="
                background: white; border-radius: 8px; padding: 30px;
                max-width: 720px; max-height: 85vh; overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); font-family: Arial, sans-serif;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h2 style="margin: 0; color: #333;">📚 Pseudonymisation au niveau du corpus</h2>
                    <button onclick="fermerAideCorpus()" style="
                        background: none; border: none; font-size: 24px; cursor: pointer; color: #999;
                    ">✕</button>
                </div>

                <div style="color: #555; line-height: 1.55;">
                    <p style="margin-top:0;"><strong>Ce panneau</strong> regroupe les règles
                    <strong>partagées</strong> (portée corpus) et leur état <strong>consolidé sur tout le
                    corpus</strong>. Les règles locales à un entretien (portée document) n'y figurent pas.</p>

                    <h3 style="color:#2196F3;margin-top:18px;">1️⃣ Statut d'une règle</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>🟩 <strong>vert</strong> : toutes les occurrences sont traitées dans tous les
                        entretiens.</li>
                        <li>🟧 <strong>orange</strong> : il reste des occurrences « à anonymiser » dans
                        au moins un entretien.</li>
                        <li><strong>🔒</strong> : règle réellement utilisée dans plusieurs entretiens —
                        on ne peut pas la supprimer au niveau du corpus. Il faut aller dans chaque entretien pour modifier.
                        Une régle peut être supprimée au niveau du corpus que si elle n'est utilisée que par un seul entretien.</li>
                    </ul>

                    <h3 style="color:#2196F3;">2️⃣ Voir le détail par entretien 🔍</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>La <strong>loupe 🔍</strong> d'une règle ouvre le détail : occurrences
                        <strong>entretien par entretien</strong>, avec leur contexte.</li>
                    </ul>

                    <h3 style="color:#2196F3;">3️⃣ Multi-pseudo (a / b)</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Une entité peut porter <strong>deux pseudos</strong> (max 2). 
                        On ne peut pas alors faire de modification au niveau du corpus :
                        le choix par occurrence se fait <strong>dans l'entretien</strong>.
                        On ne peut pas avoir plus de deux pseudos pour une même entité.</li>
                        </li>
                    </ul>

                    <h3 style="color:#2196F3;">5️⃣ Import / export des règles corpus</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Importer / exporter la table de correspondance partagée (JSON), pour réutiliser
                        ou archiver les règles du corpus.</li>
                    </ul>

                    <h3 style="color:#2196F3;">6️⃣ Exporter le corpus anonymisé</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li> Se réalise via le menu "Corpus"</li>
                    </ul>

                    <h3 style="color:#2196F3;">7️⃣ Paramètres ⚙ — mots de liaison</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Le bouton <strong>⚙ Paramètres</strong> (bandeau de ce panneau) ouvre la liste
                        des <strong>mots de liaison</strong>, <strong>partagée par tout le corpus</strong>
                        et enregistrée dans le <code>.crp</code>.</li>
                        <li>À quoi ça sert : quand vous pseudonymisez une expression qui <strong>commence
                        par un de ces mots</strong> suivi d'un nom propre (ex. « <em>à&nbsp;Lyon</em> »),
                        SonalPi vous <strong>propose</strong> aussi la règle générale <strong>dégraissée</strong>
                        (« <em>Lyon</em> → … »), pour capter l'entité <strong>partout</strong>, pas seulement
                        sur cette tournure. La proposition est <strong>toujours affichée avant création</strong> :
                        vous restez libre de refuser.</li>
                        <li>Seul le <strong>premier</strong> mot de liaison est retiré : « <em>dans une grande
                        ville</em> » conserve « <em>une</em> » dans le pseudo proposé.</li>
                        <li>Vous pouvez <strong>ajouter / retirer</strong> des mots (ex. ajouter « près »,
                        retirer un mot inutile). ⚠️ Les <strong>articles</strong> <code>un</code>,
                        <code>une</code>, <code>des</code> sont à manier avec précaution (ils peuvent
                        tronquer le pseudo proposé) — à n'ajouter qu'en connaissance de cause.</li>
                    </ul>

                    <h3 style="color:#2196F3;">8️⃣ Thématiques d'entités (optionnel)</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Dans <strong>⚙ Paramètres</strong>, activez les <strong>thématiques</strong> (interrupteur)
                        pour catégoriser chaque entité — par défaut <code>PER</code> (personne),
                        <code>LOC</code> (lieu), <code>ORG</code> (organisation), <code>DAT</code> (date).
                        Vous pouvez <strong>ajouter / retirer</strong> des thématiques. Réglage
                        <strong>partagé par tout le corpus</strong>, enregistré dans le <code>.crp</code>.</li>
                        <li>Un <strong>badge</strong> apparaît alors dans la colonne Actions (niveaux entretien
                        <em>et</em> corpus) : cliquez-le pour attribuer une thématique (ou « Aucune »).
                        <strong>Une seule</strong> thématique par entité ; toutes ses occurrences en héritent.</li>
                        <li>La thématique posée au niveau <strong>entretien</strong> <strong>remonte</strong> au
                        corpus en suivant le cycle de portée 🚧 brouillon → 📄 document → 📁 corpus.</li>
                        <li><strong>Retrouver</strong> les entités d'un thème : tapez son nom (ex. « <code>PER</code> »)
                        dans la case <strong>Rechercher</strong> — si le terme correspond exactement à une
                        thématique active, l'affichage se filtre par ce thème ; sinon la recherche texte
                        habituelle (entité / pseudo) s'applique.</li>
                        <li>Si vous <strong>désactivez</strong> les thématiques, les badges et la recherche par
                        thème disparaissent, mais les valeurs déjà posées sont <strong>conservées</strong> et
                        réapparaissent à la réactivation.</li>
                    </ul>
                </div>

                <div style="margin-top: 20px; text-align: right;">
                    <button onclick="fermerAideCorpus()" style="
                        padding: 8px 16px; background-color: #2196F3; color: white; border: none;
                        border-radius: 4px; cursor: pointer; font-weight: bold;
                    ">Fermer</button>
                </div>
            </div>
        </div>
    `;

    const overlayContainer = document.createElement('div');
    overlayContainer.innerHTML = aideHtml;
    document.body.appendChild(overlayContainer);
}

/**
 * Ferme la fenêtre modale d'aide (corpus)
 */
function fermerAideCorpus() {
    const overlay = document.getElementById('aide-corpus-overlay');
    if (overlay) {
        overlay.parentElement.remove();
    }
}

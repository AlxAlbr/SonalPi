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
                    <p style="margin-top:0;">Principe : on repère une entité (nom, lieu…),
                    on lui donne un <em>pseudonyme</em>, et on choisit sa portée selon
                    qu'elle est locale à cet entretien ou partagée avec tout le corpus.
                    Le partage avec le corpus peut être aussi une technique pour garder en mémoire 
                    et retrouver plus facilement une pseudonymisation antérieurement réaliséé</p>

                    <h3 style="color:#333;margin-top:18px;font-weight:600;">1) Repérer une entité</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Sélectionnez le texte : double-clic sur un mot, ou clic au
                        début en laissant appuyer jusqu' à la fin pour un groupe de mots.</li>
                        <li>L'entité (mot ou groupe de mots) se surligne et s'ajoute sur la dernière ligne vide du tableau
                        (colonne Nom).</li>
                        <li>Ponctuation : Le découpage dans SonalPi empèche de sélectionner une entité suivie d'un point.
                        La ponctuation en début et en fin de sélectionest ignorée — la recherche des
                        occurrences porte sur le mot sans elle (« Lyon. » = « Lyon »). La ponctuation
                        <em>interne</em> est conservée.</li>
                        <li>Longs passages : vous pouvez sélectionner une phrase entière comme entité.
                        Au-delà de 12 mots, le tableau l'affiche en version compacte « 6 mots […] 6 mots »
                        (le texte complet reste la donnée, révélé au survol / à l'édition).</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">2) Donner un pseudo et choisir la portée</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Saisissez le pseudo dans la colonne Pseudo.</li>
                        <li>Par défaut (« priorité corpus ») : Entrée → portée
                        corpus (partagé : la règle vaut pour tous les entretiens),
                        Maj (⇧) + Entrée → portée document (local à cet entretien).</li>
                        <li>Ce mapping est inversable dans ⚙ Paramètres → Priorité de
                        validation : en « priorité entretien », Entrée vise le
                        document et Maj + Entrée le corpus.</li>
                        <li>Toutes les occurrences de l'entité sont traitées d'un coup.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">3) Les trois portées : 🚧 brouillon · 📄 document · 📁 corpus</h3>
                    <div style="background:#f5f5f5;padding:12px 15px;border-radius:4px;margin:8px 0;">
                        Un slider sous chaque ligne déplace la règle d'une portée à
                        l'autre ; la typo la rappelle : <em>italique</em> = brouillon ·
                        normal = document · <em>gras</em> = corpus.
                        <ul style="margin:8px 0 0;padding-left:20px;">
                            <li>🚧 Brouillon : règle <em>repérée mais pas appliquée</em>
                            (aucun marquage dans le texte). Pour parquer une entité incertaine, ou à
                            traiter ailleurs.</li>
                            <li>📄 Document : appliquée, mais confinée à cet entretien.</li>
                            <li>📁 Corpus : appliquée et partagée. Un 🔒
                            apparaît si elle est déjà utilisée dans un autre entretien (elle ne peut plus
                            être rétrogradée sauf à aller dans les autres entretiens pour modifier les occurrences concernées).</li>
                        </ul>
                    </div>

                    <h3 style="color:#333;font-weight:600;">4) Repérer sans marquer : brouillon + loupe 🔍</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Laissez une règle en brouillon, puis cliquez sa loupe :
                        les occurrences se surlignent et une navigation ◄ i / N ► les
                        parcourt — sans rien modifier dans le texte.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">5) Lire les compteurs d'une ligne</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li><span style="background:#15c095;color:#fff;border-radius:3px;padding:1px 6px;font-size:0.78rem;font-weight:bold;">N</span>
                        anonymisées : occurrences déjà remplacées par le pseudo.</li>
                        <li><span style="background:#555;color:#fff;border-radius:3px;padding:1px 6px;font-size:0.78rem;font-weight:bold;">N</span>
                        exceptions : occurrences laissées volontairement en clair.</li>
                        <li><span style="background:#ff9800;color:#fff;border-radius:3px;padding:1px 6px;font-size:0.78rem;font-weight:bold;">N</span>
                        à anonymiser : occurrences encore <em>en clair</em>.</li>
                        <li>Fond de la ligne : 🟩 tout traité · 🟧 il reste des « à anonymiser » ·
                        ⬜ brouillon.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">6) Alias, multi-pseudos et occurrences incluses</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li><em>Alias</em> : une même entité peut regrouper plusieurs graphies séparées par
                        « / » dans la colonne Nom (ex. « Marie / Marie Dupont / Dupont »). Toutes reçoivent le
                        même pseudo et sont repérées ensemble.</li>
                        <li><em>Multi-pseudos</em> : une entité peut avoir jusqu'à 2 pseudos, saisis « a/b »
                        dans la colonne Pseudo. Le choix se fait alors par occurrence : clic droit sur une
                        occurrence → « Anonymiser plutôt comme … ».</li>
                        <li><em>Occurrences incluses</em> : quand une règle large (« à Lyon ») recouvre une
                        règle plus courte (« Lyon »), les occurrences communes sont « incluses » — absorbées
                        par la règle large. Elles ne sont <em>pas</em> comptées dans le badge « anonymisé » :
                        un petit « * » sur ce badge signale seulement leur présence (le détail « + N
                        absorbée(s)…, non comptées ici » s'affiche au survol). Elles sont en lecture seule
                        (gérées par la règle qui les possède).</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">7) Exceptions — garder une occurrence en clair</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Cliquez une occurrence anonymisée → « Ajouter une exception » :
                        utile quand une règle a sur-capté un mot (ex. « Olivier » le prénom vs
                        « un olivier » l'arbre).</li>
                        <li>↩ Remettre en à anonymiser pour défaire.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">8) Modifier / supprimer · re-scanner 🔄</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Modifier une règle : cliquez sur son Nom ou son Pseudo, corrigez, puis cliquez
                        ailleurs — la modification est enregistrée et ré-appliquée au texte.</li>
                        <li>✖️ Supprimer (colonne Actions de la ligne) : retire la règle et son marquage
                        dans le texte.</li>
                        <li>🔄 Re-scanner (bandeau du haut) : repasse toutes les règles connues (locales et
                        corpus) sur le texte et signale les occurrences oubliées (« à anonymiser »). Il ne
                        (re)trouve que les entités <em>déjà repérées</em> — il n'y a pas de détection
                        automatique de noms.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">9) Import / export de la table</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>📤 exporter / 📥 importer (bandeau du haut) la table de correspondance (JSON)
                        pour garder une cohérence entre fichiers.</li>
                        <li>En cas de conflit (entité déjà connue) : aligner sur
                        l'existant ou garder les deux pseudos.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">10) Thématiques d'entités (optionnel)</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Vous pouvez catégoriser chaque entité (personne, lieu, organisation…). Quand les
                        thématiques sont actives, un badge apparaît dans la colonne Actions de la ligne :
                        « ＋ thème » si aucune, sinon le nom du thème — cliquez-le pour l'attribuer ou le
                        changer (« Aucune » pour retirer). Une seule thématique par entité.</li>
                        <li>L'activation et la liste des thématiques se règlent au <em>niveau corpus</em>,
                        via le bouton ⚙ Paramètres (il n'y a pas de bouton Paramètres ici). C'est un réglage
                        partagé par tout le corpus. La thématique posée ici remonte au corpus en suivant la
                        portée (🚧 brouillon → 📄 document → 📁 corpus).</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">11) Exporter l'entretien anonymisé</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>↗️ Exporter entretien (bandeau du haut) : choisissez le format, puis cochez
                        « Anonymiser (appliquer la pseudonymisation de manière définitive) ». Le fichier
                        produit a les pseudos appliqués et ne contient pas la
                        table de correspondance — destiné au partage.</li>
                        <li>Pour traiter tout le corpus d'un coup, un export anonymisé existe aussi au
                        <em>niveau corpus</em>, via le menu « Corpus » : il applique les règles à tous les
                        entretiens.</li>
                    </ul>

                    <p style="margin-top:18px;padding-top:12px;border-top:1px solid #eee;color:#666;">
                        💡 En complément, n'hésitez pas à lire la
                        <span onclick="fermerAideAnonymisation();ouvrirAideCorpus();" style="color:#2196F3;text-decoration:underline;cursor:pointer;">documentation au niveau corpus</span>.
                    </p>
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
                    <h2 style="margin: 0; color: #333;">Pseudonymisation au niveau du corpus</h2>
                    <button onclick="fermerAideCorpus()" style="
                        background: none; border: none; font-size: 24px; cursor: pointer; color: #999;
                    ">✕</button>
                </div>

                <div style="color: #555; line-height: 1.55;">
                    <p style="margin-top:0;">Ce panneau regroupe les règles
                    partagées (portée corpus). Les règles locales à un entretien (portée document) n'y figurent pas.</p>

                    <h3 style="color:#333;margin-top:18px;font-weight:600;">1) Statut d'une règle</h3>

                    <h4 style="color:#333;margin:14px 0 4px 18px;font-weight:600;">a) Couleur de la ligne</h4>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>🟩 verte : toutes les occurrences sont traitées dans tous les entretiens.</li>
                        <li>🟧 orange : il reste des occurrences « à anonymiser » dans au moins un
                        entretien.</li>
                        <li>⬜ sans couleur (fond neutre) + tiret « — » dans la colonne État : la règle n'a
                        aucune occurrence dans le corpus (jamais retrouvée dans le texte). Ces règles
                        inutilisées se retrouvent aussi via le filtre « Inutilisées (0 occurrence) ».</li>
                    </ul>

                    <h4 style="color:#333;margin:14px 0 4px 18px;font-weight:600;">b) Compteurs d'occurrences (colonne État corpus, après un scan)</h4>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li><span style="background:#15c095;color:#fff;border-radius:3px;padding:1px 6px;font-size:0.78rem;font-weight:bold;">N</span>
                        anonymisées : occurrences déjà remplacées par le pseudo.</li>
                        <li><span style="background:#555;color:#fff;border-radius:3px;padding:1px 6px;font-size:0.78rem;font-weight:bold;">N</span>
                        exceptions : occurrences laissées volontairement en clair.</li>
                        <li><span style="background:#ff9800;color:#fff;border-radius:3px;padding:1px 6px;font-size:0.78rem;font-weight:bold;">N</span>
                        à anonymiser : occurrences encore en clair.</li>
                    </ul>

                    <h4 style="color:#333;margin:14px 0 4px 18px;font-weight:600;">c) Pastille locuteur 👤</h4>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Signale que l'entité est aussi un <em>locuteur</em> (elle apparaît dans un
                        libellé, pas seulement dans le texte). <span style="color:#e65100;">👤●</span>
                        (orange) = au moins un locuteur reste à pseudonymiser ;
                        <span style="color:#2e7d32;">👤✓</span> (vert) = locuteurs résolus. Elle explique la
                        couleur de la ligne quand l'entité n'a pas d'occurrence dans le texte.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">2) Filtrer et rechercher les entités</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Un menu déroulant filtre la liste par état (il agit sur les lignes déjà
                        affichées : masquage / réordonnancement, sans re-scanner le texte) :
                            <ul style="margin:6px 0;padding-left:20px;">
                                <li><em>À traiter</em> : il reste des occurrences « à anonymiser » (ou un
                                locuteur à pseudonymiser).</li>
                                <li><em>Avec exceptions</em> : au moins une occurrence laissée en clair.</li>
                                <li><em>Entièrement anonymisées</em> : tout est traité.</li>
                                <li><em>Inutilisées (0 occurrence)</em> : règle jamais retrouvée dans le
                                corpus.</li>
                            </ul>
                            Ces filtres d'état exigent une vérification (scan) à jour ; sinon la liste
                            revient à « Toutes les entités ».</li>
                        <li>Deux filtres « sans calcul » apparaissent si le cas se présente :
                        <em>Conflits de pseudo</em> (une même entité visée par plusieurs pseudos différents)
                        et <em>Collisions de pseudo</em> (un même pseudo partagé par plusieurs entités).</li>
                        <li>La case Rechercher filtre par entité ou pseudo (et par thème si les thématiques
                        sont actives).</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">3) Voir le détail par entretien 🔍</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>La loupe ouvre le détail : occurrences par document et à un niveau plus fin,
                        entretien par entretien, avec leur contexte.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">4) Multi-pseudo (a / b)</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Une entité peut porter maximum deux pseudos. 
                        On ne peut pas alors faire de modification au niveau du corpus :
                        le choix par occurrence se fait dans l'entretien.
                        On ne peut pas avoir plus de deux pseudos pour une même entité.</li>
                        </li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">5) Import / export des règles corpus</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Importer / exporter la table de correspondance partagée (JSON), pour réutiliser
                        ou archiver les règles du corpus.</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">6) Exporter le corpus anonymisé</h3>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li> Se réalise via le menu "Corpus"</li>
                    </ul>

                    <h3 style="color:#333;font-weight:600;">7) Paramètres ⚙</h3>
                    <p style="margin:8px 0;">Le bouton ⚙ Paramètres (bandeau de ce panneau) ouvre plusieurs
                    réglages partagés par tout le corpus et enregistrés dans le <code>.crp</code>.</p>

                    <h4 style="color:#333;margin:14px 0 4px 18px;font-weight:600;">a) Priorité de validation</h4>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Définit ce que visent les raccourcis lors de la validation d'un pseudo dans un
                        entretien : en « priorité corpus » (défaut), Entrée crée une règle de portée corpus
                        (partagée) et Maj (⇧) + Entrée une règle de portée document (locale) ; en « priorité
                        entretien », le mapping est inversé.</li>
                    </ul>

                    <h4 style="color:#333;margin:14px 0 4px 18px;font-weight:600;">b) Mots de liaison</h4>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Quand vous pseudonymisez une expression qui commence par un de ces mots suivi
                        d'un nom propre (ex. « <em>à&nbsp;Lyon</em> »), SonalPi vous propose aussi la règle
                        générale dégraissée (« <em>Lyon</em> → … »), pour capter l'entité partout, pas
                        seulement sur cette tournure. La proposition est toujours affichée avant création :
                        vous restez libre de refuser.</li>
                        <li>Seul le premier mot de liaison est retiré : « <em>dans une grande ville</em> »
                        conserve « <em>une</em> » dans le pseudo proposé.</li>
                        <li>Vous pouvez ajouter / retirer des mots (ex. ajouter « près », retirer un mot
                        inutile). ⚠️ Les articles <code>un</code>, <code>une</code>, <code>des</code> sont à
                        manier avec précaution (ils peuvent tronquer le pseudo proposé) — à n'ajouter qu'en
                        connaissance de cause.</li>
                        <li>Un interrupteur (activé par défaut) permet de désactiver complètement ces
                        propositions ; la liste de mots est conservée et resservira à la réactivation.</li>
                    </ul>

                    <h4 style="color:#333;margin:14px 0 4px 18px;font-weight:600;">c) Thématiques d'entités (optionnel)</h4>
                    <ul style="margin:8px 0;padding-left:20px;">
                        <li>Activez les thématiques (interrupteur) pour catégoriser chaque entité — par défaut
                        <code>PER</code> (personne), <code>LOC</code> (lieu), <code>ORG</code> (organisation),
                        <code>DAT</code> (date). Vous pouvez ajouter / retirer des thématiques.</li>
                        <li>Un badge apparaît alors dans la colonne Actions (niveaux entretien <em>et</em>
                        corpus) : cliquez-le pour attribuer une thématique (ou « Aucune »). Une seule
                        thématique par entité ; toutes ses occurrences en héritent.</li>
                        <li>La thématique posée au niveau entretien remonte au corpus en suivant le cycle de
                        portée 🚧 brouillon → 📄 document → 📁 corpus.</li>
                        <li>Retrouver les entités d'un thème : tapez son nom (ex. « <code>PER</code> ») dans
                        la case Rechercher — si le terme correspond exactement à une thématique active,
                        l'affichage se filtre par ce thème ; sinon la recherche texte habituelle
                        (entité / pseudo) s'applique.</li>
                        <li>Si vous désactivez les thématiques, les badges et la recherche par thème
                        disparaissent, mais les valeurs déjà posées sont conservées et réapparaissent à la
                        réactivation.</li>
                    </ul>

                    <p style="margin-top:18px;padding-top:12px;border-top:1px solid #eee;color:#666;">
                        💡 En complément, n'hésitez pas à lire la
                        <span onclick="fermerAideCorpus();ouvrirAideAnonymisation();" style="color:#2196F3;text-decoration:underline;cursor:pointer;">documentation au niveau entretien</span>
                        (accessible aussi via le bouton ? en ouvrant un entretien).
                    </p>
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

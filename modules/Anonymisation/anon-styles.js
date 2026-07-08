////////////////////////////////////////////////////////////////////////
// STYLES DE LA PAGE PSEUDOS (Corpus)
//
// Extrait de tableau_global.js (refacto Tâche 3) sans changement de comportement :
// simple blob CSS-in-JS injecté une fois dans <head>, zéro couplage avec le reste
// du module. Sorti pour alléger tableau_global.js (~220 lignes en moins).
//
// Chargé UNIQUEMENT dans index.html (la page Pseudos n'existe que là). Appelé par
// affichAnonGen().
////////////////////////////////////////////////////////////////////////

function ajouterStylesAnonGen() {
    // Vérifier si les styles sont déjà présents
    if (document.getElementById("styles-anon-gen")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "styles-anon-gen";
    style.textContent = `
        /* Styles spécifiques pour la table d'anonymisation */
        .ligne-anon-gen {
            transition: background-color 0.2s;
        }

        /* Ne pas forcer le min-width: 125px générique des th : la colonne Entité
           se réduit à son contenu, ce qui réduit la largeur naturelle du tableau
           (et donc du panneau gauche) quand les entités sont courtes. Les colonnes
           Pseudo et Actions gardent leur min-width inline. */
        #divAnonGen th.header-col-ent {
            min-width: 0;
        }

        /* En-têtes triables (clic = tri par cette colonne) */
        #divAnonGen th.th-sortable {
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        #divAnonGen th.th-sortable .sort-indicator {
            font-size: 0.8em;
            margin-left: 4px;
        }

        /* Barre de filtrage de la page Pseudos */
        .anon-gen-filtres {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-bottom: 1px solid #eee;
            flex-wrap: wrap;
            flex-shrink: 0;
        }
        .anon-gen-select {
            padding: 5px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #fff;
            font-size: 0.9em;
            cursor: pointer;
        }
        .anon-gen-recherche {
            flex: 1;
            min-width: 140px;
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .anon-gen-recherche:focus {
            outline: none;
            border-color: #1565c0;
            box-shadow: 0 0 4px rgba(21, 101, 192, 0.25);
        }
        .anon-gen-compteur {
            font-size: 0.8em;
            color: #888;
            white-space: nowrap;
        }

        .ligne-anon-gen:hover {
            background-color: #f5f5f5;
        }

        /* Encart-légende repliable du panneau gauche (corpus) */
        .anon-corpus-legende {
            font-size: 11px;
            color: #555;
            background: #f5f5f5;
            border: 1px solid #eee;
            border-radius: 4px;
            margin: 8px 10px;
            overflow: hidden;
            flex-shrink: 0; /* ne pas se faire compresser/rogner par le flex column de divAnonGen */
        }
        .anon-corpus-legende-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 5px 10px;
            cursor: pointer;
            user-select: none;
        }
        .anon-corpus-legende-toggle {
            border: none;
            background: none;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            color: #666;
            width: 22px;
            height: 22px;
            flex-shrink: 0;
        }
        .anon-corpus-legende-toggle:hover {
            color: #1565c0;
        }
        .anon-corpus-legende-contenu {
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 0 10px 8px;
        }

        /*
        .logo-anon::before {
            content: "🔐 ";
            margin-right: 8px;
        }

        .logo-variables::before {
            content: "📊 ";
            margin-right: 8px;
        }
        */

        /* Champ d'édition du pseudonyme (textarea : enroulement multi-lignes) */
        .anon-pseudo-input {
            font-weight: bold;
            color: #1565c0;
            padding: 6px 8px;
            border: 2px solid #90CAF9;
            border-radius: 4px;
            font-size: 0.95em;
            width: 100%;
            box-sizing: border-box;
            font-family: inherit;
            line-height: 1.3;
            resize: none;            /* hauteur gérée automatiquement par autoResizeTextarea */
            overflow: hidden;        /* pas de barre de défilement : le champ grandit */
            white-space: pre-wrap;   /* enroule les pseudos longs */
            overflow-wrap: anywhere; /* coupe aussi les mots très longs sans espace */
            display: block;
        }

        /* Colonne Entité : enrouler les entités longues (mots sans espace inclus) */
        .ligne-anon-gen td:first-child {
            overflow-wrap: anywhere;
            word-break: break-word;
        }

        /* La ligne grandit avec le contenu (textarea / entité enroulée) ET avec le badge de
           thématique posé sous les boutons Actions. On CENTRE verticalement le contenu de chaque
           cellule (entité, pseudo, boutons) via align-content — même mécanisme que le tableau
           entretien, car dans ce Chromium/Electron vertical-align:middle ne recentrait pas le
           contenu bloc (textarea). */
        .ligne-anon-gen td {
            align-content: center;
        }

        .anon-pseudo-input:hover {
            border-color: #64B5F6;
            box-shadow: 0 0 4px rgba(21, 101, 192, 0.2);
        }

        .anon-pseudo-input:focus {
            outline: none;
            border-color: #1565c0;
            box-shadow: 0 0 6px rgba(21, 101, 192, 0.3);
        }

        /* Bouton d'application globale */
        .btn-apply-anon {
            background-color: #FFC107;
            color: #333;
            border: 1px solid #FFB300;
            border-radius: 4px;
            padding: 6px 12px;
            font-weight: 600;
            transition: all 0.2s;
        }

        .btn-apply-anon:hover {
            background-color: #FFB300;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            transform: translateY(-1px);
        }

        .btn-apply-anon:active {
            transform: translateY(0);
        }

        /* Badges - Anonymisés (bleu) */
        span[style*="64B5F6"] {
            transition: all 0.2s !important;
        }

        /* Badges - Non-anonymisés (orange) - cliquables */
        span[style*="FFA500"] {
            transition: all 0.2s !important;
        }

        /* Styles pour les accordéons */
        .accordion-entretien {
            border-bottom: 1px solid #eee;
        }

        .accordion-entretien:hover {
            background-color: #fafafa;
        }



        /* Conteneur modale d'occurrences */
        div[style*="500px"] {
            display: flex;
            flex-direction: column;
        }
    `;
    document.head.appendChild(style);
}

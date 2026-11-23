// Parseur commun à l'ajout au corpus et à l'éditeur d'entretien.
// Inspiré de convertLocutSRT (whispurge) : valider les préfixes avant de les retirer.
(function (root) {
    'use strict';

    function tempsEnSecondes(texte) {
        const m = texte.match(/^(?:(\d+):)?(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/);
        if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) return NaN;
        return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
            + Number((m[4] || '').padEnd(3, '0')) / 1000;
    }

    function texteSousTitre(texte) {
        // Ne retirer que le balisage connu ; les autres chevrons sont du texte littéral.
        return texte
            .replace(/<\/?(?:b|i|u|font|ruby|rt|v(?:\.[^\s>]+)?)(?:\s[^>]*)?>|<\/?c(?:\.[^\s>]*)*>|<\d{2}:\d{2}(?::\d{2})?[.,]\d{3}>/gi, '')
            .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entite, code) => {
                const noms = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
                if (code[0] !== '#') return noms[code.toLowerCase()];
                const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
                return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : entite;
            });
    }

    function extraireLocuteurs(tabSeg) {
        const locut = [''];
        const avertissements = [];
        const nonVides = tabSeg.filter(seg => seg[4].trim());
        const prefixes = nonVides.map(seg => {
            const txt = seg[4].trim();
            const match = txt.match(/^([^:\n]{1,80}?)\s*:\s*(.*)$/);
            // Éviter de prendre une heure ou une URL pour un nom de locuteur.
            if (match && /\p{L}/u.test(match[1]) && !/^\/\//.test(match[2])) {
                return { nom: match[1].trim(), texte: match[2] };
            }
            const speaker = txt.match(/^(Speaker\s+\d+)\s+(.+)$/);
            return speaker ? { nom: speaker[1], texte: speaker[2] } : null;
        });
        const nbReconnus = prefixes.filter(Boolean).length;
        if (!nbReconnus) return { tabSeg, locut, avertissements };
        if (nbReconnus !== nonVides.length) {
            avertissements.push('Certains sous-titres seulement commencent par « Nom : texte ». Les préfixes ont été conservés, sans affectation automatique des locuteurs.');
            return { tabSeg, locut, avertissements };
        }
        const tousSpeakers = prefixes.every(p => /^Speaker\s+\d+$/.test(p.nom));
        const indices = new Map();
        prefixes.forEach((p, i) => {
            // Convention historique Whisper/whispurge : Speaker 0 devient Speaker 1.
            const nom = tousSpeakers ? 'Speaker ' + (Number(p.nom.match(/\d+$/)[0]) + 1) : p.nom;
            if (!indices.has(nom)) {
                indices.set(nom, locut.length);
                locut.push(nom);
            }
            nonVides[i][3] = indices.get(nom);
            nonVides[i][4] = p.texte.trim();
        });
        return { tabSeg, locut, avertissements };
    }

    function parserSousTitres(contenu, format = 'srt') {
        if (typeof contenu !== 'string' || !contenu.trim()) throw new Error('Le fichier de sous-titres est vide.');
        const lignes = contenu.replace(/^\uFEFF/, '').replace(/\r\n?|\n/g, '\n').split('\n');
        const tabSeg = [];
        const voix = new Map();
        let courant = null;
        let blocIgnore = false;
        for (let i = 0; i < lignes.length; i++) {
            const ligne = lignes[i].trim();
            if (!ligne) { courant = null; blocIgnore = false; continue; }
            if (format === 'vtt' && /^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE$|REGION$)/.test(ligne)) {
                blocIgnore = true;
                continue;
            }
            if (blocIgnore) continue;
            if (/^[-+]?\d\S*\s*-->/.test(ligne)) {
                const m = ligne.match(/^(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/);
                const debut = m ? tempsEnSecondes(m[1]) : NaN;
                const fin = m ? tempsEnSecondes(m[2]) : NaN;
                if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin < debut) {
                    throw new Error(`Horodatage invalide à la ligne ${i + 1} : ${ligne}`);
                }
                courant = [null, debut, fin, 0, '', false, 0];
                tabSeg.push(courant);
                continue;
            }
            // Numéro SRT ou identifiant VTT immédiatement avant les coordonnées.
            if (i + 1 < lignes.length && /^[-+]?\d\S*\s*-->/.test(lignes[i + 1].trim())
                && (/^\d+$/.test(ligne) || (format === 'vtt' && !courant))) continue;
            if (!courant) continue; // titre ou métadonnées précédant le premier sous-titre
            const voixMatch = format === 'vtt' && ligne.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>/);
            if (voixMatch) voix.set(courant, texteSousTitre(voixMatch[1]).trim());
            const texte = texteSousTitre(ligne);
            courant[4] += (courant[4] ? ' ' : '') + texte;
        }
        if (!tabSeg.some(seg => seg[4].trim())) throw new Error('Aucun sous-titre contenant du texte n’a été trouvé.');
        let resultat;
        if (voix.size) {
            const locut = [''];
            for (const [seg, nom] of voix) {
                if (!nom) continue;
                if (!locut.includes(nom)) locut.push(nom);
                seg[3] = locut.indexOf(nom);
            }
            resultat = { tabSeg, locut, avertissements: [] };
        } else {
            resultat = extraireLocuteurs(tabSeg);
        }
        // Un espace final sépare les segments dans les vues et exports continus.
        for (const seg of tabSeg) if (seg[4].trim()) seg[4] = seg[4].trim() + ' ';
        return resultat;
    }

    const api = { parserSousTitres, extraireLocuteurs };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ImportSousTitres = api;
})(typeof window !== 'undefined' ? window : null);

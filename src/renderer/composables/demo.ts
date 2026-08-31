import { ref, watch, computed, type Ref } from 'vue'
import { importerFichier } from '../import/sas'
import type { CorpusFichier, EntretienRef, Locuteur, MarqueurDemo, Variable, Note } from '../../shared/format'
import type { ModeDemo, EtatDemo } from '../../shared/format'
export type { ModeDemo, EtatDemo }
import type { Annotation } from '../../shared/entretien/annotation'

/**
 *  Scope DÉMO « Mini Corpus Test » : construit puis ouvre des corpus de test,
 *  à partir des sources bundled `CorpusTest/` (SRT + audio), dans des dossiers
 *  choisis par l'utilisateur.
 *  Le builder réutilise le vrai pipeline d'import,
 *  soit `importerFichier` puis `corpus:importer` + `corpus:assignerAudio` :
 *  la démo est produite par le même code qu'un corpus utilisateur.
 *
 *  Deux modes, chacun son propre corpus (choisi dans la modale) :
 *  - `'autonomie'` : les 4 entretiens importés + audios ;
 *  - `'pas-a-pas'` : corpus amorcé vide, rempli étape par étape,
 *    via `importerSource`, guidé par un spotlight global.
 *  Seules les sources sont partagées (copiées une seule fois).
 *  L'identité d'un corpus de test vit dans `corpus.json` :
 *  `{ demo: { mode, racineSources, validees } }` ; absent = corpus normal,
 *  la démo n'y touche jamais.
 *
 *  Dépendances injectées (patron `useCorpus({ flush })`),
 *  pour éviter le cycle : `appliquerCorpus` est défini dans `creerSonal`.
 */

// Les 4 entretiens du corpus démo et leurs fichiers sources (`CorpusTest/`,
// avec srt/ et audio/) : le dossier est copié TEL QUEL chez l'utilisateur,
// et chaque clé ci-dessous EST le nom de fichier et le TITRE de l'entretien.
// Nommage VOLONTAIREMENT sobre : un numéro + un qualificatif NEUTRE,
// du rôle/parcours, sans prénom ni phrase ;
// (a) les étapes se réfèrent au contenu, pas à une personne ;
// (b) montrer des prénoms dans une démo qui TRAITE de pseudonymisation,
// car cela enseignerait le mauvais réflexe.
const SOURCES = ['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants'] as const

/** Une étape du pas-à-pas : titre dans la liste, prédicat de validation du modèle,
 *  cible `data-tour` (qui peut dépendre de l'état courant), guide dans la bulle. `panneau` :
 *  la consigne s'affiche en panneau sous les onglets de l'entretien, plutôt qu'en bulle flottante.
 *  `panneauAvecTrou` (avec `panneau`) :
 *  le TROU du spotlight reste affiché pour pointer la cible (ex. un champ de modale) — sans bulle,
 *  qui la masquerait — le texte vivant dans le panneau. `numCle` :
 *  numéro affiché dans la liste à la place de l'ordinal — les étapes 2a/2b partagent le « 2 »
 *  pour montrer qu'elles sont liées. `requiere` :
 *  id d'une autre étape dont la validation est nécessaire AVANT de pouvoir lancer celle-ci (bouton désactivé tant qu'elle n'est pas faite).
 *  `retest` : message affiché quand une étape déjà validée est rouverte. */
export interface EtapePasAPas {
  id: string
  titre: string
  cible: () => string | null
  fait: () => boolean
  texte: () => string
  panneau?: boolean
  panneauAvecTrou?: boolean
  numCle?: string
  requiere?: string
  retest?: () => string
  /** Message « déjà réalisée » s'affiche dans la vue CORPUS (l'action de l'étape vit dans le corpus,
   *  ex. « Charger un entretien ») ; pas dans l'entretien comme les étapes d'édition. */
  retestCorpus?: boolean
  /** Message de FIN d'étape : après validation,
   *  un petit texte de félicitation + la proposition d'enchaîner sur l'étape suivante (elle commence souvent par rouvrir le même entretien)
   *  ; par défaut, la validation RENVOIE à l'écran Corpus, où le message s'affiche (sous les cartes). */
  fini?: () => string
  /** `finiEnEntretien` : après validation d'une étape d'ÉDITION,
   *  on RESTE dans l'entretien (on ne renvoie pas au Corpus)
   *  et le message de fin s'affiche SOUS les onglets,
   *  avec un bouton pour revenir à la liste « Pas à pas ».
   *  L'utilisateur peut ainsi continuer s'il le souhaite (ex. ré-écouter l'audio)
   *  plutôt que d'être ramené brutalement à l'écran Corpus. */
  finiEnEntretien?: boolean
}

export interface DepsDemo {
  appliquerCorpus: (c: CorpusFichier, dir?: string) => Promise<void>
  majDossierCourant: () => Promise<void>
  rafraichirRecents: () => Promise<void>
  /** Retour à l'écran Corpus (ferme l'entretien, sauvegardé),
   *  appelé après validation d'une étape :
   *  on revient à la liste « Pas à pas » pour lancer la suivante,
   *  sans l'enchaîner automatiquement. */
  retourCorpus: () => Promise<void>
  vue: Ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>
  // --- pour les prédicats d'étapes (observation du modèle réactif) ---
  membership: Ref<Record<string, EntretienRef>>
  entretien: { annotations: Annotation[] } // reactive (useEntretien)
  locuteurs: Ref<Locuteur[]>
  meta: { valeursGen: Record<string, string> } // reactive (useEntretien)
  ouvertId: Ref<string | null>
  /** Onglet actif de l'entretien (useEntretien) :
   *  les étapes qui vivent DANS un panneau guident d'abord vers l'onglet à ouvrir ;
   *  puis vers l'action (le spotlight suit l'état). */
  ongletDroite: Ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes'>
  variables: Ref<Variable[]> // définitions EAV du corpus (useCorpus)
  /** Notes de l'entretien OUVERT (useEntretien) : l'étape « Prendre des notes à chaud »
   *  se coche dès qu'une note existe. */
  notes: Ref<Note[]>
  /** Audios référencés par entretien (scan `png/` + audioRef,
   *  rafraîchi à l'ouverture du corpus et après un import avec audio — sonal.ts).
   *  L'étape « Charger un entretien » l'utilise : 1Coordinatrice n'est « fait »
   *  que si SON audio est bien référencé. */
  audiosCorpus: Ref<Record<string, { audio: string | null; waveform: string | null }>>
  /** Panneau métadonnées de l'entretien SÉLECTIONNÉ au Corpus (sonal.ts) :
   *  l'étape « Lier la transcription (SRT) » y lit `srt` —
   *  vrai dès que la transcription est importée (« Assigner un srt… »). */
  corpusSelId: Ref<string | null>
  corpusSelMeta: Ref<{ srt: boolean } | null>
}

export function utiliserDemo(deps: DepsDemo) {
  /** Onglet « Pas à pas » monté ? (uniquement en mode 'pas-a-pas'). */
  const pasAPas = ref(false)
  /** Build en cours (désactive les cartes pendant la préparation). */
  const enPreparation = ref(false)
  /** Les dossiers démo mémorisés en session puis persistés (`settings.json`) :
   *  la racine des sources (copiées une seule fois et partagées),
   *  plus le dossier du corpus de test de chaque mode.
   *  Les refs `*Presentes` signalent la présence réelle sur disque :
   *  l'Accueil fait « un clic » quand tout est en place,
   *  sinon la modale adapte ses questions. */
  const racineSources = ref<string | null>(null)
  const sourcesPresentes = ref(false)
  const corpusPasAPas = ref<string | null>(null)
  const corpusAutonomie = ref<string | null>(null)
  const corpusPasAPasPresent = ref(false)
  const corpusAutonomiePresent = ref(false)

  /** Importe un entretien source (SRT + audio) via le vrai pipeline,
   *  depuis la racine des sources matérialisées ;
   *  l'audio y est référencé, jamais copié.
   *  Un seul mécanisme pour l'autonomie (boucle) et le pas-à-pas (one-click) ;
   *  retourne l'id créé. */
  async function importerSource(k: string, racine: string): Promise<string> {
    const { nom, contenu } = await window.sonal.demo.lireSource(racine, `srt/${k}.srt`)
    const r = importerFichier(nom, contenu, (html) =>
      new DOMParser().parseFromString(html, 'text/html'),
    )
    const imp = await window.sonal.corpus.importer(k, r.payload, r.codebook, r.variables)
    const audio = await window.sonal.demo.cheminAudio(racine, `audio/${k}.mp3`)
    await window.sonal.corpus.assignerAudio(imp.id, audio)
    return imp.id
  }

  // --- Le pas-à-pas : étapes, étape courante, validation --- 6 étapes auto-validées (charger →
  // noter → lier le SRT → renommer → coder → saisir une variable).
  // Les cibles `data-tour` peuvent dépendre de l'état (ex. « crayon »
  // tant qu'aucun entretien ouvert, puis « lecture »/« onglet thèmes ») —
  // le spotlight recalcule en live.
  const etapes: EtapePasAPas[] = [
    {
      id: 'charger',
      titre: 'Charger un entretien',
      // Spotlight sur le VRAI bouton « + Ajouter un entretien » ;
      // l'utilisateur passe par la vraie modale à deux zones.
      // La cible suit l'état du DOM de la modale (zone fichier → zone son → Valider)
      // pour guider pas à pas.
      cible: () => {
        if (!document.querySelector('.modale-ajout')) return '[data-tour="ajouter-entretien"]'
        if (!document.querySelector('.zone-texte .zone-fichier')) return '[data-tour="zone-texte"]'
        if (!document.querySelector('.zone-audio .zone-fichier')) return '[data-tour="zone-audio"]'
        return '[data-tour="valider"]'
      },
      // L'étape n'est « faite » que si l'entretien chargé est bien « 1Coordinatrice »
      // **ET** référence son audio (1Coordinatrice.mp3) ;
      // tout le reste du parcours est construit sur SON contenu (le « ? » doublé de la 1ʳᵉ ligne,
      // les locuteurs/enquêteur·rice, le passage « me recevoir ») et l'étape 2 démarre par une ÉCOUTE.
      // Un 1Coordinatrice importé SANS audio (texte seul — permis hors pas-à-pas)
      // ne satisfait pas l'étape ; lui assigner un audio (carte → « Assigner un audio »)
      // la valide alors automatiquement.
      // La modale d'ajout refuse par ailleurs tout autre geste tant que l'étape n'est pas validée (garde `verifierChargementEtape1`).
      fait: () =>
        Object.entries(deps.membership.value).some(
          ([id, r]) => r.titre === '1Coordinatrice' && deps.audiosCorpus.value[id]?.audio != null,
        ),
      texte: () => {
        if (!document.querySelector('.modale-ajout')) {
          return `Vos sources sont dans « ${racineSources.value} ». Cliquez sur le bouton ci-dessus et suivez le guide.`
        }
        if (!document.querySelector('.zone-texte .zone-fichier')) {
          return "Dans cette zone, choisissez le fichier de sous-titres : cliquez, puis sélectionnez srt/1Coordinatrice.srt"
        }
        if (!document.querySelector('.zone-audio .zone-fichier')) {
          return "Bien ! Maintenant le fichier media : cliquez sur cette zone et sélectionnez audio/1Coordinatrice.mp3."
        }
        return "Tout est prêt : cliquze sur « Valider » pour créer l'entretien."
      },
      retest: () => "charger d'autres entretiens",
      // L'action de cette étape vit dans le CORPUS (ajouter un entretien) :
      // le message « déjà réalisée » s'y affiche, pas dans l'éditeur.
      retestCorpus: true,
      // Fin d'étape : félicitations + ouverture immédiate OU enchaînement —
      // l'étape suivante commence elle aussi par ouvrir cet entretien.
      fini: () =>
        "Et voilà : c'est fait, votre premier entretien est chargé dans le corpus. " +
        "Vous pouvez l'ouvrir tout de suite en cliquant sur le crayon de sa carte " +
        "— ou bien enchaîner sur l'étape suivante, qui commencera elle aussi par " +
        "vous faire ouvrir cet entretien.",
    },
    {
      id: 'noter',
      titre: 'Prendre des notes à chaud',
      // Étape 2a : le « retour d'entretien » (avec 2b, qui lie la transcription)
      // — accessible sans l'étape 1.
      numCle: '2a',
      // La situation du RETOUR d'entretien se joue avec un SECOND entretien créé SANS transcription :
      // vous venez d'achever l'entretien, le SRT n'est pas prêt.
      // Le geste passe par la VRAIE modale d'ajout, zone SON seule (aucun fichier de texte) —
      // même mécanique que l'étape 1 avec le SRT.
      // Puis l'entretien s'ouvre et on écrit la note « à chaud » :
      // le trou guide l'onglet Notes puis « + Note », puis détaille la modale de création (titre, corps,
      // Valider) sans bulle qui la masquerait ; le texte vit dans le panneau.
      // La garde `verifierChargementEtape2` n'autorise qu'audio/2RetraiteAnticipee.mp3 tant qu'elle n'est pas validée.
      // Lier le SRT plus tard se raconte (« Assigner un srt… ») :
      // le bouton n'existe que pour un entretien sans transcription.
      cible: () => {
        if (deps.vue.value !== 'entretien') {
          // Au Corpus : la modale d'ajout tant que l'entretien audio seul n'existe pas (2e carte),
          // puis son crayon pour l'ouvrir et noter.
          const id2 = Object.entries(deps.membership.value).find(
            ([, r]) => r.titre === '2RetraiteAnticipee',
          )?.[0]
          if (!document.querySelector('.modale-ajout')) {
            if (id2 && deps.audiosCorpus.value[id2]?.audio != null) {
              // La carte est ciblée par id :
              // position stable même si 2a a été menée avant l'étape 1 (l'entretien n'est alors pas en 2e).
              return '[data-tour="carte-2RetraiteAnticipee"] .crayon'
            }
            return '[data-tour="ajouter-entretien"]'
          }
          if (!document.querySelector('.zone-audio .zone-fichier')) {
            return '[data-tour="zone-audio"]'
          }
          return '[data-tour="valider"]'
        }
        // Dans l'entretien : onglet Notes → « + Note » → champs de la modale de note,
        // chacun guidé à son tour (titre puis corps puis Valider).
        const modale = document.querySelector('.modale-note')
        if (!modale) {
          return deps.ongletDroite.value === 'notes'
            ? '[data-tour="creer-note"]'
            : '[data-tour="onglet-notes"]'
        }
        const titre = (modale.querySelector('.champ-titre-note input') as HTMLInputElement | null)
          ?.value?.trim()
        const corps = modale.querySelector('.zone-corps-note')?.textContent?.trim()
        if (!titre && !corps) return '.modale-note .champ-titre-note input'
        if (!corps) return '.modale-note .zone-corps-note'
        return '.modale-note-pied .principal'
      },
      panneau: true,
      panneauAvecTrou: true,
      fait: () => {
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        return (
          !!id2 && deps.audiosCorpus.value[id2]?.audio != null && deps.notes.value.length > 0
        )
      },
      texte: () => {
        // Au Corpus : le geste est la modale d'ajout (zone son seule).
        if (deps.vue.value !== 'entretien') {
          if (!document.querySelector('.modale-ajout')) {
            return "Vous rentrez d'un entretien dont la transcription (le SRT) n'est pas encore prête — l'audio, lui, est déjà là. Créez l'entretien audio seul : « + Ajouter un entretien », la zone transcription reste vide (elle se liera plus tard, étape 2b)."
          }
          if (!document.querySelector('.zone-audio .zone-fichier')) {
            return "Dans la zone « Fichier son / vidéo » uniquement, choisissez audio/2RetraiteAnticipee.mp3 — aucun fichier de texte : la transcription arrive plus tard."
          }
          return "Parfait : cliquez sur « Valider » — l'entretien se crée au texte vide, son audio est référencé, et on notera vos impressions à chaud dans la foulée."
        }
        // Dans l'entretien : la note à chaud, champ par champ.
        const modale = document.querySelector('.modale-note')
        if (!modale) {
          if (deps.ongletDroite.value !== 'notes') {
            return "L'entretien « 2RetraiteAnticipee » est ouvert, créé avec l'audio seul : c'est votre retour d'entretien, la transcription (le SRT) n'est pas encore prête. Notez à chaud ce que vous avez en tête tant que c'est frais : ouvrez l'onglet Notes (icône note), indiqué ci-dessous. Quand le SRT sera prêt, vous le lierez à cet entretien depuis le panneau métadonnées de sa carte : « Assigner un srt… »."
          }
          return 'Cliquez le bouton « + Note » pour créer la note à chaud.'
        }
        const titre = (modale.querySelector('.champ-titre-note input') as HTMLInputElement | null)
          ?.value?.trim()
        const corps = modale.querySelector('.zone-corps-note')?.textContent?.trim()
        if (!titre && !corps) {
          return 'Donnez un titre à la note — optionnel, mais pratique pour la retrouver (ex. « Impressions du retour d’entretien »).'
        }
        if (!corps) {
          return "Écrivez maintenant vos impressions à chaud dans le corps de la note : une hypothèse, un point à vérifier, l'ambiance du moment…"
        }
        return "La note est complète : cliquez « Valider » pour l'enregistrer sur l'entretien."
      },
      retest: () =>
        "ajouter un autre entretien audio seul et écrire une nouvelle note à chaud " +
        '(le retour d’entretien est déjà consigné)',
      fini: () =>
        "Votre note « à chaud » est enregistrée sur « 2RetraiteAnticipee », créé avec l'audio seul " +
        "— c'est tout l'intérêt du retour d'entretien : rien ne se perd en attendant la " +
        'transcription. Prochaine étape : lier la transcription (SRT) à cet entretien.',
      // On RESTE dans l'entretien après la note (pas de retour brutal au Corpus) :
      // l'utilisateur peut continuer à écrire s'il le veut ;
      // le message de fin s'affiche sous les onglets avec un bouton pour revenir à la liste « Pas à pas ».
      finiEnEntretien: true,
    },
    {
      id: 'lier-srt',
      titre: 'Lier la transcription (SRT)',
      // Étape 2b : la suite de « Prendre des notes à chaud » (2a) —
      // inaccessible tant que 2a n'est pas validée (le bouton de la liste est désactivé).
      numCle: '2b',
      requiere: 'noter',
      // La transcription de « 2RetraiteAnticipee » (chargé audio seul à l'étape précédente)
      // arrive maintenant : on revient au Corpus,
      // on sélectionne la carte pour ouvrir son panneau métadonnées, puis on importe le SRT —
      // « Assigner un srt… » remplace le contenu d'éditeur (ici vide)
      // sans toucher aux notes ni aux données.
      // L'étape se coche quand le panneau de l'entretien sélectionné signale « Srt : lié ».
      cible: () => {
        if (deps.vue.value === 'entretien') return '.retour'
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        if (!id2 || !deps.audiosCorpus.value[id2]?.audio) {
          return '[data-tour="ajouter-entretien"]'
        }
        if (deps.corpusSelId.value !== id2) return '[data-tour="carte-2RetraiteAnticipee"]'
        if (!deps.corpusSelMeta.value) {
          return '[data-tour="carte-2RetraiteAnticipee"]' // lecture de la méta
        }
        return '.panneau.meta-ent .assigner-srt'
      },
      fait: () => {
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        return (
          !!id2 &&
          deps.audiosCorpus.value[id2]?.audio != null &&
          deps.corpusSelId.value === id2 &&
          deps.corpusSelMeta.value?.srt === true
        )
      },
      texte: () => {
        if (deps.vue.value === 'entretien') {
          return "Votre note à chaud est enregistrée. Revenez au Corpus (bouton « ← Corpus ») pour lier la transcription : c'est dans le panneau métadonnées de l'entretien que vit « Assigner un srt… »."
        }
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        if (deps.corpusSelId.value !== id2) {
          return "Sélectionnez la carte « 2RetraiteAnticipee » : son panneau métadonnées s'ouvre à droite."
        }
        return "Cliquez « Assigner un srt… » puis choisissez srt/2RetraiteAnticipee.srt : la transcription et son découpage horodaté entrent dans l'entretien — vos notes et vos données sont préservées."
      },
      retest: () => "lier la transcription d'un autre entretien (celle de 2RetraiteAnticipee est déjà posée)",
      retestCorpus: true,
      // L'action de cette étape vit dans le CORPUS (panneau métadonnées) ;
      // après validation on y est déjà,
      // le message de fin s'affiche sous les cartes avec la proposition d'enchaîner.
      fini: () =>
        "La transcription est liée : le texte de « 2RetraiteAnticipee » et son découpage " +
        "horodaté sont en place, notes et données conservées. Prochaine étape : " +
        'renommer les locuteurs de votre premier entretien (1Coordinatrice).',
    },
    {
      id: 'renommer',
      titre: 'Renommer les locuteurs',
      // Requiert l'étape 1 : les noms « Speaker N » viennent de la transcription d'1Coordinatrice ;
      // sans elle, rien à renommer.
      requiere: 'charger',
      // Depuis la liste, le crayon de la carte guide vers l'entretien ;
      // la consigne y devient un panneau (la bulle recouvrait le champ d'un locuteur).
      // L'étape se coche quand plus aucun locuteur de l'entretien ouvert ne s'appelle « Speaker N ».
      cible: () => (deps.vue.value === 'entretien' ? null : '[data-tour="crayon-entretien"]'),
      panneau: true,
      fait: () =>
        !!deps.ouvertId.value &&
        deps.locuteurs.value.length > 0 &&
        deps.locuteurs.value.every((l) => !l.nom.startsWith('Speaker')),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Clique l'onglet Locuteurs (icône locuteur), puis renomme dans ce panneau : Speaker 0 → « Fatima », Speaker 1 → « Enquêteur·rice » — clique dans le nom, saisis, puis clique ailleurs (ou Entrée)."
          : "Ouvre l'entretien 1Coordinatrice : clique le crayon ✏️ de sa carte.",
      retest: () => "re-renommer les locuteurs (les noms sont déjà corrigés)",
      fini: () =>
        "Les locuteurs ont un vrai nom — Fatima et l'enquêteur·rice sont identifiables, " +
        "et vous avez pseudonymisé le corpus à la fois. Prochaine étape : créer une " +
        "thématique et annoter un passage.",
    },
    {
      id: 'coder',
      titre: 'Créer une thématique et annoter',
      // Idem étape 3 : l'annotation se pose sur le texte d'1Coordinatrice.
      requiere: 'charger',
      // Depuis la liste, on guide vers le crayon de la carte ; dans l'entretien,
      // le spotlight pointe d'abord l'onglet Thématique ;
      // puis se déplace sur le panneau des thèmes une fois l'onglet ouvert (la bulle ne bloque plus le clic sur un thème).
      cible: () => {
        if (deps.vue.value !== 'entretien') return '[data-tour="crayon-entretien"]'
        return deps.ongletDroite.value === 'themes'
          ? '.panneau.themes-coder'
          : '[data-tour="onglet-themes"]'
      },
      fait: () => deps.entretien.annotations.some((a) => a.type === 'codage'),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Clique l'onglet Thématiques (icône thème), sélectionne un passage du texte, puis clique un thème pour le coder (✏️ pour en créer un)."
          : "Ouvre l'entretien 1Coordinatrice : clique le crayon ✏️ de sa carte.",
      retest: () => "ajouter ou retirer des annotations",
      fini: () =>
        "Première annotation posée : le passage est codé avec une thématique. " +
        "Prochaine étape : saisir une variable.",
    },
    {
      id: 'variable',
      titre: 'Saisir une variable',
      // Idem : le geste guidé ouvre 1Coordinatrice.
      requiere: 'charger',
      cible: () => {
        if (deps.vue.value !== 'entretien') return '[data-tour="crayon-entretien"]'
        return deps.ongletDroite.value === 'donnees'
          ? '.panneau.donnees'
          : '[data-tour="onglet-donnees"]'
      },
      fait: () =>
        Object.keys(deps.meta.valeursGen).length > 0 ||
        deps.locuteurs.value.some((l) => Object.keys(l.valeursLoc).length > 0),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Clique l'onglet Données (icône données), puis remplis une valeur (ex. le lieu de l'entretien, en texte libre)."
          : "Ouvre l'entretien 1Coordinatrice : clique le crayon ✏️ de sa carte.",
      retest: () => "modifier ou compléter les valeurs saisies",
      fini: () =>
        "Variable saisie ! Vous avez parcouru tout le circuit — importer, noter, " +
        "lier les transcriptions, pseudonymiser, coder et documenter vos entretiens. " +
        "Votre corpus est prêt pour l'analyse.",
    },
  ]

  /** Id de l'étape couramment guidée (spotlight actif) ; null = inactif. */
  const etapeCouranteId = ref<string | null>(null)
  /** Ids des étapes déjà validées (cochées dans la liste). */
  const validees = ref<Set<string>>(new Set())
  /** Message « re-test » : une étape déjà validée est rouverte ;
   *  on l'annonce (texte propre à chaque étape) dans la vue où vit son action —
   *  l'entretien (étapes d'édition) ou le corpus (étapes de corpus, ex. « Charger un entretien ») —
   *  avec un bouton pour revenir à la liste. */
  const retestInfo = ref<{ titre: string; suite: string; vue: 'corpus' | 'entretien' } | null>(null)
  /** Message « fin d'étape » : après validation d'une étape,
   *  on est revenu à l'écran Corpus et on affiche un petit texte de félicitation + la proposition d'enchaîner sur l'étape suivante (ou de fermer si c'était la dernière).
   *  `prochaineId`/`prochaineTitre` alimentent le bouton du message. */
  const finiInfo = ref<{
    titre: string
    suite: string
    prochaineId: string | null
    prochaineTitre: string | null
    /** Vue où afficher le message : 'corpus' pour les étapes de corpus (on y est déjà revenu) ;
     *  'entretien' pour les étapes d'édition qui y RESTENT (ex. « Prendre des notes à chaud »).
     *  L'utilisateur peut continuer puis revenir à la liste via le bouton du message. */
    vue: 'corpus' | 'entretien'
  } | null>(null)

  // Au changement de vue : si l'étape active est déjà validée, c'est un re-test —
  // on affiche le message d'emblée (sans attendre le prédicat,
  // qui peut repartir à faux à chaque ouverture) dans la vue de l'étape.
  // Un message affiché survit tant qu'on reste dans sa vue ; il s'efface dès qu'on en sort.
  watch(deps.vue, (v) => {
    if (retestInfo.value && v !== retestInfo.value.vue) retestInfo.value = null
    // Le message de fin d'étape, lui,
    // SURVIT aux changements de vue (la visibilité est pilotée par le v-if du Teleport au Corpus) ;
    // il peut y avoir une course asynchrone (ex.
    // la vraie modale qui ouvre l'entretien après l'import), on ne veut pas perdre les félicitations.
    // Il s'efface quand on enchaîne sur l'étape suivante ou qu'on le ferme.
    const e = etapes.find((x) => x.id === etapeCouranteId.value)
    if (!e || !e.retest || !validees.value.has(e.id)) return
    const vueRetest: 'corpus' | 'entretien' = e.retestCorpus ? 'corpus' : 'entretien'
    if (v !== vueRetest) return
    etapeCouranteId.value = null
    retestInfo.value = { titre: e.titre, suite: e.retest(), vue: vueRetest }
  })

  const etapeCourante = computed(() => etapes.find((e) => e.id === etapeCouranteId.value) ?? null)

  /** Écrit le marqueur démo du corpus courant (`corpus.json: { demo }`) : mode, racine des sources,
   *  étapes validées. L'historique du pas-à-pas voyage ainsi avec le corpus,
   *  restauré à la réouverture. */
  async function ecrireMarqueur(mode: ModeDemo): Promise<void> {
    if (!racineSources.value) return
    await window.sonal.corpus.marquerDemo({
      mode,
      racineSources: racineSources.value,
      validees: [...validees.value],
    })
  }

  /** Redérive les étapes validées depuis le modèle (prédicats `fait()`) :
   *  à la réouverture d'un corpus pas-à-pas, le watch de validation n'a rien détecté,
   *  puisqu'aucun état n'a changé ;
   *  on évalue donc toutes les étapes une fois pour retrouver l'historique réel, ex. « charger »
   *  re-cochée si un entretien existe déjà. Monotone : on ne décoche jamais,
   *  une étape faite le reste. */
  function revaliderEtapes() {
    const v = new Set(validees.value)
    for (const e of etapes) if (e.fait()) v.add(e.id)
    if (v.size !== validees.value.size) {
      validees.value = v
      void ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
    }
  }

  /** Active une étape (clic dans la liste) : démarre son spotlight.
   *  Une étape dont le prérequis n'est pas validé ne démarre pas ;
   *  les boutons de la liste sont déjà désactivés,
   *  la garde couvre aussi les enchaînements « Étape suivante » du message de fin. */
  function activer(id: string) {
    const e = etapes.find((x) => x.id === id)
    if (!e) return
    if (e.requiere && !validees.value.has(e.requiere)) return
    retestInfo.value = null // une activation neuve efface l'éventuel message re-test
    finiInfo.value = null // … ainsi que le message de fin d'étape affiché au corpus
    etapeCouranteId.value = id
  }

  // Validation automatique : quand l'étape courante devient `fait()`,
  // on la coche et on revient à la liste « Pas à pas » (sans enchaîner sur l'étape suivante,
  // l'utilisateur clique lui-même la suivante).
  // L'historique est mémorisé à chaque validation (il voyage avec le corpus).
  watch(
    () => etapeCourante.value?.fait() ?? false,
    async (faite) => {
      if (!faite || !etapeCourante.value) return
      const id = etapeCourante.value.id
      if (validees.value.has(id)) {
        // DÉJÀ validée, c'est un re-test : on éteint le guidage,
        // on garde l'entretien ouvert (étapes d'édition) et on affiche le message « étape déjà réalisée »
        // dans la vue de l'étape. Une étape de CORPUS (ex. « Charger un entretien ») se revoit au corpus ;
        // si l'import vient d'ouvrir un entretien, on y retourne d'abord.
        const e = etapeCourante.value
        etapeCouranteId.value = null
        if (e?.retest) {
          if (e.retestCorpus) await deps.retourCorpus()
          retestInfo.value = {
            titre: e.titre,
            suite: e.retest(),
            vue: e.retestCorpus ? 'corpus' : 'entretien',
          }
        }
        return
      }
      validees.value = new Set(validees.value).add(id)
      etapeCouranteId.value = null // guidage arrêté ; l'utilisateur relance la suite
      await ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
      const e = etapes.find((x) => x.id === id)
      const s = etapes[etapes.findIndex((x) => x.id === id) + 1]
      // On ne propose l'étape suivante que si elle est accessible (son prérequis est validé) ;
      // sinon le bouton « Étape suivante » disparaît.
      const suite = s && (!s.requiere || validees.value.has(s.requiere)) ? s : null
      // Une étape d'ÉDITION (`finiEnEntretien`, ex. « Prendre des notes à chaud »)
      // ne renvoie PAS au Corpus ; on reste dans l'entretien,
      // où l'utilisateur peut continuer s'il le souhaite.
      // Le message de fin s'y affiche (sous les onglets)
      // avec un bouton pour revenir à la liste « Pas à pas ». Les autres (étapes de corpus)
      // reviennent à l'écran Corpus comme avant.
      const resterEnEntretien = !!e?.finiEnEntretien
      if (!resterEnEntretien) await deps.retourCorpus()
      // Fin d'étape : on félicite et on propose la suite, « ouvrir l'entretien (crayon)
      // ou enchaîner sur l'étape suivante »,
      // pour que l'utilisateur ne reste jamais sans savoir quoi faire.
      if (e?.fini) {
        finiInfo.value = {
          titre: `« ${e.titre} » : terminé ✓`,
          suite: e.fini(),
          prochaineId: suite?.id ?? null,
          prochaineTitre: suite?.titre ?? null,
          vue: resterEnEntretien ? 'entretien' : 'corpus',
        }
      } else {
        finiInfo.value = null
      }
    },
  )

  /** Garde de l'étape « Charger un entretien » (pas-à-pas) : tant que l'étape 1 n'est PAS validée,
   *  la modale d'ajout n'accepte que `srt/1Coordinatrice.srt` + `audio/1Coordinatrice.mp3`.
   *  Toute la suite du parcours (les notes à chaud de l'étape 2, les locuteurs/enquêteur·rice,
   *  le passage « me recevoir » à coder…) est construite sur le contenu de CET entretien.
   *  Retourne un message d'erreur à afficher dans la modale, ou null si les fichiers sont les bons.
   *  Une fois l'étape validée (re-test « charger d'autres entretiens »), la garde se lève ;
   *  2RetraiteAnticipee…4Etudiants s'importent librement dans le même corpus,
   *  et hors pas-à-pas elle n'existe pas.
   *  Le titre de l'entretien importé = nom du fichier SRT (préfixe numérique compris) ;
   *  on vérifie donc aussi leur présence : l'étape demande les DEUX, texte ET audio. */
  function verifierChargementEtape1(nomTexte: string | null, cheminAudio: string | null): string | null {
    // Le garde vaut pour le MODE pas-à-pas entier (spotlight en cours ou non,
    // réouverture par « Récents », « Arrêter », …), pas seulement pendant le guidage ;
    // un 1Coordinatrice sans audio ne doit jamais pouvoir satisfaire l'étape.
    // SAUF si une AUTRE étape est activement guidée (ex. 2a « Prendre des notes à chaud »
    // mène son propre import audio seul AVANT l'étape 1 ; c'est elle qui garde, pas 1).
    if (!pasAPas.value || validees.value.has('charger')) return null
    if (etapeCouranteId.value && etapeCouranteId.value !== 'charger') return null
    const base = (p: string | null) => p?.replace(/^.*[\\/]/, '') ?? null
    if (base(nomTexte) !== '1Coordinatrice.srt' || base(cheminAudio) !== '1Coordinatrice.mp3') {
      return (
        "Pour cette étape du pas-à-pas, merci de choisir exactement « srt/1Coordinatrice.srt » puis « audio/1Coordinatrice.mp3 » : " +
        'la suite du parcours (notes à chaud, renommer, coder) est construite sur cet entretien.' +
        " Une fois l'étape validée, vous pourrez charger librement les autres entretiens (2RetraiteAnticipee…4Etudiants)."
      )
    }
    return null
  }

  /** Garde de l'étape « Prendre des notes à chaud » (pas-à-pas) :
   *  tant que l'étape 2 n'est PAS validée (après l'étape 1),
   *  la modale d'ajout n'accepte que l'AUDIO SEUL `audio/2RetraiteAnticipee.mp3`,
   *  aucun fichier de texte — le scénario du retour d'entretien :
   *  la transcription n'est pas encore prête, elle se liera plus tard (« Assigner un srt… »).
   *  Retourne un message d'erreur à afficher dans la modale, ou null si le choix est le bon.
   *  Une fois l'étape validée, la garde se lève ; on charge librement. */
  function verifierChargementEtape2(nomTexte: string | null, cheminAudio: string | null): string | null {
    // Active seulement pendant le geste guidé de 2a (création de l'entretien audio seul) :
    // tant que 2a n'est pas validée,
    // la modale n'accepte que `audio/2RetraiteAnticipee.mp3` sans fichier de texte.
    // Hors de cette étape (ou une fois 2a faite), la garde se lève ; on charge librement.
    if (!pasAPas.value || validees.value.has('noter')) return null
    if (etapeCouranteId.value !== 'noter') return null
    const base = (p: string | null) => p?.replace(/^.*[\/]/, '') ?? null
    if (base(cheminAudio) === '2RetraiteAnticipee.mp3' && nomTexte === null) return null
    if (nomTexte !== null) {
      return (
        "Cette étape montre le retour d'entretien : pas encore de transcription. " +
        'Remplissez la zone SON seule (aucun fichier de texte) — ' +
        "« audio/2RetraiteAnticipee.mp3 » — le SRT se liera à l'entretien plus tard."
      )
    }
    return (
      "Pour cette étape du pas-à-pas, merci de choisir exactement « audio/2RetraiteAnticipee.mp3 » : " +
        "le scénario est un retour d'entretien dont la transcription (SRT) n'est pas encore prête."
    )
  }

  /** Faut-il que la modale d'ajout ouvre l'entretien créé ?
   *  Pendant le geste GUIDÉ de l'étape « Charger un entretien » (premier passage comme re-test),
   *  NON : on reste au Corpus pour que la validation affiche son message « étape terminée ✓ »
   *  (ou « déjà réalisée ») ;
   *  l'ouverture automatique gagnerait la course et l'entretien s'ouvrirait à la place du message,
   *  c'est l'étape suivante qui ouvrira l'entretien. Partout ailleurs, oui : comportement SonalPi1,
   *  l'import ouvre l'entretien. */
  function ouvrirApresImport(): boolean {
    return etapeCouranteId.value !== 'charger'
  }

  /** Prépare le corpus de test du mode demandé puis l'ouvre.
   *  Chaque mode a son propre dossier (choisi dans la modale) ; seules les sources sont partagées.
   *  Étapes : 1. copier les sources bundled une fois (idempotent) ; 2.
   *  ouvrir le dossier du corpus de ce mode ; 3. 'autonomie' :
   *  importer les 4 entretiens + leurs audios ; 4. poser le marqueur démo (identité + historique) ;
   *  5. appliquer le corpus au modèle et atterrir sur la vue Corpus. */
  async function preparer(
    mode: ModeDemo,
    opts?: { racineSources?: string; dossierCorpus?: string },
  ): Promise<void> {
    if (enPreparation.value) return
    enPreparation.value = true
    try {
      if (opts?.racineSources) racineSources.value = opts.racineSources
      // Le dossier du corpus de CE mode : choisi dans la modale,
      // ou mémorisé (re-préparation « un clic »). Chaque mode a son dossier, indépendant.
      const dossierCorpus =
        opts?.dossierCorpus ?? (mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value)
      if (!racineSources.value || !dossierCorpus) return // ne devrait pas arriver (modale)
      if (mode === 'pas-a-pas') corpusPasAPas.value = dossierCorpus
      else corpusAutonomie.value = dossierCorpus

      // 1. LA seule copie du flow de démo (~13 Mo) — idempotente par complétude.
      await window.sonal.demo.copierSources(racineSources.value)
      // 2. Ouvrir (amorcer si neuf) le dossier du corpus de CE mode.
      const res = await window.sonal.corpus.ouvrirDossier(dossierCorpus)
      if (!res) return
      await deps.majDossierCourant()
      await deps.rafraichirRecents()

      // 3. Mode autonomie : peupler avec les 4 entretiens + audios. Idempotent :
      // on ne ré-importe PAS un entretien dont le TITRE source existe déjà,
      // sinon la re-préparation dupliquerait 1Coordinatrice…4Etudiants.
      if (mode === 'autonomie') {
        const titresExistants = new Set(Object.values(res.corpus.membership).map((m) => m.titre))
        for (const k of SOURCES) {
          if (titresExistants.has(k)) continue
          await importerSource(k, racineSources.value)
          titresExistants.add(k)
        }
      }

      // 4. Marqueur démo : identité du corpus de test (mode + sources + historique).
      // On CONSERVE l'historique existant du même mode ; une re-préparation « un clic »
      // ne doit pas effacer les étapes faites.
      const histo = res.corpus.demo
      const historique = histo?.mode === mode ? (histo.validees ?? []) : []
      await window.sonal.corpus.marquerDemo({
        mode,
        racineSources: racineSources.value,
        validees: historique,
      })

      // 5. Appliquer le corpus (marqué) au modèle : restaure le mode (panneau « Pas à pas »)
      // et l'historique des étapes.
      const c = await window.sonal.corpus.ouvrir()
      await deps.appliquerCorpus(c, dossierCorpus)
      deps.vue.value = 'corpus'
      if (mode === 'pas-a-pas') {
        // Pré-crée une variable « Ville » (portée locuteur, saisie libre)
        // pour l'étape « Saisir une variable » —
        // UNE fois seulement (ajouterVariable ne déduplique pas par libellé).
        if (!deps.variables.value.some((v) => v.lib === 'Ville')) {
          await window.sonal.corpus.ajouterVariable('Ville', 'locuteur')
          await deps.appliquerCorpus(await window.sonal.corpus.ouvrir(), dossierCorpus)
        }
        etapeCouranteId.value = etapes[0].id // démarre la 1re étape (les suivantes se lancent au clic)
      }
      // Mémoire démo PERSISTÉE (settings.json) : sources + dossier de CE mode (l'autre mode,
      // s'il existe, est préservé). Les cartes de l'Accueil restent « un clic »
      // quand les dossiers existent ; la modale saute les questions déjà répondues (ex.
      // « où importer les sources »).
      await window.sonal.demo.memoriser({
        racineSources: racineSources.value,
        corpusPasAPas: mode === 'pas-a-pas' ? dossierCorpus : (corpusPasAPas.value ?? undefined),
        corpusAutonomie: mode === 'autonomie' ? dossierCorpus : (corpusAutonomie.value ?? undefined),
      })
    } finally {
      enPreparation.value = false
    }
  }

  /** Recharge la mémoire démo persistée (settings.json) : dossiers (sources et corpus de chaque mode)
   *  et présence réelle sur disque. L'Accueil décide ensuite : « un clic » si tout est en place,
   *  sinon la modale adapte ses questions. */
  async function raccrocherEtatDemo(): Promise<boolean> {
    const etat = await window.sonal.demo.etat()
    if (!etat) return false
    racineSources.value = etat.racineSources
    sourcesPresentes.value = etat.sourcesExist
    corpusPasAPas.value = etat.corpusPasAPas ?? null
    corpusAutonomie.value = etat.corpusAutonomie ?? null
    corpusPasAPasPresent.value = etat.corpusPasAPasExist
    corpusAutonomiePresent.value = etat.corpusAutonomieExist
    return true
  }

  /** « Un clic » possible pour un mode : sources ET corpus de CE mode connus (mémorisés)
   *  et présents sur disque → re-préparation directe, sans modale. */
  function pretUnClic(mode: ModeDemo): boolean {
    const corpus = mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value
    const present =
      mode === 'pas-a-pas' ? corpusPasAPasPresent.value : corpusAutonomiePresent.value
    return !!racineSources.value && sourcesPresentes.value && !!corpus && present
  }

  /** Restaure le mode démo à l'ouverture d'un corpus, à partir de son marqueur `corpus.json:
   *  { demo }`. Pour un corpus 'pas-a-pas' : rappelle où sont les sources,
   *  remonte le panneau et restaure l'historique des étapes validées.
   *  Pour tout autre corpus (normal ou 'autonomie') : éteint le panneau. */
  async function raccrocherModeCorpus(
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ): Promise<void> {
    if (!marqueur || !dir) {
      pasAPas.value = false
      return
    }
    racineSources.value = marqueur.racineSources
    pasAPas.value = marqueur.mode === 'pas-a-pas'
    if (pasAPas.value) {
      // Historique restauré depuis le marqueur + re-dérivé du modèle (monotone —
      // on ne décoche pas). Le spotlight reste inactif (aucune étape forcée) :
      // l'utilisateur clique une étape pour reprendre le guidage.
      validees.value = new Set(marqueur.validees ?? [])
      revaliderEtapes()
    }
  }

  return {
    pasAPas,
    enPreparation,
    racineSources,
    sourcesPresentes,
    corpusPasAPas,
    corpusAutonomie,
    corpusPasAPasPresent,
    corpusAutonomiePresent,
    pretUnClic,
    raccrocherEtatDemo,
    raccrocherModeCorpus,
    preparer,
    importerSource,
    etapes,
    etapeCouranteId,
    etapeCourante,
    validees,
    retestInfo,
    finiInfo,
    activer,
    verifierChargementEtape1,
    verifierChargementEtape2,
    ouvrirApresImport,
  }
}

import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { estOrpheline } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'

export const decorationsPluginKey = new PluginKey('sonal-annotations-decorations')

/**
 *  Teinte stable dérivée du code — source unique des couleurs d'un code
 *  (affichage ET export, pour rester cohérents).
 *  Pour un code numéroté `cat_NNN`, on répartit par l'ANGLE D'OR (137,5°) : des
 *  codes voisins (`cat_001`/`002`/`003`) obtiennent des couleurs bien distinctes
 *  — un simple hash de la chaîne les collerait (mêmes caractères sauf le
 *  dernier → teintes à ~1° d'écart, « tout en rouge »).
 */
function hueDe(code: string): number {
  const m = code.match(/(\d+)\s*$/)
  if (m) return (Number(m[1]) * 137.5) % 360
  let hash = 0
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) | 0
  return ((hash % 360) + 360) % 360
}

/** Couleur stable dérivée du code (teinte par hash) — repli quand la catégorie n'en porte pas. */
export function couleurPourCode(code: string): { trait: string; fond: string } {
  const hue = hueDe(code)
  return { trait: `hsl(${hue} 70% 42%)`, fond: `hsl(${hue} 70% 42% / 0.15)` }
}

/**
 *  Même teinte, en HEX — pour l'EXPORT `.sonal` : SonalPi1 colore un codage via
 *  le dégradé CSS `.cat_XXX` construit à partir d'une couleur HEX (`#rrggbb` +
 *  alpha). Une catégorie sans couleur stockée reçoit à l'export la même couleur
 *  synthétisée que celle affichée, pour que le codage soit VISIBLE dans SonalPi1.
 *  (Une catégorie porteuse d'une couleur — ex. import — garde la sienne.)
 */
export function couleurHexPourCode(code: string): string {
  return hslVersHex(hueDe(code), 70, 42)
}

function hslVersHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g] = [c, x]
  else if (h < 120) [r, g] = [x, c]
  else if (h < 180) [g, b] = [c, x]
  else if (h < 240) [g, b] = [x, c]
  else if (h < 300) [r, b] = [x, c]
  else [r, b] = [c, x]
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/** Résout la couleur d'un code : par défaut la teinte synthétisée.
 *  L'app fournit un résolveur qui lit la couleur STOCKÉE du codebook en priorité, pour
 *  recolorer un thème en direct sans toucher aux entretiens. */
export type ResolveurCouleur = (code: string) => string

/** Résout la taille de police (px) d'un code — la `taille` STOCKÉE du codebook.
 *  (Parité SonalPi1 ; `undefined` = taille du texte.) Injecté comme la couleur. */
export type ResolveurTaille = (code: string) => number | undefined

/** Résout le NOM lisible d'un code (libellé du thème au codebook).
 *  Pour les infobulles des passages codés, à la place de l'id brut (`cat-…`). */
export type ResolveurNom = (code: string) => string

function traitDe(a: { type: string; code?: string }, resoudre: ResolveurCouleur): string {
  return a.type === 'anon' ? 'hsl(0 0% 45%)' : resoudre(a.code ?? '')
}

/**
 *  Construit les décorations à partir du MODÈLE (entretien.annotations) — PAS
 *  d'un Y.Array : les positions du modèle SONT les positions ProseMirror
 *  (remappées par pluginRemap). Le marquage est un calque de décorations, jamais
 *  des marks : il ne coupe pas le texte.
 *
 *  COMPOSITION : deux annotations qui se recouvrent (même plage ou
 *  chevauchement partiel) ne peuvent pas être deux décorations distinctes —
 *  ProseMirror les fusionne en un span et les propriétés CSS en conflit
 *  (background, bordure) s'écrasent. On balaie donc les bornes en SEGMENTS
 *  élémentaires : une seule décoration par segment, dont le style EMPILE toutes
 *  les annotations qui le couvrent (fonds translucides superposés + soulignés
 *  `box-shadow` décalés). La composition devient visible sans dépendre de la
 *  fusion de ProseMirror.
 */
function construireDecorations(
  state: EditorState,
  entretien: Entretien,
  resoudre: ResolveurCouleur,
  tailleDe?: ResolveurTaille,
  estCodeActif: (code: string) => boolean = () => true,
  nomDe?: ResolveurNom,
): DecorationSet {
  // Un codage d'un thème INACTIF est masqué du marquage (ni souligné, ni barre de chevauchement,
  // ni taille, ni compte) — comme s'il n'existait pas pour l'œil.
  const actives = entretien.annotations.filter(
    (a) => !estOrpheline(a) && (a.type !== 'codage' || estCodeActif(a.code ?? '')),
  )
  if (actives.length === 0) return DecorationSet.empty

  // Incluses (chevauchement de règles) : une annotation anon contenue est masquée,
  // quand une autre PLUS LONGUE la couvre.
  // Le rendu ne voit que la plus large (pas de barré ni de [pseudo] pour l'interne).
  // Elle reste dans le modèle ; au retrait de l'englobante, elle réapparaît telle quelle.
  // (Restauration gratuite.)
  const masquee = new Set<string>()
  for (const x of actives) {
    if (x.type !== 'anon') continue
    const englobee = actives.some(
      (y) =>
        y.type === 'anon' &&
        y.id !== x.id &&
        y.from <= x.from &&
        x.to <= y.to &&
        y.to - y.from > x.to - x.from,
    )
    if (englobee) masquee.add(x.id)
  }

  // Bornes élémentaires : toutes les extrémités d'annotations, plus les bornes de contenu des paragraphes.
  // Un segment ne doit pas chevaucher deux paragraphes : chaque segment relève d'UN paragraphe,
  // pour la hauteur des barres (cf. ci-dessous). Triées et dédupliquées.
  const codages = actives.filter((a) => a.type === 'codage')
  const bornesBrutes = [...new Set(actives.flatMap((a) => [a.from, a.to]))]

  // Par paragraphe : nombre MAXIMAL de codages couvrant un même point.
  // Cette valeur réserve la MÊME hauteur de barres (padding-bas) à tous les segments du paragraphe :
  // un sous-passage codé une fois de plus ne décale pas les barres des voisins ;
  // elles restent continues et alignées.
  const paragraphes: { debut: number; fin: number; maxCodages: number }[] = []
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    const debut = offset + 1
    const fin = offset + node.nodeSize
    const points = new Set<number>([debut])
    for (const c of codages) {
      if (c.from > debut && c.from < fin) points.add(c.from)
      if (c.to > debut && c.to < fin) points.add(c.to)
    }
    let max = 0
    for (const p of points) {
      const n = codages.filter((c) => c.from <= p && p < c.to).length
      if (n > max) max = n
    }
    paragraphes.push({ debut, fin, maxCodages: max })
    bornesBrutes.push(debut, fin)
  })
  const bornes = [...new Set(bornesBrutes)].sort((x, y) => x - y)

  const decos: Decoration[] = []
  let iparagraphe = 0
  for (let i = 0; i < bornes.length - 1; i++) {
    const segFrom = bornes[i]
    const segTo = bornes[i + 1]
    while (iparagraphe < paragraphes.length && paragraphes[iparagraphe].fin <= segFrom) iparagraphe++
    const paragraphe = paragraphes[iparagraphe]
    const couvrant = actives.filter((a) => a.from <= segFrom && a.to >= segTo)
    if (couvrant.length === 0) continue

    // Soulignement des CODAGES seuls (l'anon a son propre marqueur).
    // Le texte est barré, pseudo en ::after (cf. editeur.css) ;
    // un commentaire n'a que la teinte de fond, pas de souligné.
    // Dès qu'un codage du paragraphe se superpose à un autre, TOUT le paragraphe passe au DÉGRADÉ,
    // à arrêts : barres de 2px par thème, séparées de 1px, posées sous le texte.
    // Un padding-bas UNIFORME (celui du max du paragraphe) garde les barres alignées d'un segment à l'autre,
    // même quand un sous-passage porte un codage de plus.
    // Un dégradé à une seule teinte rend comme la box-shadow.
    const codagesIci = couvrant.filter((a) => a.type === 'codage')
    const nbBarres = paragraphe ? paragraphe.maxCodages : codagesIci.length
    const stylesCodage: string[] = []
    if (nbBarres > 1) {
      const arrets: string[] = []
      codagesIci.forEach((a, k) => {
        arrets.push(`${traitDe(a, resoudre)} ${3 * k}px ${3 * k + 2}px`)
        if (k < codagesIci.length - 1)
          arrets.push(`transparent ${3 * k + 2}px ${3 * k + 3}px`)
      })
      // Au-delà du DERNIER arrêt, un dégradé prolonge sa dernière couleur.
      // Sans cet arrêt final transparent, la dernière teinte surlignerait tout le passage,
      // au lieu de rester une barre sous le texte.
      arrets.push(`transparent ${3 * (codagesIci.length - 1) + 2}px`)
      stylesCodage.push(`background-image:linear-gradient(to top, ${arrets.join(',')})`)
      stylesCodage.push(`padding-bottom:${4 + 3 * (nbBarres - 1)}px`)
    } else if (codagesIci.length === 1) {
      stylesCodage.push(`box-shadow:inset 0 -2px 0 ${traitDe(codagesIci[0], resoudre)}`)
    }
    const marqueCodages = stylesCodage.join(';')
    // Taille de police du thème (parité SonalPi1) : sur un chevauchement, la plus grande l'emporte.
    // (Les tailles ne s'empilent pas comme les soulignés.)
    // Comme SonalPi1, une taille posée s'accompagne du GRAS : son CSS généré fait font-size + font-weight:bold ensemble.
    const tailles = couvrant
      .filter((a) => a.type === 'codage')
      .map((a) => tailleDe?.(a.code ?? ''))
      .filter((t): t is number => t != null)
    const police = tailles.length ? `font-size:${Math.max(...tailles)}px;font-weight:bold;` : ''
    // Occurrences anon couvrant ce segment.
    // Le [pseudo] ne s'affiche qu'à la BORNE DE FIN de l'occurrence, jamais sur toute sa plage.
    // Si une borne interne (ex. un codage sur « York » dans « New York ») découpe l'occurrence,
    // le pseudo ne doit se répéter qu'une fois à la fin.
    // (Sinon « New »[ville] « York »[ville] au lieu de « New York »[ville].)
    // Le barré, lui, reste continu sur toute la plage.
    const anons = couvrant.filter((a) => a.type === 'anon' && !masquee.has(a.id))
    // Commentaires couvrant ce segment : teinte de fond propre (le marqueur « il y a un commentaire ici »,
    // visible même quand la marge est cachée — fenêtre étroite), en plus du souligné des codages.
    const commenteIci = couvrant.some((a) => a.type === 'commentaire')
    // Occurrence ANONYMISÉE (barrée + [pseudo]) vs EXCEPTION : décision volontaire de laisser en clair,
    // ni barrée ni [pseudo]. Sur un segment où une exception et une occurrence anonymisée se recouvrent,
    // le barré l'emporte (c'est la décision de masquage qui reste visible) ;
    // un segment couvert UNIQUEMENT par des exceptions reçoit la classe `anon-exception`.
    const anonymiseIci = anons.some((a) => a.etat !== 'exception')
    const exceptionSeule = anons.length > 0 && !anonymiseIci
    // Le [pseudo] ne s'affiche qu'à la BORNE DE FIN d'une occurrence ANONYMISÉE ;
    // jamais sur une exception (le pseudo vit sur la ligne/règle, pas sur l'exception).
    const pseudos = [
      ...new Set(
        anons
          .filter((a) => a.etat !== 'exception' && a.to === segTo)
          .map((a) => a.pseudo ?? '')
          .filter(Boolean),
      ),
    ]
    // Segment de CONTINUATION d'une occurrence anonymisée découpée par une borne interne,
    // ex. un codage sur « York » dans « New York » : on barre (classe `anon`)
    // sans afficher de pseudo — pas de data-pseudo, et `anon-suite` neutralise le ::after du CSS.
    const suite = anonymiseIci && pseudos.length === 0
    const style = [
      marqueCodages,
      police,
      commenteIci ? 'background-color:rgba(255, 213, 79, 0.18)' : '',
    ]
      .filter(Boolean)
      .join(';')
    decos.push(
      Decoration.inline(segFrom, segTo, {
        class: exceptionSeule
          ? 'annot anon-exception'
          : anonymiseIci
            ? `annot anon${suite ? ' anon-suite' : ''}`
            : 'annot',
        style,
        // Les incluses masquées ne figurent ni dans le comptage ni dans le titre :
        // le segment se présente comme si elles n'existaient pas.
        'data-annot-count': String(couvrant.filter((a) => !masquee.has(a.id)).length),
        'data-annot-ids': couvrant
          .filter((a) => !masquee.has(a.id))
          .map((a) => a.id)
          .join(' '),
        ...(pseudos.length ? { 'data-pseudo': pseudos.join(' / ') } : {}),
        title: couvrant
          .filter((a) => !masquee.has(a.id))
          .map((a) => {
            if (a.type === 'anon') return a.etat === 'exception' ? 'exception' : a.pseudo ? `anon→${a.pseudo}` : 'anon'
            if (a.type === 'commentaire') return `💬 ${a.auteur || 'sans auteur'} : ${(a.texte ?? '').slice(0, 80)}`
            return nomDe?.(a.code ?? '') || a.code
          })
          .join(' + '),
      }),
    )
  }
  return DecorationSet.create(state.doc, decos)
}

/**
 *  Plugin de décorations. Se reconstruit quand le doc change (les positions ont
 *  été remappées) OU quand le modèle a bougé (méta 'refresh' émise par l'UI
 *  après coder/retirer). Entre-temps il mappe ses décorations sur les éditions,
 *  comme les positions du modèle — les deux restent alignés.
 */
export function pluginDecorations(
  entretien: Entretien,
  resoudre: ResolveurCouleur,
  tailleDe?: ResolveurTaille,
  estCodeActif?: (code: string) => boolean,
  nomDe?: ResolveurNom,
): Plugin {
  return new Plugin({
    key: decorationsPluginKey,
    state: {
      init: (_config, state) =>
        construireDecorations(state, entretien, resoudre, tailleDe, estCodeActif, nomDe),
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged || tr.getMeta(decorationsPluginKey) === 'refresh') {
          return construireDecorations(newState, entretien, resoudre, tailleDe, estCodeActif, nomDe)
        }
        return value.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}

import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { estOrpheline } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'

export const decorationsPluginKey = new PluginKey('sonal-annotations-decorations')

/**
 * Teinte stable dérivée du code — source unique des couleurs d'un code (affichage
 * ET export, pour rester cohérents). Pour un code numéroté `cat_NNN`, on répartit
 * par l'ANGLE D'OR (137,5°) : des codes voisins (`cat_001`/`002`/`003`) obtiennent
 * des couleurs bien distinctes — un simple hash de la chaîne les collerait (mêmes
 * caractères sauf le dernier → teintes à ~1° d'écart, « tout en rouge »).
 */
function hueDe(code: string): number {
  const m = code.match(/(\d+)\s*$/)
  if (m) return (Number(m[1]) * 137.5) % 360
  let hash = 0
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) | 0
  return ((hash % 360) + 360) % 360
}

/** Couleur stable dérivée du code (teinte par hash) — repris du POC2. */
export function couleurPourCode(code: string): { trait: string; fond: string } {
  const hue = hueDe(code)
  return { trait: `hsl(${hue} 70% 42%)`, fond: `hsl(${hue} 70% 42% / 0.15)` }
}

/**
 * Même teinte, en HEX — pour l'EXPORT `.sonal` : SonalPi colore un codage via le
 * dégradé CSS `.cat_XXX` construit à partir d'une couleur HEX (`#rrggbb` + alpha).
 * SonalAsynchro ne stocke pas encore de couleur sur les catégories (étape 5) ; on synthétise
 * donc à l'export la même couleur que celle affichée, pour que le codage soit VISIBLE
 * dans SonalPi. (Une catégorie porteuse d'une couleur — ex. import — garde la sienne.)
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

/** Résout la couleur d'un code : par défaut la teinte synthétisée. L'app fournit
 *  un résolveur qui lit la couleur STOCKÉE du codebook en priorité (étape 5) →
 *  recolorer un thème se reflète en direct, sans toucher aux entretiens. */
export type ResolveurCouleur = (code: string) => string

function traitDe(a: { type: string; code?: string }, resoudre: ResolveurCouleur): string {
  return a.type === 'anon' ? 'hsl(0 0% 45%)' : resoudre(a.code ?? '')
}

/**
 * Construit les décorations à partir du MODÈLE (entretien.annotations) — PAS d'un
 * Y.Array : les positions du modèle SONT les positions ProseMirror (remappées par
 * pluginRemap). Le marquage est un calque de décorations, jamais des marks : il ne
 * coupe pas le texte (MODELE_OBJET2 §2).
 *
 * COMPOSITION : deux annotations qui se recouvrent (même plage ou chevauchement
 * partiel) ne peuvent pas être deux décorations distinctes — ProseMirror les
 * fusionne en un span et les propriétés CSS en conflit (background, bordure)
 * s'écrasent. On balaie donc les bornes en SEGMENTS élémentaires : une seule
 * décoration par segment, dont le style EMPILE toutes les annotations qui le
 * couvrent (fonds translucides superposés + soulignés `box-shadow` décalés). La
 * composition devient visible sans dépendre de la fusion de ProseMirror.
 */
function construireDecorations(
  state: EditorState,
  entretien: Entretien,
  resoudre: ResolveurCouleur,
): DecorationSet {
  const actives = entretien.annotations.filter((a) => !estOrpheline(a))
  if (actives.length === 0) return DecorationSet.empty

  // Bornes élémentaires : toutes les extrémités, triées et dédupliquées.
  const bornes = [...new Set(actives.flatMap((a) => [a.from, a.to]))].sort((x, y) => x - y)

  const decos: Decoration[] = []
  for (let i = 0; i < bornes.length - 1; i++) {
    const segFrom = bornes[i]
    const segTo = bornes[i + 1]
    const couvrant = actives.filter((a) => a.from <= segFrom && a.to >= segTo)
    if (couvrant.length === 0) continue

    // Soulignement SEUL (pas de fond) : sur un chevauchement, les traits empilés
    // restent lisibles par couleur, là où des fonds translucides se mélangeraient.
    const souligne = couvrant
      .map((a, k) => `inset 0 ${-2 * (k + 1)}px 0 ${traitDe(a, resoudre)}`)
      .join(',')
    decos.push(
      Decoration.inline(segFrom, segTo, {
        class: 'annot',
        style: `box-shadow:${souligne};`,
        'data-annot-count': String(couvrant.length),
        'data-annot-ids': couvrant.map((a) => a.id).join(' '),
        title: couvrant.map((a) => (a.type === 'anon' ? `anon` : a.code)).join(' + '),
      }),
    )
  }
  return DecorationSet.create(state.doc, decos)
}

/**
 * Plugin de décorations. Se reconstruit quand le doc change (les positions ont
 * été remappées) OU quand le modèle a bougé (méta 'refresh' émise par l'UI après
 * coder/retirer). Entre-temps il mappe ses décorations sur les éditions, comme
 * les positions du modèle — les deux restent alignés.
 */
export function pluginDecorations(entretien: Entretien, resoudre: ResolveurCouleur): Plugin {
  return new Plugin({
    key: decorationsPluginKey,
    state: {
      init: (_config, state) => construireDecorations(state, entretien, resoudre),
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged || tr.getMeta(decorationsPluginKey) === 'refresh') {
          return construireDecorations(newState, entretien, resoudre)
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

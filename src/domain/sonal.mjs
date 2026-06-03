// Domaine : lecture du fichier .sonal (Entretien) via DOM.
//
// Lecteur canonique des invariants observables d'un .sonal. Fidèle au pattern de
// production (modules/gestion_entretiens.js : createElement('div') + innerHTML +
// querySelectorAll('.lblseg') + .closest() + .dataset). La Phase 5 adoptera ce
// module dans les lecteurs DOM du renderer.
//
// `doc` = `document` réel dans le renderer ; un document jsdom dans les tests.
// Voir docs/FORMATS.md §2.

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function buildRoot(html, doc) {
  const root = doc.createElement('div');
  root.innerHTML = html;
  return root;
}

/** Segments : span.lblseg -> {rksg, deb, fin, loc, statut, nomloc}, triés par rksg. */
export function segments(html, doc) {
  const root = buildRoot(html, doc);
  return [...root.querySelectorAll('.lblseg')]
    .map((seg) => ({
      rksg: seg.dataset.rksg ?? null,
      deb: seg.dataset.deb ?? null,
      fin: seg.dataset.fin ?? null,
      loc: seg.dataset.loc ?? null,
      statut: seg.dataset.statut ?? null,
      nomloc: seg.dataset.nomloc ?? null,
    }))
    .sort((a, b) => num(a.rksg) - num(b.rksg));
}

/** Locuteurs : couples distincts (loc, nomloc) rencontrés sur les segments. */
export function locuteurs(html, doc) {
  const seen = new Map();
  for (const s of segments(html, doc)) {
    if (s.loc == null) continue;
    const key = `${s.loc}|${s.nomloc ?? ''}`;
    if (!seen.has(key)) seen.set(key, { loc: s.loc, nomloc: s.nomloc ?? null });
  }
  return [...seen.values()].sort((a, b) => num(a.loc) - num(b.loc));
}

/** Codages : comptage par classe cat_XXX (un fragment peut en cumuler plusieurs). */
export function codages(html, doc) {
  const root = buildRoot(html, doc);
  const counts = {};
  for (const span of root.querySelectorAll('span')) {
    for (const cls of span.classList) {
      if (/^cat_\d+$/.test(cls)) counts[cls] = (counts[cls] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Anon : préserve l'asymétrie à 3 états (MODELE_OBJET3 §5).
 *   type 'anon' / 'anon-exception' ; le 3e état (présent-non-anonymisé) n'a pas
 *   de span dédié et est donc absent de cette liste (documenté par omission).
 */
export function anon(html, doc) {
  const root = buildRoot(html, doc);
  const out = [];
  for (const span of root.querySelectorAll('span')) {
    let type = null;
    if (span.classList.contains('anon-exception')) type = 'anon-exception';
    else if (span.classList.contains('anon')) type = 'anon';
    if (!type) continue;
    out.push({
      rk: span.dataset.rk ?? null,
      pseudo: span.dataset.pseudo ?? null,
      nt: span.dataset.anonNt ?? null,
      type,
    });
  }
  return out.sort((a, b) => num(a.rk) - num(b.rk));
}

/** Commentaires : annotations data-obs/data-auth/data-finobs (Commentaire, Phase 5). */
export function commentaires(html, doc) {
  const root = buildRoot(html, doc);
  const out = [];
  for (const span of root.querySelectorAll('span')) {
    const d = span.dataset;
    if (!('obs' in d) && !('auth' in d) && !('finobs' in d)) continue;
    out.push({
      rk: d.rk ?? null,
      auteur: d.auth ?? null,
      obs: d.obs ?? null,
      finobs: d.finobs ?? null,
    });
  }
  return out.sort((a, b) => num(a.rk) - num(b.rk));
}

/** Extraction complète des invariants d'un .sonal. */
export function parseSonal(html, doc) {
  return {
    segments: segments(html, doc),
    locuteurs: locuteurs(html, doc),
    codages: codages(html, doc),
    anon: anon(html, doc),
    commentaires: commentaires(html, doc),
  };
}

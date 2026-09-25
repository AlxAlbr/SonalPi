import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { QualcoderExportModel } from '../shared/export/qualcoder/modele'

const SCHEMA = [
  'CREATE TABLE project (databaseversion text, date text, memo text, about text, bookmarkfile integer, bookmarkpos integer, codername text, recently_used_codes text, avbookmarkfile integer, avbookmarkmsec integer, avbookmarktextpos integer)',
  'CREATE TABLE source (id integer primary key, name text, fulltext text, mediapath text, memo text, owner text, date text, av_text_id integer, risid integer, unique(name))',
  'CREATE TABLE code_image (imid integer primary key,id integer,x1 integer, y1 integer, width integer, height integer, cid integer, memo text, date text, owner text, important integer, pdf_page integer)',
  'CREATE TABLE code_av (avid integer primary key,id integer,pos0 integer, pos1 integer, cid integer, memo text, date text, owner text, important integer)',
  'CREATE TABLE annotation (anid integer primary key, fid integer,pos0 integer, pos1 integer, memo text, owner text, date text, unique(fid,pos0,pos1,owner))',
  'CREATE TABLE attribute_type (name text primary key, date text, owner text, memo text, caseOrFile text, valuetype text)',
  'CREATE TABLE attribute (attrid integer primary key, name text, attr_type text, value text, id integer, date text, owner text, unique(name,attr_type,id))',
  'CREATE TABLE case_text (id integer primary key, caseid integer, fid integer, pos0 integer, pos1 integer, owner text, date text, memo text)',
  'CREATE TABLE cases (caseid integer primary key, name text, memo text, owner text,date text, constraint ucm unique(name))',
  'CREATE TABLE code_cat (catid integer primary key, name text, owner text, date text, memo text, supercatid integer, unique(name))',
  'CREATE TABLE code_text (ctid integer primary key, cid integer, fid integer,seltext text, pos0 integer, pos1 integer, owner text, date text, memo text, avid integer, important integer, unique(cid,fid,pos0,pos1, owner))',
  'CREATE TABLE code_name (cid integer primary key, name text, memo text, catid integer, owner text,date text, color text, supercid integer, unique(name))',
  'CREATE TABLE journal (jid integer primary key, name text, jentry text, date text, owner text, unique(name))',
  'CREATE TABLE stored_sql (title text, description text, grouper text, ssql text, unique(title))',
  'CREATE TABLE graph (grid integer primary key, name text, description text, date text, scene_width integer, scene_height integer, unique(name))',
  'CREATE TABLE gr_cdct_text_item (gtextid integer primary key, grid integer, x integer, y integer, supercatid integer, catid integer, cid integer, font_size integer, bold integer, isvisible integer, displaytext text)',
  'CREATE TABLE gr_case_text_item (gcaseid integer primary key, grid integer, x integer, y integer, caseid integer, font_size integer, bold integer, color text, displaytext text)',
  'CREATE TABLE gr_file_text_item (gfileid integer primary key, grid integer, x integer, y integer, fid integer, font_size integer, bold integer, color text, displaytext text)',
  'CREATE TABLE gr_free_text_item (gfreeid integer primary key, grid integer, x integer, y integer, freetextid integer, displaytext text, tooltip text, ctid integer,memo_ctid integer, memo_imid integer, memo_avid integer)',
  'CREATE TABLE gr_cdct_line_item (glineid integer primary key, grid integer, fromcatid integer, fromcid integer, tocatid integer, tocid integer, color text, linewidth real, linetype text, isvisible integer, label text, arrow_mode text)',
  'CREATE TABLE gr_free_line_item (gflineid integer primary key, grid integer, fromfreetextid integer, fromcatid integer, fromcid integer, fromcaseid integer, fromfileid integer, fromimid integer, fromavid integer, tocatid integer, tofreetextid integer, tocid integer, tocaseid integer, tofileid integer, toimid integer, toavid integer, color text, label text, arrow_mode text)',
  'CREATE TABLE gr_memo_item (grmemoid integer primary key, grid integer, memo_source_type text, memo_source_id integer, x integer, y integer, color text, font_size integer)',
  'CREATE TABLE gr_pix_item (grpixid integer primary key, grid integer, imid integer,x integer, y integer, px integer, py integer, w integer, h integer, filepath text, tooltip text, pdf_page integer)',
  'CREATE TABLE gr_av_item (gr_avid integer primary key, grid integer, avid integer,x integer, y integer, pos0 integer, pos1 integer, filepath text, tooltip text, color text)',
  'CREATE TABLE ris (risid integer, tag text, longtag text, value text)',
  'CREATE TABLE manage_files_display (mfid integer primary key, name text, tblrows text, tblcolumns text, owner text)',
  'CREATE TABLE files_filter (filterid integer primary key, name text, filter text, owner text)',
]

function maintenant(): string {
  return new Date().toISOString()
}

function invalide(bases: Map<string, number>, id: string, kind: string): number {
  const valeur = bases.get(id)
  if (valeur === undefined) throw new Error(`La correspondance ${kind} est absente : ${id}.`)
  return valeur
}

/** Écrit un projet QualCoder natif dans un dossier vide. */
export function ecrireProjetQualcoder(modele: QualcoderExportModel, dossier: string): void {
  const cheminBase = join(dossier, 'data.qda')
  if (existsSync(cheminBase)) throw new Error('Le dossier contient déjà un projet QualCoder.')
  mkdirSync(dossier, { recursive: true })
  for (const sousDossier of ['audio', 'documents', 'images', 'video']) {
    mkdirSync(join(dossier, sousDossier), { recursive: true })
  }

  const base = new DatabaseSync(cheminBase)
  try {
    base.exec('PRAGMA foreign_keys = OFF')
    for (const instruction of SCHEMA) base.exec(instruction)
    const date = maintenant()
    base.exec('BEGIN IMMEDIATE')
    base.prepare('INSERT INTO project VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('v17', date, '', 'QualCoder 4.0 Beta', 0, 0, 'SonalPi', '', null, null, null)

    const sourceIds = new Map<string, number>()
    const sourceNames = new Set<string>()
    const insereSource = base.prepare('INSERT INTO source (id, name, fulltext, mediapath, memo, owner, date, av_text_id, risid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    modele.sources.forEach((source, index) => {
      const id = index + 1
      sourceIds.set(source.id, id)
      const base = `${source.titre}.txt`
      let nom = base
      let suffixe = 2
      while (sourceNames.has(nom)) nom = `${source.titre} (${suffixe++}).txt`
      sourceNames.add(nom)
      insereSource.run(id, nom, source.fulltext, null, source.memo, source.owner, source.date, null, null)
    })

    const categorieIds = new Map<string, number>()
    const insereCategorie = base.prepare('INSERT INTO code_cat (catid, name, owner, date, memo, supercatid) VALUES (?, ?, ?, ?, ?, ?)')
    const categories = new Map<string, { id: string; nom: string; parent: string | null; couleur: string }>()
    for (const code of modele.codebook) {
      let courant: typeof code.categorie | null = code.categorie
      const parents = new Set<string>()
      while (courant && !parents.has(courant.id)) {
        parents.add(courant.id)
        categories.set(courant.id, {
          id: courant.id,
          nom: courant.nom,
          parent: courant.parent?.id ?? null,
          couleur: courant.couleur,
        })
        courant = courant.parent
      }
    }
    for (const categorie of categories.values()) {
      const id = categorieIds.size + 1
      categorieIds.set(categorie.id, id)
      insereCategorie.run(id, categorie.nom, 'SonalPi', date, '', null)
    }
    for (const categorie of categories.values()) {
      const parent = categorie.parent ? invalide(categorieIds, categorie.parent, 'catégorie') : null
      base.prepare('UPDATE code_cat SET supercatid = ? WHERE catid = ?').run(parent, invalide(categorieIds, categorie.id, 'catégorie'))
    }

    const codeIds = new Map<string, number>()
    const insereCode = base.prepare('INSERT INTO code_name (cid, name, memo, catid, owner, date, color, supercid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    modele.codebook.forEach((code, index) => {
      const cid = index + 1
      codeIds.set(code.id, cid)
      const catid = code.categorie ? invalide(categorieIds, code.categorie.id, 'catégorie') : null
      insereCode.run(cid, code.nom, code.memo, catid, 'SonalPi', date, code.couleur, null)
    })
    const insereCodage = base.prepare('INSERT INTO code_text (ctid, cid, fid, seltext, pos0, pos1, owner, date, memo, avid, important) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insereAnnotation = base.prepare('INSERT INTO annotation (anid, fid, pos0, pos1, memo, owner, date) VALUES (?, ?, ?, ?, ?, ?, ?)')
    let ctid = 0
    let anid = 0
    for (const source of modele.sources) {
      const fid = invalide(sourceIds, source.id, 'source')
      for (const annotation of source.annotations) {
        if (annotation.to <= annotation.from) continue
        if (annotation.type === 'commentaire') {
          insereAnnotation.run(++anid, fid, annotation.from, annotation.to, annotation.texte, annotation.auteur, date)
          continue
        }
        const code = annotation.code
        if (!code) continue
        const cid = invalide(codeIds, code.id, 'code')
        insereCodage.run(++ctid, cid, fid, source.fulltext.slice(annotation.from, annotation.to), annotation.from, annotation.to, annotation.auteur, date, '', null, 0)
      }
    }

    const insereAttributType = base.prepare('INSERT INTO attribute_type (name, date, owner, memo, caseOrFile, valuetype) VALUES (?, ?, ?, ?, ?, ?)')
    for (const definition of modele.attributs) {
      insereAttributType.run(definition.nom, date, 'SonalPi', definition.memo ?? '', definition.type === 'cas' ? 'case' : 'file', 'character')
    }
    const insereAttribut = base.prepare('INSERT INTO attribute (attrid, name, attr_type, value, id, date, owner) VALUES (?, ?, ?, ?, ?, ?, ?)')
    let attrid = 0
    for (const source of modele.sources) {
      const fid = invalide(sourceIds, source.id, 'source')
      for (const attribute of source.attributs) {
        insereAttribut.run(++attrid, attribute.nom, 'file', attribute.valeur, fid, date, 'SonalPi')
      }
    }
    const caseIdsPourAttributs = new Map<string, number>()
    modele.cases.forEach((cas, index) => caseIdsPourAttributs.set(cas.id, index + 1))
    for (const cas of modele.cases) {
      const caseid = invalide(caseIdsPourAttributs, cas.id, 'cas')
      for (const attribute of cas.attributs) {
        insereAttribut.run(++attrid, attribute.nom, 'case', attribute.valeur, caseid, date, 'SonalPi')
      }
    }
    const insereCase = base.prepare('INSERT INTO cases (caseid, name, memo, owner, date) VALUES (?, ?, ?, ?, ?)')
    const insereCaseText = base.prepare('INSERT INTO case_text (caseid, fid, pos0, pos1, owner, date, memo) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const caseIds = new Map<string, number>()
    modele.cases.forEach((cas, index) => {
      const caseid = index + 1
      caseIds.set(cas.id, caseid)
      insereCase.run(caseid, cas.nom, cas.memo, cas.owner, date)
    })
    for (const cas of modele.cases) {
      const caseid = invalide(caseIds, cas.id, 'cas')
      for (const passage of cas.passages) {
        const fid = invalide(sourceIds, passage.sourceId, 'source')
        if (passage.to <= passage.from) continue
        insereCaseText.run(caseid, fid, passage.from, passage.to, cas.owner, date, passage.provenance)
      }
    }

    base.exec('COMMIT')
  } catch (erreur) {
    try { base.exec('ROLLBACK') } catch { /* la transaction peut déjà être annulée */ }
    throw erreur
  } finally {
    base.close()
  }
}

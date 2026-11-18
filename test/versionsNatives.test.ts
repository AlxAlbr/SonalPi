import { describe, expect, test } from 'vitest'
import { FORMAT_VERSION } from '../src/shared/format'
import { classifierCorpus } from '../src/shared/ouvertureFichier'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { verifierVersionNative, versionNativeReconnue } from '../src/shared/versionsNatives'

describe('versions natives et classification', () => {
  test('reconnaît le format actif et les formats encore migrés par l’ouverture', () => {
    expect(versionNativeReconnue(FORMAT_VERSION)).toBe(true)
    for (let version = 1; version <= FORMAT_VERSION; version++) {
      const corpus = { ...squeletteCorpus(), formatVersion: version }
      expect(() => verifierVersionNative(corpus, 'corpus')).not.toThrow()
      expect(classifierCorpus(JSON.stringify(corpus)).type).toBe('v2')
    }
  })

  test.each([0, FORMAT_VERSION + 1, 99, '9', null, undefined, NaN, 1.5])('refuse une version non reconnue : %s', (formatVersion) => {
    expect(versionNativeReconnue(formatVersion)).toBe(false)
    expect(() => verifierVersionNative({ formatVersion }, 'entretien')).toThrow(/Version native non supportée.*entretien/)
  })

  test('le marqueur des identités cibles interdit le repli vers V1', () => {
    expect(() => classifierCorpus(JSON.stringify({ locuteurs: {} }))).toThrow('Version')
    expect(() => classifierCorpus(JSON.stringify({ locuteurs: {}, tabEnt: [] }))).toThrow('ambigu')
    expect(classifierCorpus('{"tabEnt":[]}').type).toBe('v1')
  })
})

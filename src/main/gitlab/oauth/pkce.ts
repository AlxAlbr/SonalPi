/**
 *  Valeurs de preuve du flux Authorization Code + PKCE.
 *  State, verifier et challenge naissent ici, vivent en mémoire pendant
 *  l'échange du code et ne sont jamais journalisés ni écrits sur disque.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Verifier PKCE : 43 caractères base64url, la borne basse de GitLab. */
export function nouveauVerifierCode(): string {
  return randomBytes(32).toString('base64url')
}

/** Challenge S256 : BASE64URL(SHA256(verifier)). */
export function challengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

/** State anti-rejeu, propre à une tentative. */
export function nouvelEtat(): string {
  return randomBytes(24).toString('base64url')
}

/** Comparaison à temps constant, tolérante aux longueurs différentes. */
export function etatValide(attendu: string, recu: string | null): boolean {
  if (typeof recu !== 'string') return false
  const a = Buffer.from(attendu, 'utf8')
  const b = Buffer.from(recu, 'utf8')
  if (a.byteLength !== b.byteLength) return false
  return timingSafeEqual(a, b)
}

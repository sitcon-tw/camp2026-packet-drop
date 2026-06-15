function seededShuffle(arr: number[], seed: number): number[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Returns the fragment index (0–5) assigned to a given slot for a team+round
export function getFragmentIndex(teamNumber: number, round: number, slot: number): number {
  const seed = teamNumber * 7919 + round * 997
  const order = seededShuffle([0, 1, 2, 3, 4, 5], seed)
  return order[(slot - 1) % order.length]
}

const GARBLE = '█▓▒░▪◆▲●□■╳╬乱?!@#%'

// Deterministic corruption so text doesn't flicker on each poll
export function corruptText(text: string, seed: number): string {
  let s = seed
  return text
    .split('')
    .map((c) => {
      if (c === '\n') return c
      s = (s * 1664525 + 1013904223) & 0x7fffffff
      return s < 0x40000000 ? GARBLE[s % GARBLE.length] : c
    })
    .join('')
}

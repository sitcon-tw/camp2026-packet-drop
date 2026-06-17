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

// Returns the fragment index assigned to a given slot for a team+round.
// playerCount controls how many fragments exist (defaults to 6 for backwards compat).
export function getFragmentIndex(teamNumber: number, round: number, slot: number, playerCount = 6): number {
  const seed = teamNumber * 7919 + round * 997
  const indices = Array.from({ length: playerCount }, (_, i) => i)
  const order = seededShuffle(indices, seed)
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

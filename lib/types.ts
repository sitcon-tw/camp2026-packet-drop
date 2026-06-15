export type PlayerInfo = {
  slot: number
}

export type TeamStateData = {
  id: number
  number: number
  status: string
  round: number
  players: PlayerInfo[]
}

export type FragmentData = {
  slot: number
  seqIndex: number
  content: string
  isCorrupted: boolean
}

export type NoteFragmentData = {
  slot: number
  content: string
  isCorrupted: boolean
  position: number
}

export type ActiveAckData = {
  id: number
  affectedSlots: number[]
  ackSlots: number[]
  playerCount: number
}

export type GameStateData = {
  team: TeamStateData
  mySlot: number
  myFragment: FragmentData | null
  notes: {
    fragments: NoteFragmentData[]
    answer: string
  }
  activeAck: ActiveAckData | null
}

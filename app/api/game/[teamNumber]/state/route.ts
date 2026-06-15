import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPuzzleForRound } from '@/lib/puzzles'
import { getFragmentIndex, corruptText } from '@/lib/game-logic'

export async function GET(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)
  const url = new URL(req.url)
  const slot = parseInt(url.searchParams.get('slot') ?? '0')

  const team = await prisma.team.findUnique({
    where: { number: teamNumber },
    include: {
      players: { orderBy: { slot: 'asc' } },
      notes: {
        include: { fragments: { orderBy: { position: 'asc' } } },
      },
    },
  })

  if (!team || team.status === 'waiting') {
    return NextResponse.json({ error: 'Game not started' }, { status: 404 })
  }

  // Active (unresolved) packet loss event for current round
  const activeEvent = await prisma.packetLossEvent.findFirst({
    where: { teamId: team.id, round: team.round, resolvedAt: null },
  })

  const affectedSlots: number[] = activeEvent
    ? JSON.parse(activeEvent.affectedSlots)
    : []

  // My fragment for current round
  let myFragment = null
  if (slot >= 1 && slot <= 6 && team.status === 'playing') {
    const puzzle = getPuzzleForRound(team.round)
    const fragIdx = getFragmentIndex(teamNumber, team.round, slot)
    const frag = puzzle.fragments[fragIdx]
    const isCorrupted = affectedSlots.includes(slot)

    myFragment = {
      slot,
      seqIndex: frag.seqIndex,
      content: isCorrupted
        ? corruptText(frag.content, activeEvent!.id * 100 + slot)
        : frag.content,
      isCorrupted,
    }
  }

  // Notes for current round
  const currentNote = team.notes.find((n) => n.round === team.round)
  const noteFragments = (currentNote?.fragments ?? []).map((f) => {
    const isCorrupted = !!activeEvent && affectedSlots.includes(f.slot)
    return {
      slot: f.slot,
      content: isCorrupted
        ? corruptText(f.origContent, activeEvent!.id * 100 + f.slot)
        : f.origContent,
      isCorrupted,
      position: f.position,
    }
  })

  // ACK state
  let activeAck = null
  if (activeEvent) {
    activeAck = {
      id: activeEvent.id,
      affectedSlots: JSON.parse(activeEvent.affectedSlots),
      ackSlots: JSON.parse(activeEvent.ackSlots),
      playerCount: team.players.length,
    }
  }

  return NextResponse.json({
    team: {
      id: team.id,
      number: team.number,
      status: team.status,
      round: team.round,
      players: team.players.map((p: { slot: number }) => ({ slot: p.slot })),
    },
    mySlot: slot,
    myFragment,
    notes: {
      fragments: noteFragments,
      answer: currentNote?.answer ?? '',
    },
    activeAck,
  })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPuzzleForRound } from '@/lib/puzzles'
import { getFragmentIndex } from '@/lib/game-logic'

export async function POST(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const { slot } = await req.json()
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team || team.status !== 'playing') {
    return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  }

  // Block import when packet is corrupted
  const activeEvent = await prisma.packetLossEvent.findFirst({
    where: { teamId: team.id, round: team.round, resolvedAt: null },
  })
  if (activeEvent) {
    const affectedSlots: number[] = JSON.parse(activeEvent.affectedSlots)
    if (affectedSlots.includes(slot)) {
      return NextResponse.json({ error: 'Packet corrupted — ACK required before import' }, { status: 409 })
    }
  }

  const puzzle = getPuzzleForRound(team.round)
  const fragIdx = getFragmentIndex(teamNumber, team.round, slot)
  const frag = puzzle.fragments[fragIdx]

  const note = await prisma.teamNote.upsert({
    where: { teamId_round: { teamId: team.id, round: team.round } },
    create: { teamId: team.id, round: team.round },
    update: {},
    include: { fragments: true },
  })

  const existingFrag = note.fragments.find((f: { slot: number; position: number }) => f.slot === slot)
  const position = existingFrag ? existingFrag.position : note.fragments.length

  await prisma.noteFragment.upsert({
    where: { noteId_slot: { noteId: note.id, slot } },
    create: { noteId: note.id, slot, origContent: frag.content, position },
    update: { origContent: frag.content },
  })

  return NextResponse.json({ ok: true })
}

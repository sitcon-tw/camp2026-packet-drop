import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team || team.status !== 'playing') {
    return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  }

  const nextRound = team.round + 1
  const newStatus = nextRound > 3 ? 'finished' : 'playing'

  if (nextRound <= 3) {
    await prisma.teamNote.upsert({
      where: { teamId_round: { teamId: team.id, round: nextRound } },
      create: { teamId: team.id, round: nextRound },
      update: {},
    })
  }

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: { round: nextRound, status: newStatus },
    include: { players: { orderBy: { slot: 'asc' } } },
  })

  return NextResponse.json({
    team: {
      id: updated.id,
      number: updated.number,
      status: updated.status,
      round: updated.round,
      players: updated.players.map((p: { slot: number }) => ({ slot: p.slot })),
    },
  })
}

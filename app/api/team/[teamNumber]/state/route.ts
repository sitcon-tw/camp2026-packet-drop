import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({
    where: { number: teamNumber },
    include: {
      players: { orderBy: { slot: 'asc' } },
      notes: { select: { round: true, answer: true } },
    },
  })

  if (!team) {
    return NextResponse.json({
      team: {
        number: teamNumber,
        status: 'waiting',
        round: 0,
        players: [],
        currentAnswer: '',
        hasActiveLoss: false,
      },
    })
  }

  const currentNote = team.notes.find((n) => n.round === team.round)

  const activeEvent = team.status === 'playing'
    ? await prisma.packetLossEvent.findFirst({
        where: { teamId: team.id, round: team.round, resolvedAt: null },
        select: { id: true },
      })
    : null

  return NextResponse.json({
    team: {
      id: team.id,
      number: team.number,
      status: team.status,
      round: team.round,
      players: team.players.map((p: { slot: number }) => ({ slot: p.slot })),
      currentAnswer: currentNote?.answer ?? '',
      hasActiveLoss: !!activeEvent,
    },
  })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({
    where: { number: teamNumber },
    include: { players: { orderBy: { slot: 'asc' } } },
  })

  if (!team) {
    return NextResponse.json({
      team: { number: teamNumber, status: 'waiting', round: 0, players: [] },
    })
  }

  return NextResponse.json({
    team: {
      id: team.id,
      number: team.number,
      status: team.status,
      round: team.round,
      players: team.players.map((p) => ({ slot: p.slot })),
    },
  })
}

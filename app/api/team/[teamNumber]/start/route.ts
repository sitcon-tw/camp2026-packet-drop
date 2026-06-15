import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.status !== 'waiting')
    return NextResponse.json({ error: 'Already started' }, { status: 400 })

  // Pre-create note for round 1
  await prisma.teamNote.upsert({
    where: { teamId_round: { teamId: team.id, round: 1 } },
    create: { teamId: team.id, round: 1 },
    update: {},
  })

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: { status: 'playing', round: 1, startedAt: new Date() },
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

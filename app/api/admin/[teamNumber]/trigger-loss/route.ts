import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({
    where: { number: teamNumber },
    include: { players: true },
  })
  if (!team || team.status !== 'playing') {
    return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  }

  const existing = await prisma.packetLossEvent.findFirst({
    where: { teamId: team.id, round: team.round, resolvedAt: null },
  })
  if (existing) {
    return NextResponse.json({ error: 'Active event already exists' }, { status: 400 })
  }

  // Randomly affect 50–80% of player slots (minimum 1)
  const playerSlots = team.players.map((p) => p.slot)
  const shuffled = [...playerSlots].sort(() => Math.random() - 0.5)
  const affectCount = Math.max(1, Math.floor(shuffled.length * (0.5 + Math.random() * 0.3)))
  const affectedSlots = shuffled.slice(0, affectCount)

  const event = await prisma.packetLossEvent.create({
    data: {
      teamId: team.id,
      round: team.round,
      affectedSlots: JSON.stringify(affectedSlots),
      ackSlots: '[]',
    },
  })

  return NextResponse.json({ ok: true, event: { id: event.id, affectedSlots } })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const { slot } = await req.json()
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({
    where: { number: teamNumber },
    include: { players: true },
  })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const activeEvent = await prisma.packetLossEvent.findFirst({
    where: { teamId: team.id, round: team.round, resolvedAt: null },
  })
  if (!activeEvent)
    return NextResponse.json({ error: 'No active event' }, { status: 400 })

  const ackSlots: number[] = JSON.parse(activeEvent.ackSlots)
  if (!ackSlots.includes(slot)) ackSlots.push(slot)

  // Resolve if all players have ACK'd
  const allSlots = team.players.map((p) => p.slot)
  const allAcked = allSlots.every((s) => ackSlots.includes(s))

  await prisma.packetLossEvent.update({
    where: { id: activeEvent.id },
    data: {
      ackSlots: JSON.stringify(ackSlots),
      ...(allAcked ? { resolvedAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ ok: true, allAcked, ackSlots, totalPlayers: allSlots.length })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  await prisma.noteFragment.deleteMany({
    where: { note: { teamId: team.id } },
  })
  await prisma.teamNote.deleteMany({ where: { teamId: team.id } })
  await prisma.packetLossEvent.deleteMany({ where: { teamId: team.id } })
  await prisma.player.deleteMany({ where: { teamId: team.id } })

  await prisma.team.update({
    where: { id: team.id },
    data: { status: 'waiting', round: 0, startedAt: null },
  })

  return NextResponse.json({ ok: true })
}

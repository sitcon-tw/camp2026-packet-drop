import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const { answer } = await req.json()
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  await prisma.teamNote.upsert({
    where: { teamId_round: { teamId: team.id, round: team.round } },
    create: { teamId: team.id, round: team.round, answer },
    update: { answer },
  })

  return NextResponse.json({ ok: true })
}

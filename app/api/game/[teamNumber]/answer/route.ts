import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPuzzleForRound } from '@/lib/puzzles'

export async function POST(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const { answer } = await req.json()
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team || team.status !== 'playing')
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const puzzle = getPuzzleForRound(team.round)
  if (answer.trim() !== puzzle.answer.trim()) {
    return NextResponse.json({ ok: false, correct: false }, { status: 400 })
  }

  await prisma.teamNote.upsert({
    where: { teamId_round: { teamId: team.id, round: team.round } },
    create: { teamId: team.id, round: team.round, answer },
    update: { answer },
  })

  const nextRound = team.round + 1
  const newStatus = nextRound > 3 ? 'finished' : 'playing'

  if (nextRound <= 3) {
    await prisma.teamNote.upsert({
      where: { teamId_round: { teamId: team.id, round: nextRound } },
      create: { teamId: team.id, round: nextRound },
      update: {},
    })
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { round: nextRound, status: newStatus },
  })

  return NextResponse.json({ ok: true, correct: true })
}

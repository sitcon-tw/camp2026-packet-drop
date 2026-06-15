export type Fragment = {
  seqIndex: number
  content: string
}

export type Puzzle = {
  round: number
  title: string
  subtitle: string
  fragments: Fragment[]
  answer: string
  hint: string
}

export const PUZZLES: Puzzle[] = [
  {
    round: 1,
    title: '神秘顏色',
    subtitle: '推理出 A、B、C、D 四個袋子各裝什麼顏色的球',
    fragments: [
      {
        seqIndex: 0,
        content:
          '【封包 01/06】\n歡迎來到第一關！\n\n桌上有四個袋子：A、B、C、D，每個袋子裡各放一顆球。\n球的顏色分別是：紅色、藍色、黃色、綠色，每袋一種，不重複。',
      },
      {
        seqIndex: 1,
        content: '【封包 02/06】\n線索一：\n袋子 A 裡面的球，不是紅色，也不是藍色。',
      },
      {
        seqIndex: 2,
        content: '【封包 03/06】\n線索二：\n袋子 B 裡面的球，是綠色。',
      },
      {
        seqIndex: 3,
        content: '【封包 04/06】\n線索三：\n袋子 C 裡面的球，不是黃色。',
      },
      {
        seqIndex: 4,
        content: '【封包 05/06】\n線索四：\n袋子 D 裡面的球，不是綠色，也不是黃色。',
      },
      {
        seqIndex: 5,
        content:
          '【封包 06/06 ─ 問題】\n根據以上所有線索，推理出每個袋子裡是什麼顏色的球？\n\n格式：A=___色、B=___色、C=___色、D=___色\n\n提示：先確定 B，再用排除法。',
      },
    ],
    answer: 'A=黃色，B=綠色，C=紅色，D=藍色',
    hint: '先確定B=綠色，A不是紅也不是藍→A=黃，剩下CD排除',
  },
  {
    round: 2,
    title: '神秘數字',
    subtitle: '根據線索找出這個三位數',
    fragments: [
      {
        seqIndex: 0,
        content:
          '【封包 01/06】\n歡迎來到第二關！\n\n有一個三位數的神秘數字，三個數位都是 0 到 9 的整數。\n你們的任務是根據線索，找出這個三位數。',
      },
      {
        seqIndex: 1,
        content: '【封包 02/06】\n線索一：\n這個三位數的百位數是 2。',
      },
      {
        seqIndex: 2,
        content: '【封包 03/06】\n線索二：\n十位數是百位數的 3 倍。',
      },
      {
        seqIndex: 3,
        content: '【封包 04/06】\n線索三：\n個位數比十位數少 2。',
      },
      {
        seqIndex: 4,
        content: '【封包 05/06】\n線索四（驗算）：\n三個數位加起來，總和等於 12。',
      },
      {
        seqIndex: 5,
        content:
          '【封包 06/06 ─ 問題】\n根據以上所有線索，這個三位數是多少？\n\n提示：先用線索一和二求百位和十位，再用線索三求個位。\n\n請填入你們的答案！',
      },
    ],
    answer: '264',
    hint: '百位=2，十位=2×3=6，個位=6-2=4，驗算：2+6+4=12 ✓',
  },
  {
    round: 3,
    title: '職業推理',
    subtitle: '推理出小明、小華、小英各自的職業',
    fragments: [
      {
        seqIndex: 0,
        content:
          '【封包 01/06】\n歡迎來到第三關！\n\n三個好朋友：小明、小華、小英，分別從事三種不同的職業：醫生、老師、工程師。\n每個人的職業都不同。',
      },
      {
        seqIndex: 1,
        content: '【封包 02/06】\n線索一：\n小明不是醫生。',
      },
      {
        seqIndex: 2,
        content: '【封包 03/06】\n線索二：\n小華不是老師。',
      },
      {
        seqIndex: 3,
        content: '【封包 04/06】\n線索三：\n小英不是工程師。',
      },
      {
        seqIndex: 4,
        content: '【封包 05/06】\n線索四：\n小華也不是醫生。',
      },
      {
        seqIndex: 5,
        content:
          '【封包 06/06 ─ 問題】\n根據以上所有線索，推理出每個人的職業是什麼？\n\n格式：小明=___、小華=___、小英=___\n\n提示：先從線索二和四找出小華的職業。',
      },
    ],
    answer: '小明=老師，小華=工程師，小英=醫生',
    hint: '小華不是老師也不是醫生→小華=工程師，小英不是工程師+小明不是醫生→排列出來',
  },
]

export function getPuzzleForRound(round: number): Puzzle {
  const puzzle = PUZZLES.find((p) => p.round === round)
  if (!puzzle) throw new Error(`No puzzle for round ${round}`)
  return puzzle
}

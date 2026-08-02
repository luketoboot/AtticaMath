/**
 * What each mode expects of you, on demand.
 *
 * Every mode here teaches its rules by having you fail at them. That is fine
 * for meteors — type the answer, the answer is obvious — and hopeless for the
 * ones with a verb of their own. Kakooma asks you to find a relationship and
 * says so in eleven words along the bottom edge; Exercise has a dial, a bench
 * of bars, and two ways to be asked for a number. A player who misses the strip
 * has nowhere to look, and the cost of guessing wrong is charged in seconds.
 *
 * So: one key, one panel, per mode. Written as what to *do* rather than what
 * the mode *is* — a player opening this is stuck, not browsing.
 *
 * Data, not code, and keyed by scene so a mode cannot ship without an entry.
 */

export interface HelpLine {
  /** The key or gesture, if this line is about one. */
  key?: string;
  text: string;
}

export interface HelpPage {
  title: string;
  /** One line on what you are trying to do at all. */
  goal: string;
  lines: readonly HelpLine[];
  /** The thing players get wrong, said plainly. Omitted when there isn't one. */
  gotcha?: string;
  /**
   * Scene that shows the mode being played, for a mode where the rules are not
   * the hard part. A page can say what a cage is in one line and still leave a
   * player with no idea what a move looks like; when that is true, telling them
   * again in different words is not the fix, and this is the way out of the
   * panel rather than back to the grid they were stuck on.
   */
  walkthrough?: string;
}

export const HELP: Readonly<Record<string, HelpPage>> = {
  Game: {
    title: 'METEOR DEFENSE',
    goal: 'Answer the falling problems before they reach the ground.',
    lines: [
      { key: 'DIGITS', text: 'Type an answer. It fires the moment it matches a live meteor.' },
      { key: '—', text: 'There is no enter key. Do not look for one.' },
      { key: 'BACKSPACE', text: 'Clear what you have typed.' },
      { key: 'A / D', text: 'Move the cannon. Dodging matters once things start falling.' },
      { key: 'TAB', text: 'On-screen numpad, for keyboards without one.' },
    ],
    gotcha:
      'Typing digits no live answer even starts with costs stamina. Empty it and the buffer locks until it recovers — so spraying digits is not a strategy.',
  },
  Expression: {
    title: 'EXPRESSION BUILDER',
    goal: 'Build an expression from your hand that equals the falling target.',
    lines: [
      { key: 'DIGITS', text: 'Pick a chip from your hand by its number.' },
      { key: 'A S D F', text: 'Add an operator.' },
      { key: 'ENTER', text: 'Fire the expression you have built.' },
      { key: 'BACKSPACE', text: 'Take back the last thing you added.' },
      { key: 'Q', text: 'Scrap the selected chip for a fresh one, at a cost in seconds.' },
    ],
    gotcha:
      'Fewer chips scores better, and using different operators scores better again. If the puzzles are too big, LAUNCH from a smaller size — SHORT is two chips and one operator.',
  },
  Factor: {
    title: 'FACTOR STORM',
    goal: 'Split every rock down to primes by naming their factors.',
    lines: [
      { key: 'DIGITS', text: 'Type a factor of a rock. It splits into that factor and what is left.' },
      { key: 'W / S', text: 'Thrust and reverse.' },
      { key: 'A / D', text: 'Turn.' },
      { key: 'TAB', text: 'On-screen numpad.' },
    ],
    gotcha:
      'A prime cannot be split. Kill it by typing the number itself — that is the only thing it answers to.',
  },
  Collapse: {
    title: 'COLLAPSE',
    goal: 'Pair every fraction with the percentage that equals it. Both die.',
    lines: [
      { key: 'W / S', text: 'Thrust and reverse.' },
      { key: 'A / D', text: 'Turn.' },
      { key: 'SPACE', text: 'Fire at whatever is dead ahead.' },
      { key: 'SHIFT', text: 'Swap between the fraction gun and the percent gun.' },
    ],
    gotcha:
      'You pass straight through your own colour. Only the other gun can hurt you, and only the right gun can hit a target.',
  },
  Kakooma: {
    title: 'KAKOOMA',
    goal: 'In each cell of nine numbers, one is what two of the others make. Find it.',
    lines: [
      { key: 'NUMPAD', text: 'Pick a cell by where it sits — 7 is the top-left, 3 the bottom-right.' },
      { key: 'DIGITS', text: 'Then type the number you found. Its value, not its position.' },
      { key: 'ENTER', text: 'Commit a number that is the start of a longer one — the 2 in a cell holding 20.' },
      { key: 'BACKSPACE', text: 'Undo a digit, or let go of the cell.' },
      { key: 'CLICK', text: 'Or just click the number. Pointing works everywhere here.' },
    ],
    gotcha:
      'Solve all nine cells and the nine answers left standing are themselves a cell. That is the last puzzle of the grid.',
  },
  Exercise: {
    title: 'EXERCISE',
    goal: 'Solve it whole if you can. If you cannot, make it smaller until you can.',
    lines: [
      { key: 'DIGITS', text: 'Type the answer to the rung in the frame.' },
      { key: 'Q', text: 'Break it down — drop a place out of focus, so 679 + 834 becomes 670 + 830.' },
      { key: '—', text: 'Building back up happens on its own once you answer.' },
      { key: 'F', text: 'Show a five or ten frame for the column you are on.' },
      { key: 'ANY KEY', text: 'Skip an animation you have already understood.' },
    ],
    gotcha:
      'Nothing here is timed and nothing is lost by breaking a problem down. The mode measures how far out you had to go, and it is trying to become unnecessary.',
  },
  Cages: {
    title: 'CAGES',
    goal: 'On a 4x4, every row and column holds 1, 2, 3, 4 once — and every cage makes its target.',
    lines: [
      { key: '24×', text: 'A cage label. Those cells must multiply to 24. Also + and − and ÷.' },
      { key: '3', text: 'A label with no sign is a one-cell cage — that digit, given to you.' },
      { key: 'HOW', text: '24 over three cells is 2×3×4 and nothing else, so those are your digits.' },
      { key: 'ARROWS', text: 'Move around the grid. Clicking a cell works too.' },
      { key: 'DIGITS', text: 'Write a digit into the selected cell. BACKSPACE rubs it out.' },
      { key: 'E', text: 'Watch a whole puzzle worked out, one deduction at a time.' },
    ],
    gotcha:
      'A cage is only judged once every cell in it is filled, so a half-written one is never wrong. Start with the cage that has the fewest ways to be filled — it pins down the rows the others need.',
    walkthrough: 'CagesLearn',
  },
  Boss: {
    title: 'BOSS RUSH',
    goal: 'Chip the boss down with expressions, and block what it throws back.',
    lines: [
      { key: 'DIGITS', text: 'Pick a chip, or type into an incoming attack to block it.' },
      { key: 'A S D F', text: 'Add an operator.' },
      { key: 'ENTER', text: 'Fire.' },
    ],
    gotcha: 'An incoming attack takes your digits first. Block it, then go back to building.',
  },
};

/** The page for a scene, or undefined when that scene has none. */
export function helpFor(sceneKey: string): HelpPage | undefined {
  return HELP[sceneKey];
}

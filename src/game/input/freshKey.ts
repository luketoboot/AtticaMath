/**
 * Guards a keydown handler against Phaser redelivering the same DOM event.
 *
 * Phaser buffers keyboard events in a queue on the KeyboardManager, which each
 * scene's KeyboardPlugin drains on update and which is cleared separately on
 * POST_STEP. When several keys land inside one frame the queue can be drained
 * more than once before it is cleared, and every handler sees those events
 * again — the *same* event objects, interleaved with each other.
 *
 * It is not a rare edge: three keypresses inside a frame were observed
 * delivering five times. This game's core loop is typing multi-digit answers
 * fast, so "123" could append as "12123" and fire at the wrong answer.
 *
 * Each consumer needs its own gate — the buffer and the on-screen pad must both
 * see a given press exactly once. The set is weak so events are collectable.
 */
export function keyEventGate(): (event: KeyboardEvent) => boolean {
  const seen = new WeakSet<KeyboardEvent>();
  return (event) => {
    if (seen.has(event)) return false;
    seen.add(event);
    return true;
  };
}

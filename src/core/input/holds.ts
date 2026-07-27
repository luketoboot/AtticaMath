/**
 * Which on-screen buttons are being held, and by which finger.
 *
 * A touch player flies with one thumb and fires with the other, so more than
 * one control is down at once and each has to be released by the finger that
 * took it. Tracking a single "currently pressed" action would make thrust die
 * the moment the other thumb lifted off fire.
 *
 * The failure this exists to prevent is a stuck button. A finger that slides
 * off a control, a release that lands somewhere else on the canvas, a second
 * finger on a control the first is already holding — each is a way for a
 * control to stay down forever, and a ship that thrusts forever is unplayable.
 * So releases are addressed by pointer id, and a control stays down exactly as
 * long as at least one finger that pressed it has not lifted.
 *
 * Pure and boring on purpose: this is the part that has to be right.
 */

/** Actions to the pointer ids currently holding them. Empty lists are dropped. */
export type HoldMap = Readonly<Record<string, readonly number[]>>;

export const NO_HOLDS: HoldMap = {};

/** A finger goes down on a control. Pressing twice with the same finger is a no-op. */
export function press(map: HoldMap, action: string, pointerId: number): HoldMap {
  const current = map[action] ?? [];
  if (current.includes(pointerId)) return map;
  return { ...map, [action]: [...current, pointerId] };
}

/** One finger lifts off one control. Others holding it keep it down. */
export function release(map: HoldMap, action: string, pointerId: number): HoldMap {
  const current = map[action];
  if (!current || !current.includes(pointerId)) return map;
  const next = current.filter((id) => id !== pointerId);
  return withAction(map, action, next);
}

/**
 * A finger lifts anywhere at all, so it releases everything it was holding.
 *
 * This is the catch-all the scene wires to the canvas rather than to any
 * control: a release that happens off the button it started on never reaches
 * that button, and without this the control stays down.
 */
export function releasePointer(map: HoldMap, pointerId: number): HoldMap {
  let next = map;
  for (const action of Object.keys(map)) next = release(next, action, pointerId);
  return next;
}

/** Everything up — for a scene shutdown or a window that lost focus. */
export function releaseAll(): HoldMap {
  return NO_HOLDS;
}

export function isHeld(map: HoldMap, action: string): boolean {
  return (map[action]?.length ?? 0) > 0;
}

function withAction(map: HoldMap, action: string, ids: readonly number[]): HoldMap {
  const next: Record<string, readonly number[]> = { ...map };
  if (ids.length === 0) delete next[action];
  else next[action] = ids;
  return next;
}

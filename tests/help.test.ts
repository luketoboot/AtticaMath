import { describe, expect, it } from 'vitest';
import { HELP, helpFor } from '../src/core/help/help';

/**
 * Scene sources, read through Vite rather than node's fs — the project has no
 * node types on purpose, and this needs no dependency to avoid.
 */
const SCENE_SOURCE = import.meta.glob('../src/game/scenes/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function sourceOf(scene: string): string {
  const path = `../src/game/scenes/${scene}Scene.ts`;
  const found = SCENE_SOURCE[path];
  if (found === undefined) throw new Error(`no source for ${scene}Scene`);
  return found;
}

/** Scenes a player can be stuck inside. Boss is benched but still reachable in code. */
const PLAY_SCENES = [
  'Game',
  'Expression',
  'Factor',
  'Collapse',
  'Kakooma',
  'Cages',
  'Exercise',
  'Boss',
];

describe('mode briefings', () => {
  it('gives every playable mode a page', () => {
    for (const scene of PLAY_SCENES) {
      expect(helpFor(scene), `${scene} has no help page`).toBeDefined();
    }
  });

  it('leads with what you are trying to do', () => {
    for (const [scene, page] of Object.entries(HELP)) {
      expect(page.title.length, scene).toBeGreaterThan(0);
      expect(page.goal.length, scene).toBeGreaterThan(0);
      // A goal that runs long has stopped being a goal and become a rulebook.
      expect(page.goal.length, `${scene} goal is too long to read at a glance`).toBeLessThan(120);
      expect(page.lines.length, scene).toBeGreaterThan(1);
    }
  });

  it('fits the panel it is drawn into', () => {
    // The panel is fixed height and the rows are laid out at a fixed pitch, so
    // an over-long page would run off the bottom rather than scroll.
    for (const [scene, page] of Object.entries(HELP)) {
      expect(page.lines.length, `${scene} has too many rows for the panel`).toBeLessThanOrEqual(6);
      for (const line of page.lines) {
        expect(line.text.length, `${scene}: "${line.text}" wraps too far`).toBeLessThan(110);
      }
    }
  });

  it('opens on the same key in every mode that has a page', () => {
    // The whole value of one help key is that it is the same key. A mode that
    // forgot to wire it looks identical to one with nothing to say.
    for (const scene of PLAY_SCENES) {
      const source = sourceOf(scene);
      expect(source, `${scene}Scene does not open help`).toContain('keydown-H');
      expect(source, `${scene}Scene launches the wrong page`).toContain(`target: '${scene}'`);
    }
  });

  it('has no page for a scene that is not a mode', () => {
    expect(helpFor('Menu')).toBeUndefined();
    expect(helpFor('Shop')).toBeUndefined();
  });
});

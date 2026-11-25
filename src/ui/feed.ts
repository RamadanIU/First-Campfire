/**
 * The observer's event feed (step 1.6, GDD §11.4 «Летопись» in its first form): the latest
 * significant events of the world's journal, told for a viewer, each with the place it happened —
 * a click on a line flies the camera there.
 *
 * Significant for now: people came (the creation of the world), a villager starves or thirsts,
 * faints from want of sleep, dies — with the reason; the campfire is lit or goes out (step 1.9). The rest of the journal (the turn of days and
 * seasons, fireflies) is the rhythm of the world, not news.
 *
 * The journal only grows, so the feed reads each event once: `update` goes on from the last event
 * it saw (a loaded world of 200 years is read once, then a few events a day).
 */
import type { WorldEvent } from '../sim/events.ts';
import type { Sex } from '../sim/villagers.ts';
import type { World } from '../sim/world.ts';
import { feedText } from './texts.ts';

/** How many lines the feed keeps (the newest first). */
export const FEED_SIZE = 5;

export interface FeedEntry {
  /** Id of the event in the journal. */
  id: number;
  tick: number;
  type: WorldEvent['type'];
  /** The villager it is about (0 — none: the fire went out by itself). */
  villager: number;
  /** The line for the viewer: «Умерла женщина — голод». */
  text: string;
  /**
   * Where it happened (tile); null — the event has no place of its own (a need ran out): the
   * camera flies to the villager, if it is still alive.
   */
  place: { x: number; y: number } | null;
}

export interface Feed {
  /** The latest significant events, the newest first. */
  readonly entries: readonly FeedEntry[];
  /** Read the events added to the journal since the last call; true if the feed changed. */
  update(world: World): boolean;
}

export function createFeed(size = FEED_SIZE): Feed {
  let entries: FeedEntry[] = [];
  /** Id of the next event to read. */
  let next = 1;
  /** Who is who: the sex of every villager seen arriving (events of needs do not carry it). */
  const sexes = new Map<number, Sex>();

  return {
    get entries() {
      return entries;
    },
    update(world) {
      const list = world.events.list;
      if (list.length === 0 || list[list.length - 1]!.id < next) return false;
      // Ids are sequential from 1: the event with id `next` is at index next − 1.
      let start = next - 1;
      if (list[start]?.id !== next) start = list.findIndex((event) => event.id >= next);
      const added: FeedEntry[] = [];
      for (let i = Math.max(0, start); i < list.length; i++) {
        const event = list[i]!;
        const entry = toEntry(event, sexes);
        if (entry) added.push(entry);
      }
      next = list[list.length - 1]!.id + 1;
      if (added.length === 0) return false;
      entries = [...added.reverse(), ...entries].slice(0, size);
      return true;
    },
  };
}

/** A line of the feed for an event, or null if the event is not for the feed. */
function toEntry(event: WorldEvent, sexes: Map<number, Sex>): FeedEntry | null {
  switch (event.type) {
    case 'villager_arrived':
    case 'villager_fainted':
    case 'villager_died': {
      sexes.set(event.villager, event.sex);
      const text = feedText(event, event.sex);
      return text === null
        ? null
        : {
            id: event.id,
            tick: event.tick,
            type: event.type,
            villager: event.villager,
            text,
            place: { x: event.x, y: event.y },
          };
    }
    case 'fire_lit': {
      sexes.set(event.villager, event.sex);
      const text = feedText(event, event.sex);
      return text === null
        ? null
        : {
            id: event.id,
            tick: event.tick,
            type: event.type,
            villager: event.villager,
            text,
            place: { x: event.x, y: event.y },
          };
    }
    case 'fire_out': {
      const text = feedText(event, undefined);
      return text === null
        ? null
        : {
            id: event.id,
            tick: event.tick,
            type: event.type,
            villager: 0,
            text,
            place: { x: event.x, y: event.y },
          };
    }
    case 'need_ran_out': {
      const text = feedText(event, sexes.get(event.villager));
      return text === null
        ? null
        : {
            id: event.id,
            tick: event.tick,
            type: event.type,
            villager: event.villager,
            text,
            place: null,
          };
    }
    default:
      return null;
  }
}

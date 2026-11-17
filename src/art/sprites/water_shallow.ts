import { defineSprite } from '../sprite.ts';

/*
 * Shallow water near the bank: lighter, ripples with a glint at their crest. Same animation
 * rules as `water_deep`; where it meets land the compositor draws a line of foam.
 */
export default defineSprite({
  name: 'water_shallow',
  title: 'Мелкая вода',
  kind: 'tile',
  width: 16,
  height: 16,
  anchor: { x: 0, y: 0 },
  legend: {
    m: 'water.2',
    l: 'water.3',
    w: 'water.4',
  },
  animations: {
    idle: {
      frames: [
        `
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmllmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmlmllmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmllmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmlwwlmmmmmmm
        mmmmmmmmmmmmmmmm
        `,
        `
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmlwwlmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmllmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmlwwlmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmlmllmmmmmm
        mmmmmmmmmmmmmmmm
        `,
        `
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmlmllmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmlwwlmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmllmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmlmllmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        `,
        `
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmlmllmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmlwwlmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmmmmmmmmmmm
        mmmmmmllmmmmmmmm
        mmmmmmmmmmmmmmmm
        `,
      ],
      frameMs: 300,
    },
  },
});

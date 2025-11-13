import { BACKGROUNDS, type Background } from './types';

/**
 * Fisher-Yates shuffle algorithm
 * Randomly shuffles an array in place
 */
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Assign backgrounds to images with maximum diversity
 * - No repeats until all backgrounds are used
 * - Cycles through all backgrounds multiple times for large batches
 *
 * @param count - Number of images in the batch
 * @returns Array of backgrounds (one per image)
 *
 * @example
 * assignBackgrounds(5) // Returns 5 different backgrounds
 * assignBackgrounds(10) // Returns all 8 backgrounds + 2 random repeats
 * assignBackgrounds(100) // Cycles through backgrounds ~12.5 times
 */
export function assignBackgrounds(count: number): Background[] {
  const result: Background[] = [];

  while (result.length < count) {
    // Shuffle backgrounds array for each cycle
    const shuffled = shuffle([...BACKGROUNDS]);

    // Take as many as needed (up to count)
    const needed = count - result.length;
    const toAdd = shuffled.slice(0, Math.min(needed, shuffled.length));

    result.push(...toAdd);
  }

  return result;
}

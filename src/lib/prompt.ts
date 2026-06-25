import type { Demographic, Background } from './types';

/**
 * Get age description from age range string
 * Maps age ranges to descriptive labels for the prompt
 */
function getAgeDescription(ageRange: string): string {
  // Parse age range
  if (ageRange.includes('-')) {
    const [minStr, maxStr] = ageRange.split('-');
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    const avgAge = (min + max) / 2;

    if (avgAge < 1) return 'baby';
    if (avgAge <= 3) return 'toddler';
    if (avgAge <= 7) return 'young child';
    if (avgAge <= 12) return 'child';
    if (avgAge <= 17) return 'teenager';
    if (avgAge <= 29) return 'young adult';
    if (avgAge <= 59) return 'adult';
    return 'older adult';
  } else {
    // Single age
    const age = parseInt(ageRange, 10);
    if (age < 1) return 'baby';
    if (age <= 3) return 'toddler';
    if (age <= 7) return 'young child';
    if (age <= 12) return 'child';
    if (age <= 17) return 'teenager';
    if (age <= 29) return 'young adult';
    if (age <= 59) return 'adult';
    return 'older adult';
  }
}

/**
 * Get background description for prompt
 * Maps background types to descriptive phrases
 */
function getBackgroundDescription(background: Background): string {
  const descriptions: Record<Background, string> = {
    playground: 'colorful playground with swings and slides',
    beach: 'sandy beach with ocean in background',
    park: 'green park with trees and grass',
    backyard: 'suburban backyard with fence',
    sports_field: 'sports field with equipment',
    urban_plaza: 'modern urban plaza with buildings',
    garden: 'blooming garden with flowers',
    forest_trail: 'forest trail with natural surroundings',
  };

  return descriptions[background];
}

/**
 * Get variety descriptors for model appearances
 * Adds diversity to generated images based on index
 */
function getVarietyDescriptor(index: number): string {
  const descriptors = [
    'with diverse features',
    'with warm smile',
    'with cheerful expression',
    'with natural pose',
    'with authentic look',
    'with bright eyes',
  ];
  return descriptors[index % descriptors.length];
}

function isAdultAge(ageDescription: string): boolean {
  return (
    ageDescription === 'young adult' ||
    ageDescription === 'adult' ||
    ageDescription === 'older adult'
  );
}

function getModelDescription(
  demographic: Demographic,
  ageDescription: string
): string {
  switch (demographic) {
    case 'baby':
      return ageDescription === 'baby' ? 'baby' : `${ageDescription} baby`;
    case 'boy':
      return isAdultAge(ageDescription) ? `${ageDescription} man` : `${ageDescription} boy`;
    case 'girl':
      return isAdultAge(ageDescription) ? `${ageDescription} woman` : `${ageDescription} girl`;
    case 'man':
      return isAdultAge(ageDescription) ? `${ageDescription} man` : `${ageDescription} boy`;
    case 'woman':
      return isAdultAge(ageDescription) ? `${ageDescription} woman` : `${ageDescription} girl`;
  }
}

/**
 * Generate prompt for Seedream 4 Edit model
 * Creates a detailed prompt based on demographic, age range, background, and variety
 */
export function generatePrompt(
  demographic: Demographic,
  ageRange: string,
  background: Background,
  varietyIndex: number = 0
): string {
  const ageDescription = getAgeDescription(ageRange);
  const backgroundDescription = getBackgroundDescription(background);
  const varietyDescriptor = getVarietyDescriptor(varietyIndex);

  const modelDescription = getModelDescription(demographic, ageDescription);

  return `A ${modelDescription} ${varietyDescriptor} wearing the apparel item from the source image in ${backgroundDescription}. Photorealistic commercial ecommerce photography style. Natural lighting, keep the garment's design, colors, logos, fit, and textures faithful to the source image. The model should look natural, confident, and appropriate for the setting.`;
}

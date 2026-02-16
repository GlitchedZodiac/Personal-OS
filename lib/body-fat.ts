/**
 * Jackson-Pollock 3-Site Body Fat Estimation
 *
 * Uses skinfold caliper measurements (in mm) to estimate body density,
 * then converts to body fat percentage using the Siri equation.
 *
 * Male sites:   chest, abdomen, thigh
 * Female sites:  triceps, suprailiac, thigh
 */

export interface SkinfoldData {
  // Male 3-site
  chest?: number;    // mm
  abdomen?: number;  // mm
  // Female 3-site
  triceps?: number;  // mm
  suprailiac?: number; // mm
  // Shared
  thigh?: number;    // mm
  // Optional 7-site extras
  subscapular?: number;  // mm
  midaxillary?: number;  // mm
}

export type Gender = "male" | "female";

/**
 * Compute body fat % using Jackson-Pollock 3-site formula.
 * Returns null if required measurements are missing.
 */
export function computeBodyFat3Site(
  gender: Gender,
  age: number,
  skinfolds: SkinfoldData
): number | null {
  let sumOfSkinfolds: number;

  if (gender === "male") {
    if (
      skinfolds.chest == null ||
      skinfolds.abdomen == null ||
      skinfolds.thigh == null
    ) {
      return null;
    }
    sumOfSkinfolds = skinfolds.chest + skinfolds.abdomen + skinfolds.thigh;

    // Jackson-Pollock 3-site formula for men
    // Body density = 1.10938 - (0.0008267 × sum) + (0.0000016 × sum²) - (0.0002574 × age)
    const bodyDensity =
      1.10938 -
      0.0008267 * sumOfSkinfolds +
      0.0000016 * sumOfSkinfolds * sumOfSkinfolds -
      0.0002574 * age;

    // Siri equation: BF% = (495 / body density) - 450
    const bodyFatPct = 495 / bodyDensity - 450;
    return Math.round(bodyFatPct * 10) / 10;
  } else {
    if (
      skinfolds.triceps == null ||
      skinfolds.suprailiac == null ||
      skinfolds.thigh == null
    ) {
      return null;
    }
    sumOfSkinfolds = skinfolds.triceps + skinfolds.suprailiac + skinfolds.thigh;

    // Jackson-Pollock 3-site formula for women
    // Body density = 1.0994921 - (0.0009929 × sum) + (0.0000023 × sum²) - (0.0001392 × age)
    const bodyDensity =
      1.0994921 -
      0.0009929 * sumOfSkinfolds +
      0.0000023 * sumOfSkinfolds * sumOfSkinfolds -
      0.0001392 * age;

    const bodyFatPct = 495 / bodyDensity - 450;
    return Math.round(bodyFatPct * 10) / 10;
  }
}

/**
 * Caliper measurement site instructions.
 * Each site includes a description of where/how to measure.
 */
export interface SiteInstruction {
  id: keyof SkinfoldData;
  name: string;
  description: string;
  howTo: string;
  foldDirection: "vertical" | "diagonal" | "horizontal";
  genders: Gender[];
}

export const SKINFOLD_SITES: SiteInstruction[] = [
  {
    id: "chest",
    name: "Chest",
    description: "Midway between the armpit crease and the nipple.",
    howTo:
      "Pinch a diagonal fold of skin halfway between the front of the armpit and the nipple. For women, use one-third of the distance from the armpit crease to the nipple.",
    foldDirection: "diagonal",
    genders: ["male"],
  },
  {
    id: "abdomen",
    name: "Abdomen",
    description: "2 cm (about 1 inch) to the right of the navel.",
    howTo:
      "Pinch a vertical fold of skin approximately 2 cm to the right of the belly button. Make sure you grab only skin and fat, not muscle. Relax your abs while measuring.",
    foldDirection: "vertical",
    genders: ["male"],
  },
  {
    id: "triceps",
    name: "Triceps",
    description: "Back of the upper arm, midway between the shoulder and elbow.",
    howTo:
      "Let your arm hang relaxed at your side. Find the midpoint between the top of your shoulder (acromion) and the tip of your elbow (olecranon). Pinch a vertical fold at that midpoint on the back of the arm.",
    foldDirection: "vertical",
    genders: ["female"],
  },
  {
    id: "suprailiac",
    name: "Suprailiac",
    description: "Just above the hip bone, along the front of the body.",
    howTo:
      "Find the top of your hip bone (iliac crest) on the front/side of your body. Pinch a diagonal fold just above and slightly forward of the hip bone, following the natural angle of the iliac crest.",
    foldDirection: "diagonal",
    genders: ["female"],
  },
  {
    id: "thigh",
    name: "Thigh",
    description: "Front of the thigh, midway between the hip crease and kneecap.",
    howTo:
      "While standing, find the midpoint between the top of your kneecap and your hip crease (where your leg bends). Pinch a vertical fold at that midpoint on the front of the thigh. It helps to shift your weight to the other leg to relax the measured leg.",
    foldDirection: "vertical",
    genders: ["male", "female"],
  },
];

/**
 * Get the 3 relevant skinfold sites for a given gender.
 */
export function getSitesForGender(gender: Gender): SiteInstruction[] {
  return SKINFOLD_SITES.filter((site) => site.genders.includes(gender));
}

/**
 * Circumference measurement instructions.
 */
export interface CircumferenceSite {
  id: string;
  name: string;
  description: string;
  howTo: string;
}

export const CIRCUMFERENCE_SITES: CircumferenceSite[] = [
  {
    id: "neckCm",
    name: "Neck",
    description: "Around the mid-neck, below the Adam's apple.",
    howTo:
      "Stand upright and look straight ahead. Wrap the tape around the middle of your neck, just below the larynx (Adam's apple). Keep the tape level and snug, not compressing the skin.",
  },
  {
    id: "shouldersCm",
    name: "Shoulders",
    description: "Around the widest point of the shoulders.",
    howTo:
      "Stand with your arms relaxed at your sides. Wrap the tape around the broadest part of your shoulders/deltoids, keeping it level with the floor. Don't puff out your chest.",
  },
  {
    id: "chestCm",
    name: "Chest",
    description: "Around the widest part of the chest at nipple level.",
    howTo:
      "Stand with arms slightly away from your body. Wrap the tape around your chest at nipple level, keeping it parallel to the floor. Measure at the end of a normal exhale — don't flex or expand your chest.",
  },
  {
    id: "waistCm",
    name: "Waist",
    description: "Around the narrowest part of the torso, usually at the navel.",
    howTo:
      "Stand relaxed and find the narrowest part of your torso (typically at or just above the navel). Wrap the tape around, keeping it level and snug. Measure at the end of a normal exhale. Don't suck in your stomach.",
  },
  {
    id: "hipsCm",
    name: "Hips",
    description: "Around the widest point of the hips/glutes.",
    howTo:
      "Stand with feet together. Wrap the tape around the widest part of your hips and glutes, keeping it level with the floor. Look in a mirror from the side to ensure the tape isn't angled.",
  },
  {
    id: "armsCm",
    name: "Arms (Bicep)",
    description: "Around the largest part of the upper arm.",
    howTo:
      "Flex your arm at 90 degrees and make a fist. Wrap the tape around the largest part of your bicep/upper arm. For consistency, always measure the same arm (typically the dominant one). Also record relaxed if you want both.",
  },
  {
    id: "forearmsCm",
    name: "Forearms",
    description: "Around the widest part of the forearm.",
    howTo:
      "Extend your arm straight out with palm facing up. Wrap the tape around the thickest part of the forearm, usually a few centimeters below the elbow. Keep the tape snug but not tight.",
  },
  {
    id: "legsCm",
    name: "Thighs",
    description: "Around the largest part of the upper leg.",
    howTo:
      "Stand with feet slightly apart and weight evenly distributed. Wrap the tape around the thickest part of your thigh, just below the gluteal fold (where butt meets thigh). Keep the tape level.",
  },
  {
    id: "calvesCm",
    name: "Calves",
    description: "Around the widest part of the calf muscle.",
    howTo:
      "Stand with weight evenly distributed. Wrap the tape around the widest part of the calf. It helps to measure while standing on a step with the measured leg straight.",
  },
];

/**
 * Body fat category based on percentage and gender.
 */
export function getBodyFatCategory(
  bodyFatPct: number,
  gender: Gender
): { label: string; color: string } {
  if (gender === "male") {
    if (bodyFatPct < 6) return { label: "Essential", color: "text-red-400" };
    if (bodyFatPct < 14) return { label: "Athletic", color: "text-green-400" };
    if (bodyFatPct < 18) return { label: "Fitness", color: "text-blue-400" };
    if (bodyFatPct < 25) return { label: "Average", color: "text-amber-400" };
    return { label: "Above Average", color: "text-red-400" };
  } else {
    if (bodyFatPct < 14) return { label: "Essential", color: "text-red-400" };
    if (bodyFatPct < 21) return { label: "Athletic", color: "text-green-400" };
    if (bodyFatPct < 25) return { label: "Fitness", color: "text-blue-400" };
    if (bodyFatPct < 32) return { label: "Average", color: "text-amber-400" };
    return { label: "Above Average", color: "text-red-400" };
  }
}

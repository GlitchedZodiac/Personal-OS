// Canonical exercise catalog — the shared vocabulary for voice logging, PR
// tracking, the workout plan generator's imageKeys, and (soon) on-wrist
// logging in the watch app, which mirrors these ids in Swift. Kettlebell
// movements are first-class; aliases cover English + Spanish and common
// phrasing variants heard through transcription.

export type ExerciseCategory =
  | "kettlebell"
  | "barbell"
  | "dumbbell"
  | "bodyweight"
  | "machine"
  | "cardio"
  | "mobility";

/** Movement pattern — the randomiser balances a session across these. */
export type MovementPattern =
  | "hinge"
  | "squat"
  | "push"
  | "pull"
  | "carry"
  | "core"
  | "mobility"
  | "locomotion";

/**
 * How much the movement taxes grip and forearms. Two "high" movements
 * back to back is how an EMOM turns into a grip test instead of the
 * session it was meant to be — the randomiser spaces them out.
 */
export type GripDemand = "low" | "medium" | "high";

export interface ExerciseCoaching {
  /** One line on getting into position. */
  setup: string;
  /** What to feel / think about while doing it. */
  cues: string[];
  /** The usual ways it goes wrong. */
  avoid: string[];
}

export interface ExerciseDef {
  /** Canonical id (stable — stored in personal_records and synced to watch). */
  id: string;
  name: string;
  category: ExerciseCategory;
  aliases: string[];
  /** What you hold. Drives the weight picker's presets. */
  equipment?: "kettlebell" | "dumbbell" | "barbell" | "band" | "machine" | "none";
  /**
   * "either" = works with one bell or two (his double-KB work); "unilateral"
   * = inherently one side at a time and therefore logged per side.
   */
  laterality?: "bilateral" | "unilateral" | "either";
  pattern?: MovementPattern;
  grip?: GripDemand;
  /**
   * EMOM fitness. Slow, highly technical, or fatigue-sensitive lifts
   * (get-ups, windmills) are excluded from randomised minutes — they want
   * unhurried reps, not a clock.
   */
  emomSuitable?: boolean;
  /** Sensible reps for one EMOM minute, per side where unilateral. */
  emomReps?: number;
  coaching?: ExerciseCoaching;
}

/**
 * His kit, for the weight picker. Kettlebells are the ladder he owns;
 * dumbbells are a fixed pair.
 */
export const KETTLEBELL_WEIGHTS_KG = [16, 20, 24, 32] as const;
export const DUMBBELL_WEIGHT_KG = 17.5;

export function weightPresetsFor(def: ExerciseDef | null): number[] {
  if (!def) return [...KETTLEBELL_WEIGHTS_KG];
  if (def.equipment === "kettlebell") return [...KETTLEBELL_WEIGHTS_KG];
  if (def.equipment === "dumbbell") return [DUMBBELL_WEIGHT_KG];
  return [];
}

export const EXERCISE_CATALOG: ExerciseDef[] = [
  // ── Kettlebell ────────────────────────────────────────────────────────
  // Michael's staples carry full coaching; the randomiser reads pattern,
  // grip and emomSuitable off these entries.
  {
    id: "kb-swing", name: "Kettlebell Swing", category: "kettlebell",
    aliases: ["swing", "swings", "two hand swing", "russian swing", "american swing", "columpio", "balanceo", "kettlebell swings"],
    equipment: "kettlebell", laterality: "bilateral", pattern: "hinge", grip: "high",
    emomSuitable: true, emomReps: 20,
    coaching: {
      setup: "Bell a foot ahead of you, hinge and hike it back between the legs like a rugby pass.",
      cues: ["Snap the hips — the bell floats, you don't lift it", "Ribs down, glutes hard at the top", "Arms are ropes, shoulders packed"],
      avoid: ["Squatting it instead of hinging", "Leaning back at the top", "Letting the bell drop below the knees on the backswing"],
    },
  },
  {
    id: "kb-one-arm-swing", name: "One-Arm Kettlebell Swing", category: "kettlebell",
    aliases: ["one arm swing", "single arm swing", "one hand swing"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "hinge", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Same hinge as the two-hand swing, one hand on the horn, free arm mirroring.",
      cues: ["Resist the rotation — that's the whole point", "Thumb back on the backswing"],
      avoid: ["Letting the shoulder round forward", "Twisting the torso to chase the bell"],
    },
  },
  {
    id: "kb-goblet-squat", name: "Goblet Squat", category: "kettlebell",
    aliases: ["goblet squats", "sentadilla goblet", "sentadilla copa"],
    equipment: "kettlebell", laterality: "bilateral", pattern: "squat", grip: "medium",
    emomSuitable: true, emomReps: 15,
    coaching: {
      setup: "Bell by the horns at chest height, elbows tucked inside the knees.",
      cues: ["Sit between the hips, not back", "Elbows brush the inside of the knees at the bottom", "Chest tall — the bell is the counterweight"],
      avoid: ["Heels lifting", "Knees caving in", "Letting the bell drift away from the chest"],
    },
  },
  {
    id: "kb-turkish-get-up", name: "Turkish Get-Up", category: "kettlebell",
    aliases: ["tgu", "get up", "get ups", "turkish get ups", "turkish getup", "levantamiento turco"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "core", grip: "medium",
    // Deliberately excluded from randomised EMOMs: a get-up is a slow,
    // deliberate lift — a clock turns it into an injury.
    emomSuitable: false,
    coaching: {
      setup: "On your back, bell pressed straight up, same-side knee bent, free arm at 45°.",
      cues: ["Eyes on the bell until standing", "Roll to the elbow, then the hand — no shortcuts", "Every position is a position you could hold"],
      avoid: ["Rushing it", "A bent elbow under load", "Skipping the low sweep on the way down"],
    },
  },
  {
    id: "kb-clean", name: "Kettlebell Clean", category: "kettlebell",
    aliases: ["clean", "cleans", "cargada"],
    equipment: "kettlebell", laterality: "either", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "From the hike position, guide the bell up the body into the rack.",
      cues: ["Keep the bell close — it should feel like zipping a jacket", "Spear the hand through, don't let it flip over", "Land soft in the rack: forearm vertical, bell in the V of the arm"],
      avoid: ["Banging the wrist — that's a loose path, not a tough wrist", "Muscling it up with the arm"],
    },
  },
  {
    id: "kb-press", name: "Kettlebell Press", category: "kettlebell",
    aliases: ["kb press", "military press", "strict press", "overhead press kettlebell", "press militar", "kettlebell shoulder press"],
    equipment: "kettlebell", laterality: "either", pattern: "push", grip: "medium",
    emomSuitable: true, emomReps: 8,
    coaching: {
      setup: "From a solid rack, stack the bell over the shoulder and lock the body down.",
      cues: ["Squeeze the glutes and the opposite fist — tension travels", "Press around the head, not in front of it", "Finish with the biceps by the ear"],
      avoid: ["Leaning away from the bell", "Flaring the ribs to fake the lockout"],
    },
  },
  {
    id: "kb-clean-and-press", name: "Clean and Press", category: "kettlebell",
    aliases: ["clean & press", "clean press", "cleans and presses", "cargada y press"],
    equipment: "kettlebell", laterality: "either", pattern: "push", grip: "high",
    emomSuitable: true, emomReps: 8,
    coaching: {
      setup: "Clean to the rack, pause, then press — two lifts, not one swing.",
      cues: ["Reset the rack before every press", "Breathe at the rack, not mid-press"],
      avoid: ["Blurring the clean into the press and losing both"],
    },
  },
  {
    id: "kb-snatch", name: "Kettlebell Snatch", category: "kettlebell",
    aliases: ["snatch", "snatches", "arranque"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "A one-arm swing that keeps going — hinge, then punch through at the top.",
      cues: ["Punch the hand through as the bell passes the face", "High elbow early, then rotate around the hand", "Lockout is one smooth arc, arm by the ear"],
      avoid: ["Letting the bell flop onto the forearm", "Pulling with the arm instead of the hips", "Over-gripping the whole set"],
    },
  },
  {
    id: "kb-row", name: "Kettlebell Row", category: "kettlebell",
    aliases: ["kb row", "kettlebell bent over row", "single arm kettlebell row", "remo con pesa rusa"],
    equipment: "kettlebell", laterality: "either", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Hinge to roughly 45°, spine long, bell hanging under the shoulder.",
      cues: ["Lead with the elbow, finish at the hip", "Shoulder blade moves first, then the arm"],
      avoid: ["Twisting the torso to lift more", "Rowing to the armpit and shrugging"],
    },
  },
  {
    id: "kb-gorilla-row", name: "Gorilla Row", category: "kettlebell",
    aliases: ["gorilla rows", "gorilla", "double kettlebell row", "remo gorila"],
    equipment: "kettlebell", laterality: "bilateral", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Two bells between the feet, wide stance, hinge and hold one while rowing the other.",
      cues: ["The grounded bell is your brace — push into it", "Hips stay square; only the working arm moves"],
      avoid: ["Rotating the hips to help the row", "Standing too upright — the hinge is what makes it a row"],
    },
  },
  {
    id: "kb-renegade-row", name: "Renegade Row", category: "kettlebell",
    aliases: ["renegade rows", "plank row", "remo renegado"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 8,
    coaching: {
      setup: "Plank over two bells, feet wide for a stable base.",
      cues: ["Widen the feet until the hips stop wanting to twist", "Row without letting the opposite hip drop", "Squeeze the plank first, row second"],
      avoid: ["Hips rocking side to side", "Feet too close together", "Rowing fast and losing the plank"],
    },
  },
  {
    id: "kb-deadlift", name: "Kettlebell Deadlift", category: "kettlebell",
    aliases: ["kb deadlift", "kettlebell deadlifts", "deadlift", "deadlifts", "peso muerto"],
    equipment: "kettlebell", laterality: "either", pattern: "hinge", grip: "medium",
    emomSuitable: true, emomReps: 12,
    coaching: {
      setup: "Bell between the arches, hinge back until the handle is in reach.",
      cues: ["Push the floor away", "Long spine from head to tailbone", "Lats on — protect the shoulders"],
      avoid: ["Rounding at the bottom", "Yanking it off the floor"],
    },
  },
  {
    id: "kb-front-squat", name: "Kettlebell Front Squat", category: "kettlebell",
    aliases: ["double front squat", "front squat kettlebell", "sentadilla frontal"],
    equipment: "kettlebell", laterality: "either", pattern: "squat", grip: "medium",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Bells in the rack, elbows tight to the ribs.",
      cues: ["Keep the rack — the squat fails when the rack fails", "Breathe into the belt, not the chest"],
      avoid: ["Elbows drifting out", "Bells resting on the shoulders instead of the forearms"],
    },
  },
  {
    id: "kb-lunge", name: "Kettlebell Lunge", category: "kettlebell",
    aliases: ["kb lunge", "racked lunge", "zancada con pesa"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "squat", grip: "medium",
    emomSuitable: true, emomReps: 8,
    coaching: {
      setup: "Bell in the rack, step out to a comfortable stride.",
      cues: ["Down, not forward — the back knee drops straight", "Front shin near vertical"],
      avoid: ["Short steps that bake the knee", "Torso collapsing toward the loaded side"],
    },
  },
  {
    id: "kb-reverse-lunge", name: "Kettlebell Reverse Lunge", category: "kettlebell",
    aliases: ["reverse lunge", "reverse lunges", "backward lunge", "zancada inversa"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "squat", grip: "medium",
    emomSuitable: true, emomReps: 8,
    coaching: {
      setup: "Bell racked or goblet, step backwards rather than forwards.",
      cues: ["Kinder on the knees than a forward lunge — that's why it's here", "Weight stays on the front heel"],
      avoid: ["Reaching back too far", "Bouncing the back knee off the floor"],
    },
  },
  {
    id: "kb-halo", name: "Kettlebell Halo", category: "kettlebell",
    aliases: ["halo", "halos"],
    equipment: "kettlebell", laterality: "bilateral", pattern: "mobility", grip: "medium",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Bell upside down by the horns at chest height.",
      cues: ["Circle it close around the head", "Ribs stay down — the movement is shoulders, not spine"],
      avoid: ["Arching the low back to get it around", "Going faster than your shoulders allow"],
    },
  },
  {
    id: "kb-windmill", name: "Kettlebell Windmill", category: "kettlebell",
    aliases: ["windmill", "windmills", "molino"],
    equipment: "kettlebell", laterality: "unilateral", pattern: "core", grip: "medium",
    // Technical and slow — great movement, wrong thing to rush on a clock.
    emomSuitable: false,
    coaching: {
      setup: "Bell locked overhead, feet turned away from the bell side.",
      cues: ["Eyes on the bell", "Push the hip out sideways — it's a hinge, not a side bend", "Locked elbow the whole way"],
      avoid: ["Bending forward instead of hinging the hip", "Letting the overhead arm drift"],
    },
  },
  {
    id: "kb-farmer-carry", name: "Farmer Carry", category: "kettlebell",
    aliases: ["farmers carry", "farmer's carry", "farmers walk", "loaded carry", "caminata del granjero"],
    equipment: "kettlebell", laterality: "either", pattern: "carry", grip: "high",
    emomSuitable: true, emomReps: 40,
    coaching: {
      setup: "Pick the bells up properly — the carry starts at the deadlift.",
      cues: ["Tall, quiet steps", "Shoulders packed down, don't shrug"],
      avoid: ["Leaning back", "Letting the bells swing into the legs"],
    },
  },
  {
    id: "kb-push-press", name: "Kettlebell Push Press", category: "kettlebell",
    aliases: ["push press", "envión"],
    equipment: "kettlebell", laterality: "either", pattern: "push", grip: "medium",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "From the rack, a short dip of the knees drives the bell up.",
      cues: ["Dip is short and vertical", "Legs start it, arm finishes it"],
      avoid: ["Dipping into a squat", "Pressing before the drive"],
    },
  },
  {
    id: "kb-jerk", name: "Kettlebell Jerk", category: "kettlebell",
    aliases: ["jerk", "jerks", "long cycle", "kettlebell jerks"],
    equipment: "kettlebell", laterality: "either", pattern: "push", grip: "medium",
    emomSuitable: true, emomReps: 8,
    coaching: {
      setup: "Rack position, then a dip–drive–second dip under the bell.",
      cues: ["Two dips: one to launch, one to get under", "Catch with a locked arm, then stand"],
      avoid: ["Pressing it out — that's a push press, not a jerk", "Landing with a soft elbow"],
    },
  },
  {
    id: "kb-high-pull", name: "Kettlebell High Pull", category: "kettlebell",
    aliases: ["high pull", "high pulls"],
    equipment: "kettlebell", laterality: "either", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 12,
    coaching: {
      setup: "A swing that finishes with the elbow pulling high and wide.",
      cues: ["Hips first, elbow second", "Elbow above the wrist at the top"],
      avoid: ["Turning it into an upright row"],
    },
  },
  {
    id: "kb-thruster", name: "Kettlebell Thruster", category: "kettlebell",
    aliases: ["thruster", "thrusters"],
    equipment: "kettlebell", laterality: "either", pattern: "push", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Front squat straight into an overhead press, one continuous drive.",
      cues: ["Use the stand-up to launch the press", "Full lockout before the next rep"],
      avoid: ["Pausing at the top of the squat and losing the drive"],
    },
  },

  // ── Barbell / big lifts ───────────────────────────────────────────────
  { id: "bench-press", name: "Bench Press", category: "barbell", aliases: ["flat bench", "barbell bench press", "press de banca", "press banca"] },
  { id: "incline-press", name: "Incline Press", category: "barbell", aliases: ["incline bench", "incline bench press", "press inclinado"] },
  { id: "back-squat", name: "Squat", category: "barbell", aliases: ["barbell squat", "back squat", "squats", "sentadilla", "sentadillas"] },
  { id: "front-squat", name: "Front Squat", category: "barbell", aliases: ["barbell front squat"] },
  { id: "deadlift", name: "Barbell Deadlift", category: "barbell", aliases: ["conventional deadlift", "barbell deadlift", "peso muerto con barra"] },
  { id: "romanian-deadlift", name: "Romanian Deadlift", category: "barbell", aliases: ["rdl", "romanian", "peso muerto rumano"] },
  { id: "overhead-press", name: "Overhead Press", category: "barbell", aliases: ["ohp", "barbell shoulder press", "press militar con barra"] },
  { id: "barbell-row", name: "Barbell Row", category: "barbell", aliases: ["barbell bent over row", "remo con barra"] },
  { id: "hip-thrust", name: "Hip Thrust", category: "barbell", aliases: ["hip thrusts", "empuje de cadera"] },

  // ── Dumbbell (his pair is 17.5 kg each; upper body is the focus) ──────
  {
    id: "bicep-curl", name: "Bicep Curl", category: "dumbbell",
    aliases: ["curls", "dumbbell curl", "curl de bíceps", "curl"],
    equipment: "dumbbell", laterality: "either", pattern: "pull", grip: "medium",
    emomSuitable: true, emomReps: 12,
    coaching: {
      setup: "Standing tall, dumbbells at the sides, elbows pinned to the ribs.",
      cues: ["Elbows stay put — only the forearm moves", "Lower slower than you lift"],
      avoid: ["Swinging the torso to start the rep", "Elbows drifting forward"],
    },
  },
  {
    id: "hammer-curl", name: "Hammer Curl", category: "dumbbell",
    aliases: ["hammer curls", "curl martillo"],
    equipment: "dumbbell", laterality: "either", pattern: "pull", grip: "medium",
    emomSuitable: true, emomReps: 12,
    coaching: {
      setup: "Neutral grip, thumbs up, as if holding two hammers.",
      cues: ["Keep the wrist neutral throughout", "Hits the brachialis — kinder to cranky elbows"],
      avoid: ["Rotating into a normal curl halfway up"],
    },
  },
  {
    id: "db-chest-press", name: "Dumbbell Chest Press", category: "dumbbell",
    aliases: ["chest press", "dumbbell bench press", "db bench", "press de pecho"],
    equipment: "dumbbell", laterality: "bilateral", pattern: "push", grip: "low",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "On the bench or floor, dumbbells at the lower chest, elbows about 45° from the body.",
      cues: ["Shoulder blades pinned down and back", "Press slightly toward each other at the top"],
      avoid: ["Elbows flared to 90° — that's the shoulder-pain path", "Bouncing off the chest"],
    },
  },
  {
    id: "db-shoulder-press", name: "Dumbbell Shoulder Press", category: "dumbbell",
    aliases: ["dumbbell shoulder press", "db shoulder press", "shoulder press", "seated shoulder press", "press de hombro con mancuernas"],
    equipment: "dumbbell", laterality: "either", pattern: "push", grip: "low",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Dumbbells at shoulder height, palms forward or slightly turned in.",
      cues: ["Ribs down — brace before you press", "Finish with the arms by the ears"],
      avoid: ["Arching the low back to move more weight", "Pressing forward instead of up"],
    },
  },
  {
    id: "db-incline-press", name: "Incline Dumbbell Press", category: "dumbbell",
    aliases: ["incline shoulder press", "incline dumbbell press", "incline press dumbbell", "press inclinado con mancuernas"],
    equipment: "dumbbell", laterality: "bilateral", pattern: "push", grip: "low",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Bench at roughly 30–45°, dumbbells at the upper chest.",
      cues: ["Lower incline than you think — steep turns it into a shoulder press", "Elbows under the wrists"],
      avoid: ["Letting the bench angle creep up over sets"],
    },
  },
  {
    id: "db-row", name: "Dumbbell Row", category: "dumbbell",
    aliases: ["single arm dumbbell row", "one arm row", "dumbbell bent over row", "bent over row", "bent over rows", "db row", "remo con mancuerna"],
    equipment: "dumbbell", laterality: "unilateral", pattern: "pull", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "One hand and knee on the bench, or hinged and braced on a rack.",
      cues: ["Pull to the hip, not the armpit", "Let the shoulder blade travel at the bottom"],
      avoid: ["Rotating the torso open to finish the rep", "Yanking with the biceps"],
    },
  },
  {
    id: "lateral-raise", name: "Lateral Raise", category: "dumbbell",
    aliases: ["side raise", "lateral raises", "elevaciones laterales"],
    equipment: "dumbbell", laterality: "bilateral", pattern: "push", grip: "low",
    emomSuitable: true, emomReps: 15,
    coaching: {
      setup: "Light dumbbells, slight forward lean, tiny bend in the elbows.",
      cues: ["Lead with the elbows, not the hands", "Stop at shoulder height", "Light weight wins here"],
      avoid: ["Shrugging the traps to lift", "Swinging up with the hips"],
    },
  },
  {
    id: "tricep-extension", name: "Overhead Tricep Extension", category: "dumbbell",
    aliases: ["tricep extension", "tricep extensions", "triceps extension", "triceps extensions", "overhead extension", "overhead tricep extension", "extensión de tríceps"],
    equipment: "dumbbell", laterality: "bilateral", pattern: "push", grip: "medium",
    emomSuitable: true, emomReps: 12,
    coaching: {
      setup: "One dumbbell cupped in both hands, pressed overhead, then lowered behind the head.",
      cues: ["Elbows stay narrow and pointed up", "Stretch at the bottom — that's where triceps grow"],
      avoid: ["Elbows flaring wide", "Letting the low back arch as the weight goes back"],
    },
  },
  {
    id: "dumbbell-fly", name: "Dumbbell Fly", category: "dumbbell",
    aliases: ["flyes", "chest fly", "aperturas"],
    equipment: "dumbbell", laterality: "bilateral", pattern: "push", grip: "low",
    emomSuitable: false,
    coaching: {
      setup: "Lying down, soft elbows held at a fixed angle, arms opening wide.",
      cues: ["Hug a barrel", "The elbow angle never changes"],
      avoid: ["Turning it into a press", "Going so deep the shoulder takes the load"],
    },
  },
  {
    id: "db-lunge", name: "Dumbbell Lunge", category: "dumbbell",
    aliases: ["dumbbell lunges", "loaded lunge", "zancada con mancuernas"],
    equipment: "dumbbell", laterality: "unilateral", pattern: "squat", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "A dumbbell in each hand, hanging at the sides.",
      cues: ["Down, not forward", "Front shin near vertical"],
      avoid: ["Short strides that load the knee", "Leaning forward over the front leg"],
    },
  },
  {
    id: "db-reverse-lunge", name: "Dumbbell Reverse Lunge", category: "dumbbell",
    aliases: ["dumbbell reverse lunge", "reverse lunge dumbbell"],
    equipment: "dumbbell", laterality: "unilateral", pattern: "squat", grip: "high",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Dumbbells at the sides, step back into the lunge.",
      cues: ["Easier on the knees than stepping forward", "Push through the front heel to stand"],
      avoid: ["Letting the back foot land too far away"],
    },
  },

  // ── Bodyweight ────────────────────────────────────────────────────────
  { id: "pull-up", name: "Pull-Up", category: "bodyweight", aliases: ["pullups", "pull ups", "chin up", "chin ups", "dominadas"] },
  { id: "push-up", name: "Push-Up", category: "bodyweight", aliases: ["pushups", "push ups", "flexiones", "lagartijas"] },
  { id: "dip", name: "Dip", category: "bodyweight", aliases: ["dips", "fondos"] },
  { id: "lunge", name: "Lunge", category: "bodyweight", aliases: ["lunges", "walking lunge", "zancadas", "estocadas"] },
  { id: "burpee", name: "Burpee", category: "bodyweight", aliases: ["burpees"] },
  { id: "crunch", name: "Crunch", category: "bodyweight", aliases: ["crunches", "abdominales", "sit up", "situps"] },

  // ── Machine / cable ───────────────────────────────────────────────────
  { id: "lat-pulldown", name: "Lat Pulldown", category: "machine", aliases: ["pulldown", "jalón al pecho", "jalon"] },
  { id: "seated-row", name: "Seated Row", category: "machine", aliases: ["cable row", "remo sentado"] },
  { id: "leg-press", name: "Leg Press", category: "machine", aliases: ["prensa", "prensa de piernas"] },
  { id: "leg-curl", name: "Leg Curl", category: "machine", aliases: ["hamstring curl", "curl femoral"] },
  { id: "leg-extension", name: "Leg Extension", category: "machine", aliases: ["extensiones de pierna"] },
  { id: "calf-raise", name: "Calf Raise", category: "machine", aliases: ["calf raises", "elevación de talones", "pantorrillas"] },
  { id: "cable-fly", name: "Cable Fly", category: "machine", aliases: ["cable crossover", "cruce de poleas"] },
  { id: "face-pull", name: "Face Pull", category: "machine", aliases: ["face pulls"] },

  // ── Cardio / locomotion (walk today, hikes and runs incoming) ─────────
  {
    id: "walk", name: "Walk", category: "cardio",
    aliases: ["walking", "walks", "caminata", "caminar", "treadmill walk", "under desk treadmill", "desk treadmill"],
    equipment: "none", pattern: "locomotion", grip: "low", emomSuitable: false,
    coaching: {
      setup: "Flat ground or the under-desk treadmill — the daily baseline, not a session to brace for.",
      cues: ["Nose-breathing pace: you could hold a conversation", "Volume over intensity"],
      avoid: ["Chasing pace on what should be recovery"],
    },
  },
  {
    id: "hike", name: "Hike", category: "cardio",
    aliases: ["hiking", "trail", "trail hike", "mountain hike", "senderismo", "caminata de montaña"],
    equipment: "none", pattern: "locomotion", grip: "low", emomSuitable: false,
    coaching: {
      setup: "Elevation is the point — this is training, not a walk with a view.",
      cues: ["Shorten the stride going up, let the legs turn over", "Control the descent — that's where the soreness comes from"],
      avoid: ["Starting too hard on the first climb", "Under-eating on long days"],
    },
  },
  {
    id: "run", name: "Run", category: "cardio",
    aliases: ["running", "runs", "jog", "jogging", "correr", "carrera", "trote"],
    equipment: "none", pattern: "locomotion", grip: "low", emomSuitable: false,
    coaching: {
      setup: "Start with run/walk intervals — the aerobic base arrives long before the legs are ready for continuous running.",
      cues: ["Easy means easy: conversational, most of the time", "Land under the hips, quick light steps"],
      avoid: ["Adding distance and pace in the same week", "Treating every run as a test"],
    },
  },

  // ── Mobility / prehab (the warm-up and wind-down pool) ────────────────
  {
    id: "band-pull-apart", name: "Band Pull-Apart", category: "mobility",
    aliases: ["band pull aparts", "pull apart", "band work", "banda"],
    equipment: "band", laterality: "bilateral", pattern: "pull", grip: "low",
    emomSuitable: true, emomReps: 15,
    coaching: {
      setup: "Band at chest height, arms straight, hands just wider than the shoulders.",
      cues: ["Pull the band apart with the shoulder blades", "Slow on the way back"],
      avoid: ["Shrugging", "Bending the elbows to cheat range"],
    },
  },
  {
    id: "shoulder-dislocate", name: "Shoulder Pass-Through", category: "mobility",
    aliases: ["shoulder dislocates", "pass through", "stick pass through", "shoulder stretch", "scapular opener", "broomstick shoulder"],
    equipment: "band", laterality: "bilateral", pattern: "mobility", grip: "low",
    emomSuitable: true, emomReps: 10,
    coaching: {
      setup: "Stick or band held wide, arms straight, sweep it overhead and behind.",
      cues: ["Go wider than feels necessary, then narrow over weeks", "Straight arms the whole way"],
      avoid: ["Bending the elbows to get it round", "Forcing the end range"],
    },
  },
  {
    id: "clamshell", name: "Clamshell", category: "mobility",
    aliases: ["clamshells", "clam shell", "almeja"],
    equipment: "band", laterality: "unilateral", pattern: "mobility", grip: "low",
    emomSuitable: true, emomReps: 15,
    coaching: {
      setup: "On your side, knees bent and stacked, band above the knees.",
      cues: ["Hips stay stacked — no rolling back", "Feel it in the side of the glute"],
      avoid: ["Rotating the pelvis to open further"],
    },
  },
  {
    id: "plank", name: "Plank", category: "bodyweight",
    aliases: ["planks", "plancha", "front plank"],
    equipment: "none", laterality: "bilateral", pattern: "core", grip: "low",
    emomSuitable: true, emomReps: 40,
    coaching: {
      setup: "Forearms under the shoulders, body in one line.",
      cues: ["Squeeze glutes and quads — a plank is a whole-body brace", "Tuck the ribs toward the hips"],
      avoid: ["Hips sagging or piking", "Holding your breath"],
    },
  },
  {
    id: "reverse-plank", name: "Reverse Plank", category: "bodyweight",
    aliases: ["reverse planks", "back plank", "plancha inversa"],
    equipment: "none", laterality: "bilateral", pattern: "core", grip: "low",
    emomSuitable: true, emomReps: 30,
    coaching: {
      setup: "Seated, hands behind the hips, drive the hips up into a straight line.",
      cues: ["Open the chest — the antidote to a desk day", "Squeeze the glutes hard"],
      avoid: ["Letting the head drop back", "Hips sagging toward the floor"],
    },
  },
];

const ACCENT_RE = /[̀-ͯ]/g;

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENT_RE, "")
    .replace(/[-_]/g, " ") // "get-ups" and "get ups" are the same movement
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IndexEntry {
  key: string;
  def: ExerciseDef;
}

let index: IndexEntry[] | null = null;

function buildIndex(): IndexEntry[] {
  if (index) return index;
  const entries: IndexEntry[] = [];
  for (const def of EXERCISE_CATALOG) {
    entries.push({ key: fold(def.name), def });
    entries.push({ key: def.id, def });
    entries.push({ key: fold(def.id), def });
    for (const alias of def.aliases) entries.push({ key: fold(alias), def });
  }
  // Longest keys first so "clean and press" wins over "clean" on substring
  // passes.
  entries.sort((a, b) => b.key.length - a.key.length);
  index = entries;
  return entries;
}

/**
 * Map a free-text exercise name (typed, spoken EN/ES, or AI-generated) to a
 * catalog entry. Exact fold-match first, then whole-word containment.
 * Returns null for unknown movements — callers keep the raw name.
 */
export function normalizeExerciseName(raw: string): ExerciseDef | null {
  const folded = fold(raw);
  if (!folded) return null;

  const entries = buildIndex();
  for (const entry of entries) {
    if (entry.key === folded) return entry.def;
  }
  for (const entry of entries) {
    if (entry.key.length < 4) continue;
    if (new RegExp(`(^|\\s)${entry.key}($|\\s)`).test(folded)) return entry.def;
  }
  return null;
}

export function getExerciseById(id: string): ExerciseDef | null {
  return EXERCISE_CATALOG.find((e) => e.id === id) ?? null;
}

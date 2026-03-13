-- Reconcile additional health data that was accidentally written to the public
-- schema during the earlier schema-targeting issue. Safe to re-run.

insert into doctor_demo.body_measurements (
  id,
  "measuredAt",
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "chestCm",
  "armsCm",
  "legsCm",
  "hipsCm",
  "shouldersCm",
  "neckCm",
  "forearmsCm",
  "calvesCm",
  "skinfoldData",
  notes,
  bmi,
  "fatFreeWeightKg",
  "subcutaneousFatPct",
  "visceralFat",
  "bodyWaterPct",
  "skeletalMusclePct",
  "muscleMassKg",
  "boneMassKg",
  "proteinPct",
  "bmrKcal",
  "metabolicAge",
  "heartRateBpm",
  source,
  "createdAt",
  "updatedAt"
)
select
  p.id,
  p."measuredAt",
  p."weightKg",
  p."bodyFatPct",
  p."waistCm",
  p."chestCm",
  p."armsCm",
  p."legsCm",
  p."hipsCm",
  p."shouldersCm",
  p."neckCm",
  p."forearmsCm",
  p."calvesCm",
  p."skinfoldData",
  p.notes,
  p.bmi,
  p."fatFreeWeightKg",
  p."subcutaneousFatPct",
  p."visceralFat",
  p."bodyWaterPct",
  p."skeletalMusclePct",
  p."muscleMassKg",
  p."boneMassKg",
  p."proteinPct",
  p."bmrKcal",
  p."metabolicAge",
  p."heartRateBpm",
  p.source,
  p."createdAt",
  p."updatedAt"
from public.body_measurements p
where not exists (
  select 1
  from doctor_demo.body_measurements d
  where d.id = p.id
)
on conflict (id) do nothing;

insert into doctor_demo.ai_conversations (
  id,
  "userMessage",
  "aiResponse",
  "actionTaken",
  "extractedData",
  "createdAt"
)
select
  p.id,
  p."userMessage",
  p."aiResponse",
  p."actionTaken",
  p."extractedData",
  p."createdAt"
from public.ai_conversations p
where not exists (
  select 1
  from doctor_demo.ai_conversations d
  where d.id = p.id
)
on conflict (id) do nothing;

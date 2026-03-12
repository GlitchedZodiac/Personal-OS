-- Reconcile rows accidentally written to the public schema while DATABASE_URL
-- included an invalid schema suffix. This is safe to re-run.

insert into doctor_demo.food_logs (
  id,
  "loggedAt",
  "mealType",
  "foodDescription",
  calories,
  "proteinG",
  "carbsG",
  "fatG",
  notes,
  source,
  "createdAt",
  "updatedAt"
)
select
  p.id,
  p."loggedAt",
  p."mealType",
  p."foodDescription",
  p.calories,
  p."proteinG",
  p."carbsG",
  p."fatG",
  p.notes,
  p.source,
  p."createdAt",
  p."updatedAt"
from public.food_logs p
where not exists (
  select 1
  from doctor_demo.food_logs d
  where d.id = p.id
)
on conflict (id) do nothing;

insert into doctor_demo.workout_logs (
  id,
  "startedAt",
  "endedAt",
  "durationMinutes",
  "workoutType",
  description,
  "caloriesBurned",
  "distanceMeters",
  "stepCount",
  "avgHeartRateBpm",
  "maxHeartRateBpm",
  "elevationGainM",
  "routeData",
  "metricsData",
  "deviceType",
  "externalSource",
  "externalId",
  "syncStatus",
  exercises,
  "stravaActivityId",
  source,
  "createdAt",
  "updatedAt"
)
select
  p.id,
  p."startedAt",
  null,
  p."durationMinutes",
  p."workoutType",
  p.description,
  p."caloriesBurned",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  case
    when coalesce(p."stravaActivityId", '') <> '' then 'strava'
    else null
  end,
  p."stravaActivityId",
  'synced',
  p.exercises,
  p."stravaActivityId",
  p.source,
  p."createdAt",
  p."updatedAt"
from public.workout_logs p
where not exists (
  select 1
  from doctor_demo.workout_logs d
  where d.id = p.id
)
and not exists (
  select 1
  from doctor_demo.workout_logs d
  where coalesce(p."stravaActivityId", '') <> ''
    and d."stravaActivityId" = p."stravaActivityId"
)
and not exists (
  select 1
  from doctor_demo.workout_logs d
  where coalesce(p."stravaActivityId", '') = ''
    and d."startedAt" = p."startedAt"
    and d."workoutType" = p."workoutType"
    and coalesce(d."durationMinutes", 0) = coalesce(p."durationMinutes", 0)
    and coalesce(d.source, '') = coalesce(p.source, '')
)
on conflict (id) do nothing;

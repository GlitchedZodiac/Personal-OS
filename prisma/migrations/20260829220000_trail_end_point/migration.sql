-- Direction-aware trail matching: the trail's end point joins its start.
ALTER TABLE "trails" ADD COLUMN "endLat" DOUBLE PRECISION;
ALTER TABLE "trails" ADD COLUMN "endLng" DOUBLE PRECISION;

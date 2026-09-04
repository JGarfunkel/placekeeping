-- Phase 2 of local/reclassification-migration.md: swap spots.purpose from
-- the old Function vocabulary to the new one. Generic and environment-
-- independent (unlike Phase 3's per-spot focus/setting review, which is
-- data-specific and deliberately never a numbered migration -- see that
-- doc's Phase 3 section).
UPDATE spots SET purpose = CASE purpose
  WHEN 'garden'    THEN 'cultivated'
  WHEN 'wild_area' THEN 'wild'
  WHEN 'monument'  THEN 'built'
  WHEN 'island'    THEN 'edge'
  ELSE purpose END;

-- Contract step: relocate is replaced by structured work locations
-- (20261108000800) and work_style (20261108000850).
-- No deployed code reads profiles.relocate: Phase 2 has not been deployed to
-- production, and prod main (Phase 1) never wrote it.
-- The column-level grant on relocate is dropped together with the column.

alter table public.profiles drop column relocate;
drop type public.relocate_pref;

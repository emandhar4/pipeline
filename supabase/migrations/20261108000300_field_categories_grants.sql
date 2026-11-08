-- Tighten field_categories: read-only for authenticated, nothing for anon.
revoke all on public.field_categories from anon, authenticated;
grant select on public.field_categories to authenticated;

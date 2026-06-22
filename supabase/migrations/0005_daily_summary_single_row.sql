-- Keep only the latest daily summary per user — drop per-date history.
drop index if exists public.daily_summaries_user_date_uidx;

-- Prune existing history down to one row per user before enforcing the new constraint.
delete from public.daily_summaries a
where a.id not in (
  select id from (
    select id, row_number() over (partition by user_id order by summary_date desc, created_at desc) as rn
    from public.daily_summaries
  ) ranked
  where ranked.rn = 1
);

create unique index daily_summaries_user_uidx on public.daily_summaries (user_id);

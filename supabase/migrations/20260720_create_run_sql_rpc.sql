create or replace function public.run_sql(
    query text
)
returns jsonb
language plpgsql
security definer
as $$
declare
    result jsonb;
begin
    execute format(
        'select jsonb_agg(t) from (%s) t',
        query
    )
    into result;

    return coalesce(result, '[]'::jsonb);
end;
$$;
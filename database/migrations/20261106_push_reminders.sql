-- Assignment reminder preferences, browser subscriptions, and durable delivery jobs.

create table if not exists notification_preferences (
  user_id integer primary key references app_user(user_id) on delete cascade,
  assignment_reminders_enabled boolean not null default true,
  reminder_minutes integer[] not null default array[180, 1440],
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '23:00',
  quiet_hours_end time not null default '08:00',
  timezone text not null default 'America/Denver',
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_minutes_valid check (
    cardinality(reminder_minutes) <= 20 and
    array_position(reminder_minutes, null) is null
  )
);

create table if not exists web_push_subscription (
  subscription_id bigserial primary key,
  user_id integer not null references app_user(user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_push_subscription_user_idx on web_push_subscription(user_id);

create table if not exists push_reminder_job (
  job_id bigserial primary key,
  assignment_id integer not null references assignment(assignment_id) on delete cascade,
  user_id integer not null references app_user(user_id) on delete cascade,
  reminder_minutes integer not null,
  due_at timestamptz not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (assignment_id, due_at, reminder_minutes)
);

create index if not exists push_reminder_job_due_idx
  on push_reminder_job(next_attempt_at, scheduled_at) where status = 'pending';

create table if not exists reminder_schedule_dirty (
  assignment_id integer primary key,
  requested_at timestamptz not null default now()
);

create or replace function enqueue_assignment_reminder_refresh()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from reminder_schedule_dirty where assignment_id = old.assignment_id;
    return old;
  end if;
  insert into reminder_schedule_dirty (assignment_id, requested_at)
  values (new.assignment_id, now())
  on conflict (assignment_id) do update set requested_at = excluded.requested_at;
  return new;
end;
$$;

drop trigger if exists assignment_reminder_refresh on assignment;
create trigger assignment_reminder_refresh
  after insert or update or delete on assignment
  for each row execute function enqueue_assignment_reminder_refresh();

create or replace function enqueue_category_reminder_refresh()
returns trigger language plpgsql as $$
begin
  insert into reminder_schedule_dirty (assignment_id, requested_at)
  select a.assignment_id, now()
    from assignment a
   where a.assignment_category_id = new.assignment_category_id
  on conflict (assignment_id) do update set requested_at = excluded.requested_at;
  return new;
end;
$$;

drop trigger if exists assignment_category_reminder_refresh on assignment_category;
create trigger assignment_category_reminder_refresh
  after update of is_included on assignment_category
  for each row execute function enqueue_category_reminder_refresh();

create or replace function enqueue_user_reminder_refresh()
returns trigger language plpgsql as $$
begin
  insert into reminder_schedule_dirty (assignment_id, requested_at)
  select a.assignment_id, now()
    from assignment a join course c on c.course_id = a.course_id
   where c.user_id = new.user_id
  on conflict (assignment_id) do update set requested_at = excluded.requested_at;
  return new;
end;
$$;

drop trigger if exists notification_preferences_reminder_refresh on notification_preferences;
create trigger notification_preferences_reminder_refresh
  after insert or update on notification_preferences
  for each row execute function enqueue_user_reminder_refresh();

-- Generate initial plans for assignments already in the database.
insert into reminder_schedule_dirty (assignment_id, requested_at)
select assignment_id, now() from assignment
on conflict (assignment_id) do update set requested_at = excluded.requested_at;

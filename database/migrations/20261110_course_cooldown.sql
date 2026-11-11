-- Sync cooldown clock per class. Set by a Sync now from the sidebar or
-- Settings; left alone by setup syncs (the quick start, the class modal's
-- Finish), so a student can sync right after setting up. last_synced_at keeps
-- recording every sync for the "synced N min ago" notes.

alter table course
  add column if not exists cooldown_synced_at timestamptz;

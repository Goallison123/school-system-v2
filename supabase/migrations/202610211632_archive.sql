-- Archive subfolder table
create table if not exists school_students_archive (
  id uuid primary key default gen_random_uuid(),
  original_id text not null,
  registry_code text,
  registration_number text,
  full_name text,
  parent_name text,
  email text,
  phone text,
  class_name text,
  stream text,
  fee_status text,
  fee_amount text,
  archived_at timestamptz default now(),
  archived_reason text,
  archived_by text,
  original_data jsonb
);

-- Enable RLS and allow same policies as school_students
alter table school_students_archive enable row level security;
create policy "Allow all for authenticated" on school_students_archive for all using (true) with check (true);
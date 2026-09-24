// College coach contacts. Mirrors public.coaches in the V1 migration.
export type Coach = {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  cell_phone: string | null;
  office_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

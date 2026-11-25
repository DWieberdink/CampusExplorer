export type CampusSeed = {
  unitid: string;
  opeid?: string | null;
  inst_name: string;
  system_name?: string | null;
  sector?: string | null;
  control?: string | null;
  state: string;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ccc_district?: string | null;
  ccc_college_code?: string | null;
  parent_unitid?: string | null;
  is_branch?: boolean;
  enabled?: boolean;
};

export type EnrollmentSeed = {
  unitid: string;
  year: number;
  headcount_total: number;
  headcount_ug?: number;
  headcount_grad?: number;
  headcount_ft?: number;
  headcount_pt?: number;
  fte_12mo?: number;
  source?: string;
};

/** data/seed/completions.json: {unitid: {year: {cip2: awards}}} (CIP family level). */
export type CompletionSeedMap = Record<string, Record<string, Record<string, number>>>;

export type SyncSummary = {
  mode: 'seed' | 'stub-download';
  upserted: number;
  wroteLocalMirror: boolean;
  hadErrors: boolean;
  notes: string[];
};

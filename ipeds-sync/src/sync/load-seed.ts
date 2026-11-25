import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SYNC_CONFIG } from '../config/sync-config.js';
import type { Logger } from '../lib/logger.js';
import type {
  CampusSeed,
  CompletionSeedMap,
  EnrollmentSeed,
  SyncSummary,
} from '../lib/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const seedDir = path.resolve(repoRoot, 'data/seed');

async function readJson<T>(name: string): Promise<T> {
  const raw = await readFile(path.join(seedDir, name), 'utf8');
  return JSON.parse(raw) as T;
}

async function upsertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  logger: Logger
): Promise<number> {
  if (!rows.length) return 0;
  const chunkSize = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase.from(table).upsert(chunk, {
      onConflict,
      count: 'exact',
    });
    if (error) {
      logger.error(`Upsert failed for ${table}`, { error: error.message });
      throw error;
    }
    total += count ?? chunk.length;
  }
  return total;
}

/**
 * Load committed seed JSON into Supabase (or dry-run counts when client is null).
 */
export async function loadSeed(options: {
  supabase: SupabaseClient | null;
  logger: Logger;
  dryRun?: boolean;
}): Promise<SyncSummary> {
  const { supabase, logger, dryRun } = options;
  const notes: string[] = [];
  notes.push(`Seed directory: ${seedDir}`);
  notes.push(`Configured sources: ${JSON.stringify(SYNC_CONFIG.sources)}`);

  const campuses = await readJson<CampusSeed[]>('campuses.json');
  const enrollment = await readJson<EnrollmentSeed[]>('enrollment.json');
  const completionMap = await readJson<CompletionSeedMap>('completions.json');
  const families = await readJson<Record<string, string>>('cip-families.json').catch(
    () => ({}) as Record<string, string>
  );
  const completions = Object.entries(completionMap).flatMap(([unitid, years]) =>
    Object.entries(years).flatMap(([year, fams]) =>
      Object.entries(fams).map(([cip2, awards]) => ({ unitid, year: Number(year), cip2, awards }))
    )
  );

  logger.info('Loaded seed JSON', {
    campuses: campuses.length,
    enrollment: enrollment.length,
    completions: completions.length,
  });

  if (!supabase || dryRun) {
    return {
      mode: 'seed',
      upserted: campuses.length + enrollment.length + completions.length,
      wroteLocalMirror: true,
      hadErrors: false,
      notes: [
        ...notes,
        'Dry-run / no Supabase client — seed files remain the offline UI source.',
      ],
    };
  }

  let upserted = 0;
  const now = new Date().toISOString();

  const syncRows = campuses.map((c) => ({
    unitid: c.unitid,
    inst_name: c.inst_name,
    state_code: c.state,
    system_name: c.system_name,
    ccc_district: c.ccc_district,
    ccc_college_code: c.ccc_college_code,
    enabled: c.enabled !== false,
    last_synced: now,
    notes: 'Loaded from data/seed',
  }));
  upserted += await upsertBatch(supabase, 'he_sync_campuses', syncRows, 'unitid', logger);

  const directoryRows = campuses.flatMap((c) =>
    SYNC_CONFIG.years.map((year) => ({
      unitid: c.unitid,
      year,
      inst_name: c.inst_name,
      opeid: c.opeid,
      system_name: c.system_name,
      sector: c.sector,
      control: c.control,
      state_code: c.state,
      city: c.city,
      latitude: c.latitude,
      longitude: c.longitude,
      ccc_district: c.ccc_district,
      ccc_college_code: c.ccc_college_code,
      parent_unitid: c.parent_unitid,
      is_branch: Boolean(c.is_branch),
      raw_data: { source: 'seed' },
      last_synced: now,
    }))
  );
  upserted += await upsertBatch(
    supabase,
    'he_campus_directory',
    directoryRows,
    'unitid,year',
    logger
  );

  const fallRows = enrollment.map((e) => ({
    unitid: e.unitid,
    year: e.year,
    headcount_total: e.headcount_total,
    headcount_ug: e.headcount_ug,
    headcount_grad: e.headcount_grad,
    headcount_ft: e.headcount_ft,
    headcount_pt: e.headcount_pt,
    raw_data: { source: e.source || 'seed' },
    last_synced: now,
  }));
  upserted += await upsertBatch(
    supabase,
    'he_enrollment_fall',
    fallRows,
    'unitid,year',
    logger
  );

  const activityRows = enrollment.map((e) => ({
    unitid: e.unitid,
    year: e.year,
    unduplicated_headcount: e.headcount_total,
    ftes: e.fte_12mo,
    raw_data: { source: e.source || 'seed' },
    last_synced: now,
  }));
  upserted += await upsertBatch(
    supabase,
    'he_enrollment_activity',
    activityRows,
    'unitid,year',
    logger
  );

  // Seed is CIP-family level: store the 2-digit family in cip6 with award_level 'all'.
  const completionRows = completions.map((c) => ({
    unitid: c.unitid,
    year: c.year,
    cip6: c.cip2,
    cip_title: families[c.cip2] ?? null,
    award_level: 'all',
    awards: c.awards,
    raw_data: { source: 'ipeds-c-family' },
    last_synced: now,
  }));
  upserted += await upsertBatch(
    supabase,
    'he_completions',
    completionRows,
    'unitid,year,cip6,award_level',
    logger
  );

  await supabase.from('he_sync_log').insert({
    unitid: null,
    dataset: 'seed',
    status: 'success',
    records_upserted: upserted,
    finished_at: now,
  });

  return {
    mode: 'seed',
    upserted,
    wroteLocalMirror: true,
    hadErrors: false,
    notes,
  };
}

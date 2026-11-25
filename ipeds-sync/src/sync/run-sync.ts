import type { SupabaseClient } from '@supabase/supabase-js';
import { SYNC_CONFIG } from '../config/sync-config.js';
import type { Logger } from '../lib/logger.js';
import type { SyncSummary } from '../lib/types.js';
import { loadSeed } from './load-seed.js';

/**
 * Stub for the production IPEDS Complete Data Files / Scorecard pipeline.
 *
 * Intended next steps (documented, not automated in MVP):
 * 1. Download HD, EF, E12/EFFY, C ZIPs for target years from NCES Complete Data Files.
 * 2. Unzip CSVs; filter rows to he_sync_campuses.unitid (or state/system discovery).
 * 3. Map columns → he_campus_directory / he_enrollment_* / he_completions.
 * 4. Upsert via service role; write he_sync_log.
 * 5. Later: CCC Data Mart FTES/headcount/awards-by-TOP overlays for CCC UNITIDs.
 */
export async function runSync(options: {
  supabase: SupabaseClient | null;
  logger: Logger;
  seedOnly?: boolean;
  dryRun?: boolean;
  unitid?: string;
}): Promise<SyncSummary> {
  const { supabase, logger, seedOnly, dryRun, unitid } = options;

  if (seedOnly || !supabase) {
    logger.info('Running seed load path', { seedOnly, hasClient: Boolean(supabase) });
    return loadSeed({ supabase, logger, dryRun });
  }

  logger.warn(
    'Full IPEDS ZIP download/parse is not implemented in this MVP stub. Loading seed into Supabase instead.',
    {
      years: SYNC_CONFIG.years,
      states: SYNC_CONFIG.states,
      unitid: unitid ?? 'all roster',
      portal: SYNC_CONFIG.sources.ipedsCompleteDataFiles,
    }
  );

  const summary = await loadSeed({ supabase, logger, dryRun });
  summary.mode = 'stub-download';
  summary.notes.push(
    'Replace stub with Complete Data Files ETL before nationwide loads.',
    'Next data load: CCC Data Mart FTES + awards by TOP for CA community colleges.'
  );
  return summary;
}

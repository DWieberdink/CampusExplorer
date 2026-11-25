import 'dotenv/config';
import { SYNC_CONFIG } from './config/sync-config.js';
import { createLogger } from './lib/logger.js';
import {
  createServiceClient,
  isSupabaseEnvConfigured,
} from './lib/supabase-client.js';
import { runSync } from './sync/run-sync.js';

function parseArgs(argv: string[]) {
  let unitid: string | undefined;
  let seedOnly = false;
  let dryRun = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--unitid' || arg === '-u') unitid = argv[++i];
    else if (arg === '--seed-only') seedOnly = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--verbose' || arg === '-v') verbose = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { unitid, seedOnly, dryRun, verbose };
}

function printHelp() {
  console.log(`IPEDS / Scorecard → Supabase sync (MVP stub)

Usage:
  npm run sync                 # Upsert seed (or stub) into Supabase when .env is set
  npm run sync:seed            # Same as --seed-only
  npm run sync -- --dry-run    # Count seed rows without writing
  npm run sync -- --unitid 110635

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Sources (download manually for production):
  IPEDS Complete Data Files  ${SYNC_CONFIG.sources.ipedsCompleteDataFiles}
  College Scorecard bulk     ${SYNC_CONFIG.sources.scorecardBulk}
  CCC Data Mart (next)       ${SYNC_CONFIG.sources.cccDataMart}
`);
}

async function main() {
  const { unitid, seedOnly, dryRun, verbose } = parseArgs(process.argv.slice(2));
  const logger = createLogger(verbose);

  const hasEnv = isSupabaseEnvConfigured();
  const supabase = hasEnv && !dryRun ? createServiceClient() : null;

  if (!hasEnv) {
    logger.warn('Supabase env not configured — running seed dry-run / local-only mode');
  }

  const summary = await runSync({
    supabase,
    logger,
    seedOnly: seedOnly || !hasEnv,
    dryRun: dryRun || !hasEnv,
    unitid,
  });

  logger.info('Sync finished', {
    mode: summary.mode,
    upserted: summary.upserted,
    hadErrors: summary.hadErrors,
    notes: summary.notes,
  });

  if (summary.hadErrors) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

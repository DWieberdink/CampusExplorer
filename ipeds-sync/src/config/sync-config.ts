/**
 * IPEDS / Scorecard sync configuration.
 *
 * Production path: download Complete Data Files from NCES Use the Data,
 * filter to roster UNITIDs, upsert into Supabase. The browser never calls
 * IPEDS or Scorecard directly.
 */
export const SYNC_CONFIG = {
  /** States represented in the top-20 systems HD seed (expand as roster grows). */
  states: ['AZ', 'CA', 'CO', 'FL', 'GA', 'KY', 'LA', 'MN', 'NC', 'NY', 'PA', 'TN', 'TX', 'VA'] as string[],
  /** Fall / academic years for EF, E12, C components. */
  years: [2019, 2020, 2021, 2022, 2023],
  /** Skip campuses synced within this many days (unless --force). */
  skipIfSyncedWithinDays: 30,
  /**
   * Official download portals (document for operators; stub does not scrape).
   * - IPEDS Complete Data Files: https://nces.ed.gov/IPEDS/use-the-data
   * - College Scorecard bulk: https://collegescorecard.ed.gov/data/
   * - CCC Data Mart (next load): https://datamart.cccco.edu/datamart.aspx
   */
  sources: {
    ipedsCompleteDataFiles: 'https://nces.ed.gov/IPEDS/use-the-data',
    scorecardBulk: 'https://collegescorecard.ed.gov/data/',
    cccDataMart: 'https://datamart.cccco.edu/datamart.aspx',
  },
  /** Relative path to committed seed JSON (repo root). */
  seedDir: '../data/seed',
} as const;

-- Data-only migration (M8 Part B, ADR 0004). No schema change: the
-- deposit_codes.kind enum keeps its "workbook" value for historical rows, so
-- drizzle-kit generate produces no diff and this file is hand-authored.
--
-- Pre-M8 workbook rewards were minted as kind = 'workbook' and redeemed on the
-- patient /submit-work screen, which M8 removes. Convert every UNUSED workbook
-- code to a check so it stays redeemable through "Deposit a Check." Already
-- used rows keep kind = 'workbook' as a historical record; no new 'workbook'
-- codes are minted after M8.
UPDATE "deposit_codes"
  SET "kind" = 'check'
  WHERE "kind" = 'workbook' AND "status" = 'unused';

import "dotenv/config";
import pool, { query } from "../server/db.js";
import { credentialContext, encryptCredential, isEncryptedCredential } from "../server/credentialCrypto.js";

async function encryptColumn({ select, update, idColumn, valueColumn, contextField }) {
  const { rows } = await query(select);
  let encrypted = 0;
  for (const row of rows) {
    const value = row[valueColumn];
    if (value == null || value === "" || isEncryptedCredential(value)) continue;
    const ciphertext = encryptCredential(value, credentialContext(contextField, row.user_id));
    const result = await query(update, [row[idColumn], value, ciphertext]);
    encrypted += result.rowCount;
  }
  return encrypted;
}

try {
  const canvas = await encryptColumn({
    select: "select connected_account_id, user_id, access_token from connected_account where access_token is not null",
    update: "update connected_account set access_token = $3 where connected_account_id = $1 and access_token = $2",
    idColumn: "connected_account_id",
    valueColumn: "access_token",
    contextField: "connected_account.access_token",
  });
  const feeds = await encryptColumn({
    select: "select course_id, user_id, ics_feed_url from course where ics_feed_url is not null",
    update: "update course set ics_feed_url = $3 where course_id = $1 and ics_feed_url = $2",
    idColumn: "course_id",
    valueColumn: "ics_feed_url",
    contextField: "course.ics_feed_url",
  });
  console.log(`Encrypted ${canvas} Canvas token(s) and ${feeds} iCalendar feed URL(s).`);
} catch (err) {
  console.error(`Credential encryption migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}


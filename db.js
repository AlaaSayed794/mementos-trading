require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // this is required for Supabase
});

(async () => {
  try {
    const client = await pool.connect();
    const res = await client.query("SELECT NOW()");
    console.log("DB Connected:", res.rows[0]);
    client.release();
  } catch (err) {
    console.error("DB connection error:", err);
  }
})();

async function addUserItems(userId, items) {
  if (!items || items.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stmt =
      "INSERT INTO user_items (user_id, item) VALUES ($1, $2) ON CONFLICT DO NOTHING";
    for (const item of items) {
      await client.query(stmt, [userId, item]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function removeUserItems(userId, items) {
  if (!items || items.length === 0) return;
  const q =
    "DELETE FROM user_items WHERE user_id = $1 AND item = ANY($2::int[])";
  await pool.query(q, [userId, items]);
}

async function getUserItemsMap() {
  // returns an object: { userId: { duplicates: [ints], requests: [ints] } }
  // But since we store only user_items (no type), we'll use two separate logical sets.
  // We'll keep semantics in index.js by storing duplicates and requests in the same table
  // by convention using negative offset? NO. We'll store both types in same table and
  // separate by user role in bot logic. For simplicity we query all items grouped by user.
  const res = await pool.query("SELECT user_id, item FROM user_items");
  const map = {};
  for (const row of res.rows) {
    const uid = row.user_id;
    if (!map[uid]) map[uid] = [];
    map[uid].push(row.item);
  }
  return map;
}

// But we need per-user requests vs duplicates: We'll store items with user_id only and
// keep a contract: index.js will call addUserItems for requests and duplicates into same table
// distinguishing by prefixing IDs? That's messy. Instead we'll store composite id in index.js:
// We'll use "user_id|R" or "user_id|D" for separation. So functions above must accept full userId.
// So keep generic functions above.

async function addUserItemsTyped(userKey, items) {
  if (!items || items.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stmt =
      "INSERT INTO user_items (user_id, item) VALUES ($1, $2) ON CONFLICT DO NOTHING";
    for (const item of items) {
      await client.query(stmt, [userKey, item]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function removeUserItemsTyped(userKey, items) {
  if (!items || items.length === 0) return;
  const q =
    "DELETE FROM user_items WHERE user_id = $1 AND item = ANY($2::int[])";
  await pool.query(q, [userKey, items]);
}

async function getAllUserItemsTyped() {
  const res = await pool.query("SELECT user_id, item FROM user_items");
  // user_id is stored as "12345|R" or "12345|D"
  const map = {}; // { userId: { requests:[], duplicates:[] } }
  for (const row of res.rows) {
    const [uid, typ] = row.user_id.split("|");
    if (!map[uid]) map[uid] = { requests: [], duplicates: [] };
    if (typ === "R") map[uid].requests.push(row.item);
    else if (typ === "D") map[uid].duplicates.push(row.item);
  }
  return map;
}

async function hasMatchKey(matchKey) {
  const res = await pool.query(
    "SELECT 1 FROM sent_matches WHERE match_key = $1",
    [matchKey]
  );
  return res.rowCount > 0;
}

async function insertMatchRecord(matchKey, userA, userB, aItems, bItems) {
  const sql = `INSERT INTO sent_matches (match_key, user_a, user_b, a_items, b_items)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`;
  await pool.query(sql, [matchKey, userA, userB, aItems, bItems]);
}

module.exports = {
  pool,
  addUserItemsTyped,
  removeUserItemsTyped,
  getAllUserItemsTyped,
  hasMatchKey,
  insertMatchRecord,
};

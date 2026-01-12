require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // this is required for Supabase
});

// Example: test connection
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

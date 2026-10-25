import { db } from "../src/platform/db";
import { sql } from "drizzle-orm";

async function check() {
  try {
    const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'report_section_version'`);
    console.log('report_section_version exists:', tables.rows.length > 0);
    
    const mig = await db.execute(sql`SELECT * FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 5`);
    console.log('Recent migrations:', mig.rows);
    
    const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'report_section_version'`);
    console.log('Columns:', cols.rows.map(r => r.column_name));
  } catch (e) {
    console.error('Error:', e);
  }
}

void check();
const { neon } = require('@neondatabase/serverless');
const { ProxyAgent, setGlobalDispatcher } = require('undici');
require('dotenv').config({ path: '.env.local' });

const proxy = 'http://webproxy.cn.vwgroup.com:8080';
setGlobalDispatcher(new ProxyAgent(proxy));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }
const sql = neon(dbUrl);

async function run() {
  try {
    await sql`DROP INDEX IF EXISTS sync_records_record_id_idx`;
    console.log('Index dropped');
    await sql`DELETE FROM sync_records`;
    console.log('Old records cleared');
    await sql`DELETE FROM projects WHERE feishu_record_id IS NOT NULL OR uuid LIKE 'auto_%' OR uuid LIKE 'test_%' OR uuid LIKE 'utf8_%'`;
    console.log('Test projects cleaned');
  } catch(e) {
    console.error('Error:', e.message);
  }
}
run();

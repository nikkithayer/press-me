import { neon } from '@neondatabase/serverless';

// Neon database connection
const DATABASE_URL = 'postgresql://neondb_owner:npg_3goAkB0KtVQP@ep-blue-shadow-afze8ju2-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = neon(DATABASE_URL, {
  disableWarningInBrowsers: true
});

// Test connection on load
console.log('Neon API: Initializing connection to', DATABASE_URL);
sql`SELECT NOW()`.then(r => console.log('Neon API: Connected successfully', r[0])).catch(e => console.error('Neon API: Connection failed', e));

export { sql };


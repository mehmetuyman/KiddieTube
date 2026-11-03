// `npm run db:migrate -w @kiddietube/api`: apply pending migrations (deploy.sh runs this).
import { loadConfig } from '../config.ts'
import { openDb } from './client.ts'

const config = loadConfig()
const handle = await openDb(config.DATABASE_URL, { migrate: true })
await handle.close()
console.log('Migrations applied.')

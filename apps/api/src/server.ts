// Entry point: `npm run dev -w @kiddietube/api` (watch) or `npm start` (systemd).
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/client.ts'

const config = loadConfig()
// Production applies migrations explicitly (deploy.sh); dev/PGlite migrates on start.
const isPostgres = config.DATABASE_URL?.startsWith('postgres')
const handle = await openDb(config.DATABASE_URL ?? 'pglite:./.data/dev', { migrate: !isPostgres })
const { app } = await buildApp({
  config,
  db: handle.db,
  ...(config.FAKE_YOUTUBE_META ? { fetchMeta: async (id: string) => ({ title: `Video ${id}`, channel: 'Test Channel' }) } : {}),
})

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await handle.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

await app.listen({ host: config.HOST, port: config.PORT })

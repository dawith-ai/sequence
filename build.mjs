import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const root = new URL('.', import.meta.url)
const dist = new URL('./dist/', root)
if (existsSync(dist)) await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
for (const file of ['index.html', 'styles.css', 'app.js', 'cloudflare-client.js']) {
  await cp(new URL(`./${file}`, root), new URL(`./${file}`, dist))
}
await cp(new URL('./assets/', root), new URL('./assets/', dist), { recursive: true })
console.log('Built One Wish static frontend to dist/')

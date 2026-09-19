import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve('dist')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
for (const file of ['index.html', 'styles.css', 'app.js']) {
  fs.copyFileSync(path.resolve(file), path.join(out, file))
}
fs.cpSync(path.resolve('assets'), path.join(out, 'assets'), { recursive: true })
console.log('Built static One pice app to dist/')

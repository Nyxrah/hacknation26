// Serwer produkcyjny bez zależności: serwuje zbudowaną aplikację (dist/) i pośredniczy w zapytaniach
// do usług, które nie wysyłają nagłówków CORS (Geoportal NMT, Copernicus DEM, Overpass).
// Odpowiedzi są buforowane na dysku (cache/), więc kolejne analizy tej samej okolicy są szybkie.
//
// Uruchomienie: npm run build && npm start   →  http://localhost:8080
import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 8080)
const DIST = resolvePath(fileURLToPath(new URL('./dist/', import.meta.url)))
const CACHE = fileURLToPath(new URL('./cache/', import.meta.url))
mkdirSync(CACHE, { recursive: true })

// tylko te hosty — serwer nie jest otwartym proxy
export const ROUTES = {
  '/proxy/nmt': 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF',
  '/proxy/cop': 'https://copernicus-dem-30m.s3.amazonaws.com',
  '/proxy/overpass': 'https://overpass-api.de/api/interpreter',
  // archiwum pogody (dane historyczne się nie zmieniają) — buforowane, by nie wyczerpywać limitu Open-Meteo
  '/proxy/meteo': 'https://archive-api.open-meteo.com/v1/archive',
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.wasm': 'application/wasm' }

function upstream(url, req, body) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'bank-wody/1.0 (prototyp HackNation)', Accept: '*/*' }
    if (req.headers.range) headers.Range = req.headers.range
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type']
    const r = https.request(url, { method: req.method, headers, timeout: 180000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    r.on('timeout', () => r.destroy(new Error('timeout')))
    r.on('error', reject)
    if (body?.length) r.write(body)
    r.end()
  })
}

async function proxy(req, res, prefix, target) {
  const rest = req.url.slice(prefix.length)
  const url = target + rest
  const body = await new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))) })
  const key = createHash('sha1').update(req.method + url + (req.headers.range ?? '') + body.toString()).digest('hex')
  const file = join(CACHE, key)
  if (existsSync(file)) {
    const meta = JSON.parse(await readFile(file + '.json', 'utf8'))
    res.writeHead(meta.status, { ...meta.headers, 'X-Cache': 'HIT', 'Access-Control-Allow-Origin': '*' })
    return createReadStream(file).pipe(res)
  }
  try {
    const up = await upstream(url, req, body)
    const keep = ['content-type', 'content-range', 'accept-ranges', 'content-length']
    const headers = Object.fromEntries(Object.entries(up.headers).filter(([k]) => keep.includes(k)))
    if (up.status === 200 || up.status === 206) {
      await writeFile(file, up.body)
      await writeFile(file + '.json', JSON.stringify({ status: up.status, headers }))
    }
    res.writeHead(up.status ?? 502, { ...headers, 'X-Cache': 'MISS', 'Access-Control-Allow-Origin': '*' })
    res.end(up.body)
  } catch (e) {
    res.writeHead(504, { 'Content-Type': 'text/plain' })
    res.end('Usługa zewnętrzna nie odpowiada: ' + e.message)
  }
}

http.createServer(async (req, res) => {
  for (const [prefix, target] of Object.entries(ROUTES)) if (req.url.startsWith(prefix)) return proxy(req, res, prefix, target)
  // plik wyłącznie z wnętrza dist/ (ochrona przed ../)
  let f = resolvePath(DIST, '.' + decodeURIComponent(req.url.split('?')[0]))
  if (!f.startsWith(DIST + sep) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
  createReadStream(f).pipe(res)
}).listen(PORT, () => console.log(`Bank wody: http://localhost:${PORT}`))

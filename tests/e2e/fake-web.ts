import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A stand-in for the real internet.
 *
 * Tests navigate to hosts on the reserved `.test` TLD (RFC 6761), pointed at this server
 * by Chrome's --host-resolver-rules. That keeps the suite offline and deterministic while
 * still exercising real hostnames — unlike "block localhost:PORT", which the domain
 * normalizer legitimately rejects and which would force port-bearing rule shapes that
 * never ship.
 */
export interface FakeWeb {
  port: number
  close(): Promise<void>
}

export async function startFakeWeb(): Promise<FakeWeb> {
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? 'unknown').split(':')[0]
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<!doctype html><meta charset="utf-8"><title>${host}</title>` +
        `<h1 id="real-site">REAL SITE: ${host}</h1>`,
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

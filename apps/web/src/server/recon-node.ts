import { resolve4, resolve6, resolveTxt } from "node:dns/promises";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import {
  ReconError,
  type DnsResolver,
  type FetchRequest,
  type HttpResponse,
  type ReconLimits,
  type SocketFactory,
  type TlsSession,
} from "@highcastle/security";

/**
 * Production I/O for passive recon — DNS over the system resolver and a
 * minimal HTTP/1.1 client over IP-pinned TLS. Lives server-side only:
 * nothing here runs in the runner sandbox and the target-lab runner is
 * NEVER involved (different executor entirely).
 */

export const nodeDnsResolver: DnsResolver = {
  async resolveAddresses(host) {
    const [v4, v6] = await Promise.all([
      resolve4(host).catch(() => [] as string[]),
      resolve6(host).catch(() => [] as string[]),
    ]);
    return [...v4, ...v6];
  },
  resolveTxt: (host) => resolveTxt(host),
};

/**
 * GET over TLS to `pinnedIp:443` with SNI = logical host. Connects to the
 * pre-validated IP so a hostile second DNS answer cannot redirect traffic
 * (rebinding defense). No HTTP client library — header/body are parsed by
 * hand so byte caps are enforced at the byte stream, not after buffering.
 */
export const tlsSocketFactory: SocketFactory = {
  httpsGet(req) {
    return pinnedGet(req);
  },
};

function pinnedGet(req: FetchRequest): Promise<HttpResponse> {
  const { host, pinnedIp, path, limits } = req;
  return new Promise<HttpResponse>((resolve, reject) => {
    const fail = (
      code: ConstructorParameters<typeof ReconError>[0],
      msg: string,
      reason?: string,
    ) => reject(new ReconError(code, msg, reason));

    let sock: TLSSocket;
    try {
      sock = tlsConnect({
        host: pinnedIp,
        port: 443,
        servername: host,
        ALPNProtocols: ["http/1.1"],
        rejectUnauthorized: true, // CA-validated cert required — honest signal
      });
    } catch (e) {
      return fail("unreachable", `socket error: ${(e as Error).message}`, "Could not connect.");
    }

    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      timer && clearTimeout(timer);
      sock.destroy();
      fn();
    };

    const timer = setTimeout(
      () => done(() => fail("timeout", "request timed out", "The site was too slow to respond.")),
      limits.requestTimeoutMs + limits.connectTimeoutMs,
    );

    sock.setTimeout(limits.connectTimeoutMs, () =>
      done(() => fail("timeout", "connect timeout", "The site did not accept a connection.")),
    );

    sock.once("error", (e) =>
      done(() =>
        fail("unreachable", `tls error: ${e.message}`, "The site could not be reached over HTTPS."),
      ),
    );

    let raw = Buffer.alloc(0);
    sock.once("secureConnect", () => {
      const cert = sock.getPeerCertificate();
      const tls: TlsSession = {
        protocol: sock.getProtocol(),
        cipherName: sock.getCipher()?.name ?? null,
        alpnProtocol: sock.alpnProtocol || null,
        certSubject: formatCertName(cert?.subject),
        certIssuer: formatCertName(cert?.issuer),
        certNotBefore: cert?.valid_from ?? null,
        certNotAfter: cert?.valid_to ?? null,
        authorized: sock.authorized === true,
      };

      const head = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: HighCastle-PassiveRecon/1.0\r\nAccept: */*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`;
      sock.write(head);

      let headers: Record<string, string[]> | null = null;
      let status = 0;
      let body = Buffer.alloc(0);
      let chunked = false;
      let contentLength: number | null = null;
      let headersComplete = false;

      const tryParseHeaders = () => {
        const idx = raw.indexOf("\r\n\r\n");
        if (idx === -1) {
          if (raw.length > limits.maxHeaderBytes) {
            done(() =>
              fail(
                "http_error",
                "response headers exceed cap",
                "The site returned an invalid response.",
              ),
            );
          }
          return false;
        }
        const headStr = raw.subarray(0, idx).toString("latin1");
        raw = raw.subarray(idx + 4);
        const lines = headStr.split("\r\n");
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(lines[0] ?? "");
        if (!m) {
          done(() =>
            fail("http_error", "malformed status line", "The site returned an invalid response."),
          );
          return false;
        }
        status = parseInt(m[1]!, 10);
        headers = {};
        for (const line of lines.slice(1)) {
          const c = line.indexOf(":");
          if (c <= 0) continue;
          const k = line.slice(0, c).trim().toLowerCase();
          const v = line.slice(c + 1).trim();
          (headers[k] ??= []).push(v);
        }
        chunked = (headers["transfer-encoding"] ?? []).join(",").includes("chunked");
        const cl = headers["content-length"]?.[0];
        contentLength = cl ? parseInt(cl, 10) : null;
        return true;
      };

      const finish = () =>
        done(() =>
          resolve({
            status,
            headers: headers ?? {},
            body: new Uint8Array(body),
            remoteIp: pinnedIp,
            redirectLocation: headers?.["location"]?.[0] ?? null,
            tls,
          }),
        );

      const onData = (chunk: Buffer) => {
        raw = Buffer.concat([raw, chunk]);
        if (!headersComplete) {
          if (!tryParseHeaders()) return;
          headersComplete = true;
        }
        if (chunked) {
          // Decode chunked framing incrementally, honoring maxBodyBytes.
          while (true) {
            const lineEnd = raw.indexOf("\r\n");
            if (lineEnd === -1) return;
            const size = parseInt(raw.subarray(0, lineEnd).toString("latin1"), 16);
            if (Number.isNaN(size)) {
              done(() =>
                fail("http_error", "bad chunk size", "The site returned an invalid response."),
              );
              return;
            }
            if (raw.length < lineEnd + 2 + size + 2) return; // wait for full chunk
            if (size === 0) {
              finish();
              return;
            }
            body = Buffer.concat([body, raw.subarray(lineEnd + 2, lineEnd + 2 + size)]);
            raw = raw.subarray(lineEnd + 2 + size + 2);
            if (body.length > limits.maxBodyBytes) {
              finish(); // truncate at cap — recorded as partial body
              return;
            }
          }
        } else {
          body = Buffer.concat([body, raw]);
          raw = Buffer.alloc(0);
          if (
            body.length > limits.maxBodyBytes ||
            (contentLength !== null && body.length >= contentLength)
          ) {
            finish();
          }
        }
      };
      sock.on("data", onData);
      sock.once("close", () => {
        if (!settled) {
          if (headersComplete) finish();
          else
            done(() =>
              fail(
                "http_error",
                "connection closed before response",
                "The site closed the connection.",
              ),
            );
        }
      });
    });
  });
}

function formatCertName(n: unknown): string | null {
  if (!n || typeof n !== "object") return null;
  const o = n as Record<string, unknown>;
  return [o.CN, o.O, o.OU].filter(Boolean).join(" / ").slice(0, 200) || null;
}

/**
 * CookieJar — Gerenciamento de cookies por usuário virtual (VU).
 *
 * Cada VU possui seu próprio CookieJar, simulando sessões independentes.
 * Essencial para sistemas que usam cookies de sessão (ex: ASP Classic
 * com ASPSESSIONID, PHP com PHPSESSID, etc.).
 *
 * Funcionalidades:
 *   - Parseia headers Set-Cookie da resposta HTTP
 *   - Armazena cookies acumulados (multi-app gera multiplos cookies)
 *   - Gera header Cookie para requests subsequentes
 *   - Respeita atributos básicos (Path, Domain, Secure)
 */

interface CookieEntry {
  name: string;
  value: string;
  path: string;
  domain: string;
  secure: boolean;
  httpOnly: boolean;
  expiresAt?: number;
}

export class CookieJar {
  private cookies: Map<string, CookieEntry> = new Map();

  /**
   * Parseia e armazena cookies vindos dos headers Set-Cookie de uma resposta HTTP.
   * O MisterT gera multiplos ASPSESSIONID* (um por app ASP), então
   * acumulamos todos no mesmo jar.
   */
  addFromSetCookieHeaders(setCookieHeaders: string[] | undefined): void {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return;

    this.pruneExpired();

    for (const header of setCookieHeaders) {
      const entry = this.parseSetCookie(header);
      if (entry) {
        // Cookie expirado remove valor anterior com o mesmo nome.
        if (this.isExpired(entry)) {
          this.cookies.delete(entry.name);
          continue;
        }

        // Chave unica = nome do cookie (sobrescreve se mesmo nome)
        this.cookies.set(entry.name, entry);
      }
    }
  }

  /**
   * Gera o valor do header Cookie para enviar nas proximas requests.
   * Formato: "ASPSESSIONIDABC=val1; ASPSESSIONIDDEF=val2; ..."
   */
  toCookieHeader(requestUrl?: URL): string {
    if (this.cookies.size === 0) return "";

    this.pruneExpired();

    const parts: string[] = [];
    for (const entry of this.cookies.values()) {
      if (requestUrl && !this.matchesUrl(entry, requestUrl)) continue;
      parts.push(`${entry.name}=${entry.value}`);
    }
    return parts.join("; ");
  }

  /** Retorna true se ha pelo menos um cookie armazenado. */
  hasCookies(): boolean {
    return this.cookies.size > 0;
  }

  /** Quantidade de cookies armazenados. */
  get size(): number {
    return this.cookies.size;
  }

  /** Limpa todos os cookies (simula logout/nova sessão). */
  clear(): void {
    this.cookies.clear();
  }

  /**
   * Parseia um header Set-Cookie individual.
   * Formato tipico: "ASPSESSIONIDABC=VALUE; path=/; HttpOnly; Secure"
   */
  private parseSetCookie(header: string): CookieEntry | null {
    const parts = header.split(";").map((p) => p.trim());
    if (parts.length === 0) return null;

    // Primeiro segmento e sempre nome=valor
    const firstPart = parts[0];
    const eqIdx = firstPart.indexOf("=");
    if (eqIdx <= 0) return null;

    const name = firstPart.substring(0, eqIdx).trim();
    const value = firstPart.substring(eqIdx + 1).trim();

    // Validação basica do nome do cookie
    if (!name || name.length > 256) return null;

    const entry: CookieEntry = {
      name,
      value,
      path: "/",
      domain: "",
      secure: false,
      httpOnly: false,
    };

    // Parsear atributos
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part === "secure") {
        entry.secure = true;
      } else if (part === "httponly") {
        entry.httpOnly = true;
      } else if (part.startsWith("path=")) {
        entry.path = parts[i].substring(5).trim() || "/";
      } else if (part.startsWith("domain=")) {
        entry.domain = parts[i]
          .substring(7)
          .trim()
          .toLowerCase()
          .replace(/^\./, "");
      } else if (part.startsWith("max-age=")) {
        const maxAge = Number.parseInt(parts[i].substring(8).trim(), 10);
        if (Number.isFinite(maxAge)) {
          entry.expiresAt = Date.now() + maxAge * 1000;
        }
      } else if (part.startsWith("expires=")) {
        const expires = Date.parse(parts[i].substring(8).trim());
        if (!Number.isNaN(expires)) {
          entry.expiresAt = expires;
        }
      }
    }

    return entry;
  }

  private isExpired(entry: CookieEntry): boolean {
    return typeof entry.expiresAt === "number" && entry.expiresAt <= Date.now();
  }

  private pruneExpired(): void {
    for (const [key, entry] of this.cookies.entries()) {
      if (this.isExpired(entry)) {
        this.cookies.delete(key);
      }
    }
  }

  private matchesUrl(entry: CookieEntry, requestUrl: URL): boolean {
    if (entry.secure && requestUrl.protocol !== "https:") {
      return false;
    }

    if (entry.path && !requestUrl.pathname.startsWith(entry.path)) {
      return false;
    }

    if (!entry.domain) {
      return true;
    }

    const host = requestUrl.hostname.toLowerCase();
    return host === entry.domain || host.endsWith(`.${entry.domain}`);
  }
}

// Corre las suites SQL/RLS sobre un Postgres real en memoria (PGlite)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const correr = archivo => spawnSync(process.execPath, [fileURLToPath(new URL(archivo, import.meta.url))], { encoding: 'utf8', timeout: 240000, maxBuffer: 1e8 });

describe('Base de datos', () => {
  // [nombre, archivo, mínimo de comprobaciones que deben correr]
  for (const [nombre, archivo, minimo] of [
    ['registro, cobros, check-in y permisos (Fase 1)', './fase1.mjs', 150],
    ['estabilidad y datos persistentes (Fase 2)', './fase2.mjs', 60],
    ['negocios, cupones, contacto y vista pública (Fase 3A)', './fase3.mjs', 65],
    ['índices, retención, pagos y salud (Fase 4)', './fase4.mjs', 25],
  ]) {
    it(nombre, () => {
      const r = correr(archivo);
      const m = /PASARON (\d+) · FALLARON (\d+)/.exec(r.stdout || '');
      expect(m, (r.stderr || r.stdout || '').slice(-1500)).not.toBeNull();
      expect(Number(m[2]), r.stdout.slice(-1500)).toBe(0);
      expect(Number(m[1])).toBeGreaterThanOrEqual(minimo);
    }, 250000);
  }
});

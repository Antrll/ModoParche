import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const cargar = (archivo, ctx) => vm.runInContext(fs.readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8'), ctx);
let U, S;
beforeAll(() => {
  const ctx = vm.createContext({ window: {}, Intl, String, Number, Math, URL, RegExp, Promise });
  cargar('mp-utils.js', ctx); cargar('mp-seguro.js', ctx);
  U = ctx.window.MPUtil; S = ctx.window.MPSeguro;
});

describe('MPUtil', () => {
  it('escapa HTML', () => expect(U.esc('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;'));
  it('no rompe con null', () => expect(U.esc(null)).toBe(''));
  it('normaliza tildes', () => expect(U.norm('Acacías')).toBe('acacias'));
  it('formatea pesos', () => expect(U.money(2500)).toBe('$2.500'));
  it('valores inválidos valen 0', () => expect(U.money('x')).toBe('$0'));
});

describe('MPSeguro', () => {
  it('bloquea javascript:', () => expect(S.safeUrl('javascript:alert(1)')).toBe(''));
  it('bloquea data:text/html en imágenes', () => expect(S.safeUrl('data:text/html,x', { imagen: true })).toBe(''));
  it('bloquea credenciales en la URL', () => expect(S.safeUrl('https://a@b.co/')).toBe(''));
  it('deja https', () => expect(S.safeUrl('https://modoparche.vercel.app/x')).toBe('https://modoparche.vercel.app/x'));
  it('neutraliza fórmulas de Excel', () => {
    for (const v of ['=1+1', '+1', '-1', '@x', '\tx']) expect(S.celdaCSV(v, ';').replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('los números reales no se tocan', () => expect(S.celdaCSV(-5, ';')).toBe('-5'));
});

describe('Publicación', () => {
  const raiz = n => fs.readFileSync(new URL(`../../${n}`, import.meta.url), 'utf8');
  it('la compilación usa lista permitida', () => expect(raiz('scripts/build.mjs')).toContain('lista permitida'));
  it('los datos personales no se despliegan', () => expect(raiz('.vercelignore')).toContain('mis-datos-*'));
  it('la CSP no permite scripts en línea', () => {
    const csp = JSON.parse(raiz('vercel.json')).headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
    const scripts = csp.split(';').find(d => d.trim().startsWith('script-src'));
    expect(scripts).not.toContain("'unsafe-inline'");
  });
  it('ninguna página trae script ejecutable en línea', () => {
    for (const f of fs.readdirSync(new URL('../../', import.meta.url)).filter(x => x.endsWith('.html'))) {
      const s = raiz(f).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(s), f).toBe(false);
      expect(/\son(click|error|load|submit|change)=/.test(s), f).toBe(false);
    }
  });
});

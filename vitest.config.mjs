// Vitest corre las pruebas unitarias y las de la base (SQL/RLS).
// Las de tests/edge son de Deno: se corren con `npm run test:edge`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.mjs', 'tests/sql/**/*.test.mjs'] },
});

// Fase 4: índices de claves foráneas, retención, conciliación de pagos,
// registro de tareas, salud del backend y tope de JSON
import { base } from './pgbase.mjs';
const { db, errores } = await base();
if (errores.length) { console.log(errores); process.exit(1); }
let ok = 0, mal = 0; const fallos = [];
const pasa = (n, c, extra = '') => { if (c) ok++; else { mal++; fallos.push(n + (extra ? ' → ' + extra : '')); } };
const raiz = async () => { await db.exec(`reset role; set session authorization postgres; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.aal','',false), set_config('request.jwt.claim.role','',false)`); };
const como = async (uid, aal = 'aal1') => { await raiz(); await db.query(`select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal',$2,false), set_config('request.jwt.claim.role','authenticated',false)`, [uid, aal]); await db.exec('set role authenticated'); };
const servidor = async () => { await raiz(); await db.exec('set role service_role'); };
const q = async (s, p = []) => (await db.query(s, p)).rows;
const uno = async (s, p = []) => (await q(s, p))[0];
const falla = async (n, s, p = [], re = null) => { try { await db.query(s, p); pasa(n, false, 'no falló'); } catch (e) { pasa(n, !re || re.test(e.message + ' ' + (e.hint || '')), e.message); } };
const sirve = async (n, s, p = []) => { try { const r = await db.query(s, p); pasa(n, true); return r.rows; } catch (e) { pasa(n, false, e.message); return []; } };
const U = {}; const ID = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const sinTrg = async (t, fn) => { await raiz(); await db.exec(`alter table public.${t} disable trigger user`); await fn(); await db.exec(`alter table public.${t} enable trigger user`); };

await raiz();
const nuevo = async (n, i, meta) => { U[n] = ID(i); await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1,$2,$3,'{"provider":"email"}')`, [U[n], n + '@x.co', JSON.stringify(meta)]); };
await nuevo('ana', 1, { nombre: 'Ana Prueba', cedula: '10000001', fecha_nacimiento: '1995-01-01' });
await nuevo('adm', 5, { nombre: 'Admin' });
await nuevo('neg', 7, { tipo: 'empresa', negocio: 'Los Capachos', responsable: 'Laura', nit: '900123456-1' });
await db.query(`insert into public.admins (id, nombre, rol) values ($1,'Admin','admin')`, [U.adm]);

// ---------- 1. Toda clave foránea tiene índice
const sinIndice = await q(`select c.conrelid::regclass::text || '.' || a.attname x from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])`);
pasa('1 toda clave foránea de public tiene índice', sinIndice.length === 0, JSON.stringify(sinIndice));
pasa('1 por ejemplo rutas.usuario_id', (await q(`select 1 from pg_indexes where tablename='rutas' and indexdef like '%(usuario_id)%'`)).length >= 1);
// Se puede correr otra vez sin error (idempotente)
const migracion = (await import('node:fs')).readFileSync(new URL('../../supabase/migrations/20261126120000_backend_mantenimiento_fase4.sql', import.meta.url), 'utf8');
try { await db.exec('begin;' + migracion + ';commit;'); pasa('1 la migración se puede correr dos veces', true); }
catch (e) { await db.exec('rollback').catch(() => {}); pasa('1 la migración se puede correr dos veces', false, e.message); }

// ---------- 2. Retención
await raiz();
await db.query(`insert into public.notificaciones (usuario_id, texto, leida, creado_en) values
  ($1,'leída vieja',true,now()-interval '120 days'), ($1,'leída reciente',true,now()-interval '10 days'),
  ($1,'sin leer de 6 meses',false,now()-interval '180 days'), ($1,'sin leer de 2 años',false,now()-interval '730 days')`, [U.ana]);
await db.query(`insert into public.mensajes_contacto (nombre, correo, motivo, mensaje, estado, creado_en) values
  ('Ana','a@b.co','contacto','archivado viejo de prueba','archivado',now()-interval '400 days'),
  ('Beto','b@b.co','contacto','archivado reciente de prueba','archivado',now()-interval '100 days'),
  ('Caro','c@b.co','contacto','nuevo viejo sin atender','nuevo',now()-interval '800 days'),
  ('Dani','d@b.co','contacto','atendido muy viejo prueba','atendido',now()-interval '800 days')`);
await db.query(`insert into public.errores_cliente (pagina, mensaje, creado_en) values ('/x','viejo',now()-interval '40 days'),('/x','nuevo',now())`);
const r = (await uno(`select private.limpieza_retencion() r`)).r;
pasa('2 borra notificaciones leídas de +90 días y sin leer de +1 año', r.notificaciones === 2, JSON.stringify(r));
const quedan = (await q(`select texto from public.notificaciones where usuario_id=$1 order by texto`, [U.ana])).map(x => x.texto);
pasa('2 deja las recientes y las sin leer de menos de un año', JSON.stringify(quedan) === JSON.stringify(['leída reciente', 'sin leer de 6 meses']), JSON.stringify(quedan));
pasa('2 borra contacto archivado de +1 año y atendido de +2 años', r.contacto === 2, JSON.stringify(r));
pasa('2 nunca borra un mensaje sin atender', (await q(`select 1 from public.mensajes_contacto where estado='nuevo'`)).length === 1);
pasa('2 errores de +30 días', r.errores === 1);
pasa('2 anota la tarea', (await uno(`select ok, detalle from private.tareas_ejecutadas where nombre='retencion'`))?.ok === true);
// En PGlite no hay pg_cron real: se revisa que la migración la programe todos los días
pasa('2 queda programada en pg_cron', /cron\.schedule\('modo-parche-retencion', '45 8 \* \* \*', 'select private\.limpieza_retencion\(\)'\)/.test(migracion));
await como(U.ana); await falla('2 una cuenta no puede correr la limpieza', `select private.limpieza_retencion()`);

// ---------- 3. Conciliación de pagos
await raiz();
await db.query(`insert into public.pagos (negocio_id, referencia, plan, monto_centavos, estado, creado_en, wompi_id) values
  ($1,'MP-PEND-RECIENTE','villavo',100000,'PENDIENTE',now()-interval '5 minutes',null),
  ($1,'MP-PEND-30MIN','villavo',100000,'PENDIENTE',now()-interval '30 minutes',null),
  ($1,'MP-PEND-3DIAS','villavo',100000,'PENDIENTE',now()-interval '3 days',null),
  ($1,'MP-PEND-CONID','villavo',100000,'PENDIENTE',now()-interval '3 days','tx-123'),
  ($1,'MP-APROBADO-X','villavo',100000,'APPROVED',now()-interval '3 days','tx-999')`, [U.neg]);
await como(U.neg); await falla('3 un negocio no lista la conciliación', `select * from public.sistema_pagos_por_conciliar()`);
await servidor();
const lista = (await q(`select referencia from public.sistema_pagos_por_conciliar(15, 50)`)).map(x => x.referencia);
pasa('3 lista solo pendientes con más de 15 min', JSON.stringify(lista.sort()) === JSON.stringify(['MP-PEND-30MIN', 'MP-PEND-3DIAS', 'MP-PEND-CONID']), JSON.stringify(lista));
pasa('3 abandonado: no marca uno de 30 min', (await uno(`select public.sistema_pago_abandonado('MP-PEND-30MIN') v`)).v === false);
pasa('3 abandonado: no marca uno que ya tiene transacción', (await uno(`select public.sistema_pago_abandonado('MP-PEND-CONID') v`)).v === false);
pasa('3 abandonado: marca uno de 3 días sin transacción', (await uno(`select public.sistema_pago_abandonado('MP-PEND-3DIAS') v`)).v === true);
await raiz(); pasa('3 queda en ERROR con el motivo', /Abandonado/.test((await uno(`select estado, detalle from public.pagos where referencia='MP-PEND-3DIAS'`)).detalle));
// Si después llega el aviso aprobado de Wompi, se aplica igual
await servidor(); const ap = (await uno(`select public.aplicar_pago_wompi('MP-PEND-3DIAS','APPROVED','tx-tarde','CARD',100000,'COP') r`)).r;
pasa('3 un aviso tardío aprobado se aplica igual', ap.ok === true, JSON.stringify(ap));

// ---------- 4. Tareas y salud
await servidor(); await sirve('4 el servidor anota una tarea', `select public.sistema_anotar_tarea('depurar-archivos', true, '{"borrados":3}')`);
await servidor(); await falla('4 nombre de tarea inválido', `select public.sistema_anotar_tarea('Mal Nombre!', true, '{}')`, [], /NOMBRE_INVALIDO/);
await como(U.ana); await falla('4 una cuenta no anota tareas', `select public.sistema_anotar_tarea('x', true, '{}')`);
await como(U.ana); await falla('4 una persona no ve la salud', `select public.admin_salud()`);
await como(U.adm, 'aal1'); await falla('4 admin sin 2FA no ve la salud', `select public.admin_salud()`);
await como(U.adm, 'aal2'); const salud = (await uno(`select public.admin_salud() s`)).s;
pasa('4 el admin con 2FA ve la salud', salud && typeof salud.errores_24h === 'number', JSON.stringify(salud).slice(0, 200));
pasa('4 incluye las tareas anotadas', salud.tareas.some(t => t.nombre === 'depurar-archivos' && t.detalle.borrados === 3));
pasa('4 cuenta los pagos pendientes viejos', salud.pagos_pendientes_viejos === 1, String(salud.pagos_pendientes_viejos));

// ---------- 5. Tope de JSON en parches
await raiz();
const grande = JSON.stringify({ texto: 'x'.repeat(20000).split('').map((c, i) => String.fromCharCode(97 + (i * 7919) % 26)).join('') });
await sinTrg('parches', async () => {
  await falla('5 un cupón JSON enorme se rechaza', `insert into public.parches (creador_id,titulo,categoria,inicio,lugar,lat,lng,cupos_max,cupon) values ($1,'Prueba grande','rumba',now()+interval '1 day','Local',4.1,-73.6,10,$2::jsonb)`, [U.neg, grande], /parches_json_tamano/);
  await sirve('5 un cupón normal entra', `insert into public.parches (creador_id,titulo,categoria,inicio,lugar,lat,lng,cupos_max,cupon) values ($1,'Prueba normal','rumba',now()+interval '1 day','Local',4.1,-73.6,10,'{"id":"k1","nombre":"2x1"}'::jsonb)`, [U.neg]);
});

console.log(`PASARON ${ok} · FALLARON ${mal}`); fallos.forEach(x => console.log(' -', x.slice(0, 230)));

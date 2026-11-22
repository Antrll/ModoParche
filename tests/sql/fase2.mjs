// Pruebas de ataque y de funcionalidad sobre la base con la migración aplicada
import { base } from './pgbase.mjs';
const { db, errores } = await base();
if (errores.length) { console.log(errores); process.exit(1); }
let ok = 0, mal = 0; const fallos = [];
const pasa = (n, c, extra = '') => { if (c) ok++; else { mal++; fallos.push(n + (extra ? ' → ' + extra : '')); } };
const raiz = async () => { await db.exec(`reset role; set session authorization postgres; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.aal','',false), set_config('request.jwt.claim.role','',false)`); };
const como = async (uid, aal = 'aal1') => { await raiz(); await db.query(`select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal',$2,false), set_config('request.jwt.claim.role','authenticated',false)`, [uid, aal]); await db.exec('set role authenticated'); };
const anon = async () => { await raiz(); await db.exec('set role anon'); };
const q = async (s, p = []) => (await db.query(s, p)).rows;
const uno = async (s, p = []) => (await q(s, p))[0];
const falla = async (n, s, p = [], re = null) => { try { await db.query(s, p); pasa(n, false, 'no falló'); } catch (e) { pasa(n, !re || re.test(e.message + ' ' + (e.hint || '')), e.message); } };
const sirve = async (n, s, p = []) => { try { const r = await db.query(s, p); pasa(n, true); return r.rows; } catch (e) { pasa(n, false, e.message); return []; } };
const U = {}; const ID = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
await raiz();
await db.exec(`grant insert, select on auth.users to supabase_auth_admin; grant usage on schema auth to supabase_auth_admin;`);
const nuevo = async (n, i, meta, prov = 'email') => { U[n] = ID(i); await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1,$2,$3,$4)`, [U[n], n + '@x.co', JSON.stringify(meta), JSON.stringify({ provider: prov })]); };
const persona = (c, f = '1995-01-01') => ({ nombre: 'Persona Prueba', cedula: c, telefono: '3001234567', fecha_nacimiento: f, acepta_terminos: '1.0', autoriza_datos: '1.0' });

// ---------- 1. Registro
await db.exec('set session authorization supabase_auth_admin');
await falla('1 registro sin cédula se rechaza', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(900)}','a@a.co','{"nombre":"Juan Perez","fecha_nacimiento":"1990-01-01"}','{"provider":"email"}')`, [], /CEDULA/);
await falla('1 menor de edad se rechaza', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(901)}','b@a.co','${JSON.stringify(persona('1234567', '2015-01-01'))}','{"provider":"email"}')`, [], /MENOR/);
await falla('1 sin fecha se rechaza', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(902)}','c@a.co','{"nombre":"Juan Perez","cedula":"1234567"}','{"provider":"email"}')`, [], /MENOR/);
await falla('1 tipo=admin ya no se salta la edad', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(903)}','d@a.co','{"tipo":"admin","nombre":"Juan Perez","cedula":"1234567"}','{"provider":"email"}')`, [], /MENOR/);
await sirve('1 registro normal funciona', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(904)}','e@a.co','${JSON.stringify(persona('1234599'))}','{"provider":"email"}')`);
await sirve('1 Google entra y completa después', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(905)}','g@a.co','{"full_name":"Ana Gomez"}','{"provider":"google"}')`);
await sirve('1 empresa se registra', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(906)}','n@a.co','{"tipo":"empresa","negocio":"Negocio Registro","nit":"900111222","responsable":"Ana Dueña","telefono":"3001234567"}','{"provider":"email"}')`);
await raiz();

await nuevo('ana', 1, persona('10000001')); await nuevo('beto', 2, persona('10000002')); await nuevo('caro', 3, persona('10000003'));
await nuevo('google', 4, { full_name: 'Gabi Google' }, 'google');
await nuevo('adm', 5, { tipo: 'admin', nombre: 'Admin' }); await nuevo('mod', 6, { nombre: 'Mode' });
await nuevo('neg', 7, { tipo: 'empresa', negocio: 'Los Capachos', nit: '900123456-1' }); await nuevo('neg2', 8, { tipo: 'empresa', negocio: 'Otro Local', nit: '800123456-2' }); await nuevo('neg3', 9, { tipo: 'empresa', negocio: 'Sin Nit' });
await db.query(`insert into public.admins (id, nombre, rol) values ($1,'Admin','admin'), ($2,'Mode','moderador')`, [U.adm, U.mod]);
await db.query(`update public.negocios set lat=4.1, lng=-73.6, plan='villavo'`);
await db.query(`update public.perfiles_privados set cedula_verificada=true, cedula_estado='aprobada' where id=$1`, [U.caro]);

// ---------- FASE 2
const sinTrg = async (t, fn) => { await raiz(); await db.exec(`alter table public.${t} disable trigger user`); await fn(); await db.exec(`alter table public.${t} enable trigger user`); };
const regN = async (k, i, plan) => { await raiz(); await db.exec('set session authorization supabase_auth_admin'); await db.query(`insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3,'{"provider":"email"}')`, [ID(i), `${k}@neg.co`, JSON.stringify({ tipo: 'empresa', negocio: 'Negocio ' + k, nit: '900111' + i, responsable: 'Ana Dueña', telefono: '3001234567', plan })]); await raiz(); return (await uno(`select plan, plan_pendiente from public.negocios where id=$1`, [ID(i)])); };
let r = await regN('b', 300, 'basico'); pasa('16 básico', r.plan === 'basico' && !r.plan_pendiente, JSON.stringify(r));
r = await regN('v', 301, 'villavo'); pasa('16 villavo directo', r.plan === 'villavo' && !r.plan_pendiente, JSON.stringify(r));
r = await regN('s', 302, 'sedes'); pasa('16 sedes = villavo pendiente', r.plan === 'villavo' && r.plan_pendiente === 'sedes', JSON.stringify(r));
r = await regN('x', 303, 'sedes-falso'); pasa('16 plan inventado = básico', r.plan === 'basico', JSON.stringify(r));
const tz = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname in ('public','private') and p.proname in ('generar_liquidaciones','mi_cuenta_cobros','negocio_en_mora','recordar_liquidaciones','admin_liquidaciones','parche_de_negocio','aliados_destacados') and array_to_string(p.proconfig,',') ilike '%timezone=America/Bogota%'`);
pasa('16 zona Bogotá en facturación', tz[0].n === 7, String(tz[0].n));
const per = await uno(`select pg_get_expr(adbin,adrelid) e from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='public.cobros'::regclass and a.attname='periodo'`);
pasa('16 periodo por defecto en Bogotá', /America\/Bogota/.test(per.e));

// Desde la Fase 3 el contacto solo lo llama el servidor (/api/contacto con service_role)
await raiz(); await db.exec('set role service_role');
const cont = (n, c = 'a@b.co', m = 'Hola quiero trabajar con ustedes', s = '') => uno(`select public.enviar_contacto($1,$2,'empleo',$3,$4) r`, [n, c, m, s]);
pasa('17 honeypot', (await cont('Bot', 'x', 'y', 'spam')).r.ok === true);
pasa('17 correo inválido', (await cont('Ana', 'malo')).r.ok === false);
pasa('17 envía', (await cont('Ana')).r.ok === true); await cont('Ana'); await cont('Ana');
pasa('17 rate limit', (await cont('Ana')).r.codigo === 'DEMASIADOS');
await anon(); await falla('17 anon no lee', `select * from public.mensajes_contacto`);
await raiz(); pasa('17 solo 3 guardados', (await uno(`select count(*)::int n from public.mensajes_contacto`)).n === 3);
await como(U.ana); await falla('17 usuario no ve panel', `select public.admin_contacto()`);
await como(U.mod, 'aal2'); pasa('17 staff ve', (await uno(`select public.admin_contacto() r`)).r.length === 3);

const pa = ID(500), pb = ID(501);
await sinTrg('parches', () => db.query(`insert into public.parches (id,creador_id,titulo,categoria,inicio,lugar,lat,lng,cupos_max,aliado,relampago) values ($1,$2,'Rumba','rumba',now()+interval '2 hours','Local X',4.1,-73.6,60,true,true),($3,$2,'Comida','comida',now()+interval '3 hours','Local X',4.1,-73.6,60,true,false)`, [pa, U.neg, pb]));
await sinTrg('parche_miembros', () => db.query(`insert into public.parche_miembros (parche_id,usuario_id,checkin) values ($1,$2,true),($1,$3,false),($4,$2,false)`, [pa, U.ana, U.beto, pb]));
await db.query(`update public.negocios set cupones=$1 where id=$2`, [JSON.stringify([{ id: 'k1', nombre: 'Cerveza', beneficio: '2x1', estado: 'activo', limite: 1 }, { id: 'k2', nombre: 'P', beneficio: 'B', estado: 'pausado' }]), U.neg]);
const em = (c, u, pid = pa) => uno(`select public.emitir_cupon($1,$2,$3,'Ana','N','B','CAP',now()+interval '7 days') r`, [pid, u, c]);
await como(U.ana); await falla('18 persona no emite', `select public.emitir_cupon('${pa}','${U.ana}','k1','A','N','B','CAP',now()+interval '1 day')`);
await como(U.neg2); await falla('18 otro negocio no emite', `select public.emitir_cupon('${pa}','${U.ana}','k1','A','N','B','CAP',now()+interval '1 day')`);
await como(U.neg); const c1 = (await em('k1', U.ana)).r; pasa('18 emite', c1.ok && /^CAP-[2-9A-Z]{10}$/.test(c1.cupon.codigo), JSON.stringify(c1));
pasa('18 idempotente', (await em('k1', U.ana)).r.cupon.codigo === c1.cupon.codigo);
pasa('18 límite', (await em('k1', U.beto)).r.codigo === 'AGOTADO'); pasa('18 pausado', (await em('k2', U.beto)).r.codigo === 'PAUSADO');
await como(U.neg2); pasa('18 otro local no canjea', (await uno(`select public.canjear_cupon($1) r`, [c1.cupon.codigo])).r.codigo === 'OTRO_LOCAL');
await como(U.neg); pasa('18 canjea', (await uno(`select public.canjear_cupon($1) r`, [c1.cupon.codigo.toLowerCase()])).r.ok);
pasa('18 doble canje', (await uno(`select public.canjear_cupon($1) r`, [c1.cupon.codigo])).r.codigo === 'YA_CANJEADO');
pasa('18 deshacer', (await uno(`select public.deshacer_canje($1) r`, [c1.cupon.codigo])).r.ok);
pasa('18 lista negocio', (await uno(`select public.cupones_del_negocio() r`)).r.length === 1);
pasa('18 importa local', (await uno(`select public.importar_cupones_locales($1::jsonb) r`, [JSON.stringify([{ codigo: 'VIEJO-1234', cuponId: 'k9', cupNombre: 'x', cupBen: 'y', persona: 'Z', emitido: Date.now(), vence: Date.now() + 864e5 }])])).r === 1);
await como(U.ana); pasa('18 usuario ve cupón', (await uno(`select public.mis_cupones() r`)).r[0]?.negocio === 'Los Capachos');
await falla('18 sin acceso directo', `select * from public.cupones_emitidos`);
const ins1 = (await uno(`select public.mis_insignias() r`)).r; pasa('18 gana rumba y check-in', ins1.includes('medalla-rumbero-oficial') && ins1.includes('medalla-cero-fantasma'), ins1.join());
await raiz(); await db.query(`delete from public.parche_miembros where parche_id=$1 and usuario_id=$2`, [pa, U.ana]);
await como(U.ana); pasa('18 no se pierde al salir', (await uno(`select public.mis_insignias() r`)).r.includes('medalla-rumbero-oficial'));
await sinTrg('parche_miembros', () => db.query(`insert into public.parche_miembros (parche_id,usuario_id) values ($1,$2)`, [pa, U.ana]));

await raiz();
await db.query(`insert into public.mensajes_directos (autor_id,para_id,texto) values ($1,$2,'hola')`, [U.ana, U.beto]).catch(e => pasa('19 dm insert', false, e.message));
await db.query(`insert into public.mensajes_directos (autor_id,para_id,texto) values ($1,$2,'otra')`, [U.ana, U.beto]).catch(e => pasa('19 dm insert 2', false, e.message));
const dm = await q(`select texto, dedup_key from public.notificaciones where usuario_id=$1 and dedup_key is not null`, [U.beto]);
pasa('19 DM sin comentario HTML', dm.length === 1 && !dm[0].texto.includes('<!--'), JSON.stringify(dm));
await db.query(`insert into public.viajes (parche_id,usuario_id,puestos,desde,hora) values ($1,$2,2,'Centro','19:00')`, [pa, U.ana]);
await db.query(`delete from public.parche_miembros where parche_id=$1 and usuario_id=$2`, [pa, U.ana]);
pasa('19 viajes limpios al salir', (await uno(`select count(*)::int n from public.viajes where usuario_id=$1`, [U.ana])).n === 0);
await sinTrg('parche_miembros', () => db.query(`insert into public.parche_miembros (parche_id,usuario_id) values ($1,$2)`, [pa, U.ana]));
await db.exec(`alter table public.calificaciones disable trigger calificaciones_validar`);
await db.query(`insert into public.calificaciones (parche_id,autor_id,calificado_id,estrellas) values ($1,$2,$3,4)`, [pa, U.ana, U.beto]);
pasa('19 rating sube', Number((await uno(`select rating from public.perfiles where id=$1`, [U.beto])).rating) === 4);
await db.query(`delete from public.calificaciones where calificado_id=$1`, [U.beto]);
const rt = await uno(`select rating, resenas from public.perfiles where id=$1`, [U.beto]); pasa('19 rating vuelve a 0', Number(rt.rating) === 0 && rt.resenas === 0);
await db.query(`insert into public.bloqueos (bloqueador,bloqueado) values ($1,$2)`, [U.beto, U.ana]);
await como(U.ana); pasa('19 no invita a quien bloqueó', (await uno(`select public.invitar_a_parche($1,$2::uuid[]) r`, [pb, [U.beto]])).r === 0);

await como(U.caro); pasa('20 ve relámpago activo', (await q(`select id from public.parches where id=$1`, [pa])).length === 1);
await como(U.ana); await falla('20 ajeno no termina', `select public.terminar_relampago('${pa}')`);
await como(U.neg); await sirve('20 dueño termina', `select public.terminar_relampago('${pa}')`);
await como(U.caro); pasa('20 sale del radar', (await q(`select id from public.parches where id=$1`, [pa])).length === 0);
await como(U.ana); pasa('20 miembro aún lo ve', (await q(`select id from public.parches where id=$1`, [pa])).length === 1);
await raiz(); await falla('20 no se une a terminado', `insert into public.parche_miembros (parche_id,usuario_id) values ('${pa}','${U.caro}')`);
await db.query(`update public.negocios set nombre='Capachos Nuevo' where id=$1`, [U.neg]);
pasa('20 sincroniza nombre', (await uno(`select nombre from public.perfiles where id=$1`, [U.neg])).nombre === 'Capachos Nuevo' && (await uno(`select creador_nombre c from public.parches where id=$1`, [pb])).c === 'Capachos Nuevo');

await db.query(`insert into public.liquidaciones (negocio_id,periodo,total_cop,referencia,estado,vence) values ($1,'2020-01-01',50000,'MP-T1','pendiente','2020-02-01')`, [U.neg]);
pasa('24 mora sincronizada', (await q(`select 1 from private.negocios_mora where negocio_id=$1`, [U.neg])).length === 1);
await como(U.caro); pasa('24 parche en mora oculto', (await q(`select id from public.parches where id=$1`, [pb])).length === 0);
await como(U.neg); pasa('24 dueño lo ve', (await q(`select id from public.parches where id=$1`, [pb])).length === 1);
await falla('24 mora no legible', `select * from private.negocios_mora`);
await raiz(); await db.query(`update public.liquidaciones set estado='pagada', pagado_cop=50000 where referencia='MP-T1'`);
pasa('24 sale de mora', (await q(`select 1 from private.negocios_mora where negocio_id=$1`, [U.neg])).length === 0);
await como(U.caro); pasa('24 vuelve al radar', (await q(`select id from public.parches where id=$1`, [pb])).length === 1);
await como(U.ana); const am = await uno(`select public.mis_amigos() r`); pasa('24 mis_amigos', Array.isArray(am.r.amigos));
const rad = (await uno(`select public.parches_radar(now()-interval '1 day',1) r`)).r; pasa('24 radar con miembros', rad.length === 1 && Array.isArray(rad[0].miembros), JSON.stringify(rad).slice(0, 90));
const rad2 = (await uno(`select public.parches_radar(now()-interval '1 day',1,$1::timestamptz,$2::uuid) r`, [rad[0].inicio, rad[0].id])).r; pasa('24 radar pagina', !rad2.length || rad2[0].id !== rad[0].id);
await anon(); await falla('24 radar no es para anon', `select public.parches_radar(now(),1)`);
await como(U.adm, 'aal2'); const me = await uno(`select public.admin_metricas() r`); pasa('24 métricas sin temp', me.r && typeof me.r === 'object');
pasa('24 sin temp table', (await uno(`select count(*)::int n from pg_proc where prosrc like '%create temp table%'`)).n === 0);
const pag = (await uno(`select public.admin_cuentas_pagina('capachos',2,0) r`)).r; pasa('24 cuentas buscadas', pag.length === 1, String(pag.length));
pasa('24 comodín escapado', (await uno(`select public.admin_cuentas_pagina('%%%',5,0) r`)).r.length === 0);
pasa('21 ingreso mes', typeof (await uno(`select public.admin_ingreso_mes() r`)).r.causado === 'number');
await raiz(); const lq = (await uno(`select id from public.liquidaciones where referencia='MP-T1'`)).id;
await como(U.adm, 'aal2'); await sirve('21 marca', `select public.admin_marcar_liquidacion(${lq},'anulada','x')`);
await raiz(); pasa('21 queda en bitácora', (await q(`select 1 from public.admin_registro where accion='liquidacion_anulada'`)).length === 1);
await sinTrg('parche_miembros', () => db.query(`insert into public.parche_miembros (parche_id,usuario_id) values ($1,$2) on conflict do nothing`, [pb, U.caro]));
await db.query(`update public.parches set oficial=true where id=$1`, [pb]); await db.query(`delete from public.notificaciones`);
await db.query(`insert into public.mensajes (parche_id,autor_id,texto) values ($1,$2,'hola a todos')`, [pb, U.caro]);
pasa('23 oficial sin fanout', (await uno(`select count(*)::int n from public.notificaciones where icono='i-chat'`)).n === 0);
console.log(`PASARON ${ok} · FALLARON ${mal}`); fallos.forEach(x => console.log(' -', x.slice(0, 230)));

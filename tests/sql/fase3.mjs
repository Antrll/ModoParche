// Fase 3A: registro de negocios, freno de parches, cupones sin spam,
// contacto solo por el servidor, depuración de archivos y parche_publico
import { base } from './pgbase.mjs';
const { db, errores } = await base();
if (errores.length) { console.log(errores); process.exit(1); }
let ok = 0, mal = 0; const fallos = [];
const pasa = (n, c, extra = '') => { if (c) ok++; else { mal++; fallos.push(n + (extra ? ' → ' + extra : '')); } };
const raiz = async () => { await db.exec(`reset role; set session authorization postgres; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.aal','',false), set_config('request.jwt.claim.role','',false)`); };
const como = async (uid, aal = 'aal1') => { await raiz(); await db.query(`select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal',$2,false), set_config('request.jwt.claim.role','authenticated',false)`, [uid, aal]); await db.exec('set role authenticated'); };
const anon = async () => { await raiz(); await db.exec('set role anon'); };
const servidor = async () => { await raiz(); await db.exec('set role service_role'); };
const q = async (s, p = []) => (await db.query(s, p)).rows;
const uno = async (s, p = []) => (await q(s, p))[0];
const falla = async (n, s, p = [], re = null) => { try { await db.query(s, p); pasa(n, false, 'no falló'); } catch (e) { pasa(n, !re || re.test(e.message + ' ' + (e.hint || '')), e.message); } };
const sirve = async (n, s, p = []) => { try { const r = await db.query(s, p); pasa(n, true); return r.rows; } catch (e) { pasa(n, false, e.message); return []; } };
const U = {}; const ID = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const sinTrg = async (t, fn) => { await raiz(); await db.exec(`alter table public.${t} disable trigger user`); await fn(); await db.exec(`alter table public.${t} enable trigger user`); };

await raiz();
await db.exec(`grant insert, select on auth.users to supabase_auth_admin; grant usage on schema auth to supabase_auth_admin;`);
const nuevo = async (n, i, meta, prov = 'email') => { U[n] = ID(i); await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1,$2,$3,$4)`, [U[n], n + '@x.co', JSON.stringify(meta), JSON.stringify({ provider: prov })]); };
const persona = c => ({ nombre: 'Persona Prueba', cedula: c, telefono: '3001234567', fecha_nacimiento: '1995-01-01', acepta_terminos: '1.0', autoriza_datos: '1.0' });

// ---------- 1. Registro de negocios: ya no entra sin datos
let n = 800;
const regEmpresa = async (meta) => {
  await raiz(); await db.exec('set session authorization supabase_auth_admin');
  const id = ID(++n);
  try { await db.query(`insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3,'{"provider":"email"}')`, [id, `e${n}@neg.co`, JSON.stringify({ tipo: 'empresa', ...meta })]); return 'ok'; }
  catch (e) { return e.message; } finally { await raiz(); }
};
const completo = { negocio: 'Café Origen', responsable: 'Laura Gómez', telefono: '3001234567', nit: '900123456-7' };
pasa('1 negocio completo entra', (await regEmpresa(completo)) === 'ok');
pasa('1 sin nada se rechaza', /NEGOCIO_INVALIDO/.test(await regEmpresa({})));
pasa('1 nombre de 1 letra', /NEGOCIO_INVALIDO/.test(await regEmpresa({ ...completo, negocio: 'X' })));
pasa('1 sin responsable', /RESPONSABLE_INVALIDO/.test(await regEmpresa({ ...completo, responsable: '' })));
pasa('1 responsable de 1 letra', /RESPONSABLE_INVALIDO/.test(await regEmpresa({ ...completo, responsable: ' A ' })));
pasa('1 sin teléfono ni NIT', /CONTACTO_NEGOCIO/.test(await regEmpresa({ negocio: 'Café', responsable: 'Laura' })));
pasa('1 teléfono inválido', /TELEFONO_INVALIDO/.test(await regEmpresa({ ...completo, telefono: '12345' })));
pasa('1 NIT inválido', /NIT_INVALIDO/.test(await regEmpresa({ ...completo, nit: 'ABC' })));
pasa('1 NIT de 11 dígitos', /NIT_INVALIDO/.test(await regEmpresa({ ...completo, nit: '90011122300' })));
pasa('1 solo NIT basta', (await regEmpresa({ negocio: 'Solo Nit', responsable: 'Laura', nit: '900123456' })) === 'ok');
pasa('1 solo fijo 60 basta', (await regEmpresa({ negocio: 'Solo Fijo', responsable: 'Laura', telefono: '6086123456' })) === 'ok');
pasa('1 teléfono con espacios se limpia', (await regEmpresa({ negocio: 'Con Espacios', responsable: 'Laura', telefono: '300 123 4567' })) === 'ok');
// Las personas siguen igual
await db.exec('set session authorization supabase_auth_admin');
await falla('1 persona sin cédula sigue rechazada', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(899)}','p@a.co','{"nombre":"Juan Perez","fecha_nacimiento":"1990-01-01"}','{"provider":"email"}')`, [], /CEDULA/);
await raiz();

await nuevo('ana', 1, persona('10000001')); await nuevo('beto', 2, persona('10000002')); await nuevo('caro', 3, persona('10000003'));
await nuevo('adm', 5, { tipo: 'admin', nombre: 'Admin' }); await nuevo('mod', 6, { nombre: 'Mode' }); await nuevo('adm2', 10, { nombre: 'Admin Suspendido' });
await nuevo('neg', 7, { tipo: 'empresa', negocio: 'Los Capachos', nit: '900123456-1' }); await nuevo('neg2', 8, { tipo: 'empresa', negocio: 'Otro Local', nit: '800123456-2' });
await db.query(`insert into public.admins (id, nombre, rol) values ($1,'Admin','admin'), ($2,'Mode','moderador'), ($3,'Suspendido','admin')`, [U.adm, U.mod, U.adm2]);
await db.query(`update auth.users set banned_until = now() + interval '30 days' where id=$1`, [U.adm2]);
await db.query(`update public.negocios set lat=4.1, lng=-73.6, plan='villavo'`);

// ---------- 1b. Freno de parches: solo un negocio verificado no tiene tope diario
const parchesDe = async (uid, k) => sinTrg('parches', async () => {
  for (let i = 0; i < k; i++) await db.query(`insert into public.parches (creador_id,titulo,categoria,inicio,lugar,lat,lng,cupos_max,aliado) values ($1,$2,'rumba',now()+interval '1 day','Local',4.1,-73.6,10,true)`, [uid, 'Previo ' + i]);
});
const publicar = `insert into public.parches (titulo,categoria,inicio,lugar,lat,lng,cupos_max) values ('Séptimo del día','rumba',now()+interval '1 day','Local',4.1,-73.6,10)`;
await parchesDe(U.neg, 6);
await como(U.neg); await falla('1 negocio sin verificar: máximo 6 al día (aunque sea plan Villavo)', publicar, [], /DEMASIADO_RAPIDO/);
await como(U.neg); await falla('1 al negocio le dice cómo quitar el tope', publicar, [], /verificación de tu negocio/);
await raiz(); await db.query(`update public.negocios set verificado=true where id=$1`, [U.neg]);
await como(U.neg); await sirve('1 negocio verificado no tiene tope diario', publicar);
await raiz(); await db.query(`update public.negocios set verificado=false where id=$1`, [U.neg]);

// ---------- 2. Cupones sin spam de notificaciones
const pa = '11111111-1111-4111-8111-111111111111', pb = '22222222-2222-4222-8222-222222222222';
await sinTrg('parches', () => db.query(`insert into public.parches (id,creador_id,titulo,categoria,inicio,lugar,lat,lng,cupos_max,aliado) values ($1,$2,'Rumba','rumba',now()+interval '2 hours','Local X',4.1,-73.6,60,true),($3,$2,'Comida','comida',now()+interval '3 hours','Local X',4.1,-73.6,60,true)`, [pa, U.neg, pb]));
await sinTrg('parche_miembros', () => db.query(`insert into public.parche_miembros (parche_id,usuario_id) values ($1,$2),($1,$3),($1,$4)`, [pa, U.ana, U.beto, U.caro]));
const em = (c, u, pid = pa, persona = 'Ana') => uno(`select public.emitir_cupon($1,$2,$3,$4,'N','B','CAP',now()+interval '7 days') r`, [pid, u, c, persona]);
const avisos = async u => { await raiz(); return (await uno(`select count(*)::int n from public.notificaciones where usuario_id=$1 and icono='i-ticket'`, [u])).n; };

await como(U.neg);
await falla('2 persona sin parche se rechaza', `select public.emitir_cupon(null,'${U.ana}','k1','Ana','N','B','CAP',now()+interval '1 day')`, [], /FALTA_PARCHE/);
await falla('2 persona fuera del parche se rechaza', `select public.emitir_cupon('${pb}','${U.ana}','k1','Ana','N','B','CAP',now()+interval '1 day')`, [], /NO_ESTA_EN_PARCHE/);
await como(U.neg); pasa('2 cupón sin persona y sin parche (mostrador) sigue sirviendo', (await uno(`select public.emitir_cupon(null,null,'k-mostrador','Cliente mostrador','N','B','CAP',now()+interval '1 day') r`)).r.ok === true);
await como(U.neg); const r1 = (await em('k1', U.ana)).r;
pasa('2 cupón a persona del parche', r1.ok === true && r1.nuevo === true, JSON.stringify(r1));
await como(U.neg); const r2 = (await em('k1', U.ana)).r;
pasa('2 repetido no crea otro', r2.ok === true && r2.nuevo === false);
pasa('2 repetido no vuelve a notificar', (await avisos(U.ana)) === 1);
// Dedup con parche nulo: el mismo cupón de mostrador no se duplica
await como(U.neg); const m2 = (await uno(`select public.emitir_cupon(null,null,'k-mostrador','Cliente mostrador','N','B','CAP',now()+interval '1 day') r`)).r;
pasa('2 dedup con parche nulo', m2.ok === true && m2.nuevo === false, JSON.stringify(m2));
await raiz(); pasa('2 un solo cupón de mostrador', (await uno(`select count(*)::int n from public.cupones_emitidos where cupon_id='k-mostrador'`)).n === 1);

// Bloqueos en los dos sentidos
await raiz(); await db.query(`insert into public.bloqueos (bloqueador,bloqueado) values ($1,$2)`, [U.beto, U.neg]);
await como(U.neg); await falla('2 la persona bloqueó al negocio', `select public.emitir_cupon('${pa}','${U.beto}','k1','Beto','N','B','CAP',now()+interval '1 day')`, [], /BLOQUEADO/);
await raiz(); await db.query(`insert into public.bloqueos (bloqueador,bloqueado) values ($1,$2)`, [U.neg, U.caro]);
await como(U.neg); await falla('2 el negocio bloqueó a la persona', `select public.emitir_cupon('${pa}','${U.caro}','k1','Caro','N','B','CAP',now()+interval '1 day')`, [], /BLOQUEADO/);
pasa('2 bloqueados no reciben aviso', (await avisos(U.beto)) === 0 && (await avisos(U.caro)) === 0);

// Freno por hora: con 120 avisos en la última hora ya no entrega más
await raiz(); await db.query(`insert into private.intentos (clave) select 'cupon_aviso:' || $1 from generate_series(1, 120)`, [U.neg]);
await como(U.neg); const r3 = (await em('k2', U.ana)).r;
pasa('2 freno de cupones por hora', r3.ok === false && r3.codigo === 'DEMASIADOS', JSON.stringify(r3));
pasa('2 frenado no notifica', (await avisos(U.ana)) === 1);
await raiz(); pasa('2 el freno es por negocio', (await uno(`select count(*)::int n from private.intentos where clave = 'cupon_aviso:' || $1`, [U.neg2])).n === 0);

// ---------- 3. Depuración de archivos: solo el servidor
await raiz();
await db.query(`insert into storage.buckets (id,name) values ('album','album'),('fotos','fotos'),('documentos_identidad','documentos_identidad') on conflict do nothing`);
await db.query(`insert into storage.objects (bucket_id,name) values ('album','x/sigue.jpg')`);
await db.query(`insert into public.archivos_por_borrar (bucket,ruta,motivo) values ('album','x/borrado.jpg','prueba'),('album','x/sigue.jpg','prueba')`);
await como(U.ana); await falla('3 una persona no ve la cola', `select * from public.sistema_archivos_por_borrar(10)`);
await como(U.adm, 'aal2'); await falla('3 ni un admin por esta vía', `select * from public.sistema_archivos_por_borrar(10)`);
await anon(); await falla('3 anon no la cierra', `select public.sistema_archivos_borrados(array[1]::bigint[])`);
await servidor(); const cola = await q(`select * from public.sistema_archivos_por_borrar(10)`);
pasa('3 el servidor lee la cola', cola.length === 2);
const ids = cola.map(x => x.id);
pasa('3 solo sale lo que ya no está en Storage', (await uno(`select public.sistema_archivos_borrados($1::bigint[]) n`, [ids])).n === 1);
await raiz(); pasa('3 el que sigue en Storage queda en cola', (await q(`select ruta from public.archivos_por_borrar`)).map(x => x.ruta).join() === 'x/sigue.jpg');

// ---------- 4. Contacto: el navegador ya no puede llamar la base directo
await anon(); await falla('4 anon no llama enviar_contacto', `select public.enviar_contacto('Ana','a@b.co','empleo','Hola quiero trabajar con ustedes','')`, [], /permission denied/);
await anon(); await falla('4 anon no llama la verificada', `select public.enviar_contacto_verificado('Ana','a@b.co','empleo','Hola quiero trabajar con ustedes','','1.2.3.4')`, [], /permission denied/);
await como(U.ana); await falla('4 una cuenta tampoco', `select public.enviar_contacto_verificado('Ana','a@b.co','empleo','Hola quiero trabajar con ustedes','','1.2.3.4')`, [], /permission denied/);
await raiz(); await db.query(`delete from public.notificaciones`);
const cv = (ip, nombre = 'Ana', motivo = 'empleo') => uno(`select public.enviar_contacto_verificado($1,'ana@correo.co',$2,'Hola, quiero sumarme al equipo de ModoParche','', $3) r`, [nombre, motivo, ip]);
await servidor(); pasa('4 el servidor guarda', (await cv('1.2.3.4')).r.ok === true);
await raiz();
const avAdm = await q(`select usuario_id, texto from public.notificaciones where usuario_id = any($1::uuid[])`, [[U.adm, U.mod, U.adm2]]);
pasa('4 aviso al admin activo', avAdm.some(x => x.usuario_id === U.adm && /Nuevo mensaje de empleo/.test(x.texto)), JSON.stringify(avAdm));
pasa('4 el moderador no recibe', !avAdm.some(x => x.usuario_id === U.mod));
pasa('4 el admin suspendido no recibe', !avAdm.some(x => x.usuario_id === U.adm2));
await servidor(); await cv('1.2.3.4'); await cv('1.2.3.4');
pasa('4 freno por IP', (await cv('1.2.3.4')).r.codigo === 'DEMASIADOS');
await servidor(); pasa('4 otra IP sí entra', (await cv('5.6.7.8')).r.ok === true);
await servidor(); pasa('4 honeypot', (await uno(`select public.enviar_contacto_verificado('Bot','x','y','z','spam','9.9.9.9') r`)).r.ok === true);
await raiz(); pasa('4 el honeypot no se guarda ni avisa', (await uno(`select count(*)::int n from public.mensajes_contacto`)).n === 4);
await servidor(); await sirve('4 sin escape de HTML en el aviso', `select public.enviar_contacto_verificado('<img src=x onerror=alert(1)>','b@correo.co','negocio','Tengo un negocio en el Barzal y quiero aliarme','','7.7.7.7')`);
await raiz(); pasa('4 aviso saneado', !(await q(`select texto from public.notificaciones where texto like '%img%'`)).some(x => /<img/.test(x.texto)));

// ---------- 6. parche_publico: sin terminados ni negocios en mora
await raiz();
await sinTrg('parches', () => db.query(`insert into public.parches (id,creador_id,titulo,categoria,inicio,lugar,lat,lng,cupos_max,aliado,terminado_en) values
  ('33333333-3333-4333-8333-333333333333',$1,'Terminado','rumba',now()+interval '1 hour','Local',4.1,-73.6,10,true,now()),
  ('44444444-4444-4444-8444-444444444444',$2,'De otro local','rumba',now()+interval '1 hour','Local',4.1,-73.6,10,true,null),
  ('55555555-5555-4555-8555-555555555555',$3,'De persona','chill',now()+interval '1 hour','Parque',4.1,-73.6,10,false,null)`, [U.neg, U.neg2, U.ana]));
const pub = async id => { await anon(); return (await uno(`select public.parche_publico($1) r`, [id])).r; };
pasa('6 parche normal se ve', (await pub(pa))?.titulo === 'Rumba');
pasa('6 parche terminado no se ve', (await pub('33333333-3333-4333-8333-333333333333')) === null);
await raiz(); await db.query(`insert into private.negocios_mora (negocio_id) values ($1) on conflict do nothing`, [U.neg2]);
pasa('6 negocio en mora no se ve', (await pub('44444444-4444-4444-8444-444444444444')) === null);
pasa('6 la mora de otro no afecta', (await pub(pa))?.titulo === 'Rumba');
pasa('6 parche de persona se ve', (await pub('55555555-5555-4555-8555-555555555555'))?.titulo === 'De persona');
await raiz(); await db.query(`delete from private.negocios_mora where negocio_id=$1`, [U.neg2]);
pasa('6 al pagar vuelve a verse', (await pub('44444444-4444-4444-8444-444444444444'))?.titulo === 'De otro local');
pasa('6 no entrega quién va', !('miembros' in (await pub(pa))) && typeof (await pub(pa)).van !== 'undefined');

// ---------- 7. Freno para las Edge Functions
await como(U.ana); await falla('7 una cuenta no usa el freno del servidor', `select public.sistema_permitir_intento('x', 1, 60)`);
await servidor();
pasa('7 primer intento pasa', (await uno(`select public.sistema_permitir_intento('wompi-confirmar:a', 2, 600) v`)).v === true);
await uno(`select public.sistema_permitir_intento('wompi-confirmar:a', 2, 600) v`);
pasa('7 pasado el máximo frena', (await uno(`select public.sistema_permitir_intento('wompi-confirmar:a', 2, 600) v`)).v === false);
pasa('7 otra clave no se afecta', (await uno(`select public.sistema_permitir_intento('wompi-confirmar:b', 2, 600) v`)).v === true);

// ---------- 8. es_miembro sin fuga de privacidad
const miembro = async (quien, parche, usuario) => { await como(quien); return (await uno(`select public.es_miembro($1,$2) v`, [parche, usuario])).v; };
pasa('8 la propia persona sabe que va', (await miembro(U.ana, pa, U.ana)) === true);
pasa('8 quien creó el parche sabe quién va', (await miembro(U.neg, pa, U.ana)) === true);
pasa('8 otro asistente sabe quién va', (await miembro(U.beto, pa, U.ana)) === true);
pasa('8 una cuenta ajena no puede averiguar a qué parche va alguien', (await miembro(U.neg2, pa, U.ana)) === false);
await raiz(); pasa('8 el servidor (sin sesión) sí sabe', (await uno(`select public.es_miembro($1,$2) v`, [pa, U.ana])).v === true);
await raiz(); await db.query(`delete from private.intentos where clave like 'cupon_aviso:%'`); // la prueba 2 llenó el freno por hora
await como(U.neg); pasa('8 el negocio sigue entregando cupones a sus asistentes', (await em('k-miembro', U.ana)).r.ok === true);

// ---------- 9. Postura general de seguridad de la base (auditoría automática)
await raiz();
const sinRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity`);
pasa('9 toda tabla de public tiene RLS', sinRls.length === 0, JSON.stringify(sinRls));
const sinPath = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','private','seguridad') and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`);
pasa('9 toda función SECURITY DEFINER fija su search_path', sinPath.length === 0, JSON.stringify(sinPath));
// Lo único que un visitante sin cuenta puede ejecutar con permisos elevados
const anonDef = (await q(`select p.proname f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map(x => x.f);
pasa('9 anon solo ejecuta parche_publico y ubicacion_por_token', JSON.stringify(anonDef) === JSON.stringify(['parche_publico', 'ubicacion_por_token']), JSON.stringify(anonDef));
const anonTablas = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace, unnest(array['SELECT','INSERT','UPDATE','DELETE']) pr where n.nspname='public' and c.relkind in ('r','v','m','p') and has_table_privilege('anon', c.oid, pr)`);
pasa('9 anon no tiene permisos de tabla en public', anonTablas.length === 0, JSON.stringify(anonTablas));

console.log(`PASARON ${ok} · FALLARON ${mal}`); fallos.forEach(x => console.log(' -', x.slice(0, 230)));

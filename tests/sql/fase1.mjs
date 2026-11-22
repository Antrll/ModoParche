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
await sirve('1 empresa se registra', `insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ('${ID(906)}','n@a.co','{"tipo":"empresa","negocio":"Negocio Registro","nit":"900111222"}','{"provider":"email"}')`);
await raiz();

await nuevo('ana', 1, persona('10000001')); await nuevo('beto', 2, persona('10000002')); await nuevo('caro', 3, persona('10000003'));
await nuevo('google', 4, { full_name: 'Gabi Google' }, 'google');
await nuevo('adm', 5, { tipo: 'admin', nombre: 'Admin' }); await nuevo('mod', 6, { nombre: 'Mode' });
await nuevo('neg', 7, { tipo: 'empresa', negocio: 'Los Capachos', nit: '900123456-1' }); await nuevo('neg2', 8, { tipo: 'empresa', negocio: 'Otro Local', nit: '800123456-2' }); await nuevo('neg3', 9, { tipo: 'empresa', negocio: 'Sin Nit' });
await db.query(`insert into public.admins (id, nombre, rol) values ($1,'Admin','admin'), ($2,'Mode','moderador')`, [U.adm, U.mod]);
await db.query(`update public.negocios set lat=4.1, lng=-73.6, plan='villavo'`);
await db.query(`update public.perfiles_privados set cedula_verificada=true, cedula_estado='aprobada' where id=$1`, [U.caro]);

// ---------- 2. 2FA
await como(U.adm, 'aal1');
pasa('2 soy_admin es false sin aal2', (await uno('select public.soy_admin() v')).v === false);
pasa('2 mi_tipo_cuenta identifica al admin sin aal2', (await uno('select public.mi_tipo_cuenta() v')).v.tipo === 'admin');
pasa('2 sin aal2 no ve cédulas ajenas', (await q('select * from public.perfiles_privados where id=$1', [U.ana])).length === 0);
await falla('2 sin aal2 no entra a admin_cuentas', 'select public.admin_cuentas()', [], /NO_ADMIN|MFA/);
await como(U.adm, 'aal2');
pasa('2 con aal2 sí es admin', (await uno('select public.soy_admin() v')).v === true);
await sirve('2 con aal2 entra a admin_cuentas', 'select public.admin_cuentas()');
await sirve('2 admin ve liquidaciones', 'select * from public.admin_liquidaciones()');
await como(U.mod, 'aal2');
await sirve('2 moderador usa el panel', 'select public.admin_cuentas()');
await falla('2 moderador no ve finanzas', 'select * from public.admin_liquidaciones()', [], /NO_ADMIN/);
await falla('2 moderador no ve reclamos', 'select * from public.admin_reclamos()', [], /NO_ADMIN/);
await falla('2 moderador no ve anomalías', 'select * from public.admin_anomalias()', [], /NO_ADMIN/);

// ---------- 5. completar_registro
await como(U.google);
pasa('5 estado_registro pide fecha', (await uno('select public.estado_registro() v')).v.falta_fecha === true);
await falla('5 menor no completa', `select public.completar_registro('55555555','2015-01-01',true,true,false,'Gabi Google')`, [], /MENOR/);
let r5 = await uno(`select public.completar_registro('10000001','1990-01-01',true,true,false,'Gabi Google') v`);
pasa('5 cédula ajena no se confirma con mensaje claro', r5.v.ok === false && !/ya tiene una cuenta/i.test(r5.v.hint), JSON.stringify(r5.v));
for (let i = 0; i < 5; i++) await q(`select public.completar_registro('1000000${(i % 3) + 1}','1990-01-01',true,true,false,'Gabi Google')`);
pasa('5 oráculo de cédulas se frena', (await uno(`select public.completar_registro('10000002','1990-01-01',true,true,false,'Gabi Google') v`)).v.codigo === 'DEMASIADOS');
await raiz(); await db.exec(`delete from private.intentos`); await como(U.google);
pasa('5 completar funciona', (await uno(`select public.completar_registro('55555556','1990-01-01',true,true,false,'Gabi Google') v`)).v.ok === true);
await falla('5 no sobrescribe una cédula', `select public.completar_registro('55555557','1990-01-01',true,true,false,'x')`, [], /CEDULA_YA/);
await como(U.neg); await falla('5 negocio no puede usarla', `select public.completar_registro('55555558','1990-01-01')`, [], /SOLO_PERSONAS/);
await como(U.ana); await falla('1 no edita su fecha de nacimiento', `update public.perfiles_privados set fecha_nacimiento='2015-01-01' where id=$1`, [U.ana], /permission/);

// ---------- 4. Verificación
await raiz();
await db.query(`insert into storage.buckets (id,name) values ('x','x') on conflict do nothing`);
await db.query(`insert into storage.objects (bucket_id,name,owner) values ('documentos_identidad',$1,$3),('documentos_identidad',$2,$3)`, [`cedulas/${U.ana}/frontal-1.webp`, `cedulas/${U.ana}/trasera-1.webp`, U.ana]);
await como(U.ana);
let r4 = await uno(`select public.verificar_mi_cedula($1,$2,'10000001','codigo') v`, [`cedulas/${U.ana}/frontal-1.webp`, `cedulas/${U.ana}/trasera-1.webp`]);
pasa('4 el cliente no se autoverifica', r4.v.verificado === false && r4.v.pendiente === true);
pasa('4 sigue sin verificar', (await uno('select cedula_verificada v from public.perfiles_privados where id=$1', [U.ana])).v === false);
await falla('4 pendiente no abre parches', `insert into public.parches (titulo,categoria,inicio,lugar,lat,lng,cupos_max) values ('Parche ana','chill',now()+interval '1 day','Lugar',4.1,-73.6,5)`, [], /SIN_VERIFICAR/);
const antes = (await q(`select count(*)::int n from storage.objects where bucket_id='documentos_identidad'`))[0];
await db.query(`delete from storage.objects where bucket_id='documentos_identidad' and name like $1`, [`cedulas/${U.ana}/%`]);
await raiz(); pasa('4 no puede borrar sus fotos en revisión', (await uno(`select count(*)::int n from storage.objects where name like $1`, [`cedulas/${U.ana}/%`])).n === 2);
await como(U.adm, 'aal1'); await falla('4 admin sin 2FA no aprueba', 'select public.admin_aprobar_verificacion($1)', [U.ana], /NO_ADMIN|MFA/);
await como(U.adm, 'aal2');
pasa('4 aparece en la cola del admin', (await q('select * from public.admin_verificaciones()')).some(x => x.id === U.ana));
await sirve('4 admin aprueba', 'select public.admin_aprobar_verificacion($1)', [U.ana]);
await raiz();
const a4 = await uno('select cedula_verificada v, cedula_estado e, cedula_hash h, cedula_frontal_path f from public.perfiles_privados where id=$1', [U.ana]);
pasa('4 queda verificada con hash y sin ruta', a4.v && a4.e === 'aprobada' && !!a4.h && a4.f === null);
pasa('4 fotos en cola de depuración', (await uno(`select count(*)::int n from public.archivos_por_borrar where ruta like $1`, [`cedulas/${U.ana}/%`])).n === 2);
await como(U.ana); await sirve('4 ya verificada abre parche', `insert into public.parches (titulo,categoria,inicio,lugar,lat,lng,cupos_max,promo,relampago) values ('Parche ana','chill',now()+interval '1 day','Lugar',4.1,-73.6,5,'promo falsa',true)`);
const pAna = await uno(`select id, promo, relampago, aliado from public.parches where titulo='Parche ana'`);
pasa('11 persona no publica promo ni relámpago', pAna.promo === null && pAna.relampago === false && pAna.aliado === false);

// ---------- 3. Permisos
await como(U.beto);
await sirve('3 unirse a parche', 'insert into public.parche_miembros (parche_id) values ($1)', [pAna.id]);
await sirve('3 ofrecer viaje', `insert into public.viajes (parche_id,medio,puestos,desde,hora) values ($1,'carro',3,'Barrio','18:30')`, [pAna.id]);
await falla('3 hora inválida', `update public.viajes set hora='29:99' where parche_id=$1`, [pAna.id]);
await falla('3 no suplanta el autor del viaje', `insert into public.viajes (parche_id,usuario_id,medio,puestos,desde) values ($1,$2,'carro',3,'Barrio')`, [pAna.id, U.ana], /permission/);
await como(U.ana);
const vj = await uno('select id from public.viajes where parche_id=$1', [pAna.id]);
await sirve('3 subirse a un viaje', 'insert into public.viaje_pasajeros (viaje_id) values ($1)', [vj.id]);
const en = await uno(`select public.crear_encuesta($1,'¿Vamos?',array['Sí','No']) v`, [pAna.id]);
await sirve('3 votar con upsert', `insert into public.encuesta_votos (encuesta_id, opcion) values ($1,0) on conflict (encuesta_id, usuario_id) do update set encuesta_id=excluded.encuesta_id, opcion=excluded.opcion`, [en.v]);
await sirve('3 cambiar voto', `insert into public.encuesta_votos (encuesta_id, opcion) values ($1,1) on conflict (encuesta_id, usuario_id) do update set encuesta_id=excluded.encuesta_id, opcion=excluded.opcion`, [en.v]);
await falla('3 opción inexistente', `update public.encuesta_votos set opcion=4 where encuesta_id=$1`, [en.v]);
await sirve('3 lista de espera', 'select * from public.lista_espera');
await sirve('3 bloquear', 'insert into public.bloqueos (bloqueado) values ($1)', [U.caro]);
await sirve('3 desbloquear', 'delete from public.bloqueos where bloqueado=$1', [U.caro]);
await falla('3 no lee qr_identidad', 'select * from public.qr_identidad', [], /permission/);
await falla('3 no lee clics', 'select * from public.clics_boleteria', [], /permission/);
const tk = await uno('select public.iniciar_ubicacion_viva($1) v', [pAna.id]);
await sirve('3 actualizar ubicación', `update public.ubicaciones_vivas set lat=4.1,lng=-73.6,precision_m=10 where token=$1`, [tk.v]);
await falla('3 no alarga la vigencia', `update public.ubicaciones_vivas set vence=now()+interval '30 days' where token=$1`, [tk.v], /permission/);
await falla('11 no crea notificaciones', `insert into public.notificaciones (usuario_id,texto) values ($1,'x')`, [U.ana], /permission/);
await sirve('11 marca leídas', `update public.notificaciones set leida=true where usuario_id=$1`, [U.ana]);
await falla('11 push con dominio raro', `select public.registrar_push('https://malo.com/x','a','b')`, [], /PUSH_INVALIDO/);
for (let i = 0; i < 7; i++) await q(`select public.registrar_push($1,'a','b')`, ['https://fcm.googleapis.com/fcm/send/' + i]);
pasa('11 máximo 5 dispositivos', (await uno('select count(*)::int n from public.push_suscripciones where usuario_id=$1', [U.ana])).n === 5);
await como(U.beto); await sirve('11 celular compartido cambia de dueño', `select public.registrar_push('https://fcm.googleapis.com/fcm/send/6','a','b')`);
await raiz(); pasa('11 reasignado', (await uno(`select usuario_id u from public.push_suscripciones where endpoint like '%/send/6'`)).u === U.beto);

// ---------- 6, 9. Cobros
await como(U.neg);
await sirve('6 negocio publica', `insert into public.parches (titulo,categoria,inicio,lugar,lat,lng,cupos_max,modalidad,precio_paquete) values ('Noche paquete','rumba',now()+interval '10 minutes','Capachos',4.1,-73.6,10,'paquete',40000)`);
const pN = await uno(`select id, plan_aplicado pa, tarifa_snapshot ts, comision_pct_snapshot cs, aliado, verificado from public.parches where titulo='Noche paquete'`);
pasa('6 congela plan y tarifa', pN.pa === 'villavo' && pN.ts === 2500 && pN.cs === 10);
pasa('11 sin verificar no lleva sello', pN.aliado === true && pN.verificado === false);
await como(U.beto); await sirve('6 cliente se une', 'insert into public.parche_miembros (parche_id) values ($1)', [pN.id]);
await como(U.neg);
await falla('6 no baja el precio con gente', 'update public.parches set precio_paquete=1000 where id=$1', [pN.id], /COBRO_FIRME/);
await falla('6 no cambia modalidad con gente', `update public.parches set modalidad='mesa', precio_paquete=null where id=$1`, [pN.id], /COBRO_FIRME/);
await sirve('6 sí edita otros datos', `update public.parches set descripcion='Nueva' where id=$1`, [pN.id]);
let r6 = await uno(`select public.elegir_plan('basico') v`);
pasa('6 bajar a básico con parches activos se programa', r6.v.aplicado === false && !!r6.v.programado_en, JSON.stringify(r6.v));
pasa('6 sigue en Villavo', (await uno('select plan p from public.negocios where id=$1', [U.neg])).p === 'villavo');
r6 = await uno(`select public.elegir_plan('sedes') v`);
pasa('6 sedes queda solicitado', r6.v.solicitado === true && (await uno('select plan p from public.negocios where id=$1', [U.neg])).p === 'villavo');
await sirve('6 volver a villavo cancela lo programado', `select public.elegir_plan('villavo')`);
await como(U.beto);
await sirve('9 GPS del cliente en parche de local', 'select public.checkin_gps($1,4.1,-73.6,10)', [pN.id]);
await raiz(); pasa('9 GPS solo no genera cobro', (await uno('select count(*)::int n from public.cobros where parche_id=$1', [pN.id])).n === 0);
await como(U.neg); await sirve('9 el local confirma', 'select public.organizador_checkin($1,$2,true)', [pN.id, U.beto]);
await raiz(); const c9 = await uno('select monto_cop m, validado_por v from public.cobros where parche_id=$1', [pN.id]);
pasa('9 confirmado genera cobro de 10%', c9 && c9.m === 4000 && c9.v === 'organizador', JSON.stringify(c9));
// Evasión: cambiar plan a básico no baja lo cobrado
await db.query(`update public.negocios set plan='basico' where id=$1`, [U.neg]);
await como(U.neg); await sirve('6 desmarcar en plazo', 'select public.organizador_checkin($1,$2,false)', [pN.id, U.beto]);
await sirve('6 remarcar', 'select public.organizador_checkin($1,$2,true)', [pN.id, U.beto]);
await raiz(); pasa('6 básico no deja el cobro en $0', (await uno('select monto_cop m from public.cobros where parche_id=$1', [pN.id])).m === 4000);
await db.query(`update public.negocios set plan='villavo' where id=$1`, [U.neg]);
// Tope mensual
await db.query(`update public.negocios set plan='basico' where id=$1`, [U.neg2]);
await como(U.neg2);
for (const t of ['Uno del mes', 'Dos del mes']) await sirve('6 básico publica', `insert into public.parches (titulo,categoria,inicio,lugar,lat,lng,cupos_max) values ($1,'rumba',now()+interval '2 days','Local',4.1,-73.6,10)`, [t]);
await sirve('6 borra uno', `delete from public.parches where titulo='Dos del mes'`);
await falla('6 borrar no libera el tope', `insert into public.parches (titulo,categoria,inicio,lugar,lat,lng,cupos_max) values ('Tres del mes','rumba',now()+interval '2 days','Local',4.1,-73.6,10)`, [], /LIMITE_PLAN/);
// Mesas
await raiz();
const pro = await uno(`insert into public.mesa_promos (negocio_id,titulo,beneficio,min_personas,max_personas,dias,hora_desde,hora_hasta,mesas_por_dia) values ($1,'Mesa de prueba','Botella de la casa',2,8,'{0,1,2,3,4,5,6}','00:00','23:59',5) returning id, tarifa_snapshot t`, [U.neg]);
pasa('6 promo congela tarifa', pro.t === 2500);
const res = await uno(`insert into public.mesa_reservas (promo_id,negocio_id,usuario_id,personas,llegada,codigo) values ($1,$2,$3,4,now()+interval '10 minutes','MESA-TEST1') returning id`, [pro.id, U.neg, U.caro]);
await db.query(`insert into public.negocio_qr (negocio_id, secreto) values ($1,'clave-secreta')`, [U.neg]);
await como(U.caro);
await falla('9 reserva pendiente no marca llegada', 'select public.mesa_llegue($1,4.1,-73.6,10)', [res.id], /NO_CONFIRMADA/);
let q9 = await uno(`select public.llegue_por_qr_local($1,'mala',4.1,-73.6) v`, [U.neg]);
pasa('9 QR con clave mala no lanza y se cuenta', q9.v.ok === false && q9.v.codigo === 'QR_INVALIDO');
await falla('9 QR sin ubicación', `select public.llegue_por_qr_local($1,'clave-secreta')`, [U.neg], /SIN_UBICACION/);
await falla('9 QR desde lejos', `select public.llegue_por_qr_local($1,'clave-secreta',4.3,-73.9)`, [U.neg], /LEJOS/);
await falla('9 QR con reserva sin confirmar', `select public.llegue_por_qr_local($1,'clave-secreta',4.1,-73.6)`, [U.neg], /NADA_HOY/);
await como(U.neg); await sirve('9 local confirma mesa', `select public.negocio_mesa_estado($1,'confirmada')`, [res.id]);
await como(U.caro);
const g9 = await uno('select public.mesa_llegue($1,4.1,-73.6,10) v', [res.id]);
pasa('9 GPS de mesa queda por confirmar', g9.v.por_confirmar === true);
await raiz(); pasa('9 GPS de mesa no cobra', (await uno('select count(*)::int n from public.cobros where reserva_id=$1', [res.id])).n === 0);
await como(U.caro); pasa('9 QR válido marca la mesa', (await uno(`select public.llegue_por_qr_local($1,'clave-secreta',4.1,-73.6) v`, [U.neg])).v.tipo === 'mesa');
await raiz(); pasa('9 QR genera cobro por personas', (await uno('select monto_cop m from public.cobros where reserva_id=$1', [res.id])).m === 10000);
await como(U.neg);
await falla('6 no anula una llegada por QR', `select public.negocio_mesa_estado($1,'no_llego')`, [res.id], /USA_RECLAMO/);
await sirve('6 sí corrige cuántas personas', 'select public.negocio_mesa_llegaron($1,2)', [res.id]);
await raiz(); pasa('6 cobro baja por personas, no por tarifa', (await uno('select monto_cop m from public.cobros where reserva_id=$1', [res.id])).m === 5000);
for (let i = 0; i < 9; i++) { await como(U.ana); await q(`select public.llegue_por_qr_local($1,'mala',4.1,-73.6)`, [U.neg]); }
await como(U.ana); pasa('9 rate limit de clave', (await uno(`select public.llegue_por_qr_local($1,'clave-secreta',4.1,-73.6) v`, [U.neg])).v.codigo === 'DEMASIADOS');

// ---------- 7. Deudas y Wompi
await como(U.neg); await falla('7 con cobros sin liquidar no borra la cuenta', 'select public.borrar_mi_cuenta()', [], /TIENE_DEUDA/);
await raiz();
const li = await uno(`insert into public.liquidaciones (negocio_id,periodo,clientes,total_cop,referencia,estado,vence,negocio_nombre) values ($1,'2026-09-01',2,5000,'MP-2609-AAAAAA','pendiente',current_date+10,'Los Capachos') returning id`, [U.neg]);
const pago = async (ref, m) => db.query(`insert into public.pagos (negocio_id,referencia,plan,liquidacion_id,monto_centavos) values ($1,$2,'liquidacion',$3,$4)`, [U.neg, ref, li.id, m]);
const apl = async (ref, m, w) => (await uno(`select public.aplicar_pago_wompi($1,'APPROVED',$2,'CARD',$3,'COP') v`, [ref, w, m])).v;
const cred0 = (await uno('select credito_cop c from public.negocios where id=$1', [U.neg])).c;
await pago('MP-TEST-0001', 300000); await pago('MP-TEST-0002', 300000);
await apl('MP-TEST-0001', 300000, 'tx1');
pasa('7 mismo evento no aplica doble', (await apl('MP-TEST-0001', 300000, 'tx1')).ya_aplicado === true);
pasa('7 misma transacción en otro pago se rechaza', (await apl('MP-TEST-0002', 300000, 'tx1')).motivo === 'TRANSACCION_REPETIDA');
await apl('MP-TEST-0002', 300000, 'tx2');
const l7 = await uno('select pagado_cop p, estado e from public.liquidaciones where id=$1', [li.id]);
pasa('7 pagado topado al total', l7.p === 5000 && l7.e === 'pagada', JSON.stringify(l7));
pasa('7 excedente real a favor', (await uno('select credito_cop c from public.negocios where id=$1', [U.neg])).c === cred0 + 1000);
await db.query(`update public.liquidaciones set estado='anulada' where id=$1`, [li.id]);
await pago('MP-TEST-0003', 100000); await apl('MP-TEST-0003', 100000, 'tx3');
pasa('7 no resucita anuladas', (await uno('select estado e from public.liquidaciones where id=$1', [li.id])).e === 'anulada');
await db.query(`update public.liquidaciones set estado='pagada' where id=$1`, [li.id]);
await sirve('7 generar liquidaciones', 'select private.generar_liquidaciones()');

// ---------- 8. Referidos
await db.query(`update public.negocios set codigo_referido='CAPAC-0001', verificado=false, credito_cop=0, referido_por=null, referido_premiado=false where id=$1`, [U.neg]);
await db.query(`update public.negocios set codigo_referido='OTROL-0001', credito_cop=0 where id=$1`, [U.neg2]);
await como(U.neg3); await falla('8 sin NIT no usa código', `select public.usar_codigo_referido('CAPAC-0001')`, [], /NIT/);
await raiz(); await db.query(`update public.negocios set nit=$1 where id=$2`, ['900123456-9', U.neg3]);
await como(U.neg3); await falla('8 mismo NIT no usa código', `select public.usar_codigo_referido('CAPAC-0001')`, [], /misma empresa/);
await como(U.neg2); await sirve('8 NIT distinto sí', `select public.usar_codigo_referido('CAPAC-0001')`);
await como(U.neg); await falla('8 referido circular', `select public.usar_codigo_referido('OTROL-0001')`, [], /entre los dos/);
await raiz();
const l8 = await uno(`insert into public.liquidaciones (negocio_id,periodo,clientes,total_cop,referencia,estado,vence) values ($1,'2026-08-01',1,20000,'MP-2608-BBBBBB','pendiente',current_date+5) returning id`, [U.neg2]);
await db.query(`update public.liquidaciones set estado='pagada', pagado_cop=20000 where id=$1`, [l8.id]);
pasa('8 menos de $50.000 no premia', (await uno('select credito_cop c from public.negocios where id=$1', [U.neg2])).c === 0);
const l8b = await uno(`insert into public.liquidaciones (negocio_id,periodo,clientes,total_cop,referencia,estado,vence) values ($1,'2026-07-01',1,40000,'MP-2607-CCCCCC','pendiente',current_date+5) returning id`, [U.neg2]);
await db.query(`update public.liquidaciones set estado='pagada', pagado_cop=40000 where id=$1`, [l8b.id]);
pasa('8 sin verificar no premia', (await uno('select credito_cop c from public.negocios where id=$1', [U.neg2])).c === 0);
await como(U.adm, 'aal2');
await sirve('8 verificar 1', `select public.admin_verificar_negocio($1,true,'')`, [U.neg]);
await raiz(); pasa('8 falta el otro', (await uno('select credito_cop c from public.negocios where id=$1', [U.neg2])).c === 0);
await como(U.adm, 'aal2'); await sirve('8 verificar 2', `select public.admin_verificar_negocio($1,true,'')`, [U.neg2]);
await raiz();
pasa('8 ambos ganan $10.000', (await uno('select credito_cop c from public.negocios where id=$1', [U.neg2])).c === 10000 && (await uno('select credito_cop c from public.negocios where id=$1', [U.neg])).c === 10000);

// ---------- 12. Privacidad
await como(U.caro);
await falla('12 son_amigos de terceros', 'select public.negocio_en_mora($1)', [U.neg], /does not exist|permission/);
pasa('12 son_amigos no responde por terceros', (await uno('select public.son_amigos($1,$2) v', [U.ana, U.beto])).v === false);
await sirve('12 ve parches (política con mora)', 'select id from public.parches limit 5');
await raiz(); await db.query(`update public.ubicaciones_vivas set activa=false where token=$1`, [tk.v]);
await anon(); const u12 = await uno('select public.ubicacion_por_token($1) v', [tk.v]);
pasa('12 ubicación apagada sin coordenadas', u12.v.lat === null && u12.v.lng === null && u12.v.precision === null);
await como(U.caro);
await falla('12 foto de perfil ajena', `update public.perfiles set foto_encuadre='{"src":"https://evil.com/a.jpg"}', mostrar_foto_real=true where id=$1`, [U.caro], /IMAGEN/);
await sirve('12 foto propia', `update public.perfiles set foto_encuadre=$1, mostrar_foto_real=true where id=$2`, [JSON.stringify({ src: `https://quxqqxnowlwiahorifpy.supabase.co/storage/v1/object/public/fotos/${U.caro}/a1.jpg`, zoom: 1, x: 0, y: 0 }), U.caro]);
await sirve('12 oculta la foto', `update public.perfiles set mostrar_foto_real=false where id=$1`, [U.caro]);
pasa('12 foto oculta no queda expuesta', (await uno(`select foto_encuadre->>'src' s from public.perfiles where id=$1`, [U.caro])).s === '');
await como(U.beto);
await falla('12 álbum: no acepta URL externa', `insert into public.fotos_parche (parche_id,url,ruta) values ($1,'https://evil.com/x.jpg',$2)`, [pAna.id, `${pAna.id}/${U.beto}/album-1.jpg`]);
await sirve('12 álbum privado', `insert into public.fotos_parche (parche_id,url,ruta) values ($1,'privada',$2)`, [pAna.id, `${pAna.id}/${U.beto}/album-1.jpg`]);

// ---------- 13. Filtro, XSS y errores
await como(U.ana);
const manda = t => db.query('insert into public.mensajes (parche_id,texto) values ($1,$2)', [pAna.id, t]);
for (const m of ['https://google.com:x@malo.com/a', 'https://google.com\\@malo.com', 'https://goo.gl/abc', 'https://modoparche-falso.vercel.app/x', 'mira malo.xyz', 'http://192.168.0.1/a']) {
  try { await manda(m); pasa('13 bloquea ' + m, false); } catch (e) { pasa('13 bloquea ' + m, /ENLACE/.test(e.message)); }
  await raiz(); await db.exec('delete from public.mensajes where tipo=\'user\''); await como(U.ana);
}
for (const m of ['https://maps.app.goo.gl/abc', 'https://www.instagram.com/x', 'https://modoparche.vercel.app/p/1', 'nos vemos a las 8. Listo']) { await sirve('13 permite ' + m, 'insert into public.mensajes (parche_id,texto) values ($1,$2)', [pAna.id, m]); await raiz(); await db.exec('delete from public.mensajes where tipo=\'user\''); await como(U.ana); }
await falla('13 encuesta con enlace', `select public.crear_encuesta($1,'¿Vamos?',array['https://malo.xyz','No'])`, [pAna.id], /ENLACE/);
await raiz();
await db.query(`insert into public.notificaciones (usuario_id,texto) values ($1,$2)`, [U.ana, '<b>Hola</b> <img src=x onerror=alert(1)> <b onclick=x>a</b>' + 'x'.repeat(400)]);
const nx = await uno(`select texto t from public.notificaciones where texto like '%onerror%'`);
pasa('13 notificación sin HTML peligroso', nx && !/<img/.test(nx.t) && !/<b onclick/.test(nx.t) && nx.t.startsWith('<b>Hola</b>') && nx.t.length <= 300);
await anon();
for (let i = 0; i < 25; i++) await q(`insert into public.errores_cliente (pagina,mensaje,navegador) values ('/x','m','UA fija')`);
await raiz(); const ne = (await uno(`select count(*)::int n from public.errores_cliente`)).n;
pasa('13 cuota por origen', ne === 15, String(ne));

// ---------- 14. mis_datos
await como(U.ana);
const md = (await uno('select public.mis_datos() v')).v;
for (const k of ['amistades', 'mensajes_directos', 'viajes', 'viajes_como_pasajero', 'encuestas', 'votos', 'fotos_album', 'bloqueos', 'ubicaciones_compartidas', 'resenas_de_locales', 'cobros_del_negocio', 'estados_de_cuenta', 'reclamos', 'dispositivos_con_avisos', 'consentimientos']) pasa('14 mis_datos incluye ' + k, k in md);
await como(U.neg); await sirve('14 cuenta del negocio', 'select public.mi_cuenta_cobros()');

// ---------- 7. Historial sobrevive
await raiz();
await db.exec(`update public.liquidaciones set estado='pagada' where negocio_id='${U.neg2}'; update public.cobros set anulado=true where negocio_id='${U.neg2}'`);
const antesL = (await uno('select count(*)::int n from public.liquidaciones where referencia=$1', ['MP-2608-BBBBBB'])).n;
await como(U.neg2); await sirve('7 sin deudas sí borra la cuenta', 'select public.borrar_mi_cuenta()');
await raiz();
const hist = await uno('select negocio_id, negocio_nombre n from public.liquidaciones where referencia=$1', ['MP-2608-BBBBBB']);
pasa('7 historial contable sobrevive', antesL === 1 && hist && hist.negocio_id === null && hist.n === 'Otro Local', JSON.stringify(hist));

console.log(`\nPASARON ${ok} · FALLARON ${mal}`);
fallos.forEach(f => console.log(' ✗', f));

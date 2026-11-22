-- =====================================================================
-- ModoParche · Quitar "la vaca" de los textos guardados en la base
-- Se puede correr más de una vez. No borra datos: solo cambia frases.
-- =====================================================================
do $$
declare f regprocedure; d text;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f' and p.prosrc ilike '%vaca%'
      and p.proname <> 'quitar_vaca'
  loop
    d := pg_get_functiondef(f);
    d := replace(d, 'la llegada, la vaca y la previa', 'la llegada y la previa');
    d := replace(d, 'la llegada y la vaca para el transporte', 'la llegada y el transporte');
    d := replace(d, '¿Pagamos por aparte o hacemos vaca?', '¿Pagamos por aparte?');
    execute d;
  end loop;
end $$;

update public.parches
   set descripcion = replace(descripcion, 'la llegada y la vaca para el transporte', 'la llegada y el transporte')
 where descripcion like '%la llegada y la vaca para el transporte%';

update public.mensajes
   set texto = replace(replace(texto, 'la llegada, la vaca y la previa', 'la llegada y la previa'),
                       '¿Pagamos por aparte o hacemos vaca?', '¿Pagamos por aparte?')
 where (tipo = 'sys' and texto like '%la llegada, la vaca y la previa%')
    or (semilla and texto like '%¿Pagamos por aparte o hacemos vaca?%');

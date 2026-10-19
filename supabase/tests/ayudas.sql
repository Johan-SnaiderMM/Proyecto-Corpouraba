-- Ayudas para escribir pruebas en SQL. Cada prueba imprime "ok: ..." o detiene todo con "FALLÓ: ...".

create schema pruebas;
grant usage on schema pruebas to anon, authenticated, service_role;

-- Comprueba que una condición sea verdadera.
create function pruebas.esperar(condicion boolean, mensaje text) returns void
language plpgsql as $$
begin
  if condicion is not true then
    raise exception 'FALLÓ: %', mensaje;
  end if;
  raise notice 'ok: %', mensaje;
end $$;

-- Ejecuta una consulta que DEBE fallar y comprueba que el mensaje de error contenga "patron".
create function pruebas.esperar_error(consulta text, patron text, mensaje text) returns void
language plpgsql as $$
begin
  begin
    execute consulta;
  exception when others then
    if sqlerrm ilike '%' || patron || '%' then
      raise notice 'ok: % (error esperado: %)', mensaje, sqlerrm;
      return;
    end if;
    raise exception 'FALLÓ: % — el error fue otro: %', mensaje, sqlerrm;
  end;
  raise exception 'FALLÓ: % — debía dar error y no lo dio', mensaje;
end $$;

grant execute on all functions in schema pruebas to anon, authenticated, service_role;

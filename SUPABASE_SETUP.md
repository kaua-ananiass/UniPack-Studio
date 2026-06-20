# Supabase Setup

## Arquivos adicionados

- `supabase/schema.sql`
- `static/supabase-config.example.js`
- `static/supabase-service.js`

## Sequencia recomendada

1. Crie um projeto no Supabase.
2. No painel do Supabase, abra `SQL Editor`.
3. Rode o arquivo `supabase/schema.sql`.
4. No painel do Supabase, copie:
   - `Project URL`
   - `Publishable key`
5. Copie `static/supabase-config.example.js` para `static/supabase-config.js`.
6. Preencha `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
7. No Supabase, abra `Authentication > Providers > Anonymous` e ative `Anonymous sign-ins`.
8. Reinicie o `python3 server.py`.
9. No proximo passo, conecte `app.js` ao `supabase-service.js` para:
   - carregar biblioteca online
   - publicar animacao
   - remover animacao publicada pelo autor

## O que cada arquivo faz

### `supabase/schema.sql`

Cria a tabela publica `led_library` com:

- dados da animacao
- autor
- visibilidade publica
- policies RLS

### `static/supabase-config.js`

Esse arquivo fica com as chaves do projeto usadas pelo navegador.

Exemplo:

```js
export const SUPABASE_URL = "https://abcxyz.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sua-chave-publica";
export const SUPABASE_LIBRARY_TABLE = "led_library";
```

### `static/supabase-service.js`

Ja deixa prontas as funcoes para:

- inicializar o cliente
- login anonimo
- buscar animacoes publicas
- publicar animacao
- apagar animacao publicada

## Observacoes

- Nao use `service_role` no navegador.
- O editor atual ainda continua local. Esses arquivos so preparam a integracao.
- O proximo passo e ligar essas funcoes ao fluxo da `Biblioteca de animacoes`.

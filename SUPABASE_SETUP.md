# Supabase Setup

## Arquivos desta integracao

- `supabase/schema.sql`
- `static/supabase-config.example.js`
- `static/supabase-service.js`

## Sequencia recomendada

1. Crie seu projeto no Supabase.
2. Em `Authentication > Sign In / Providers`, deixe ativo apenas `Email`.
3. Em `Authentication > URL Configuration`, configure a URL do seu site e a URL de redirecionamento do email.
4. Abra `SQL Editor` e rode novamente `supabase/schema.sql`.
5. Copie `static/supabase-config.example.js` para `static/supabase-config.js`.
6. Preencha:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
7. Reinicie o editor local com `python3 server.py`.
8. Teste:
   - criar conta com email e senha
   - confirmar o email recebido
   - entrar no editor
   - salvar um projeto na conta
   - publicar uma animacao
   - enviar um corte de audio para um projeto online

## O que o schema agora protege

### `public.led_library`

- leitura publica apenas para animacoes marcadas como publicas
- insercao, edicao e exclusao apenas pelo dono autenticado
- `author_id` e `author_name` preenchidos no banco, nao pelo navegador
- limites de tamanho e formato para nome, cor, velocidade, loop e eventos

### `public.projects`

- cada usuario so le e altera os proprios projetos
- `project_data` precisa ser um objeto JSON valido
- limite de tamanho para evitar payload exagerado

### `storage/project-audio`

- cada audio precisa ficar no caminho `user_id/project_id/arquivo.wav`
- o banco valida se o `project_id` realmente pertence ao usuario logado
- um usuario nao consegue ler, sobrescrever ou apagar audio de outro projeto

## Sobre a chave do Supabase

- `SUPABASE_PUBLISHABLE_KEY` pode aparecer no frontend e em repositorio publico
- o que nao pode vazar e a `service_role`
- a seguranca real fica nas policies RLS e nas regras do Storage

## Git e seguranca

- `static/supabase-config.js` esta no `.gitignore`
- use apenas `static/supabase-config.example.js` como modelo versionado
- se `static/supabase-config.js` ja entrou no Git antes, remova do indice antes de subir

## Observacoes

- depois de mudar o `schema.sql`, rode ele de novo no Supabase para aplicar trigger, funcoes e policies novas
- se o projeto estiver no Render, basta subir o commit novo que ele redeploya automaticamente
- a biblioteca online depende do login com email e senha; login anonimo nao e mais necessario

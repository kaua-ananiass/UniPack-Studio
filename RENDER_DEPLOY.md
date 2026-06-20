# Deploy no Render

## O que ja ficou pronto

- `render.yaml`
- `requirements.txt`
- `server.py` aceitando `HOST` e `PORT`

## Limites importantes do projeto atual

O app sobe no Render, mas algumas funcoes do editor atual continuam sendo de ambiente local:

- escolher pasta do PC com seletor nativo
- ler/escrever packs em qualquer pasta local do usuario
- manter arquivos locais no disco do servidor gratis

No Render Free, o filesystem e efemero. Ou seja, qualquer arquivo salvo localmente pode sumir quando o servico reiniciar.

Por isso, para uso publico, o melhor caminho e:

- biblioteca de animacoes no Supabase
- export/download pelo navegador
- menos dependencia de pasta local do servidor

## Como subir

1. Envie este projeto para o GitHub.
2. No Render, clique em `New +`.
3. Escolha `Blueprint`.
4. Conecte o repositorio do GitHub.
5. O Render vai ler `render.yaml` automaticamente.
6. Confirme o deploy do servico `unipack-studio`.

## Se preferir criar manualmente

- `Service type`: Web Service
- `Runtime`: Python
- `Root Directory`: deixe vazio
- `Build Command`: `pip install -r requirements.txt`
- `Start Command`: `python3 server.py --host 0.0.0.0 --port $PORT`
- `Plan`: Free

## Dominio `unipackstudio.com`

Depois do deploy:

1. Abra o servico no Render.
2. Va em `Settings > Custom Domains`.
3. Adicione:
   - `unipackstudio.com`
   - `www.unipackstudio.com`
4. O Render vai mostrar os registros DNS que precisam ser criados.
5. No painel da Hostinger, abra a zona DNS do dominio.
6. Crie exatamente os registros mostrados pelo Render.
7. Volte ao Render e clique em `Verify`.

## Recomendacao

Para lancar rapido:

- suba no Render
- use Supabase para a biblioteca online
- trate o restante do editor como fase 2 da versao web

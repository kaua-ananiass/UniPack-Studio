# Unipack Studio

Editor local para projetos do UniPad, feito em cima da estrutura real deste pack.

## O que foi identificado neste projeto

Este pack segue a estrutura padrao do UniPad:

```text
Info
Sounds/
keySound
keyLED/
autoPlay
```

### `Info`

Metadados simples no formato `chave=valor`.

Exemplo deste projeto:

- `title=Alan Walker - The Spectre`
- `producerName=Clement Show`
- `buttonX=8`
- `buttonY=8`
- `chain=8`

### `keySound`

Cada linha mapeia um som para um pad:

```text
chain x y arquivo.wav [loop] [wormhole]
```

Exemplo:

```text
1 8 1 001.wav
2 8 1 Kick.wav
```

Quando o mesmo `chain x y` aparece varias vezes, o UniPad gira os sons em fila circular a cada toque.

### `keyLED/`

Cada arquivo representa a animacao de LED disparada por um pad. O nome do arquivo comeca com:

```text
chain x y [loop]
```

Neste projeto aparecem arquivos como:

```text
3 3 8 1 a
7 4 4 1 b
```

O sufixo `a`, `b` etc. serve apenas para diferenciar arquivos repetidos no mesmo pad. O parser do UniPad usa os primeiros numeros e ignora o resto do nome.

Dentro do arquivo, os comandos principais sao:

- `o x y a 3` liga LED com paleta do Launchpad
- `o x y FF0000` liga LED com cor HEX
- `f x y` desliga LED
- `d 35` espera em milissegundos
- `c 2` troca de chain durante a animacao

### `autoPlay`

Sequencia global do modo automatico/pratica:

```text
c 1
o 8 1
d 265
f 8 1
```

Comandos suportados:

- `o x y`
- `f x y`
- `t x y`
- `d ms`
- `c chain`

## Como usar o editor

No terminal, dentro desta pasta:

```bash
cd unipack_editor
python3 server.py
```

Depois abra:

```text
http://127.0.0.1:8765
```

## Deploy no Render

Existe uma base pronta para deploy em:

- [RENDER_DEPLOY.md](/Users/user/Downloads/_The_Spectre/unipack_editor/RENDER_DEPLOY.md)
- [render.yaml](/Users/user/Downloads/_The_Spectre/unipack_editor/render.yaml)

Start command usado no Render:

```bash
python3 server.py --host 0.0.0.0 --port $PORT
```

## Configuracao segura do Supabase

- Use `static/supabase-config.example.js` como modelo.
- Mantenha suas chaves reais apenas em `static/supabase-config.js`.
- Esse arquivo agora esta no `.gitignore` e nao deve ser enviado ao GitHub.
- Se ele ja foi versionado antes, remova do indice do Git para evitar novos commits com esse conteudo.

## O que o editor faz

- Carrega a pasta do projeto real
- Mostra a grade por `chain`
- Permite editar os sons de cada pad
- Permite editar as animacoes de LED de cada pad
- Permite editar a timeline do `autoPlay`
- Salva tudo de volta nos arquivos do pack

## Observacoes

- Em projeto local, os cortes criados no editor sao salvos dentro de `Sounds/` e ja entram no pad escolhido.
- Em projeto online, os cortes ficam vinculados ao projeto pelo Supabase Storage e reaparecem ao abrir o projeto novamente.
- Ao salvar, a pasta `keyLED/` e recriada para evitar arquivos antigos sobrando.
- Se voce zipar o pack para distribuir, compacte apenas os arquivos do projeto UniPad. A pasta `unipack_editor/` e a ferramenta de edicao, nao faz parte do pack.

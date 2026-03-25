# Deploy no Fly

## O que ja foi feito

### Bot

- O backend agora aceita `PORT` da Fly.
- O banco SQLite e os uploads agora aceitam `DATA_DIR`, `DB_PATH` e `UPLOADS_DIR`.
- Foi criado um `Dockerfile` na raiz.
- Foi criado um `fly.toml` para o app `itadoritrue`.
- O `fly.toml` do bot foi ajustado para modo sempre ativo, sem auto-stop.
- Foi criado `.dockerignore` para o bot.

Arquivos principais:

- `Dockerfile`
- `.dockerignore`
- `fly.toml`
- `handlers/dashboard.js`
- `utils/db.js`

### Dashboard v2

- O `dashboard-v2` foi preparado para build standalone do Next.
- Foi criado `dashboard-v2/Dockerfile`.
- Foi criado `dashboard-v2/fly.toml` para o app `itadori-dashboard`.
- Foi criado `dashboard-v2/.dockerignore`.

Arquivos principais:

- `dashboard-v2/next.config.ts`
- `dashboard-v2/Dockerfile`
- `dashboard-v2/.dockerignore`
- `dashboard-v2/fly.toml`

## O que falta fazer

### Bot

1. Criar o volume persistente no Fly:

```powershell
fly volumes create data --size 1 -r gru -a itadoritrue
```

2. Configurar os secrets do bot:

```powershell
fly secrets set `
  DISCORD_TOKEN='SEU_TOKEN' `
  CLIENT_ID='SEU_CLIENT_ID' `
  GUILD_ID='SEU_GUILD_ID' `
  OWNER_ID='SEU_OWNER_ID' `
  DASHBOARD_ORIGIN='https://itadori-dashboard.fly.dev,https://itadori-dashboard.vercel.app,http://localhost:3000,http://localhost:3001,http://localhost:3002' `
  DISCORD_CLIENT_SECRET='SEU_CLIENT_SECRET' `
  OAUTH_REDIRECT_URI='https://itadoritrue.fly.dev/auth/discord/callback' `
  FRONTEND_URL='https://itadori-dashboard.fly.dev' `
  SESSION_SECRET='UMA_STRING_ALEATORIA_GRANDE' `
  PUBLIC_BASE_URL='https://itadoritrue.fly.dev' `
  DATA_DIR='/data' `
  NEWS_API_KEY='SUA_CHAVE' `
  SERP_API_KEY='SUA_CHAVE' `
  GROQ_API_KEY='SUA_CHAVE' `
  RAPIDAPI_KEY='SUA_CHAVE' `
  -a itadoritrue
```

3. Fazer o deploy:

```powershell
fly deploy -a itadoritrue
```

4. Conferir status e logs:

```powershell
fly status -a itadoritrue
fly logs -a itadoritrue
```

### Dashboard v2

1. Criar o app do dashboard se ainda nao existir:

```powershell
cd "C:\Users\tiuku\Documents\BOT DISCORD\dashboard-v2"
fly launch
```

2. Configurar env do frontend:

```powershell
fly secrets set `
  NEXT_PUBLIC_BOT_API='https://itadoritrue.fly.dev' `
  NEXT_PUBLIC_CLIENT_ID='598326915522101270' `
  -a itadori-dashboard
```

3. Fazer o deploy:

```powershell
fly deploy -a itadori-dashboard
```

4. Conferir logs:

```powershell
fly logs -a itadori-dashboard
```

## Ordem recomendada

1. Subir o bot primeiro.
2. Testar `https://itadoritrue.fly.dev/api/stats`.
3. Subir o `dashboard-v2`.
4. Confirmar login OAuth no Discord.
5. Ajustar `DASHBOARD_ORIGIN` e `FRONTEND_URL` se a URL final do dashboard mudar.

## Onde vai cada env

### Fly do bot

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_SECRET`
- `SESSION_SECRET`
- `CLIENT_ID`
- `GUILD_ID`
- `OWNER_ID`
- `DASHBOARD_ORIGIN`
- `OAUTH_REDIRECT_URI`
- `FRONTEND_URL`
- `PUBLIC_BASE_URL`
- `DATA_DIR`
- APIs privadas

### Fly do dashboard

- `NEXT_PUBLIC_BOT_API`
- `NEXT_PUBLIC_CLIENT_ID`

## Importante

- O bot e o dashboard sao dois apps Fly separados.
- O app do bot sai da raiz `BOT DISCORD`.
- O app do dashboard sai de `dashboard-v2`.
- O bot ficou configurado para ficar sempre online na Fly com `auto_stop_machines = "off"`.
- Se voce mantiver o dashboard na Vercel, nao precisa subir o `dashboard-v2` no Fly.
- Como secrets reais ja apareceram no terminal/chat, rotacione os mais sensiveis.

<div align="center">

<!-- BANNER -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a0533,50:4b0082,100:8b00ff&height=200&section=header&text=Itadori%20Bot&fontSize=60&fontColor=ffffff&fontAlignY=38&desc=O%20bot%20que%20não%20rejeita%20nenhum%20comando&descAlignY=58&descSize=16" width="100%"/>

<br/>

[![Discord.js](https://img.shields.io/badge/Discord.js-v14.19+-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)

<br/>

> *"Eu não vou deixar nenhum deles morrer. Esse é meu mantra — e o do bot também."*
> — Yuji Itadori

</div>

---

## ⚡ Sobre o Projeto

O **Itadori Bot** é um bot de Discord com a personalidade e energia de **Yuji Itadori** (Jujutsu Kaisen), construído com TypeScript moderno e arquitetura escalável. Vai além de comandos básicos — tem economia, XP, moderação e um sistema de logs digno de um Xamã Grau Especial.

Construído usando os **Components V2 do Discord.js v14.19+**, sistema de banco de dados MongoDB e uma estrutura modular pensada para crescer.

---

## 🧩 Funcionalidades

| Sistema | Descrição | Status |
|---|---|---|
| 🧠 Persona Yuji Itadori | Personalidade integrada nas respostas | ✅ Ativo |
| 🎛️ Components V2 | UI moderna com Discord.js v14.19+ | ✅ Ativo |
| 📊 Sistema de Logs | Níveis: Leve · Padrão · Extremo | ✅ Ativo |
| 👥 Member Count | Contagem automática de membros | ✅ Ativo |
| 🛡️ Moderação | Comandos administrativos completos | ✅ Ativo |
| 💰 Economia & XP | Sistema de progressão de usuários | ✅ Ativo |
| 🗄️ MongoDB | Persistência de dados com Atlas | ✅ Ativo |
| ⚠️ Sistema de Erros | Tratamento estilo Amazon | ✅ Ativo |

---

## 🚀 Início Rápido

### Pré-requisitos

- Node.js `20+`
- npm ou yarn
- Token de Bot do Discord
- URI do MongoDB (opcional)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/AthilaCabrall/ItadoriBot.git
cd ItadoriBot

# Instale as dependências
npm install
```

### Configuração

```bash
# Copie o arquivo de exemplo
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
MONGODB_URI=sua_uri_mongodb_aqui  # Opcional
```

### Deploy dos Comandos

```bash
# Ambiente de teste (guild específica)
npm run deploy:guild <GUILD_ID>

# Produção (global)
npm run deploy:global
```

### Iniciar

```bash
npm start
```

---

## 📁 Estrutura do Projeto

```
ItadoriBot/
├── 📂 commands/
│   ├── 🔒 admin/          # Comandos administrativos
│   ├── 🎉 diversao/       # Comandos de diversão e interação
│   └── 🔧 utility/        # Comandos utilitários
├── 📂 events/             # Handlers de eventos do Discord
├── 📂 utils/              # Utilitários e helpers
├── 📂 models/             # Modelos do MongoDB
├── 📂 assets/             # Recursos (imagens, banners)
└── 📂 docs/               # Documentação completa
```

---

## 📚 Documentação

| Documento | Descrição |
|---|---|
| [🧠 Persona Yuji](./docs/PERSONA_YUJI.md) | Como a personalidade do bot funciona |
| [🎛️ Components V2](./docs/COMPONENTS_V2_GUIDE.md) | Guia dos componentes modernos |
| [🚀 Deploy](./docs/DEPLOY.md) | Deploy de slash commands |
| [🗄️ MongoDB Setup](./docs/SETUP_MONGODB.md) | Configuração do banco de dados |
| [📊 Sistema de Logs](./docs/SISTEMA_LOGS.md) | Logs com níveis de severidade |
| [👥 Member Count](./docs/MEMBER_COUNT.md) | Sistema de contagem de membros |
| [⚠️ Sistema de Erros](./docs/SISTEMA_ERROS.md) | Tratamento de erros escalável |
| [📋 Changelog](./docs/CHANGELOG.md) | Histórico de versões |

---

## 🛠️ Stack

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-5865F2?style=flat-square&logo=discord&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![dotenv](https://img.shields.io/badge/dotenv-ECD53F?style=flat-square&logo=dotenv&logoColor=black)

</div>

---

## 👤 Autor

<div align="center">

**Athila Cabrall**

Senior Visual Designer · AI Engineer · Vibe Coder

[![Behance](https://img.shields.io/badge/Behance-1769FF?style=for-the-badge&logo=behance&logoColor=white)](http://behance.net/athilapsd)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/AthilaCabrall)

</div>

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8b00ff,50:4b0082,100:1a0533&height=100&section=footer" width="100%"/>

*Feito com 🔥 Maldição Inata e muito TypeScript*

</div>

# 🚀 Tactical Operational Command — Backend (NestJS)

Backend desenvolvido em **NestJS** para gerenciamento de acompanhamento tático, tarefas planejadas e geração automatizada do Quadro de Trabalho Semanal em Excel, integrado à API REST do **GLPI**.

---

## 🛠️ Tecnologias Utilizadas

* **Framework:** NestJS
* **Linguagem:** TypeScript
* **ORM & Banco de Dados:** Prisma ORM com SQLite (`tactical_config.db`)
* **Documentação de API:** Swagger UI (`@nestjs/swagger`)
* **Manipulação de Excel:** `exceljs`
* **Validação de DTOs:** `class-validator` e `class-transformer`
* **Cliente HTTP:** `@nestjs/axios` (Axios)

---

## 📂 Estrutura do Projeto

```text
acompanhamento-backend/
├── prisma/
│   └── schema.prisma              # Definição das entidades do banco de dados (Prisma)
├── src/
│   ├── config/                    # Módulo de Configurações (GLPI e Giteness)
│   ├── glpi/                      # Módulo de Integração com API REST do GLPI
│   ├── prisma/                    # Módulo e Serviço de conexão do Prisma
│   ├── relatorios/                # Módulo de Geração do Excel Semanal
│   ├── tarefas/                   # Módulo de Gerenciamento de Tarefas Planejadas
│   ├── app.module.ts              # Módulo Principal
│   └── main.ts                    # Ponto de entrada com Swagger e ValidationPipes
└── .env                           # Variáveis de ambiente
```
---

## ⚙️ Configuração do Ambiente

### 1. Variáveis de Ambiente (.env)
Crie ou edite o arquivo .env na raiz do projeto com as seguintes variáveis:

```bash
PORT=PORTA
DATABASE_URL="file:./tactical_config.db"
```

### 2. Instalação de Dependências

```bash
npm install
```

### 3. Migração do Banco de Dados (Prisma)

```bash
npx prisma db push
```

### 4. Executando a Aplicação

```bash
# Modo de desenvolvimento (com auto-reload)
npm run start:dev

# Modo de produção
npm run build
npm run start:prod
```

## 📑 Documentação da API (Swagger)

A API possui interface iterativa gerada pelo Swagger UI. Com a aplicação rodando, acesse:

👉 http://localhost:3002/api-docs

## 🛣️ Endpoints da API

### 1. Configurações (/config)

Gerencia os tokens e URLs de integração do GLPI e Giteness.

| Método | Rota | Descrição |
| :---: | :---: | :---: |
| GET | /config | Obtém as configurações cadastradas |
| POST | /config | Salva ou atualiza as configurações do sistema |

### 2. Tarefas Planejadas (/tarefas)

Gerencia o CRUD das tarefas vinculadas aos analistas.

| Método | Rota | Descrição |
| :---: | :---: | :---: |
| GET | /tarefas | Lista todas as tarefas planejadas |
| POST | /tarefas | Cadastra uma nova tarefa planejada |
| GET | /tarefas/:id | Busca detalhes de uma tarefa pelo ID |
| POST | /tarefas/:id | Atualiza uma tarefa existente |
| DELETE | /tarefas/:id | Remove uma tarefa |

### 3. Integração GLPI (/glpi)

Consome diretamente os recursos da API REST do GLPI.

| Método | Rota | Descrição |
| :---: | :---: | :---: |
| POST | /glpi/test-connection | Testa o handshake e autenticação no GLPI |
| GET | /glpi/grupos | Lista os Grupos Técnicos cadastrados |
| GET | /glpi/grupos/:id/tecnicos | Lista os Analistas de um grupo técnico |
| GET | /glpi/grupos/:id/chamados | Busca chamados do grupo filtrados por período |
| GET | /glpi/chamados/:id | Obtém detalhes de um chamado específico |
| POST | /glpi/chamados/:id/tarefas | Registra uma TicketTask dentro do chamado no GLPI |

### 4. Relatórios em Excel (/relatorios)

Exportação e montagem do arquivo .xlsx do Quadro de Trabalho Semanal.

| Método | Rota | Descrição |
| :---: | :---: | :---: |
| POST | /relatorios/semana-trabalho/excel | Gera e faz o download do arquivo Excel formatado |

Exemplo de Payload para Geração do Excel:

```Json
{
  "startMonday": "2026-08-10",
  "techs": [
    { "name": "Carlos Silva" },
    { "name": "Ana Souza" }
  ],
  "activities": [
    {
      "date": "2026-08-10",
      "tech": "Carlos Silva",
      "type": "CHAMADO",
      "id": "1042",
      "content": "Correção de rota na API backend",
      "period": "MANHÃ"
    },
    {
      "date": "2026-08-11",
      "tech": "Ana Souza",
      "type": "PROJETO",
      "id": "1045",
      "content": "Ajustes de segurança no Gateway",
      "period": "TARDE"
    }
  ]
}
```

## 📊 Estrutura do Relatório Gerado (Excel)

O arquivo de relatório .xlsx gerado possui as seguintes características:

Aba planejamento: Tabela consolidada com todas as atividades e tarefas da semana (DATA, ANALISTA, TIPO, ID GLPI, DESCRIÇÃO, PERÍODO).

Abas dos Analistas: Abas separadas para cada técnico informado, contendo o quadro de horários semanal de Segunda a Sexta:

08:00 - 12:00 (Manhã)

12:00 - 13:00 (Almoço)

13:00 - 17:00 (Tarde)

Formatação Visual: Cores e estilos aplicados para identificar períodos ocupados, intervalos de almoço e horários marcados como [ DISPONÍVEL ].
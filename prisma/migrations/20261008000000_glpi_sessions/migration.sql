-- Migração incremental para uma base já utilizada pela aplicação.
-- Ela não descarta dados existentes e interrompe a execução se encontrar
-- duplicidades que impediriam os novos vínculos únicos.

IF COL_LENGTH('dbo.users', 'glpi_user_id') IS NULL
  ALTER TABLE [dbo].[users] ADD [glpi_user_id] INT NULL;

IF EXISTS (
  SELECT 1 FROM [dbo].[users]
  WHERE [glpi_user_id] IS NOT NULL
  GROUP BY [glpi_user_id] HAVING COUNT(*) > 1
)
  THROW 50001, 'Há usuários locais duplicados para o mesmo ID do GLPI. Corrija-os antes de aplicar a migração.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'users_glpi_user_id_key' AND object_id = OBJECT_ID('dbo.users'))
  CREATE UNIQUE INDEX [users_glpi_user_id_key] ON [dbo].[users]([glpi_user_id]) WHERE [glpi_user_id] IS NOT NULL;

IF OBJECT_ID('dbo.app_sessions', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[app_sessions] (
    [id] NVARCHAR(36) NOT NULL,
    [user_id] INT NOT NULL,
    [ambiente] NVARCHAR(64) NOT NULL,
    [glpi_url] NVARCHAR(512) NOT NULL,
    [encrypted_token] NVARCHAR(2048) NOT NULL,
    [csrf_token] NVARCHAR(64) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [invalidated_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [app_sessions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [app_sessions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [app_sessions_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE,
    CONSTRAINT [app_sessions_csrf_token_key] UNIQUE ([csrf_token])
  );
  CREATE INDEX [app_sessions_user_id_expires_at_idx] ON [dbo].[app_sessions]([user_id], [expires_at]);
END;

IF OBJECT_ID('dbo.audit_logs', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[audit_logs] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [user_id] INT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [entity] NVARCHAR(1000) NOT NULL,
    [entity_id] NVARCHAR(1000) NULL,
    [ambiente] NVARCHAR(1000) NULL,
    [result] NVARCHAR(1000) NOT NULL,
    [details] NVARCHAR(1000) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_logs_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL
  );
  CREATE INDEX [audit_logs_created_at_idx] ON [dbo].[audit_logs]([created_at]);
END;

IF COL_LENGTH('dbo.agendamentos', 'integration_key') IS NULL
  ALTER TABLE [dbo].[agendamentos] ADD [integration_key] NVARCHAR(800) NULL;
IF COL_LENGTH('dbo.agendamentos', 'idempotency_key') IS NULL
  ALTER TABLE [dbo].[agendamentos] ADD [idempotency_key] NVARCHAR(64) NULL;
IF COL_LENGTH('dbo.agendamentos', 'criado_por_id') IS NULL
  ALTER TABLE [dbo].[agendamentos] ADD [criado_por_id] INT NULL;
IF COL_LENGTH('dbo.agendamentos', 'cancelado_em') IS NULL
  ALTER TABLE [dbo].[agendamentos] ADD [cancelado_em] DATETIME2 NULL;

IF EXISTS (
  SELECT 1 FROM [dbo].[agendamentos]
  WHERE [integration_key] IS NOT NULL
  GROUP BY [integration_key] HAVING COUNT(*) > 1
)
  THROW 50002, 'Há agendamentos com integration_key duplicada. Corrija-os antes de aplicar a migração.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'agendamentos_integration_key_key' AND object_id = OBJECT_ID('dbo.agendamentos'))
  CREATE UNIQUE INDEX [agendamentos_integration_key_key] ON [dbo].[agendamentos]([integration_key]) WHERE [integration_key] IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'agendamentos_idempotency_key_key' AND object_id = OBJECT_ID('dbo.agendamentos'))
  CREATE UNIQUE INDEX [agendamentos_idempotency_key_key] ON [dbo].[agendamentos]([idempotency_key]) WHERE [idempotency_key] IS NOT NULL;

-- O ID de tarefa do GLPI só é único dentro de um ambiente/URL. A chave de
-- integração acima substitui a restrição global antiga.
DECLARE @glpiTaskConstraint sysname;
SELECT TOP 1 @glpiTaskConstraint = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('dbo.agendamentos') AND kc.type = 'UQ' AND c.name = 'glpi_task_id';
IF @glpiTaskConstraint IS NOT NULL
  EXEC(N'ALTER TABLE [dbo].[agendamentos] DROP CONSTRAINT ' + QUOTENAME(@glpiTaskConstraint));

DECLARE @glpiTaskIndex sysname;
SELECT TOP 1 @glpiTaskIndex = i.name
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID('dbo.agendamentos') AND i.is_unique = 1 AND i.is_primary_key = 0
  AND c.name = 'glpi_task_id';
IF @glpiTaskIndex IS NOT NULL
  EXEC(N'DROP INDEX ' + QUOTENAME(@glpiTaskIndex) + N' ON [dbo].[agendamentos]');

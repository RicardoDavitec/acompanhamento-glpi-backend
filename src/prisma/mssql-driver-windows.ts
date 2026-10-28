/**
 * O adapter do Prisma carrega o driver tedious (`mssql`), que não autentica
 * com o usuário Windows atual. No Windows, troca esse require pelo msnodesqlv8
 * antes de o adapter ser carregado.
 */
if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require('module');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const driver = require('mssql/msnodesqlv8');
    const original = Module.prototype.require;
    Module.prototype.require = function (id: string) {
      if (id === 'mssql') return driver;
      return original.apply(this, arguments);
    };
  } catch {
    // Sem o driver nativo, a conexão Windows fica indisponível neste processo.
  }
}

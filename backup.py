import sqlite3

# Conecta ao banco local (ajuste o caminho se o dev.db estiver na raiz ou em prisma/dev.db)
db_path = 'dev.db' 

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM system_config;")
    colunas = [desc[0] for desc in cursor.description]
    linhas = cursor.fetchall()

    print("\n--- DADOS ATUAIS DA SYSTEM_CONFIG ---")
    for linha in linhas:
        dados = dict(zip(colunas, linha))
        print(dados)

    conn.close()
except Exception as e:
    print(f"Erro ao ler o banco: {e}")
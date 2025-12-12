const mysql = require('mysql2');

console.log('=== Configuração do Banco de Dados ===\n');

// Configuração padrão - ajuste conforme necessário
const config = {
  host: 'localhost',
  user: 'root',
  password: '', // Coloque sua senha aqui se tiver
  multipleStatements: true
};

function setupDatabase() {
  const connection = mysql.createConnection(config);

  connection.connect((err) => {
    if (err) {
      console.error('❌ Erro ao conectar ao MySQL:', err.message);
      console.log('\n📋 Verifique se:');
      console.log('1. O MySQL está instalado e rodando');
      console.log('2. O serviço MySQL está iniciado');
      console.log('3. As credenciais estão corretas');
      return;
    }

    console.log('✅ Conectado ao MySQL com sucesso!');
    console.log('Criando banco de dados...');

    // Script SQL para criar o banco e tabelas
    const sqlScript = `
      CREATE DATABASE IF NOT EXISTS tickets_control;
      USE tickets_control;
      
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(50) PRIMARY KEY,
        numero_chamado VARCHAR(100),
        url TEXT,
        cliente VARCHAR(255),
        sistema VARCHAR(255),
        assunto VARCHAR(500),
        descricao TEXT,
        situacao VARCHAR(100),
        inbox VARCHAR(100),
        status VARCHAR(50),
        data_registro DATETIME,
        prioridade VARCHAR(50),
        data DATE,
        deletion_date DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(50),
        status VARCHAR(50),
        data DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS schedules (
        id VARCHAR(50) PRIMARY KEY,
        ticket_id VARCHAR(50),
        cliente VARCHAR(255),
        data DATETIME,
        responsavel VARCHAR(255),
        observacoes TEXT,
        notified BOOLEAN DEFAULT FALSE,
        status_changed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    connection.query(sqlScript, (err, results) => {
      if (err) {
        console.error('❌ Erro ao criar banco de dados:', err.message);
      } else {
        console.log('✅ Banco de dados e tabelas criados com sucesso!');
        console.log('\n📊 Estrutura criada:');
        console.log('   - tickets (tabela principal de chamados)');
        console.log('   - status_history (histórico de status)');
        console.log('   - schedules (agendamentos)');
        console.log('   - settings (configurações do sistema)');
      }
      
      connection.end();
    });
  });
}

setupDatabase();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'carbon_storage',
  password: process.env.POSTGRES_PASSWORD || '742624zj',
  port: process.env.POSTGRES_PORT || 5432,
});

const connectDB = async () => {
  let client;
  try {
    client = await pool.connect();
    // 首先确保 PostGIS 扩展存在
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    console.log('PostGIS 扩展已启用 (如果不存在则创建)');

    // 检查PostGIS扩展是否已安装
    const result = await client.query('SELECT PostGIS_version();');
    console.log(`PostgreSQL连接成功，PostGIS版本: ${result.rows[0].postgis_version}`);
    client.release();
    return pool;
  } catch (error) {
    console.error(`PostgreSQL连接失败: ${error.message}`);
    console.error('请确保PostgreSQL和PostGIS扩展已正确安装');
    if (client) {
      client.release();
    }
    process.exit(1);
  }
};

module.exports = { connectDB, pool }; 
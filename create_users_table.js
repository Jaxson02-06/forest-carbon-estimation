const { pool } = require('../config/db');

const createUsersTable = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 创建用户表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(100) NOT NULL,
        role VARCHAR(10) NOT NULL DEFAULT 'user', -- 'user' 或 'admin'
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 创建默认管理员用户 (如果不存在)
    // 密码 'admin123' 使用 bcryptjs 加密后的值为: $2a$10$bOzWo1sMv5U0hL/qXsmXSe9Kq.4h77Ot4Wf.U1QDVx1X4PbZReMf.
    const adminExists = await client.query("SELECT 1 FROM users WHERE username = 'admin';");
    if (adminExists.rowCount === 0) {
      await client.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3);",
        ['admin', '$2a$10$bOzWo1sMv5U0hL/qXsmXSe9Kq.4h77Ot4Wf.U1QDVx1X4PbZReMf.', 'admin']
      );
      console.log('默认管理员用户 (admin/admin123) 已创建');
    }

    await client.query('COMMIT');
    console.log('用户表 (users) 已成功创建/验证');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('创建用户表失败:', error);
    throw error; // 重新抛出错误，以便 server.js 可以捕获
  } finally {
    client.release();
  }
};

module.exports = { createUsersTable }; 
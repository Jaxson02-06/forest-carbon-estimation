const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

class User {
  // 根据ID查找用户
  static async findById(id) {
    const result = await pool.query('SELECT id, username, role, created_at FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  // 根据用户名查找用户
  static async findOne(query) {
    const { username } = query;
    let result;
    
    if (query.select && query.select.includes('+password')) {
      result = await pool.query('SELECT id, username, password, role, created_at FROM users WHERE username = $1', [username]);
    } else {
      result = await pool.query('SELECT id, username, role, created_at FROM users WHERE username = $1', [username]);
    }
    
    return result.rows[0] || null;
  }

  // 创建新用户
  static async create(userData) {
    const { username, password } = userData;
    
    // 密码加密
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, role, created_at',
      [username, hashedPassword]
    );
    
    return result.rows[0];
  }

  // 比较密码
  static async matchPassword(enteredPassword, hashedPassword) {
    return await bcrypt.compare(enteredPassword, hashedPassword);
  }

  // 更新用户信息
  static async updateUser(id, userData) {
    const { username, password } = userData;
    let query, params;
    
    if (password) {
      // 密码加密
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      query = 'UPDATE users SET username = $1, password = $2 WHERE id = $3 RETURNING id, username, role, created_at';
      params = [username, hashedPassword, id];
    } else {
      query = 'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, role, created_at';
      params = [username, id];
    }
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }
}

module.exports = User; 
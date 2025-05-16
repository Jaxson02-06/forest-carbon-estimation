const { pool } = require('../config/db');

/**
 * 自定义森林子类型模型
 * 用于存储用户创建的自定义森林子类型
 */
class ForestSubtype {
  /**
   * 创建新的森林子类型
   * @param {Object} data 森林子类型数据
   * @returns {Promise<Object>} 创建的森林子类型
   */
  static async create(data) {
    const { userId, label, value, baseDensity = 130 } = data;
    
    const query = `
      INSERT INTO forest_subtypes(user_id, label, value, base_density, created_at, updated_at)
      VALUES($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, label, value, baseDensity]);
    return result.rows[0];
  }

  /**
   * 根据ID查找森林子类型
   * @param {string} id 森林子类型ID
   * @returns {Promise<Object>} 森林子类型
   */
  static async findById(id) {
    const query = `SELECT * FROM forest_subtypes WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * 根据用户ID查找所有森林子类型
   * @param {string} userId 用户ID
   * @returns {Promise<Array>} 森林子类型数组
   */
  static async findByUserId(userId) {
    const query = `SELECT * FROM forest_subtypes WHERE user_id = $1`;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * 更新森林子类型
   * @param {string} id 森林子类型ID
   * @param {Object} data 更新数据
   * @returns {Promise<Object>} 更新后的森林子类型
   */
  static async update(id, data) {
    const { label, value, baseDensity } = data;
    
    const query = `
      UPDATE forest_subtypes
      SET label = $1, value = $2, base_density = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    
    const result = await pool.query(query, [label, value, baseDensity, id]);
    return result.rows[0];
  }

  /**
   * 删除森林子类型
   * @param {string} id 森林子类型ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  static async delete(id) {
    const query = `DELETE FROM forest_subtypes WHERE id = $1`;
    await pool.query(query, [id]);
    return true;
  }
}

module.exports = ForestSubtype; 
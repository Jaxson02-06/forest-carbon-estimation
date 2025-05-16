const { pool } = require('../config/db');

/**
 * 创建森林子类型表
 */
async function createForestSubtypesTable() {
  try {
    const client = await pool.connect();
    
    // 创建 forest_subtypes 表
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS forest_subtypes (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        label VARCHAR(255) NOT NULL,
        value VARCHAR(255) NOT NULL UNIQUE,
        base_density NUMERIC DEFAULT 130,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    
    // 创建索引确保每个用户的标签名称唯一
    const createIndexQuery = `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_forest_subtypes_user_label
      ON forest_subtypes(user_id, label);
    `;
    
    await client.query(createTableQuery);
    await client.query(createIndexQuery);
    
    console.log('forest_subtypes 表创建成功');
    client.release();
  } catch (error) {
    console.error('创建 forest_subtypes 表失败:', error);
  }
}

// 如果直接运行此脚本，则执行创建表操作
if (require.main === module) {
  createForestSubtypesTable()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch(err => {
      console.error('迁移失败:', err);
      process.exit(1);
    });
}

module.exports = { createForestSubtypesTable }; 
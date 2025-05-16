const { pool } = require('../config/db');

const createProjectsTable = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 创建项目表
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        total_area FLOAT DEFAULT 0,
        total_carbon FLOAT DEFAULT 0,
        average_density FLOAT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 创建项目-区域关联表
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects_regions (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, region_id)
      );
    `);

    // 创建更新时间触发器函数 (如果不存在)
    await client.query(`
      CREATE OR REPLACE FUNCTION update_modified_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 为项目表添加更新时间触发器 (如果不存在)
    // 首先检查触发器是否已存在，避免重复创建导致错误
    const triggerExists = await client.query(`
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'update_projects_modtime' AND tgrelid = 'projects'::regclass;
    `);

    if (triggerExists.rowCount === 0) {
      await client.query(`
        CREATE TRIGGER update_projects_modtime
        BEFORE UPDATE ON projects
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column();
      `);
    }

    await client.query('COMMIT');
    console.log('项目表 (projects, projects_regions) 及触发器已成功创建/验证');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('创建项目表失败:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { createProjectsTable }; 
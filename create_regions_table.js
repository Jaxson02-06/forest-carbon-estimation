const { pool } = require('../config/db');

const createRegionsTable = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 创建区域表 (使用PostGIS几何类型)
    // 注意: CREATE EXTENSION IF NOT EXISTS postgis; 应该已在 db.js 中处理
    await client.query(`
      CREATE TABLE IF NOT EXISTS regions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('polygon', 'rectangle', 'circle', 'marker')),
        geom GEOMETRY, -- PostGIS几何类型
        center_point GEOMETRY(POINT, 4326), -- 圆形中心点
        radius FLOAT, -- 圆形半径 (米)
        area FLOAT, -- 面积 (公顷)，可以后续计算填充
        density FLOAT, -- 密度 (吨/公顷)
        carbon FLOAT, -- 碳储量 (吨)
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        
        CONSTRAINT check_region_type_constraints CHECK (
            (type IN ('polygon', 'rectangle') AND geom IS NOT NULL) OR
            (type = 'circle' AND center_point IS NOT NULL AND radius IS NOT NULL) OR
            (type = 'marker' AND center_point IS NOT NULL)
        )
      );
    `);

    // 为几何数据添加空间索引 (如果不存在)
    await client.query(`CREATE INDEX IF NOT EXISTS regions_geom_idx ON regions USING GIST(geom);`);
    await client.query(`CREATE INDEX IF NOT EXISTS regions_center_point_idx ON regions USING GIST(center_point);`);

    await client.query('COMMIT');
    console.log('区域表 (regions) 及空间索引已成功创建/验证');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('创建区域表失败:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { createRegionsTable }; 
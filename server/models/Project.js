const { pool } = require('../config/db');

class Project {
  // 根据ID查找项目
  static async findById(id, shouldPopulate = false) {
    let query;
    
    if (shouldPopulate) {
      // 包含区域数据
      query = `
        SELECT 
          p.id, p.name, p.description, p.total_area, p.total_carbon, 
          p.average_density, p.user_id, p.created_at, p.updated_at,
          json_agg(
            json_build_object(
              'id', r.id, 
              'name', r.name, 
              'type', r.type, 
              'area', r.area, 
              'density', r.density, 
              'carbon', r.carbon, 
              'radius', r.radius, 
              'created_at', r.created_at,
              'geom', ST_AsGeoJSON(r.geom),
              'center_point', ST_AsGeoJSON(r.center_point)
            )
          ) FILTER (WHERE r.id IS NOT NULL) as regions
        FROM projects p
        LEFT JOIN projects_regions pr ON p.id = pr.project_id
        LEFT JOIN regions r ON pr.region_id = r.id
        WHERE p.id = $1
        GROUP BY p.id
      `;
    } else {
      // 不包含区域数据
      query = `
        SELECT id, name, description, total_area, total_carbon, 
               average_density, user_id, created_at, updated_at
        FROM projects
        WHERE id = $1
      `;
    }
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    
    const project = result.rows[0];
    
    // 转换区域数据
    if (shouldPopulate && project.regions) {
      project.regions = project.regions.map(region => {
        // 处理几何数据
        if (region.geom) {
          try {
            const geomJson = JSON.parse(region.geom);
            if (geomJson.type === 'Polygon') {
              region.coordinates = geomJson.coordinates[0].map(coord => ({
                lng: coord[0],
                lat: coord[1]
              }));
            }
          } catch (error) {
            console.error('解析区域几何数据失败:', error);
          }
          delete region.geom;
        }
        
        if (region.center_point) {
          try {
            const centerJson = JSON.parse(region.center_point);
            if (centerJson.type === 'Point') {
              region.center = {
                lng: centerJson.coordinates[0],
                lat: centerJson.coordinates[1]
              };
            }
          } catch (error) {
            console.error('解析中心点几何数据失败:', error);
          }
          delete region.center_point;
        }
        
        return region;
      });
    }
    
    return project;
  }

  // 查找用户的所有项目
  static async find(query = {}) {
    const { user_id } = query;
    
    const sqlQuery = `
      SELECT id, name, description, total_area, total_carbon, 
             average_density, user_id, created_at, updated_at
      FROM projects
      WHERE user_id = $1
    `;
    
    const result = await pool.query(sqlQuery, [user_id]);
    
    return result.rows;
  }

  // 创建新项目
  static async create(projectData) {
    const { user_id, name, description } = projectData;
    
    const query = `
      INSERT INTO projects (user_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, total_area, total_carbon, 
                average_density, user_id, created_at, updated_at
    `;
    
    const result = await pool.query(query, [user_id, name, description]);
    
    return result.rows[0];
  }

  // 更新项目
  static async update(id, projectData) {
    const { name, description } = projectData;
    
    const query = `
      UPDATE projects
      SET name = $1, description = $2
      WHERE id = $3
      RETURNING id, name, description, total_area, total_carbon, 
                average_density, user_id, created_at, updated_at
    `;
    
    const result = await pool.query(query, [name, description, id]);
    
    if (result.rows.length === 0) return null;
    
    return result.rows[0];
  }

  // 删除项目
  static async remove(id) {
    // 先检查项目是否存在
    const checkQuery = 'SELECT id FROM projects WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return false;
    }
    
    // 删除项目-区域关联
    await pool.query('DELETE FROM projects_regions WHERE project_id = $1', [id]);
    
    // 删除项目
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    
    return true;
  }

  // 添加区域到项目
  static async addRegion(projectId, regionId) {
    // 检查关联是否已存在
    const checkQuery = 'SELECT 1 FROM projects_regions WHERE project_id = $1 AND region_id = $2';
    const checkResult = await pool.query(checkQuery, [projectId, regionId]);
    
    if (checkResult.rows.length > 0) {
      return false; // 关联已存在
    }
    
    // 添加关联
    await pool.query(
      'INSERT INTO projects_regions (project_id, region_id) VALUES ($1, $2)',
      [projectId, regionId]
    );
    
    // 更新项目统计数据
    await this.updateSummary(projectId);
    
    return true;
  }

  // 从项目移除区域
  static async removeRegion(projectId, regionId) {
    // 检查关联是否存在
    const checkQuery = 'SELECT 1 FROM projects_regions WHERE project_id = $1 AND region_id = $2';
    const checkResult = await pool.query(checkQuery, [projectId, regionId]);
    
    if (checkResult.rows.length === 0) {
      return false; // 关联不存在
    }
    
    // 移除关联
    await pool.query(
      'DELETE FROM projects_regions WHERE project_id = $1 AND region_id = $2',
      [projectId, regionId]
    );
    
    // 更新项目统计数据
    await this.updateSummary(projectId);
    
    return true;
  }

  // 更新项目的汇总统计数据
  static async updateSummary(projectId) {
    // 计算项目的区域统计数据
    const statsQuery = `
      SELECT 
        SUM(r.area) as total_area,
        SUM(r.carbon) as total_carbon,
        CASE 
          WHEN SUM(r.area) > 0 THEN SUM(r.carbon) / SUM(r.area)
          ELSE 0
        END as avg_density
      FROM regions r
      JOIN projects_regions pr ON r.id = pr.region_id
      WHERE pr.project_id = $1
    `;
    
    const statsResult = await pool.query(statsQuery, [projectId]);
    const stats = statsResult.rows[0];
    
    // 更新项目统计数据
    const updateQuery = `
      UPDATE projects
      SET 
        total_area = $1,
        total_carbon = $2,
        average_density = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, name, description, total_area, total_carbon, 
                average_density, user_id, created_at, updated_at
    `;
    
    const totalArea = stats.total_area || 0;
    const totalCarbon = stats.total_carbon || 0;
    const avgDensity = stats.avg_density || 0;
    
    const result = await pool.query(updateQuery, [
      totalArea, totalCarbon, avgDensity, projectId
    ]);
    
    return result.rows[0];
  }
}

module.exports = Project; 
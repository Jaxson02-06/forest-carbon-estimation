const { pool } = require('../config/db');
const { calculateArea, calculateCarbon, getDefaultDensity } = require('../utils/carbonCalculator');

class Region {
  // 根据ID查找区域
  static async findById(id) {
    const query = `
      SELECT 
        r.id, r.name, r.type, r.area, r.density, r.carbon, r.radius, 
        r.user_id, r.created_at,
        ST_AsGeoJSON(r.geom) as geom_json,
        ST_AsGeoJSON(r.center_point) as center_point_json
      FROM regions r
      WHERE r.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    
    const region = result.rows[0];
    
    // 转换几何数据为前端格式
    if (region.geom_json) {
      region.coordinates = this._parseGeoJsonCoordinates(region.geom_json);
      delete region.geom_json;
    }
    
    if (region.center_point_json) {
      region.center = this._parseGeoJsonPoint(region.center_point_json);
      delete region.center_point_json;
    }
    
    return region;
  }

  // 查找用户的所有区域
  static async find(query = {}) {
    const { user_id } = query;
    
    const sqlQuery = `
      SELECT 
        r.id, r.name, r.type, r.area, r.density, r.carbon, r.radius, 
        r.user_id, r.created_at,
        ST_AsGeoJSON(r.geom) as geom_json,
        ST_AsGeoJSON(r.center_point) as center_point_json
      FROM regions r
      WHERE r.user_id = $1
    `;
    
    const result = await pool.query(sqlQuery, [user_id]);
    
    // 转换几何数据为前端格式
    return result.rows.map(region => {
      if (region.geom_json) {
        region.coordinates = this._parseGeoJsonCoordinates(region.geom_json);
        delete region.geom_json;
      }
      
      if (region.center_point_json) {
        region.center = this._parseGeoJsonPoint(region.center_point_json);
        delete region.center_point_json;
      }
      
      return region;
    });
  }

  // 创建新区域
  static async create(regionData) {
    const { user_id, name, type, coordinates, center, radius, forestType } = regionData;
    
    let geom = null;
    let centerPoint = null;
    
    // 根据类型设置不同的几何数据
    if (type === 'polygon' || type === 'rectangle') {
      geom = this._createPolygonGeometry(coordinates);
    } else if (type === 'circle') {
      centerPoint = this._createPointGeometry(center);
    } else if (type === 'marker') {
      centerPoint = this._createPointGeometry(center);
    }
    
    // 计算面积
    const area = calculateArea({
      type,
      coordinates,
      center,
      radius
    });
    
    // 获取密度并计算碳储量
    const density = getDefaultDensity(forestType);
    const carbon = calculateCarbon(area, density);
    
    const query = `
      INSERT INTO regions (
        user_id, name, type, geom, center_point, radius, area, density, carbon
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING 
        id, user_id, name, type, radius, area, density, carbon, created_at
    `;
    
    const result = await pool.query(query, [
      user_id, name, type, geom, centerPoint, radius, area, density, carbon
    ]);
    
    const createdRegion = result.rows[0];
    
    // 添加前端需要的格式
    if (type === 'polygon' || type === 'rectangle') {
      createdRegion.coordinates = coordinates;
    } else if (type === 'circle' || type === 'marker') {
      createdRegion.center = center;
    }
    
    return createdRegion;
  }

  // 更新区域
  static async update(id, regionData) {
    const { name, coordinates, center, radius, density } = regionData;
    
    // 先获取原始区域数据
    const originalRegion = await this.findById(id);
    if (!originalRegion) return null;
    
    // 准备更新的数据
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }
    
    // 根据类型更新不同的几何数据
    const type = originalRegion.type;
    
    if ((type === 'polygon' || type === 'rectangle') && coordinates) {
      const geom = this._createPolygonGeometry(coordinates);
      updates.push(`geom = $${paramIndex}`);
      values.push(geom);
      paramIndex++;
    }
    
    if ((type === 'circle' || type === 'marker') && center) {
      const centerPoint = this._createPointGeometry(center);
      updates.push(`center_point = $${paramIndex}`);
      values.push(centerPoint);
      paramIndex++;
    }
    
    if (type === 'circle' && radius) {
      updates.push(`radius = $${paramIndex}`);
      values.push(radius);
      paramIndex++;
    }
    
    if (density) {
      updates.push(`density = $${paramIndex}`);
      values.push(density);
      paramIndex++;
    }
    
    // 重新计算面积和碳储量
    const area = calculateArea({
      type,
      coordinates: coordinates || originalRegion.coordinates,
      center: center || originalRegion.center,
      radius: radius || originalRegion.radius
    });
    
    updates.push(`area = $${paramIndex}`);
    values.push(area);
    paramIndex++;
    
    const carbonValue = calculateCarbon(area, density || originalRegion.density);
    updates.push(`carbon = $${paramIndex}`);
    values.push(carbonValue);
    paramIndex++;
    
    // 添加ID作为最后一个参数
    values.push(id);
    
    // 构建完整的更新查询
    const query = `
      UPDATE regions 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING 
        id, user_id, name, type, radius, area, density, carbon, created_at
    `;
    
    const result = await pool.query(query, values);
    
    const updatedRegion = result.rows[0];
    
    // 添加前端需要的格式
    if (type === 'polygon' || type === 'rectangle') {
      updatedRegion.coordinates = coordinates || originalRegion.coordinates;
    } else if (type === 'circle' || type === 'marker') {
      updatedRegion.center = center || originalRegion.center;
    }
    
    return updatedRegion;
  }

  // 删除区域
  static async remove(id) {
    // 先检查区域是否存在
    const checkQuery = 'SELECT id FROM regions WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return false;
    }
    
    // 从项目-区域关联表中移除引用
    await pool.query('DELETE FROM projects_regions WHERE region_id = $1', [id]);
    
    // 删除区域
    await pool.query('DELETE FROM regions WHERE id = $1', [id]);
    
    return true;
  }

  // 获取汇总数据
  static async getSummary(userId) {
    const query = `
      SELECT 
        COUNT(*) as count,
        SUM(area) as total_area,
        SUM(carbon) as total_carbon,
        CASE 
          WHEN SUM(area) > 0 THEN SUM(carbon) / SUM(area)
          ELSE 0
        END as avg_density
      FROM regions
      WHERE user_id = $1
    `;
    
    const result = await pool.query(query, [userId]);
    
    return {
      count: parseInt(result.rows[0].count, 10),
      totalArea: parseFloat(result.rows[0].total_area) || 0,
      totalCarbon: parseFloat(result.rows[0].total_carbon) || 0,
      avgDensity: parseFloat(result.rows[0].avg_density) || 0
    };
  }

  // 辅助方法：解析GeoJSON坐标为前端格式
  static _parseGeoJsonCoordinates(geomJson) {
    try {
      const geom = JSON.parse(geomJson);
      
      if (geom.type === 'Polygon') {
        // 返回第一个环的坐标（外环）
        return geom.coordinates[0].map(coord => ({
          lng: coord[0],
          lat: coord[1]
        }));
      }
      
      return [];
    } catch (error) {
      console.error('解析GeoJSON坐标失败:', error);
      return [];
    }
  }

  // 辅助方法：解析GeoJSON点为前端格式
  static _parseGeoJsonPoint(pointJson) {
    try {
      const point = JSON.parse(pointJson);
      
      if (point.type === 'Point') {
        return {
          lng: point.coordinates[0],
          lat: point.coordinates[1]
        };
      }
      
      return null;
    } catch (error) {
      console.error('解析GeoJSON点失败:', error);
      return null;
    }
  }

  // 辅助方法：从前端坐标创建PostGIS多边形
  static _createPolygonGeometry(coordinates) {
    if (!coordinates || coordinates.length < 3) return null;
    
    // 构建PostGIS多边形
    // 注意：PostGIS要求多边形首尾坐标相同，形成闭环
    let polygonText = 'POLYGON((';
    
    // 添加所有点
    coordinates.forEach((coord, index) => {
      polygonText += `${coord.lng} ${coord.lat}`;
      if (index < coordinates.length - 1) {
        polygonText += ', ';
      }
    });
    
    // 检查首尾是否相同，若不同则添加首点以闭合多边形
    const firstCoord = coordinates[0];
    const lastCoord = coordinates[coordinates.length - 1];
    
    if (firstCoord.lng !== lastCoord.lng || firstCoord.lat !== lastCoord.lat) {
      polygonText += `, ${firstCoord.lng} ${firstCoord.lat}`;
    }
    
    polygonText += '))';
    
    return polygonText;
  }

  // 辅助方法：从前端坐标创建PostGIS点
  static _createPointGeometry(center) {
    if (!center) return null;
    
    return `POINT(${center.lng} ${center.lat})`;
  }
}

module.exports = Region; 
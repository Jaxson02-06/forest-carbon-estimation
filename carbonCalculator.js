/**
 * 碳储量计算工具函数
 */

// 根据区域类型和属性计算面积（公顷）
const calculateArea = (region) => {
  const { type } = region;
  
  if (type === 'polygon' || type === 'rectangle') {
    // 使用坐标计算多边形面积
    return calculatePolygonArea(region.coordinates);
  } else if (type === 'circle') {
    // 使用半径计算圆面积
    return Math.PI * Math.pow(region.radius, 2) / 10000; // 转换为公顷
  } else if (type === 'marker') {
    // 标记点没有面积
    return 0;
  }
  
  return 0;
};

// 计算多边形面积（公顷）
const calculatePolygonArea = (coordinates) => {
  if (!coordinates || coordinates.length < 3) {
    return 0;
  }
  
  // 使用测地线面积计算公式
  let area = 0;
  const numPoints = coordinates.length;
  
  for (let i = 0; i < numPoints; i++) {
    const j = (i + 1) % numPoints;
    const xi = coordinates[i].lng;
    const yi = coordinates[i].lat;
    const xj = coordinates[j].lng;
    const yj = coordinates[j].lat;
    
    area += xi * yj - xj * yi;
  }
  
  area = Math.abs(area) / 2;
  
  // 将平面坐标面积近似转换为实际表面积（简化处理）
  // 实际应用中应该使用更精确的椭球体计算方法
  const earthRadius = 6371000; // 地球半径（米）
  const lat = coordinates.reduce((sum, coord) => sum + coord.lat, 0) / coordinates.length;
  const meterArea = area * Math.pow(earthRadius * Math.PI / 180, 2) * Math.cos(lat * Math.PI / 180);
  
  // 转换为公顷（1公顷 = 10000平方米）
  return meterArea / 10000;
};

// 计算碳储量（吨）
const calculateCarbon = (area, density) => {
  return area * density;
};

// 获取默认密度值
const getDefaultDensity = (forestType = 'default') => {
  // 不同类型森林的碳密度（吨/公顷）
  const densities = {
    evergreen: 180,    // 常绿阔叶林
    deciduous: 150,    // 落叶阔叶林
    coniferous: 120,   // 针叶林
    mixed: 140,        // 混交林
    mangrove: 220,     // 红树林
    bamboo: 100,       // 竹林
    shrub: 80,         // 灌木林
    plantation: 130,   // 人工林
    default: 150       // 默认值
  };
  
  return densities[forestType] || densities.default;
};

module.exports = {
  calculateArea,
  calculatePolygonArea,
  calculateCarbon,
  getDefaultDensity
}; 
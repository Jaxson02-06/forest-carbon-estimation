// DEM/DSM/CHM图层管理

let demLayer = null;
let dsmLayer = null;
let chmLayer = null;
let currentRasterLayer = null;

// 颜色渐变配置
const colorScales = {
  dem: {
    // 棕色-绿色渐变，适合地形
    colors: ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e'],
    domain: [0, 500], // 根据实际高程范围调整
    opacity: 0.7
  },
  dsm: {
    // 棕色-黄色-绿色渐变，适合地表模型
    colors: ['#8c510a', '#bf812d', '#dfc27d', '#c7eae5', '#80cdc1', '#35978f'],
    domain: [0, 500], // 根据实际高程范围调整
    opacity: 0.7
  },
  chm: {
    // 绿色渐变，适合植被高度
    colors: ['#edf8fb', '#b2e2e2', '#66c2a4', '#2ca25f', '#006d2c'],
    domain: [0, 50], // 根据实际植被高度范围调整
    opacity: 0.7
  }
};

// 初始化图层控制
function initRasterLayers() {
  // 创建图层控制按钮
  const layerControl = L.control({position: 'topright'});
  
  layerControl.onAdd = function(map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control raster-layer-control');
    container.innerHTML = `
      <button id="demLayerBtn" title="显示DEM图层">DEM</button>
      <button id="dsmLayerBtn" title="显示DSM图层">DSM</button>
      <button id="chmLayerBtn" title="显示CHM图层">CHM</button>
      <button id="hideRasterBtn" title="隐藏所有图层">清除</button>
    `;
    
    // 防止点击按钮时触发地图事件
    L.DomEvent.disableClickPropagation(container);
    
    // 绑定按钮点击事件
    container.querySelector('#demLayerBtn').addEventListener('click', () => toggleLayer('dem'));
    container.querySelector('#dsmLayerBtn').addEventListener('click', () => toggleLayer('dsm'));
    container.querySelector('#chmLayerBtn').addEventListener('click', () => toggleLayer('chm'));
    container.querySelector('#hideRasterBtn').addEventListener('click', hideAllLayers);
    
    return container;
  };
  
  layerControl.addTo(map);
}

// 显示或切换图层
function toggleLayer(layerType) {
  // 隐藏所有图层
  hideAllLayers();
  
  // 根据类型显示对应图层
  switch(layerType) {
    case 'dem':
      showDemLayer();
      break;
    case 'dsm':
      showDsmLayer();
      break;
    case 'chm':
      showChmLayer();
      break;
  }
}

// 隐藏所有图层
function hideAllLayers() {
  if (currentRasterLayer) {
    map.removeLayer(currentRasterLayer);
    currentRasterLayer = null;
  }
  
  // 更新按钮状态
  const buttons = document.querySelectorAll('.raster-layer-control button');
  buttons.forEach(btn => btn.classList.remove('active'));
}

// 显示DEM图层
function showDemLayer() {
  hideAllLayers();
  
  // 获取最新处理的DEM文件路径
  const demFilePath = getLatestDemPath();
  if (!demFilePath) {
    showNotification('未找到DEM数据，请先上传并处理点云数据', 'warning');
    return;
  }
  
  // 创建并添加图层
  demLayer = createRasterLayer(demFilePath, 'dem');
  map.addLayer(demLayer);
  currentRasterLayer = demLayer;
  
  // 更新按钮状态
  document.getElementById('demLayerBtn').classList.add('active');
}

// 显示DSM图层
function showDsmLayer() {
  hideAllLayers();
  
  // 获取最新处理的DSM文件路径
  const dsmFilePath = getLatestDsmPath();
  if (!dsmFilePath) {
    showNotification('未找到DSM数据，请先上传并处理点云数据', 'warning');
    return;
  }
  
  // 创建并添加图层
  dsmLayer = createRasterLayer(dsmFilePath, 'dsm');
  map.addLayer(dsmLayer);
  currentRasterLayer = dsmLayer;
  
  // 更新按钮状态
  document.getElementById('dsmLayerBtn').classList.add('active');
}

// 显示CHM图层
function showChmLayer() {
  hideAllLayers();
  
  // 获取最新处理的CHM文件路径
  const chmFilePath = getLatestChmPath();
  if (!chmFilePath) {
    showNotification('未找到CHM数据，请先上传并处理点云数据', 'warning');
    return;
  }
  
  // 创建并添加图层
  chmLayer = createRasterLayer(chmFilePath, 'chm');
  map.addLayer(chmLayer);
  currentRasterLayer = chmLayer;
  
  // 更新按钮状态
  document.getElementById('chmLayerBtn').classList.add('active');
}

// 创建栅格图层
function createRasterLayer(url, type) {
  // 使用Leaflet.GeoTIFF插件加载GeoTIFF数据
  return L.leafletGeotiff(
    url,
    {
      band: 0,
      name: type.toUpperCase(),
      opacity: colorScales[type].opacity,
      colorScale: colorScales[type].colors,
      domain: colorScales[type].domain,
      clampLow: false,
      clampHigh: false,
      arrowSize: 20,
      displayMin: colorScales[type].domain[0],
      displayMax: colorScales[type].domain[1],
      customColorScale: true
    }
  );
}

// 获取最新处理的DEM路径
function getLatestDemPath() {
  // 从处理结果中获取DEM文件的URL
  // 如果还没有处理结果，返回null
  if (window.lastProcessingOutputs && window.lastProcessingOutputs.demFile) {
    // 获取文件名
    const filename = window.lastProcessingOutputs.demFile.split(/[\\\/]/).pop();
    return `/outputs/${filename}`;
  }
  return null;
}

// 获取最新处理的DSM路径
function getLatestDsmPath() {
  // 从处理结果中获取DSM文件的URL
  if (window.lastProcessingOutputs && window.lastProcessingOutputs.dsmFile) {
    // 获取文件名
    const filename = window.lastProcessingOutputs.dsmFile.split(/[\\\/]/).pop();
    return `/outputs/${filename}`;
  }
  return null;
}

// 获取最新处理的CHM路径
function getLatestChmPath() {
  // 从处理结果中获取CHM文件的URL
  if (window.lastProcessingOutputs && window.lastProcessingOutputs.chmFile) {
    // 获取文件名
    const filename = window.lastProcessingOutputs.chmFile.split(/[\\\/]/).pop();
    return `/outputs/${filename}`;
  }
  return null;
}

// 导出函数
window.initRasterLayers = initRasterLayers;
window.toggleRasterLayer = toggleLayer;
window.hideAllRasterLayers = hideAllLayers; 
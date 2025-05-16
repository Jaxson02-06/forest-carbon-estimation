// 全局变量和配置
const config = {
  mapCenter: [35.86166, 104.195397],
  mapZoom: 4,
  carbonRatio: 0.5, // 保留原有参数，兼容性考虑
  rootShootRatio: 0.26, // 保留原有参数，兼容性考虑
  defaultDensity: 0.8,
  apiBaseUrl: 'http://localhost:5000/api',
  // 新增参数
  woodDensity: 0.6, // 木材密度默认值 g/cm³
  carbonFraction: 0.47, // 碳含量系数默认值 (IPCC推荐)
  // 默认选中的指数和参数
  defaultIndices: {
    ndvi: true,
    evi: false,
    savi: false
  },
  defaultLidarParams: {
    hmax: true,
    hmean: true,
    h95: true,
    h75: false,
    h50: false
  },
  // 数据预处理参数默认值
  groundFilterThreshold: 1.0,
  gridResolution: 1.0,
  chmSmoothRadius: 2,
  // 单株分割参数默认值
  localMaxWindowSize: 5,
  watershedSensitivity: 0.5,
  minTreeHeight: 2.0,
  // 属性计算与模型参数默认值
  univariateModel: true, // 一元模型为默认
  modelCoefficients: {
    a: 0.0673,
    b: 0.976,
    c: 0.5
  },
  // 可视化与结果导出默认值
  previewSliceHeight: 5.0,
  colorRange: {
    min: 0,
    max: 300
  },
  // 生物量模型相关默认参数
  defaultBiomassModel: 'multireg' // 多元回归/机器学习模型
};

let map, drawControl, drawnItems;
let chart;
let analysisChart; // 添加全局 analysisChart 变量
let currentUser = null;
let regions = [];
let isLoading = false;
let carbonAPI; // 声明carbonAPI变量
let lastProcessingOutputs = null; // 保存最后一次处理的输出结果

// 游客模式下临时存储自定义森林子类型
let guestSessionCustomSubtypes = [];

// 确保carbonAPI可用
window.addEventListener('load', function() {
  // 如果window.carbonAPI已经存在则使用它，否则创建一个简化版的API兼容对象
  if (window.carbonAPI) {
    carbonAPI = window.carbonAPI;
    console.log('使用API模块中的carbonAPI');
  } else {
    console.warn('未检测到API模块，使用本地兼容层');
    // 创建一个简化版的API兼容对象
    carbonAPI = {
      auth: {
        login: async (username, password) => {
          const response = await fetch(`${config.apiBaseUrl}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            mode: 'cors'
          });
          
          if (!response.ok) {
            if (response.status === 401) throw new Error('用户名或密码错误');
            throw new Error('登录失败');
          }
          
          const data = await response.json();
          localStorage.setItem('currentUser', JSON.stringify(data));
          return data;
        },
        register: async (username, password) => {
          const response = await fetch(`${config.apiBaseUrl}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            mode: 'cors'
          });
          
          if (!response.ok) throw new Error('注册失败');
          
          const data = await response.json();
          return data;
        },
        logout: () => {
          localStorage.removeItem('currentUser');
        },
        getCurrentUser: () => {
          const userJson = localStorage.getItem('currentUser');
          return userJson ? JSON.parse(userJson) : null;
        }
      }
    };
  }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // 如果carbonAPI存在，更新API基础URL
  if (typeof window.carbonAPI !== 'undefined' && window.carbonAPI.API_URL) {
    config.apiBaseUrl = window.carbonAPI.API_URL;
  }
  
  // 修改欢迎页面按钮事件
  const welcomeLoginBtn = document.querySelector('.login-container .btn-primary');
  if (welcomeLoginBtn) {
    welcomeLoginBtn.onclick = function() {
      createLoginBox();
    };
  }
  
  const welcomeRegisterBtn = document.querySelector('.login-container .btn-secondary');
  if (welcomeRegisterBtn) {
    welcomeRegisterBtn.onclick = function() {
      createRegisterBox();
    };
  }
  
  const welcomeGuestBtn = document.querySelector('.login-container .btn-outline');
  if (welcomeGuestBtn) {
    welcomeGuestBtn.onclick = function() {
      guestLogin();
    };
  }
  
  // 初始化各个组件
  setupEventListeners();
  setupTabSystem();
  setupRangeSliders();
  
  // 初始化可折叠部分
  initCollapsibleSections();
  
  // 处理分析按钮
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', handleAnalyze);
  }
  
  // 处理重置按钮
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetParameters);
  }
  
  // 初始化双滑块
  initDoubleRangeSlider();
  
  // 初始化DBH模型UI
  initDBHModelUI();
  
  // 调整卡片布局
  adjustCardLayout();
  
  // 检查是否有保存的登录状态
  checkLoginStatus();
  
  // 初始化地图
  initMap();
  
  // 更新区域列表
  updateRegionsList();

  // --- 实现点击上传区域触发文件选择 ---
  const fileUploadArea = document.querySelector('.file-upload');
  const fileInput = document.getElementById('fileInput');

  if (fileUploadArea && fileInput) {
    fileUploadArea.addEventListener('click', (event) => {
      // 防止点击内部的 label 时触发两次文件选择 (因为 label 已经关联了 input)
      // 同时允许点击实际的 label 按钮
      if (event.target.tagName !== 'LABEL' && event.target !== fileInput) {
         // 检查点击目标不是 label 或 input 本身
         if (event.target.closest('label[for="fileInput"]') === null) {
           fileInput.click(); // 触发隐藏的文件输入框的点击事件
         }
      }
    });

    // 阻止在拖放区域内部点击 label 时冒泡到 fileUploadArea 的点击事件
    const fileLabel = fileUploadArea.querySelector('label[for="fileInput"]');
    if (fileLabel) {
        fileLabel.addEventListener('click', (event) => {
            event.stopPropagation(); // 阻止事件冒泡
        });
    }

    // --- 文件输入框 change 事件处理 (你可能已经有类似代码) ---
    fileInput.addEventListener('change', handleFileSelect);

  } else {
    console.error('File upload area or file input not found.');
  }
  
  // 调用一次卡片高度调整，确保初始加载时高度一致
  adjustCardHeight();
  
  // 初始化文件输入相关事件监听器
  setupFileInputListeners();

  // 添加LiDAR上传按钮事件监听
  const uploadLidarBtn = document.getElementById('uploadLidarBtn');
  if (uploadLidarBtn) {
    uploadLidarBtn.addEventListener('click', handleLidarUpload);
  }
});

// 设置事件监听器
function setupEventListeners() {
  // 登录按钮
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', function() {
      createLoginBox();
    });
  }
  
  // 退出登录按钮
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  // 文件上传
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileChange);
    
    // 拖放文件
    const fileUpload = document.querySelector('.file-upload');
    if (fileUpload) {
      fileUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUpload.classList.add('file-drag-over');
      });
      
      fileUpload.addEventListener('dragleave', () => {
        fileUpload.classList.remove('file-drag-over');
      });
      
      fileUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUpload.classList.remove('file-drag-over');
        if (e.dataTransfer.files.length) {
          fileInput.files = e.dataTransfer.files;
          // 触发 change 事件
          const event = new Event('change', { bubbles: true });
          fileInput.dispatchEvent(event);
        }
      });
      
      fileUpload.addEventListener('keydown', (e) => {
        // 按下Enter或空格时触发点击
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });
    }
  }
  
  // 窗口大小改变时调整卡片布局
  window.addEventListener('resize', adjustCardLayout);
  
  // 模型文件浏览按钮
  const browseModelBtn = document.getElementById('browseModelBtn');
  if (browseModelBtn) {
    browseModelBtn.addEventListener('click', function() {
      // 在实际应用中，这里应该打开一个文件选择对话框
      // 由于浏览器安全限制，我们可能需要使用隐藏的input[type="file"]元素
      const modelFileInput = document.createElement('input');
      modelFileInput.type = 'file';
      modelFileInput.accept = '.json,.xml,.model';
      modelFileInput.addEventListener('change', function(e) {
        if (e.target.files.length) {
          document.getElementById('modelFilePath').value = e.target.files[0].name;
        }
      });
      modelFileInput.click();
    });
  }
  
  // 实时预览切片高度滑块
  const previewSliceHeight = document.getElementById('previewSliceHeight');
  if (previewSliceHeight) {
    previewSliceHeight.addEventListener('input', function() {
      config.previewSliceHeight = parseFloat(this.value);
      updateVisualization();
    });
  }
  
  // 网格分辨率下拉菜单
  const gridResolution = document.getElementById('gridResolution');
  if (gridResolution) {
    gridResolution.addEventListener('change', function() {
      config.gridResolution = parseFloat(this.value);
    });
  }
  
  // 树顶局部极大值窗口大小下拉菜单
  const localMaxWindowSize = document.getElementById('localMaxWindowSize');
  if (localMaxWindowSize) {
    localMaxWindowSize.addEventListener('change', function() {
      config.localMaxWindowSize = parseInt(this.value);
    });
  }
  
  // 分析按钮
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzeData);
  }
  
  // 重置按钮
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetParameters);
  }
  
  // 导出按钮
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }
  
  // 清除所有区域按钮
  const btnClearAll = document.getElementById('btnClearAll');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', clearAllRegions);
  }
  
  // 选项卡切换
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
  
  // 通知关闭按钮
  const closeNotificationBtn = document.querySelector('.close-notification');
  if (closeNotificationBtn) {
    closeNotificationBtn.addEventListener('click', hideNotification);
  }
  
  // 窗口大小改变时调整卡片高度
  window.addEventListener('resize', adjustCardHeight);
}

// 调整数据输入框和核心结果区的高度
function adjustCardHeight() {
  // 只有在大屏幕模式下才需要调整高度
  if (window.innerWidth > 1200) {
    const fileUploadCard = document.querySelector('.file-upload-section.card');
    const resultCard = document.querySelector('.main-summary-section.card');
    
    if (fileUploadCard && resultCard) {
      // 移除可能已有的固定高度，让卡片可以自然扩展
      fileUploadCard.style.height = '';
      resultCard.style.height = '';
      
      // 获取两个卡片的自然高度
      const fileUploadHeight = fileUploadCard.scrollHeight;
      const resultHeight = resultCard.scrollHeight;
      
      // 取两者中的较大值强制两卡片等高
      const maxHeight = Math.max(fileUploadHeight, resultHeight, 220);
      
      // 设置固定高度，确保完全一致
      fileUploadCard.style.height = `${maxHeight}px`;
      resultCard.style.height = `${maxHeight}px`;
    }
  } else {
    // 在小屏幕模式下，移除所有高度限制
    const fileUploadCard = document.querySelector('.file-upload-section.card');
    const resultCard = document.querySelector('.main-summary-section.card');
    
    if (fileUploadCard && resultCard) {
      fileUploadCard.style.height = '';
      fileUploadCard.style.minHeight = '';
      resultCard.style.height = '';
      resultCard.style.minHeight = '';
    }
  }
}

// 处理文件选择变更
function handleFileChange(e) {
  const file = e.target.files[0];
  if (file) {
    const fileName = document.getElementById('fileName');
    if (fileName) {
      fileName.textContent = file.name;
    }
    
    // 根据文件类型进行不同处理
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const supportedExtensions = ['csv', 'json', 'geojson', 'shp', 'kml'];
    
    if (!supportedExtensions.includes(fileExtension)) {
      showNotification('不支持的文件格式，请上传CSV、JSON、GeoJSON、SHP或KML文件', 'error');
      return;
    }
    
    showNotification(`已选择文件: ${file.name}`, 'success');
    
    // 这里可以添加文件读取和处理逻辑
  }
}

// 设置范围滑块的值显示
function setupRangeSliders() {
  // 保留对旧滑块的支持，保持兼容性
  if (document.getElementById('carbonRatio')) {
    setupRangeSlider('carbonRatio', 'carbonRatioValue');
  }
  if (document.getElementById('rootShootRatio')) {
    setupRangeSlider('rootShootRatio', 'rootShootRatioValue');
  }
  
  // 数据预处理参数滑块
  if (document.getElementById('groundFilterThreshold')) {
    setupRangeSlider('groundFilterThreshold', 'groundFilterThresholdValue');
  }
  if (document.getElementById('chmSmoothRadius')) {
    setupRangeSlider('chmSmoothRadius', 'chmSmoothRadiusValue');
  }
  
  // 单株分割参数滑块
  if (document.getElementById('watershedSensitivity')) {
    setupRangeSlider('watershedSensitivity', 'watershedSensitivityValue');
  }
  if (document.getElementById('minTreeHeight')) {
    setupRangeSlider('minTreeHeight', 'minTreeHeightValue');
  }
  
  // 可视化参数滑块
  if (document.getElementById('previewSliceHeight')) {
    setupRangeSlider('previewSliceHeight', 'previewSliceHeightValue');
  }
  
  // 碳储量转换参数滑块
  if (document.getElementById('carbonFraction')) {
    setupRangeSlider('carbonFraction', 'carbonFractionValue');
  }
  
  // 初始化双滑块
  initDoubleRangeSlider();
}

// 设置单个范围滑块
function setupRangeSlider(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const valueElement = document.getElementById(valueId);
  
  if (slider && valueElement) {
    // 更新显示的值
    slider.addEventListener('input', function() {
      valueElement.textContent = this.value;
      updateSliderBackground(this);
    });
    
    // 初始化背景
    updateSliderBackground(slider);
  }
}

// 更新滑块背景填充
function updateSliderBackground(slider) {
  const min = slider.min ? parseFloat(slider.min) : 0;
  const max = slider.max ? parseFloat(slider.max) : 100;
  const value = parseFloat(slider.value);
  const percentage = ((value - min) / (max - min)) * 100;
  
  // 使用CSS变量更新背景
  slider.style.background = `linear-gradient(to right, var(--primary-light), var(--primary-light) ${percentage}%, #e9e9e9 ${percentage}%, #e9e9e9)`;
}

// 显示加载指示器
function showLoading() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.classList.remove('hidden');
  }
  isLoading = true;
}

// 隐藏加载指示器
function hideLoading() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.classList.add('hidden');
  }
  isLoading = false;
}

// 显示通知消息
function showNotification(message, type = 'success', duration = 3000) {
  const notification = document.getElementById('notification');
  const notificationMessage = document.getElementById('notificationMessage');
  
  if (!notification || !notificationMessage) return;
  
  // 设置消息和类型
  notificationMessage.textContent = message;
  
  // 移除所有类型类
  notification.classList.remove('error', 'warning', 'success', 'info');
  
  // 添加指定类型
  if (type) {
    notification.classList.add(type);
  }
  
  // 显示通知
  notification.classList.remove('hidden');
  notification.classList.add('show');
  
  // 设置自动关闭
  if (duration > 0) {
    setTimeout(() => {
      hideNotification();
    }, duration);
  }
}

// 隐藏通知消息
function hideNotification() {
  const notification = document.getElementById('notification');
  
  if (!notification) return;
  
  notification.classList.remove('show');
  
  // 等待过渡效果完成后隐藏
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 300);
}

// 检查登录状态
function checkLoginStatus() {
  const user = carbonAPI.auth.getCurrentUser();
  
  if (user && user.username) {
    loginSuccess(user.username);
    return true;
  }
  
  return false;
}

// 初始化地图
function initMap() {
  if (map) map.remove();
  map = L.map('mapContainer', { zoomControl: false }).setView(config.mapCenter, config.mapZoom);
  
  // 添加底图
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
  
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  
  // 配置绘制控件
  const drawControl = new L.Control.Draw({
    draw: {
      polygon: { showArea: true },
      rectangle: true,
      circle: true,
      marker: false,
      polyline: false
    },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);
  
  // 添加绘制事件监听器
  map.on(L.Draw.Event.CREATED, handleDrawCreated);
  map.on(L.Draw.Event.EDITED, handleDrawEdited);
  map.on(L.Draw.Event.DELETED, handleDrawDeleted);

  // 添加缩放控制
  L.control.zoom({
    position: 'topleft'
  }).addTo(map);
  
  // 初始化栅格图层控制
  if (window.initRasterLayers) {
    window.initRasterLayers();
  }
  
  setTimeout(() => map.invalidateSize(), 100);
}

// 处理绘制完成事件
function handleDrawCreated(e) {
  console.log('handleDrawCreated called:', e);
  const layer = e.layer;
  drawnItems.addLayer(layer);
  
  // 添加新区域
  const id = Date.now().toString();
  const type = e.layerType;
  
  let coordinates, area, center, radius;
  
  console.log('Calculating geometry...'); // 新增日志
  // 根据不同类型处理几何数据
  try {
    if (type === 'polygon' || type === 'rectangle') {
      const latlngs = type === 'polygon' ? layer.getLatLngs()[0] : [
        layer.getBounds().getNorthWest(),
        layer.getBounds().getNorthEast(),
        layer.getBounds().getSouthEast(),
        layer.getBounds().getSouthWest()
      ];
      
      coordinates = latlngs;
      
      // 计算面积（平方米）
      if (!L.GeometryUtil) {
        console.error('L.GeometryUtil is not available!');
        showNotification('地图工具库加载不完整，无法计算面积', 'error');
        return;
      }
      area = L.GeometryUtil.geodesicArea(latlngs);
    } else if (type === 'circle') {
      center = layer.getLatLng();
      radius = layer.getRadius();
      
      // 计算圆面积（平方米）
      area = Math.PI * radius * radius;
    }
  } catch (calcError) {
    console.error('Error during geometry calculation:', calcError);
    showNotification('计算区域几何数据时出错', 'error');
    // 尝试移除刚绘制的图层，避免留下无效图层
    drawnItems.removeLayer(layer);
    return;
  }
  console.log(`Geometry calculated: area=${area}`); // 新增日志
  
  // 转换为公顷
  const areaHa = (area / 10000).toFixed(2);
  
  // 获取选择的森林类型
  const forestTypeSelect = document.getElementById('biomassModel');
  const forestType = forestTypeSelect ? forestTypeSelect.value : 'model1';
  
  // 默认区域名称 - 移动到 showRegionNameDialog 内部处理
  // const defaultName = `区域 ${regions.length + 1}`; 
  
  // 创建区域对象
  const region = {
    id: id,
    name: '', // 名称将在对话框中设置
    type: type,
    coordinates: coordinates,
    center: center,
    radius: radius,
    area: areaHa,
    forestType: forestType,
    layer: layer
  };
  
  console.log('Region object created:', region); // 新增日志
  console.log('Calling showRegionNameDialog...'); // 新增日志
  // 显示区域命名对话框
  showRegionNameDialog(region, layer, false);
}

// 创建/编辑区域对话框
function showRegionNameDialog(region, layer, isEditMode = false) {
    console.log('showRegionNameDialog called', { region, isEditMode });
    const defaultName = `森林 ${regions.length + 1}`;
    
    // 创建modal元素
    const modal = document.createElement('div');
    console.log('Modal element created:', modal);
    modal.className = 'modal'; // 初始状态是隐藏的
    
    try {
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isEditMode ? '编辑区域' : '添加新区域'}</h2>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="region-name">区域名称</label>
                        <input type="text" id="region-name" value="${isEditMode ? region.name : defaultName}" placeholder="输入区域名称">
                    </div>
                    <div class="form-group">
                        <label for="region-area">面积 (公顷)</label>
                        <input type="text" id="region-area" value="${region.area}" readonly>
                    </div>
                    <div class="form-group">
                        <label for="forest-subtype">森林子类型</label>
                        <select id="forest-subtype"></select>
                    </div>
                    <div class="form-group" id="custom-subtype-container" style="display: none;">
                        <label for="custom-subtype-input">自定义森林子类型</label>
                        <div class="custom-type-input-group">
                            <input type="text" id="custom-subtype-input" placeholder="例如：红松林">
                            <button type="button" id="save-custom-subtype" class="button primary">保存</button>
                            <button type="button" id="cancel-custom-subtype" class="button secondary">取消</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancel-button" class="button secondary">取消</button>
                    <button id="save-button" class="button primary">保存</button>
                </div>
            </div>
        `;
        console.log('Modal innerHTML set.');
    } catch (htmlError) {
        console.error('Error setting modal innerHTML:', htmlError);
        showNotification('创建对话框内容时出错', 'error');
        return;
    }
    
    try {
        document.body.appendChild(modal);
        console.log('Modal appended to body.');
        // 触发显示动画
        requestAnimationFrame(() => {
            modal.classList.add('show');
            console.log('Modal .show class added.');
        });
    } catch (appendError) {
        console.error('Error appending modal to body:', appendError);
        showNotification('显示对话框时出错', 'error');
        return;
    }
    
    // 获取DOM元素
    let closeButton, cancelButton, saveButton, forestSubtypeSelect, regionNameInput, customSubtypeContainer, customSubtypeInput, saveCustomSubtypeBtn, cancelCustomSubtypeBtn;
    try {
        closeButton = modal.querySelector('.close');
        cancelButton = modal.querySelector('#cancel-button');
        saveButton = modal.querySelector('#save-button');
        forestSubtypeSelect = modal.querySelector('#forest-subtype');
        regionNameInput = modal.querySelector('#region-name');
        customSubtypeContainer = modal.querySelector('#custom-subtype-container');
        customSubtypeInput = modal.querySelector('#custom-subtype-input');
        saveCustomSubtypeBtn = modal.querySelector('#save-custom-subtype');
        cancelCustomSubtypeBtn = modal.querySelector('#cancel-custom-subtype');
        
        if (!closeButton || !cancelButton || !saveButton || !forestSubtypeSelect || !regionNameInput || 
            !customSubtypeContainer || !customSubtypeInput || !saveCustomSubtypeBtn || !cancelCustomSubtypeBtn) {
            console.error('Failed to find one or more modal elements');
            showNotification('对话框元素不完整', 'error');
            modal.remove(); // 移除不完整的对话框
            return;
        }
        console.log('Modal elements obtained successfully.');
    } catch (queryError) {
        console.error('Error querying modal elements:', queryError);
        showNotification('查找对话框元素时出错', 'error');
        modal.remove();
        return;
    }
    
    // 设置焦点到名称输入框
    setTimeout(() => {
        regionNameInput.focus();
        regionNameInput.select(); // 全选文本便于用户直接输入
    }, 100);
    
    // 填充森林子类型下拉列表
    populateForestSubtypeDropdown(forestSubtypeSelect, region.forestSubtype || null);
    
    // 森林子类型change事件 - 处理自定义类型
    let previousSubtypeValue = forestSubtypeSelect.value;
    forestSubtypeSelect.addEventListener('change', function() {
        if (this.value === '__add_custom__') {
            // 显示自定义类型输入
            customSubtypeContainer.style.display = 'block';
            customSubtypeInput.focus();
            // 重置下拉选择为之前的值
            this.value = previousSubtypeValue;
        } else {
            // 隐藏自定义类型输入
            customSubtypeContainer.style.display = 'none';
            // 记住当前选择的值
            previousSubtypeValue = this.value;
        }
    });
    
    // 保存自定义类型按钮点击事件
    saveCustomSubtypeBtn.addEventListener('click', function() {
        const customTypeName = customSubtypeInput.value.trim();
        
        // 验证输入
        if (!customTypeName) {
            showNotification('请输入森林子类型名称', 'error');
            return;
        }
        
        // 调用保存函数（异步）
        saveCustomForestSubtype({
            label: customTypeName
        }).then(result => {
            if (result) {
                // 重新填充下拉列表，传入新创建的类型value作为选中值
                populateForestSubtypeDropdown(forestSubtypeSelect, result.value);
                
                // 隐藏自定义输入
                customSubtypeContainer.style.display = 'none';
                
                // 清空输入框
                customSubtypeInput.value = '';
                
                showNotification(`已添加新森林子类型: ${customTypeName}`, 'success');
            }
        });
    });
    
    // 取消自定义类型按钮点击事件
    cancelCustomSubtypeBtn.addEventListener('click', function() {
        customSubtypeContainer.style.display = 'none';
        customSubtypeInput.value = '';
    });
    
    // 标记用户是否编辑过名称
    regionNameInput.addEventListener('input', function() {
        this.dataset.userEdited = 'true';
    });
    
    // 关闭modal的函数 - **修改为先移除 show 类，再移除元素**
    const closeModal = () => {
        modal.classList.remove('show');
        console.log('Modal .show class removed.');
        // 等待动画完成再移除 DOM 元素
        modal.addEventListener('transitionend', () => {
            if (modal.parentNode) {
                modal.remove();
                console.log('Modal removed from DOM after transition.');
            }
        }, { once: true }); // 确保事件只触发一次
        
        // 如果动画没触发（例如 display:none），设置一个超时后强制移除
        setTimeout(() => {
             if (modal.parentNode) {
                modal.remove();
                console.log('Modal removed from DOM via fallback timeout.');
            }
        }, 500); // 假设动画时间小于 500ms
    };
    
    // 点击关闭按钮事件
    closeButton.addEventListener('click', function() {
        closeModal();
        if (!isEditMode) {
            drawnItems.removeLayer(layer);
        }
    });
    
    // 点击取消按钮事件
    cancelButton.addEventListener('click', function() {
        closeModal();
        if (!isEditMode) {
            drawnItems.removeLayer(layer);
            showNotification('已取消添加区域', 'info');
        }
    });
    
    // 点击保存按钮事件
    saveButton.addEventListener('click', function() {
        const regionName = document.getElementById('region-name').value;
        if (!regionName) {
            showNotification('请输入区域名称', 'error');
            return;
        }
        const forestSubtype = document.getElementById('forest-subtype').value;
        
        // 设置区域类型为森林，并保存所选森林子类型
        region.name = regionName;
        region.type = 'forest'; // 固定为森林类型
        region.forestSubtype = forestSubtype;
        
        const carbonData = calculateCarbonValue(region);
        region.carbon = parseFloat(carbonData.total);
        region.density = parseFloat(carbonData.density);
        
        if (isEditMode) {
            const index = regions.findIndex(r => r.id === region.id);
            if (index !== -1) {
                regions[index] = region;
                showNotification(`区域"${regionName}"已更新`, 'success');
            }
        } else {
            regions.push(region);
            layer.regionId = region.id;
            showNotification(`已添加新区域"${regionName}"`, 'success');
        }
        
        updateRegionsList();
        updateChart(); // 确保在这里调用更新图表
        
        closeModal();
    });
    
    // 添加ESC键关闭对话框
    document.addEventListener('keydown', function handleEscKey(event) { // 给事件处理函数命名
        if (event.key === 'Escape') {
            closeModal();
            if (!isEditMode) {
                drawnItems.removeLayer(layer);
            }
            // 移除事件监听器
            document.removeEventListener('keydown', handleEscKey);
        }
    });
}

// 处理编辑完成事件
function handleDrawEdited(e) {
  const layers = e.layers;
  
  layers.eachLayer(function(layer) {
    // 查找对应的区域
    const region = regions.find(r => r.layer === layer);
    
    if (region) {
      // 保留区域名称
      const regionName = region.name;
      const regionType = region.type;
      const forestType = region.forestType;
      
      // 更新区域几何数据
      if (regionType === 'polygon' || regionType === 'rectangle') {
        const latlngs = regionType === 'polygon' ? layer.getLatLngs()[0] : [
          layer.getBounds().getNorthWest(),
          layer.getBounds().getNorthEast(),
          layer.getBounds().getSouthEast(),
          layer.getBounds().getSouthWest()
        ];
        
        region.coordinates = latlngs;
        
        // 重新计算面积
        const area = L.GeometryUtil.geodesicArea(latlngs);
        region.area = (area / 10000).toFixed(2);
      } else if (regionType === 'circle') {
        region.center = layer.getLatLng();
        region.radius = layer.getRadius();
        
        // 重新计算圆面积
        const area = Math.PI * region.radius * region.radius;
        region.area = (area / 10000).toFixed(2);
      }
      
      // 确保区域名称和类型保留不变
      region.name = regionName;
      region.type = regionType;
      region.forestType = forestType;
      
      // 提示用户区域已更新
      showNotification(`区域"${region.name}"已更新`, 'success', 2000);
    }
  });
  
  // 更新区域列表
  updateRegionsList();
  
  // 重新分析数据
  analyzeData();
}

// 处理删除事件
function handleDrawDeleted(e) {
  const layers = e.layers;
  
  layers.eachLayer(function(layer) {
    // 查找要删除的区域索引
    const index = regions.findIndex(r => r.layer === layer);
    
    if (index !== -1) {
      // 从数组中移除区域
      const deletedRegion = regions.splice(index, 1)[0];
      
      // 通知用户
      showNotification(`区域"${deletedRegion.name}"已删除`, 'success', 2000);
    }
  });
  
  // 如果存在更新区域列表的函数则调用
  if (typeof updateRegionsList === 'function') {
    updateRegionsList();
  }
  
  // 如果存在分析数据的函数则调用
  if (typeof analyzeData === 'function') {
    analyzeData();
  }
}

// 退出登录
function handleLogout() {
  // 使用carbonAPI退出登录
  carbonAPI.auth.logout();
  
  // 重置当前用户
  currentUser = null;
  
  // 隐藏退出登录按钮
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.classList.add('hidden');
  }
  
  // 清除用户信息显示
  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.textContent = '未登录';
  }
  
  // 隐藏主内容区，显示欢迎页面
  const welcomePage = document.getElementById('welcomePage');
  const mainContent = document.getElementById('mainContent');
  
  if (welcomePage && mainContent) {
    mainContent.classList.add('hidden');
    welcomePage.classList.remove('hidden');
  }
  
  // 清除地图和区域数据
  if (drawnItems) {
    drawnItems.clearLayers();
  }
  regions = [];
  
  // 显示通知消息
  showNotification('您已成功退出登录', 'success');
  
  // 登出时清空自定义森林子类型缓存和临时存储
  window.userCustomSubtypesCache = [];
  guestSessionCustomSubtypes = [];
}

// 新的登录对话框创建函数
function createLoginBox() {
  // 移除任何已有的登录或注册框
  removeExistingBoxes();
  
  // 检查后端服务是否可用
  showLoading();
  
  // 尝试获取API状态
  fetch(`${config.apiBaseUrl}/health`, { 
    method: 'GET',
    mode: 'cors'
  })
  .then(response => {
    hideLoading();
    // 如果连接成功，显示登录框
    createLoginBoxUI();
  })
  .catch(error => {
    hideLoading();
    console.error('后端连接错误:', error);
    showNotification('无法连接到后端服务器，请确保服务器已启动。您可以选择以游客身份登录，但部分功能将受限。', 'warning', 6000);
    // 尽管有错误，仍然显示登录框以允许用户尝试
    createLoginBoxUI();
  });
}

// 创建登录框UI
function createLoginBoxUI() {
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;';
  
  // 创建登录框
  const loginBox = document.createElement('div');
  loginBox.id = 'loginBox';
  loginBox.style.cssText = 'background:#fff; width:350px; padding:20px; border-radius:5px; box-shadow:0 0 10px rgba(0,0,0,0.2);';
  
  // 创建标题
  const title = document.createElement('h3');
  title.style.cssText = 'margin:0 0 20px 0; padding-bottom:10px; border-bottom:1px solid #eee;';
  title.textContent = '用户登录';
  
  loginBox.appendChild(title);
  
  // 创建表单
  const form = document.createElement('div');
  
  // 用户名输入
  const usernameGroup = document.createElement('div');
  usernameGroup.style.cssText = 'margin-bottom:15px;';
  
  const usernameLabel = document.createElement('label');
  usernameLabel.style.cssText = 'display:block; margin-bottom:5px; font-weight:bold;';
  usernameLabel.textContent = '用户名';
  
  const username = document.createElement('input');
  username.type = 'text';
  username.id = 'username';
  username.style.cssText = 'width:100%; padding:8px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;';
  username.placeholder = '请输入用户名';
  
  usernameGroup.appendChild(usernameLabel);
  usernameGroup.appendChild(username);
  
  // 密码输入
  const passwordGroup = document.createElement('div');
  passwordGroup.style.cssText = 'margin-bottom:25px;';
  
  const passwordLabel = document.createElement('label');
  passwordLabel.style.cssText = 'display:block; margin-bottom:5px; font-weight:bold;';
  passwordLabel.textContent = '密码';
  
  const password = document.createElement('input');
  password.type = 'password';
  password.id = 'password';
  password.style.cssText = 'width:100%; padding:8px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;';
  password.placeholder = '请输入密码';
  
  passwordGroup.appendChild(passwordLabel);
  passwordGroup.appendChild(password);
  
  // 按钮区域
  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = 'display:flex; justify-content:flex-end;';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = 'padding:8px 16px; margin-right:10px; border:none; background:#f2f2f2; color:#333; border-radius:4px; cursor:pointer;';
  cancelBtn.onclick = function() {
    document.body.removeChild(overlay);
  };
  
  const loginBtn = document.createElement('button');
  loginBtn.textContent = '登录';
  loginBtn.style.cssText = 'padding:8px 16px; border:none; background:#4CAF50; color:white; border-radius:4px; cursor:pointer;';
  loginBtn.onclick = function() {
    const user = username.value.trim();
    const pass = password.value;
    
    if (!user) {
      showNotification('请输入用户名', 'error');
      return;
    }
    
    if (!pass) {
      showNotification('请输入密码', 'error');
      return;
    }
    
    performLogin(user, pass, overlay);
  };
  
  // 添加游客登录选项
  const guestLoginLink = document.createElement('a');
  guestLoginLink.textContent = '游客登录';
  guestLoginLink.style.cssText = 'margin-right:auto; color:#4CAF50; cursor:pointer; font-size:14px;';
  guestLoginLink.onclick = function() {
    document.body.removeChild(overlay);
    guestLogin();
  };
  
  buttonGroup.appendChild(guestLoginLink);
  buttonGroup.appendChild(cancelBtn);
  buttonGroup.appendChild(loginBtn);
  
  // 组装表单
  form.appendChild(usernameGroup);
  form.appendChild(passwordGroup);
  form.appendChild(buttonGroup);
  
  loginBox.appendChild(form);
  overlay.appendChild(loginBox);
  
  // 添加到body
  document.body.appendChild(overlay);
  
  // 设置焦点
  setTimeout(() => {
    username.focus();
  }, 100);
  
  // 处理Enter键
  username.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      password.focus();
    }
  });
  
  password.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      loginBtn.click();
    }
  });
  
  // 处理点击背景关闭
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// 新的注册对话框创建函数
function createRegisterBox() {
  // 移除任何已有的登录或注册框
  removeExistingBoxes();
  
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;';
  
  // 创建注册框
  const registerBox = document.createElement('div');
  registerBox.id = 'registerBox';
  registerBox.style.cssText = 'background:#fff; width:350px; padding:20px; border-radius:5px; box-shadow:0 0 10px rgba(0,0,0,0.2);';
  
  // 创建标题
  const title = document.createElement('h3');
  title.style.cssText = 'margin:0 0 20px 0; padding-bottom:10px; border-bottom:1px solid #eee;';
  title.textContent = '用户注册';
  
  registerBox.appendChild(title);
  
  // 创建表单
  const form = document.createElement('div');
  
  // 用户名输入
  const usernameGroup = document.createElement('div');
  usernameGroup.style.cssText = 'margin-bottom:15px;';
  
  const usernameLabel = document.createElement('label');
  usernameLabel.style.cssText = 'display:block; margin-bottom:5px; font-weight:bold;';
  usernameLabel.textContent = '用户名';
  
  const username = document.createElement('input');
  username.type = 'text';
  username.id = 'regUsername';
  username.style.cssText = 'width:100%; padding:8px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;';
  username.placeholder = '请设置用户名';
  
  usernameGroup.appendChild(usernameLabel);
  usernameGroup.appendChild(username);
  
  // 密码输入
  const passwordGroup = document.createElement('div');
  passwordGroup.style.cssText = 'margin-bottom:15px;';
  
  const passwordLabel = document.createElement('label');
  passwordLabel.style.cssText = 'display:block; margin-bottom:5px; font-weight:bold;';
  passwordLabel.textContent = '密码';
  
  const password = document.createElement('input');
  password.type = 'password';
  password.id = 'regPassword';
  password.style.cssText = 'width:100%; padding:8px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;';
  password.placeholder = '请设置密码';
  
  passwordGroup.appendChild(passwordLabel);
  passwordGroup.appendChild(password);
  
  // 确认密码输入
  const confirmGroup = document.createElement('div');
  confirmGroup.style.cssText = 'margin-bottom:25px;';
  
  const confirmLabel = document.createElement('label');
  confirmLabel.style.cssText = 'display:block; margin-bottom:5px; font-weight:bold;';
  confirmLabel.textContent = '确认密码';
  
  const confirm = document.createElement('input');
  confirm.type = 'password';
  confirm.id = 'regConfirm';
  confirm.style.cssText = 'width:100%; padding:8px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;';
  confirm.placeholder = '请再次输入密码';
  
  confirmGroup.appendChild(confirmLabel);
  confirmGroup.appendChild(confirm);
  
  // 按钮区域
  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = 'display:flex; justify-content:flex-end;';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = 'padding:8px 16px; margin-right:10px; border:none; background:#f2f2f2; color:#333; border-radius:4px; cursor:pointer;';
  cancelBtn.onclick = function() {
    document.body.removeChild(overlay);
  };
  
  const registerBtn = document.createElement('button');
  registerBtn.textContent = '注册';
  registerBtn.style.cssText = 'padding:8px 16px; border:none; background:#4CAF50; color:white; border-radius:4px; cursor:pointer;';
  registerBtn.onclick = function() {
    const user = username.value.trim();
    const pass = password.value;
    const confirmPass = confirm.value;
    
    if (!user) {
      showNotification('请输入用户名', 'error');
      return;
    }
    
    if (!pass) {
      showNotification('请输入密码', 'error');
      return;
    }
    
    if (pass !== confirmPass) {
      showNotification('两次输入的密码不一致', 'error');
      return;
    }
    
    performRegister(user, pass, overlay);
  };
  
  buttonGroup.appendChild(cancelBtn);
  buttonGroup.appendChild(registerBtn);
  
  // 组装表单
  form.appendChild(usernameGroup);
  form.appendChild(passwordGroup);
  form.appendChild(confirmGroup);
  form.appendChild(buttonGroup);
  
  registerBox.appendChild(form);
  overlay.appendChild(registerBox);
  
  // 添加到body
  document.body.appendChild(overlay);
  
  // 设置焦点
  setTimeout(() => {
    username.focus();
  }, 100);
  
  // 处理Enter键
  username.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      password.focus();
    }
  });
  
  password.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      confirm.focus();
    }
  });
  
  confirm.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      registerBtn.click();
    }
  });
  
  // 处理点击背景关闭
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// 移除任何现有的登录或注册框
function removeExistingBoxes() {
  const existingOverlay = document.getElementById('overlay');
  if (existingOverlay) {
    document.body.removeChild(existingOverlay);
  }

  // 关闭所有原生dialog元素
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach(dialog => {
    if (dialog.open) {
      dialog.close();
    }
  });
  
  // 移除可能存在的旧版模态框
  const oldModals = document.querySelectorAll('[id$="Modal"]');
  oldModals.forEach(modal => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  });
  
  // 移除旧版登录/注册对话框
  const oldLoginDialog = document.getElementById('simpleLoginDialog');
  if (oldLoginDialog) {
    document.body.removeChild(oldLoginDialog);
  }
  
  const oldRegisterDialog = document.getElementById('simpleRegisterDialog');
  if (oldRegisterDialog) {
    document.body.removeChild(oldRegisterDialog);
  }
}

// 执行登录
function performLogin(username, password, overlay) {
  if (isLoading) return;
  
  showLoading();
  
  // 使用carbonAPI进行登录
  carbonAPI.auth.login(username, password)
    .then(data => {
      hideLoading();
      
      if (data.token) {
        document.body.removeChild(overlay);
        loginSuccess(data.username);
        showNotification(`欢迎回来，${data.username}！`, 'success');
      } else {
        showNotification(data.message || '登录失败，请检查用户名和密码', 'error');
      }
    })
    .catch(error => {
      hideLoading();
      console.error('登录错误:', error);
      
      // 改进的错误处理
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        showNotification('无法连接到后端服务，请确保服务器已启动并运行在正确的端口上', 'error', 5000);
      } else {
        showNotification(error.message || '登录过程中发生错误，请稍后再试', 'error', 4000);
      }
    });
}

// 执行注册
function performRegister(username, password, overlay) {
  if (isLoading) return;
  
  showLoading();
  
  // 使用carbonAPI进行注册
  carbonAPI.auth.register(username, password)
    .then(data => {
      hideLoading();
      
      if (data.id) {
        // 注册成功并自动登录
        if (data.token) {
          document.body.removeChild(overlay);
          loginSuccess(data.username);
          showNotification(`注册成功，欢迎 ${data.username}！`, 'success');
        } else {
          // 需要手动登录
          document.body.removeChild(overlay);
          showNotification(`注册成功，请登录系统`, 'success');
          createLoginBox();
        }
      } else {
        showNotification(data.message || '注册失败，请稍后再试', 'error');
      }
    })
    .catch(error => {
      hideLoading();
      console.error('注册错误:', error);
      
      // 改进的错误处理
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        showNotification('无法连接到后端服务，请确保服务器已启动并运行在正确的端口上', 'error', 5000);
      } else {
        showNotification(error.message || '注册过程中发生错误，请稍后再试', 'error', 4000);
      }
    });
}

// 登录成功
function loginSuccess(username) {
  console.log('loginSuccess called for:', username);
  currentUser = username;
  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.textContent = `当前用户: ${username}`;
  }
  
  // 显示退出登录按钮
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.classList.remove('hidden');
  }
  
  // 显示主内容区
  const welcomePage = document.getElementById('welcomePage');
  const mainContent = document.getElementById('mainContent');
  
  if (welcomePage && mainContent) {
    welcomePage.classList.add('hidden');
    mainContent.classList.remove('hidden');
  }
  
  // 初始化地图和图表
  console.log('loginSuccess: Initializing map...');
  initMap();
  console.log('loginSuccess: Initializing chart...');
  const chartInitialized = initChart(); // 获取 initChart 的返回值
  console.log('loginSuccess: Chart initialization attempt finished. Result:', chartInitialized);
  
  // 如果图表初始化成功，尝试更新一次
  if (chartInitialized) {
      console.log('loginSuccess: Performing initial chart update.');
      updateChart(); 
  } else {
      console.error('loginSuccess: Chart initialization failed, cannot perform initial update.');
  }
  
  // 登录成功后刷新用户的自定义森林子类型
  fetchUserCustomSubtypes().then(() => {
      // 清空游客模式下的临时类型
      guestSessionCustomSubtypes = [];
      
      // 如果当前有打开的模态框，刷新其下拉列表
      const openedDropdown = document.querySelector('#forest-subtype');
      if (openedDropdown) {
          populateForestSubtypeDropdown(openedDropdown, openedDropdown.value);
      }
  });
}

// 游客登录
function guestLogin() {
  if (isLoading) return;
  
  showLoading();
  
  // 创建游客用户对象
  const guestUser = {
    username: '游客用户',
    token: null,
    id: 'guest'
  };
  
  // 保存游客状态
  localStorage.setItem('currentUser', JSON.stringify(guestUser));
  
  setTimeout(() => {
    hideLoading();
    loginSuccess('游客用户');
    showNotification('已以游客身份登录，部分功能可能受限', 'warning');
  }, 800);
}

// 重置参数函数
function resetParameters() {
  // 保留对旧参数的重置，保持兼容性
  if (document.getElementById('biomassModel')) {
    document.getElementById('biomassModel').value = 'model1'; // 默认值：通用生物量模型
  }
  
  if (document.getElementById('carbonRatio') && document.getElementById('carbonRatioValue')) {
    document.getElementById('carbonRatio').value = config.carbonRatio;
    document.getElementById('carbonRatioValue').textContent = config.carbonRatio;
  }
  
  if (document.getElementById('rootShootRatio') && document.getElementById('rootShootRatioValue')) {
    document.getElementById('rootShootRatio').value = config.rootShootRatio;
    document.getElementById('rootShootRatioValue').textContent = config.rootShootRatio;
  }
  
  // 重置新添加的参数
  // 1. 重置光谱指数选择
  if (document.getElementById('ndviIndex')) document.getElementById('ndviIndex').checked = config.defaultIndices.ndvi;
  if (document.getElementById('eviIndex')) document.getElementById('eviIndex').checked = config.defaultIndices.evi;
  if (document.getElementById('saviIndex')) document.getElementById('saviIndex').checked = config.defaultIndices.savi;
  
  // 2. 重置LiDAR结构参数
  if (document.getElementById('hmaxParam')) document.getElementById('hmaxParam').checked = config.defaultLidarParams.hmax;
  if (document.getElementById('hmeanParam')) document.getElementById('hmeanParam').checked = config.defaultLidarParams.hmean;
  if (document.getElementById('h95Param')) document.getElementById('h95Param').checked = config.defaultLidarParams.h95;
  if (document.getElementById('h75Param')) document.getElementById('h75Param').checked = config.defaultLidarParams.h75;
  if (document.getElementById('h50Param')) document.getElementById('h50Param').checked = config.defaultLidarParams.h50;
  
  // 3. 重置数据预处理参数
  resetRangeSlider('groundFilterThreshold', 'groundFilterThresholdValue', config.groundFilterThreshold);
  
  if (document.getElementById('gridResolution')) {
    document.getElementById('gridResolution').value = config.gridResolution.toString();
  }
  
  resetRangeSlider('chmSmoothRadius', 'chmSmoothRadiusValue', config.chmSmoothRadius);
  
  // 4. 重置单株分割参数
  if (document.getElementById('localMaxWindowSize')) {
    document.getElementById('localMaxWindowSize').value = config.localMaxWindowSize.toString();
  }
  
  resetRangeSlider('watershedSensitivity', 'watershedSensitivityValue', config.watershedSensitivity);
  resetRangeSlider('minTreeHeight', 'minTreeHeightValue', config.minTreeHeight);
  
  // 5. 重置属性计算与模型参数
  if (document.getElementById('univariateModel') && document.getElementById('bivariateModel')) {
    document.getElementById('univariateModel').checked = config.univariateModel;
    document.getElementById('bivariateModel').checked = !config.univariateModel;
    
    // 根据模型类型显示/隐藏c系数
    const coefCRow = document.getElementById('coefCRow');
    if (coefCRow) {
      coefCRow.style.display = config.univariateModel ? 'none' : 'flex';
    }
  }
  
  // 重置经验模型系数
  if (document.getElementById('coefA')) document.getElementById('coefA').value = config.modelCoefficients.a;
  if (document.getElementById('coefB')) document.getElementById('coefB').value = config.modelCoefficients.b;
  if (document.getElementById('coefC')) document.getElementById('coefC').value = config.modelCoefficients.c;
  
  // 6. 重置可视化与结果导出参数
  resetRangeSlider('previewSliceHeight', 'previewSliceHeightValue', config.previewSliceHeight);
  
  // 重置双滑块
  if (document.getElementById('colorRangeMin') && document.getElementById('colorRangeMinValue')) {
    document.getElementById('colorRangeMin').value = config.colorRange.min;
    document.getElementById('colorRangeMinValue').textContent = config.colorRange.min;
  }
  
  if (document.getElementById('colorRangeMax') && document.getElementById('colorRangeMaxValue')) {
    document.getElementById('colorRangeMax').value = config.colorRange.max;
    document.getElementById('colorRangeMaxValue').textContent = config.colorRange.max;
  }
  
  // 7. 重置生物量模型
  if (document.getElementById('pantropicalModel') && document.getElementById('ghanaModel') && document.getElementById('multiRegModel')) {
    const modelType = config.defaultBiomassModel;
    document.getElementById('pantropicalModel').checked = (modelType === 'pantropical');
    document.getElementById('ghanaModel').checked = (modelType === 'ghana');
    document.getElementById('multiRegModel').checked = (modelType === 'multireg');
  }
  
  // 重置木材密度
  if (document.getElementById('woodDensity')) {
    document.getElementById('woodDensity').value = config.woodDensity;
  }
  
  // 重置碳含量系数
  resetRangeSlider('carbonFraction', 'carbonFractionValue', config.carbonFraction);
  
  // 重置模型文件路径
  if (document.getElementById('modelFilePath')) {
    document.getElementById('modelFilePath').value = '';
  }
  
  // 更新可视化
  updateVisualization();
  
  // 显示重置成功通知
  showNotification('参数已重置为默认值', 'success');
}

// 辅助函数：重置范围滑块
function resetRangeSlider(sliderId, valueId, defaultValue) {
  const slider = document.getElementById(sliderId);
  const valueDisplay = document.getElementById(valueId);
  
  if (slider && valueDisplay) {
    slider.value = defaultValue;
    valueDisplay.textContent = defaultValue;
  }
}

// 数据分析函数
function analyzeData() {
  try {
    console.log('analyzeData 函数被调用');
    
    // 如果没有区域数据
    if (!regions || regions.length === 0) {
      showNotification('没有区域数据可供分析', 'warning');
    }
    
    // 更新区域列表显示
    updateRegionsList();
    
    // 使用新的图表更新函数
    updateChart();
    
    // 显示通知
    if (regions && regions.length > 0) {
      showNotification(`已分析 ${regions.length} 个区域的碳汇数据`, 'success');
    }
  } catch (error) {
    console.error('数据分析错误:', error);
    showNotification('分析数据时出错', 'error');
  }
}

// 更新区域列表
function updateRegionsList() {
  // 查找区域列表容器
  const regionsContainer = document.getElementById('regionsList');
  if (!regionsContainer) return;
  
  // 清空列表
  regionsContainer.innerHTML = '';
  
  // 如果没有区域
  if (regions.length === 0) {
    regionsContainer.innerHTML = '<p class="empty-message">暂无区域数据</p>';
    return;
  }
  
  // 获取预设森林子类型
  const presetSubtypes = [
    { value: 'pine', label: '杉木林' },
    { value: 'mixed', label: '混交林' },
    { value: 'broadleaf', label: '阔叶林' },
    { value: 'conifer', label: '针叶林' }
  ];
  
  // 获取自定义森林子类型
  const customSubtypes = getCustomForestSubtypes();
  
  // 合并所有森林子类型
  const allForestSubtypes = [...presetSubtypes, ...customSubtypes];
  
  // 添加区域到列表
  regions.forEach((region) => {
    // 计算碳汇值
    const carbonData = calculateCarbonValue(region);
    
    // 获取森林子类型的显示标签
    let forestSubtypeLabel = '未指定';
    if (region.forestSubtype) {
      const subtypeObj = allForestSubtypes.find(st => st.value === region.forestSubtype);
      if (subtypeObj) {
        forestSubtypeLabel = subtypeObj.label;
      }
    }
    
    // 创建区域列表项
    const regionItem = document.createElement('div');
    regionItem.className = 'region-item';
    regionItem.dataset.regionId = region.id;
    
    // 区域标题栏（名称和操作按钮）
    const header = document.createElement('div');
    header.className = 'region-header';
    
    const typeIcon = document.createElement('span');
    typeIcon.className = 'region-type-icon';
    typeIcon.textContent = '🌲'; // 森林图标
    typeIcon.title = `森林类型: ${forestSubtypeLabel}`;
    
    const regionName = document.createElement('div');
    regionName.className = 'region-name';
    regionName.textContent = region.name;
    
    const actionButtons = document.createElement('div');
    actionButtons.className = 'region-actions';
    
    const zoomButton = document.createElement('button');
    zoomButton.className = 'action-btn zoom-btn';
    zoomButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';
    zoomButton.title = '定位到此区域';
    zoomButton.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomToRegion(region);
    });
    
    const editButton = document.createElement('button');
    editButton.className = 'action-btn edit-btn';
    editButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    editButton.title = '编辑此区域';
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      showRegionNameDialog(region, region.layer, true);
    });
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'action-btn delete-btn';
    deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
    deleteButton.title = '删除此区域';
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`确定要删除区域"${region.name}"吗？`)) {
        // 从地图移除图层
        if (drawnItems && region.layer) {
          drawnItems.removeLayer(region.layer);
        }
        
        // 从数组中移除区域
        const index = regions.findIndex(r => r.id === region.id);
        if (index !== -1) {
          regions.splice(index, 1);
        }
        
        // 更新区域列表
        updateRegionsList();
        
        // 更新图表
        updateChart();
        
        showNotification(`已删除区域"${region.name}"`, 'success');
      }
    });
    
    actionButtons.appendChild(zoomButton);
    actionButtons.appendChild(editButton);
    actionButtons.appendChild(deleteButton);
    
    header.appendChild(typeIcon);
    header.appendChild(regionName);
    header.appendChild(actionButtons);
    
    // 区域详细信息
    const details = document.createElement('div');
    details.className = 'region-details';
    
    const subtypeInfo = document.createElement('div');
    subtypeInfo.className = 'detail-item';
    subtypeInfo.innerHTML = `<span class="detail-label">森林类型：</span><span class="detail-value">${forestSubtypeLabel}</span>`;
    
    const areaInfo = document.createElement('div');
    areaInfo.className = 'detail-item';
    areaInfo.innerHTML = `<span class="detail-label">面积：</span><span class="detail-value">${region.area} 公顷</span>`;
    
    const carbonInfo = document.createElement('div');
    carbonInfo.className = 'detail-item';
    carbonInfo.innerHTML = `<span class="detail-label">碳储量：</span><span class="detail-value">${carbonData.total} 吨</span>`;
    
    const densityInfo = document.createElement('div');
    densityInfo.className = 'detail-item';
    densityInfo.innerHTML = `<span class="detail-label">密度：</span><span class="detail-value">${carbonData.density} 吨/公顷</span>`;
    
    details.appendChild(subtypeInfo);
    details.appendChild(areaInfo);
    details.appendChild(carbonInfo);
    details.appendChild(densityInfo);
    
    regionItem.appendChild(header);
    regionItem.appendChild(details);
    
    // 添加点击事件 - 定位到区域
    regionItem.addEventListener('click', function() {
      zoomToRegion(region);
    });
    
    // 添加鼠标悬停效果 - 在地图上高亮显示区域
    regionItem.addEventListener('mouseenter', function() {
      highlightRegion(region, true);
      this.classList.add('highlight');
    });
    
    regionItem.addEventListener('mouseleave', function() {
      highlightRegion(region, false);
      this.classList.remove('highlight');
    });
    
    regionsContainer.appendChild(regionItem);
  });
  
  // 更新区域计数
  const regionCount = document.getElementById('regionCount');
  if (regionCount) {
    regionCount.textContent = `${regions.length}个区域`;
  }
}

// 定位到区域
function zoomToRegion(region) {
  if (!map || !region || !region.layer) return;
  
  // 切换到地图标签页
  switchTab('mapTab');
  
  // 根据区域类型执行不同的定位
  if (region.type === 'circle' && region.center && region.radius) {
    // 圆形区域定位
    map.setView(region.center, getZoomLevel(region.radius));
  } else if (region.coordinates && region.coordinates.length > 0) {
    // 多边形或矩形定位
    const bounds = L.latLngBounds(region.coordinates);
    map.fitBounds(bounds, { padding: [50, 50] });
  }
  
  // 高亮显示区域
  flashRegion(region);
}

// 根据半径计算合适的缩放级别
function getZoomLevel(radius) {
  // 简单计算：半径越大，缩放级别越小
  if (radius > 10000) return 9;
  if (radius > 5000) return 10;
  if (radius > 1000) return 12;
  if (radius > 500) return 13;
  if (radius > 100) return 14;
  return 15;
}

// 地图上高亮显示区域
function highlightRegion(region, highlight) {
  if (!region.layer) return;
  
  if (highlight) {
    // 保存原始样式
    if (!region.layer._originalStyle) {
      region.layer._originalStyle = {
        color: region.layer.options.color,
        weight: region.layer.options.weight,
        opacity: region.layer.options.opacity,
        fillOpacity: region.layer.options.fillOpacity
      };
    }
    
    // 设置高亮样式
    region.layer.setStyle({
      color: '#FF4500',
      weight: 4,
      opacity: 1,
      fillOpacity: 0.4
    });
    
    // 确保图层在最上层
    if (region.layer.bringToFront) {
      region.layer.bringToFront();
    }
  } else {
    // 恢复原始样式
    if (region.layer._originalStyle) {
      region.layer.setStyle(region.layer._originalStyle);
    }
  }
}

// 闪烁高亮区域
function flashRegion(region) {
  if (!region.layer) return;
  
  // 闪烁效果
  let count = 0;
  const interval = setInterval(() => {
    highlightRegion(region, count % 2 === 0);
    count++;
    if (count >= 6) {
      clearInterval(interval);
      highlightRegion(region, false);
    }
  }, 300);
}

// 导出数据函数
function exportData() {
  if (regions.length === 0) {
    showNotification('没有可导出的数据', 'warning');
    return;
  }
  
  // 准备导出数据
  const exportRegions = regions.map(region => {
    return {
      id: region.id,
      name: region.name,
      type: region.type,
      area: parseFloat(region.area),
      forestType: region.forestType || '',
      carbonValue: calculateCarbonValue(region)
    };
  });
  
  // 创建JSON数据
  const dataStr = JSON.stringify(exportRegions, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  
  // 创建下载链接
  const exportFileName = `林木碳汇数据_${new Date().toISOString().substring(0, 10)}.json`;
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileName);
  linkElement.style.display = 'none';
  
  // 添加到文档并点击
  document.body.appendChild(linkElement);
  linkElement.click();
  document.body.removeChild(linkElement);
  
  showNotification(`数据已导出为 ${exportFileName}`, 'success');
}

// 计算碳汇值函数
function calculateCarbonValue(region) {
  // 默认值
  let baseDensity = 120; // 默认碳密度，单位：吨/公顷
  let above = 0;
  let below = 0;
  let total = 0;
  let density = 0;
  
  try {
    // 根据森林子类型调整基础密度
    if (region.type === 'forest' && region.forestSubtype) {
      switch(region.forestSubtype) {
        case 'pine': // 杉木林
          baseDensity = 140;
          break;
        case 'mixed': // 混交林
          baseDensity = 160;
          break;
        case 'broadleaf': // 阔叶林
          baseDensity = 180;
          break;
        case 'conifer': // 针叶林
          baseDensity = 150;
          break;
        default:
          // 处理自定义类型
          if (region.forestSubtype.startsWith('custom_')) {
            // 首先尝试从用户登录状态获取自定义类型
            const user = carbonAPI.auth.getCurrentUser();
            let customSubtypes = [];
            
            if (user && user.id && user.id !== 'guest') {
              // 已登录用户 - 从用户缓存获取
              customSubtypes = window.userCustomSubtypesCache || [];
            } else {
              // 游客模式 - 从会话临时存储获取
              customSubtypes = guestSessionCustomSubtypes;
            }
            
            // 查找匹配的自定义类型
            const matchedType = customSubtypes.find(type => type.value === region.forestSubtype);
            
            // 如果找到匹配的类型且有自定义密度，则使用它
            if (matchedType && matchedType.baseDensity) {
              baseDensity = matchedType.baseDensity;
            } else {
              // 否则使用默认值
              baseDensity = 130;
            }
          }
      }
    } else if (region.type !== 'forest') {
      // 非森林区域（应该不会出现这种情况，因为我们已将区域类型固定为森林）
      baseDensity = 50;
    }
    
    // 计算碳储量
    const areaHa = parseFloat(region.area || 0);
    
    // 地上部分碳储量
    above = baseDensity * areaHa;
    
    // 地下部分碳储量（假设为地上部分的25%）
    below = above * 0.25;
    
    // 总碳储量
    total = above + below;
    
    // 碳密度
    density = areaHa > 0 ? (total / areaHa).toFixed(2) : 0;
    
    return {
      above: above.toFixed(2),
      below: below.toFixed(2),
      total: total.toFixed(2),
      density: density
    };
  } catch (error) {
    console.error('计算碳汇值错误:', error);
    return {
      above: '0.00',
      below: '0.00',
      total: '0.00',
      density: '0.00'
    };
  }
}

// 清除所有区域函数
function clearAllRegions() {
  if (regions.length === 0) {
    showNotification('没有区域可清除', 'info');
    return;
  }
  
  // 显示确认对话框
  if (!confirm('确定要清除所有区域吗？此操作不可撤销。')) {
    return;
  }
  
  // 清除地图上的所有图层
  if (drawnItems) {
    drawnItems.clearLayers();
  }
  
  // 清空区域数组
  regions = [];
  
  // 更新区域列表
  updateRegionsList();
  
  // 重新分析数据
  analyzeData();
  
  showNotification('已清除所有区域', 'success');
}

// 切换标签页函数
function switchTab(tabId) {
  console.log('Switching tab to:', tabId);
  // 获取所有标签页按钮和内容
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // 移除所有活动状态
  tabButtons.forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-selected', 'false');
  });
  
  tabPanes.forEach(pane => {
    pane.classList.remove('active');
  });
  
  // 设置当前标签页为活动状态
  const activeButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const activePane = document.getElementById(tabId);
  
  if (activeButton) {
    activeButton.classList.add('active');
    activeButton.setAttribute('aria-selected', 'true');
  }
  
  if (activePane) {
    activePane.classList.add('active');
  }
  
  // 如果切换到图表标签页，初始化并调整图表大小
  if (tabId === 'chartTab') {
    console.log('switchTab: Initializing chart for chartTab');
    
    setTimeout(() => {
      try {
        // 尝试调用initChart初始化图表（如果已加载）
        if (typeof initChart === 'function') {
          console.log('switchTab: Calling initChart()');
          initChart();
        } else if (analysisChart) {
          console.log('switchTab: Resizing existing chart.');
          analysisChart.resize();
        } else {
          console.warn('switchTab: Neither initChart nor analysisChart available.');
        }
      } catch (chartError) {
        console.error('switchTab: Error initializing/resizing chart:', chartError);
      }
    }, 100); // 延迟确保容器可见
  }
  
  // 如果切换到地图标签页，重新调整地图大小
  if (tabId === 'mapTab') {
    if (map) {
      console.log('switchTab: Invalidating map size for mapTab.');
      setTimeout(() => {
        try {
          map.invalidateSize();
          console.log('switchTab: Map invalidateSize successful.');
        } catch (mapResizeError) {
          console.error('switchTab: Error invalidating map size:', mapResizeError);
        }
      }, 100); // 延迟确保容器可见
    } else {
      console.warn('switchTab: map not available for invalidateSize.');
    }
  }
  
  // 如果切换到区域详情标签页，更新区域列表
  if (tabId === 'detailsTab') {
    console.log('switchTab: Updating regions list for detailsTab');
    setTimeout(() => {
      try {
        updateRegionsList();
        console.log('switchTab: Regions list updated successfully.');
      } catch (updateError) {
        console.error('switchTab: Error updating regions list:', updateError);
      }
    }, 100);
  }
}

// 更新图表函数
function updateChart() {
  console.log('[main.js] updateChart called.');
  try {
    if (!analysisChart) {
      console.warn('[main.js] analysisChart instance not found in updateChart.');
      return;
    }
    console.log('[main.js] analysisChart instance found.');

    // 检查 regions 数据
    // console.log('[main.js] Regions data:', JSON.stringify(regions)); // 移除或修改此行以避免循环引用错误
    // 可以记录区域数量或名称等安全信息
    console.log(`[main.js] Updating chart with ${regions.length} regions.`); 
    
    if (!regions || regions.length === 0) {
      console.log('[main.js] No regions data. Setting empty chart state.');
      // 如果没有区域数据，显示空图表
      analysisChart.setOption({
        title: {
          text: '暂无区域数据',
          left: 'center',
          top: 'middle',
          textStyle: {
            fontSize: 18,
            color: '#999'
          }
        },
        xAxis: { data: [] },
        legend: { data: [] }, // 清空图例
        yAxis: [{}, {}, {}], // 清空轴配置避免错误
        series: [
          { data: [] },
          { data: [] },
          { data: [] }
        ]
      }, true); // `true` 表示不合并选项，完全替换
      
      // 更新总计数据显示
      updateTotals(null);
      return;
    }
    
    // 准备各区域的碳汇数据
    console.log('[main.js] Processing regions data for chart...');
    const chartData = regions.map(region => {
      const value = calculateCarbonValue(region);
      // 确保返回的对象包含必要字段，即使计算失败也返回默认值
      return {
        name: region.name || '未命名区域',
        area: parseFloat(region.area) || 0,
        carbon: parseFloat(value?.total) || 0, // 添加可选链和默认值
        density: parseFloat(value?.density) || 0 // 添加可选链和默认值
      };
    });
    console.log('[main.js] Calculated chartData:', JSON.stringify(chartData)); // 记录生成的图表数据
    
    // 准备图表配置
    const chartOption = {
      title: {
        text: `区域碳汇分析 (共${regions.length}个区域)`,
        left: 'center',
        textStyle: {
          fontSize: 16
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          // 自定义提示框内容
          let result = `<div style="font-weight:bold;margin-bottom:5px">${params[0].name}</div>`;
          params.forEach(param => {
            let value = param.value ?? '-'; // 处理 null 或 undefined
            let unit = '';
            if (param.seriesName.includes('面积')) unit = ' 公顷';
            else if (param.seriesName.includes('碳储量')) unit = ' 吨';
            else if (param.seriesName.includes('密度')) unit = ' 吨/公顷';
            const color = param.color;
            result += `<div style="display:flex;align-items:center;margin:3px 0">
                <span style="display:inline-block;width:10px;height:10px;background:${color};margin-right:6px"></span>
                <span>${param.seriesName}: ${value}${unit}</span>
              </div>`;
          });
          return result;
        }
      },
      legend: {
        data: ['面积 (ha)', '碳储量 (t)', '密度 (t/ha)'],
        bottom: 10
      },
      grid: {
        left: '3%',
        right: '10%',
        top: 80,
        bottom: 60,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: chartData.map(item => item.name),
        axisLabel: {
          interval: 0,
          rotate: chartData.length > 5 ? 30 : 0, 
          textStyle: {
            fontSize: 12
          }
        }
      },
      yAxis: [
        { 
          type: 'value',
          name: '面积 (ha)',
          position: 'left',
          axisLine: { show: true, lineStyle: { color: '#5470c6' } }, // 显式显示轴线
          splitLine: { show: false }
        },
        { 
          type: 'value',
          name: '碳储量 (t)',
          position: 'right',
          offset: 0,
          axisLine: { show: true, lineStyle: { color: '#91cc75' } }, // 显式显示轴线
          splitLine: { show: false }
        },
        { 
          type: 'value',
          name: '密度 (t/ha)',
          position: 'right',
          offset: 60,
          axisLine: { show: true, lineStyle: { color: '#fac858' } }, // 显式显示轴线
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '面积 (ha)',
          type: 'bar',
          yAxisIndex: 0,
          data: chartData.map(item => item.area),
          itemStyle: { color: '#5470c6' },
          barMaxWidth: 50
        },
        {
          name: '碳储量 (t)',
          type: 'bar',
          yAxisIndex: 1,
          data: chartData.map(item => item.carbon),
          itemStyle: { color: '#91cc75' },
          barMaxWidth: 50
        },
        {
          name: '密度 (t/ha)',
          type: 'line',
          yAxisIndex: 2,
          data: chartData.map(item => item.density),
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 3 },
          itemStyle: { color: '#fac858' }
        }
      ]
    };
    
    console.log('[main.js] Prepared chartOption:', JSON.stringify(chartOption, null, 2)); // 记录最终的配置
    
    // 应用图表配置
    console.log('[main.js] Calling analysisChart.setOption...');
    analysisChart.setOption(chartOption, true); // 使用 true 确保不合并旧选项
    console.log('[main.js] analysisChart.setOption finished.');
    
    // 计算总计
    const totals = chartData.reduce((acc, curr) => {
      acc.area += curr.area;
      acc.carbon += curr.carbon;
      return acc;
    }, { area: 0, carbon: 0 });
    
    // 计算平均密度
    totals.density = totals.area > 0 ? (totals.carbon / totals.area) : 0;
    
    // 估算林木总数（每公顷平均100棵树）
    totals.treeCount = Math.round(totals.area * 100);
    
    // 更新总计数据显示
    updateTotals(totals);
    
    // 更新区域计数
    const regionCount = document.getElementById('regionCount');
    if (regionCount) {
      regionCount.textContent = `${regions.length}个区域`;
    }
    
  } catch (error) {
    console.error('[main.js] Error during updateChart:', error);
    showNotification('更新图表时出现错误', 'error');
  }
}

// 更新总计数据显示
function updateTotals(totals) {
  const abovegroundCarbon = document.getElementById('abovegroundCarbon');
  const belowgroundCarbon = document.getElementById('belowgroundCarbon');
  const totalCarbon = document.getElementById('totalCarbon');
  const totalTrees = document.getElementById('totalTrees');
  const carbonDensity = document.getElementById('carbonDensity');
  const totalArea = document.getElementById('totalArea');
  
  if (!totals) {
    // 重置为默认值
    if (abovegroundCarbon) abovegroundCarbon.textContent = '-';
    if (belowgroundCarbon) belowgroundCarbon.textContent = '-';
    if (totalCarbon) totalCarbon.textContent = '-';
    if (totalTrees) totalTrees.textContent = '-';
    if (carbonDensity) carbonDensity.textContent = '-';
    if (totalArea) totalArea.textContent = '-';
    return;
  }
  
  // 根据碳汇比例计算地上和地下部分
  const carbonRatio = parseFloat(document.getElementById('rootShootRatio')?.value || config.rootShootRatio);
  const above = totals.carbon / (1 + carbonRatio);
  const below = totals.carbon - above;
  
  // 更新碳汇量指标
  if (abovegroundCarbon) abovegroundCarbon.textContent = above.toFixed(2);
  if (belowgroundCarbon) belowgroundCarbon.textContent = below.toFixed(2);
  if (totalCarbon) totalCarbon.textContent = totals.carbon.toFixed(2);
  
  // 更新区域统计信息
  if (totalTrees) {
    // 估算林木总数，如果API返回则使用，否则根据区域面积进行估算
    const treeCount = totals.treeCount || Math.round(totals.area * 100); // 假设每公顷约100棵树
    totalTrees.textContent = treeCount.toLocaleString('zh-CN');
  }
  
  if (carbonDensity) {
    // 计算平均碳密度 (tCO₂e/ha)
    const density = totals.area > 0 ? totals.carbon / totals.area : 0;
    carbonDensity.textContent = density.toFixed(1);
  }
  
  if (totalArea) {
    // 显示分析区域总面积 (公顷)
    totalArea.textContent = totals.area.toFixed(2);
  }
}

// 切换可折叠部分的展开/折叠状态
function toggleSection(element) {
  // 确保我们操作的是section-header元素
  const header = element.classList.contains('section-header') ? 
    element : element.closest('.section-header');
  
  if (!header) return;
  
  // 切换折叠状态
  header.classList.toggle('collapsed');
  
  // 更新图标显示
  const icon = header.querySelector('.toggle-icon');
  if (icon) {
    icon.textContent = header.classList.contains('collapsed') ? '▶' : '▼';
  }
  
  // 保存折叠状态到本地存储，方便下次访问时保持相同状态
  const sectionId = header.parentElement.id;
  if (sectionId) {
    const isCollapsed = header.classList.contains('collapsed');
    localStorage.setItem(`section_${sectionId}_collapsed`, isCollapsed.toString());
  }
}

// 初始化可折叠部分
function initCollapsibleSections() {
  // 获取所有section-header
  const sectionHeaders = document.querySelectorAll('.section-header');
  
  // 如果没有找到任何section-header，直接返回
  if (!sectionHeaders || sectionHeaders.length === 0) {
    console.warn('未找到任何可折叠部分的header，初始化失败');
    return;
  }
  
  sectionHeaders.forEach((header, index) => {
    // 获取保存的折叠状态
    const sectionId = header.parentElement.id;
    let isCollapsed = false;
    
    if (sectionId) {
      const savedState = localStorage.getItem(`section_${sectionId}_collapsed`);
      
      // 如果有保存的状态，使用保存的状态；否则，第一个部分默认展开，其余折叠
      if (savedState !== null) {
        isCollapsed = savedState === 'true';
      } else {
        // 第一个部分默认展开，其余折叠
        isCollapsed = index > 0;
      }
    } else {
      // 如果没有sectionId，也使用默认规则
      isCollapsed = index > 0;
    }
    
    // 设置初始折叠状态
    if (isCollapsed) {
      header.classList.add('collapsed');
    } else {
      header.classList.remove('collapsed');
    }
    
    // 更新图标
    const icon = header.querySelector('.toggle-icon');
    if (icon) {
      icon.textContent = isCollapsed ? '▶' : '▼';
    }
    
    // 添加点击事件
    header.addEventListener('click', function() {
      toggleSection(this);
    });
  });
}

// 初始化双滑块
function initDoubleRangeSlider() {
  const minSlider = document.getElementById('colorRangeMin');
  const maxSlider = document.getElementById('colorRangeMax');
  const minValueDisplay = document.getElementById('colorRangeMinValue');
  const maxValueDisplay = document.getElementById('colorRangeMaxValue');
  const rangeFill = document.querySelector('.double-range-slider .slider-range');
  
  if (!minSlider || !maxSlider || !minValueDisplay || !maxValueDisplay || !rangeFill) {
    console.warn('双滑块的某些元素未找到，初始化失败');
    return;
  }
  
  // 更新填充和显示
  function updateDoubleSlider() {
    const minVal = parseInt(minSlider.value);
    const maxVal = parseInt(maxSlider.value);
    const sliderMin = parseInt(minSlider.min);
    const sliderMax = parseInt(minSlider.max);
    
    // 确保min <= max
    if (minVal > maxVal) {
      if (this === minSlider) {
        minSlider.value = maxVal;
        minValueDisplay.textContent = maxVal;
      } else {
        maxSlider.value = minVal;
        maxValueDisplay.textContent = minVal;
      }
    } else {
      // 正常更新显示
      minValueDisplay.textContent = minVal;
      maxValueDisplay.textContent = maxVal;
    }
    
    // 计算填充的百分比位置
    const range = sliderMax - sliderMin;
    const minPercent = ((parseInt(minSlider.value) - sliderMin) / range) * 100;
    const maxPercent = ((parseInt(maxSlider.value) - sliderMin) / range) * 100;
    
    // 更新填充条的left和width
    rangeFill.style.left = `${minPercent}%`;
    rangeFill.style.width = `${maxPercent - minPercent}%`;
    
    // 更新配置
    config.colorRange.min = parseInt(minSlider.value);
    config.colorRange.max = parseInt(maxSlider.value);
    
    // 调用可视化更新函数
    updateVisualization();
  }
  
  // 添加事件监听器
  minSlider.addEventListener('input', updateDoubleSlider);
  maxSlider.addEventListener('input', updateDoubleSlider);
  
  // 初始化值和填充
  updateDoubleSlider();
}

// 初始化DBH模型相关联的UI
function initDBHModelUI() {
  const univariateModel = document.getElementById('univariateModel');
  const bivariateModel = document.getElementById('bivariateModel');
  const coefCRow = document.getElementById('coefCRow');
  
  if (!univariateModel || !bivariateModel || !coefCRow) {
    console.warn('DBH模型UI的某些元素未找到，初始化失败');
    return;
  }
  
  // 基于模型类型显示/隐藏c系数
  function updateCoefficientsVisibility() {
    if (univariateModel.checked) {
      coefCRow.style.display = 'none';
      // 将config中的univariateModel设置为true
      config.univariateModel = true;
    } else {
      coefCRow.style.display = 'flex';
      // 将config中的univariateModel设置为false
      config.univariateModel = false;
    }
    
    // 可以在这里添加更多的模型相关UI更新逻辑
    
    // 触发可视化更新
    updateVisualization();
  }
  
  // 初始化时执行一次
  updateCoefficientsVisibility();
  
  // 添加事件监听器
  univariateModel.addEventListener('change', updateCoefficientsVisibility);
  bivariateModel.addEventListener('change', updateCoefficientsVisibility);
  
  // 更新模型系数到配置
  const coefA = document.getElementById('coefA');
  const coefB = document.getElementById('coefB');
  const coefC = document.getElementById('coefC');
  
  if (coefA) {
    coefA.addEventListener('change', function() {
      config.modelCoefficients.a = parseFloat(this.value);
      updateVisualization();
    });
  }
  
  if (coefB) {
    coefB.addEventListener('change', function() {
      config.modelCoefficients.b = parseFloat(this.value);
      updateVisualization();
    });
  }
  
  if (coefC) {
    coefC.addEventListener('change', function() {
      config.modelCoefficients.c = parseFloat(this.value);
      updateVisualization();
    });
  }
}

// 更新可视化
function updateVisualization() {
  try {
    // 这个函数会在参数改变时调用，更新地图或图表的可视化效果
    console.log('更新可视化效果:');
    console.log('- 颜色范围:', config.colorRange);
    console.log('- 切片高度:', config.previewSliceHeight);
    console.log('- 模型类型:', config.univariateModel ? '一元模型' : '二元模型');
    console.log('- 模型系数:', config.modelCoefficients);
    
    // 如果使用了地图框架（如Leaflet），可以在这里更新图层样式
    if (window.map) {
      // 更新碳储量图层的颜色范围
      if (window.carbonLayer) {
        console.log('更新碳储量图层样式');
        window.carbonLayer.setOptions({
          min: config.colorRange.min,
          max: config.colorRange.max
        });
      }
      
      // 更新CHM切片显示
      if (window.chmLayer) {
        console.log('更新CHM切片显示');
        window.chmLayer.setOptions({
          height: config.previewSliceHeight
        });
      }
    }
    
    // 如果使用了图表（如ECharts），可以在这里更新图表
    if (window.chart) {
      console.log('更新图表数据和样式');
      // 这里可以添加图表更新代码
    }
    
    // 根据需要触发其他关联更新
    // ...
  } catch (error) {
    console.error('更新可视化时出错:', error);
  }
}

// --- 文件处理函数 (你可能已经有此函数或类似函数) ---
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const fileNameDiv = document.getElementById('fileName');
  if (fileNameDiv) {
    fileNameDiv.textContent = file.name;
  }
  
  // 判断文件类型
  const fileExt = file.name.split('.').pop().toLowerCase();
  
  // 如果是点云数据文件 (.las 或 .laz)
  if (fileExt === 'las' || fileExt === 'laz') {
    handleLidarFile(file);
  } else {
    showNotification('不支持的文件类型，请上传 .las 或 .laz 文件', 'error');
  }
}

// 处理LiDAR点云文件
async function handleLidarFile(file) {
  try {
    showLoading();
    
    // 创建FormData对象
    const formData = new FormData();
    formData.append('file', file);
    
    // 上传文件
    const response = await fetch(`${config.apiBaseUrl}/lidar/upload`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('文件上传失败');
     }
    
    const result = await response.json();
    const { filePath } = result;
    
    // 获取前端界面的参数值
    const groundFilterThreshold = parseFloat(document.getElementById('groundFilterThreshold').value);
    const gridResolution = parseFloat(document.getElementById('gridResolution').value);
    const chmSmoothRadius = parseInt(document.getElementById('chmSmoothRadius').value);
    
    // 调用LiDAR处理API
    const processResult = await carbonAPI.lidar.processLidarData({
      inputFilePath: filePath,
      groundFilterThreshold,
      gridResolution,
      chmSmoothRadius
    });
    
    hideLoading();
    
    if (processResult.success) {
      showNotification('点云数据处理成功', 'success');
    
      // 显示处理结果
      displayLidarResults(processResult.outputs);
  } else {
      showNotification('点云数据处理失败', 'error');
    }
  } catch (error) {
    hideLoading();
    console.error('处理LiDAR文件错误:', error);
    showNotification(`处理失败: ${error.message}`, 'error');
  }
}

// 显示LiDAR处理结果
function displayLidarResults(outputs) {
  // 保存处理结果以供图层使用
  lastProcessingOutputs = outputs;
  window.lastProcessingOutputs = outputs;
  
  // 示例：显示处理结果摘要
  const summaryHTML = `
    <div class="result-summary">
      <h4>点云处理结果</h4>
      <p>地面点文件: ${outputs.groundFile}</p>
      <p>非地面点文件: ${outputs.nonGroundFile}</p>
      <p>DEM文件: ${outputs.demFile}</p>
      <p>DSM文件: ${outputs.dsmFile}</p>
      <p>CHM文件: ${outputs.chmFile}</p>
      
      <div class="raster-buttons">
        <button onclick="toggleRasterLayer('dem')" class="btn-secondary">显示DEM</button>
        <button onclick="toggleRasterLayer('dsm')" class="btn-secondary">显示DSM</button>
        <button onclick="toggleRasterLayer('chm')" class="btn-secondary">显示CHM</button>
        <button onclick="hideAllRasterLayers()" class="btn-secondary">隐藏图层</button>
      </div>
    </div>
  `;
  
  // 假设有一个结果容器用于显示这些信息
  const resultsContainer = document.getElementById('chartContainer');
  if (resultsContainer) {
    resultsContainer.innerHTML = summaryHTML;
    
    // 切换到图表标签页以显示结果
    switchTab('chartTab');
  }
  
  // 显示提示，告知用户可以在地图上显示栅格图层
  showNotification('处理完成，您可以在地图上显示DEM/DSM/CHM图层', 'success', 5000);
}

// 修改文件输入相关事件监听器
function setupFileInputListeners() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }
  
  // 拖放功能
  const fileUploadArea = document.querySelector('.file-upload');
  if (fileUploadArea) {
    fileUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUploadArea.classList.add('drag-over');
    });
    
    fileUploadArea.addEventListener('dragleave', () => {
      fileUploadArea.classList.remove('drag-over');
    });
    
    fileUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUploadArea.classList.remove('drag-over');
      
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        fileInput.files = e.dataTransfer.files;
        
        const fileNameDiv = document.getElementById('fileName');
        if (fileNameDiv) {
          fileNameDiv.textContent = file.name;
        }
        
        // 处理文件
        handleFileSelect({ target: { files: [file] } });
      }
    });
  }
}

// 从服务器或临时存储获取自定义森林子类型
function getCustomForestSubtypes() {
  try {
    // 检查用户登录状态
    const user = carbonAPI.auth.getCurrentUser();
    
    // 如果是已登录用户
    if (user && user.id && user.id !== 'guest') {
      // 异步获取用户的自定义类型（这里使用同步返回结果的方式保持与原函数兼容）
      // 实际调用API是异步的，这里只返回缓存的结果
      const cachedSubtypes = window.userCustomSubtypesCache || [];
      
      // 在背景异步更新缓存（不阻塞当前操作）
      fetchUserCustomSubtypes();
      
      return cachedSubtypes;
    } else {
      // 游客模式下返回临时存储的自定义类型
      return guestSessionCustomSubtypes;
    }
  } catch (error) {
    console.error('获取自定义森林类型失败:', error);
    return [];
  }
}

// 异步从服务器获取用户的自定义森林子类型
async function fetchUserCustomSubtypes() {
  try {
    const user = carbonAPI.auth.getCurrentUser();
    
    // 如果不是有效用户或是游客，则跳过API调用
    if (!user || !user.token || user.id === 'guest') {
      return;
    }
    
    // 发起API请求获取用户的自定义森林子类型
    const response = await fetch(`${config.apiBaseUrl}/forest-subtypes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('获取自定义森林子类型失败');
    }
    
    const subtypes = await response.json();
    
    // 更新缓存
    window.userCustomSubtypesCache = subtypes;
    
    // 返回用户的自定义森林子类型
    return subtypes;
  } catch (error) {
    console.error('从服务器获取自定义森林子类型失败:', error);
    return [];
  }
}

// 保存自定义森林子类型
async function saveCustomForestSubtype(newType) {
  try {
    // 检查用户登录状态
    const user = carbonAPI.auth.getCurrentUser();
    
    // 如果是已登录用户
    if (user && user.id && user.id !== 'guest') {
      // 发起API请求创建新的自定义森林子类型
      const response = await fetch(`${config.apiBaseUrl}/forest-subtypes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ label: newType.label })
      });
      
      if (!response.ok) {
        // 如果是已存在的类型
        if (response.status === 400) {
          showNotification('该森林子类型已存在', 'error');
          return false;
        }
        
        throw new Error('创建自定义森林子类型失败');
      }
      
      // 解析响应获取新创建的类型（包含后端生成的value）
      const createdSubtype = await response.json();
      
      // 更新缓存
      const cachedSubtypes = window.userCustomSubtypesCache || [];
      window.userCustomSubtypesCache = [...cachedSubtypes, createdSubtype];
      
      return createdSubtype;
    } else {
      // 游客模式：验证输入并在临时存储中添加
      // 检查是否已存在同名类型
      if (guestSessionCustomSubtypes.some(type => type.label === newType.label)) {
        showNotification('该森林子类型已存在', 'error');
        return false;
      }
      
      // 生成临时的唯一value
      const tempType = {
        label: newType.label,
        value: `custom_guest_${Date.now()}`
      };
      
      // 添加到临时存储
      guestSessionCustomSubtypes.push(tempType);
      
      return tempType;
    }
  } catch (error) {
    console.error('保存自定义森林类型失败:', error);
    showNotification('保存自定义森林类型失败', 'error');
    return false;
  }
}

// 填充森林子类型下拉列表
function populateForestSubtypeDropdown(selectElement, selectedValue = null) {
  if (!selectElement) return;
  
  // 清空当前选项
  selectElement.innerHTML = '';
  
  // 获取预设森林子类型
  const presetSubtypes = [
    { value: 'pine', label: '杉木林' },
    { value: 'mixed', label: '混交林' },
    { value: 'broadleaf', label: '阔叶林' },
    { value: 'conifer', label: '针叶林' }
  ];
  
  // 获取自定义森林子类型
  const customSubtypes = getCustomForestSubtypes();
  
  // 合并预设和自定义类型
  const forestSubtypes = [...presetSubtypes, ...customSubtypes];
  
  // 添加所有子类型选项
  forestSubtypes.forEach(subtype => {
    const option = document.createElement('option');
    option.value = subtype.value;
    option.textContent = subtype.label;
    selectElement.appendChild(option);
  });
  
  // 添加"添加自定义类型"选项
  const customOption = document.createElement('option');
  customOption.value = '__add_custom__';
  customOption.textContent = '-- 添加自定义类型 --';
  selectElement.appendChild(customOption);
  
  // 如果有选定值，设置选中项
  if (selectedValue) {
    selectElement.value = selectedValue;
  }
}

// 处理LiDAR数据上传
function handleLidarUpload() {
  const fileInput = document.getElementById('lidarUpload');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    showNotification('请选择要上传的LiDAR点云文件', 'warning');
    return;
  }
  
  // 检查用户是否登录
  const user = window.carbonAPI?.auth?.getCurrentUser();
  if (!user) {
    showNotification('请先登录以使用此功能', 'warning');
    return;
  }
  
  // 显示加载指示器
  document.getElementById('loadingIndicator').classList.remove('hidden');
  
  // 准备上传数据
  const formData = new FormData();
  formData.append('lidarFile', fileInput.files[0]);
  
  // 发送上传请求
  fetch(`${window.carbonAPI.API_URL}/lidar/upload`, {
    method: 'POST',
    headers: window.carbonAPI.region.getAuthHeader(),
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    // 隐藏加载指示器
    document.getElementById('loadingIndicator').classList.add('hidden');
    
    if (data.success) {
      // 上传成功
      showNotification('LiDAR数据上传成功', 'success');
      // 清空文件选择框
      fileInput.value = '';
    } else {
      // 上传失败
      showNotification(`上传失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 隐藏加载指示器
    document.getElementById('loadingIndicator').classList.add('hidden');
    showNotification(`上传出错: ${error.message}`, 'error');
    console.error('LiDAR数据上传错误:', error);
  });
}

// 设置标签页系统
function setupTabSystem() {
  console.log('Setting up tab system - using fixTabSystem instead');
  // 此函数不再主动设置事件监听器，由fixTabSystem负责
  // 保留此函数是为了兼容性，避免现有代码出错
}

// 立即执行函数，确保标签页功能正常工作
(function fixTabSystem() {
  // 确保 DOM 已加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabFix);
  } else {
    initTabFix();
  }

  function initTabFix() {
    console.log('修复标签页系统...');
    try {
      // 获取所有标签页按钮
      const tabButtons = document.querySelectorAll('.tab-btn');
      console.log(`找到 ${tabButtons.length} 个标签按钮`);
      
      if (tabButtons.length === 0) {
        console.error('未找到标签按钮，可能 DOM 结构有问题');
        return;
      }
      
      // 移除可能存在的旧事件监听器（通过克隆并替换元素）
      tabButtons.forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        // 为新按钮添加点击事件，调用统一的switchTab函数
        newButton.addEventListener('click', function(e) {
          e.preventDefault();
          const tabId = this.getAttribute('data-tab');
          console.log(`点击标签: ${this.textContent.trim()}, data-tab="${tabId}"`);
          switchTab(tabId);  // 使用原有的switchTab函数
        });
      });
      
      // 初始化默认标签页
      const defaultTab = document.querySelector('.tab-btn.active') || document.querySelector('.tab-btn');
      if (defaultTab) {
        const defaultTabId = defaultTab.getAttribute('data-tab');
        switchTab(defaultTabId);
      }
      
      console.log('标签页系统修复完成');
    } catch (error) {
      console.error('修复标签页时出错:', error);
    }
  }
})();
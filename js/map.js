// 地图初始化和管理
function initMap() {
  if (map) map.remove();
  map = L.map('mapContainer', { zoomControl: false }).setView([30.25, 120.15], 13);

  // 添加底图
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  regionsData = [];

  // 配置绘制控件
  const drawControl = new L.Control.Draw({
    draw: {
      polygon: { showArea: true },
      rectangle: true,
      circle: true,
      marker: true,
      polyline: false
    },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);

  // 处理绘制完成事件
  map.on(L.Draw.Event.CREATED, async function(e) {
    const type = e.layerType;
    const layer = e.layer;

    // 统一处理不同图形类型
    let area = 0;
    if (type === 'polygon') {
      area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]) / 10000;
    } else if (type === 'rectangle') {
      const bounds = layer.getBounds();
      area = bounds.getSouthWest().distanceTo(bounds.getNorthWest()) *
             bounds.getSouthWest().distanceTo(bounds.getSouthEast()) / 10000;
    } else if (type === 'circle') {
      area = Math.PI * Math.pow(layer.getRadius(), 2) / 10000;
    }

    const density = 150;
    const carbon = area * density;
    const name = prompt('请输入区域名称：', `${type} ${regionsData.length + 1}`) || `${type} ${regionsData.length + 1}`;

    // 创建区域对象
    const region = { 
      layer, 
      name, 
      area, 
      density, 
      carbon, 
      type 
    };

    // 保存到服务器（如果已登录）
    const regionId = await saveRegion(region);
    if (regionId) {
      region.id = regionId;
    }

    regionsData.push(region);
    drawnItems.addLayer(layer);

    // 添加右键菜单
    layer.on('contextmenu', () => {
      const newName = prompt('修改区域名称：', name);
      if (newName) {
        const regionObj = regionsData.find(r => r.layer === layer);
        if (regionObj) {
          regionObj.name = newName;
          
          // 如果已保存到服务器，则更新
          if (regionObj.id) {
            window.carbonAPI.region.updateRegion(regionObj.id, { name: newName })
              .catch(error => {
                console.error('更新区域失败:', error);
              });
          }
          
          handleRegionUpdate();
        }
      }
    });

    handleRegionUpdate();
  });

  // 处理编辑完成事件
  map.on(L.Draw.Event.EDITED, async function(e) {
    const layers = e.layers;
    layers.eachLayer(function(layer) {
      // 找到编辑的区域
      const regionIndex = regionsData.findIndex(r => r.layer === layer);
      if (regionIndex === -1) return;
      
      // 重新计算面积和碳储量
      let area = 0;
      const type = regionsData[regionIndex].type;
      
      if (type === 'polygon') {
        area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]) / 10000;
      } else if (type === 'rectangle') {
        const bounds = layer.getBounds();
        area = bounds.getSouthWest().distanceTo(bounds.getNorthWest()) *
               bounds.getSouthWest().distanceTo(bounds.getSouthEast()) / 10000;
      } else if (type === 'circle') {
        area = Math.PI * Math.pow(layer.getRadius(), 2) / 10000;
      }
      
      regionsData[regionIndex].area = area;
      regionsData[regionIndex].carbon = area * regionsData[regionIndex].density;
      
      // 如果已保存到服务器，则更新
      if (regionsData[regionIndex].id) {
        // 准备更新数据
        const updateData = {
          area: regionsData[regionIndex].area,
          carbon: regionsData[regionIndex].carbon
        };
        
        // 根据类型添加坐标或中心点、半径
        if (type === 'polygon' || type === 'rectangle') {
          updateData.coordinates = layer.getLatLngs()[0].map(latlng => ({
            lat: latlng.lat,
            lng: latlng.lng
          }));
        } else if (type === 'circle') {
          updateData.center = {
            lat: layer.getLatLng().lat,
            lng: layer.getLatLng().lng
          };
          updateData.radius = layer.getRadius();
        }
        
        window.carbonAPI.region.updateRegion(regionsData[regionIndex].id, updateData)
          .catch(error => {
            console.error('更新区域失败:', error);
          });
      }
    });
    
    handleRegionUpdate();
  });

  // 处理删除事件
  map.on(L.Draw.Event.DELETED, async function(e) {
    const layers = e.layers;
    const deletePromises = [];
    
    layers.eachLayer(function(layer) {
      // 找到被删除的区域
      const regionIndex = regionsData.findIndex(r => r.layer === layer);
      if (regionIndex !== -1) {
        // 如果已保存到服务器，则删除
        if (regionsData[regionIndex].id) {
          deletePromises.push(
            deleteRegion(regionsData[regionIndex].id)
          );
        }
        
        regionsData.splice(regionIndex, 1);
      }
    });
    
    // 等待所有删除请求完成
    await Promise.all(deletePromises);
    
    handleRegionUpdate();
  });

  setTimeout(() => map.invalidateSize(), 100);
  
  // 添加清除所有按钮
  const regionPanel = document.querySelector('.analysis-results:last-child');
  const clearBtn = document.createElement('button');
  clearBtn.id = 'btnClearAll';
  clearBtn.className = 'delete-btn';
  clearBtn.style = 'width:100%; margin-top:1rem;';
  clearBtn.textContent = '🗑️ 清除所有区域';
  clearBtn.addEventListener('click', clearAllRegions);
  regionPanel.appendChild(clearBtn);
}

// 清除所有区域
async function clearAllRegions() {
  if (!confirm('确定要清除所有区域吗？这将同时删除服务器上的数据。')) {
    return;
  }
  
  // 删除服务器上的所有区域
  const deletePromises = regionsData
    .filter(region => region.id)
    .map(region => deleteRegion(region.id));
  
  // 等待所有删除请求完成
  await Promise.all(deletePromises);
  
  // 清除本地数据
  drawnItems.clearLayers();
  regionsData = [];
  handleRegionUpdate();
  map.closePopup();
} 
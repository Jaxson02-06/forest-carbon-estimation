// 区域数据管理和更新

// 更新数据显示
function updateDataDisplay() {
  // 尝试从API获取汇总数据
  getSummaryData().then(summary => {
    if (summary) {
      // 使用服务器汇总数据
      document.getElementById('totalArea').textContent = `${summary.totalArea.toFixed(2)} ha`;
      document.getElementById('totalCarbon').textContent = `${summary.totalCarbon.toFixed(2)} t`;
      document.getElementById('avgDensity').textContent = `${summary.avgDensity.toFixed(1)} t/ha`;
      return;
    }
    
    // 回退到本地计算
    const totalArea = regionsData.reduce((sum, item) => sum + item.area, 0);
    const totalCarbon = regionsData.reduce((sum, item) => sum + item.carbon, 0);
    const avgDensity = totalArea ? (totalCarbon / totalArea).toFixed(1) : 0;

    document.getElementById('totalArea').textContent = `${totalArea.toFixed(2)} ha`;
    document.getElementById('totalCarbon').textContent = `${totalCarbon.toFixed(2)} t`;
    document.getElementById('avgDensity').textContent = `${avgDensity} t/ha`;
  });
}

// 更新区域列表
function updateRegionsList() {
  const container = document.getElementById('regionsList');
  container.innerHTML = '';

  // 更新区域数量统计
  document.getElementById('regionsCount').textContent = regionsData.length;

  regionsData.forEach((region, index) => {
    const card = document.createElement('div');
    card.className = 'region-card';
    card.innerHTML = `
      <div class="region-header">
        ${region.name}
        <button class="delete-btn" data-index="${index}" aria-label="删除区域">×</button>
      </div>
      <div class="region-item">
        <span>面积</span>
        <span>${region.area.toFixed(2)} <small>公顷</small></span>
      </div>
      <div class="region-item">
        <span>碳储量</span>
        <span>${region.carbon.toFixed(2)} <small>吨</small></span>
      </div>
      <div class="region-item">
        <span>碳密度</span>
        <span>${region.density.toFixed(1)} <small>吨/公顷</small></span>
      </div>
    `;
    container.appendChild(card);
  });
}

// 处理区域更新
function handleRegionUpdate() {
  updateDataDisplay();
  updateRegionsList();
  updateAnalysisChart();
}

// 处理区域列表点击事件
async function handleRegionListEvents(e) {
  if (e.target.classList.contains('delete-btn')) {
    // 获取按钮上存储的索引值
    const index = parseInt(e.target.dataset.index);
    
    // 安全校验
    if (isNaN(index) || index < 0 || index >= regionsData.length) return;
    
    // 确认删除
    if (!confirm(`确定要删除区域 "${regionsData[index].name}" 吗？`)) {
      return;
    }
    
    // 如果已保存到服务器，则删除
    if (regionsData[index].id) {
      try {
        await deleteRegion(regionsData[index].id);
      } catch (error) {
        console.error('删除区域失败:', error);
        alert(`删除区域失败: ${error.message}`);
        return;
      }
    }
    
    // 从地图移除对应图形
    drawnItems.removeLayer(regionsData[index].layer);
    
    // 从数据数组删除条目
    regionsData.splice(index, 1);
    
    // 更新界面和图表
    handleRegionUpdate();
  }
}

// 文件处理相关
let importedData = [];

// 文件上传处理
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // 显示文件名
  document.getElementById('fileName').textContent = file.name;
  
  const reader = new FileReader();
  
  reader.onload = function() {
    // 解析文件数据
    importedData = processFileData(this.result); 
    
    // 更新数据展示
    // 这里可以根据需要处理导入数据
    alert(`已导入 ${importedData.length} 条数据记录`);
  };
  
  reader.readAsText(file);
}

// 文件数据处理
function processFileData(data) {
  const rows = data.split('\n');
  const headers = rows[0].split(',');
  return rows.slice(1).map(row => {
    const values = row.split(',');
    return headers.reduce((obj, header, index) => {
      obj[header] = values[index];
      return obj;
    }, {});
  });
}

// 导出Excel
async function exportToExcel() {
  // 检查用户是否登录
  const user = window.carbonAPI.auth.getCurrentUser();
  
  if (!user) {
    alert('请先登录以使用导出功能');
    return;
  }
  
  if (!regionsData.length) {
    return alert('请先绘制测量区域！');
  }
  
  try {
    // 获取所有项目
    const projects = await window.carbonAPI.project.getProjects();
    
    if (projects.length === 0) {
      // 如果没有项目，创建一个新项目
      const projectName = prompt('请输入项目名称:', '碳汇项目');
      if (!projectName) return;
      
      const newProject = await window.carbonAPI.project.createProject({
        name: projectName,
        description: '自动创建的项目'
      });
      
      // 添加所有区域到项目
      for (const region of regionsData) {
        if (region.id) {
          await window.carbonAPI.project.addRegionToProject(newProject._id, region.id);
        }
      }
      
      // 导出Excel
      window.carbonAPI.project.exportProject(newProject._id);
    } else {
      // 如果有多个项目，让用户选择
      let projectChoice = '';
      if (projects.length === 1) {
        projectChoice = projects[0]._id;
      } else {
        const projectOptions = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
        const choice = prompt(`请选择要导出的项目(输入序号):\n${projectOptions}`);
        
        if (!choice || isNaN(parseInt(choice)) || parseInt(choice) < 1 || parseInt(choice) > projects.length) {
          return;
        }
        
        projectChoice = projects[parseInt(choice) - 1]._id;
      }
      
      // 导出Excel
      window.carbonAPI.project.exportProject(projectChoice);
    }
  } catch (error) {
    console.error('导出数据失败:', error);
    alert(`导出数据失败: ${error.message}`);
  }
}

// 导出报告
function exportReport() {
  if (!regionsData.length) return alert('请先绘制测量区域！');
  const data = regionsData.map(r => ({
    name: r.name,
    coords: r.layer.getLatLngs ? r.layer.getLatLngs()[0].map(p => [p.lat, p.lng]) : [],
    area: r.area.toFixed(2),
    carbon: r.carbon.toFixed(2),
    density: r.density
  }));
  alert('导出报告：\n' + JSON.stringify({
    areas: data,
    totalArea: document.getElementById('totalArea').textContent,
    totalCarbon: document.getElementById('totalCarbon').textContent,
    avgDensity: document.getElementById('avgDensity').textContent
  }, null, 2));
} 
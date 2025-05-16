// API服务，连接前端与后端
const API_URL = 'http://localhost:5000/api';

// 本地存储令牌和用户信息
const saveUserToLocalStorage = (user) => {
  localStorage.setItem('carbonUser', JSON.stringify(user));
};

const getUserFromLocalStorage = () => {
  const user = localStorage.getItem('carbonUser');
  return user ? JSON.parse(user) : null;
};

const clearUserFromLocalStorage = () => {
  localStorage.removeItem('carbonUser');
};

// 认证相关API
const authAPI = {
  // 用户注册
  register: async (username, password) => {
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('注册响应错误:', data);
        throw new Error(data.message || '注册失败');
      }
      
      saveUserToLocalStorage(data);
      return data; // 返回用户数据表示成功
    } catch (error) {
      console.error('注册错误:', error);
      throw error;
    }
  },
  
  // 用户登录
  login: async (username, password) => {
    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('登录响应错误:', data);
        throw new Error(data.message || '登录失败');
      }
      
      saveUserToLocalStorage(data);
      return data; // 返回用户数据表示成功
    } catch (error) {
      console.error('登录错误:', error);
      throw error;
    }
  },
  
  // 用户注销
  logout: () => {
    clearUserFromLocalStorage();
  },
  
  // 获取当前用户信息
  getCurrentUser: () => {
    return getUserFromLocalStorage();
  }
};

// 区域相关API
const regionAPI = {
  // 获取认证头部
  getAuthHeader: () => {
    const user = getUserFromLocalStorage();
    
    if (!user || !user.token) {
      throw new Error('未登录，请先登录');
    }
    
    return {
      Authorization: `Bearer ${user.token}`
    };
  },
  
  // 创建区域
  createRegion: async (regionData) => {
    try {
      const response = await fetch(`${API_URL}/regions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        },
        body: JSON.stringify(regionData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '创建区域失败');
      }
      
      return data;
    } catch (error) {
      console.error('创建区域错误:', error);
      throw error;
    }
  },
  
  // 获取所有区域
  getRegions: async () => {
    try {
      const response = await fetch(`${API_URL}/regions`, {
        headers: regionAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '获取区域失败');
      }
      
      return data;
    } catch (error) {
      console.error('获取区域错误:', error);
      throw error;
    }
  },
  
  // 获取区域汇总数据
  getRegionSummary: async () => {
    try {
      const response = await fetch(`${API_URL}/regions/summary`, {
        headers: regionAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '获取汇总数据失败');
      }
      
      return data;
    } catch (error) {
      console.error('获取汇总数据错误:', error);
      throw error;
    }
  },
  
  // 更新区域
  updateRegion: async (id, regionData) => {
    try {
      const response = await fetch(`${API_URL}/regions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        },
        body: JSON.stringify(regionData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '更新区域失败');
      }
      
      return data;
    } catch (error) {
      console.error('更新区域错误:', error);
      throw error;
    }
  },
  
  // 删除区域
  deleteRegion: async (id) => {
    try {
      const response = await fetch(`${API_URL}/regions/${id}`, {
        method: 'DELETE',
        headers: regionAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '删除区域失败');
      }
      
      return data;
    } catch (error) {
      console.error('删除区域错误:', error);
      throw error;
    }
  }
};

// LiDAR相关API
const lidarAPI = {
  // 获取认证头部
  getAuthHeader: () => {
    const user = getUserFromLocalStorage();
    
    if (!user || !user.token) {
      throw new Error('未登录，请先登录');
    }
    
    return {
      Authorization: `Bearer ${user.token}`
    };
  },
  
  // 处理LiDAR点云数据
  processLidarData: async (data) => {
    try {
      const response = await fetch(`${API_URL}/lidar/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...lidarAPI.getAuthHeader()
        },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || '处理LiDAR数据失败');
      }
      
      return result;
    } catch (error) {
      console.error('处理LiDAR数据错误:', error);
      throw error;
    }
  },
  
  // 获取LiDAR点云统计信息
  getLidarStats: async (filePath) => {
    try {
      const response = await fetch(`${API_URL}/lidar/stats?filePath=${encodeURIComponent(filePath)}`, {
        headers: lidarAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '获取LiDAR统计信息失败');
      }
      
      return data;
    } catch (error) {
      console.error('获取LiDAR统计信息错误:', error);
      throw error;
    }
  }
};

// 项目相关API
const projectAPI = {
  // 创建项目
  createProject: async (projectData) => {
    try {
      const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        },
        body: JSON.stringify(projectData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '创建项目失败');
      }
      
      return data;
    } catch (error) {
      console.error('创建项目错误:', error);
      throw error;
    }
  },
  
  // 获取所有项目
  getProjects: async () => {
    try {
      const response = await fetch(`${API_URL}/projects`, {
        headers: regionAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '获取项目失败');
      }
      
      return data;
    } catch (error) {
      console.error('获取项目错误:', error);
      throw error;
    }
  },
  
  // 获取单个项目
  getProject: async (id) => {
    try {
      const response = await fetch(`${API_URL}/projects/${id}`, {
        headers: regionAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '获取项目失败');
      }
      
      return data;
    } catch (error) {
      console.error('获取项目错误:', error);
      throw error;
    }
  },
  
  // 添加区域到项目
  addRegionToProject: async (projectId, regionId) => {
    try {
      const response = await fetch(`${API_URL}/projects/${projectId}/regions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        },
        body: JSON.stringify({ regionId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '添加区域到项目失败');
      }
      
      return data;
    } catch (error) {
      console.error('添加区域到项目错误:', error);
      throw error;
    }
  },
  
  // 导出项目为Excel
  exportProject: (projectId) => {
    try {
      const user = getUserFromLocalStorage();
      
      if (!user || !user.token) {
        throw new Error('未登录，请先登录');
      }
      
      // 直接打开下载链接
      window.open(`${API_URL}/projects/${projectId}/export?token=${user.token}`);
    } catch (error) {
      console.error('导出项目错误:', error);
      throw error;
    }
  }
};

// 多光谱影像处理API
const multispectralAPI = {
  // 上传多光谱影像
  uploadImages: async (formData) => {
    try {
      const response = await fetch(`${API_URL}/multispectral/upload`, {
        method: 'POST',
        headers: regionAPI.getAuthHeader(), // 不需要Content-Type: multipart/form-data，浏览器会自动设置
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '上传多光谱影像失败');
      }
      
      return data;
    } catch (error) {
      console.error('上传多光谱影像错误:', error);
      throw error;
    }
  },
  
  // 执行正射校正
  orthorectifyImages: async (uploadId) => {
    try {
      const response = await fetch(`${API_URL}/multispectral/orthorectify/${uploadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '正射校正处理失败');
      }
      
      return data;
    } catch (error) {
      console.error('正射校正处理错误:', error);
      throw error;
    }
  },
  
  // 执行图像配准
  registerWithCHM: async (uploadId, chmId, method = 'opencv') => {
    try {
      const response = await fetch(`${API_URL}/multispectral/register/${uploadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        },
        body: JSON.stringify({ chmId, method })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '图像配准处理失败');
      }
      
      return data;
    } catch (error) {
      console.error('图像配准处理错误:', error);
      throw error;
    }
  },
  
  // 获取多光谱数据
  getMultispectralData: async (id) => {
    try {
      const response = await fetch(`${API_URL}/multispectral/${id}`, {
        headers: regionAPI.getAuthHeader()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '获取多光谱数据失败');
      }
      
      return data.data;
    } catch (error) {
      console.error('获取多光谱数据错误:', error);
      throw error;
    }
  },
  
  // 计算光谱指数
  calculateIndices: async (uploadId, indices) => {
    try {
      const response = await fetch(`${API_URL}/multispectral/calculate-indices/${uploadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...regionAPI.getAuthHeader()
        },
        body: JSON.stringify({ indices })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '光谱指数计算失败');
      }
      
      return await response.json();
    } catch (error) {
      console.error('光谱指数计算错误:', error);
      throw error;
    }
  }
};

// 导出API服务
window.carbonAPI = {
  auth: authAPI,
  region: regionAPI,
  lidar: lidarAPI,
  project: projectAPI,
  multispectral: multispectralAPI,
  API_URL
};

// 同时支持模块导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    authAPI,
    regionAPI,
    lidarAPI,
    projectAPI,
    multispectralAPI,
    API_URL
  };
} 
const Region = require('../models/Region');
const Project = require('../models/Project');
const { calculateArea, calculateCarbon, getDefaultDensity } = require('../utils/carbonCalculator');

/**
 * @desc    创建新区域
 * @route   POST /api/regions
 * @access  私有
 */
const createRegion = async (req, res) => {
  const { name, type, coordinates, center, radius, projectId, forestType } = req.body;
  
  try {
    // 创建区域对象
    const regionData = {
      user_id: req.user.id,
      name,
      type,
      coordinates,
      center,
      radius,
      forestType
    };
    
    // 保存区域
    const savedRegion = await Region.create(regionData);
    
    // 如果指定了项目ID，将区域添加到项目中
    if (projectId) {
      await Project.addRegion(projectId, savedRegion.id);
    }
    
    res.status(201).json(savedRegion);
  } catch (error) {
    console.error('创建区域失败:', error);
    res.status(400).json({ message: '创建区域失败', error: error.message });
  }
};

/**
 * @desc    获取所有区域
 * @route   GET /api/regions
 * @access  私有
 */
const getRegions = async (req, res) => {
  try {
    const regions = await Region.find({ user_id: req.user.id });
    res.json(regions);
  } catch (error) {
    console.error('获取区域失败:', error);
    res.status(500).json({ message: '获取区域失败', error: error.message });
  }
};

/**
 * @desc    获取单个区域
 * @route   GET /api/regions/:id
 * @access  私有
 */
const getRegionById = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id);
    
    if (region) {
      // 验证所有者
      if (region.user_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: '没有权限访问此区域' });
      }
      
      res.json(region);
    } else {
      res.status(404).json({ message: '区域不存在' });
    }
  } catch (error) {
    console.error('获取区域失败:', error);
    res.status(500).json({ message: '获取区域失败', error: error.message });
  }
};

/**
 * @desc    更新区域
 * @route   PUT /api/regions/:id
 * @access  私有
 */
const updateRegion = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id);
    
    if (region) {
      // 验证所有者
      if (region.user_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: '没有权限更新此区域' });
      }
      
      // 更新区域
      const updatedRegion = await Region.update(req.params.id, req.body);
      
      res.json(updatedRegion);
    } else {
      res.status(404).json({ message: '区域不存在' });
    }
  } catch (error) {
    console.error('更新区域失败:', error);
    res.status(500).json({ message: '更新区域失败', error: error.message });
  }
};

/**
 * @desc    删除区域
 * @route   DELETE /api/regions/:id
 * @access  私有
 */
const deleteRegion = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id);
    
    if (region) {
      // 验证所有者
      if (region.user_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: '没有权限删除此区域' });
      }
      
      // 删除区域
      await Region.remove(req.params.id);
      
      res.json({ message: '区域已删除' });
    } else {
      res.status(404).json({ message: '区域不存在' });
    }
  } catch (error) {
    console.error('删除区域失败:', error);
    res.status(500).json({ message: '删除区域失败', error: error.message });
  }
};

/**
 * @desc    计算汇总数据
 * @route   GET /api/regions/summary
 * @access  私有
 */
const getRegionSummary = async (req, res) => {
  try {
    const summary = await Region.getSummary(req.user.id);
    res.json(summary);
  } catch (error) {
    console.error('获取汇总数据失败:', error);
    res.status(500).json({ message: '获取汇总数据失败', error: error.message });
  }
};

module.exports = {
  createRegion,
  getRegions,
  getRegionById,
  updateRegion,
  deleteRegion,
  getRegionSummary
}; 
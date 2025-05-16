const ForestSubtype = require('../models/ForestSubtype');

/**
 * @desc    获取当前用户的自定义森林子类型列表
 * @route   GET /api/forest-subtypes
 * @access  私有（需登录）
 */
const getForestSubtypes = async (req, res) => {
  try {
    // 获取当前用户ID（从认证中间件中获取）
    const userId = req.user.id;
    
    // 查询该用户的所有自定义森林子类型
    const forestSubtypes = await ForestSubtype.findByUserId(userId);
    
    // 返回前端需要的格式
    const formattedSubtypes = forestSubtypes.map(subtype => ({
      label: subtype.label,
      value: subtype.value
    }));
    
    res.json(formattedSubtypes);
  } catch (error) {
    console.error('获取森林子类型失败:', error);
    res.status(500).json({ message: '获取森林子类型失败', error: error.message });
  }
};

/**
 * @desc    创建新的自定义森林子类型
 * @route   POST /api/forest-subtypes
 * @access  私有（需登录）
 */
const createForestSubtype = async (req, res) => {
  try {
    const { label, baseDensity } = req.body;
    const userId = req.user.id;
    
    // 验证输入
    if (!label || label.trim() === '') {
      return res.status(400).json({ message: '森林子类型名称不能为空' });
    }
    
    // 检查该用户是否已有同名森林子类型
    const existingSubtypes = await ForestSubtype.findByUserId(userId);
    const existingSubtype = existingSubtypes.find(subtype => subtype.label === label.trim());
    
    if (existingSubtype) {
      return res.status(400).json({ message: '您已创建过同名的森林子类型' });
    }
    
    // 创建唯一的value值（使用前缀+用户ID+时间戳）
    const value = `custom_${userId}_${Date.now()}`;
    
    // 创建新的森林子类型
    const newForestSubtype = await ForestSubtype.create({
      userId,
      label: label.trim(),
      value,
      baseDensity: baseDensity || 130 // 如果提供了基础密度，则使用，否则使用默认值
    });
    
    // 返回创建的森林子类型（只包含前端需要的字段）
    res.status(201).json({
      label: newForestSubtype.label,
      value: newForestSubtype.value
    });
  } catch (error) {
    console.error('创建森林子类型失败:', error);
    res.status(500).json({ message: '创建森林子类型失败', error: error.message });
  }
};

/**
 * @desc    删除自定义森林子类型
 * @route   DELETE /api/forest-subtypes/:value
 * @access  私有（需登录）
 */
const deleteForestSubtype = async (req, res) => {
  try {
    const userId = req.user.id;
    const { value } = req.params;
    
    // 验证输入
    if (!value) {
      return res.status(400).json({ message: '森林子类型ID不能为空' });
    }
    
    // 查找对应森林子类型
    const existingSubtypes = await ForestSubtype.findByUserId(userId);
    const subtypeToDelete = existingSubtypes.find(subtype => subtype.value === value);
    
    if (!subtypeToDelete) {
      return res.status(404).json({ message: '未找到该森林子类型或您无权删除' });
    }
    
    // 删除该用户的对应森林子类型
    await ForestSubtype.delete(subtypeToDelete.id);
    
    res.json({ message: '森林子类型已删除', value });
  } catch (error) {
    console.error('删除森林子类型失败:', error);
    res.status(500).json({ message: '删除森林子类型失败', error: error.message });
  }
};

module.exports = {
  getForestSubtypes,
  createForestSubtype,
  deleteForestSubtype
}; 
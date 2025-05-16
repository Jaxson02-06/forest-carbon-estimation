const Project = require('../models/Project');
const Region = require('../models/Region');
const ExcelJS = require('exceljs');

/**
 * @desc    创建新项目
 * @route   POST /api/projects
 * @access  私有
 */
const createProject = async (req, res) => {
  const { name, description } = req.body;
  
  try {
    const projectData = {
      user_id: req.user.id,
      name,
      description
    };
    
    const savedProject = await Project.create(projectData);
    
    res.status(201).json(savedProject);
  } catch (error) {
    console.error('创建项目失败:', error);
    res.status(400).json({ message: '创建项目失败', error: error.message });
  }
};

/**
 * @desc    获取所有项目
 * @route   GET /api/projects
 * @access  私有
 */
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ user_id: req.user.id });
    res.json(projects);
  } catch (error) {
    console.error('获取项目失败:', error);
    res.status(500).json({ message: '获取项目失败', error: error.message });
  }
};

/**
 * @desc    获取单个项目
 * @route   GET /api/projects/:id
 * @access  私有
 */
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id, true); // true = populate regions
    
    if (project) {
      // 验证所有者
      if (project.user_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: '没有权限访问此项目' });
      }
      
      res.json(project);
    } else {
      res.status(404).json({ message: '项目不存在' });
    }
  } catch (error) {
    console.error('获取项目失败:', error);
    res.status(500).json({ message: '获取项目失败', error: error.message });
  }
};

/**
 * @desc    更新项目
 * @route   PUT /api/projects/:id
 * @access  私有
 */
const updateProject = async (req, res) => {
  const { name, description } = req.body;
  
  try {
    const project = await Project.findById(req.params.id);
    
    if (project) {
      // 验证所有者
      if (project.user_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: '没有权限更新此项目' });
      }
      
      // 更新项目
      const updatedProject = await Project.update(req.params.id, {
        name,
        description
      });
      
      res.json(updatedProject);
    } else {
      res.status(404).json({ message: '项目不存在' });
    }
  } catch (error) {
    console.error('更新项目失败:', error);
    res.status(500).json({ message: '更新项目失败', error: error.message });
  }
};

/**
 * @desc    删除项目
 * @route   DELETE /api/projects/:id
 * @access  私有
 */
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (project) {
      // 验证所有者
      if (project.user_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: '没有权限删除此项目' });
      }
      
      // 删除项目
      await Project.remove(req.params.id);
      
      res.json({ message: '项目已删除' });
    } else {
      res.status(404).json({ message: '项目不存在' });
    }
  } catch (error) {
    console.error('删除项目失败:', error);
    res.status(500).json({ message: '删除项目失败', error: error.message });
  }
};

/**
 * @desc    向项目添加区域
 * @route   POST /api/projects/:id/regions
 * @access  私有
 */
const addRegionToProject = async (req, res) => {
  const { regionId } = req.body;
  
  try {
    const project = await Project.findById(req.params.id);
    const region = await Region.findById(regionId);
    
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }
    
    if (!region) {
      return res.status(404).json({ message: '区域不存在' });
    }
    
    // 验证所有者
    if (project.user_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: '没有权限操作此项目' });
    }
    
    if (region.user_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: '没有权限操作此区域' });
    }
    
    // 添加区域到项目
    const success = await Project.addRegion(project.id, region.id);
    
    if (!success) {
      return res.status(400).json({ message: '区域已在项目中' });
    }
    
    // 获取更新后的项目
    const updatedProject = await Project.findById(req.params.id);
    
    res.json(updatedProject);
  } catch (error) {
    console.error('添加区域失败:', error);
    res.status(500).json({ message: '添加区域失败', error: error.message });
  }
};

/**
 * @desc    从项目移除区域
 * @route   DELETE /api/projects/:id/regions/:regionId
 * @access  私有
 */
const removeRegionFromProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }
    
    // 验证所有者
    if (project.user_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: '没有权限操作此项目' });
    }
    
    // 从项目中移除区域
    const success = await Project.removeRegion(req.params.id, req.params.regionId);
    
    if (!success) {
      return res.status(400).json({ message: '区域不在项目中' });
    }
    
    // 获取更新后的项目
    const updatedProject = await Project.findById(req.params.id);
    
    res.json(updatedProject);
  } catch (error) {
    console.error('移除区域失败:', error);
    res.status(500).json({ message: '移除区域失败', error: error.message });
  }
};

/**
 * @desc    导出项目数据为Excel
 * @route   GET /api/projects/:id/export
 * @access  私有
 */
const exportProjectToExcel = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id, true); // true = populate regions
    
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }
    
    // 验证所有者
    if (project.user_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: '没有权限导出此项目' });
    }
    
    // 创建工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Carbon Storage Measurement System';
    workbook.created = new Date();
    
    // 添加项目信息工作表
    const infoSheet = workbook.addWorksheet('项目信息');
    infoSheet.columns = [
      { header: '属性', key: 'attribute' },
      { header: '值', key: 'value' }
    ];
    
    infoSheet.addRows([
      { attribute: '项目名称', value: project.name },
      { attribute: '项目描述', value: project.description || '无' },
      { attribute: '创建时间', value: project.created_at.toLocaleString() },
      { attribute: '更新时间', value: project.updated_at.toLocaleString() },
      { attribute: '区域数量', value: project.regions.length },
      { attribute: '总面积 (公顷)', value: project.total_area.toFixed(2) },
      { attribute: '总碳储量 (吨)', value: project.total_carbon.toFixed(2) },
      { attribute: '平均密度 (吨/公顷)', value: project.average_density.toFixed(2) }
    ]);
    
    // 添加区域数据工作表
    const regionsSheet = workbook.addWorksheet('区域数据');
    regionsSheet.columns = [
      { header: '区域名称', key: 'name' },
      { header: '类型', key: 'type' },
      { header: '面积 (公顷)', key: 'area' },
      { header: '密度 (吨/公顷)', key: 'density' },
      { header: '碳储量 (吨)', key: 'carbon' },
      { header: '创建时间', key: 'created_at' }
    ];
    
    // 添加区域数据行
    project.regions.forEach(region => {
      regionsSheet.addRow({
        name: region.name,
        type: region.type,
        area: region.area.toFixed(2),
        density: region.density.toFixed(2),
        carbon: region.carbon.toFixed(2),
        created_at: region.created_at.toLocaleString()
      });
    });
    
    // 设置响应头和类型
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=project-${project.id}.xlsx`
    );
    
    // 写入响应流
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('导出项目失败:', error);
    res.status(500).json({ message: '导出项目失败', error: error.message });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  addRegionToProject,
  removeRegionFromProject,
  exportProjectToExcel
};
const express = require('express');
const {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  addRegionToProject,
  removeRegionFromProject,
  exportProjectToExcel
} = require('../controllers/projectController');
const { protect } = require('../utils/auth');

const router = express.Router();

// 所有项目路由都需要登录
router.use(protect);

router.route('/')
  .post(createProject)
  .get(getProjects);

router.route('/:id')
  .get(getProjectById)
  .put(updateProject)
  .delete(deleteProject);

router.post('/:id/regions', addRegionToProject);
router.delete('/:id/regions/:regionId', removeRegionFromProject);
router.get('/:id/export', exportProjectToExcel);

module.exports = router;
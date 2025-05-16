const express = require('express');
const {
  createRegion,
  getRegions,
  getRegionById,
  updateRegion,
  deleteRegion,
  getRegionSummary
} = require('../controllers/regionController');
const { protect } = require('../utils/auth');

const router = express.Router();

// 所有区域路由都需要登录
router.use(protect);

router.route('/')
  .post(createRegion)
  .get(getRegions);

router.get('/summary', getRegionSummary);

router.route('/:id')
  .get(getRegionById)
  .put(updateRegion)
  .delete(deleteRegion);

module.exports = router; 
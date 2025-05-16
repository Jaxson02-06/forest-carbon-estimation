const User = require('../models/User');
const { generateToken } = require('../utils/auth');

/**
 * @desc    注册新用户
 * @route   POST /api/users
 * @access  公开
 */
const registerUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    // 检查用户是否已存在
    const userExists = await User.findOne({ username });

    if (userExists) {
      res.status(400).json({ message: '用户已存在' });
      return;
    }

    // 创建新用户
    const user = await User.create({
      username,
      password
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      role: user.role,
      token: generateToken(user.id)
    });
  } catch (error) {
    console.error('注册用户错误:', error);
    res.status(400).json({ message: '无效的用户数据', error: error.message });
  }
};

/**
 * @desc    用户登录
 * @route   POST /api/users/login
 * @access  公开
 */
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    // 查找用户，包含密码
    const user = await User.findOne({ username, select: '+password' });

    // 验证用户密码
    if (user && (await User.matchPassword(password, user.password))) {
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        token: generateToken(user.id)
      });
    } else {
      res.status(401).json({ message: '用户名或密码错误' });
    }
  } catch (error) {
    console.error('登录用户错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
};

/**
 * @desc    获取用户资料
 * @route   GET /api/users/profile
 * @access  私有
 */
const getUserProfile = async (req, res) => {
  try {
    // 从保护中间件获取的用户
    const user = await User.findById(req.user.id);

    if (user) {
      res.json({
        id: user.id,
        username: user.username,
        role: user.role
      });
    } else {
      res.status(404).json({ message: '用户不存在' });
    }
  } catch (error) {
    console.error('获取用户资料错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
};

/**
 * @desc    更新用户资料
 * @route   PUT /api/users/profile
 * @access  私有
 */
const updateUserProfile = async (req, res) => {
  try {
    const userData = {
      username: req.body.username || req.user.username
    };
    
    if (req.body.password) {
      userData.password = req.body.password;
    }

    const updatedUser = await User.updateUser(req.user.id, userData);

    if (updatedUser) {
      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        token: generateToken(updatedUser.id)
      });
    } else {
      res.status(404).json({ message: '用户不存在' });
    }
  } catch (error) {
    console.error('更新用户资料错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile
}; 
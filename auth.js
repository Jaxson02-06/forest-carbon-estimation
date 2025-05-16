const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 生成JWT令牌
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// 验证用户是否已登录
const protect = async (req, res, next) => {
  let token;
  
  if (
    req.headers.authorization && 
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // 从header中获取token
      token = req.headers.authorization.split(' ')[1];
      
      // 验证token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 获取用户信息（不包含密码）
      req.user = await User.findById(decoded.id);
      
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: '未授权，token无效' });
    }
  }
  
  if (!token) {
    res.status(401).json({ message: '未授权，无token' });
  }
};

// 验证管理员权限
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: '需要管理员权限' });
  }
};

module.exports = { generateToken, protect, admin }; 
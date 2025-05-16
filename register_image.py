#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
多光谱影像与CHM配准脚本
使用SIFT特征检测和RANSAC算法进行图像配准
"""

import sys
import os
import cv2
import numpy as np
import gdal
from osgeo import osr

def print_progress(message):
    """输出进度信息到标准输出"""
    print(message)
    sys.stdout.flush()

def read_geotiff(filepath):
    """读取GeoTIFF影像，返回影像数据和地理信息"""
    ds = gdal.Open(filepath)
    if ds is None:
        raise Exception(f"无法打开影像文件: {filepath}")
    
    # 读取影像数据
    if ds.RasterCount == 1:
        data = ds.GetRasterBand(1).ReadAsArray()
        # 单波段影像，保持二维数组
    else:
        # 多波段影像，转换为三维数组 (bands, height, width)
        data = np.zeros((ds.RasterCount, ds.RasterYSize, ds.RasterXSize), dtype=np.float32)
        for i in range(ds.RasterCount):
            band = ds.GetRasterBand(i+1)
            data[i, :, :] = band.ReadAsArray()
    
    # 获取地理信息
    geo_transform = ds.GetGeoTransform()
    projection = ds.GetProjection()
    
    return data, geo_transform, projection, ds.RasterCount

def convert_to_8bit(img, percentile=(2, 98)):
    """将影像数据转换为8位灰度图，用于特征检测"""
    if len(img.shape) > 2 and img.shape[0] > 1:
        # 多波段，取第一个波段或计算平均值
        gray = np.mean(img, axis=0).astype(np.float32)
    else:
        # 单波段，直接使用
        if len(img.shape) > 2:
            gray = img[0].astype(np.float32)
        else:
            gray = img.astype(np.float32)
    
    # 去除异常值，做直方图拉伸
    min_val = np.percentile(gray, percentile[0])
    max_val = np.percentile(gray, percentile[1])
    
    # 避免除以0
    if max_val == min_val:
        max_val = min_val + 1.0
    
    # 进行归一化
    gray = (gray - min_val) / (max_val - min_val)
    gray = np.clip(gray, 0, 1)
    
    # 转换为8位
    gray_8bit = (gray * 255).astype(np.uint8)
    return gray_8bit

def detect_and_match_features(src_img, dst_img):
    """使用SIFT检测特征点并进行匹配"""
    print_progress("Extracting features from images")
    
    # 转换为8位灰度图
    src_gray = convert_to_8bit(src_img)
    dst_gray = convert_to_8bit(dst_img)
    
    # 创建SIFT检测器
    try:
        sift = cv2.SIFT_create()
    except AttributeError:
        # OpenCV 3.x 或更早版本
        sift = cv2.xfeatures2d.SIFT_create()
    
    # 检测关键点和计算描述子
    kp1, des1 = sift.detectAndCompute(src_gray, None)
    kp2, des2 = sift.detectAndCompute(dst_gray, None)
    
    print_progress(f"Found {len(kp1)} features in source image")
    print_progress(f"Found {len(kp2)} features in target image")
    
    if len(kp1) < 10 or len(kp2) < 10:
        raise Exception("检测到的特征点太少，无法进行可靠配准")
    
    # 使用FLANN匹配器
    print_progress("Matching features")
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    
    matches = flann.knnMatch(des1, des2, k=2)
    
    # 应用Lowe比率测试，保留好的匹配
    good_matches = []
    for m, n in matches:
        if m.distance < 0.75 * n.distance:
            good_matches.append(m)
    
    print_progress(f"Found {len(good_matches)} good matches")
    
    if len(good_matches) < 10:
        raise Exception("匹配的特征点太少，无法进行可靠配准")
    
    return kp1, kp2, good_matches

def compute_homography(kp1, kp2, good_matches):
    """计算单应性矩阵"""
    print_progress("Computing homography matrix")
    
    # 提取匹配点坐标
    src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    
    # 使用RANSAC方法计算单应性矩阵
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    
    # 计算内点数量
    inliers = mask.ravel().sum()
    print_progress(f"Homography computed with {inliers} inliers out of {len(good_matches)} matches")
    
    if inliers < 4:
        raise Exception("内点数量太少，变换矩阵可能不可靠")
    
    return H

def warp_image(src_img, dst_shape, H):
    """应用单应性矩阵变换源图像"""
    print_progress("Warping image")
    
    height, width = dst_shape
    
    # 对于多波段影像，分别变换每个波段
    if len(src_img.shape) > 2 and src_img.shape[0] > 1:
        warped = np.zeros((src_img.shape[0], height, width), dtype=src_img.dtype)
        for i in range(src_img.shape[0]):
            warped[i] = cv2.warpPerspective(src_img[i], H, (width, height))
    else:
        # 单波段影像
        if len(src_img.shape) > 2:
            warped = cv2.warpPerspective(src_img[0], H, (width, height))
        else:
            warped = cv2.warpPerspective(src_img, H, (width, height))
    
    return warped

def update_geo_transform(geo_transform, H, shape):
    """根据单应性矩阵更新GeoTransform"""
    # 这是一个简化的实现，实际应用中需要更详细的计算
    # 在实际应用中，应该结合原始影像的坐标系统和变换矩阵计算新的地理变换参数
    
    # 创建一个仿射变换矩阵，应用单应性矩阵到地理变换
    # 这里仅是一个示例，实际应用可能需要更复杂的处理
    new_geo = list(geo_transform)
    
    # 应用平移变换
    new_geo[0] += H[0, 2] * new_geo[1]  # 更新x原点
    new_geo[3] += H[1, 2] * new_geo[5]  # 更新y原点
    
    return tuple(new_geo)

def write_geotiff(filepath, data, geo_transform, projection, datatype=gdal.GDT_Float32):
    """将影像数据写入GeoTIFF文件"""
    if len(data.shape) > 2 and data.shape[0] > 1:
        # 多波段影像
        bands, height, width = data.shape
    else:
        # 单波段影像
        if len(data.shape) > 2:
            bands = 1
            height, width = data[0].shape
        else:
            bands = 1
            height, width = data.shape
    
    driver = gdal.GetDriverByName('GTiff')
    out_ds = driver.Create(filepath, width, height, bands, datatype)
    
    if out_ds is None:
        raise Exception(f"无法创建输出文件: {filepath}")
    
    out_ds.SetGeoTransform(geo_transform)
    out_ds.SetProjection(projection)
    
    if bands > 1:
        for i in range(bands):
            out_ds.GetRasterBand(i+1).WriteArray(data[i])
    else:
        if len(data.shape) > 2:
            out_ds.GetRasterBand(1).WriteArray(data[0])
        else:
            out_ds.GetRasterBand(1).WriteArray(data)
    
    out_ds.FlushCache()
    return out_ds

def main():
    """主函数"""
    if len(sys.argv) != 4:
        print("用法: python register_image.py <正射影像> <CHM影像> <输出路径>")
        sys.exit(1)
    
    ortho_path = sys.argv[1]
    chm_path = sys.argv[2]
    output_path = sys.argv[3]
    
    try:
        # 读取源影像和目标影像
        print_progress("Reading source image (orthophoto)")
        src_img, src_geo, src_proj, src_bands = read_geotiff(ortho_path)
        
        print_progress("Reading target image (CHM)")
        dst_img, dst_geo, dst_proj, dst_bands = read_geotiff(chm_path)
        
        # 检测特征点并匹配
        kp1, kp2, good_matches = detect_and_match_features(src_img, dst_img)
        
        # 计算单应性矩阵
        H = compute_homography(kp1, kp2, good_matches)
        
        # 变换源影像
        if len(dst_img.shape) > 2:
            dst_shape = dst_img[0].shape
        else:
            dst_shape = dst_img.shape
            
        warped_img = warp_image(src_img, dst_shape, H)
        
        # 更新地理变换参数（这一步可能需要根据实际情况调整）
        # 在实际应用中，通常直接使用目标影像的地理参考
        new_geo = dst_geo  # 简化处理，使用目标影像的地理参考
        
        # 写入结果
        print_progress("Writing output image")
        write_geotiff(output_path, warped_img, new_geo, dst_proj)
        
        print_progress("Registration completed successfully")
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 
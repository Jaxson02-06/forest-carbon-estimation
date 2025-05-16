#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
单株分割与树冠提取脚本
从 CHM (冠层高度模型) 中提取树顶和树冠轮廓
输出 GeoJSON 和可视化图像
"""

import sys
import os
import json
import argparse
import numpy as np
import rasterio
from rasterio import features
from rasterio.transform import xy
from shapely.geometry import shape, mapping, Point
from scipy import ndimage as ndi
from skimage.feature import peak_local_max
from skimage.segmentation import watershed
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def read_chm(chm_path):
    """
    读取CHM GeoTIFF文件
    
    Args:
        chm_path: CHM文件路径
    
    Returns:
        chm: CHM数组
        transform: 仿射变换矩阵
        crs: 坐标参考系统
        meta: 元数据
    """
    try:
        with rasterio.open(chm_path) as src:
            chm = src.read(1)  # 读取第一个波段
            transform = src.transform
            crs = src.crs
            meta = src.meta.copy()
            
            # 检查数据有效性
            if np.all(chm == 0) or np.all(np.isnan(chm)):
                raise ValueError("CHM数据无效，可能全为0或NaN")
                
            logger.info(f"成功读取CHM, 形状: {chm.shape}, 范围: [{np.nanmin(chm)}, {np.nanmax(chm)}]")
            
            return chm, transform, crs, meta
    except Exception as e:
        logger.error(f"读取CHM文件失败: {str(e)}")
        raise

def preprocess_chm(chm, min_height=2.0, smooth_sigma=1.0):
    """
    预处理CHM数据，包括平滑和高度阈值过滤
    
    Args:
        chm: CHM数组
        min_height: 最小树高阈值，低于此值的像素被视为非树区域
        smooth_sigma: 高斯平滑的标准差
    
    Returns:
        processed_chm: 处理后的CHM
        mask: 树木区域掩膜 (True表示树木区域)
    """
    # 处理NaN值
    chm_cleaned = np.nan_to_num(chm, nan=0.0)
    
    # 高斯平滑以减少噪声
    if smooth_sigma > 0:
        chm_smoothed = ndi.gaussian_filter(chm_cleaned, sigma=smooth_sigma)
    else:
        chm_smoothed = chm_cleaned
        
    # 创建树木区域掩膜 (高于min_height的区域)
    mask = chm_smoothed > min_height
    
    # 对掩膜进行形态学操作以去除小噪点
    mask = ndi.binary_opening(mask, structure=np.ones((3,3)))
    
    # 应用掩膜到平滑后的CHM
    processed_chm = chm_smoothed.copy()
    processed_chm[~mask] = 0
    
    logger.info(f"CHM预处理完成, 树木区域占比: {np.sum(mask)/mask.size:.2%}")
    
    return processed_chm, mask

def detect_tree_tops(chm, mask, min_distance=5, min_height=2.0):
    """
    使用局部极大值检测树顶
    
    Args:
        chm: CHM数组
        mask: 树木区域掩膜
        min_distance: 局部极大值之间的最小距离 (像素)
        min_height: 最小树高阈值
    
    Returns:
        tree_tops: 包含树顶坐标的数组 (行,列)
        tree_heights: 每个树顶对应的高度值
    """
    # 确保CHM掩膜区域之外的值不会被检测为树顶
    chm_masked = chm.copy()
    chm_masked[~mask] = 0
    
    # 使用局部极大值找出树顶点
    coordinates = peak_local_max(
        chm_masked, 
        min_distance=min_distance,
        threshold_abs=min_height,
        exclude_border=False,
        indices=True
    )
    
    # 如果没有检测到树顶
    if len(coordinates) == 0:
        logger.warning("未检测到树顶，请检查CHM质量或调整参数")
        return np.array([]), np.array([])
    
    # 获取树顶高度
    tree_heights = np.array([chm_masked[r, c] for r, c in coordinates])
    
    logger.info(f"检测到 {len(coordinates)} 个树顶点")
    
    return coordinates, tree_heights

def segment_crowns(chm, tree_tops, mask, use_markers=True):
    """
    使用分水岭算法分割树冠
    
    Args:
        chm: CHM数组
        tree_tops: 树顶坐标 (行,列)
        mask: 树木区域掩膜
        use_markers: 是否使用树顶作为标记
    
    Returns:
        labels: 分割后的标签图像 (每个像素值表示所属的树冠ID)
    """
    # 如果没有检测到树顶，返回空标签图
    if len(tree_tops) == 0:
        logger.warning("没有树顶点，无法进行分水岭分割")
        return np.zeros_like(chm, dtype=np.int32)
    
    # 创建标记图像
    markers = np.zeros_like(chm, dtype=np.int32)
    for i, (r, c) in enumerate(tree_tops):
        markers[r, c] = i + 1  # 标记从1开始
    
    # 对CHM取负值，因为分水岭算法是从低到高"填充"
    neg_chm = -chm.copy()
    
    # 执行分水岭分割
    if use_markers:
        labels = watershed(neg_chm, markers, mask=mask)
    else:
        # 不使用标记的简化版分水岭
        labels = watershed(neg_chm, mask=mask)
    
    logger.info(f"分水岭分割完成，识别出 {len(np.unique(labels)) - 1} 个树冠区域")
    
    return labels

def extract_crown_polygons(labels, transform, tree_tops, tree_heights):
    """
    从标签图像中提取树冠多边形
    
    Args:
        labels: 分水岭分割后的标签图像
        transform: 栅格数据的仿射变换
        tree_tops: 树顶坐标 (行,列)
        tree_heights: 树顶高度
    
    Returns:
        geojson: 包含树冠多边形和树顶点的GeoJSON FeatureCollection
    """
    # 提取树冠轮廓
    crown_shapes = []
    for shape, value in features.shapes(
            labels.astype(np.int32), 
            mask=labels > 0, 
            transform=transform,
            connectivity=8):
        if value > 0:  # 忽略背景 (value=0)
            crown_shapes.append((shape, value))
    
    # 创建GeoJSON特征集合
    features_list = []
    
    # 为树顶创建点特征
    for i, (r, c) in enumerate(tree_tops):
        try:
            # 将像素坐标转换为地理坐标
            x, y = xy(transform, r, c)
            
            # 创建点几何特征
            point_geom = {
                "type": "Point",
                "coordinates": [x, y]
            }
            
            # 创建特征属性
            props = {
                "id": f"tree_{i+1}",
                "height": float(tree_heights[i]),
                "type": "tree_top"
            }
            
            # 添加点特征到特征列表
            features_list.append({
                "type": "Feature",
                "geometry": point_geom,
                "properties": props
            })
        except Exception as e:
            logger.error(f"处理树顶 {i+1} 时出错: {str(e)}")
    
    # 为树冠创建多边形特征
    for i, (geom, value) in enumerate(crown_shapes):
        try:
            # 使用Shapely处理几何体
            polygon = shape(geom)
            
            # 如果多边形无效，尝试修复
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
                if not polygon.is_valid:
                    logger.warning(f"无法修复无效多边形 (ID: {value})，已跳过")
                    continue
            
            # 计算面积 (平方米)
            area = polygon.area
            
            # 获取对应的树顶高度
            tree_index = value - 1  # 标签从1开始，而索引从0开始
            if 0 <= tree_index < len(tree_heights):
                height = float(tree_heights[tree_index])
            else:
                height = 0.0
            
            # 创建特征属性
            props = {
                "id": f"crown_{value}",
                "tree_id": f"tree_{value}",
                "height": height,
                "area": area,
                "type": "tree_crown"
            }
            
            # 添加多边形特征到特征列表
            features_list.append({
                "type": "Feature",
                "geometry": mapping(polygon),
                "properties": props
            })
        except Exception as e:
            logger.error(f"处理树冠 {value} 时出错: {str(e)}")
    
    # 创建GeoJSON FeatureCollection
    geojson = {
        "type": "FeatureCollection",
        "features": features_list
    }
    
    logger.info(f"GeoJSON生成完成，包含 {len(features_list)} 个特征")
    
    return geojson

def create_visualization(chm, labels, tree_tops, output_path):
    """
    创建分割结果的可视化图像
    
    Args:
        chm: CHM数组
        labels: 分割后的标签图像
        tree_tops: 树顶坐标
        output_path: 输出图像路径
    """
    # 创建彩色标签图像
    n_labels = len(np.unique(labels))
    
    # 创建一个有足够颜色的colormap
    if n_labels > 0:
        # 使用tab20颜色图，它有20种颜色
        cmap = plt.cm.get_cmap('tab20', 20)
        colors = [cmap(i % 20) for i in range(n_labels)]
        # 背景设为黑色
        colors[0] = (0, 0, 0, 1)  
        crown_cmap = ListedColormap(colors)
    else:
        crown_cmap = 'viridis'
    
    # 绘制多子图
    fig, ax = plt.subplots(1, 2, figsize=(16, 8))
    
    # 第一张图：原始CHM
    im1 = ax[0].imshow(chm, cmap='viridis')
    ax[0].set_title('冠层高度模型 (CHM)')
    plt.colorbar(im1, ax=ax[0], label='高度 (m)')
    
    # 在CHM上标注树顶
    if len(tree_tops) > 0:
        y, x = zip(*tree_tops)
        ax[0].scatter(x, y, c='red', marker='+', s=30, label='树顶点')
    
    # 第二张图：树冠分割结果
    im2 = ax[1].imshow(labels, cmap=crown_cmap)
    ax[1].set_title('树冠分割结果')
    
    # 设置图像属性
    for a in ax:
        a.set_axis_off()
    
    fig.tight_layout()
    
    # 保存图像
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close(fig)
    
    logger.info(f"可视化图像已保存到 {output_path}")

def process_chm(
    chm_path, 
    output_dir=None,
    min_height=2.0,
    smooth_sigma=1.0,
    min_distance=5,
    visualization=True
):
    """
    处理CHM，提取树顶和树冠，生成GeoJSON和可视化
    
    Args:
        chm_path: CHM文件路径
        output_dir: 输出目录，默认与CHM同目录
        min_height: 最小树高阈值
        smooth_sigma: 高斯平滑参数
        min_distance: 树顶检测的最小距离
        visualization: 是否创建可视化图像
    
    Returns:
        geojson_path: 输出的GeoJSON文件路径
        visualization_path: 输出的可视化图像路径
    """
    try:
        # 如果未指定输出目录，使用输入文件所在目录
        if output_dir is None:
            output_dir = os.path.dirname(chm_path)
        
        # 确保输出目录存在
        os.makedirs(output_dir, exist_ok=True)
        
        # 获取输入文件名（不含扩展名）
        base_name = os.path.splitext(os.path.basename(chm_path))[0]
        
        # 设置输出文件路径
        geojson_path = os.path.join(output_dir, f"{base_name}_trees.geojson")
        visualization_path = os.path.join(output_dir, f"{base_name}_trees.png")
        
        # 读取CHM
        logger.info(f"读取CHM文件: {chm_path}")
        chm, transform, crs, meta = read_chm(chm_path)
        
        # 预处理CHM
        logger.info("预处理CHM，应用平滑和高度阈值过滤")
        processed_chm, mask = preprocess_chm(chm, min_height=min_height, smooth_sigma=smooth_sigma)
        
        # 检测树顶
        logger.info(f"检测树顶，最小距离={min_distance}像素，最小高度={min_height}米")
        tree_tops, tree_heights = detect_tree_tops(
            processed_chm, mask, min_distance=min_distance, min_height=min_height
        )
        
        # 分割树冠
        logger.info("使用分水岭算法分割树冠")
        labels = segment_crowns(processed_chm, tree_tops, mask)
        
        # 提取树冠多边形，生成GeoJSON
        logger.info("提取树冠多边形并生成GeoJSON")
        geojson = extract_crown_polygons(labels, transform, tree_tops, tree_heights)
        
        # 保存GeoJSON
        with open(geojson_path, 'w') as f:
            json.dump(geojson, f)
        
        logger.info(f"GeoJSON已保存到: {geojson_path}")
        
        # 生成可视化图像
        if visualization:
            logger.info("创建分割结果可视化图像")
            create_visualization(processed_chm, labels, tree_tops, visualization_path)
        else:
            visualization_path = None
        
        # 返回输出文件路径
        return geojson_path, visualization_path
        
    except Exception as e:
        logger.error(f"处理CHM时出错: {str(e)}")
        raise

def main():
    """命令行入口函数"""
    parser = argparse.ArgumentParser(description='从CHM中提取树顶和树冠')
    parser.add_argument('chm_path', help='CHM GeoTIFF文件路径')
    parser.add_argument('--output-dir', '-o', help='输出目录路径')
    parser.add_argument('--min-height', '-h', type=float, default=2.0, help='最小树高阈值 (默认: 2.0)')
    parser.add_argument('--smooth', '-s', type=float, default=1.0, help='高斯平滑标准差 (默认: 1.0)')
    parser.add_argument('--min-distance', '-d', type=int, default=5, help='树顶检测的最小距离 (像素) (默认: 5)')
    parser.add_argument('--no-viz', action='store_true', help='禁用可视化图像生成')
    
    args = parser.parse_args()
    
    try:
        # 处理CHM
        geojson_path, visualization_path = process_chm(
            args.chm_path,
            output_dir=args.output_dir,
            min_height=args.min_height,
            smooth_sigma=args.smooth,
            min_distance=args.min_distance,
            visualization=not args.no_viz
        )
        
        # 输出结果路径
        print(f"GeoJSON: {geojson_path}")
        if visualization_path:
            print(f"Visualization: {visualization_path}")
        
        return 0
    except Exception as e:
        logger.error(f"处理失败: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
光谱指数计算脚本
用于计算多光谱影像的各种植被指数 (NDVI, EVI, SAVI等)
"""

import os
import sys
import argparse
import glob
import rasterio
import numpy as np
from rasterio.mask import mask
from rasterio.warp import calculate_default_transform, reproject, Resampling

def get_band_file(input_dir, band_keyword):
    """根据关键字查找对应的波段文件"""
    pattern = os.path.join(input_dir, f"*{band_keyword}*.tif")
    files = glob.glob(pattern)
    if not files:
        print(f"警告: 找不到包含关键字 '{band_keyword}' 的文件")
        return None
    return files[0]

def calculate_ndvi(red_file, nir_file, output_file):
    """计算NDVI (归一化植被指数)"""
    print(f"正在计算NDVI: {output_file}")
    
    with rasterio.open(red_file) as red_src:
        red = red_src.read(1).astype(float)
        profile = red_src.profile
        
    with rasterio.open(nir_file) as nir_src:
        nir = nir_src.read(1).astype(float)
    
    # 避免除零错误
    denominator = nir + red
    ndvi = np.zeros_like(denominator)
    valid_mask = denominator > 0
    ndvi[valid_mask] = (nir[valid_mask] - red[valid_mask]) / denominator[valid_mask]
    
    # 将NDVI值限制在[-1, 1]范围内
    ndvi = np.clip(ndvi, -1.0, 1.0)
    
    # 更新profile
    profile.update(
        dtype=rasterio.float32,
        count=1,
        nodata=0
    )
    
    with rasterio.open(output_file, 'w', **profile) as dst:
        dst.write(ndvi.astype(rasterio.float32), 1)
    
    print(f"NDVI计算完成: {output_file}")
    return output_file

def calculate_evi(blue_file, red_file, nir_file, output_file, g=2.5, c1=6.0, c2=7.5, l=1.0):
    """计算EVI (增强型植被指数)"""
    print(f"正在计算EVI: {output_file}")
    
    with rasterio.open(blue_file) as blue_src:
        blue = blue_src.read(1).astype(float)
        profile = blue_src.profile
        
    with rasterio.open(red_file) as red_src:
        red = red_src.read(1).astype(float)
    
    with rasterio.open(nir_file) as nir_src:
        nir = nir_src.read(1).astype(float)
    
    # EVI计算公式: G * ((NIR - Red) / (NIR + C1 * Red - C2 * Blue + L))
    denominator = nir + c1 * red - c2 * blue + l
    evi = np.zeros_like(denominator)
    valid_mask = denominator > 0
    evi[valid_mask] = g * (nir[valid_mask] - red[valid_mask]) / denominator[valid_mask]
    
    # 通常EVI的范围在-1到1之间，但可能略微超出
    evi = np.clip(evi, -1.0, 1.0)
    
    # 更新profile
    profile.update(
        dtype=rasterio.float32,
        count=1,
        nodata=0
    )
    
    with rasterio.open(output_file, 'w', **profile) as dst:
        dst.write(evi.astype(rasterio.float32), 1)
    
    print(f"EVI计算完成: {output_file}")
    return output_file

def calculate_savi(red_file, nir_file, output_file, l=0.5):
    """计算SAVI (土壤调节植被指数)"""
    print(f"正在计算SAVI: {output_file}")
    
    with rasterio.open(red_file) as red_src:
        red = red_src.read(1).astype(float)
        profile = red_src.profile
        
    with rasterio.open(nir_file) as nir_src:
        nir = nir_src.read(1).astype(float)
    
    # SAVI计算公式: ((NIR - Red) / (NIR + Red + L)) * (1 + L)
    denominator = nir + red + l
    savi = np.zeros_like(denominator)
    valid_mask = denominator > 0
    savi[valid_mask] = ((nir[valid_mask] - red[valid_mask]) / denominator[valid_mask]) * (1 + l)
    
    # 通常SAVI值在-1到1之间
    savi = np.clip(savi, -1.0, 1.0)
    
    # 更新profile
    profile.update(
        dtype=rasterio.float32,
        count=1,
        nodata=0
    )
    
    with rasterio.open(output_file, 'w', **profile) as dst:
        dst.write(savi.astype(rasterio.float32), 1)
    
    print(f"SAVI计算完成: {output_file}")
    return output_file

def main():
    parser = argparse.ArgumentParser(description="计算多光谱影像的光谱指数")
    parser.add_argument("--input", required=True, help="输入多光谱影像目录")
    parser.add_argument("--output", required=True, help="输出光谱指数目录")
    parser.add_argument("--indices", default="ndvi,evi,savi", help="要计算的光谱指数, 用逗号分隔")
    
    args = parser.parse_args()
    
    # 确保输出目录存在
    os.makedirs(args.output, exist_ok=True)
    
    # 准备输入文件
    red_file = get_band_file(args.input, "red")
    nir_file = get_band_file(args.input, "nir")
    blue_file = get_band_file(args.input, "blue")
    
    if not red_file or not nir_file:
        print("错误: 找不到必要的红外(NIR)或红(RED)波段文件")
        sys.exit(1)
    
    # 解析要计算的指数
    indices = [index.strip().lower() for index in args.indices.split(",")]
    
    # 计算所选择的光谱指数
    calculated_files = []
    
    if "ndvi" in indices:
        ndvi_output = os.path.join(args.output, "ndvi.tif")
        calculated_files.append(calculate_ndvi(red_file, nir_file, ndvi_output))
    
    if "evi" in indices and blue_file:
        evi_output = os.path.join(args.output, "evi.tif")
        calculated_files.append(calculate_evi(blue_file, red_file, nir_file, evi_output))
    elif "evi" in indices:
        print("警告: 计算EVI需要蓝(BLUE)波段，但找不到蓝波段文件")
    
    if "savi" in indices:
        savi_output = os.path.join(args.output, "savi.tif")
        calculated_files.append(calculate_savi(red_file, nir_file, savi_output))
    
    # 输出结果
    print("\n计算完成的光谱指数:")
    for file in calculated_files:
        print(f"- {file}")

if __name__ == "__main__":
    main() 
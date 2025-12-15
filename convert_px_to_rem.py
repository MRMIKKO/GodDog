#!/usr/bin/env python3
"""
将CSS文件中的px单位转换为rem单位
基准：10px = 1rem
"""

import re
import sys

def convert_px_to_rem(css_content):
    """
    转换px为rem，保留以下情况的px：
    1. media query中的px
    2. clamp函数中的px
    3. 1px的边框保持为px（太小转rem会有问题）
    """
    def replace_px(match):
        value = match.group(1)
        
        # 检查是否在media query或clamp中
        start = match.start()
        # 向前查找100个字符
        context_before = css_content[max(0, start-100):start]
        
        # 保持media query和clamp中的px
        if '@media' in context_before or 'clamp(' in context_before:
            return match.group(0)
        
        # 1px的边框保持px（亚像素渲染问题）
        if value == '1' and 'border' in context_before[-50:]:
            return match.group(0)
            
        # 转换为rem
        try:
            px_value = float(value)
            rem_value = px_value / 10  # 10px = 1rem
            
            # 格式化：如果是整数，不显示小数点
            if rem_value == int(rem_value):
                return f"{int(rem_value)}rem"
            else:
                return f"{rem_value:.1f}rem"
        except ValueError:
            return match.group(0)
    
    # 匹配数字+px的模式，但不在注释中
    # 负数lookbehind确保不在注释中
    pattern = r'(?<!/)(\d+(?:\.\d+)?)px'
    
    result = re.sub(pattern, replace_px, css_content)
    return result

def main():
    input_file = 'styles.css'
    
    # 读取CSS文件
    with open(input_file, 'r', encoding='utf-8') as f:
        css_content = f.read()
    
    # 转换
    converted_content = convert_px_to_rem(css_content)
    
    # 写回文件
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(converted_content)
    
    print(f"✅ 已将 {input_file} 中的px转换为rem")
    print("基准：10px = 1rem")

if __name__ == '__main__':
    main()

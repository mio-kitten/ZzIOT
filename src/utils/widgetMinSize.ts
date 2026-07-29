/**
 * 组件最小尺寸定义
 * 每种组件类型的最小宽高限制，用于拖拽和调整大小时的下限约束
 */
export interface MinSize {
  width: number
  height: number
}

export const getWidgetMinSize = (type: string): MinSize => {
  switch (type) {
    case 'lineChart':
    case 'barChart':    return { width: 200, height: 150 }
    case 'miniArea':    return { width: 150, height: 100 }
    case 'textarea':    return { width: 150, height: 100 }
    case 'gauge':       return { width: 120, height: 120 }
    case 'text':
    case 'lable':       return { width: 200, height: 180 }
    case 'decorativeText': return { width: 150, height: 80 }
    case 'button':      return { width: 120, height: 120 }
    case 'switch':      return { width: 120, height: 100 }
    case 'input':       return { width: 200, height: 80 }
    case 'radio':       return { width: 150, height: 100 }
    default:            return { width: 120, height: 80 }
  }
}
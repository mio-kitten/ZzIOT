/**
 * 右侧属性配置面板
 * 选中组件后显示其属性配置项：尺寸、主题、MQTT主题、数据源等
 */
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Widget, ThemeConfig, DataPoint } from '@/types';
import { getWidgetMinSize } from '@/utils/widgetMinSize';

const props = defineProps<{
  widget: Widget | undefined;
  widgetData: Map<string, DataPoint[]> | undefined;
}>();

const emit = defineEmits<{
  update: [
    updates: Record<string, unknown>
  ];
  remove: [
  ];
  clearData: [
  ];
}>();
const inputValue = (event: Event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null
  return target?.value ?? ''
}

const getTopic = (config: unknown) => {
  if (typeof config === 'object' && config !== null && 'topic' in config) {
    return String((config as Record<string, unknown>).topic ?? '')
  }
  return ''
}

const handleUpdateDisplayMode = (value: string) => {
  emit('update', { displayMode: value as 'multiTopic' | 'singleTopic' })
}

const handleUpdateTextareaDisplayMode = (value: string) => {
  emit('update', { displayMode: value as 'multiTopic' | 'singleTopic' })
}

const colors = [
  '#5c9ce6', '#66bb6a', '#ffa726', '#ef5350',
  '#9c27b0', '#00bcd4', '#ffeb3b', '#e91e63'
];

const lineChartConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'lineChart')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    maxDataPoints: number;
    yAxisUnit: string;
    displayMode: 'multiTopic' | 'singleTopic';
    topic?: string;
    themes: ThemeConfig[];
  };
});

const inputConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'input')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    topic: string;
    placeholder: string;
  };
});

const buttonConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'button')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    buttonText: string;
    sendContent: string;
  };
});

const switchConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'switch')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    onDisplay: string;
    offDisplay: string;
    onSend: string;
    offSend: string;
  };
});

const sliderConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'slider')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    minValue: number;
    maxValue: number;
    step: number;
  };
});

const textConfig = computed(() => {
  if (!props.widget || (props.widget.type !== 'text' && props.widget.type !== 'textarea'))
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    textColor: string;
    topic?: string;
    displayMode?: 'multiTopic' | 'singleTopic';
    themes?: ThemeConfig[];
  };
});

const handleUpdateTitle = (value: string) => {
  emit('update', { title: value });
};

const handleUpdateWidth = (value: number) => {
  const min = props.widget ? getWidgetMinSize(props.widget.type).width : 100
  emit('update', { width: Math.max(min, value) });
};

const handleUpdateHeight = (value: number) => {
  const min = props.widget ? getWidgetMinSize(props.widget.type).height : 60
  emit('update', { height: Math.max(min, value) });
};

const handleUpdateMaxDataPoints = (value: number) => {
  emit('update', { maxDataPoints: value });
};

const handleUpdateYAxisUnit = (value: string) => {
  emit('update', { yAxisUnit: value });
};

const handleUpdateTheme = (index: number, updates: Partial<ThemeConfig>) => {
  if (props.widget?.type === 'lineChart' && lineChartConfig.value) {
    const themes = [...lineChartConfig.value.themes];
    themes[index] = { ...themes[index], ...updates };
    emit('update', { themes });
  } else if (props.widget?.type === 'textarea' && textConfig.value?.themes) {
    const themes = [...textConfig.value.themes];
    themes[index] = { ...themes[index], ...updates };
    emit('update', { themes });
  }
};

const handleAddTheme = () => {
  if (props.widget?.type === 'lineChart' && lineChartConfig.value) {
    const usedColors = new Set(lineChartConfig.value.themes.map(t => t.color))
    const availableColor = colors.find(c => !usedColors.has(c)) || colors[lineChartConfig.value.themes.length % colors.length]
    const newTheme: ThemeConfig = {
      id: `theme-${Date.now()}`,
      name: `折线${lineChartConfig.value.themes.length + 1}`,
      topic: '',
      color: availableColor
    };
    const themes = [...lineChartConfig.value.themes, newTheme];
    emit('update', { themes });
  } else if (props.widget?.type === 'textarea' && textConfig.value?.themes) {
    const usedColors = new Set(textConfig.value.themes.map(t => t.color))
    const availableColor = colors.find(c => !usedColors.has(c)) || colors[textConfig.value.themes.length % colors.length]
    const newTheme: ThemeConfig = {
      id: `theme-${Date.now()}`,
      name: `主题${textConfig.value.themes.length + 1}`,
      topic: '',
      color: availableColor
    };
    const themes = [...textConfig.value.themes, newTheme];
    emit('update', { themes });
  }
};

const handleRemoveTheme = (index: number) => {
  if (props.widget?.type === 'lineChart' && lineChartConfig.value) {
    if (lineChartConfig.value.themes.length <= 1) return;
    const themes = lineChartConfig.value.themes.filter((_, i) => i !== index);
    emit('update', { themes });
  } else if (props.widget?.type === 'textarea' && textConfig.value?.themes) {
    if (textConfig.value.themes.length <= 1) return;
    const themes = textConfig.value.themes.filter((_, i) => i !== index);
    emit('update', { themes });
  }
};

const handleUpdateButtonText = (value: string) => {
  emit('update', { buttonText: value });
};

const handleUpdateSendContent = (value: string) => {
  emit('update', { sendContent: value });
};

const handleUpdateOnDisplay = (value: string) => {
  emit('update', { onDisplay: value });
};

const handleUpdateOffDisplay = (value: string) => {
  emit('update', { offDisplay: value });
};

const handleUpdateOnSend = (value: string) => {
  emit('update', { onSend: value });
};

const handleUpdateOffSend = (value: string) => {
  emit('update', { offSend: value });
};

const handleUpdateMinValue = (value: number) => {
  emit('update', { minValue: value });
};

const handleUpdateMaxValue = (value: number) => {
  emit('update', { maxValue: value });
};

const handleUpdateStep = (value: number) => {
  emit('update', { step: value });
};

const jumpInput = ref('')

const handleJumpValue = () => {
  const val = parseFloat(jumpInput.value)
  if (!isNaN(val)) {
    emit('update', { jumpValue: val })
  }
  jumpInput.value = ''
}

const barChartConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'barChart')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    maxDataPoints: number;
    yAxisUnit: string;
    topic: string;
    color: string;
  };
});

const miniAreaConfig = computed(() => {
  if (!props.widget || props.widget.type !== 'miniArea')
    return null;
  return props.widget.config as {
    title: string;
    width: number;
    height: number;
    topic: string;
    labelText: string;
    unit: string;
    color: string;
    maxDataPoints: number;
  };
});

const handleUpdateColor = (value: string) => {
  emit('update', { color: value });
};

const handleUpdateTextColor = (value: string) => {
  emit('update', { textColor: value });
};

const handleUpdateLabelText = (value: string) => {
  emit('update', { labelText: value });
};

const handleUpdateUnit = (value: string) => {
  emit('update', { unit: value });
};
</script>

<template>
  <aside class="sidebar-right">
    <div class="panel-header">
      <span class="panel-title">组件属性</span>
    </div>
    
    <div v-if="widget" class="panel-content">
      <div class="config-section">
        <div class="section-header">基本属性</div>
        
        <div class="config-item">
          <label>组件标题</label>
          <input
            :value="widget.config.title"
            @input="handleUpdateTitle(inputValue($event))"
            type="text"
            class="config-input"
          />
        </div>
        
        <div v-if="widget.type !== 'input' && (widget.type !== 'lineChart' || lineChartConfig?.displayMode === 'singleTopic') && widget.type !== 'textarea'" class="config-item">
          <label>Topic</label>
          <input
            :value="getTopic(widget.config)"
            @input="emit('update', { topic: inputValue($event) })"
            type="text"
            class="config-input"
            placeholder="请输入Topic名称"
          />
        </div>
        
        <div class="config-item checkbox-item">
          <label>隐藏底色</label>
          <input 
            type="checkbox" 
            class="checkbox" 
            :checked="(widget.config as Record<string, unknown>).transparent === true"
            @change="emit('update', { transparent: ($event.target as HTMLInputElement).checked })"
          />
        </div>
      </div>

      <template v-if="widget.type === 'lineChart'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">折线图</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件宽度</label>
            <input
              :value="lineChartConfig?.width"
              @input="handleUpdateWidth(Number(inputValue($event)))"
              type="number"
              min="200"
              max="800"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>组件高度</label>
            <input
              :value="lineChartConfig?.height"
              @input="handleUpdateHeight(Number(inputValue($event)))"
              type="number"
              min="150"
              max="600"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">显示模式</div>
          
          <div class="config-item">
            <select
              :value="lineChartConfig?.displayMode"
              @change="handleUpdateDisplayMode(inputValue($event))"
              class="config-input"
            >
              <option value="multiTopic">多主题模式</option>
              <option value="singleTopic">单主题多数据模式</option>
            </select>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">数据</div>
          
          <div class="config-item">
            <label>纵轴单位</label>
            <input
              :value="lineChartConfig?.yAxisUnit"
              @input="handleUpdateYAxisUnit(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>数量</label>
            <select
              :value="lineChartConfig?.maxDataPoints"
              @change="handleUpdateMaxDataPoints(Number(inputValue($event)))"
              class="config-input"
            >
              <option :value="10">10</option>
              <option :value="30">30</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">折线配置</div>
          
          <div class="theme-list">
            <div
              v-for="(theme, index) in lineChartConfig?.themes"
              :key="theme.id"
              class="theme-item"
            >
              <div class="theme-row">
                <div class="theme-color" :style="{ backgroundColor: theme.color }"></div>
                <input
                  :value="theme.name"
                  @input="handleUpdateTheme(index, { name: inputValue($event) })"
                  type="text"
                  placeholder="折线名称"
                  class="theme-input"
                />
                <input
                  :value="theme.color"
                  @input="handleUpdateTheme(index, { color: inputValue($event) })"
                  type="color"
                  class="theme-color-input"
                />
                <button
                  v-if="lineChartConfig?.themes.length && lineChartConfig.themes.length > 1"
                  class="remove-theme-btn"
                  @click="handleRemoveTheme(index)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
                    <path d="M18 6L6 18"/>
                    <path d="M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <input
                v-if="lineChartConfig?.displayMode === 'multiTopic'"
                :value="theme.topic"
                @input="handleUpdateTheme(index, { topic: inputValue($event) })"
                type="text"
                placeholder="Topic"
                class="theme-input"
              />
            </div>
          </div>
          
          <button class="add-theme-btn" @click="handleAddTheme">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>添加折线</span>
          </button>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>发送格式说明</span>
          </div>
          <div class="info-content">
            <p v-if="lineChartConfig?.displayMode === 'multiTopic'">
              多主题模式: 每个折线对应一个Topic<br/>
              发送格式: <code>数值</code><br/>
              例: <code>23.5</code> 或 <code>66</code>
            </p>
            <p v-else>
              单主题多数据模式: 一个Topic包含多个数据<br/>
              发送格式: <code>数据1/数据2/数据3...</code><br/>
              例: <code>23.5/66/12.3</code>
            </p>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>组件说明</span>
          </div>
          <div class="info-content">
            <p>
              定时获取最新的10/30/50/100条数据.<br/>
              以消息时间为x轴,显示在折线图上.
            </p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'barChart'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">柱状图</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件宽度</label>
            <input
              :value="barChartConfig?.width"
              @input="handleUpdateWidth(Number(inputValue($event)))"
              type="number"
              min="200"
              max="800"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>组件高度</label>
            <input
              :value="barChartConfig?.height"
              @input="handleUpdateHeight(Number(inputValue($event)))"
              type="number"
              min="150"
              max="600"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>柱子颜色</label>
            <div class="color-picker-wrap">
              <input
                :value="barChartConfig?.color"
                @input="handleUpdateColor(inputValue($event))"
                type="color"
                class="color-input"
              />
              <span class="color-value">{{ barChartConfig?.color }}</span>
            </div>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">数据</div>
          
          <div class="config-item">
            <label>纵轴单位</label>
            <input
              :value="barChartConfig?.yAxisUnit"
              @input="handleUpdateYAxisUnit(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>数量</label>
            <select
              :value="barChartConfig?.maxDataPoints"
              @change="handleUpdateMaxDataPoints(Number(inputValue($event)))"
              class="config-input"
            >
              <option :value="10">10</option>
              <option :value="30">30</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>发送格式说明</span>
          </div>
          <div class="info-content">
            <p>
              发送格式: <code>数值</code><br/>
              例: <code>23.5</code> 或 <code>66</code>
            </p>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>组件说明</span>
          </div>
          <div class="info-content">
            <p>
              定时获取最新的10/30/50/100条数据.<br/>
              以消息时间为x轴,显示在柱状图上.
            </p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'miniArea'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">迷你面积图</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件宽度</label>
            <input
              :value="miniAreaConfig?.width"
              @input="handleUpdateWidth(Number(inputValue($event)))"
              type="number"
              min="150"
              max="400"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>组件高度</label>
            <input
              :value="miniAreaConfig?.height"
              @input="handleUpdateHeight(Number(inputValue($event)))"
              type="number"
              min="100"
              max="300"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>线条颜色</label>
            <div class="color-picker-wrap">
              <input
                :value="miniAreaConfig?.color"
                @input="handleUpdateColor(inputValue($event))"
                type="color"
                class="color-input"
              />
              <span class="color-value">{{ miniAreaConfig?.color }}</span>
            </div>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">数据</div>
          
          <div class="config-item">
            <label>标签文字</label>
            <input
              :value="miniAreaConfig?.labelText"
              @input="handleUpdateLabelText(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>纵轴单位</label>
            <input
              :value="miniAreaConfig?.unit"
              @input="handleUpdateUnit(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>数量</label>
            <select
              :value="miniAreaConfig?.maxDataPoints"
              @change="handleUpdateMaxDataPoints(Number(inputValue($event)))"
              class="config-input"
            >
              <option :value="10">10</option>
              <option :value="30">30</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>发送格式说明</span>
          </div>
          <div class="info-content">
            <p>
              发送格式: <code>数值</code><br/>
              例: <code>192</code>
            </p>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>组件说明</span>
          </div>
          <div class="info-content">
            <p>
              获取最新的10/30/50/100条消息并显示在迷你面积图上.<br/>
              右上角为接收的最新数据值.
            </p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'button'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">按钮</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件大小</label>
            <select class="config-input">
              <option value="small">小</option>
              <option value="medium" selected>中</option>
              <option value="large">大</option>
            </select>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">内容</div>
          
          <div class="config-item">
            <label>按钮文字</label>
            <input
              :value="buttonConfig?.buttonText"
              @input="handleUpdateButtonText(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>发送内容</label>
            <input
              :value="buttonConfig?.sendContent"
              @input="handleUpdateSendContent(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>我该发送什么？</span>
          </div>
          <div class="info-content">
            <p>
              点击按钮时发送"发送内容"到Topic
            </p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'switch'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">开关</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件大小</label>
            <select class="config-input">
              <option value="small">小</option>
              <option value="medium" selected>中</option>
              <option value="large">大</option>
            </select>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">显示</div>
          
          <div class="config-item">
            <label>开启显示</label>
            <input
              :value="switchConfig?.onDisplay"
              @input="handleUpdateOnDisplay(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>关闭显示</label>
            <input
              :value="switchConfig?.offDisplay"
              @input="handleUpdateOffDisplay(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">发送</div>
          
          <div class="config-item">
            <label>开启发送</label>
            <input
              :value="switchConfig?.onSend"
              @input="handleUpdateOnSend(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>关闭发送</label>
            <input
              :value="switchConfig?.offSend"
              @input="handleUpdateOffSend(inputValue($event))"
              type="text"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="info-section warning">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff9800" stroke-width="2">
              <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>注意</span>
          </div>
          <div class="info-content">
            <p>
              组件发送值和接收值应当是相同的<br/>
              例:当设置发送值为 on 和 off 时,<br/>
              在接收到 on 和 off 后,组件才会改变开关状态.
            </p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'slider'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">滑动条</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件宽度</label>
            <input
              :value="sliderConfig?.width"
              @input="handleUpdateWidth(Number(inputValue($event)))"
              type="number"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">数据范围</div>
          
          <div class="config-item">
            <label>最小值</label>
            <input
              :value="sliderConfig?.minValue"
              @input="handleUpdateMinValue(Number(inputValue($event)))"
              type="number"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>最大值</label>
            <input
              :value="sliderConfig?.maxValue"
              @input="handleUpdateMaxValue(Number(inputValue($event)))"
              type="number"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>步长</label>
            <input
              :value="sliderConfig?.step"
              @input="handleUpdateStep(Number(inputValue($event)))"
              type="number"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">快速设定</div>
          <div class="config-item">
            <label>设定值</label>
            <input
              v-model="jumpInput"
              @keyup.enter="handleJumpValue"
              @blur="handleJumpValue"
              type="number"
              placeholder="输入值后回车"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>说明</span>
          </div>
          <div class="info-content">
            <p>松开鼠标或输入框丢失焦点时发送数据</p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'text'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">单行文字</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件高度</label>
            <input
              :value="textConfig?.height"
              @input="handleUpdateHeight(Number(inputValue($event)))"
              type="number"
              min="150"
              max="600"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>文字颜色</label>
            <div class="color-picker-wrap">
              <input
                :value="textConfig?.textColor"
                @input="handleUpdateTextColor(inputValue($event))"
                type="color"
                class="color-input"
              />
              <span class="color-value">{{ textConfig?.textColor }}</span>
            </div>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>说明</span>
          </div>
          <div class="info-content">
            <p>显示Topic接收到的消息</p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'textarea'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">多行文本</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件宽度</label>
            <input
              :value="textConfig?.width"
              @input="handleUpdateWidth(Number(inputValue($event)))"
              type="number"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>组件高度</label>
            <input
              :value="widget.config.height"
              @input="emit('update', { height: Number(inputValue($event)) })"
              type="number"
              class="config-input"
            />
          </div>
          
          <div class="config-item">
            <label>文字颜色</label>
            <div class="color-picker-wrap">
              <input
                :value="textConfig?.textColor"
                @input="handleUpdateTextColor(inputValue($event))"
                type="color"
                class="color-input"
              />
              <span class="color-value">{{ textConfig?.textColor }}</span>
            </div>
          </div>
        </div>

        <div class="config-section">
          <div class="section-header">显示模式</div>
          
          <div class="config-item">
            <select
              :value="textConfig?.displayMode || 'multiTopic'"
              @change="handleUpdateTextareaDisplayMode(inputValue($event))"
              class="config-input"
            >
              <option value="multiTopic">多主题模式</option>
              <option value="singleTopic">单主题多数据模式</option>
            </select>
          </div>
        </div>
        
        <div v-if="textConfig?.displayMode === 'singleTopic'" class="config-section">
          <div class="section-header">数据</div>
          <div class="config-item">
            <label>Topic</label>
            <input
              :value="textConfig?.topic"
              @input="emit('update', { topic: inputValue($event) })"
              type="text"
              class="config-input"
              placeholder="请输入Topic名称"
            />
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">主题配置</div>
          <div class="theme-list">
            <div
              v-for="(theme, index) in textConfig?.themes"
              :key="theme.id"
              class="theme-item"
            >
              <div class="theme-row">
                <div
                  class="theme-color"
                  :style="{ backgroundColor: theme.color }"
                ></div>
                <input
                  :value="theme.name"
                  @input="handleUpdateTheme(index, { name: inputValue($event) })"
                  type="text"
                  placeholder="名称"
                  class="theme-input"
                />
                <input
                  :value="theme.color"
                  @input="handleUpdateTheme(index, { color: inputValue($event) })"
                  type="color"
                  class="theme-color-input"
                />
                <button
                  v-if="textConfig?.themes?.length && textConfig.themes.length > 1"
                  class="remove-theme-btn"
                  @click="handleRemoveTheme(index)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
                    <path d="M18 6L6 18"/>
                    <path d="M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <input
                v-if="textConfig?.displayMode === 'multiTopic'"
                :value="theme.topic"
                @input="handleUpdateTheme(index, { topic: inputValue($event) })"
                type="text"
                placeholder="Topic"
                class="theme-input"
              />
            </div>
          </div>
          <button
            class="add-theme-btn"
            @click="handleAddTheme"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>添加主题</span>
          </button>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>发送格式说明</span>
          </div>
          <div class="info-content">
            <p v-if="textConfig?.displayMode === 'multiTopic'">
              多主题模式: 每个主题对应一个Topic<br/>
              发送格式: <code>数值</code><br/>
              例: <code>温度1</code> 或 <code>23.5</code>
            </p>
            <p v-else>
              单主题多数据模式: 一个Topic包含多个数据<br/>
              发送格式: <code>数据1/数据2/数据3...</code><br/>
              例: <code>温度1/温度2/温度3</code>
            </p>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>组件说明</span>
          </div>
          <div class="info-content">
            <p>
              显示指定Topic接收到的消息.<br/>
              多主题模式每个主题独立Topic,单主题模式通过"/"分隔.
            </p>
          </div>
        </div>
      </template>

      <template v-if="widget.type === 'input'">
        <div class="config-section">
          <div class="section-header">组件类型</div>
          <div class="config-item">
            <label class="label-value">输入框</label>
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">外观</div>
          
          <div class="config-item">
            <label>组件宽度</label>
            <input
              :value="inputConfig?.width"
              @input="handleUpdateWidth(Number(inputValue($event)))"
              type="number"
              class="config-input"
            />
          </div>
        </div>
        
        <div class="config-section">
          <div class="section-header">配置</div>
          
          <div class="config-item">
            <label>发送Topic</label>
            <input
              :value="inputConfig?.topic"
              @input="emit('update', { topic: inputValue($event) })"
              type="text"
              class="config-input"
              placeholder="请输入Topic名称"
            />
          </div>
          
          <div class="config-item">
            <label>占位提示</label>
            <input
              :value="inputConfig?.placeholder"
              @input="emit('update', { placeholder: inputValue($event) })"
              type="text"
              class="config-input"
              placeholder="请输入占位提示文字"
            />
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>使用说明</span>
          </div>
          <div class="info-content">
            <p>
              点击输入框可以输入数字或文字<br/>
              输入内容会自动保存，按下发送键后发送到指定Topic
            </p>
          </div>
        </div>
      </template>
      
      <div class="action-section">
        <button
          class="clear-data-btn"
          @click="emit('clearData')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
            <path d="M3 6h18M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m3 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6h14"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
          <span>清空数据</span>
        </button>
        <button
          class="remove-btn"
          @click="emit('remove')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          <span>删除组件</span>
        </button>
      </div>
    </div>
    
    <div v-else class="panel-content empty-state">
      <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="1">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <p>请选择一个组件</p>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-right {
  width: 280px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px);
}

.panel-header {
  background: linear-gradient(135deg, #5c9ce6 0%, #4a8fd4 100%);
  padding: 12px 16px;
  color: #fff;
}

.panel-title {
  font-size: 14px;
  font-weight: 500;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
}

.empty-icon {
  margin-bottom: 12px;
}

.empty-state p {
  font-size: 14px;
}

.config-section {
  border-bottom: 1px solid #f0f0f0;
}

.section-header {
  background: #fafafa;
  padding: 8px 16px;
  font-size: 12px;
  color: #666;
  font-weight: 500;
  border-top: 1px solid #f0f0f0;
}

.section-header:first-child {
  border-top: none;
}

.config-item {
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
}

.config-item label {
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

.label-value {
  color: #333;
  font-weight: 500;
}

.config-input {
  padding: 8px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 13px;
  background: #fff;
  transition: border-color 0.2s;
}

.config-input:focus {
  outline: none;
  border-color: #5c9ce6;
}

.checkbox-item {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.topic-select {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #f5f5f5;
  border-radius: 4px;
  color: #999;
  font-size: 13px;
  cursor: pointer;
}

.select-arrow {
  flex-shrink: 0;
}

.theme-list {
  padding: 10px 16px;
}

.theme-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 6px;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.theme-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 12px;
}

.theme-color-input {
  width: 40px;
  padding: 2px;
  cursor: pointer;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: none;
}

.remove-theme-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-theme-btn:hover {
  opacity: 1;
}

.add-theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: calc(100% - 32px);
  margin: 0 16px 12px;
  padding: 8px;
  border: 1px dashed #ccc;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  color: #5c9ce6;
  font-size: 13px;
  transition: all 0.2s;
}

.add-theme-btn:hover {
  border-color: #5c9ce6;
  background: rgba(92, 156, 230, 0.06);
}

.info-section {
  margin: 12px 16px;
  background: #e8f5e9;
  border-radius: 4px;
  overflow: hidden;
}

.info-section.warning {
  background: #fff3e0;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #2e7d32;
  background: rgba(76, 175, 80, 0.1);
}

.info-section.warning .info-header {
  color: #e65100;
  background: rgba(255, 152, 0, 0.1);
}

.info-content {
  padding: 10px 12px;
}

.info-content p {
  font-size: 12px;
  color: #555;
  line-height: 1.6;
  margin: 0;
}

.info-content code {
  background: rgba(0, 0, 0, 0.08);
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 11px;
  color: #c7254e;
}

.color-picker-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-input {
  width: 48px;
  height: 32px;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.color-value {
  font-size: 12px;
  color: #666;
  font-family: monospace;
}

.action-section {
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #ef5350;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.remove-btn:hover {
  opacity: 0.88;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.clear-data-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #ffa726;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  font-weight: 500;
}

.clear-data-btn:hover {
  opacity: 0.88;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
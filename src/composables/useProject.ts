/**
 * 项目管理组合式函数
 * 管理项目列表的增删改查、组件（Widget）的增删改、平台配置的保存/加载
 * 数据持久化到浏览器 localStorage，支持导出/导入 JSON 文件实现跨设备迁移
 */
import { ref, computed, reactive } from 'vue';
import type { Project, Widget, PlatformConfig, LineChartWidgetConfig } from '@/types';
import { getWidgetMinSize } from '@/utils/widgetMinSize';

const projects = ref<Project[]>([]);
const currentProjectId = ref<string | null>(null);
const PLATFORM_KEY = 'zziot-platform-config';
const PROJECTS_KEY = 'zziot-projects';

export interface ImportDialogState {
  show: boolean
  closing: boolean
  type: 'alert' | 'confirm'
  message: string
  detail: string
  resolve: ((value: boolean) => void) | null
}

const importDialog = reactive<ImportDialogState>({
  show: false,
  closing: false,
  type: 'alert',
  message: '',
  detail: '',
  resolve: null
})

/** 关闭导入弹窗，带淡出动画 */
const closeImportDialog = (callback?: () => void) => {
  importDialog.closing = true
  setTimeout(() => {
    importDialog.show = false
    importDialog.closing = false
    callback?.()
  }, 200)
}

/** 读取单个文件内容为项目数据 */
const readProjectFile = (file: File): Promise<{ fileName: string; projects: Project[]; error?: string }> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const rawData = JSON.parse(e.target?.result as string)
        const data = Array.isArray(rawData) ? rawData : [rawData]
        if (data.length === 0 || !data[0]?.id || !data[0]?.name) {
          resolve({ fileName: file.name, projects: [], error: '文件格式不正确' })
          return
        }
        resolve({ fileName: file.name, projects: data })
      } catch {
        resolve({ fileName: file.name, projects: [], error: '无效的 JSON' })
      }
    }
    reader.onerror = () => {
      resolve({ fileName: file.name, projects: [], error: '无法读取文件' })
    }
    reader.readAsText(file)
  })
}

export function useProject() {
  const currentProject = computed(() => {
    if (!currentProjectId.value)
      return null;
    return projects.value.find(p => p.id === currentProjectId.value) || null;
  });

  const loadProjects = () => {
    try {
      const stored = localStorage.getItem(PROJECTS_KEY);
      console.log('[项目加载] localStorage 原始数据长度:', stored ? stored.length : 0);
      if (stored) {
        projects.value = JSON.parse(stored);
        console.log('[项目加载] 成功加载', projects.value.length, '个项目:', projects.value.map(p => p.name).join(', '));
        if (projects.value.length > 0 && !currentProjectId.value) {
          currentProjectId.value = projects.value[0].id;
        }
      } else {
        console.log('[项目加载] localStorage 中没有项目数据');
      }
    } catch (e) {
      console.error('[项目加载] 解析失败:', e);
      projects.value = [];
    }
  };

  const saveProjects = () => {
    try {
      const json = JSON.stringify(projects.value);
      localStorage.setItem(PROJECTS_KEY, json);
      console.log('[项目保存] 已保存', projects.value.length, '个项目, 数据大小:', json.length, 'bytes');
    } catch (e) {
      console.error('[项目保存失败] localStorage 写入异常:', e);
      try {
        const safe = JSON.stringify(projects.value, (_key, val) => {
          if (typeof val === 'function') return undefined;
          if (typeof val === 'symbol') return undefined;
          if (val === undefined) return null;
          return val;
        });
        localStorage.setItem(PROJECTS_KEY, safe);
        console.log('[项目保存] 降级保存成功');
      } catch (e2) {
        console.error('[项目保存失败] 降级保存也失败:', e2);
      }
    }
  };

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveProjectsDebounced = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const json = JSON.stringify(projects.value);
        localStorage.setItem(PROJECTS_KEY, json);
        console.log('[项目保存(防抖)] 已保存', projects.value.length, '个项目');
      } catch (e) {
        console.error('[项目保存失败] localStorage 写入异常:', e);
        try {
          const safe = JSON.stringify(projects.value, (_key, val) => {
            if (typeof val === 'function') return undefined;
            if (typeof val === 'symbol') return undefined;
            if (val === undefined) return null;
            return val;
          });
          localStorage.setItem(PROJECTS_KEY, safe);
        } catch (e2) {
          console.error('[项目保存失败] 降级保存也失败:', e2);
        }
      }
      saveTimer = null;
    }, 300);
  };

  /** 立即刷新待处理的防抖保存 */
  const flushSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      try {
        const json = JSON.stringify(projects.value);
        localStorage.setItem(PROJECTS_KEY, json);
        console.log('[项目保存(刷新)] 已刷新防抖保存');
      } catch (e) {
        console.error('[项目保存失败] localStorage 写入异常:', e);
      }
    }
  };

  /** 页面关闭/隐藏/冻结时强制保存，确保数据不丢失 */
  const emergencySave = () => {
    console.log('[紧急保存] 触发, 当前项目数:', projects.value.length);
    flushSave();
    try {
      const json = JSON.stringify(projects.value);
      localStorage.setItem(PROJECTS_KEY, json);
      console.log('[紧急保存] 完成');
    } catch (e) {
      console.error('[项目保存失败] localStorage 写入异常:', e);
    }
  };

  if (typeof window !== 'undefined') {
    try {
      const testKey = '__zziot_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      console.log('[存储检测] localStorage 可用');
    } catch (e) {
      console.error('[存储检测] localStorage 不可用!', e);
    }

    window.addEventListener('beforeunload', emergencySave);
    window.addEventListener('pagehide', emergencySave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        console.log('[可见性变化] 页面隐藏，触发紧急保存');
        emergencySave();
      }
    });
    document.addEventListener('freeze', emergencySave);

    const periodicSaveInterval = setInterval(() => {
      flushSave();
    }, 15000);

    const cleanup = () => {
      window.removeEventListener('beforeunload', emergencySave);
      window.removeEventListener('pagehide', emergencySave);
      document.removeEventListener('visibilitychange', emergencySave);
      document.removeEventListener('freeze', emergencySave);
      clearInterval(periodicSaveInterval);
    };

    window.addEventListener('unload', cleanup);
  }

  const createProject = (name: string): Project => {
    const project: Project = {
      id: `project-${Date.now()}`,
      name,
      widgets: [],
      platformConfig: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    projects.value.push(project);
    currentProjectId.value = project.id;
    saveProjects();
    return project;
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    const index = projects.value.findIndex(p => p.id === id);
    if (index !== -1) {
      projects.value[index] = {
        ...projects.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      saveProjects();
    }
  };

  const deleteProject = (id: string) => {
    const index = projects.value.findIndex(p => p.id === id);
    if (index !== -1) {
      projects.value.splice(index, 1);
      if (currentProjectId.value === id) {
        currentProjectId.value = projects.value[0]?.id || null;
      }
      saveProjects();
    }
  };

  const reorderProjects = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const item = projects.value.splice(fromIndex, 1)[0];
    projects.value.splice(toIndex, 0, item);
    saveProjects();
  };

  const setCurrentProject = (id: string | null) => {
    currentProjectId.value = id;
  };

  const addWidget = (projectId: string, widget: Widget) => {
    const project = projects.value.find(p => p.id === projectId);
    if (project) {
      project.widgets.push(widget);
      project.updatedAt = new Date().toISOString();
      saveProjects();
    }
  };

  const updateWidget = (projectId: string, widgetId: string, updates: Partial<Widget['config']>) => {
    const project = projects.value.find(p => p.id === projectId);
    if (project) {
      const widget = project.widgets.find(w => w.id === widgetId);
      if (widget) {
        const min = getWidgetMinSize(widget.type);
        const clamped: Record<string, unknown> = { ...updates };
        if (typeof clamped.width === 'number') {
          clamped.width = Math.max(min.width, clamped.width as number);
        }
        if (typeof clamped.height === 'number') {
          clamped.height = Math.max(min.height, clamped.height as number);
        }
        widget.config = { ...widget.config, ...clamped };
        project.updatedAt = new Date().toISOString();
        saveProjectsDebounced();
      }
    }
  };

  const removeWidget = (projectId: string, widgetId: string) => {
    const project = projects.value.find(p => p.id === projectId);
    if (project) {
      project.widgets = project.widgets.filter(w => w.id !== widgetId);
      project.updatedAt = new Date().toISOString();
      saveProjects();
    }
  };

  const savePlatformConfig = (config: PlatformConfig) => {
    try {
      localStorage.setItem(PLATFORM_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('[平台配置保存失败] localStorage 写入异常:', e);
    }
  };

  const loadPlatformConfig = (): PlatformConfig | null => {
    try {
      const stored = localStorage.getItem(PLATFORM_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
    }
    return null;
  };

  /**
   * 导出单个项目为 JSON 文件（浏览器下载）
   * @param project 要导出的项目
   */
  const exportProject = async (project: Project): Promise<boolean> => {
    const data = JSON.stringify([project], null, 2);
    const filename = `${project.name}.json`;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  };

  /**
   * 导出多个项目，每个项目单独导出为一个 JSON 文件（浏览器下载）
   * @param projects 要导出的项目列表
   */
  const exportProjects = async (projects: Project[]): Promise<boolean> => {
    if (projects.length === 0) return false;
    for (const project of projects) {
      const data = JSON.stringify(project, null, 2);
      const filename = `${project.name}.json`;
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (projects.length > 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return true;
  };

  /**
   * 从 JSON 文件导入项目（合并到现有项目列表）
   * 支持单个项目对象或项目数组
   */
  const importProjects = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rawData = JSON.parse(e.target?.result as string);
          // 支持单个项目对象或项目数组
          const data = Array.isArray(rawData) ? rawData : [rawData];
          if (data.length === 0 || !data[0]?.id || !data[0]?.name) {
            importDialog.type = 'alert';
            importDialog.message = '导入失败';
            importDialog.detail = '文件格式不正确，需要有效的项目数据';
            importDialog.show = true;
            importDialog.resolve = (_confirmed: boolean) => {
              closeImportDialog(() => resolve(false));
            };
            return;
          }

          const existingNameMap = new Map(projects.value.map(p => [p.name.toLowerCase(), p]));
          const duplicateNames: string[] = [];
          data.forEach((p: Project) => {
            const existing = existingNameMap.get(p.name.toLowerCase());
            if (existing) {
              duplicateNames.push(p.name);
            }
          });

          if (duplicateNames.length > 0) {
            importDialog.type = 'confirm';
            importDialog.message = '项目名称重复';
            importDialog.detail = `以下 ${duplicateNames.length} 个项目名称已存在，是否覆盖？\n${duplicateNames.join('、')}`;
            importDialog.show = true;
            importDialog.resolve = (confirmed: boolean) => {
              if (confirmed) {
                closeImportDialog(() => performImport(data, resolve, true));
              } else {
                closeImportDialog(() => resolve(false));
              }
            };
            return;
          }

          performImport(data, resolve, false);
        } catch {
          importDialog.type = 'alert';
          importDialog.message = '导入失败';
          importDialog.detail = '文件内容不是有效的 JSON';
          importDialog.show = true;
          importDialog.resolve = (_confirmed: boolean) => {
            closeImportDialog(() => resolve(false));
          };
        }
      };
      reader.onerror = () => {
        importDialog.type = 'alert';
        importDialog.message = '导入失败';
        importDialog.detail = '无法读取文件';
        importDialog.show = true;
        importDialog.resolve = (_confirmed: boolean) => {
          closeImportDialog(() => resolve(false));
        };
      };
      reader.readAsText(file);
    });
  };

  const performImport = (data: Project[], resolve: (value: boolean) => void, overwrite: boolean) => {
    const existingNameMap = new Map(projects.value.map((p, i) => [p.name.toLowerCase(), i]));
    let addedCount = 0;

    data.forEach((p: Project) => {
      const existingIndex = existingNameMap.get(p.name.toLowerCase());
      if (existingIndex !== undefined) {
        if (overwrite) {
          projects.value[existingIndex] = p;
          addedCount++;
        }
      } else {
        projects.value.push(p);
        addedCount++;
      }
    });

    if (addedCount === 0) {
      importDialog.type = 'alert';
      importDialog.message = '导入完成';
      importDialog.detail = '没有新项目（所有项目已存在且未覆盖）';
      importDialog.show = true;
      importDialog.resolve = (_confirmed: boolean) => {
        closeImportDialog(() => resolve(false));
      };
      return;
    }

    saveProjects();
    if (!currentProjectId.value || !projects.value.find(p => p.id === currentProjectId.value)) {
      currentProjectId.value = projects.value[0].id;
    }
    importDialog.type = 'alert';
    importDialog.message = '导入成功';
    importDialog.detail = overwrite
      ? `成功导入/覆盖 ${addedCount} 个项目`
      : `成功导入 ${addedCount} 个项目`;
    importDialog.show = true;
    importDialog.resolve = (_confirmed: boolean) => {
      closeImportDialog(() => resolve(true));
    };
  };

  /**
   * 批量导入多个文件的项目
   * 汇总所有文件的项目，统一检查重复并显示结果
   */
  const importMultipleProjects = async (files: FileList): Promise<void> => {
    // 1. 读取所有文件
    const fileResults = await Promise.all(Array.from(files).map(readProjectFile))
    
    // 2. 分离成功和失败
    const errors: string[] = []
    const allProjects: Project[] = []
    
    fileResults.forEach(({ fileName, projects: fileProjects, error }) => {
      if (error) {
        errors.push(`${fileName}: ${error}`)
      } else {
        allProjects.push(...fileProjects)
      }
    })
    
    // 3. 检查重复项目名称
    const existingNameMap = new Map(projects.value.map(p => [p.name.toLowerCase(), p]))
    const duplicateNames: string[] = []
    const newProjects: Project[] = []
    
    allProjects.forEach((p) => {
      const existing = existingNameMap.get(p.name.toLowerCase())
      if (existing) {
        if (!duplicateNames.includes(p.name)) {
          duplicateNames.push(p.name)
        }
      } else {
        newProjects.push(p)
      }
    })
    
    // 4. 如果有重复，询问是否覆盖
    if (duplicateNames.length > 0) {
      return new Promise((resolve) => {
        importDialog.type = 'confirm'
        importDialog.message = '项目名称重复'
        importDialog.detail = `以下 ${duplicateNames.length} 个项目名称已存在，是否覆盖？\n${duplicateNames.join('、')}`
        importDialog.show = true
        importDialog.resolve = (confirmed: boolean) => {
          if (confirmed) {
            // 执行导入（覆盖模式）
            closeImportDialog(() => {
              performBatchImport(allProjects, errors, true)
              resolve()
            })
          } else {
            // 用户选择不覆盖，只导入新项目
            closeImportDialog(() => {
              if (newProjects.length > 0) {
                performBatchImport(newProjects, errors, false)
              }
              // 如果没有新项目，直接关闭，不显示"导入完成"
              resolve()
            })
          }
        }
      })
    }
    
    // 5. 没有重复，直接导入
    performBatchImport(allProjects, errors, false)
  }
  
  /** 执行批量导入 */
  const performBatchImport = (projectsToImport: Project[], errors: string[], overwrite: boolean) => {
    const existingNameMap = new Map(projects.value.map((p, i) => [p.name.toLowerCase(), i]))
    let addedCount = 0
    let overwriteCount = 0
    
    projectsToImport.forEach((p: Project) => {
      const existingIndex = existingNameMap.get(p.name.toLowerCase())
      if (existingIndex !== undefined) {
        if (overwrite) {
          projects.value[existingIndex] = p
          overwriteCount++
        }
      } else {
        projects.value.push(p)
        addedCount++
      }
    })
    
    const totalCount = addedCount + overwriteCount
    
    if (totalCount === 0 && errors.length === 0) {
      showBatchImportResult(0, errors, 0)
      return
    }
    
    saveProjects()
    if (!currentProjectId.value || !projects.value.find(p => p.id === currentProjectId.value)) {
      currentProjectId.value = projects.value[0]?.id || null
    }
    
    showBatchImportResult(addedCount, errors, overwriteCount)
  }
  
  /** 显示批量导入结果 */
  const showBatchImportResult = (addedCount: number, errors: string[], overwriteCount: number = 0) => {
    const parts: string[] = []
    
    if (addedCount > 0) {
      parts.push(`成功导入 ${addedCount} 个新项目`)
    }
    if (overwriteCount > 0) {
      parts.push(`覆盖 ${overwriteCount} 个现有项目`)
    }
    if (errors.length > 0) {
      parts.push(`\n以下文件导入失败：`)
      errors.forEach(e => parts.push(`• ${e}`))
    }
    if (addedCount === 0 && overwriteCount === 0 && errors.length === 0) {
      parts.push('没有导入任何项目（所有项目已存在且未覆盖）')
    }
    
    importDialog.type = 'alert'
    importDialog.message = '导入完成'
    importDialog.detail = parts.join('\n')
    importDialog.show = true
    importDialog.resolve = (_confirmed: boolean) => {
      closeImportDialog(() => {})
    }
  }

  const createLineChartWidget = (x: number, y: number): Widget => {
    const config: LineChartWidgetConfig = {
      id: `widget-${Date.now()}`,
      title: '折线图',
      width: 420,
      height: 280,
      x,
      y,
      maxDataPoints: 10,
      yAxisUnit: '°C',
      displayMode: 'singleTopic',
      themes: [
        { id: 'theme-1', name: '折线1', topic: '', color: '#1e88e5' }
      ]
    };
    return {
      id: config.id,
      type: 'lineChart',
      config
    };
  };

  const createInputWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '输入框',
      width: 320,
      height: 80,
      x,
      y,
      topic: '',
      placeholder: '输入内容...'
    };
    return {
      id: config.id,
      type: 'input',
      config
    };
  };

  const createBarChartWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '柱状图',
      width: 420,
      height: 280,
      x,
      y,
      maxDataPoints: 10,
      yAxisUnit: '',
      topic: '',
      color: '#5c9ce6'
    };
    return {
      id: config.id,
      type: 'barChart',
      config
    };
  };

  const createButtonWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '按钮',
      width: 120,
      height: 120,
      x,
      y,
      buttonText: '点击',
      sendContent: '1',
      topic: ''
    };
    return {
      id: config.id,
      type: 'button',
      config
    };
  };

  const createSwitchWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '开关',
      width: 120,
      height: 100,
      x,
      y,
      onDisplay: '开',
      offDisplay: '关',
      onSend: 'on',
      offSend: 'off',
      topic: ''
    };
    return {
      id: config.id,
      type: 'switch',
      config
    };
  };

  const createSliderWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '滑动条',
      width: 340,
      height: 120,
      x,
      y,
      min: 0,
      max: 100,
      step: 1,
      topic: ''
    };
    return {
      id: config.id,
      type: 'slider',
      config
    };
  };

  const createTextWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '单行文字',
      width: 200,
      height: 180,
      x,
      y,
      textColor: '#333333',
      topic: ''
    };
    return {
      id: config.id,
      type: 'text',
      config
    };
  };

  const createTextareaWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '多行文本',
      width: 320,
      height: 160,
      x,
      y,
      textColor: '#333333',
      displayMode: 'multiTopic' as const,
      topic: '',
      themes: [
        { id: 'theme-1', name: '主题1', topic: '', color: '#5c9ce6' }
      ]
    };
    return {
      id: config.id,
      type: 'textarea',
      config
    };
  };

  const createMiniAreaWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '迷你面积图',
      width: 420,
      height: 280,
      x,
      y,
      topic: '',
      labelText: '光照',
      unit: 'lx',
      color: '#5c9ce6',
      maxDataPoints: 10
    };
    return {
      id: config.id,
      type: 'miniArea',
      config
    };
  };

  const createRadioWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '单选框',
      width: 204,
      height: 112,
      x,
      y,
      topic: '',
      orientation: 'horizontal' as 'horizontal' | 'vertical',
      options: [
        { label: '选项1', value: '1' },
        { label: '选项2', value: '2' }
      ]
    };
    return {
      id: config.id,
      type: 'radio',
      config
    };
  };

  const createDecorativeTextWidget = (x: number, y: number): Widget => {
    const config = {
      id: `widget-${Date.now()}`,
      title: '文本',
      width: 200,
      height: 120,
      x,
      y,
      content: '这是一段文本',
      textColor: '#333333',
      fontSize: 16,
      fontWeight: 'normal' as 'normal' | 'bold',
      hideMode: 'none' as 'none' | 'title' | 'bg' | 'bgAndTitle'
    };
    return {
      id: config.id,
      type: 'decorativeText',
      config
    };
  };

  const createWidget = (type: string, x: number, y: number): Widget => {
    switch (type) {
      case 'lineChart': return createLineChartWidget(x, y);
      case 'input': return createInputWidget(x, y);
      case 'barChart': return createBarChartWidget(x, y);
      case 'button': return createButtonWidget(x, y);
      case 'switch': return createSwitchWidget(x, y);
      case 'slider': return createSliderWidget(x, y);
      case 'text': return createTextWidget(x, y);
      case 'textarea': return createTextareaWidget(x, y);
      case 'miniArea': return createMiniAreaWidget(x, y);
      case 'radio': return createRadioWidget(x, y);
      case 'decorativeText': return createDecorativeTextWidget(x, y);
      default: return createLineChartWidget(x, y);
    }
  };

  return {
    projects,
    currentProjectId,
    currentProject,
    loadProjects,
    saveProjects,
    flushSave,
    createProject,
    updateProject,
    deleteProject,
    reorderProjects,
    setCurrentProject,
    addWidget,
    updateWidget,
    removeWidget,
    savePlatformConfig,
    loadPlatformConfig,
    exportProject,
    exportProjects,
    importProjects,
    importMultipleProjects,
    importDialog,
    createWidget,
    createLineChartWidget,
    createInputWidget,
    createBarChartWidget,
    createButtonWidget,
    createSwitchWidget,
    createSliderWidget,
    createTextWidget,
    createTextareaWidget,
    createMiniAreaWidget,
    createRadioWidget,
    createDecorativeTextWidget
  };
}
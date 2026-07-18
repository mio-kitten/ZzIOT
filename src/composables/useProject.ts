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
const PLATFORM_KEY = 'iot-platform-config';
const PROJECTS_KEY = 'iot-projects';

export interface ImportDialogState {
  show: boolean
  type: 'alert' | 'confirm'
  message: string
  detail: string
  resolve: ((value: boolean) => void) | null
}

const importDialog = reactive<ImportDialogState>({
  show: false,
  type: 'alert',
  message: '',
  detail: '',
  resolve: null
})

export function useProject() {
  const currentProject = computed(() => {
    if (!currentProjectId.value)
      return null;
    return projects.value.find(p => p.id === currentProjectId.value) || null;
  });

  const loadProjects = () => {
    try {
      const stored = localStorage.getItem(PROJECTS_KEY);
      if (stored) {
        projects.value = JSON.parse(stored);
        if (projects.value.length > 0 && !currentProjectId.value) {
          currentProjectId.value = projects.value[0].id;
        }
      }
    } catch {
      projects.value = [];
    }
  };

  const saveProjects = () => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.value));
  };

  const createProject = (name: string): Project => {
    const project: Project = {
      id: `project-${Date.now()}`,
      name,
      widgets: [],
      platformConfig: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    projects.value.unshift(project);
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
        saveProjects();
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
    localStorage.setItem(PLATFORM_KEY, JSON.stringify(config));
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
   * 导出单个项目为 JSON 文件
   * @param project 要导出的项目
   * @param method 'manual' 弹出文件夹选择器保存 | 'auto' 浏览器自动下载
   */
  const exportProject = async (project: Project, method: 'manual' | 'auto'): Promise<boolean> => {
    const data = JSON.stringify([project], null, 2);
    const filename = `${project.name}.json`;

    if (method === 'manual') {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'documents'
        });
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return new Promise((resolve) => {
          importDialog.type = 'alert';
          importDialog.message = '导出成功';
          importDialog.detail = `项目「${project.name}」已保存到所选文件夹`;
          importDialog.show = true;
          importDialog.resolve = () => {
            importDialog.show = false;
            resolve(true);
          };
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') return false;
        return new Promise((resolve) => {
          importDialog.type = 'alert';
          importDialog.message = '导出失败';
          importDialog.detail = '手动保存失败，请重试';
          importDialog.show = true;
          importDialog.resolve = () => {
            importDialog.show = false;
            resolve(false);
          };
        });
      }
    } else {
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
    }
  };

  /**
   * 从 JSON 文件导入项目（合并到现有项目列表）
   */
  const importProjects = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (!Array.isArray(data)) {
            importDialog.type = 'alert';
            importDialog.message = '导入失败';
            importDialog.detail = '文件格式不正确，需要项目数组';
            importDialog.show = true;
            importDialog.resolve = (confirmed: boolean) => {
              importDialog.show = false;
              resolve(false);
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
              importDialog.show = false;
              if (confirmed) {
                performImport(data, resolve, true);
              } else {
                resolve(false);
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
          importDialog.resolve = (confirmed: boolean) => {
            importDialog.show = false;
            resolve(false);
          };
        }
      };
      reader.onerror = () => {
        importDialog.type = 'alert';
        importDialog.message = '导入失败';
        importDialog.detail = '无法读取文件';
        importDialog.show = true;
        importDialog.resolve = (confirmed: boolean) => {
          importDialog.show = false;
          resolve(false);
        };
      };
      reader.readAsText(file);
    });
  };

  const performImport = (data: Project[], resolve: (value: boolean) => void, overwrite: boolean) => {
    const existingNameSet = new Set(projects.value.map(p => p.name.toLowerCase()));
    let addedCount = 0;

    if (overwrite) {
      const importNameSet = new Set(data.map(p => p.name.toLowerCase()));
      projects.value = projects.value.filter(p => !importNameSet.has(p.name.toLowerCase()));
    }

    data.forEach((p: Project) => {
      if (!overwrite && existingNameSet.has(p.name.toLowerCase())) {
        return;
      }
      projects.value.unshift(p);
      addedCount++;
    });

    if (addedCount === 0) {
      importDialog.type = 'alert';
      importDialog.message = '导入完成';
      importDialog.detail = '没有新项目（所有项目已存在且未覆盖）';
      importDialog.show = true;
      importDialog.resolve = (confirmed: boolean) => {
        importDialog.show = false;
        resolve(false);
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
    importDialog.resolve = (confirmed: boolean) => {
      importDialog.show = false;
      resolve(true);
    };
  };

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
        { id: 'theme-1', name: '折线1', topic: '', color: '#1e88e5' },
        { id: 'theme-2', name: '折线2', topic: '', color: '#4caf50' },
        { id: 'theme-3', name: '折线3', topic: '', color: '#ff9800' },
        { id: 'theme-4', name: '折线4', topic: '', color: '#e91e63' }
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
        { id: 'theme-1', name: '主题1', topic: '', color: '#5c9ce6' },
        { id: 'theme-2', name: '主题2', topic: '', color: '#66bb6a' },
        { id: 'theme-3', name: '主题3', topic: '', color: '#ffa726' }
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
      default: return createLineChartWidget(x, y);
    }
  };

  return {
    projects,
    currentProjectId,
    currentProject,
    loadProjects,
    saveProjects,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    addWidget,
    updateWidget,
    removeWidget,
    savePlatformConfig,
    loadPlatformConfig,
    exportProject,
    importProjects,
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
    createMiniAreaWidget
  };
}
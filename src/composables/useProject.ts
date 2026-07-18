/**
 * 项目管理组合式函数
 * 管理项目列表的增删改查、组件（Widget）的增删改、平台配置的保存/加载
 * 数据持久化到服务端文件（每个项目一个文件）
 */
import { ref, computed } from 'vue';
import type { Project, Widget, PlatformConfig, LineChartWidgetConfig } from '@/types';
import { getWidgetMinSize } from '@/utils/widgetMinSize';

const projects = ref<Project[]>([]);
const currentProjectId = ref<string | null>(null);
const PLATFORM_KEY = 'iot-platform-config';
const PROJECTS_KEY = 'iot-projects';

const API_BASE = '/api/projects';

async function apiRequest(url: string, options: RequestInit = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    return await response.json();
  } catch {
    return null;
  }
}

export function useProject() {
  const currentProject = computed(() => {
    if (!currentProjectId.value)
      return null;
    return projects.value.find(p => p.id === currentProjectId.value) || null;
  });

  const loadProjects = async () => {
    const result = await apiRequest(API_BASE);
    if (result && Array.isArray(result)) {
      projects.value = result;
      if (projects.value.length > 0 && !currentProjectId.value) {
        currentProjectId.value = projects.value[0].id;
      }
    } else {
      try {
        const stored = localStorage.getItem(PROJECTS_KEY);
        if (stored) {
          projects.value = JSON.parse(stored);
        }
      } catch {
        projects.value = [];
      }
    }
  };

  const saveProjectToServer = async (project: Project) => {
    const result = await apiRequest(API_BASE, {
      method: 'POST',
      body: JSON.stringify(project)
    });
    return result?.success ?? false;
  };

  const updateProjectOnServer = async (project: Project) => {
    const result = await apiRequest(`${API_BASE}/${encodeURIComponent(project.name)}`, {
      method: 'PUT',
      body: JSON.stringify(project)
    });
    return result?.success ?? false;
  };

  const deleteProjectOnServer = async (projectName: string) => {
    const result = await apiRequest(`${API_BASE}/${encodeURIComponent(projectName)}`, {
      method: 'DELETE'
    });
    return result?.success ?? false;
  };

  const saveProjects = () => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.value));
  };

  const createProject = async (name: string): Promise<Project> => {
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
    await saveProjectToServer(project);
    return project;
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    const index = projects.value.findIndex(p => p.id === id);
    if (index !== -1) {
      const oldName = projects.value[index].name;
      projects.value[index] = {
        ...projects.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      saveProjects();
      if (oldName !== projects.value[index].name) {
        await deleteProjectOnServer(oldName);
      }
      await updateProjectOnServer(projects.value[index]);
    }
  };

  const deleteProject = async (id: string) => {
    const index = projects.value.findIndex(p => p.id === id);
    if (index !== -1) {
      const projectName = projects.value[index].name;
      projects.value.splice(index, 1);
      if (currentProjectId.value === id) {
        currentProjectId.value = projects.value[0]?.id || null;
      }
      saveProjects();
      await deleteProjectOnServer(projectName);
    }
  };

  const setCurrentProject = (id: string | null) => {
    currentProjectId.value = id;
  };

  const addWidget = async (projectId: string, widget: Widget) => {
    const project = projects.value.find(p => p.id === projectId);
    if (project) {
      project.widgets.push(widget);
      project.updatedAt = new Date().toISOString();
      saveProjects();
      await updateProjectOnServer(project);
    }
  };

  const updateWidget = async (projectId: string, widgetId: string, updates: Partial<Widget['config']>) => {
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
        await updateProjectOnServer(project);
      }
    }
  };

  const removeWidget = async (projectId: string, widgetId: string) => {
    const project = projects.value.find(p => p.id === projectId);
    if (project) {
      project.widgets = project.widgets.filter(w => w.id !== widgetId);
      project.updatedAt = new Date().toISOString();
      saveProjects();
      await updateProjectOnServer(project);
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
      minValue: 0,
      maxValue: 100,
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
      displayMode: 'multiTopic',
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
      case 'lineChart':
        return createLineChartWidget(x, y);
      case 'barChart':
        return createBarChartWidget(x, y);
      case 'button':
        return createButtonWidget(x, y);
      case 'switch':
        return createSwitchWidget(x, y);
      case 'slider':
        return createSliderWidget(x, y);
      case 'text':
        return createTextWidget(x, y);
      case 'miniArea':
        return createMiniAreaWidget(x, y);
      case 'input':
        return createInputWidget(x, y);
      case 'textarea':
        return createTextareaWidget(x, y);
      default:
        return createLineChartWidget(x, y);
    }
  };

  const initProjects = async () => {
    await loadProjects();
  };

  initProjects();

  return {
    projects,
    currentProject,
    currentProjectId,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    addWidget,
    updateWidget,
    removeWidget,
    savePlatformConfig,
    loadPlatformConfig,
    createLineChartWidget,
    createBarChartWidget,
    createButtonWidget,
    createSwitchWidget,
    createSliderWidget,
    createTextWidget,
    createTextareaWidget,
    createMiniAreaWidget,
    createWidget
  };
}
import React, { useState, useEffect } from 'react';
import type { GreetingTemplate, ApplyHistoryItem, Settings } from '../shared/types';
import {
  getTemplates,
  saveTemplates,
  getApplyHistory,
  clearApplyHistory,
  getSettings,
  saveSettings,
} from '../shared/storage';
import { APPLY_STATUS_TEXT } from '../shared/constants';

type Tab = 'templates' | 'history' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [templates, setTemplates] = useState<GreetingTemplate[]>([]);
  const [history, setHistory] = useState<ApplyHistoryItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [t, h, s] = await Promise.all([getTemplates(), getApplyHistory(), getSettings()]);
    setTemplates(t);
    setHistory(h);
    setSettings(s);
  }

  // 模板 CRUD
  function addTemplate() {
    const newTmpl: GreetingTemplate = {
      id: `tmpl-${Date.now()}`,
      name: '新模板',
      content: '',
      isDefault: templates.length === 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...templates, newTmpl];
    setTemplates(updated);
    saveTemplates(updated);
  }

  function updateTemplate(id: string, field: 'name' | 'content', value: string) {
    const updated = templates.map((t) =>
      t.id === id ? { ...t, [field]: value, updatedAt: Date.now() } : t
    );
    setTemplates(updated);
    saveTemplates(updated);
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  }

  function setDefaultTemplate(id: string) {
    const updated = templates.map((t) => ({
      ...t,
      isDefault: t.id === id,
    }));
    setTemplates(updated);
    saveTemplates(updated);
  }

  // 清空历史
  async function handleClearHistory() {
    if (!confirm('确认清空所有投递记录？')) return;
    await clearApplyHistory();
    setHistory([]);
  }

  // 保存设置
  function handleSaveSettings(updated: Settings) {
    setSettings(updated);
    saveSettings(updated);
  }

  const tabBtnStyle = (tab: Tab): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #1a73e8' : '2px solid transparent',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    color: activeTab === tab ? '#1a73e8' : '#666',
    fontWeight: activeTab === tab ? 500 : 400,
  });

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>智联招聘自动投递 — 设置</h1>

      {/* 标签栏 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('templates')} style={tabBtnStyle('templates')}>
          招呼语模板
        </button>
        <button onClick={() => setActiveTab('history')} style={tabBtnStyle('history')}>
          投递历史
        </button>
        <button onClick={() => setActiveTab('settings')} style={tabBtnStyle('settings')}>
          投递设置
        </button>
      </div>

      {/* 模板管理 */}
      {activeTab === 'templates' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={addTemplate}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1a73e8',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              + 新建模板
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
            可用变量: {'{公司名}'} {'{职位名}'} {'{我的优势}'}
          </div>

          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                padding: '16px',
                marginBottom: '12px',
                backgroundColor: '#fff',
                borderRadius: '6px',
                border: tmpl.isDefault ? '1px solid #1a73e8' : '1px solid #eee',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  value={tmpl.name}
                  onChange={(e) => updateTemplate(tmpl.id, 'name', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                />
                <button
                  onClick={() => setDefaultTemplate(tmpl.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: tmpl.isDefault ? '#e8f0fe' : '#f5f5f5',
                    color: tmpl.isDefault ? '#1a73e8' : '#666',
                    border: '1px solid ' + (tmpl.isDefault ? '#1a73e8' : '#ddd'),
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {tmpl.isDefault ? '默认' : '设为默认'}
                </button>
                <button
                  onClick={() => deleteTemplate(tmpl.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: '#fff',
                    color: '#e74c3c',
                    border: '1px solid #e74c3c',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  disabled={templates.length <= 1}
                >
                  删除
                </button>
              </div>
              <textarea
                value={tmpl.content}
                onChange={(e) => updateTemplate(tmpl.id, 'content', e.target.value)}
                placeholder="输入招呼语内容，可使用变量"
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '13px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* 投递历史 */}
      {activeTab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ color: '#666' }}>共 {history.length} 条记录</span>
            <button
              onClick={handleClearHistory}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#fff',
                color: '#e74c3c',
                border: '1px solid #e74c3c',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              清空记录
            </button>
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              暂无投递记录
            </div>
          ) : (
            <div>
              {history.map((item, idx) => (
                <div
                  key={`${item.jobId}-${item.timestamp}-${idx}`}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: '#fff',
                    borderRadius: '6px',
                    border: '1px solid #eee',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{item.jobTitle}</span>
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        backgroundColor:
                          item.status === 'success' ? '#e8f5e9' :
                          item.status === 'already_applied' ? '#f5f5f5' :
                          '#fdecea',
                        color:
                          item.status === 'success' ? '#27ae60' :
                          item.status === 'already_applied' ? '#999' :
                          '#e74c3c',
                      }}
                    >
                      {APPLY_STATUS_TEXT[item.status] || item.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {item.companyName} · {item.templateUsed}
                  </div>
                  {item.detailUrl && (
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>
                      <a
                        href={item.detailUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#1a73e8', textDecoration: 'none' }}
                      >
                        {item.detailUrl}
                      </a>
                    </div>
                  )}
                  {item.errorMessage && (
                    <div style={{ fontSize: '11px', color: '#e74c3c', marginTop: '4px' }}>
                      错误: {item.errorMessage}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                    {new Date(item.timestamp).toLocaleString('zh-CN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 投递设置 */}
      {activeTab === 'settings' && settings && (
        <div>
          <div style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #eee' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>延迟设置</h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                职位间隔最小值 (毫秒)
              </label>
              <input
                type="number"
                value={settings.delayBetweenJobs.min}
                onChange={(e) =>
                  handleSaveSettings({
                    ...settings,
                    delayBetweenJobs: { ...settings.delayBetweenJobs, min: Number(e.target.value) },
                  })
                }
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                职位间隔最大值 (毫秒)
              </label>
              <input
                type="number"
                value={settings.delayBetweenJobs.max}
                onChange={(e) =>
                  handleSaveSettings({
                    ...settings,
                    delayBetweenJobs: { ...settings.delayBetweenJobs, max: Number(e.target.value) },
                  })
                }
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                输入延迟 (毫秒/字)
              </label>
              <input
                type="number"
                value={settings.typingDelayMs}
                onChange={(e) =>
                  handleSaveSettings({ ...settings, typingDelayMs: Number(e.target.value) })
                }
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                最大重试次数
              </label>
              <input
                type="number"
                value={settings.maxRetries}
                onChange={(e) =>
                  handleSaveSettings({ ...settings, maxRetries: Number(e.target.value) })
                }
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                单次最大投递数
              </label>
              <input
                type="number"
                value={settings.maxJobsPerSession}
                onChange={(e) =>
                  handleSaveSettings({ ...settings, maxJobsPerSession: Number(e.target.value) })
                }
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.autoScrollBeforeClick}
                  onChange={(e) =>
                    handleSaveSettings({ ...settings, autoScrollBeforeClick: e.target.checked })
                  }
                />
                操作前自动滚动到可见位置
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

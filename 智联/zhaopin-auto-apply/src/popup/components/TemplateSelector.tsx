import React from 'react';
import type { GreetingTemplate } from '../../shared/types';

interface TemplateSelectorProps {
  templates: GreetingTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function TemplateSelector({
  templates,
  selectedId,
  onSelect,
}: TemplateSelectorProps) {
  if (templates.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}
      >
        招呼语模板：
      </label>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '13px',
          backgroundColor: '#fff',
        }}
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} {t.isDefault ? '(默认)' : ''}
          </option>
        ))}
      </select>
      {selectedId && (
        <div
          style={{
            marginTop: '6px',
            padding: '8px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#555',
            lineHeight: 1.5,
          }}
        >
          {templates.find((t) => t.id === selectedId)?.content || ''}
        </div>
      )}
    </div>
  );
}

// Material 3 component markup helpers. Each returns an HTML string.
import { esc, icon } from './dom.js';

export const pageHead = (title, sub = '', actions = '') => `
  <header class="page-head">
    <div>
      <h1 class="headline-medium">${esc(title)}</h1>
      ${sub ? `<p class="body-large muted">${esc(sub)}</p>` : ''}
    </div>
    <div class="page-actions">${actions}</div>
  </header>`;

export const card = (body, variant = '') => `<section class="card ${variant}">${body}</section>`;

export const cardHead = (title, sub = '', right = '') => `
  <div class="card-head">
    <div>
      <h2 class="title-large">${esc(title)}</h2>
      ${sub ? `<p class="body-medium muted">${esc(sub)}</p>` : ''}
    </div>
    ${right}
  </div>`;

export const stat = (label, value, tone = '') => `
  <div class="stat ${tone}">
    <span class="label-large muted">${esc(label)}</span>
    <span class="stat-value">${value}</span>
  </div>`;

export const empty = (iconName, title, text) => `
  <div class="empty">
    ${icon(iconName)}
    <h3 class="title-medium">${esc(title)}</h3>
    <p class="body-medium">${esc(text)}</p>
  </div>`;

export const tag = (text, tone = 'neutral', iconName = '') =>
  `<span class="tag tone-${tone}">${iconName ? icon(iconName) : ''}${esc(text)}</span>`;

// Outlined text field. The label floats on the border.
export const textField = ({ id, label, value = '', type = 'text', placeholder = '', hint = '', attrs = '' }) => `
  <div class="tf">
    <input id="${id}" class="tf-input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attrs}>
    <label class="tf-label" for="${id}">${esc(label)}</label>
    ${hint ? `<p class="tf-hint">${esc(hint)}</p>` : ''}
  </div>`;

export const textArea = ({ id, label, value = '', hint = '' }) => `
  <div class="tf">
    <textarea id="${id}" class="tf-input">${esc(value)}</textarea>
    <label class="tf-label" for="${id}">${esc(label)}</label>
    ${hint ? `<p class="tf-hint">${esc(hint)}</p>` : ''}
  </div>`;

export const selectField = ({ id, label, options, value, attrs = '' }) => `
  <div class="tf">
    <select id="${id}" class="tf-input" ${attrs}>
      ${options.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>
    <label class="tf-label" for="${id}">${esc(label)}</label>
  </div>`;

// Switch. `attrs` go on the checkbox, so data-action on it fires on toggle.
export const switchInput = ({ id = '', checked = false, attrs = '' }) => `
  <label class="switch">
    <input type="checkbox" ${id ? `id="${id}"` : ''} ${checked ? 'checked' : ''} ${attrs}>
    <span class="switch-track"><span class="switch-thumb"></span></span>
  </label>`;

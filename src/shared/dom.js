export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function toast(root, text) {
  const t = el('div', { className: 'toast', text });
  root.append(t);
  setTimeout(() => t.remove(), 1200);
}

export function resultPanel({ title, body, actions }) {
  const card = el('div', { className: 'panel-card' }, [
    el('h2', { text: title }),
    el('p', { text: body }),
    el(
      'div',
      { className: 'actions' },
      actions.map((a) =>
        el('button', {
          className: `btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`,
          text: a.label,
          onClick: a.onClick,
        }),
      ),
    ),
  ]);
  return el('div', { className: 'panel' }, [card]);
}

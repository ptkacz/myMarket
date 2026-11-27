/* myMarket — wykres pierścieniowy / kołowy w czystym SVG (port z prototypu) */
(function (MM) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const CX = 210, CY = 210, OUTER_R = 188, INNER_R = 124;

  function polar(r, angle) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function arcPath(outerR, innerR, start, end) {
    const safeEnd = end - start >= 359.99 ? start + 359.99 : end;
    const large = safeEnd - start <= 180 ? 0 : 1;
    const os = polar(outerR, safeEnd), oe = polar(outerR, start);
    if (innerR <= 0) {
      return `M ${CX} ${CY} L ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 0 ${oe.x} ${oe.y} Z`;
    }
    const is = polar(innerR, safeEnd), ie = polar(innerR, start);
    return `M ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 0 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${innerR} ${innerR} 0 ${large} 1 ${is.x} ${is.y} Z`;
  }

  function text(x, y, content, attrs) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    Object.entries(attrs).forEach(([k, v]) => t.setAttribute(k, v));
    t.style.textShadow = '0 1px 3px rgba(15,23,42,0.35)';
    t.textContent = content;
    return t;
  }

  /**
   * @param {SVGElement} svg
   * @param {Array} items  elementy z view() (id, label, color, value, sharePct)
   * @param {object} o     { style: 'donut'|'pie', showTickers: bool, onEnter, onMove, onLeave, onSelect }
   */
  function render(svg, items, total, o) {
    const slicesG = svg.querySelector('#svg-slices');
    const labelsG = svg.querySelector('#svg-labels');
    slicesG.innerHTML = '';
    labelsG.innerHTML = '';
    const innerR = o.style === 'donut' ? INNER_R : 0;

    if (!(total > 0) || !items.length) {
      const empty = document.createElementNS(NS, 'path');
      empty.setAttribute('d', arcPath(OUTER_R, innerR, 0, 360));
      empty.setAttribute('fill', '#E2E8F0');
      slicesG.appendChild(empty);
      return;
    }

    let angle = 0;
    items.forEach(item => {
      const sweep = (item.value / total) * 360;
      if (sweep <= 0) return;
      const start = angle, end = angle + sweep, mid = start + sweep / 2;
      angle = end;
      const rad = ((mid - 90) * Math.PI) / 180;
      const dx = (Math.cos(rad) * 10).toFixed(2), dy = (Math.sin(rad) * 10).toFixed(2);

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', arcPath(OUTER_R, innerR, start, end));
      path.setAttribute('fill', item.color);
      path.setAttribute('stroke', '#FFFFFF');
      path.setAttribute('stroke-width', items.length > 1 ? '2.5' : '0');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('class', 'pie-slice');
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', `${item.label}: ${MM.fmt.pct(item.sharePct)}`);
      path.dataset.id = item.id; path.dataset.dx = dx; path.dataset.dy = dy;

      path.addEventListener('mouseenter', e => o.onEnter && o.onEnter(item, e));
      path.addEventListener('mousemove', e => o.onMove && o.onMove(e));
      path.addEventListener('mouseleave', () => o.onLeave && o.onLeave(item));
      path.addEventListener('click', e => { e.stopPropagation(); o.onSelect && o.onSelect(item); });
      path.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onSelect && o.onSelect(item); }
      });
      slicesG.appendChild(path);

      const isCash = item.kind === 'cash';
      const isCrypto = (item.kind === 'position' && item.position && item.position.isCrypto) ||
        (item.kind === 'category' && item.positions && item.positions.length > 0 && item.positions.every(p => p.isCrypto));
      const badgeSymbol = isCash ? '$' : (isCrypto ? '₿' : null);

      const minShare = badgeSymbol ? 1.2 : 6;
      if (item.sharePct >= minShare) {
        const r = o.style === 'donut' ? (OUTER_R + INNER_R) / 2 : OUTER_R * 0.64;
        const pos = polar(r, mid);
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'pie-label');
        g.dataset.id = item.id; g.dataset.dx = dx; g.dataset.dy = dy;
        const big = item.sharePct >= 14;
        const pctTxt = `${MM.fmt.num(item.sharePct, 1)}%`;

        if (badgeSymbol) {
          if (item.sharePct >= 4.5) {
            const symSize = big ? '15' : (item.sharePct >= 7 ? '13' : '12');
            const pctSize = big ? '11' : (item.sharePct >= 7 ? '10' : '9');
            g.appendChild(text(pos.x, pos.y - 6, badgeSymbol, { fill: '#FFFFFF', 'font-size': symSize, 'font-weight': '700' }));
            g.appendChild(text(pos.x, pos.y + 8, pctTxt, { fill: 'rgba(255,255,255,0.92)', 'font-size': pctSize, 'font-weight': '600' }));
          } else {
            const symSize = item.sharePct >= 2.5 ? '12.5' : '10.5';
            g.appendChild(text(pos.x, pos.y, badgeSymbol, { fill: '#FFFFFF', 'font-size': symSize, 'font-weight': '700' }));
          }
        } else if (o.showTickers && item.sharePct >= 7 && item.label.length <= 6) {
          g.appendChild(text(pos.x, pos.y - 6, item.label, { fill: '#FFFFFF', 'font-size': big ? '13' : '11', 'font-weight': '700' }));
          g.appendChild(text(pos.x, pos.y + 9, pctTxt, { fill: 'rgba(255,255,255,0.92)', 'font-size': big ? '11' : '10', 'font-weight': '600' }));
        } else {
          g.appendChild(text(pos.x, pos.y, pctTxt, { fill: '#FFFFFF', 'font-size': big ? '13' : '11', 'font-weight': '700' }));
        }
        labelsG.appendChild(g);
      }
    });
  }

  function highlight(svg, activeId) {
    svg.querySelectorAll('.pie-slice').forEach(s => {
      const on = s.dataset.id === activeId;
      s.style.transform = on ? `translate(${s.dataset.dx}px, ${s.dataset.dy}px)` : 'translate(0px, 0px)';
      s.style.opacity = !activeId || on ? '1' : '0.42';
      if (on) s.setAttribute('filter', 'url(#slice-shadow)'); else s.removeAttribute('filter');
    });
    svg.querySelectorAll('.pie-label').forEach(l => {
      const on = l.dataset.id === activeId;
      l.style.transform = on ? `translate(${l.dataset.dx}px, ${l.dataset.dy}px)` : 'translate(0px, 0px)';
      l.style.opacity = !activeId || on ? '1' : '0.35';
    });
  }

  MM.chart = { render, highlight };
})(window.MM = window.MM || {});

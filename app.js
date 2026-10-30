(() => {
  'use strict';

  const ALL_CARDS = window.RIFT_CARDS || [];
  const TERMS = window.RIFT_TERMS || {};
  const cardById = new Map();
  const printsByName = new Map();

  // 中文映射字典
  const TYPE_ZH = {
    Legend: '传奇',
    Unit: '单位',
    Spell: '法术',
    Gear: '装备',
    'Unit Gear': '单位装备',
    Rune: '符文',
    Battlefield: '战场',
    Card: '卡牌'
  };

  const DOMAIN_ZH = {
    Fury: '炽烈',
    Calm: '翠意',
    Mind: '灵光',
    Body: '摧破',
    Chaos: '混沌',
    Order: '序理',
    Unknown: '未知',
    None: '无领域'
  };

  const DOMAIN_COLOR = {
    Fury: '#ef4444',
    Calm: '#10b981',
    Mind: '#3b82f6',
    Body: '#f59e0b',
    Chaos: '#8b5cf6',
    Order: '#eab308',
    None: '#64748b'
  };

  const RARITY_ZH = {
    Common: '普通',
    Uncommon: '不凡',
    Rare: '稀有',
    Epic: '史诗',
    Showcase: '异画'
  };

  const SET_ZH = {
    'Origins': '起源 (OGN)',
    'Arcane Box Set': '双城之战礼盒 (ARC)',
    'Proving Grounds': '试炼之地 (OGS)',
    'Spiritforged': '铸魂淬炼 (SFD)',
    'Vendetta': '化神争锋 (VEN)',
    'Unleashed': '破限 (UNL)',
    'Radiance': '辉耀群星 (RAD)',
    'Secret Garden': '秘境花园',
    'Origins | Nexus Night': '起源 | 枢纽之夜',
    'Spiritforged | Nexus Night': '铸魂淬炼 | 枢纽之夜',
    'Vendetta | Nexus Night': '化神争锋 | 枢纽之夜'
  };

  // 建立索引
  for (const c of ALL_CARDS) {
    cardById.set(c.id.toUpperCase(), c);
    const key = c.enName.toLowerCase().trim();
    if (!printsByName.has(key)) printsByName.set(key, []);
    printsByName.get(key).push(c);
  }

  // 状态管理
  const state = {
    query: '',
    domains: new Set(),
    type: '',
    set: '',
    cost: '',
    rarity: '',
    includeAltArt: false,
    includeTokens: false,
    onlyInCart: false,
    sortBy: 'id',
    sortAsc: true,
    viewMode: 'grid', // 'grid' | 'list'
    cardSize: 3,      // 1..5
    clickMode: 'add', // 'add' | 'detail'
    visibleLimit: 60,
    filteredCards: [],
    cart: new Map()   // cardId -> quantity (number)
  };

  // 从 localStorage 恢复购物车
  const STORAGE_KEY = 'rift_card_shop_cart_v1';
  function loadCartFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [id, qty] of Object.entries(obj)) {
        const n = parseInt(qty, 10);
        if (cardById.has(id.toUpperCase()) && n > 0) {
          state.cart.set(id.toUpperCase(), n);
        }
      }
    } catch (e) {
      console.warn('恢复购物车失败:', e);
    }
  }

  function saveCartToStorage() {
    try {
      const obj = {};
      for (const [id, qty] of state.cart.entries()) {
        if (qty > 0) obj[id] = qty;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('保存购物车失败:', e);
    }
  }

  // 辅助格式化函数
  function formatType(t) {
    return TYPE_ZH[t] || TERMS[t] || t || '卡牌';
  }

  function formatDomains(domains) {
    if (!domains || domains.length === 0) return '无领域';
    return domains.map(d => DOMAIN_ZH[d] || TERMS[d] || d).join(' / ');
  }

  function formatRarity(r) {
    return RARITY_ZH[r] || TERMS[r] || r || '';
  }

  function formatSet(s) {
    return SET_ZH[s] || TERMS[s] || s || '';
  }

  function formatRulesText(text) {
    if (!text) return '';
    return text
      .replace(/\[Might\]/gi, '【战力】')
      .replace(/\[Tap\]/gi, '【休眠】')
      .replace(/\[Fury\]/gi, '【炽烈】')
      .replace(/\[Calm\]/gi, '【翠意】')
      .replace(/\[Mind\]/gi, '【灵光】')
      .replace(/\[Body\]/gi, '【摧破】')
      .replace(/\[Chaos\]/gi, '【混沌】')
      .replace(/\[Order\]/gi, '【序理】')
      .replace(/\[Power\]/gi, '【符能】')
      .replace(/\[GANKING\]/gi, '【游走】')
      .replace(/\[ACCELERATE\]/gi, '【急速】')
      .replace(/\[ASSAULT(?:\s+(\d+))?\]/gi, (_, n) => n ? `【强攻 ${n}】` : '【强攻】')
      .replace(/\[SHIELD(?:\s+(\d+))?\]/gi, (_, n) => n ? `【坚守 ${n}】` : '【坚守】')
      .replace(/\[DEFLECT(?:\s+(\d+))?\]/gi, (_, n) => n ? `【法盾 ${n}】` : '【法盾】')
      .replace(/\[DEATHKNELL\]/gi, '【绝念】')
      .replace(/\[LEGION\]/gi, '【鼓舞】')
      .replace(/\[HIDDEN\]/gi, '【待命】')
      .replace(/\[ACTION\]/gi, '【迅捷】')
      .replace(/\[REACTION\]/gi, '【反应】')
      .replace(/\[TANK\]/gi, '【壁垒】');
  }

  // Toast 提示
  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(() => el.remove(), 260);
    }, 2200);
  }

  // 解析高级搜索语法 (支持 t:, d:, c:, m:, r:, s:, k:)
  function parseSearchQuery(rawQuery) {
    const tokens = [];
    const regex = /([a-zA-Z]+)(<=|>=|=|:|<|>)("[^"]+"|[^\s]+)|"([^"]+)"|([^\s]+)/g;
    let match;
    while ((match = regex.exec(rawQuery)) !== null) {
      if (match[1] && match[2] && match[3]) {
        tokens.push({
          kind: 'filter',
          field: match[1].toLowerCase(),
          op: match[2],
          val: match[3].replace(/^"|"$/g, '').toLowerCase()
        });
      } else {
        const word = (match[4] || match[5] || '').toLowerCase();
        if (word) tokens.push({ kind: 'text', val: word });
      }
    }
    return tokens;
  }

  function compareNumeric(actual, op, target) {
    if (actual === null || actual === undefined || Number.isNaN(target)) return false;
    switch (op) {
      case ':':
      case '=': return actual === target;
      case '<': return actual < target;
      case '<=': return actual <= target;
      case '>': return actual > target;
      case '>=': return actual >= target;
      default: return false;
    }
  }

  function matchesSyntaxToken(card, token) {
    if (token.kind === 'text') {
      const v = token.val;
      return (
        card.name.toLowerCase().includes(v) ||
        card.enName.toLowerCase().includes(v) ||
        card.id.toLowerCase().includes(v) ||
        card.text.toLowerCase().includes(v) ||
        card.enText.toLowerCase().includes(v) ||
        formatType(card.type).toLowerCase().includes(v) ||
        card.subtypes.some(s => s.toLowerCase().includes(v) || (TERMS[s] || '').toLowerCase().includes(v)) ||
        card.keywords.some(k => k.toLowerCase().includes(v) || (TERMS[k] || '').toLowerCase().includes(v))
      );
    }

    const { field, op, val } = token;
    if (field === 't' || field === 'type') {
      return card.type.toLowerCase().includes(val) || formatType(card.type).toLowerCase().includes(val);
    }
    if (field === 'd' || field === 'domain') {
      if (val === 'none' || val === '无' || val === '无领域') return card.domains.length === 0;
      return card.domains.some(d => d.toLowerCase().includes(val) || (DOMAIN_ZH[d] || '').toLowerCase().includes(val));
    }
    if (field === 'c' || field === 'cost' || field === 'e' || field === 'energy') {
      return compareNumeric(card.energyCost, op, Number(val));
    }
    if (field === 'p' || field === 'power') {
      return compareNumeric(card.powerCost, op, Number(val));
    }
    if (field === 'm' || field === 'might') {
      return compareNumeric(card.might, op, Number(val));
    }
    if (field === 'r' || field === 'rarity') {
      return card.rarity.toLowerCase().includes(val) || formatRarity(card.rarity).toLowerCase().includes(val);
    }
    if (field === 's' || field === 'set') {
      return (
        card.set.toLowerCase().includes(val) ||
        formatSet(card.set).toLowerCase().includes(val) ||
        card.id.split('-')[0].toLowerCase() === val
      );
    }
    if (field === 'k' || field === 'kw' || field === 'keyword') {
      return card.keywords.some(k => k.toLowerCase().includes(val) || (TERMS[k] || '').toLowerCase().includes(val));
    }
    return true;
  }

  // RiftAtlas 同名卡代表版本优先级比较
  const SET_PRIORITY = { OGN: 0, SFD: 1, OGS: 2, ARC: 3, VEN: 4, UNL: 5, RAD: 6 };
  function isBetterCanonicalCard(a, b) {
    if (a.hasZhArt !== b.hasZhArt) return a.hasZhArt;
    if (a.isAltArt !== b.isAltArt) return !a.isAltArt;
    const prefixA = a.id.split('-')[0];
    const prefixB = b.id.split('-')[0];
    const pA = SET_PRIORITY[prefixA] ?? 99;
    const pB = SET_PRIORITY[prefixB] ?? 99;
    if (pA !== pB) return pA < pB;
    return a.id.localeCompare(b.id, undefined, { numeric: true }) < 0;
  }

  // 执行筛选与排序
  function applyFiltersAndSort() {
    const queryTokens = parseSearchQuery(state.query.trim());

    let list = ALL_CARDS.filter(card => {
      // 如果开启了“仅看已加购”，直接看是否在购物车中
      if (state.onlyInCart) {
        if ((state.cart.get(card.id) || 0) <= 0) return false;
      } else {
        // 指示物过滤
        if (!state.includeTokens && card.isToken) return false;
      }

      // 领域过滤
      if (state.domains.size > 0) {
        let domainMatched = false;
        if (state.domains.has('None') && card.domains.length === 0) {
          domainMatched = true;
        }
        for (const d of card.domains) {
          if (state.domains.has(d)) {
            domainMatched = true;
            break;
          }
        }
        if (!domainMatched) return false;
      }

      // 类型过滤
      if (state.type && card.type !== state.type) return false;

      // 系列过滤
      if (state.set && card.set !== state.set) return false;

      // 费用过滤
      if (state.cost !== '') {
        if (state.cost === '8+') {
          if (card.energyCost === null || card.energyCost < 8) return false;
        } else {
          const targetCost = parseInt(state.cost, 10);
          if (card.energyCost !== targetCost) return false;
        }
      }

      // 稀有度过滤
      if (state.rarity && card.rarity !== state.rarity) return false;

      // 搜索词与语法过滤
      for (const tk of queryTokens) {
        if (!matchesSyntaxToken(card, tk)) return false;
      }

      return true;
    });

    // 如果未勾选“包含异画版本”且未开启“仅看已加购”，按同名卡聚合去重（但如果某个异画已在购物车中，也保留或优先展示）
    if (!state.includeAltArt && !state.onlyInCart) {
      const dedupMap = new Map();
      for (const card of list) {
        const key = `${card.enName.toLowerCase()}__${card.type.toLowerCase()}`;
        const existing = dedupMap.get(key);
        if (!existing) {
          dedupMap.set(key, card);
        } else {
          const cardInCart = (state.cart.get(card.id) || 0) > 0;
          const existingInCart = (state.cart.get(existing.id) || 0) > 0;
          if (cardInCart && !existingInCart) {
            dedupMap.set(key, card);
          } else if (cardInCart === existingInCart && isBetterCanonicalCard(card, existing)) {
            dedupMap.set(key, card);
          }
        }
      }
      list = Array.from(dedupMap.values());
    }

    // 排序
    const dir = state.sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (state.sortBy === 'name') {
        const cmp = a.name.localeCompare(b.name, 'zh-CN');
        if (cmp !== 0) return cmp * dir;
      } else if (state.sortBy === 'cost') {
        const cA = a.energyCost ?? 999;
        const cB = b.energyCost ?? 999;
        if (cA !== cB) return (cA - cB) * dir;
      } else if (state.sortBy === 'might') {
        const mA = a.might ?? -1;
        const mB = b.might ?? -1;
        if (mA !== mB) return (mA - mB) * dir;
      } else if (state.sortBy === 'cartQty') {
        const qA = state.cart.get(a.id) || 0;
        const qB = state.cart.get(b.id) || 0;
        if (qA !== qB) return (qA - qB) * dir;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true }) * dir;
    });

    state.filteredCards = list;
  }

  // 购物车增减操作
  function setCardQuantity(cardId, newQty) {
    const id = cardId.toUpperCase();
    if (!cardById.has(id)) return;
    const qty = Math.max(0, Math.min(999, Math.trunc(Number(newQty) || 0)));
    if (qty <= 0) {
      state.cart.delete(id);
    } else {
      state.cart.set(id, qty);
    }
    saveCartToStorage();
    updateCartUI();
    updateCardTileInDOM(id);
    if (state.onlyInCart && qty <= 0) {
      refreshCatalog(false);
    }
    if (document.getElementById('previewBoardModal').classList.contains('open')) {
      renderVisualPreviewBoard();
    }
    if (document.getElementById('textExportModal').classList.contains('open')) {
      renderTextExportContent();
    }
  }

  function changeCardQuantity(cardId, delta) {
    const id = cardId.toUpperCase();
    const cur = state.cart.get(id) || 0;
    setCardQuantity(id, cur + delta);
  }

  // 局部更新单张卡牌在主网格和列表中的状态（避免全量重绘导致滚动跳动）
  function updateCardTileInDOM(cardId) {
    const qty = state.cart.get(cardId) || 0;
    // 更新网格卡片
    const tile = document.querySelector(`.card-tile[data-card-id="${cardId}"]`);
    if (tile) {
      tile.classList.toggle('in-cart', qty > 0);
      const badge = tile.querySelector('.card-qty-badge');
      if (badge) {
        if (qty > 0) {
          badge.style.display = 'block';
          badge.textContent = `×${qty}`;
        } else {
          badge.style.display = 'none';
        }
      }
      const ctrlWrap = tile.querySelector('.card-cart-controls');
      if (ctrlWrap) {
        ctrlWrap.innerHTML = buildCardControlsHTML(cardId, qty);
      }
    }

    // 更新列表行
    const row = document.querySelector(`tr[data-card-id="${cardId}"]`);
    if (row) {
      row.classList.toggle('in-cart-row', qty > 0);
      const cell = row.querySelector('.list-cart-cell');
      if (cell) {
        cell.innerHTML = buildCardControlsHTML(cardId, qty);
      }
    }

    // 如果鼠标当前正悬停在该卡上，同步更新悬停预览角标
    const hoverEl = document.getElementById('hoverCardPreview');
    if (hoverEl.dataset.activeCardId === cardId) {
      const hoverQty = document.getElementById('hoverPreviewQty');
      if (qty > 0) {
        hoverQty.style.display = 'block';
        hoverQty.textContent = `已选 ×${qty}`;
      } else {
        hoverQty.style.display = 'none';
      }
    }
  }

  function buildCardControlsHTML(cardId, qty) {
    if (qty <= 0) {
      return `
        <button type="button" class="btn-add-initial" data-action="inc" data-id="${cardId}">
          <span>＋ 加入购物车</span>
        </button>
      `;
    }
    return `
      <div class="qty-stepper">
        <button type="button" class="step-btn" data-action="dec" data-id="${cardId}" title="减少 1 张">－</button>
        <input type="number" class="qty-input" data-action="input-qty" data-id="${cardId}" value="${qty}" min="0" max="999" aria-label="卡牌数量" />
        <button type="button" class="step-btn" data-action="inc" data-id="${cardId}" title="增加 1 张">＋</button>
        <button type="button" class="step-btn quick-preset" data-action="set3" data-id="${cardId}" title="直接设为 3 张">×3</button>
      </div>
    `;
  }

  // 渲染卡牌浏览区
  function refreshCatalog(resetLimit = true) {
    if (resetLimit) state.visibleLimit = 60;
    applyFiltersAndSort();

    const total = state.filteredCards.length;
    const shown = Math.min(total, state.visibleLimit);
    const slice = state.filteredCards.slice(0, shown);

    document.getElementById('resultCountText').innerHTML =
      `共找到 <strong style="color:var(--gold-light);">${total}</strong> 张卡牌（当前显示前 ${shown} 张）`;

    // 更新移动端筛选按钮上的激活筛选项数量角标
    const mobileFilterBadge = document.getElementById('mobileFilterBadge');
    if (mobileFilterBadge) {
      let activeCount = state.domains.size;
      if (state.type) activeCount++;
      if (state.set) activeCount++;
      if (state.cost !== '') activeCount++;
      if (state.rarity) activeCount++;
      if (state.includeAltArt) activeCount++;
      if (state.includeTokens) activeCount++;
      if (state.onlyInCart) activeCount++;
      mobileFilterBadge.textContent = activeCount;
      mobileFilterBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }

    const gridEl = document.getElementById('cardGridContainer');
    const listEl = document.getElementById('cardListContainer');
    const tbodyEl = document.getElementById('cardListTbody');

    if (state.viewMode === 'grid') {
      gridEl.style.display = 'grid';
      listEl.style.display = 'none';

      if (slice.length === 0) {
        gridEl.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-secondary);">
            <div style="font-size:40px;margin-bottom:10px;">🔍</div>
            <p style="font-size:16px;font-weight:700;color:var(--text-main);">未找到符合筛选条件的卡牌</p>
            <p style="font-size:13px;margin-top:6px;">请尝试放宽搜索词或点击「重置筛选」返回完整卡牌图库</p>
          </div>
        `;
      } else {
        gridEl.innerHTML = slice.map(card => {
          const qty = state.cart.get(card.id) || 0;
          const costStr = card.energyCost !== null ? `${card.energyCost}费` : '';
          const mightStr = card.might !== null ? `${card.might}战` : '';
          const metaRight = [costStr, mightStr].filter(Boolean).join(' · ') || formatType(card.type);
          return `
            <article class="card-tile ${qty > 0 ? 'in-cart' : ''}" data-card-id="${card.id}">
              <div class="card-art-box" data-card-click="${card.id}" data-hover-card="${card.id}">
                <span class="card-id-pill">${card.id}</span>
                <span class="card-qty-badge" style="display:${qty > 0 ? 'block' : 'none'};">×${qty}</span>
                <img
                  class="${card.type === 'Battlefield' ? 'battlefield-rot-img' : ''}"
                  crossorigin="anonymous"
                  src="${card.imgSmall}"
                  data-fallback="${card.imgFallbackSmall}"
                  alt="${card.name} (${card.id})"
                  loading="lazy"
                  onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}"
                />
                <button type="button" class="card-info-btn" data-action="detail" data-id="${card.id}" title="查看卡牌详情与高清原图">ℹ</button>
              </div>
              <div class="card-tile-footer">
                <div class="card-name-row" data-hover-card="${card.id}">
                  <span class="card-name-text" title="${card.name} (${card.enName})">${card.name}</span>
                  <span class="card-meta-sub">${metaRight}</span>
                </div>
                <div class="card-cart-controls">
                  ${buildCardControlsHTML(card.id, qty)}
                </div>
              </div>
            </article>
          `;
        }).join('');
      }
    } else {
      gridEl.style.display = 'none';
      listEl.style.display = 'block';
      tbodyEl.innerHTML = slice.map(card => {
        const qty = state.cart.get(card.id) || 0;
        return `
          <tr class="${qty > 0 ? 'in-cart-row' : ''}" data-card-id="${card.id}" data-hover-card="${card.id}">
            <td>
              <div class="list-thumb-wrap" data-action="detail" data-id="${card.id}" style="cursor:pointer;">
                <img
                  class="list-thumb ${card.type === 'Battlefield' ? 'battlefield-rot-img' : ''}"
                  src="${card.imgSmall}"
                  data-fallback="${card.imgFallbackSmall}"
                  alt="${card.name}"
                  loading="lazy"
                  onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}"
                />
              </div>
            </td>
            <td style="font-family:monospace;font-weight:700;">${card.id}</td>
            <td>
              <div style="font-weight:700;cursor:pointer;" data-action="detail" data-id="${card.id}">${card.name}</div>
              <div style="font-size:11px;color:var(--text-secondary);">${card.enName}</div>
            </td>
            <td>${formatType(card.type)}</td>
            <td>${formatDomains(card.domains)}</td>
            <td>${card.energyCost ?? '-'}</td>
            <td>${card.might ?? '-'}</td>
            <td>${formatRarity(card.rarity)}</td>
            <td style="font-size:12px;color:var(--text-secondary);">${formatSet(card.set)}</td>
            <td class="list-cart-cell">${buildCardControlsHTML(card.id, qty)}</td>
          </tr>
        `;
      }).join('');
    }

    const loadMoreWrap = document.getElementById('loadMoreWrap');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (shown < total) {
      loadMoreWrap.style.display = 'block';
      loadMoreBtn.textContent = `加载更多卡牌（还剩 ${total - shown} 张）`;
    } else {
      loadMoreWrap.style.display = 'none';
    }
  }

  // 更新右侧购物车 UI
  function getCartEntriesSorted() {
    const entries = [];
    for (const [id, qty] of state.cart.entries()) {
      const card = cardById.get(id);
      if (card && qty > 0) entries.push({ card, qty });
    }
    return entries;
  }

  function updateCartUI() {
    const entries = getCartEntriesSorted();
    let totalCards = 0;
    let unitCount = 0;
    let spellCount = 0;

    for (const { card, qty } of entries) {
      totalCards += qty;
      if (card.type === 'Unit') unitCount += qty;
      else if (card.type === 'Spell') spellCount += qty;
    }

    document.getElementById('headerCartCount').textContent = totalCards;
    document.getElementById('statTotalCards').textContent = totalCards;
    document.getElementById('statUniqueCards').textContent = entries.length;
    document.getElementById('statMainTypes').textContent = `${unitCount}单 / ${spellCount}法`;

    const mobileBadge = document.getElementById('mobileCartCountBadge');
    const mobileSub = document.getElementById('mobileCartSubText');
    if (mobileBadge) mobileBadge.textContent = totalCards;
    if (mobileSub) mobileSub.textContent = `${entries.length} 种 / ${totalCards} 张`;

    const container = document.getElementById('cartItemsContainer');
    if (entries.length === 0) {
      container.innerHTML = `
        <div class="cart-empty-state">
          <div style="font-size:32px;margin-bottom:8px;">🃏</div>
          <p>购物车还是空的</p>
          <p style="font-size:11.5px;margin-top:4px;">在左侧点击卡牌或「+ 加入购物车」即可自由选购并设置数量</p>
        </div>
      `;
      return;
    }

    container.innerHTML = entries.map(({ card, qty }) => `
      <div class="cart-item-row" data-hover-card="${card.id}">
        <div class="cart-item-thumb-wrap" data-action="detail" data-id="${card.id}">
          <img
            class="cart-item-thumb ${card.type === 'Battlefield' ? 'battlefield-rot-img' : ''}"
            src="${card.imgSmall}"
            data-fallback="${card.imgFallbackSmall}"
            alt="${card.name}"
            onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}"
          />
        </div>
        <div class="cart-item-info">
          <div class="cart-item-title" data-action="detail" data-id="${card.id}" title="${card.name} (${card.id})">
            ${card.name}
          </div>
          <div class="cart-item-sub">
            <span style="font-family:monospace;">${card.id}</span>
            <span>·</span>
            <span>${formatType(card.type)}</span>
            ${card.energyCost !== null ? `<span>· ${card.energyCost}费</span>` : ''}
          </div>
        </div>
        <div class="cart-item-actions">
          <button type="button" class="step-btn" style="width:24px;height:24px;font-size:12px;" data-action="dec" data-id="${card.id}">－</button>
          <input
            type="number"
            class="qty-input"
            style="width:42px;height:24px;font-size:12px;"
            data-action="input-qty"
            data-id="${card.id}"
            value="${qty}"
            min="0"
            max="999"
          />
          <button type="button" class="step-btn" style="width:24px;height:24px;font-size:12px;" data-action="inc" data-id="${card.id}">＋</button>
          <button type="button" class="icon-btn-sm" style="color:#ef4444;padding:2px 5px;" data-action="remove" data-id="${card.id}" title="移除此卡">✕</button>
        </div>
      </div>
    `).join('');
  }

  // 全局鼠标悬停放大预览卡牌 (Hover Card Preview)
  const hoverTooltip = document.getElementById('hoverCardPreview');
  const hoverImg = document.getElementById('hoverPreviewImg');
  const hoverQty = document.getElementById('hoverPreviewQty');
  const hoverName = document.getElementById('hoverPreviewName');
  const hoverId = document.getElementById('hoverPreviewId');
  const hoverTags = document.getElementById('hoverPreviewTags');
  const hoverRules = document.getElementById('hoverPreviewRules');

  function showHoverPreview(cardId, clientX, clientY) {
    // 触屏设备（手机/平板）不弹出跟随鼠标的悬浮框，避免遮挡触屏点击
    if (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) {
      return;
    }
    const card = cardById.get(cardId.toUpperCase());
    if (!card) return;

    if (hoverTooltip.dataset.activeCardId !== card.id) {
      hoverTooltip.dataset.activeCardId = card.id;
      hoverImg.classList.toggle('battlefield-rot-img', card.type === 'Battlefield');
      hoverImg.src = card.imgSmall;
      hoverImg.onerror = () => {
        if (hoverImg.src !== card.imgFallbackSmall) hoverImg.src = card.imgFallbackSmall;
      };
      hoverName.textContent = card.name;
      hoverId.textContent = card.id;

      const tags = [
        formatType(card.type),
        formatDomains(card.domains),
        card.energyCost !== null ? `法力 ${card.energyCost}` : null,
        card.powerCost !== null ? `符能 ${card.powerCost}` : null,
        card.might !== null ? `战力 ${card.might}` : null,
        formatRarity(card.rarity)
      ].filter(Boolean);
      hoverTags.textContent = tags.join(' · ');

      const rules = formatRulesText(card.text);
      if (rules) {
        hoverRules.style.display = 'block';
        hoverRules.textContent = rules;
      } else {
        hoverRules.style.display = 'none';
      }
    }

    const qty = state.cart.get(card.id) || 0;
    if (qty > 0) {
      hoverQty.style.display = 'block';
      hoverQty.textContent = `已选 ×${qty}`;
    } else {
      hoverQty.style.display = 'none';
    }

    hoverTooltip.classList.add('visible');
    positionHoverPreview(clientX, clientY);
  }

  function positionHoverPreview(clientX, clientY) {
    const pad = 20;
    const w = 330;
    const h = hoverTooltip.offsetHeight || 520;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = clientX + 24;
    if (left + w + pad > vw) {
      left = Math.max(pad, clientX - w - 24);
    }

    let top = clientY - Math.round(h * 0.35);
    if (top + h + pad > vh) {
      top = vh - h - pad;
    }
    if (top < pad) top = pad;

    hoverTooltip.style.left = `${left}px`;
    hoverTooltip.style.top = `${top}px`;
  }

  function hideHoverPreview() {
    hoverTooltip.classList.remove('visible');
    hoverTooltip.dataset.activeCardId = '';
  }

  // 单卡详情弹窗
  function openCardDetailModal(cardId) {
    hideHoverPreview();
    const card = cardById.get(cardId.toUpperCase());
    if (!card) return;

    const qty = state.cart.get(card.id) || 0;
    const otherPrints = (printsByName.get(card.enName.toLowerCase().trim()) || []).filter(c => c.id !== card.id);

    document.getElementById('detailModalTitle').textContent = `${card.name} (${card.id})`;
    const body = document.getElementById('cardDetailModalBody');
    body.innerHTML = `
      <div class="card-detail-layout">
        <div style="border-radius:12px;overflow:hidden;border:1.5px solid var(--gold-primary);background:#090d16;">
          <img
            src="${card.imgOriginal}"
            data-fallback="${card.imgFallbackOriginal}"
            alt="${card.name}"
            style="width:100%;display:block;"
            onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}"
          />
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;color:var(--gold-light);">${card.name}</h2>
            <p style="font-size:13px;color:var(--text-secondary);">${card.enName} · 编号 <strong style="font-family:monospace;">${card.id}</strong></p>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <span class="brand-badge">类型：${formatType(card.type)}</span>
            <span class="brand-badge">领域：${formatDomains(card.domains)}</span>
            ${card.energyCost !== null ? `<span class="brand-badge">法力费用：${card.energyCost}</span>` : ''}
            ${card.powerCost !== null ? `<span class="brand-badge">符能费用：${card.powerCost}</span>` : ''}
            ${card.might !== null ? `<span class="brand-badge">战力：${card.might}</span>` : ''}
            <span class="brand-badge">稀有度：${formatRarity(card.rarity)}</span>
            <span class="brand-badge">系列：${formatSet(card.set)}</span>
          </div>

          ${card.text ? `
            <div style="background:var(--bg-elevated);padding:12px 14px;border-radius:10px;border:1px solid var(--border-subtle);">
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;font-weight:600;">卡牌规则文本：</div>
              <div style="font-size:14px;line-height:1.65;white-space:pre-line;">${formatRulesText(card.text)}</div>
            </div>
          ` : ''}

          ${card.flavorText ? `
            <div style="font-size:13px;color:var(--text-secondary);font-style:italic;padding:4px 2px;">
              ${card.flavorText}
            </div>
          ` : ''}

          <div style="padding:14px;background:var(--bg-elevated);border-radius:10px;border:1px solid var(--gold-primary);display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <span style="font-weight:700;font-size:14px;">🛒 选购此卡牌数量：</span>
            <div style="width:200px;" id="detailModalStepperWrap">
              ${buildCardControlsHTML(card.id, qty)}
            </div>
          </div>

          <div id="detailModalJhsBox" style="padding:12px 14px;background:rgba(249,115,22,0.08);border-radius:10px;border:1px solid rgba(249,115,22,0.35);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <span style="font-size:12.5px;color:#fdba74;">⚡ 正在查询集换社 App 在售全版本最低价...</span>
          </div>

          ${otherPrints.length > 0 ? `
            <div>
              <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:8px;font-weight:600;">
                同名卡牌其他版本 / 异画 (${otherPrints.length} 款，点击切换查看)：
              </div>
              <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">
                ${otherPrints.map(p => `
                  <div
                    style="width:76px;flex-shrink:0;cursor:pointer;text-align:center;"
                    data-action="detail"
                    data-id="${p.id}"
                    data-hover-card="${p.id}"
                  >
                    <div style="position:relative;width:100%;aspect-ratio:488/680;overflow:hidden;border-radius:6px;border:1px solid var(--border-strong);background:#090d16;">
                      <img
                        class="${p.type === 'Battlefield' ? 'battlefield-rot-img' : ''}"
                        src="${p.imgSmall}"
                        data-fallback="${p.imgFallbackSmall}"
                        alt="${p.id}"
                        style="width:100%;height:100%;object-fit:cover;display:block;"
                        onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}"
                      />
                    </div>
                    <div style="font-size:10.5px;font-family:monospace;margin-top:3px;color:var(--text-secondary);">${p.id}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    document.getElementById('cardDetailModal').classList.add('open');

    fetchJhsVersionsForCard(card, false).then(versions => {
      const box = document.getElementById('detailModalJhsBox');
      if (!box) return;
      const ver = getSelectedJhsVersion(card);
      if (!ver || !versions.length) {
        box.innerHTML = `<span style="font-size:12px;color:var(--text-secondary);">⚡ 集换社暂未检索到对应在售版本</span>`;
        return;
      }
      const minP = parseFloat(ver.min_price);
      const priceText = minP > 0 ? `¥${minP.toFixed(2)}` : '暂无在售报价';
      const deepLink = `jihuanshe://www.jihuanshe.com/app/cardDetail?gameKey=lol&gameSubKey=default&cardVersionId=${ver.id}`;
      box.innerHTML = `
        <div>
          <div style="font-size:13px;font-weight:700;color:#fed7aa;">
            ⚡ 集换社最低价：<span style="font-size:16px;font-weight:900;color:#fb923c;">${priceText}</span>
            <span style="font-size:11.5px;color:var(--text-secondary);margin-left:6px;">(${escapeHtml(ver.number || card.id)} · ${escapeHtml(ver.rarity || '平卡')})</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">共检索到 ${versions.length} 个集换社版本，已自动优选最低价版本</div>
        </div>
        <a class="btn btn-sm btn-jhs" href="${deepLink}" style="text-decoration:none;">📱 跳集换社 App 购买</a>
      `;
    });
  }

  // =========================================================================
  // 核心交付 1：购物车交互式预览看板 (允许鼠标悬停预览卡牌) & Canvas 2x 高清截图导出
  // =========================================================================
  function getFilteredBoardEntries() {
    let entries = getCartEntriesSorted();
    const domEl = document.getElementById('boardFilterDomain');
    const typeEl = document.getElementById('boardFilterType');
    const rarEl = document.getElementById('boardFilterRarity');

    const dom = domEl ? domEl.value : '';
    const type = typeEl ? typeEl.value : '';
    const rar = rarEl ? rarEl.value : '';

    return entries.filter(({ card }) => {
      if (dom) {
        if (dom === 'None') {
          if (card.domains.length > 0) return false;
        } else if (!card.domains.includes(dom)) {
          return false;
        }
      }
      if (type && card.type !== type) return false;
      if (rar && card.rarity !== rar) return false;
      return true;
    });
  }

  function getGroupedCartSections(groupBy, customEntries) {
    const entries = customEntries || getFilteredBoardEntries();
    if (entries.length === 0) return [];

    if (groupBy === 'none') {
      return [{ title: '全部已选卡牌', entries }];
    }

    const groupsMap = new Map();
    for (const item of entries) {
      let key = '其他';
      if (groupBy === 'type') {
        key = formatType(item.card.type);
      } else if (groupBy === 'domain') {
        key = formatDomains(item.card.domains);
      } else if (groupBy === 'rarity') {
        key = formatRarity(item.card.rarity);
      } else if (groupBy === 'cost') {
        key = item.card.energyCost !== null ? `费用 ${item.card.energyCost}` : '无费用 / 战场与符文';
      }
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(item);
    }

    return Array.from(groupsMap.entries()).map(([title, list]) => ({
      title,
      entries: list
    }));
  }

  // 在「集换社 AI 拍照识卡纯净拼图」模式下，自动将多张卡牌按购买数量 (如 ×3) 1:1 平铺展开为独立卡面，
  // 这样集换社 App 相册识卡扫描一次即可自动识别出准确的购买张数（无需手动改数量），同时卡框下方清晰标注总张数与第几张
  function expandSectionsForAiMode(sections, aiCleanMode) {
    if (!aiCleanMode) return sections;
    return sections.map(sec => {
      const expandedEntries = [];
      for (const item of sec.entries) {
        const repeatCount = Math.min(Math.max(1, item.qty), 12);
        for (let i = 0; i < repeatCount; i++) {
          expandedEntries.push({
            card: item.card,
            qty: item.qty,
            copyIndex: i + 1,
            totalCopies: item.qty,
            isAiExpanded: true
          });
        }
      }
      return {
        title: sec.title,
        entries: expandedEntries
      };
    });
  }

  function renderVisualPreviewBoard() {
    const container = document.getElementById('visualBoardContainer');
    const entries = getFilteredBoardEntries();
    const title = document.getElementById('boardTitleInput').value.trim() || '《符文战场》卡牌选购清单';
    const groupBy = document.getElementById('boardGroupSelect').value;
    const cols = parseInt(document.getElementById('boardColsSelect').value, 10) || 6;
    const aiCleanMode = Boolean(document.getElementById('boardJhsAiCleanModeCheck')?.checked);
    const showCaption = Boolean(document.getElementById('boardShowCaptionCheck')?.checked);
    const showJhsPrice = !aiCleanMode && Boolean(document.getElementById('boardShowJhsPriceCheck')?.checked);

    if (showJhsPrice && entries.some(({ card }) => !jhsVersionsCache.has(card.id)) && !jhsState.isFetchingCartPrices) {
      ensureCartJhsPricesLoaded(false).then(() => {
        if (document.getElementById('previewBoardModal')?.classList.contains('open')) {
          renderVisualPreviewBoard();
        }
      });
    }

    container.style.setProperty('--board-cols', cols);

    if (entries.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#94a3b8;">
          <div style="font-size:44px;margin-bottom:10px;">🛒</div>
          <p style="font-size:17px;font-weight:700;color:#f8fafc;">当前筛选条件下暂无已选卡牌</p>
          <p style="font-size:13px;margin-top:6px;">请先在卡牌浏览页添加卡牌，或调整上方的看板筛选条件</p>
        </div>
      `;
      return;
    }

    const totalQty = entries.reduce((acc, e) => acc + e.qty, 0);
    let totalJhsCost = 0;
    if (showJhsPrice) {
      entries.forEach(({ card, qty }) => {
        const v = getSelectedJhsVersion(card);
        const p = parseFloat(v?.min_price);
        if (p > 0) totalJhsCost += p * qty;
      });
    }
    const rawSections = getGroupedCartSections(groupBy, entries);
    const sections = expandSectionsForAiMode(rawSections, aiCleanMode);
    const dateStr = new Date().toLocaleDateString('zh-CN');

    container.innerHTML = `
      <div class="board-banner">
        <div>
          <div class="board-banner-title">${escapeHtml(title)}</div>
          <div class="board-banner-sub">${
            aiCleanMode
              ? `🤖 集换社 App「AI 拍照识卡」纯净拼图模式 · 已按购买张数 (${totalQty}张) 1:1 平铺展开且去除卡面遮挡，集换社相册识卡可直接识别对应数量！`
              : `RiftAtlas《符文战场》选购预览看板 · 生成日期 ${dateStr} · 鼠标悬停卡牌可高清放大预览`
          }</div>
        </div>
        <div class="board-banner-stats">
          <div class="board-stat-pill"><strong>${totalQty}</strong>总张数</div>
          <div class="board-stat-pill"><strong>${entries.length}</strong>卡牌种类</div>
          ${showJhsPrice ? `<div class="board-stat-pill" style="border-color:rgba(249,115,22,0.55);"><strong style="color:#fdba74;">¥${totalJhsCost.toFixed(2)}</strong>集换社最低估价</div>` : ''}
        </div>
      </div>

      ${sections.map(sec => {
        const secTotal = sec.entries.length;
        return `
          <div class="board-group-section">
            ${groupBy !== 'none' && !aiCleanMode ? `
              <div class="board-group-header">
                <span>◆ ${escapeHtml(sec.title)}</span>
                <span class="count">${sec.entries.reduce((s, e) => s + e.qty, 0)} 张 (${sec.entries.length} 种)</span>
              </div>
            ` : ''}
            <div class="board-cards-grid">
              ${sec.entries.map(({ card, qty, copyIndex, isAiExpanded }) => {
                const jhsVer = showJhsPrice ? getSelectedJhsVersion(card) : null;
                const jhsMinP = parseFloat(jhsVer?.min_price);
                return `
                <div class="board-card-item" data-hover-card="${card.id}">
                  <div class="art-wrap" data-action="detail" data-id="${card.id}">
                    <img
                      class="${card.type === 'Battlefield' ? 'battlefield-rot-img' : ''}"
                      crossorigin="anonymous"
                      src="${card.imgSmall}"
                      data-fallback="${card.imgFallbackSmall}"
                      alt="${escapeHtml(card.name)}"
                      onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}"
                    />
                    ${!aiCleanMode ? `<span class="qty-badge">×${qty}</span>` : ''}
                    ${showJhsPrice && jhsMinP > 0 ? `<span class="jhs-price-tag">¥${jhsMinP.toFixed(2)}</span>` : ''}
                  </div>
                  ${showCaption ? `
                    <div class="board-card-caption">
                      <div class="nm" title="${escapeHtml(card.name)}">
                        ${escapeHtml(card.name)}
                        ${isAiExpanded ? `<strong style="color:var(--gold-light);margin-left:3px;">×${qty}</strong>` : ''}
                      </div>
                      <div class="cid">${
                        isAiExpanded
                          ? `${card.id} · 第 ${copyIndex}/${qty} 张`
                          : `${card.id}${showJhsPrice && jhsMinP > 0 ? ` · ¥${(jhsMinP * qty).toFixed(2)}` : ''}`
                      }</div>
                    </div>
                  ` : ''}
                </div>
              `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 加载单张图片用于 Canvas 绘制
  // 注意：assets.riftatlas-workers.com 对未知查询参数 (如 ?cors=1) 会返回 403 Forbidden，
  // 因此严禁修改原 URL 查询串，统一通过 fetch(url, { mode: 'cors', cache: 'no-cache' }) -> Blob -> ObjectURL 加载，
  // 彻底解决浏览器非 CORS 缓存冲突与 Canvas 跨域污染问题。
  const canvasImageCache = new Map();

  async function loadCardImageForCanvas(card) {
    if (!card) return null;
    if (canvasImageCache.has(card.id)) {
      return canvasImageCache.get(card.id);
    }

    const loadViaFetchBlob = async url => {
      if (!url) return null;
      try {
        let resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) {
          resp = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        }
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        return await new Promise(resolve => {
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            resolve(null);
          };
          img.src = objUrl;
        });
      } catch (err) {
        try {
          const resp2 = await fetch(url, { mode: 'cors', cache: 'reload' });
          if (!resp2.ok) return null;
          const blob2 = await resp2.blob();
          const objUrl2 = URL.createObjectURL(blob2);
          return await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(objUrl2);
              resolve(img);
            };
            img.onerror = () => {
              URL.revokeObjectURL(objUrl2);
              resolve(null);
            };
            img.src = objUrl2;
          });
        } catch (err2) {
          return null;
        }
      }
    };

    const loadViaDirectImg = url => {
      if (!url) return Promise.resolve(null);
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    };

    let loadedImg =
      (await loadViaFetchBlob(card.imgSmall)) ||
      (await loadViaFetchBlob(card.imgFallbackSmall)) ||
      (await loadViaDirectImg(card.imgSmall)) ||
      (await loadViaDirectImg(card.imgFallbackSmall));

    if (loadedImg) {
      canvasImageCache.set(card.id, loadedImg);
    }
    return loadedImg;
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // 使用 HTML5 Canvas 原生合成 2x 超清卡牌预览截图
  async function renderScreenshotCanvas() {
    const entries = getFilteredBoardEntries();
    if (entries.length === 0) {
      showToast('当前筛选条件下没有可导出的卡牌');
      return null;
    }

    const statusEl = document.getElementById('screenshotStatusText');
    statusEl.textContent = '⏳ 正在加载高清卡图并合成 2x 预览截图，请稍候...';

    const title = document.getElementById('boardTitleInput').value.trim() || '《符文战场》卡牌选购清单';
    const groupBy = document.getElementById('boardGroupSelect').value;
    const cols = parseInt(document.getElementById('boardColsSelect').value, 10) || 6;
    const aiCleanMode = Boolean(document.getElementById('boardJhsAiCleanModeCheck')?.checked);
    const showCaption = Boolean(document.getElementById('boardShowCaptionCheck')?.checked);
    const showJhsPrice = !aiCleanMode && Boolean(document.getElementById('boardShowJhsPriceCheck')?.checked);
    const rawSections = getGroupedCartSections(groupBy, entries);
    const sections = expandSectionsForAiMode(rawSections, aiCleanMode);

    if (showJhsPrice) {
      await ensureCartJhsPricesLoaded(false);
    }

    // 尺寸参数 (2x 高清渲染)
    const scale = 2;
    const padX = 36;
    const padY = 36;
    const cardW = cols >= 8 ? 160 : cols >= 6 ? 195 : 225;
    const cardH = Math.round(cardW * (680 / 488));
    const captionH = showCaption ? 44 : 0;
    const itemH = cardH + captionH;
    const gapX = 16;
    const gapY = 18;
    const headerH = 92;
    const groupTitleH = groupBy !== 'none' && !aiCleanMode ? 38 : 0;
    const sectionGap = 24;

    const boardW = padX * 2 + cols * cardW + (cols - 1) * gapX;

    let totalRowsHeight = 0;
    sections.forEach((sec, idx) => {
      const rows = Math.ceil(sec.entries.length / cols);
      totalRowsHeight += groupTitleH + rows * itemH + Math.max(0, rows - 1) * gapY;
      if (idx < sections.length - 1) totalRowsHeight += sectionGap;
    });

    const footerH = 42;
    const boardH = padY * 2 + headerH + totalRowsHeight + footerH;

    // 并发加载所有卡图
    const imgMap = new Map();
    await Promise.all(
      entries.map(async ({ card }) => {
        const img = await loadCardImageForCanvas(card);
        imgMap.set(card.id, img);
      })
    );

    const canvas = document.createElement('canvas');
    canvas.width = boardW * scale;
    canvas.height = boardH * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // 1. 背景绘制
    const bgGrad = ctx.createLinearGradient(0, 0, 0, boardH);
    bgGrad.addColorStop(0, '#131c2e');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, boardW, boardH);

    // 外框金色细线
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 10, 10, boardW - 20, boardH - 20, 14);
    ctx.stroke();

    // 2. 顶部 Banner
    const totalQty = entries.reduce((s, e) => s + e.qty, 0);
    let totalJhsCost = 0;
    if (showJhsPrice) {
      entries.forEach(({ card, qty }) => {
        const v = getSelectedJhsVersion(card);
        const p = parseFloat(v?.min_price);
        if (p > 0) totalJhsCost += p * qty;
      });
    }
    const dateStr = new Date().toLocaleDateString('zh-CN');

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 26px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(title, padX, padY + 30);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(
      aiCleanMode
        ? `集换社 App「AI 拍照识卡」纯净拼图（已按张数 1:1 展开共 ${totalQty} 张） · 导出日期 ${dateStr}`
        : `《符文战场》卡牌选购预览清单 · 导出日期 ${dateStr}`,
      padX,
      padY + 56
    );

    // 右侧统计胶囊
    const statText = showJhsPrice
      ? `总计 ${totalQty} 张  |  共 ${entries.length} 种  |  集换社估价 ¥${totalJhsCost.toFixed(2)}`
      : `总计 ${totalQty} 张  |  共 ${entries.length} 种卡牌`;
    ctx.font = 'bold 15px "Microsoft YaHei", "PingFang SC", sans-serif';
    const statW = ctx.measureText(statText).width + 32;
    const statX = boardW - padX - statW;
    const statY = padY + 14;
    ctx.fillStyle = 'rgba(234, 179, 8, 0.16)';
    drawRoundedRect(ctx, statX, statY, statW, 40, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.fillText(statText, statX + 16, statY + 25);

    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, padY + 74);
    ctx.lineTo(boardW - padX, padY + 74);
    ctx.stroke();

    // 3. 逐组绘制卡牌网格
    let curY = padY + headerH;

    for (const sec of sections) {
      if (groupBy !== 'none' && !aiCleanMode) {
        const secQty = sec.entries.reduce((s, e) => s + e.qty, 0);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 16px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText(`◆ ${sec.title}（${secQty} 张 / ${sec.entries.length} 种）`, padX, curY + 22);
        curY += groupTitleH;
      }

      sec.entries.forEach(({ card, qty, copyIndex, isAiExpanded }, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = padX + col * (cardW + gapX);
        const y = curY + row * (itemH + gapY);

        // 卡片阴影与底框
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = '#111827';
        drawRoundedRect(ctx, x, y, cardW, itemH, 10);
        ctx.fill();
        ctx.restore();

        // 裁剪并绘制卡图（战场/横版卡图自动旋转 90° 竖向完整铺满卡框）
        ctx.save();
        drawRoundedRect(ctx, x, y, cardW, cardH, 10);
        ctx.clip();
        const img = imgMap.get(card.id);
        if (img) {
          if (card.type === 'Battlefield' || img.width > img.height) {
            ctx.save();
            ctx.translate(x + cardW / 2, y + cardH / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, -cardH / 2, -cardW / 2, cardH, cardW);
            ctx.restore();
          } else {
            ctx.drawImage(img, x, y, cardW, cardH);
          }
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, y, cardW, cardH);
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
          ctx.fillText(card.name, x + 12, y + cardH / 2);
        }
        ctx.restore();

        // 右上角数量角标 (×N) - AI 纯净识卡模式下不遮挡卡面图案，改为平铺展开+卡框外底部标注数量
        if (!aiCleanMode) {
          const badgeText = `×${qty}`;
          ctx.font = 'bold 16px "Segoe UI", "Microsoft YaHei", sans-serif';
          const bw = Math.max(44, ctx.measureText(badgeText).width + 20);
          const bh = 28;
          const bx = x + cardW - bw - 8;
          const by = y + 8;

          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 8;
          const badgeGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
          badgeGrad.addColorStop(0, '#facc15');
          badgeGrad.addColorStop(1, '#ca8a04');
          ctx.fillStyle = badgeGrad;
          drawRoundedRect(ctx, bx, by, bw, bh, 14);
          ctx.fill();
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#090d16';
          ctx.font = '900 15px "Segoe UI", "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, bx + bw / 2, by + 19.5);
          ctx.textAlign = 'left';
        }

        // 左下角集换社最低价标签
        if (showJhsPrice && !aiCleanMode) {
          const jhsVer = getSelectedJhsVersion(card);
          const minP = parseFloat(jhsVer?.min_price);
          if (minP > 0) {
            const pText = `¥${minP.toFixed(2)}`;
            ctx.font = 'bold 13px "Segoe UI", "Microsoft YaHei", sans-serif';
            const pw = ctx.measureText(pText).width + 16;
            const ph = 24;
            const px = x + 8;
            const py = y + cardH - ph - 8;
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            drawRoundedRect(ctx, px, py, pw, ph, 12);
            ctx.fill();
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = '#fdba74';
            ctx.textAlign = 'center';
            ctx.fillText(pText, px + pw / 2, py + 16.5);
            ctx.textAlign = 'left';
            ctx.restore();
          }
        }

        // 底部卡名与编号标签（位于卡面下方外部，不遮挡卡图，AI 模式下清晰显示 ×数量 与 第几张）
        if (showCaption) {
          const capY = y + cardH;
          ctx.fillStyle = '#0f172a';
          drawRoundedRect(ctx, x, capY - 6, cardW, captionH + 6, 10);
          ctx.fill();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 12.5px "Microsoft YaHei", "PingFang SC", sans-serif';
          ctx.textAlign = 'center';
          const nameWithQty = isAiExpanded ? `${card.name} ×${qty}` : card.name;
          let displayName = nameWithQty;
          while (displayName.length > 1 && ctx.measureText(displayName).width > cardW - 14) {
            displayName = displayName.slice(0, -1);
          }
          if (displayName !== nameWithQty) displayName += '…';
          ctx.fillText(displayName, x + cardW / 2, capY + 17);

          const jhsVer = showJhsPrice ? getSelectedJhsVersion(card) : null;
          const minP = parseFloat(jhsVer?.min_price);
          const subText = isAiExpanded
            ? `${card.id} · 第 ${copyIndex}/${qty} 张`
            : showJhsPrice && minP > 0
            ? `${card.id} · ¥${(minP * qty).toFixed(2)}`
            : card.id;
          ctx.fillStyle = isAiExpanded ? '#fde047' : '#94a3b8';
          ctx.font = '11px Consolas, "Microsoft YaHei", monospace';
          ctx.fillText(subText, x + cardW / 2, capY + 34);
          ctx.textAlign = 'left';
        }

        // 卡片外边框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, x, y, cardW, itemH, 10);
        ctx.stroke();
      });

      const rows = Math.ceil(sec.entries.length / cols);
      curY += rows * itemH + Math.max(0, rows - 1) * gapY + sectionGap;
    }

    // 底部水印
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`由《符文战场》卡牌选购中心生成 · 共 ${entries.length} 种 / ${totalQty} 张卡牌`, boardW / 2, boardH - 18);
    ctx.textAlign = 'left';

    statusEl.textContent = '✅ 2x 超清预览截图已生成完毕！';
    return canvas;
  }

  function showGeneratedPreviewImageBox(canvas) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const box = document.getElementById('generatedImagePreviewBox');
      const img = document.getElementById('generatedScreenshotImg');
      if (box && img) {
        img.src = dataUrl;
        box.style.display = 'block';
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (e) {
      // ignore
    }
  }

  async function handleDownloadScreenshot() {
    const canvas = await renderScreenshotCanvas();
    if (!canvas) return;
    showGeneratedPreviewImageBox(canvas);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const title = document.getElementById('boardTitleInput').value.trim() || '符文战场选购清单';
      a.href = url;
      a.download = `${title}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast('🖼️ 高清预览长图已生成！电脑已自动下载，手机端可直接长按上方预览图保存到相册');
    }, 'image/png');
  }

  async function handleCopyScreenshot() {
    const canvas = await renderScreenshotCanvas();
    if (!canvas) return;
    showGeneratedPreviewImageBox(canvas);
    canvas.toBlob(async blob => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('✅ 预览截图已复制到剪贴板！手机端也可直接长按上方图片保存');
      } catch (err) {
        showToast('📱 已在上方生成高清图片，手机端请直接长按图片保存到相册！');
      }
    }, 'image/png');
  }

  // =========================================================================
  // 核心交付 2：纯文本表格导出（支持颜色/稀有度/类型/费用/系列筛选 + 自定义导出字段列）
  // =========================================================================
  const exportFilterState = {
    domains: new Set()
  };

  const EXPORT_COL_DEFS = [
    { key: 'name', label: '卡牌名称', getValue: ({ card }) => card.name, always: true },
    { key: 'qty', label: '数量', getValue: ({ qty }) => String(qty), always: true },
    { key: 'domain', label: '颜色/领域', getValue: ({ card }) => formatDomains(card.domains) },
    { key: 'rarity', label: '稀有度', getValue: ({ card }) => formatRarity(card.rarity) },
    { key: 'type', label: '卡牌类型', getValue: ({ card }) => formatType(card.type) },
    { key: 'id', label: '卡牌编号', getValue: ({ card }) => card.id },
    { key: 'cost', label: '法力费用', getValue: ({ card }) => card.energyCost !== null ? String(card.energyCost) : '-' },
    { key: 'might', label: '战力', getValue: ({ card }) => card.might !== null ? String(card.might) : '-' },
    { key: 'set', label: '所属系列', getValue: ({ card }) => formatSet(card.set) },
    {
      key: 'jhsNumber',
      label: '集换社编号',
      getValue: ({ card }) => {
        const v = getSelectedJhsVersion(card);
        return v?.number || card.id.replace('-', '·');
      }
    },
    {
      key: 'jhsRarity',
      label: '集换社版本',
      getValue: ({ card }) => {
        const v = getSelectedJhsVersion(card);
        return v ? `${v.rarity || '平卡'} (#${v.id})` : formatRarity(card.rarity);
      }
    },
    {
      key: 'jhsPrice',
      label: '集换社最低价',
      getValue: ({ card }) => {
        const v = getSelectedJhsVersion(card);
        const p = parseFloat(v?.min_price);
        return p > 0 ? `¥${p.toFixed(2)}` : '-';
      }
    },
    {
      key: 'jhsSubtotal',
      label: '集换社小计',
      getValue: ({ card, qty }) => {
        const v = getSelectedJhsVersion(card);
        const p = parseFloat(v?.min_price);
        return p > 0 ? `¥${(p * qty).toFixed(2)}` : '-';
      }
    }
  ];

  function getSelectedExportColumns() {
    const checkedKeys = new Set(['name', 'qty']);
    document.querySelectorAll('.export-col-check:checked').forEach(chk => {
      checkedKeys.add(chk.value);
    });
    return EXPORT_COL_DEFS.filter(col => checkedKeys.has(col.key));
  }

  function getFilteredExportEntries() {
    const allCartEntries = getCartEntriesSorted();
    const typeVal = document.getElementById('exportTypeSelect')?.value || '';
    const rarityVal = document.getElementById('exportRaritySelect')?.value || '';
    const costVal = document.getElementById('exportCostSelect')?.value || '';
    const setVal = document.getElementById('exportSetSelect')?.value || '';
    const sortVal = document.getElementById('exportSortSelect')?.value || 'id';

    let list = allCartEntries.filter(({ card }) => {
      // 颜色/领域筛选
      if (exportFilterState.domains.size > 0) {
        let matched = false;
        if (exportFilterState.domains.has('None') && card.domains.length === 0) matched = true;
        for (const d of card.domains) {
          if (exportFilterState.domains.has(d)) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }
      // 类型筛选
      if (typeVal && card.type !== typeVal) return false;
      // 稀有度筛选
      if (rarityVal && card.rarity !== rarityVal) return false;
      // 费用筛选
      if (costVal !== '') {
        if (costVal === '8+') {
          if (card.energyCost === null || card.energyCost < 8) return false;
        } else if (card.energyCost !== parseInt(costVal, 10)) {
          return false;
        }
      }
      // 系列筛选
      if (setVal && card.set !== setVal) return false;
      return true;
    });

    // 排序
    const RARITY_ORDER = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Showcase: 5 };
    list.sort((a, b) => {
      if (sortVal === 'name') return a.card.name.localeCompare(b.card.name, 'zh-CN');
      if (sortVal === 'domain') return formatDomains(a.card.domains).localeCompare(formatDomains(b.card.domains), 'zh-CN');
      if (sortVal === 'type') return formatType(a.card.type).localeCompare(formatType(b.card.type), 'zh-CN');
      if (sortVal === 'rarity') return (RARITY_ORDER[b.card.rarity] || 0) - (RARITY_ORDER[a.card.rarity] || 0);
      if (sortVal === 'cost') return (a.card.energyCost ?? 999) - (b.card.energyCost ?? 999);
      if (sortVal === 'qty') return b.qty - a.qty;
      return a.card.id.localeCompare(b.card.id, undefined, { numeric: true });
    });

    return list;
  }

  function getDisplayWidth(str) {
    let w = 0;
    for (const ch of String(str)) {
      w += ch.charCodeAt(0) > 255 ? 2 : 1;
    }
    return w;
  }

  function padRightDisplay(str, targetWidth) {
    const w = getDisplayWidth(str);
    return String(str) + ' '.repeat(Math.max(0, targetWidth - w));
  }

  function buildTextTableString() {
    const totalCartCount = state.cart.size;
    if (totalCartCount === 0) return '（购物车为空，请先在主页面选择卡牌加入购物车）';

    const entries = getFilteredExportEntries();
    if (entries.length === 0) return '（当前筛选条件下没有匹配的购物车卡牌，请调整上方的颜色/稀有度/类型筛选条件）';

    const cols = getSelectedExportColumns();
    const format = document.getElementById('textFormatSelect').value;
    const includeHeader = document.getElementById('textIncludeHeaderCheck').checked;
    const totalQty = entries.reduce((s, e) => s + e.qty, 0);
    let totalJhsCost = 0;
    entries.forEach(({ card, qty }) => {
      const v = getSelectedJhsVersion(card);
      const p = parseFloat(v?.min_price);
      if (p > 0) totalJhsCost += p * qty;
    });

    if (format === 'jhs_wishlist') {
      const lines = [];
      if (includeHeader) {
        lines.push(`=== 集换社《符文战场》心愿单配卡表 (${new Date().toLocaleDateString('zh-CN')}) ===`);
      }
      entries.forEach(({ card, qty }, idx) => {
        const v = getSelectedJhsVersion(card);
        const jhsNum = v?.number || card.id.replace('-', '·');
        const jhsRar = v?.rarity || formatRarity(card.rarity);
        const minP = parseFloat(v?.min_price);
        const pricePart = minP > 0 ? ` | 集换社底价 ¥${minP.toFixed(2)} (小计 ¥${(minP * qty).toFixed(2)})` : '';
        lines.push(`${idx + 1}. ${card.name} [${jhsNum} · ${jhsRar}] x${qty}${pricePart}`);
      });
      if (includeHeader) {
        lines.push(`--------------------------------------------------------------`);
        lines.push(`总计：${entries.length} 种卡牌，共 ${totalQty} 张${totalJhsCost > 0 ? ` | 集换社在售最低估价合计：¥${totalJhsCost.toFixed(2)}` : ''}`);
      }
      return lines.join('\n');
    }

    // 构建二维单元格数据
    const dataRows = entries.map(entry => cols.map(c => c.getValue(entry)));

    if (format === 'aligned') {
      const colWidths = cols.map((col, idx) => {
        const maxDataW = Math.max(...dataRows.map(r => getDisplayWidth(r[idx])));
        return Math.max(getDisplayWidth(col.label), maxDataW) + 2;
      });

      const lines = [];
      if (includeHeader) {
        const headerLine = cols.map((col, i) => padRightDisplay(col.label, colWidths[i])).join(' | ');
        const sepLine = colWidths.map(w => '-'.repeat(w)).join('-+-');
        lines.push(headerLine);
        lines.push(sepLine);
      }

      for (const row of dataRows) {
        lines.push(row.map((val, i) => padRightDisplay(val, colWidths[i])).join(' | '));
      }

      if (includeHeader) {
        const sepLine = colWidths.map(w => '-'.repeat(w)).join('-+-');
        lines.push(sepLine);
        const summaryCells = cols.map((col, i) => {
          if (col.key === 'name') return padRightDisplay(`总计（共 ${entries.length} 种卡牌）`, colWidths[i]);
          if (col.key === 'qty') return padRightDisplay(String(totalQty), colWidths[i]);
          if (col.key === 'jhsSubtotal' && totalJhsCost > 0) return padRightDisplay(`¥${totalJhsCost.toFixed(2)}`, colWidths[i]);
          return padRightDisplay('', colWidths[i]);
        });
        lines.push(summaryCells.join(' | '));
      }
      return lines.join('\n');
    }

    if (format === 'tsv') {
      const lines = [];
      if (includeHeader) {
        lines.push(cols.map(c => c.label).join('\t'));
      }
      for (const row of dataRows) {
        lines.push(row.join('\t'));
      }
      if (includeHeader) {
        const summaryCells = cols.map(col => {
          if (col.key === 'name') return `总计 (${entries.length}种)`;
          if (col.key === 'qty') return String(totalQty);
          if (col.key === 'jhsSubtotal' && totalJhsCost > 0) return `¥${totalJhsCost.toFixed(2)}`;
          return '';
        });
        lines.push(summaryCells.join('\t'));
      }
      return lines.join('\n');
    }

    if (format === 'markdown') {
      const lines = [];
      lines.push('| ' + cols.map(c => c.label).join(' | ') + ' |');
      lines.push('| ' + cols.map(c => (c.key === 'qty' || c.key === 'cost' || c.key === 'might' ? ':---:' : ':---')).join(' | ') + ' |');
      for (const row of dataRows) {
        lines.push('| ' + row.join(' | ') + ' |');
      }
      if (includeHeader) {
        const summaryCells = cols.map(col => {
          if (col.key === 'name') return `**总计（${entries.length} 种）**`;
          if (col.key === 'qty') return `**${totalQty}**`;
          if (col.key === 'jhsSubtotal' && totalJhsCost > 0) return `**¥${totalJhsCost.toFixed(2)}**`;
          return '-';
        });
        lines.push('| ' + summaryCells.join(' | ') + ' |');
      }
      return lines.join('\n');
    }

    // simple 极简购卡列表（带所选附加属性标签）
    const extraCols = cols.filter(c => c.key !== 'name' && c.key !== 'qty');
    const lines = entries.map(entry => {
      const extraStr = extraCols.length > 0
        ? ` [${extraCols.map(c => c.getValue(entry)).join(' · ')}]`
        : '';
      return `${entry.card.name}${extraStr} x${entry.qty}`;
    });
    if (includeHeader) {
      lines.push(`\n总计：${entries.length} 种卡牌，共 ${totalQty} 张${totalJhsCost > 0 ? ` · 集换社估价合计 ¥${totalJhsCost.toFixed(2)}` : ''}`);
    }
    return lines.join('\n');
  }

  function renderTextExportContent() {
    const entries = getFilteredExportEntries();
    const cols = getSelectedExportColumns();
    const format = document.getElementById('textFormatSelect')?.value;
    const needsJhsData =
      format === 'jhs_wishlist' ||
      cols.some(c => c.key.startsWith('jhs'));

    if (needsJhsData && entries.some(({ card }) => !jhsVersionsCache.has(card.id)) && !jhsState.isFetchingCartPrices) {
      ensureCartJhsPricesLoaded(false).then(() => {
        if (document.getElementById('textExportModal')?.classList.contains('open')) {
          renderTextExportContent();
        }
      });
    }

    const totalQty = entries.reduce((s, e) => s + e.qty, 0);

    // 更新状态统计文字
    const statsEl = document.getElementById('exportFilterStatsText');
    if (statsEl) {
      statsEl.innerHTML = `当前筛选匹配：<strong style="color:var(--gold-light);">${entries.length}</strong> 种卡牌，共 <strong style="color:var(--gold-light);">${totalQty}</strong> 张`;
    }

    // 渲染左侧交互式 HTML 预览表格
    const thead = document.getElementById('exportPreviewThead');
    const tbody = document.getElementById('exportPreviewTbody');
    if (thead && tbody) {
      thead.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>`;
      if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:36px 12px;color:var(--text-secondary);">暂无符合当前筛选条件的卡牌</td></tr>`;
      } else {
        tbody.innerHTML = entries.map(entry => `
          <tr data-hover-card="${entry.card.id}" style="cursor:pointer;" data-action="detail" data-id="${entry.card.id}">
            ${cols.map(c => {
              const val = escapeHtml(c.getValue(entry));
              if (c.key === 'name') return `<td style="font-weight:700;color:var(--text-main);">${val}</td>`;
              if (c.key === 'qty') return `<td style="font-weight:800;color:var(--gold-light);">×${val}</td>`;
              if (c.key === 'jhsPrice' || c.key === 'jhsSubtotal') return `<td style="font-weight:700;color:#fdba74;">${val}</td>`;
              return `<td>${val}</td>`;
            }).join('')}
          </tr>
        `).join('');
      }
    }

    // 渲染右侧纯文本输出框
    document.getElementById('textExportOutput').value = buildTextTableString();
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 标准 CSV 行解析器（支持双引号包裹与转义双引号）
  function parseCsvRow(line, delimiter = ',') {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  function findCardByNameOrId(idStr, nameStr) {
    if (idStr) {
      const idMatch = String(idStr).match(/\b([A-Z]{3}-[A-Z0-9]+)\b/i);
      if (idMatch && cardById.has(idMatch[1].toUpperCase())) {
        return cardById.get(idMatch[1].toUpperCase());
      }
      const jhsMatch = String(idStr).match(/\b([A-Z]{3})\s*[·\-]\s*(\d{3})\b/i);
      if (jhsMatch) {
        const stdCode = `${jhsMatch[1].toUpperCase()}-${jhsMatch[2]}`;
        if (cardById.has(stdCode)) return cardById.get(stdCode);
      }
    }
    if (nameStr) {
      const rawName = String(nameStr).trim();
      const idInName = rawName.match(/\b([A-Z]{3}-[A-Z0-9]+)\b/i);
      if (idInName && cardById.has(idInName[1].toUpperCase())) {
        return cardById.get(idInName[1].toUpperCase());
      }
      const jhsInName = rawName.match(/\b([A-Z]{3})\s*[·\-]\s*(\d{3})\b/i);
      if (jhsInName) {
        const stdCode = `${jhsInName[1].toUpperCase()}-${jhsInName[2]}`;
        if (cardById.has(stdCode)) return cardById.get(stdCode);
      }
      const cleaned = rawName
        .replace(/\([A-Z]{3}-[A-Z0-9]+\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .trim();
      if (!cleaned) return null;
      return (
        ALL_CARDS.find(c => c.name === cleaned || c.enName.toLowerCase() === cleaned.toLowerCase()) ||
        ALL_CARDS.find(c => c.name.includes(cleaned) || c.enName.toLowerCase().includes(cleaned.toLowerCase())) ||
        null
      );
    }
    return null;
  }

  // 批量导入文本与 CSV 解析（兼容多列 CSV、TSV、Markdown 表格、集换社心愿单分享链接与极简行文本）
  function handleImportText(customRawText) {
    const raw = (typeof customRawText === 'string' ? customRawText : document.getElementById('importTextarea').value).trim();
    if (!raw) {
      showToast('请先拖入 CSV 文件或粘贴要导入的卡牌文本');
      return;
    }
    const replace = document.getElementById('importReplaceCheck').checked;

    // 若粘贴的是集换社心愿单分享链接，直接调用集换社心愿单导入接口
    if (/wishCards\?wishListId=|wish_list_id=\d+/i.test(raw)) {
      importFromJhsWishUrl(raw, replace).then(ok => {
        if (ok) document.getElementById('importModal').classList.remove('open');
      });
      return;
    }

    if (replace) state.cart.clear();

    const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let matchedKinds = 0;
    let matchedTotalQty = 0;

    // 检测第一行是否为结构化表头（CSV / TSV / 竖线表格）
    let headerCols = null;
    let delimiter = ',';
    const firstLine = lines[0] || '';
    if (firstLine.includes('卡牌名称') || firstLine.includes('数量') || /^"?(?:name|card|id|卡牌)/i.test(firstLine)) {
      if (firstLine.includes('\t')) delimiter = '\t';
      else if (firstLine.includes('|')) delimiter = '|';
      else delimiter = ',';

      const parsedHeader = parseCsvRow(firstLine.replace(/^\|+|\|+$/g, ''), delimiter);
      const nameIdx = parsedHeader.findIndex(h => /卡牌名称|名称|卡名|name|card/i.test(h));
      const qtyIdx = parsedHeader.findIndex(h => /数量|张数|qty|quantity|count/i.test(h));
      const idIdx = parsedHeader.findIndex(h => /卡牌编号|编号|id|code/i.test(h));

      if (nameIdx !== -1 || idIdx !== -1) {
        headerCols = { nameIdx, qtyIdx, idIdx, delimiter };
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const s = lines[i];
      if (!s || s.startsWith('---') || s.startsWith('| :---') || s.startsWith('总计') || s.startsWith('"总计') || s.includes('**总计')) {
        continue;
      }

      // 如果有结构化表头，跳过第 0 行表头并按列索引精准读取
      if (headerCols) {
        if (i === 0) continue;
        const rowCells = parseCsvRow(s.replace(/^\|+|\|+$/g, ''), headerCols.delimiter);
        const firstCell = rowCells[0] || '';
        if (firstCell.startsWith('总计') || firstCell.startsWith('---') || firstCell.includes('**总计')) continue;

        const nameVal = headerCols.nameIdx !== -1 ? rowCells[headerCols.nameIdx] : '';
        const idVal = headerCols.idIdx !== -1 ? rowCells[headerCols.idIdx] : '';
        const qtyRaw = headerCols.qtyIdx !== -1 ? rowCells[headerCols.qtyIdx] : '1';
        const qtyNum = parseInt(String(qtyRaw).replace(/[^0-9]/g, ''), 10);
        const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;

        const card = findCardByNameOrId(idVal, nameVal);
        if (card) {
          state.cart.set(card.id, (state.cart.get(card.id) || 0) + qty);
          matchedKinds++;
          matchedTotalQty += qty;
        }
        continue;
      }

      // 若是无表头的逗号分隔 CSV 行 (如 "蔚，铲除者",3 或 ARC-001,2)
      if (s.includes(',') && !s.includes('，')) {
        const cells = parseCsvRow(s, ',');
        if (cells.length >= 2) {
          const c0 = cells[0];
          const c1 = cells[1];
          const q1 = parseInt(c1.replace(/[^0-9]/g, ''), 10);
          const card = findCardByNameOrId(c0, c0);
          if (card && Number.isFinite(q1) && q1 > 0) {
            state.cart.set(card.id, (state.cart.get(card.id) || 0) + q1);
            matchedKinds++;
            matchedTotalQty += q1;
            continue;
          }
        }
      }

      // 通用自由行解析（支持 `蔚，铲除者 x3`、`3 顺劈`、`ARC-001 2`、竖线表格行等）
      if (s.includes('卡牌名称') && s.includes('数量')) continue;

      const idMatch = s.match(/\b([A-Z]{3}-[A-Z0-9]+)\b/i);
      let qty = 1;
      const qtyEndMatch = s.match(/(?:[x×*|\t,]\s*|\s+)(\d+)\s*\|?$/i);
      const qtyStartMatch = s.match(/^(\d+)\s*[x×*]?\s+(.+)$/i);

      if (qtyEndMatch) {
        qty = parseInt(qtyEndMatch[1], 10);
      } else if (qtyStartMatch) {
        qty = parseInt(qtyStartMatch[1], 10);
      }

      if (idMatch && cardById.has(idMatch[1].toUpperCase())) {
        const cid = idMatch[1].toUpperCase();
        state.cart.set(cid, (state.cart.get(cid) || 0) + qty);
        matchedKinds++;
        matchedTotalQty += qty;
        continue;
      }

      const cleanedName = s
        .replace(/^\|+|\|+$/g, '')
        .replace(/(?:[x×*|\t,]\s*|\s+)\d+\s*$/i, '')
        .replace(/^\d+\s*[x×*]?\s+/i, '')
        .trim();

      const found = findCardByNameOrId(null, cleanedName);
      if (found) {
        state.cart.set(found.id, (state.cart.get(found.id) || 0) + qty);
        matchedKinds++;
        matchedTotalQty += qty;
      }
    }

    if (matchedKinds === 0) {
      showToast('⚠️ 未能从内容中识别出有效卡牌，请检查格式');
      return;
    }

    saveCartToStorage();
    updateCartUI();
    refreshCatalog(false);
    document.getElementById('importModal').classList.remove('open');
    showToast(`✅ 导入成功！共匹配 ${matchedKinds} 条记录（合计 ${matchedTotalQty} 张卡牌）`);
  }

  // 读取拖入或选择的 CSV / TXT 文件（自动兼容 UTF-8 与 Excel GBK 中文编码）
  function processImportedFile(file, forceImmediateImport = false) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const buffer = e.target.result;
      let text = '';
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        text = utf8Decoder.decode(buffer);
      } catch (err) {
        // 回退到 GB18030 / GBK 解码（兼容 Windows Excel 保存的 ANSI/GBK CSV）
        const gbkDecoder = new TextDecoder('gb18030');
        text = gbkDecoder.decode(buffer);
      }

      const textarea = document.getElementById('importTextarea');
      if (textarea) textarea.value = text;

      const autoApply = document.getElementById('importAutoApplyCheck')?.checked;
      if (forceImmediateImport || autoApply) {
        handleImportText(text);
      } else {
        showToast(`📂 已读取文件「${file.name}」，请点击「确认导入到购物车」`);
      }
    };
    reader.onerror = () => {
      showToast('❌ 读取文件失败，请重试');
    };
    reader.readAsArrayBuffer(file);
  }

  // =========================================================================
  // 核心交付 3：集换社 (Jihuanshe) App 深度联动引擎
  // (实时最低价查询、全版本切换、一键新建心愿单、卖家店铺 1v1 齐卡扫描、心愿单链接导入)
  // =========================================================================
  const JHS_API_BASE = 'https://api.jihuanshe.com/api/market';
  const JHS_TOKEN_STORAGE_KEY = 'riftbound_jhs_token_v1';
  const JHS_PRICE_CACHE_STORAGE_KEY = 'riftbound_jhs_price_cache_v1';

  const jhsVersionsCache = new Map(); // card.id -> Array<JhsCardVersion>
  const jhsSelectedVersionMap = new Map(); // card.id -> number (card_version_id)

  const jhsState = {
    isFetchingCartPrices: false,
    activeTab: 'wishlist',
    token: '',
    userWishlists: []
  };

  function loadJhsCacheFromSession() {
    try {
      const savedToken = localStorage.getItem(JHS_TOKEN_STORAGE_KEY);
      if (savedToken) jhsState.token = savedToken.trim();

      const rawCache = sessionStorage.getItem(JHS_PRICE_CACHE_STORAGE_KEY);
      if (rawCache) {
        const parsed = JSON.parse(rawCache);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([cid, versions]) => {
            if (Array.isArray(versions) && versions.length > 0) {
              jhsVersionsCache.set(cid, versions);
            }
          });
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function saveJhsCacheToSession() {
    try {
      const obj = {};
      for (const [cid, versions] of jhsVersionsCache.entries()) {
        obj[cid] = versions;
      }
      sessionStorage.setItem(JHS_PRICE_CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      // ignore
    }
  }

  // 集换社版本优选策略：默认自动选取该编号下所有在售版本（含平卡/闪卡/异画/体验卡）中最低正数价格的版本
  function selectCheapestJhsVersion(versions, card) {
    if (!Array.isArray(versions) || versions.length === 0) return null;
    const withPositivePrice = versions
      .map(v => ({ v, price: parseFloat(v.min_price) }))
      .filter(item => Number.isFinite(item.price) && item.price > 0);

    if (withPositivePrice.length > 0) {
      withPositivePrice.sort((a, b) => a.price - b.price);
      return withPositivePrice[0].v;
    }
    return versions[0];
  }

  function getSelectedJhsVersion(card) {
    if (!card) return null;
    const versions = jhsVersionsCache.get(card.id);
    if (!versions || versions.length === 0) return null;

    const customVerId = jhsSelectedVersionMap.get(card.id);
    if (customVerId) {
      const found = versions.find(v => Number(v.id) === Number(customVerId));
      if (found) return found;
    }
    const cheapest = selectCheapestJhsVersion(versions, card);
    if (cheapest) {
      jhsSelectedVersionMap.set(card.id, Number(cheapest.id));
    }
    return cheapest;
  }

  // 规范化本地卡牌编号用于集换社检索（例如 OGN-001a -> OGN-001）
  function normalizeCardCodeForJhs(cardId) {
    return String(cardId || '')
      .trim()
      .replace(/^([A-Z]{3}-\d+)[a-zA-Z]*$/i, '$1')
      .toUpperCase();
  }

  async function fetchJhsVersionsForCard(card, forceRefresh = false) {
    if (!card) return [];
    if (!forceRefresh && jhsVersionsCache.has(card.id)) {
      return jhsVersionsCache.get(card.id);
    }

    const baseCode = normalizeCardCodeForJhs(card.id);
    const dotPrefix = baseCode.replace('-', '·');

    const queryKeyword = async kw => {
      const url = `${JHS_API_BASE}/search/match-product?keyword=${encodeURIComponent(kw)}&game_key=lol&game_sub_key=default&type=card_version&page=1`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) return [];
      const json = await resp.json();
      return Array.isArray(json?.data) ? json.data : [];
    };

    try {
      let list = await queryKeyword(baseCode);

      // 优先筛选编号前缀或中文卡名吻合的版本
      let filtered = list.filter(item => {
        const numStr = String(item.number || '').toUpperCase();
        const nameCn = String(item.name_cn || '').trim();
        return (
          numStr.startsWith(dotPrefix) ||
          numStr.startsWith(baseCode) ||
          nameCn === card.name ||
          nameCn.includes(card.name) ||
          card.name.includes(nameCn)
        );
      });

      // 若按编号未搜到（如特殊礼盒/秘宝编号），回退按中文卡名搜索
      if (filtered.length === 0 && card.name) {
        const byNameList = await queryKeyword(card.name);
        filtered = byNameList.filter(item => {
          const nameCn = String(item.name_cn || '').trim();
          return nameCn === card.name || nameCn.includes(card.name) || card.name.includes(nameCn);
        });
        if (filtered.length === 0) filtered = byNameList;
      }

      if (filtered.length > 0) {
        jhsVersionsCache.set(card.id, filtered);
        if (!jhsSelectedVersionMap.has(card.id)) {
          const cheapest = selectCheapestJhsVersion(filtered, card);
          if (cheapest) jhsSelectedVersionMap.set(card.id, Number(cheapest.id));
        }
        return filtered;
      }
    } catch (err) {
      // 网络异常时忽略
    }

    jhsVersionsCache.set(card.id, []);
    return [];
  }

  async function ensureCartJhsPricesLoaded(forceRefresh = false, onProgress = null) {
    const entries = getCartEntriesSorted();
    if (entries.length === 0) return;

    const targets = entries.filter(({ card }) => forceRefresh || !jhsVersionsCache.has(card.id));
    if (targets.length === 0) {
      if (onProgress) onProgress(entries.length, entries.length);
      return;
    }

    jhsState.isFetchingCartPrices = true;
    const statusEl = document.getElementById('jhsPriceFetchStatus');
    let completed = entries.length - targets.length;

    const updateProgressText = () => {
      if (statusEl) {
        statusEl.textContent = `⏳ 正在查询集换社实时底价 (${completed}/${entries.length})...`;
      }
      if (onProgress) onProgress(completed, entries.length);
    };
    updateProgressText();

    const concurrency = 4;
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
      while (idx < targets.length) {
        const current = targets[idx++];
        await fetchJhsVersionsForCard(current.card, forceRefresh);
        completed++;
        updateProgressText();
      }
    });

    await Promise.all(workers);
    jhsState.isFetchingCartPrices = false;
    saveJhsCacheToSession();

    if (statusEl) {
      statusEl.textContent = `✅ 已同步 ${entries.length} 种卡牌的集换社全版本最低底价`;
    }
  }

  function updateJhsTokenBadgeUI() {
    const badge = document.getElementById('jhsTokenStatusBadge');
    const input = document.getElementById('jhsTokenInput');
    if (input && jhsState.token && !input.value) {
      input.value = jhsState.token;
    }
    if (!badge) return;
    if (jhsState.token) {
      badge.textContent = '✅ 已配置集换社 Token';
      badge.style.background = 'rgba(34, 197, 94, 0.18)';
      badge.style.color = '#86efac';
      badge.style.border = '1px solid rgba(34, 197, 94, 0.45)';
    } else {
      badge.textContent = '未配置 Token（可免登录查价 / 导图 / 导文本）';
      badge.style.background = 'rgba(255, 255, 255, 0.08)';
      badge.style.color = 'var(--text-secondary)';
      badge.style.border = '1px solid var(--border-subtle)';
    }
  }

  async function fetchUserJhsWishlists() {
    const select = document.getElementById('jhsTargetWishlistSelect');
    if (!select) return;
    select.innerHTML = `<option value="new">➕ 新建独立心愿单（推荐）</option>`;
    if (!jhsState.token) return;

    try {
      const resp = await fetch(`${JHS_API_BASE}/wish-list?game_key=lol&game_sub_key=default&page=1`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${jhsState.token}`
        }
      });
      if (!resp.ok) return;
      const json = await resp.json();
      const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      jhsState.userWishlists = list;
      list.forEach(w => {
        const id = w.wish_list_id || w.id;
        const name = w.name || `心愿单 #${id}`;
        if (id) {
          const opt = document.createElement('option');
          opt.value = String(id);
          opt.textContent = `📂 追加至已有：${name} (#${id})`;
          select.appendChild(opt);
        }
      });
    } catch (e) {
      // ignore
    }
  }

  function renderJhsCartTable() {
    const entries = getCartEntriesSorted();
    const kindsEl = document.getElementById('jhsBannerKinds');
    const totalQtyEl = document.getElementById('jhsBannerTotalQty');
    const totalPriceEl = document.getElementById('jhsBannerTotalPrice');
    const tbody = document.getElementById('jhsCartTableTbody');

    const totalQty = entries.reduce((acc, e) => acc + e.qty, 0);
    let totalCost = 0;

    entries.forEach(({ card, qty }) => {
      const v = getSelectedJhsVersion(card);
      const p = parseFloat(v?.min_price);
      if (p > 0) totalCost += p * qty;
    });

    if (kindsEl) kindsEl.textContent = String(entries.length);
    if (totalQtyEl) totalQtyEl.textContent = String(totalQty);
    if (totalPriceEl) totalPriceEl.textContent = `¥${totalCost.toFixed(2)}`;

    if (!tbody) return;
    if (entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:36px 12px;color:var(--text-secondary);">
            购物车为空，请先在主界面选择卡牌加入购物车，或切换到「📥 心愿单链接导入」标签页导入
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = entries
      .map(({ card, qty }) => {
        const versions = jhsVersionsCache.get(card.id) || [];
        const selectedVer = getSelectedJhsVersion(card);
        const minP = parseFloat(selectedVer?.min_price);
        const priceStr = minP > 0 ? `¥${minP.toFixed(2)}` : jhsState.isFetchingCartPrices ? '查询中...' : '暂无报价';
        const subStr = minP > 0 ? `¥${(minP * qty).toFixed(2)}` : '-';

        const optionsHtml =
          versions.length > 0
            ? versions
                .map(v => {
                  const vp = parseFloat(v.min_price);
                  const vpText = vp > 0 ? `¥${vp.toFixed(2)}` : '暂无报价';
                  const isSel = selectedVer && Number(v.id) === Number(selectedVer.id);
                  return `<option value="${v.id}" ${isSel ? 'selected' : ''}>${escapeHtml(v.number || card.id)} [${escapeHtml(v.rarity || '平卡')}] · ${vpText}</option>`;
                })
                .join('')
            : `<option value="">${jhsState.isFetchingCartPrices ? '⏳ 正在检索集换社版本...' : `${card.id.replace('-', '·')} (未匹配到版本)`}</option>`;

        const deepLinkUrl = selectedVer?.id
          ? `jihuanshe://www.jihuanshe.com/app/cardDetail?gameKey=lol&gameSubKey=default&cardVersionId=${selectedVer.id}`
          : '';

        return `
          <tr data-hover-card="${card.id}">
            <td>
              <div style="font-weight:700;color:var(--text-main);cursor:pointer;" data-action="detail" data-id="${card.id}">${escapeHtml(card.name)}</div>
              <div style="font-size:11px;color:var(--text-muted);font-family:Consolas,monospace;">${card.id} · ${formatDomains(card.domains)}</div>
            </td>
            <td>
              <select class="select-ctrl jhs-version-select" data-card-id="${card.id}" style="width:100%;max-width:250px;font-size:12px;padding:4px 8px;">
                ${optionsHtml}
              </select>
            </td>
            <td style="text-align:center;font-weight:800;color:var(--gold-light);">×${qty}</td>
            <td style="text-align:right;font-weight:700;color:#fdba74;">${priceStr}</td>
            <td style="text-align:right;font-weight:800;color:#fb923c;">${subStr}</td>
            <td style="text-align:center;">
              ${
                deepLinkUrl
                  ? `<a class="btn btn-sm btn-jhs" href="${deepLinkUrl}" style="text-decoration:none;padding:4px 8px;font-size:11px;" title="在集换社 App 中直接打开该卡牌详情与在售列表">📱 跳App</a>`
                  : `<span style="font-size:11px;color:var(--text-muted);">-</span>`
              }
            </td>
          </tr>
        `;
      })
      .join('');
  }

  async function openJhsHubModal(defaultTab) {
    hideHoverPreview();
    if (defaultTab) {
      switchJhsHubTab(defaultTab);
    }
    updateJhsTokenBadgeUI();
    renderJhsCartTable();
    document.getElementById('jhsHubModal').classList.add('open');

    if (jhsState.token && jhsState.userWishlists.length === 0) {
      fetchUserJhsWishlists();
    }

    if (state.cart.size > 0) {
      await ensureCartJhsPricesLoaded(false, () => {
        renderJhsCartTable();
      });
      renderJhsCartTable();
    }
  }

  function switchJhsHubTab(tabName) {
    jhsState.activeTab = tabName;
    document.querySelectorAll('#jhsHubTabs .jhs-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.jhsTab === tabName);
    });
    const panes = {
      wishlist: document.getElementById('jhsTabWishlist'),
      shop: document.getElementById('jhsTabShop'),
      import: document.getElementById('jhsTabImport')
    };
    Object.entries(panes).forEach(([k, el]) => {
      if (el) el.style.display = k === tabName ? 'block' : 'none';
    });
  }

  // 一键在集换社云端创建心愿单并批量写入购物车卡牌
  async function createJhsWishlistFromCart() {
    const entries = getCartEntriesSorted();
    if (entries.length === 0) {
      showToast('⚠️ 购物车为空，请先添加要购买的卡牌');
      return;
    }

    const tokenInputVal = document.getElementById('jhsTokenInput')?.value.trim();
    if (tokenInputVal) {
      jhsState.token = tokenInputVal.replace(/^Bearer\s+/i, '').trim();
      localStorage.setItem(JHS_TOKEN_STORAGE_KEY, jhsState.token);
      updateJhsTokenBadgeUI();
    }

    if (!jhsState.token) {
      const authBox = document.getElementById('jhsAuthConfigBox');
      if (authBox) {
        authBox.style.display = 'block';
        authBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      showToast('🔑 请先在上方展开框内粘贴集换社 Token 或使用手机验证码登录；也可直接使用右侧免登录「AI 拍照识卡纯净图」');
      return;
    }

    const progressEl = document.getElementById('jhsCreateWishProgress');
    const createBtn = document.getElementById('jhsCreateWishlistBtn');
    const resultBox = document.getElementById('jhsCreatedWishResultBox');
    if (resultBox) resultBox.style.display = 'none';

    try {
      if (createBtn) createBtn.disabled = true;
      if (progressEl) progressEl.textContent = '⏳ Step 1/3：正在核对购物车卡牌的集换社版本 ID...';

      await ensureCartJhsPricesLoaded(false);
      renderJhsCartTable();

      const validItems = [];
      for (const entry of entries) {
        const ver = getSelectedJhsVersion(entry.card);
        if (ver && ver.id) {
          validItems.push({ card: entry.card, qty: entry.qty, ver });
        }
      }

      if (validItems.length === 0) {
        if (progressEl) progressEl.textContent = '❌ 未能匹配到集换社卡牌版本 ID，请检查网络连接';
        return;
      }

      const targetSelectVal = document.getElementById('jhsTargetWishlistSelect')?.value || 'new';
      const wishName = document.getElementById('jhsWishlistNameInput')?.value.trim() || `《符文战场》选购单_${new Date().toLocaleDateString('zh-CN')}`;
      const ignoreVersion = document.getElementById('jhsIgnoreVersionCheck')?.checked ? 1 : 0;

      let wishListId = targetSelectVal !== 'new' ? targetSelectVal : null;

      if (!wishListId) {
        if (progressEl) progressEl.textContent = `⏳ Step 2/3：正在集换社创建心愿单「${wishName}」...`;
        const createResp = await fetch(`${JHS_API_BASE}/wish-list?game_key=lol&game_sub_key=default`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${jhsState.token}`
          },
          body: JSON.stringify({
            name: wishName,
            game_key: 'lol',
            game_sub_key: 'default'
          })
        });

        const createJson = await createResp.json().catch(() => ({}));
        if (!createResp.ok || createJson.code === 401 || createJson.message?.includes('登录')) {
          throw new Error(createJson.message || createJson.msg || `创建心愿单失败 (HTTP ${createResp.status})，请检查 Token 是否有效`);
        }
        wishListId =
          createJson?.wish_list_id ||
          createJson?.data?.wish_list_id ||
          createJson?.id ||
          createJson?.data?.id;

        if (!wishListId) {
          throw new Error(createJson?.message || '未能获取到新创建的集换社 wish_list_id，请检查 Token 权限');
        }
      }

      // Step 3: 逐张写入卡牌到该心愿单
      let successCount = 0;
      for (let i = 0; i < validItems.length; i++) {
        const { card, qty, ver } = validItems[i];
        if (progressEl) {
          progressEl.textContent = `⏳ Step 3/3：正在写入卡牌 (${i + 1}/${validItems.length})：${card.name} ×${qty}...`;
        }
        try {
          const addResp = await fetch(`${JHS_API_BASE}/wishes/add?game_key=lol&game_sub_key=default`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${jhsState.token}`
            },
            body: JSON.stringify({
              card_version_id: Number(ver.id),
              wish_list_id: Number(wishListId),
              quantity: Number(qty),
              game_key: 'lol',
              game_sub_key: 'default',
              ignore_card_version: ignoreVersion
            })
          });
          if (addResp.ok) successCount++;
        } catch (e) {
          // 单张异常继续下一张
        }
      }

      if (progressEl) {
        progressEl.textContent = `🎉 同步完成！成功将 ${successCount}/${validItems.length} 种卡牌写入集换社心愿单 (#${wishListId})`;
      }

      const appDeepLink = `jihuanshe://www.jihuanshe.com/app/wishList?wishListId=${wishListId}&gameKey=lol&gameSubKey=default`;
      const webShareLink = `https://www.jihuanshe.com/app/wishCards?wishListId=${wishListId}&gameKey=lol&gameSubKey=default`;
      const qrImgUrl = `${JHS_API_BASE}/share/wish-list-qrcode?game_key=lol&game_sub_key=default&wish_list_id=${wishListId}&width=240`;

      const titleEl = document.getElementById('jhsCreatedWishTitle');
      const appLinkEl = document.getElementById('jhsOpenCreatedWishAppLink');
      const webLinkEl = document.getElementById('jhsOpenCreatedWishWebLink');
      const qrImgEl = document.getElementById('jhsCreatedWishQrImg');
      const copyUrlBtn = document.getElementById('jhsCopyCreatedWishUrlBtn');

      if (titleEl) titleEl.textContent = `✅ 心愿单「${wishName}」(#${wishListId}) 已同步 ${successCount} 种卡牌！`;
      if (appLinkEl) appLinkEl.href = appDeepLink;
      if (webLinkEl) webLinkEl.href = webShareLink;
      if (qrImgEl) qrImgEl.src = qrImgUrl;
      if (copyUrlBtn) {
        copyUrlBtn.onclick = async () => {
          await navigator.clipboard.writeText(webShareLink);
          showToast('📋 心愿单分享链接已复制到剪贴板！');
        };
      }
      if (resultBox) resultBox.style.display = 'block';
      showToast('🎉 集换社心愿单创建成功！可直接点击「在集换社 App 打开」去一键配单');
    } catch (err) {
      if (progressEl) progressEl.textContent = `❌ ${err.message || '同步失败'}`;
      showToast(`⚠️ ${err.message || '集换社心愿单创建失败'}`);
    } finally {
      if (createBtn) createBtn.disabled = false;
    }
  }

  // 解析集换社卖家店铺链接，并与当前购物车做 1v1 库存及价格比对
  async function scanJhsSellerStore() {
    const rawInput = document.getElementById('jhsSellerUrlInput')?.value.trim() || '';
    if (!rawInput) {
      showToast('请先粘贴集换社卖家店铺分享链接或卖家 userId');
      return;
    }

    const uidMatch =
      rawInput.match(/(?:userId|user_id|seller_user_id)=(\d+)/i) ||
      rawInput.match(/^\s*(\d{4,12})\s*$/);
    if (!uidMatch) {
      showToast('⚠️ 未能从输入内容中识别出卖家 userId，请粘贴集换社店铺分享链接（含 userId=...）或纯数字 ID');
      return;
    }

    const userId = uidMatch[1];
    const resultBox = document.getElementById('jhsShopMatchResultBox');
    if (resultBox) {
      resultBox.innerHTML = `<div style="text-align:center;padding:30px;color:#fdba74;">⏳ 正在扫描集换社卖家 (#${userId}) 的《符文战场》在售库存并与购物车进行 1v1 比对...</div>`;
    }

    try {
      await ensureCartJhsPricesLoaded(false);
      const shareUrl = `https://www.jihuanshe.com/app/sellCards?userId=${userId}&gameKey=lol&gameSubKey=default`;
      const apiUrl = `${JHS_API_BASE}/share/sell-list?user_id=${encodeURIComponent(userId)}&game_key=lol&game_sub_key=default&page=1&url=${encodeURIComponent(shareUrl)}`;

      const resp = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json.code === 404) {
        throw new Error(json.message || `读取卖家 (#${userId}) 在售列表失败`);
      }

      const sellerUser = json.seller || json.user || json.data?.user || {};
      const sellerName = sellerUser.username || sellerUser.name || json.username || `集换社卖家 #${userId}`;
      const rawProducts =
        Array.isArray(json.products) ? json.products :
        Array.isArray(json.data?.data) ? json.data.data :
        Array.isArray(json.data) ? json.data :
        Array.isArray(json.sell_cards) ? json.sell_cards : [];

      const entries = getCartEntriesSorted();
      if (entries.length === 0) {
        if (resultBox) {
          resultBox.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-secondary);">已读取卖家「${escapeHtml(sellerName)}」共 ${rawProducts.length} 件商品，但您的购物车当前为空，请先添加卡牌后再比对。</div>`;
        }
        return;
      }

      const matchedList = [];
      const missingList = [];
      let totalMatchedKinds = 0;
      let totalMatchedQty = 0;
      let totalCartQty = 0;
      let totalSellerCost = 0;

      entries.forEach(({ card, qty }) => {
        totalCartQty += qty;
        const selectedVer = getSelectedJhsVersion(card);
        const baseCode = normalizeCardCodeForJhs(card.id);
        const dotPrefix = baseCode.replace('-', '·');

        // 在卖家商品列表中查找匹配项
        const candidates = rawProducts.filter(p => {
          const pVerId = Number(p.card_version_id || p.id);
          const pNum = String(p.number || p.card_version_number || p.card_version?.number || '').toUpperCase();
          const pName = String(p.name_cn || p.card_name_cn || p.card_version?.name_cn || '').trim();
          return (
            (selectedVer && pVerId === Number(selectedVer.id)) ||
            (pNum && (pNum.startsWith(dotPrefix) || pNum.startsWith(baseCode))) ||
            (pName && pName === card.name)
          );
        });

        if (candidates.length > 0) {
          // 选该店最便宜的在售项
          candidates.sort((a, b) => (parseFloat(a.min_price ?? a.price) || 99999) - (parseFloat(b.min_price ?? b.price) || 99999));
          const best = candidates[0];
          const unitPrice = parseFloat(best.min_price ?? best.price) || 0;
          const stockQty = parseInt(best.quantity ?? best.count ?? best.stock ?? qty, 10) || qty;
          const fulfillQty = Math.min(qty, stockQty);
          totalMatchedKinds++;
          totalMatchedQty += fulfillQty;
          totalSellerCost += unitPrice * fulfillQty;
          matchedList.push({
            card,
            needQty: qty,
            stockQty,
            fulfillQty,
            unitPrice,
            sellerItem: best
          });
        } else {
          missingList.push({ card, needQty: qty, selectedVer });
        }
      });

      const appShopDeepLink = `jihuanshe://www.jihuanshe.com/app/sellCards?userId=${userId}&gameKey=lol&gameSubKey=default`;

      resultBox.innerHTML = `
        <div class="jhs-summary-banner" style="margin-bottom:12px;">
          <div>
            <div style="font-size:15px;font-weight:800;color:#fed7aa;">🏪 卖家：${escapeHtml(sellerName)} (ID: ${userId})</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
              当前返回在售商品条目：${rawProducts.length} 条 · 齐卡率：<strong style="color:#86efac;">${totalMatchedKinds}/${entries.length} 种 (${totalMatchedQty}/${totalCartQty} 张)</strong>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <div class="jhs-stat-box">
              <div class="val">¥${totalSellerCost.toFixed(2)}</div>
              <div class="lbl">该店可配齐部分合计</div>
            </div>
            <a class="btn btn-jhs" href="${appShopDeepLink}" style="text-decoration:none;">📱 在集换社 App 打开该店选购</a>
            <a class="btn btn-sm" href="${shareUrl}" target="_blank" rel="noopener" style="text-decoration:none;">🌐 网页查看店铺</a>
          </div>
        </div>

        <div class="export-table-preview-box" style="max-height:280px;">
          <table class="export-preview-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>卡牌名称</th>
                <th>需求数量</th>
                <th>该店库存</th>
                <th>该店单价</th>
                <th>集换社全网底价</th>
              </tr>
            </thead>
            <tbody>
              ${matchedList
                .map(({ card, needQty, stockQty, fulfillQty, unitPrice }) => {
                  const globalVer = getSelectedJhsVersion(card);
                  const globalMin = parseFloat(globalVer?.min_price);
                  return `
                    <tr>
                      <td><span style="color:#86efac;font-weight:700;">✅ 有货${fulfillQty < needQty ? ' (部分)' : ''}</span></td>
                      <td style="font-weight:700;">${escapeHtml(card.name)} <span style="color:var(--text-muted);font-size:11px;">(${card.id})</span></td>
                      <td>×${needQty}</td>
                      <td style="color:#86efac;font-weight:700;">${stockQty} 张</td>
                      <td style="color:#fdba74;font-weight:700;">¥${unitPrice.toFixed(2)}</td>
                      <td style="color:var(--text-secondary);">${globalMin > 0 ? `¥${globalMin.toFixed(2)}` : '-'}</td>
                    </tr>
                  `;
                })
                .join('')}
              ${missingList
                .map(({ card, needQty, selectedVer }) => {
                  const globalMin = parseFloat(selectedVer?.min_price);
                  return `
                    <tr style="opacity:0.65;">
                      <td><span style="color:#f87171;">❌ 缺货</span></td>
                      <td>${escapeHtml(card.name)} <span style="color:var(--text-muted);font-size:11px;">(${card.id})</span></td>
                      <td>×${needQty}</td>
                      <td>0</td>
                      <td>-</td>
                      <td>${globalMin > 0 ? `¥${globalMin.toFixed(2)}` : '-'}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      if (resultBox) {
        resultBox.innerHTML = `<div style="text-align:center;padding:24px;color:#f87171;">❌ ${escapeHtml(err.message || '店铺扫描失败')}</div>`;
      }
    }
  }

  // 从集换社心愿单分享链接 (wishCards?wishListId=...) 反向解析并导入到本工具购物车
  async function importFromJhsWishUrl(customInput, replaceMode = null) {
    const rawInput = (typeof customInput === 'string' ? customInput : document.getElementById('jhsImportWishUrlInput')?.value || '').trim();
    if (!rawInput) {
      showToast('请先粘贴集换社心愿单分享链接或心愿单 ID');
      return false;
    }

    const idMatch =
      rawInput.match(/(?:wishListId|wish_list_id)=(\d+)/i) ||
      rawInput.match(/^\s*(\d{4,12})\s*$/);
    if (!idMatch) {
      showToast('⚠️ 未能识别出集换社 wishListId，请粘贴包含 wishListId=... 的分享链接或纯数字 ID');
      return false;
    }

    const wishListId = idMatch[1];
    const shouldReplace = replaceMode !== null ? replaceMode : Boolean(document.getElementById('jhsImportReplaceCheck')?.checked);
    const statusBox = document.getElementById('jhsImportWishStatusBox');
    if (statusBox) {
      statusBox.textContent = `⏳ 正在从集换社读取心愿单 (#${wishListId}) 卡牌列表...`;
    }

    try {
      const shareUrl = `https://www.jihuanshe.com/app/wishCards?wishListId=${wishListId}&gameKey=lol&gameSubKey=default`;
      const apiUrl = `${JHS_API_BASE}/share/wish-list?wish_list_id=${encodeURIComponent(wishListId)}&game_key=lol&game_sub_key=default&page=1&url=${encodeURIComponent(shareUrl)}`;

      const resp = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json.message || `读取集换社心愿单 (#${wishListId}) 失败`);
      }

      const wishes =
        Array.isArray(json.wishes) ? json.wishes :
        Array.isArray(json.data?.wishes) ? json.data.wishes :
        Array.isArray(json.data?.data) ? json.data.data :
        Array.isArray(json.data) ? json.data : [];

      if (wishes.length === 0) {
        throw new Error(`心愿单 (#${wishListId}) 为空或未包含《符文战场》卡牌`);
      }

      if (shouldReplace) state.cart.clear();

      let matchedKinds = 0;
      let matchedTotalQty = 0;

      wishes.forEach(w => {
        const numStr = w.number || w.card_version_number || w.card_version?.number || '';
        const nameCn = w.name_cn || w.card_name_cn || w.card_version?.name_cn || '';
        const qty = parseInt(w.quantity ?? w.count ?? 1, 10) || 1;
        const verId = w.card_version_id || w.card_version?.id;

        const card = findCardByNameOrId(numStr, nameCn);
        if (card) {
          state.cart.set(card.id, (state.cart.get(card.id) || 0) + qty);
          if (verId) jhsSelectedVersionMap.set(card.id, Number(verId));
          matchedKinds++;
          matchedTotalQty += qty;
        }
      });

      if (matchedKinds === 0) {
        throw new Error(`未能将心愿单 (#${wishListId}) 中的卡牌匹配到《符文战场》卡库`);
      }

      saveCartToStorage();
      updateCartUI();
      refreshCatalog(false);
      renderJhsCartTable();

      if (statusBox) {
        statusBox.innerHTML = `<span style="color:#86efac;font-weight:700;">✅ 导入成功！已从集换社心愿单 (#${wishListId}) 导入 ${matchedKinds} 种卡牌（共 ${matchedTotalQty} 张）</span>`;
      }
      showToast(`🎉 已从集换社心愿单 (#${wishListId}) 导入 ${matchedKinds} 种 / ${matchedTotalQty} 张卡牌！`);
      return true;
    } catch (err) {
      if (statusBox) {
        statusBox.innerHTML = `<span style="color:#f87171;">❌ ${escapeHtml(err.message || '心愿单导入失败')}</span>`;
      }
      showToast(`⚠️ ${err.message || '心愿单导入失败'}`);
      return false;
    }
  }

  // 初始化下拉选项与事件绑定
  function init() {
    loadCartFromStorage();
    loadJhsCacheFromSession();

    // 初始化系列下拉框（主工具栏 + 导出弹窗工具栏）
    const setSelect = document.getElementById('setSelect');
    const exportSetSelect = document.getElementById('exportSetSelect');
    const allSets = [...new Set(ALL_CARDS.map(c => c.set).filter(Boolean))];
    for (const s of allSets) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = formatSet(s);
      setSelect.appendChild(opt);
      if (exportSetSelect) {
        exportSetSelect.appendChild(opt.cloneNode(true));
      }
    }

    // 搜索框输入
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    searchInput.addEventListener('input', () => {
      state.query = searchInput.value;
      clearSearchBtn.style.display = state.query ? 'inline-block' : 'none';
      refreshCatalog(true);
    });
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.query = '';
      clearSearchBtn.style.display = 'none';
      refreshCatalog(true);
    });

    // 领域多选芯片
    document.getElementById('domainFilterGroup').addEventListener('click', e => {
      const btn = e.target.closest('.domain-btn');
      if (!btn) return;
      const dom = btn.dataset.domain;
      if (state.domains.has(dom)) {
        state.domains.delete(dom);
        btn.classList.remove('active');
      } else {
        state.domains.add(dom);
        btn.classList.add('active');
      }
      refreshCatalog(true);
    });

    // 下拉筛选器
    const bindSelect = (id, key) => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => {
        state[key] = el.value;
        el.classList.toggle('active-filter', el.value !== '');
        refreshCatalog(true);
      });
    };
    bindSelect('typeSelect', 'type');
    bindSelect('setSelect', 'set');
    bindSelect('costSelect', 'cost');
    bindSelect('raritySelect', 'rarity');

    // 胶囊开关
    const bindToggle = (id, key) => {
      const el = document.getElementById(id);
      el.addEventListener('click', () => {
        state[key] = !state[key];
        el.classList.toggle('active', state[key]);
        refreshCatalog(true);
      });
    };
    bindToggle('toggleAltArtBtn', 'includeAltArt');
    bindToggle('toggleTokensBtn', 'includeTokens');
    bindToggle('toggleOnlyCartBtn', 'onlyInCart');

    // 重置筛选
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      state.query = '';
      state.domains.clear();
      state.type = '';
      state.set = '';
      state.cost = '';
      state.rarity = '';
      state.includeAltArt = false;
      state.includeTokens = false;
      state.onlyInCart = false;

      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      document.querySelectorAll('#domainFilterGroup .domain-btn.active').forEach(b => b.classList.remove('active'));
      ['typeSelect', 'setSelect', 'costSelect', 'raritySelect'].forEach(id => {
        const el = document.getElementById(id);
        el.value = '';
        el.classList.remove('active-filter');
      });
      ['toggleAltArtBtn', 'toggleTokensBtn', 'toggleOnlyCartBtn'].forEach(id => {
        document.getElementById(id).classList.remove('active');
      });
      refreshCatalog(true);
    });

    // 排序与尺寸
    document.getElementById('sortBySelect').addEventListener('change', e => {
      state.sortBy = e.target.value;
      refreshCatalog(true);
    });
    const sortDirBtn = document.getElementById('sortDirBtn');
    sortDirBtn.addEventListener('click', () => {
      state.sortAsc = !state.sortAsc;
      sortDirBtn.textContent = state.sortAsc ? '↑ 升序' : '↓ 降序';
      refreshCatalog(true);
    });

    const sizeMap = { 1: '145px', 2: '172px', 3: '205px', 4: '245px', 5: '295px' };
    document.getElementById('cardSizeSlider').addEventListener('input', e => {
      const val = e.target.value;
      document.documentElement.style.setProperty('--card-col-min', sizeMap[val] || '205px');
    });

    const viewModeBtn = document.getElementById('viewModeBtn');
    viewModeBtn.addEventListener('click', () => {
      state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
      viewModeBtn.textContent = state.viewMode === 'grid' ? '📑 列表视图' : '🖼️ 卡图视图';
      viewModeBtn.classList.toggle('active', state.viewMode === 'list');
      refreshCatalog(false);
    });

    // 点击卡图行为单选
    document.querySelectorAll('input[name="cardClickMode"]').forEach(radio => {
      radio.addEventListener('change', e => {
        state.clickMode = e.target.value;
      });
    });

    // 加载更多与滚动到底部自动加载
    document.getElementById('loadMoreBtn').addEventListener('click', () => {
      state.visibleLimit += 60;
      refreshCatalog(false);
    });
    window.addEventListener('scroll', () => {
      if (state.visibleLimit >= state.filteredCards.length) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 450) {
        state.visibleLimit += 60;
        refreshCatalog(false);
      }
    });

    // 全局事件委托：点击加减数量、点击卡图、打开详情
    document.addEventListener('click', e => {
      const closeModalBtn = e.target.closest('[data-close-modal]');
      if (closeModalBtn) {
        document.getElementById(closeModalBtn.dataset.closeModal).classList.remove('open');
        return;
      }

      if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.remove('open');
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        if (action === 'inc') {
          changeCardQuantity(id, 1);
          if (document.getElementById('cardDetailModal').classList.contains('open')) {
            const wrap = document.getElementById('detailModalStepperWrap');
            if (wrap) wrap.innerHTML = buildCardControlsHTML(id, state.cart.get(id) || 0);
          }
        } else if (action === 'dec') {
          changeCardQuantity(id, -1);
          if (document.getElementById('cardDetailModal').classList.contains('open')) {
            const wrap = document.getElementById('detailModalStepperWrap');
            if (wrap) wrap.innerHTML = buildCardControlsHTML(id, state.cart.get(id) || 0);
          }
        } else if (action === 'set3') {
          setCardQuantity(id, 3);
          if (document.getElementById('cardDetailModal').classList.contains('open')) {
            const wrap = document.getElementById('detailModalStepperWrap');
            if (wrap) wrap.innerHTML = buildCardControlsHTML(id, state.cart.get(id) || 0);
          }
        } else if (action === 'remove') {
          setCardQuantity(id, 0);
        } else if (action === 'detail') {
          openCardDetailModal(id);
        }
        return;
      }

      const cardArtClick = e.target.closest('[data-card-click]');
      if (cardArtClick) {
        const id = cardArtClick.dataset.cardClick;
        if (state.clickMode === 'add') {
          changeCardQuantity(id, 1);
        } else {
          openCardDetailModal(id);
        }
      }
    });

    // 右键点击卡图直接减少 1 张
    document.addEventListener('contextmenu', e => {
      const cardArtClick = e.target.closest('[data-card-click]');
      if (cardArtClick && state.clickMode === 'add') {
        e.preventDefault();
        const id = cardArtClick.dataset.cardClick;
        changeCardQuantity(id, -1);
      }
    });

    // 数量输入框直接修改
    document.addEventListener('change', e => {
      const input = e.target.closest('[data-action="input-qty"]');
      if (input) {
        setCardQuantity(input.dataset.id, input.value);
      }
    });

    // 全局鼠标悬停预览卡牌 (主网格 + 列表 + 购物车 + 预览看板弹窗 + 导出预览表格)
    document.addEventListener('mouseover', e => {
      const hoverTarget = e.target.closest('[data-hover-card]');
      if (hoverTarget) {
        showHoverPreview(hoverTarget.dataset.hoverCard, e.clientX, e.clientY);
      } else {
        hideHoverPreview();
      }
    });
    document.addEventListener('mousemove', e => {
      if (hoverTooltip.classList.contains('visible')) {
        positionHoverPreview(e.clientX, e.clientY);
      }
    });

    // 侧边栏与移动端抽屉/底部栏事件
    const cartSidebar = document.getElementById('cartSidebar');
    const cartBackdrop = document.getElementById('cartBackdrop');

    const setCartDrawerOpen = isOpen => {
      cartSidebar.classList.toggle('collapsed', !isOpen);
      if (cartBackdrop) {
        cartBackdrop.classList.toggle('active', isOpen && window.innerWidth <= 960);
      }
    };

    const toggleCartDrawer = () => {
      const willOpen = cartSidebar.classList.contains('collapsed');
      setCartDrawerOpen(willOpen);
    };

    // 手机/平板竖屏初始加载时默认收起右侧购物车抽屉，避免遮挡主界面
    if (window.innerWidth <= 960) {
      setCartDrawerOpen(false);
    }

    document.getElementById('toggleCartSidebarBtn').addEventListener('click', toggleCartDrawer);
    document.getElementById('mobileCartBarBtn')?.addEventListener('click', toggleCartDrawer);
    document.getElementById('closeCartMobileBtn')?.addEventListener('click', () => setCartDrawerOpen(false));
    cartBackdrop?.addEventListener('click', () => setCartDrawerOpen(false));

    // 移动端顶部「筛选」折叠开关
    const mobileFilterToggleBtn = document.getElementById('mobileFilterToggleBtn');
    const filterToolbar = document.getElementById('filterToolbar');
    if (mobileFilterToggleBtn && filterToolbar) {
      mobileFilterToggleBtn.addEventListener('click', () => {
        const opened = filterToolbar.classList.toggle('mobile-open');
        mobileFilterToggleBtn.classList.toggle('btn-gold', opened);
      });
    }

    document.getElementById('closeGeneratedImagePreviewBtn')?.addEventListener('click', () => {
      const box = document.getElementById('generatedImagePreviewBox');
      if (box) box.style.display = 'none';
    });

    document.getElementById('clearCartBtn').addEventListener('click', () => {
      if (state.cart.size === 0) return;
      if (confirm('确定要清空购物车中的所有已选卡牌吗？')) {
        state.cart.clear();
        saveCartToStorage();
        updateCartUI();
        refreshCatalog(false);
        showToast('🗑️ 已清空购物车');
      }
    });

    // 打开预览看板 & 截图导出弹窗
    const openPreviewBoard = () => {
      hideHoverPreview();
      if (window.innerWidth <= 960) setCartDrawerOpen(false);
      renderVisualPreviewBoard();
      document.getElementById('previewBoardModal').classList.add('open');
    };
    document.getElementById('openPreviewBoardBtn').addEventListener('click', openPreviewBoard);
    document.getElementById('cartOpenPreviewBtn').addEventListener('click', openPreviewBoard);
    document.getElementById('mobilePreviewBarBtn')?.addEventListener('click', openPreviewBoard);

    [
      'boardTitleInput',
      'boardGroupSelect',
      'boardColsSelect',
      'boardShowCaptionCheck',
      'boardShowJhsPriceCheck',
      'boardJhsAiCleanModeCheck',
      'boardFilterDomain',
      'boardFilterType',
      'boardFilterRarity'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', renderVisualPreviewBoard);
      el.addEventListener('change', renderVisualPreviewBoard);
    });

    document.getElementById('downloadScreenshotBtn').addEventListener('click', handleDownloadScreenshot);
    document.getElementById('topDownloadScreenshotBtn')?.addEventListener('click', handleDownloadScreenshot);
    document.getElementById('copyScreenshotBtn').addEventListener('click', handleCopyScreenshot);

    // 打开纯文本表格导出弹窗
    const openTextExport = () => {
      hideHoverPreview();
      if (window.innerWidth <= 960) setCartDrawerOpen(false);
      renderTextExportContent();
      document.getElementById('textExportModal').classList.add('open');
    };
    document.getElementById('openTextExportBtn').addEventListener('click', openTextExport);
    document.getElementById('cartOpenTextBtn').addEventListener('click', openTextExport);
    document.getElementById('mobileTextBarBtn')?.addEventListener('click', openTextExport);

    // 绑定导出文本表格的筛选器与字段勾选事件
    document.getElementById('exportDomainGroup').addEventListener('click', e => {
      const btn = e.target.closest('.domain-btn');
      if (!btn) return;
      const dom = btn.dataset.domain;
      if (exportFilterState.domains.has(dom)) {
        exportFilterState.domains.delete(dom);
        btn.classList.remove('active');
      } else {
        exportFilterState.domains.add(dom);
        btn.classList.add('active');
      }
      renderTextExportContent();
    });

    [
      'exportTypeSelect',
      'exportRaritySelect',
      'exportCostSelect',
      'exportSetSelect',
      'exportSortSelect',
      'textFormatSelect',
      'textIncludeHeaderCheck'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (id.startsWith('export') && id !== 'exportSortSelect') {
          el.classList.toggle('active-filter', el.value !== '');
        }
        renderTextExportContent();
      });
    });

    document.getElementById('exportResetFilterBtn').addEventListener('click', () => {
      exportFilterState.domains.clear();
      document.querySelectorAll('#exportDomainGroup .domain-btn.active').forEach(b => b.classList.remove('active'));
      ['exportTypeSelect', 'exportRaritySelect', 'exportCostSelect', 'exportSetSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.value = '';
          el.classList.remove('active-filter');
        }
      });
      document.getElementById('exportSortSelect').value = 'id';
      renderTextExportContent();
    });

    // 字段勾选胶囊联动
    const syncExportColPills = () => {
      document.querySelectorAll('.export-col-check').forEach(chk => {
        const pill = chk.closest('.export-col-pill');
        if (pill) pill.classList.toggle('active', chk.checked);
      });
      renderTextExportContent();
    };

    document.querySelectorAll('.export-col-check').forEach(chk => {
      chk.addEventListener('change', syncExportColPills);
    });

    document.getElementById('presetMinimalColsBtn').addEventListener('click', () => {
      document.querySelectorAll('.export-col-check').forEach(chk => { chk.checked = false; });
      syncExportColPills();
    });

    document.getElementById('presetStandardColsBtn').addEventListener('click', () => {
      const std = new Set(['domain', 'rarity', 'type']);
      document.querySelectorAll('.export-col-check').forEach(chk => {
        chk.checked = std.has(chk.value);
      });
      syncExportColPills();
    });

    document.getElementById('presetAllColsBtn').addEventListener('click', () => {
      document.querySelectorAll('.export-col-check').forEach(chk => { chk.checked = true; });
      syncExportColPills();
    });

    document.getElementById('presetJhsColsBtn')?.addEventListener('click', () => {
      const jhsCols = new Set(['jhsNumber', 'jhsRarity', 'jhsPrice', 'jhsSubtotal']);
      document.querySelectorAll('.export-col-check').forEach(chk => {
        chk.checked = jhsCols.has(chk.value);
      });
      syncExportColPills();
    });

    document.getElementById('copyTextTableBtn').addEventListener('click', async () => {
      const txt = buildTextTableString();
      await navigator.clipboard.writeText(txt);
      showToast('📋 纯文本卡牌表格已复制到剪贴板！');
    });

    document.getElementById('cartQuickCopyBtn').addEventListener('click', async () => {
      if (state.cart.size === 0) {
        showToast('购物车为空，请先选择卡牌');
        return;
      }
      const txt = buildTextTableString();
      await navigator.clipboard.writeText(txt);
      showToast('⚡ 已一键复制卡牌表格到剪贴板！');
    });

    document.getElementById('downloadTxtBtn').addEventListener('click', () => {
      const txt = buildTextTableString();
      downloadBlob(txt, `符文战场_卡牌选购清单_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain;charset=utf-8');
      showToast('📄 TXT 纯文本表格已下载！');
    });

    document.getElementById('downloadCsvBtn').addEventListener('click', () => {
      const entries = getFilteredExportEntries();
      if (entries.length === 0) {
        showToast('当前筛选条件下没有可导出的卡牌');
        return;
      }
      const cols = getSelectedExportColumns();
      const csvRows = [cols.map(c => `"${c.label}"`).join(',')];
      let total = 0;
      for (const entry of entries) {
        total += entry.qty;
        const rowCells = cols.map(c => {
          const val = String(c.getValue(entry)).replace(/"/g, '""');
          return `"${val}"`;
        });
        csvRows.push(rowCells.join(','));
      }
      if (document.getElementById('textIncludeHeaderCheck').checked) {
        const sumCells = cols.map(c => {
          if (c.key === 'name') return `"总计 (${entries.length}种)"`;
          if (c.key === 'qty') return String(total);
          return '""';
        });
        csvRows.push(sumCells.join(','));
      }
      const bomCsv = '\uFEFF' + csvRows.join('\r\n');
      downloadBlob(bomCsv, `符文战场_卡牌选购表格_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
      showToast('📊 CSV (Excel) 表格已下载！');
    });

    // 批量导入、CSV 文件拖拽与语法帮助
    const openImportModal = () => {
      if (window.innerWidth <= 960) setCartDrawerOpen(false);
      document.getElementById('importModal').classList.add('open');
    };
    document.getElementById('openImportModalBtn').addEventListener('click', openImportModal);
    document.getElementById('mobileImportBarBtn')?.addEventListener('click', openImportModal);
    document.getElementById('confirmImportBtn').addEventListener('click', () => handleImportText());

    const csvDropZone = document.getElementById('csvDropZone');
    const csvFileInput = document.getElementById('csvFileInput');
    if (csvDropZone && csvFileInput) {
      csvDropZone.addEventListener('click', () => csvFileInput.click());
      csvFileInput.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) {
          processImportedFile(file, false);
          csvFileInput.value = '';
        }
      });

      csvDropZone.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        csvDropZone.classList.add('drag-over');
      });
      csvDropZone.addEventListener('dragleave', e => {
        e.preventDefault();
        e.stopPropagation();
        csvDropZone.classList.remove('drag-over');
      });
      csvDropZone.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        csvDropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) processImportedFile(file, false);
      });
    }

    // 全局页面直接拖拽 CSV / TXT 文件导入购物车（无需提前打开弹窗）
    const globalOverlay = document.getElementById('globalDropOverlay');
    let dragDepth = 0;
    window.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragDepth++;
      if (!document.getElementById('importModal').classList.contains('open')) {
        globalOverlay?.classList.add('active');
      }
    });
    window.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
    });
    window.addEventListener('dragleave', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        globalOverlay?.classList.remove('active');
      }
    });
    window.addEventListener('drop', e => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth = 0;
      globalOverlay?.classList.remove('active');
      const file = e.dataTransfer.files[0];
      if (file) {
        processImportedFile(file, true);
      }
    });

    document.getElementById('syntaxHelpBtn').addEventListener('click', () => {
      document.getElementById('syntaxModal').classList.add('open');
    });

    // 主题切换
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      if (cur === 'light') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    });

    // =====================================================================
    // 集换社 (Jihuanshe) App 深度联动中心事件绑定
    // =====================================================================
    const handleOpenJhsHub = () => {
      if (window.innerWidth <= 960) setCartDrawerOpen(false);
      openJhsHubModal();
    };
    document.getElementById('openJhsModalBtn')?.addEventListener('click', handleOpenJhsHub);
    document.getElementById('cartOpenJhsBtn')?.addEventListener('click', handleOpenJhsHub);
    document.getElementById('mobileJhsBarBtn')?.addEventListener('click', handleOpenJhsHub);

    document.getElementById('jhsHubTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.jhs-tab-btn');
      if (!btn || !btn.dataset.jhsTab) return;
      switchJhsHubTab(btn.dataset.jhsTab);
    });

    document.getElementById('jhsRefreshPricesBtn')?.addEventListener('click', async () => {
      if (state.cart.size === 0) {
        showToast('购物车为空，请先选择卡牌');
        return;
      }
      await ensureCartJhsPricesLoaded(true, () => {
        renderJhsCartTable();
      });
      renderJhsCartTable();
      showToast('🔄 已刷新集换社实时在售最低底价！');
    });

    // 表格内切换单张卡牌的集换社版本下拉框
    document.getElementById('jhsCartTableTbody')?.addEventListener('change', e => {
      const sel = e.target.closest('.jhs-version-select');
      if (!sel) return;
      const cid = sel.dataset.cardId;
      const verId = parseInt(sel.value, 10);
      if (cid && Number.isFinite(verId)) {
        jhsSelectedVersionMap.set(cid, verId);
        renderJhsCartTable();
      }
    });

    // 账号 Token 配置折叠与保存
    document.getElementById('jhsToggleAuthBoxBtn')?.addEventListener('click', () => {
      const box = document.getElementById('jhsAuthConfigBox');
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    });

    document.getElementById('jhsSaveTokenBtn')?.addEventListener('click', () => {
      const val = document.getElementById('jhsTokenInput')?.value.trim() || '';
      const cleanToken = val.replace(/^Bearer\s+/i, '').trim();
      if (!cleanToken) {
        showToast('请先粘贴有效的集换社 Bearer Token');
        return;
      }
      jhsState.token = cleanToken;
      localStorage.setItem(JHS_TOKEN_STORAGE_KEY, cleanToken);
      updateJhsTokenBadgeUI();
      fetchUserJhsWishlists();
      showToast('✅ 集换社 Token 已保存，现在可一键创建云端心愿单！');
    });

    document.getElementById('jhsClearTokenBtn')?.addEventListener('click', () => {
      jhsState.token = '';
      localStorage.removeItem(JHS_TOKEN_STORAGE_KEY);
      const input = document.getElementById('jhsTokenInput');
      if (input) input.value = '';
      updateJhsTokenBadgeUI();
      showToast('🗑️ 已清除保存的集换社 Token');
    });

    // 集换社手机验证码快捷登录获取 Token
    document.getElementById('jhsSendSmsBtn')?.addEventListener('click', async () => {
      const phone = document.getElementById('jhsPhoneInput')?.value.trim() || '';
      if (!/^1\d{10}$/.test(phone)) {
        showToast('请输入有效的 11 位中国大陆手机号');
        return;
      }
      try {
        const resp = await fetch(`${JHS_API_BASE}/auth/send-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ phone, area_code: '86', type: 'login' })
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(json.message || json.msg || '验证码发送失败，建议直接复制网页端 Token');
        }
        showToast('📲 验证码已发送，请查收短信');
      } catch (err) {
        showToast(`⚠️ ${err.message}`);
      }
    });

    document.getElementById('jhsSmsLoginBtn')?.addEventListener('click', async () => {
      const phone = document.getElementById('jhsPhoneInput')?.value.trim() || '';
      const code = document.getElementById('jhsSmsCodeInput')?.value.trim() || '';
      if (!phone || !code) {
        showToast('请填写手机号和短信验证码');
        return;
      }
      try {
        const resp = await fetch(`${JHS_API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ phone, area_code: '86', verify_code: code, code })
        });
        const json = await resp.json().catch(() => ({}));
        const token = json?.token || json?.access_token || json?.data?.token || json?.data?.access_token;
        if (!resp.ok || !token) {
          throw new Error(json.message || json.msg || '验证码登录失败，请检查验证码或直接粘贴 Token');
        }
        jhsState.token = token;
        localStorage.setItem(JHS_TOKEN_STORAGE_KEY, token);
        const input = document.getElementById('jhsTokenInput');
        if (input) input.value = token;
        updateJhsTokenBadgeUI();
        fetchUserJhsWishlists();
        showToast('🎉 登录成功！已自动获取并保存集换社 Token');
      } catch (err) {
        showToast(`⚠️ ${err.message}`);
      }
    });

    // 一键创建并同步心愿单按钮
    document.getElementById('jhsCreateWishlistBtn')?.addEventListener('click', createJhsWishlistFromCart);

    // 快捷跳转：生成集换社 AI 识卡无遮挡纯净图
    document.getElementById('jhsQuickAiBoardBtn')?.addEventListener('click', () => {
      document.getElementById('jhsHubModal').classList.remove('open');
      const aiChk = document.getElementById('boardJhsAiCleanModeCheck');
      if (aiChk) aiChk.checked = true;
      renderVisualPreviewBoard();
      document.getElementById('previewBoardModal').classList.add('open');
      showToast('🤖 已开启「集换社 AI 识卡纯净图」模式，点击上方「下载高清截图」即可保存相册识卡！');
    });

    // 快捷复制：集换社配单文本
    document.getElementById('jhsQuickCopyTextBtn')?.addEventListener('click', async () => {
      if (state.cart.size === 0) {
        showToast('购物车为空，请先选择卡牌');
        return;
      }
      await ensureCartJhsPricesLoaded(false);
      const formatSel = document.getElementById('textFormatSelect');
      const prevFormat = formatSel ? formatSel.value : 'aligned';
      if (formatSel) formatSel.value = 'jhs_wishlist';
      const txt = buildTextTableString();
      if (formatSel) formatSel.value = prevFormat;
      await navigator.clipboard.writeText(txt);
      showToast('📋 已复制集换社心愿单配卡与底价清单到剪贴板！');
    });

    // 卖家店铺 1v1 齐卡扫描与心愿单链接导入
    document.getElementById('jhsScanSellerBtn')?.addEventListener('click', scanJhsSellerStore);
    document.getElementById('jhsImportWishUrlBtn')?.addEventListener('click', () => importFromJhsWishUrl());

    // 初始渲染
    updateCartUI();
    refreshCatalog(true);
  }

  init();
})();

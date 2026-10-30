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

  // 状态管理（默认开启 includeAltArt，严格按卡牌编号区分不同卡牌与多版本符文）
  const state = {
    query: '',
    domains: new Set(),
    type: '',
    set: '',
    cost: '',
    rarity: '',
    includeAltArt: true,
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

    // 严格按卡牌编号 (card.id) 区分每一张卡牌，绝不按同名合并去重；
    // 仅当用户手动关闭「✨ 包含异画版本」且未筛选异画稀有度时，隐藏异画版本（仍保留所有不同编号的基础版本与各系列基础符文）
    if (!state.includeAltArt && !state.onlyInCart && state.rarity !== 'Showcase') {
      list = list.filter(card => !card.isAltArt || (state.cart.get(card.id) || 0) > 0);
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
      if (!state.includeAltArt) activeCount++;
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
          const baseMeta = card.type === 'Rune'
            ? `${formatSet(card.set).split(' ')[0]} · ${formatRarity(card.rarity)}`
            : ([costStr, mightStr].filter(Boolean).join(' · ') || formatType(card.type));
          const metaRight = card.type !== 'Rune' && card.isAltArt ? `${baseMeta} · 异画` : baseMeta;
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
                  crossorigin="anonymous"
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
            crossorigin="anonymous"
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
            <span style="font-family:monospace;color:var(--gold-light);font-weight:700;">${card.id}</span>
            <span>·</span>
            <span>${formatRarity(card.rarity)}</span>
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
            crossorigin="anonymous"
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
                        crossorigin="anonymous"
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

  function renderVisualPreviewBoard() {
    const container = document.getElementById('visualBoardContainer');
    const entries = getFilteredBoardEntries();
    const title = document.getElementById('boardTitleInput').value.trim() || '《符文战场》卡牌选购清单';
    const groupBy = document.getElementById('boardGroupSelect').value;
    const cols = parseInt(document.getElementById('boardColsSelect').value, 10) || 6;
    const showCaption = Boolean(document.getElementById('boardShowCaptionCheck')?.checked);
    const showJhsPrice = Boolean(document.getElementById('boardShowJhsPriceCheck')?.checked);

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
    const sections = getGroupedCartSections(groupBy, entries);
    const dateStr = new Date().toLocaleDateString('zh-CN');

    container.innerHTML = `
      <div class="board-banner">
        <div>
          <div class="board-banner-title">${escapeHtml(title)}</div>
          <div class="board-banner-sub">RiftAtlas《符文战场》选购预览看板 · 生成日期 ${dateStr} · 鼠标悬停卡牌可高清放大预览</div>
        </div>
        <div class="board-banner-stats">
          <div class="board-stat-pill"><strong>${totalQty}</strong>总张数</div>
          <div class="board-stat-pill"><strong>${entries.length}</strong>卡牌种类</div>
          ${showJhsPrice ? `<div class="board-stat-pill" style="border-color:rgba(249,115,22,0.55);"><strong style="color:#fdba74;">¥${totalJhsCost.toFixed(2)}</strong>集换社最低估价</div>` : ''}
        </div>
      </div>

      ${sections.map(sec => {
        return `
          <div class="board-group-section">
            ${groupBy !== 'none' ? `
              <div class="board-group-header">
                <span>◆ ${escapeHtml(sec.title)}</span>
                <span class="count">${sec.entries.reduce((s, e) => s + e.qty, 0)} 张 (${sec.entries.length} 种)</span>
              </div>
            ` : ''}
            <div class="board-cards-grid">
              ${sec.entries.map(({ card, qty }) => {
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
                    <span class="qty-badge">×${qty}</span>
                    ${showJhsPrice && jhsMinP > 0 ? `<span class="jhs-price-tag">¥${jhsMinP.toFixed(2)}</span>` : ''}
                  </div>
                  ${showCaption ? `
                    <div class="board-card-caption">
                      <div class="nm" title="${escapeHtml(card.name)}">${escapeHtml(card.name)}</div>
                      <div class="cid">${card.id}${showJhsPrice && jhsMinP > 0 ? ` · ¥${(jhsMinP * qty).toFixed(2)}` : ''}</div>
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
  // 核心防坑：
  // 1) assets.riftatlas-workers.com 对未知查询参数 (?cors=1) 或 OPTIONS 预检请求 (如 fetch 附带 Cache-Control) 均返回 403 Forbidden；
  // 2) 优先请求从未被无 CORS 缓存过的 card.imgOriginal (/zh-CN/original/*.webp)，并通过 createImageBitmap(blob) 直接解码为位图（或保留 ObjectURL），
  //    避免 URL.revokeObjectURL 过早释放导致 WebKit/Chromium 延迟解码 WebP 时绘出空白。
  const canvasImageCache = new Map();

  async function loadCardImageForCanvas(card) {
    if (!card) return null;
    if (canvasImageCache.has(card.id)) {
      return canvasImageCache.get(card.id);
    }

    const loadViaFetchBitmap = async url => {
      if (!url) return null;
      try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        if (!blob || blob.size === 0) return null;

        if (typeof window.createImageBitmap === 'function') {
          try {
            const bmp = await createImageBitmap(blob);
            if (bmp && bmp.width > 0 && bmp.height > 0) {
              return bmp;
            }
          } catch (bmpErr) {
            // 回退到 HTMLImageElement
          }
        }

        const objUrl = URL.createObjectURL(blob);
        return await new Promise(resolve => {
          const img = new Image();
          img.onload = async () => {
            try {
              if (typeof img.decode === 'function') {
                await img.decode();
              }
            } catch (e) {
              // ignore
            }
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            resolve(null);
          };
          img.src = objUrl;
        });
      } catch (err) {
        return null;
      }
    };

    const loadViaDirectImg = url => {
      if (!url) return Promise.resolve(null);
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 1;
            testCanvas.height = 1;
            const tCtx = testCanvas.getContext('2d');
            tCtx.drawImage(img, 0, 0, 1, 1);
            testCanvas.toDataURL('image/png');
            resolve(img);
          } catch (taintErr) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    };

    let loadedImg =
      (await loadViaFetchBitmap(card.imgOriginal)) ||
      (await loadViaFetchBitmap(card.imgFallbackOriginal)) ||
      (await loadViaFetchBitmap(card.imgSmall)) ||
      (await loadViaFetchBitmap(card.imgFallbackSmall)) ||
      (await loadViaDirectImg(card.imgOriginal)) ||
      (await loadViaDirectImg(card.imgFallbackOriginal)) ||
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
    const showCaption = Boolean(document.getElementById('boardShowCaptionCheck')?.checked);
    const showJhsPrice = Boolean(document.getElementById('boardShowJhsPriceCheck')?.checked);
    const sections = getGroupedCartSections(groupBy, entries);

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
    const groupTitleH = groupBy !== 'none' ? 38 : 0;
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
    ctx.fillText(`《符文战场》卡牌选购预览清单 · 导出日期 ${dateStr}`, padX, padY + 56);

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
      if (groupBy !== 'none') {
        const secQty = sec.entries.reduce((s, e) => s + e.qty, 0);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 16px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText(`◆ ${sec.title}（${secQty} 张 / ${sec.entries.length} 种）`, padX, curY + 22);
        curY += groupTitleH;
      }

      sec.entries.forEach(({ card, qty }, index) => {
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

        // 右上角数量角标 (×N)
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

        // 左下角集换社最低价标签
        if (showJhsPrice) {
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

        // 底部卡名与编号标签
        if (showCaption) {
          const capY = y + cardH;
          ctx.fillStyle = '#0f172a';
          drawRoundedRect(ctx, x, capY - 6, cardW, captionH + 6, 10);
          ctx.fill();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 12.5px "Microsoft YaHei", "PingFang SC", sans-serif';
          ctx.textAlign = 'center';
          let displayName = card.name;
          while (displayName.length > 1 && ctx.measureText(displayName).width > cardW - 14) {
            displayName = displayName.slice(0, -1);
          }
          if (displayName !== card.name) displayName += '…';
          ctx.fillText(displayName, x + cardW / 2, capY + 17);

          const jhsVer = showJhsPrice ? getSelectedJhsVersion(card) : null;
          const minP = parseFloat(jhsVer?.min_price);
          const subText = showJhsPrice && minP > 0 ? `${card.id} · ¥${(minP * qty).toFixed(2)}` : card.id;
          ctx.fillStyle = '#94a3b8';
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
      // 如果在集换社 App 内置浏览器中，支持直接调用原生保存图片接口
      if (typeof window.jhsapp?.saveShareImage === 'function') {
        try {
          window.jhsapp.saveShareImage(dataUrl);
        } catch (e) {
          // ignore
        }
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

  // 将集换社卡牌编号 (如 OGN·039a/298、OGN·299*/298、VEN·SP1/006·SC、UNL·R01b·P、VEN·R01b·P·SC) 精准映射为本地唯一编号 card.id
  function jhsNumberToLocalCardId(rawStr) {
    if (!rawStr) return '';
    const str = String(rawStr).trim();
    const directMatch = str.match(/\b([A-Z]{3}-[A-Z0-9]+)\b/i);
    if (directMatch && cardById.has(directMatch[1].toUpperCase())) {
      return directMatch[1].toUpperCase();
    }
    const jhsMatch = str.match(/\b([A-Z]{3})\s*[·\-]\s*([A-Z0-9]+)(\*)?/i);
    if (jhsMatch) {
      const setCode = jhsMatch[1].toUpperCase();
      const numPart = jhsMatch[2].toUpperCase();
      const starSuffix = jhsMatch[3] ? 'S' : '';
      const candidate = `${setCode}-${numPart}${starSuffix}`;
      if (cardById.has(candidate)) return candidate;
      if (cardById.has(`${candidate}P`)) return `${candidate}P`;
      const baseCandidate = `${setCode}-${numPart.replace(/[A-Z]+$/i, '')}`;
      if (cardById.has(baseCandidate)) return baseCandidate;
    }
    return '';
  }

  function findCardByNameOrId(idStr, nameStr) {
    if (idStr) {
      const mappedId = jhsNumberToLocalCardId(idStr);
      if (mappedId && cardById.has(mappedId)) {
        return cardById.get(mappedId);
      }
    }
    if (nameStr) {
      const rawName = String(nameStr).trim();
      const mappedInName = jhsNumberToLocalCardId(rawName);
      if (mappedInName && cardById.has(mappedInName)) {
        return cardById.get(mappedInName);
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

  // 集换社版本优选策略：优先严格匹配当前卡牌编号 (card.id，区分平卡/异画A/异画B/超编/签名/SP及不同系列同色符文)，再从中选最低正数价格版本
  function selectCheapestJhsVersion(versions, card) {
    if (!Array.isArray(versions) || versions.length === 0) return null;

    let pool = versions;
    if (card && card.id) {
      const exactMatches = versions.filter(v => jhsNumberToLocalCardId(v.number) === card.id);
      if (exactMatches.length > 0) {
        pool = exactMatches;
      }
    }

    const withPositivePrice = pool
      .map(v => ({ v, price: parseFloat(v.min_price) }))
      .filter(item => Number.isFinite(item.price) && item.price > 0);

    if (withPositivePrice.length > 0) {
      withPositivePrice.sort((a, b) => a.price - b.price);
      return withPositivePrice[0].v;
    }
    return pool[0];
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

  // 规范化本地卡牌编号用于集换社检索（例如 OGN-001a -> OGN-001, SFD-R01A -> SFD-R01, VEN-SP1 -> VEN-SP1）
  function normalizeCardCodeForJhs(cardId) {
    const raw = String(cardId || '').trim().toUpperCase();
    // 对 SP 编号保留完整前缀 (如 VEN-SP1, RAD-SP4)
    if (/^[A-Z]{3}-SP\d+$/i.test(raw)) return raw;
    return raw.replace(/^([A-Z]{3}-[A-Z]?\d+)[A-Z]*$/i, '$1');
  }

  async function fetchJhsVersionsForCard(card, forceRefresh = false) {
    if (!card) return [];
    if (!forceRefresh && jhsVersionsCache.has(card.id)) {
      return jhsVersionsCache.get(card.id);
    }

    const baseCode = normalizeCardCodeForJhs(card.id);
    const dotPrefix = baseCode.replace('-', '·');
    // 集换社对含字母编号（如 VEN·SP1、SFD·R01）要求使用中圆点「·」检索
    const primaryKeyword = /[A-Z]{3}-[A-Z]/i.test(baseCode) ? dotPrefix : baseCode;

    const queryKeyword = async kw => {
      const url = `${JHS_API_BASE}/search/match-product?keyword=${encodeURIComponent(kw)}&game_key=lol&game_sub_key=default&type=card_version&page=1`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) return [];
      const json = await resp.json();
      return Array.isArray(json?.data) ? json.data : [];
    };

    try {
      let list = await queryKeyword(primaryKeyword);

      // 优先筛选编号前缀或中文卡名吻合的版本
      let filtered = list.filter(item => {
        const numStr = String(item.number || '').toUpperCase();
        const nameCn = String(item.name_cn || '').trim();
        return (
          jhsNumberToLocalCardId(item.number) === card.id ||
          numStr.startsWith(dotPrefix) ||
          numStr.startsWith(baseCode) ||
          nameCn === card.name ||
          nameCn.includes(card.name) ||
          card.name.includes(nameCn)
        );
      });

      // 若按编号未搜到与当前 card.id 完全对应的版本，补充按中文卡名检索并合并去重
      const hasExactIdMatch = filtered.some(item => jhsNumberToLocalCardId(item.number) === card.id);
      if ((!hasExactIdMatch || filtered.length === 0) && card.name) {
        const byNameList = await queryKeyword(card.name);
        const nameMatched = byNameList.filter(item => {
          const nameCn = String(item.name_cn || '').trim();
          return (
            jhsNumberToLocalCardId(item.number) === card.id ||
            nameCn === card.name ||
            nameCn.includes(card.name) ||
            card.name.includes(nameCn)
          );
        });
        const mergedMap = new Map();
        [...filtered, ...(nameMatched.length > 0 ? nameMatched : byNameList)].forEach(item => {
          if (item && item.id) mergedMap.set(Number(item.id), item);
        });
        filtered = Array.from(mergedMap.values());
      }

      // 将与当前 card.id 编号完全一致的集换社版本排在最前面
      filtered.sort((a, b) => {
        const aExact = jhsNumberToLocalCardId(a.number) === card.id ? 0 : 1;
        const bExact = jhsNumberToLocalCardId(b.number) === card.id ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return (parseFloat(a.min_price) || 99999) - (parseFloat(b.min_price) || 99999);
      });

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
    const statusEl = document.getElementById('jhsMatchStatusText') || document.getElementById('jhsPriceFetchStatus');
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

  // 兼容移动端内置 WebView 的剪贴板复制工具函数
  async function copyTextSafe(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      // fallback below
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // =========================================================================
  // 多套购卡单本地存档管理 & 一键分享卡单链接
  // =========================================================================
  const CART_PRESETS_STORAGE_KEY = 'riftbound_saved_cart_presets_v1';

  function getSavedCartPresets() {
    try {
      const raw = localStorage.getItem(CART_PRESETS_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCartPresetsList(list) {
    try {
      localStorage.setItem(CART_PRESETS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // ignore
    }
  }

  function renderCartPresetsSelect(selectedId = '') {
    const sel = document.getElementById('cartSavedListsSelect');
    const delBtn = document.getElementById('deleteCartPresetBtn');
    if (!sel) return;
    const list = getSavedCartPresets();
    sel.innerHTML = `<option value="">📂 切换已存购卡单 (${list.length})</option>`;
    list.forEach(p => {
      const kinds = Array.isArray(p.items) ? p.items.length : 0;
      const totalQty = Array.isArray(p.items) ? p.items.reduce((s, it) => s + (Number(it[1]) || 0), 0) : 0;
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `📋 ${p.name} (${kinds}种/${totalQty}张)`;
      if (p.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
    if (delBtn) {
      delBtn.style.display = sel.value ? 'inline-flex' : 'none';
    }
  }

  function handleSaveCurrentCartPreset() {
    if (state.cart.size === 0) {
      showToast('⚠️ 购物车为空，请先选择卡牌后再保存方案');
      return;
    }
    const list = getSavedCartPresets();
    const sel = document.getElementById('cartSavedListsSelect');
    const currentPreset = list.find(p => p.id === sel?.value);
    const defaultName = currentPreset ? currentPreset.name : `符文卡单_${new Date().toLocaleDateString('zh-CN')}`;
    const nameInput = prompt('💾 请输入要保存的购卡单方案名称（同名将直接更新）：', defaultName);
    if (!nameInput || !nameInput.trim()) return;
    const cleanName = nameInput.trim();
    const items = [];
    state.cart.forEach((qty, id) => {
      if (qty > 0) items.push([id, qty]);
    });

    const existingIdx = list.findIndex(p => p.name === cleanName);
    let activeId = '';
    if (existingIdx >= 0) {
      list[existingIdx].items = items;
      list[existingIdx].updatedAt = Date.now();
      activeId = list[existingIdx].id;
    } else {
      activeId = `preset_${Date.now()}`;
      list.unshift({
        id: activeId,
        name: cleanName,
        updatedAt: Date.now(),
        items
      });
    }
    saveCartPresetsList(list);
    renderCartPresetsSelect(activeId);
    showToast(`💾 已保存购卡单方案「${cleanName}」（${items.length} 种卡牌）！`);
  }

  function handleLoadCartPreset(presetId) {
    const delBtn = document.getElementById('deleteCartPresetBtn');
    if (!presetId) {
      if (delBtn) delBtn.style.display = 'none';
      return;
    }
    const list = getSavedCartPresets();
    const target = list.find(p => p.id === presetId);
    if (!target || !Array.isArray(target.items)) return;

    state.cart.clear();
    target.items.forEach(([id, qty]) => {
      const cleanId = String(id || '').trim().toUpperCase();
      if (cardById.has(cleanId) && Number(qty) > 0) {
        state.cart.set(cleanId, Number(qty));
      }
    });
    saveCartToStorage();
    updateCartUI();
    refreshCatalog(false);
    if (delBtn) delBtn.style.display = 'inline-flex';
    const wishNameInput = document.getElementById('jhsNewWishListNameInput');
    if (wishNameInput && target.name) wishNameInput.value = target.name;
    showToast(`📂 已切换至购卡单「${target.name}」`);
  }

  function handleDeleteCartPreset() {
    const sel = document.getElementById('cartSavedListsSelect');
    const id = sel?.value;
    if (!id) return;
    const list = getSavedCartPresets();
    const target = list.find(p => p.id === id);
    if (!target) return;
    if (!confirm(`确定要删除已保存的购卡单存档「${target.name}」吗？`)) return;
    const next = list.filter(p => p.id !== id);
    saveCartPresetsList(next);
    renderCartPresetsSelect('');
    showToast(`🗑️ 已删除购卡单存档「${target.name}」`);
  }

  function isMobileEnvironment() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || window.innerWidth <= 860;
  }

  // 检测并自动从集换社 App 内置 WebView (window.jhsapp.getToken) 提取登录通行证（零抓包方案）
  function tryAutoExtractJhsAppToken() {
    try {
      let detectedToken = '';
      if (window.jhsapp && typeof window.jhsapp.getToken === 'function') {
        detectedToken = window.jhsapp.getToken() || '';
      } else if (window.clientBridge) {
        if (typeof window.clientBridge.getToken === 'function') {
          detectedToken = window.clientBridge.getToken() || '';
        } else if (typeof window.clientBridge.token === 'string') {
          detectedToken = window.clientBridge.token;
        }
      }

      const clean = String(detectedToken || '').replace(/^Bearer\s+/i, '').trim();
      if (clean && clean.length > 16) {
        const isNew = jhsState.token !== clean;
        jhsState.token = clean;
        jhsState.isInJhsApp = true;
        localStorage.setItem(JHS_TOKEN_STORAGE_KEY, clean);
        updateJhsTokenBadgeUI();
        if (isNew) {
          fetchUserJhsWishlists();
          showToast('🎉 已在集换社 App 内自动连接您的账号！');
        }
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  }

  // 构建带当前购物车参数的 H5 链接（支持纯分享模式 & 集换社自动建单模式）
  function buildSyncUrlWithCart(options = {}) {
    const { openJhs = true, autoCreate = true } = options;
    const baseUrl = window.location.protocol.startsWith('http')
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://asmber.github.io/riftbound-card-shop/';
    const params = new URLSearchParams();
    if (openJhs) params.set('ja', '1');
    if (openJhs && autoCreate) params.set('ac', '1');

    const wishName = document.getElementById('jhsNewWishListNameInput')?.value.trim();
    if (openJhs && wishName && wishName !== '符文战场选购单') {
      params.set('wn', wishName);
    }

    if (state.cart.size > 0) {
      const pairs = [];
      state.cart.forEach((qty, id) => {
        if (qty > 0) pairs.push(`${id}:${qty}`);
      });
      if (pairs.length > 0) {
        params.set('c', pairs.join(','));
      }
    }
    return `${baseUrl}?${params.toString()}`;
  }

  // 手机端一键唤起集换社 App 内置页并全自动创建心愿单
  async function launchJhsAppWithAutoCreate() {
    if (state.cart.size === 0) {
      showToast('⚠️ 购物车为空，请先选择要加入心愿单的卡牌');
      return;
    }
    const syncUrl = buildSyncUrlWithCart({ openJhs: true, autoCreate: true });
    await copyTextSafe(syncUrl);
    const schemeUrl = `jihuanshe://www.jihuanshe.com/app/customWebView?showNav=1&url=${encodeURIComponent(syncUrl)}`;
    showToast('🚀 正在唤起集换社 App 自动建单（已同步复制链接备用）...');
    window.location.href = schemeUrl;
  }

  // 从 URL 查询参数 (?c=OGN-001:3&ja=1&ac=1) 自动恢复购物车并在集换社 App 内自动触发建单
  function restoreCartFromUrlParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const cartParam = params.get('c') || params.get('cart');
      const jhsAuto = params.get('ja') || params.get('jhs_auto');
      const autoCreate = params.get('ac') || params.get('jhs_autocreate');
      const wishNameParam = params.get('wn') || params.get('wish_name');
      let restoredCount = 0;

      if (cartParam) {
        state.cart.clear();
        const items = cartParam.split(',');
        items.forEach(pair => {
          const [rawId, rawQty] = pair.split(':');
          const id = (rawId || '').trim().toUpperCase();
          const qty = parseInt(rawQty || '1', 10);
          if (cardById.has(id) && Number.isFinite(qty) && qty > 0) {
            state.cart.set(id, Math.min(99, qty));
            restoredCount++;
          }
        });
        if (restoredCount > 0) {
          saveCartToStorage();
        }
      }

      if (wishNameParam) {
        const nameInput = document.getElementById('jhsNewWishListNameInput');
        if (nameInput) nameInput.value = wishNameParam;
      }

      if (cartParam || jhsAuto) {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      if (jhsAuto === '1') {
        const tryAutoFlow = () => {
          tryAutoExtractJhsAppToken();
          updateJhsTokenBadgeUI();
          if (autoCreate === '1' && jhsState.token && !jhsState.hasAutoCreatedInSession && state.cart.size > 0) {
            jhsState.hasAutoCreatedInSession = true;
            createJhsWishlistFromCart();
          }
        };
        setTimeout(() => {
          openJhsHubModal('wishlist');
          tryAutoFlow();
        }, 180);
        setTimeout(tryAutoFlow, 650);
        setTimeout(tryAutoFlow, 1400);
      } else if (restoredCount > 0) {
        setTimeout(() => {
          showToast(`🎉 已从分享链接载入 ${restoredCount} 种卡牌到购物车！`);
        }, 250);
      }
    } catch (e) {
      // ignore
    }
  }

  // 智能分端状态向导更新（自动根据「已连接 / 手机未连接 / 电脑未连接」切换最简界面并刷新电脑扫码二维码）
  function updateJhsTokenBadgeUI() {
    const btnText = document.getElementById('jhsAuthStatusBtnText');
    const toggleBtn = document.getElementById('jhsToggleAuthBoxBtn');
    const input = document.getElementById('jhsTokenInput');
    const connectedBanner = document.getElementById('jhsInAppAutoBanner');
    const connectedTitle = document.getElementById('jhsConnectedBannerTitle');
    const mobileWizard = document.getElementById('jhsMobileWizardBox');
    const pcWizard = document.getElementById('jhsPcWizardBox');
    const pcQrImg = document.getElementById('jhsPcSyncQrImg');

    if (input && jhsState.token && !input.value) {
      input.value = jhsState.token;
    }

    const hasToken = Boolean(jhsState.token);
    const isMobile = isMobileEnvironment();

    if (connectedBanner) {
      connectedBanner.style.display = hasToken ? 'block' : 'none';
    }
    if (connectedTitle && hasToken) {
      connectedTitle.textContent = jhsState.isInJhsApp
        ? '🎉 已在集换社 App 内自动连接您的账号！点击下方「☁️ 一键在集换社创建心愿单」即可秒建单'
        : '✅ 已绑定集换社登录通行证！直接点击下方「☁️ 一键在集换社创建心愿单」即可写入全部卡牌';
    }

    if (mobileWizard) {
      mobileWizard.style.display = !hasToken && isMobile ? 'block' : 'none';
    }
    if (pcWizard) {
      pcWizard.style.display = !hasToken && !isMobile ? 'block' : 'none';
      if (!hasToken && !isMobile && pcQrImg) {
        const syncUrl = buildSyncUrlWithCart({ openJhs: true, autoCreate: true });
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(syncUrl)}`;
        if (pcQrImg.dataset.lastUrl !== syncUrl) {
          pcQrImg.dataset.lastUrl = syncUrl;
          pcQrImg.src = qrApiUrl;
        }
      }
    }

    if (btnText) {
      if (hasToken) {
        btnText.textContent = '✅ 已连接集换社账号';
        if (toggleBtn) {
          toggleBtn.style.borderColor = 'rgba(34, 197, 94, 0.55)';
          toggleBtn.style.color = '#86efac';
        }
      } else {
        btnText.textContent = '手动粘贴通行证';
        if (toggleBtn) {
          toggleBtn.style.borderColor = '';
          toggleBtn.style.color = '';
        }
      }
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
    const summaryCardsEl = document.getElementById('jhsSummaryCardsText');
    const totalPriceEl = document.getElementById('jhsSummaryTotalPrice');
    const tbody = document.getElementById('jhsCartTableTbody');

    const totalQty = entries.reduce((acc, e) => acc + e.qty, 0);
    let totalCost = 0;

    entries.forEach(({ card, qty }) => {
      const v = getSelectedJhsVersion(card);
      const p = parseFloat(v?.min_price);
      if (p > 0) totalCost += p * qty;
    });

    if (summaryCardsEl) summaryCardsEl.textContent = `${entries.length} 种 / ${totalQty} 张`;
    if (totalPriceEl) totalPriceEl.textContent = `¥${totalCost.toFixed(2)}`;

    if (!tbody) return;
    if (entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:36px 12px;color:var(--text-secondary);">
            购物车为空，请先在主界面选择卡牌加入购物车，或切换到「🔗 3. 导入集换社心愿单链接」标签页导入
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
              <img class="list-thumb" crossorigin="anonymous" src="${card.imgSmall}" alt="${escapeHtml(card.name)}" loading="lazy" />
            </td>
            <td>
              <div style="font-weight:700;color:var(--text-main);cursor:pointer;" data-action="detail" data-id="${card.id}">${escapeHtml(card.name)}</div>
              <div style="font-size:11px;color:var(--text-muted);font-family:Consolas,monospace;">${card.id} · ${formatDomains(card.domains)}</div>
            </td>
            <td>
              <select class="filter-select jhs-version-select" data-card-id="${card.id}" style="width:100%;max-width:260px;font-size:12px;height:30px;padding:0 8px;">
                ${optionsHtml}
              </select>
            </td>
            <td style="font-weight:700;color:#fdba74;">${priceStr}</td>
            <td style="font-weight:800;color:var(--gold-light);">×${qty}</td>
            <td style="font-weight:800;color:#fb923c;">${subStr}</td>
            <td>
              ${
                deepLinkUrl
                  ? `<a class="btn btn-jhs" href="${deepLinkUrl}" style="text-decoration:none;height:28px;padding:0 10px;font-size:11.5px;" title="在集换社 App 中直接打开该卡牌详情与在售列表">📱 跳 App 买此卡</a>`
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
    tryAutoExtractJhsAppToken();
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
      wishlist: document.getElementById('jhsTabPanel_wishlist'),
      shop: document.getElementById('jhsTabPanel_shop'),
      import: document.getElementById('jhsTabPanel_import')
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

    tryAutoExtractJhsAppToken();

    const tokenInputVal =
      document.getElementById('jhsTokenInput')?.value.trim() ||
      document.getElementById('jhsPcQuickTokenInput')?.value.trim() ||
      '';
    if (tokenInputVal) {
      jhsState.token = tokenInputVal.replace(/^Bearer\s+/i, '').trim();
      localStorage.setItem(JHS_TOKEN_STORAGE_KEY, jhsState.token);
      updateJhsTokenBadgeUI();
    }

    if (!jhsState.token) {
      if (isMobileEnvironment()) {
        const mobileWizard = document.getElementById('jhsMobileWizardBox');
        if (mobileWizard) {
          mobileWizard.style.display = 'block';
          mobileWizard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        await launchJhsAppWithAutoCreate();
        return;
      }
      const pcWizard = document.getElementById('jhsPcWizardBox');
      if (pcWizard) {
        pcWizard.style.display = 'block';
        pcWizard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      document.getElementById('jhsPcQuickTokenInput')?.focus();
      showToast('📱 请直接用手机扫下方二维码秒建心愿单，或在右侧粘贴通行证后一键建单');
      return;
    }

    const progressEl = document.getElementById('jhsCreateWishProgress');
    const createBtn = document.getElementById('jhsCreateWishListBtn');
    const resultBox = document.getElementById('jhsCreatedWishResultBox');
    if (resultBox) resultBox.style.display = 'none';
    if (progressEl) progressEl.style.display = 'block';

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
      const wishName = document.getElementById('jhsNewWishListNameInput')?.value.trim() || `《符文战场》选购单_${new Date().toLocaleDateString('zh-CN')}`;
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
          throw new Error(createJson.message || createJson.msg || `创建心愿单失败 (HTTP ${createResp.status})，请检查 Token 是否过期`);
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
      const appLinkEl = document.getElementById('jhsOpenCreatedWishAppBtn');
      const webLinkEl = document.getElementById('jhsOpenCreatedWishWebBtn');
      const qrImgEl = document.getElementById('jhsCreatedWishQrImg');
      const copyUrlBtn = document.getElementById('jhsCopyCreatedWishUrlBtn');

      if (titleEl) titleEl.textContent = `✅ 心愿单「${wishName}」(#${wishListId}) 已同步 ${successCount} 种卡牌！`;
      if (appLinkEl) appLinkEl.href = appDeepLink;
      if (webLinkEl) webLinkEl.href = webShareLink;
      if (qrImgEl) qrImgEl.src = qrImgUrl;
      if (copyUrlBtn) {
        copyUrlBtn.onclick = async () => {
          await copyTextSafe(webShareLink);
          showToast('📋 心愿单分享链接已复制到剪贴板！');
        };
      }
      if (resultBox) resultBox.style.display = 'block';
      showToast('🎉 集换社心愿单创建成功！可直接点击「一键唤起集换社 App 打开该心愿单」去配单');
    } catch (err) {
      if (progressEl) progressEl.textContent = `❌ ${err.message || '同步失败'}`;
      showToast(`⚠️ ${err.message || '集换社心愿单创建失败'}`);
    } finally {
      if (createBtn) createBtn.disabled = false;
    }
  }

  // 解析集换社卖家店铺链接，并与当前购物车做 1v1 库存及价格比对
  async function scanJhsSellerStore() {
    const rawInput = document.getElementById('jhsShopUrlInput')?.value.trim() || '';
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
    const resultBox = document.getElementById('jhsShopResultContainer');
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
            <div style="text-align:right;margin-right:6px;">
              <div style="font-size:18px;font-weight:900;color:#fb923c;">¥${totalSellerCost.toFixed(2)}</div>
              <div style="font-size:11px;color:var(--text-secondary);">该店可配齐部分合计</div>
            </div>
            <a class="btn btn-jhs" href="${appShopDeepLink}" style="text-decoration:none;">📱 在集换社 App 打开该店选购</a>
            <a class="btn" href="${shareUrl}" target="_blank" rel="noopener" style="text-decoration:none;">🌐 网页查看店铺</a>
          </div>
        </div>

        <div class="rift-list-table-wrap" style="max-height:280px;overflow-y:auto;">
          <table class="rift-list-table">
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
    const shouldReplace = replaceMode !== null ? replaceMode : Boolean(document.getElementById('jhsImportWishReplaceCheck')?.checked);
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
    restoreCartFromUrlParams();
    tryAutoExtractJhsAppToken();
    // 兼容 Android / iOS WebView 延迟注入 window.jhsapp 的情况
    setTimeout(tryAutoExtractJhsAppToken, 500);
    setTimeout(tryAutoExtractJhsAppToken, 1500);

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
      state.includeAltArt = true;
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
      document.getElementById('toggleAltArtBtn').classList.add('active');
      ['toggleTokensBtn', 'toggleOnlyCartBtn'].forEach(id => {
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
      const std = new Set(['id', 'domain', 'rarity', 'type']);
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

    // 教程与搜索语法弹窗
    const openTutorialModal = () => {
      document.getElementById('syntaxModal').classList.add('open');
    };
    document.getElementById('syntaxHelpBtn')?.addEventListener('click', openTutorialModal);
    document.getElementById('openGuideHeaderBtn')?.addEventListener('click', openTutorialModal);
    document.getElementById('jhsOpenTutorialBtn')?.addEventListener('click', openTutorialModal);

    // 购物车多套方案存档与一键分享卡单
    renderCartPresetsSelect();
    document.getElementById('saveCartPresetBtn')?.addEventListener('click', handleSaveCurrentCartPreset);
    document.getElementById('cartSavedListsSelect')?.addEventListener('change', e => {
      handleLoadCartPreset(e.target.value);
    });
    document.getElementById('deleteCartPresetBtn')?.addEventListener('click', handleDeleteCartPreset);
    document.getElementById('shareCartUrlBtn')?.addEventListener('click', async () => {
      if (state.cart.size === 0) {
        showToast('⚠️ 购物车为空，请先选择卡牌后再分享');
        return;
      }
      const shareUrl = buildSyncUrlWithCart({ openJhs: false, autoCreate: false });
      const ok = await copyTextSafe(shareUrl);
      if (ok) {
        showToast('🔗 已复制当前购卡单专属分享链接！发给好友点开即可直接载入整套卡表');
      } else {
        showToast('⚠️ 复制失败，请重试');
      }
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

    // 批量切换版本：全选最低价版本 / 全选平卡普通版
    document.getElementById('jhsBatchCheapestVerBtn')?.addEventListener('click', () => {
      const entries = getCartEntriesSorted();
      if (entries.length === 0) return;
      entries.forEach(({ card }) => {
        const versions = jhsVersionsCache.get(card.id) || [];
        const cheapest = selectCheapestJhsVersion(versions, card);
        if (cheapest) jhsSelectedVersionMap.set(card.id, Number(cheapest.id));
      });
      renderJhsCartTable();
      showToast('⚡ 已将所有卡牌切换为集换社当前最低在售价版本！');
    });

    document.getElementById('jhsBatchNormalVerBtn')?.addEventListener('click', () => {
      const entries = getCartEntriesSorted();
      if (entries.length === 0) return;
      entries.forEach(({ card }) => {
        const versions = jhsVersionsCache.get(card.id) || [];
        if (versions.length === 0) return;
        const normalPool = versions.filter(v => {
          const r = String(v.rarity || '');
          const num = String(v.number || '');
          return !/异画|闪|金|签|Showcase|Foil/i.test(r) && !/[a-zA-Z]\s*$/.test(num);
        });
        const chosen = selectCheapestJhsVersion(normalPool.length > 0 ? normalPool : versions, card);
        if (chosen) jhsSelectedVersionMap.set(card.id, Number(chosen.id));
      });
      renderJhsCartTable();
      showToast('🃏 已将所有卡牌优先切换为普通平卡版本！');
    });

    // 当修改新心愿单名称时，实时更新电脑端扫码同步二维码
    document.getElementById('jhsNewWishListNameInput')?.addEventListener('input', () => {
      updateJhsTokenBadgeUI();
    });

    // 账号通行证配置折叠与保存
    const toggleAuthBox = () => {
      const box = document.getElementById('jhsAuthConfigBox');
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    };
    document.getElementById('jhsToggleAuthBoxBtn')?.addEventListener('click', toggleAuthBox);
    document.getElementById('jhsOpenAuthManageBtn')?.addEventListener('click', toggleAuthBox);

    // 手机端一键唤起集换社 App 内置页并全自动创建心愿单
    document.getElementById('jhsLaunchAppWebviewBtn')?.addEventListener('click', launchJhsAppWithAutoCreate);

    // 复制带购物车的同步链接（可发送到集换社私信/评论内点击打开）
    const handleCopyAutoSyncUrl = async () => {
      const syncUrl = buildSyncUrlWithCart({ openJhs: true, autoCreate: true });
      const ok = await copyTextSafe(syncUrl);
      if (ok) {
        showToast('🔗 已复制本单专属链接！打开集换社 App 发到任意私信/评论中点开，即可全自动创建心愿单');
      } else {
        showToast('⚠️ 复制失败，请手动复制浏览器地址栏链接');
      }
    };
    document.getElementById('jhsCopySyncPageUrlBtn')?.addEventListener('click', handleCopyAutoSyncUrl);
    document.getElementById('jhsMobileCopySyncUrlBtn')?.addEventListener('click', handleCopyAutoSyncUrl);

    // 一键复制当前提取到的或已保存的集换社通行证（供发给电脑端使用）
    const handleCopyCurrentToken = async () => {
      tryAutoExtractJhsAppToken();
      const tok = jhsState.token || document.getElementById('jhsTokenInput')?.value.trim() || '';
      const clean = tok.replace(/^Bearer\s+/i, '').trim();
      if (!clean) {
        showToast('⚠️ 当前尚未获取到通行证，请先在集换社 App 内打开本页');
        return;
      }
      const ok = await copyTextSafe(clean);
      if (ok) {
        showToast('📋 已复制您的集换社登录通行证！可直接发到电脑端粘贴绑定');
      } else {
        showToast('⚠️ 复制失败，请展开管理框手动复制');
      }
    };
    document.getElementById('jhsCopyInAppTokenBtn')?.addEventListener('click', handleCopyCurrentToken);
    document.getElementById('jhsCopySavedTokenBtn')?.addEventListener('click', handleCopyCurrentToken);

    const handleSaveTokenValue = rawVal => {
      const cleanToken = String(rawVal || '').replace(/^Bearer\s+/i, '').trim();
      if (!cleanToken) {
        showToast('请先粘贴从手机端复制过来的集换社登录通行证');
        return;
      }
      jhsState.token = cleanToken;
      localStorage.setItem(JHS_TOKEN_STORAGE_KEY, cleanToken);
      const input1 = document.getElementById('jhsTokenInput');
      const input2 = document.getElementById('jhsPcQuickTokenInput');
      if (input1) input1.value = cleanToken;
      if (input2) input2.value = '';
      updateJhsTokenBadgeUI();
      fetchUserJhsWishlists();
      showToast('✅ 集换社登录通行证已绑定！现在直接点「☁️ 一键在集换社创建心愿单」即可秒建单');
    };

    document.getElementById('jhsSaveTokenBtn')?.addEventListener('click', () => {
      handleSaveTokenValue(document.getElementById('jhsTokenInput')?.value);
    });
    document.getElementById('jhsPcQuickSaveTokenBtn')?.addEventListener('click', () => {
      handleSaveTokenValue(document.getElementById('jhsPcQuickTokenInput')?.value);
    });

    document.getElementById('jhsClearTokenBtn')?.addEventListener('click', () => {
      jhsState.token = '';
      jhsState.isInJhsApp = false;
      localStorage.removeItem(JHS_TOKEN_STORAGE_KEY);
      const input = document.getElementById('jhsTokenInput');
      if (input) input.value = '';
      updateJhsTokenBadgeUI();
      showToast('🗑️ 已清除保存的集换社通行证');
    });

    // 一键创建并同步心愿单按钮
    document.getElementById('jhsCreateWishListBtn')?.addEventListener('click', createJhsWishlistFromCart);

    // 快捷复制：集换社配单文本
    document.getElementById('jhsQuickExportTextBtn')?.addEventListener('click', async () => {
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
      await copyTextSafe(txt);
      showToast('📋 已复制集换社心愿单配卡与底价清单到剪贴板！');
    });

    // 卖家店铺 1v1 齐卡扫描与心愿单链接导入（支持一键读取剪贴板并执行）
    document.getElementById('jhsScanShopBtn')?.addEventListener('click', scanJhsSellerStore);
    document.getElementById('jhsPasteAndScanShopBtn')?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const clipText = (await navigator.clipboard.readText()) || '';
          if (clipText.trim()) {
            const input = document.getElementById('jhsShopUrlInput');
            if (input) input.value = clipText.trim();
          }
        }
      } catch (e) {
        // 浏览器询问或限制读取剪贴板时回退到输入框内已有值
      }
      const input = document.getElementById('jhsShopUrlInput');
      if (!input?.value.trim()) {
        input?.focus();
        showToast('📋 请在输入框内长按或按 Ctrl+V 粘贴店铺链接');
        return;
      }
      scanJhsSellerStore();
    });

    document.getElementById('jhsConfirmImportWishUrlBtn')?.addEventListener('click', () => importFromJhsWishUrl());
    document.getElementById('jhsPasteAndImportWishBtn')?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const clipText = (await navigator.clipboard.readText()) || '';
          if (clipText.trim()) {
            const input = document.getElementById('jhsImportWishUrlInput');
            if (input) input.value = clipText.trim();
          }
        }
      } catch (e) {
        // ignore
      }
      const input = document.getElementById('jhsImportWishUrlInput');
      if (!input?.value.trim()) {
        input?.focus();
        showToast('📋 请在输入框内长按或按 Ctrl+V 粘贴集换社心愿单分享链接');
        return;
      }
      importFromJhsWishUrl();
    });

    // 初始渲染
    updateCartUI();
    refreshCatalog(true);
  }

  init();
})();

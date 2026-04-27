const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || 'https://crm-ela.onrender.com/api';

let state = {
  productos: [],
  ventas: [],
  movimientos: [],
  dashboard: null,
};
let mpVars = [];
let mpEditId = null;
let gananciaChart = null;
let msEditVariantId = null;
let expanded = {};
let nvProductId = null;
let nvVariantId = null;
let cart = [];

const $ = (id) => document.getElementById(id);

function confirmDialog(message, title = 'Confirmar', okLabel = 'Eliminar') {
  return new Promise((resolve) => {
    $('mc-titulo').textContent = title;
    $('mc-msg').textContent = message;
    $('mc-ok').textContent = okLabel;
    $('modal-confirm').classList.add('open');
    const cleanup = (result) => {
      $('modal-confirm').classList.remove('open');
      $('mc-ok').removeEventListener('click', onOk);
      $('mc-cancel').removeEventListener('click', onCancel);
      $('modal-confirm').removeEventListener('click', onOverlay);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlay = (e) => { if (e.target === $('modal-confirm')) cleanup(false); };
    $('mc-ok').addEventListener('click', onOk);
    $('mc-cancel').addEventListener('click', onCancel);
    $('modal-confirm').addEventListener('click', onOverlay);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  const hdr = $('fecha-hdr');
  hdr.textContent = today.toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
  hdr.setAttribute('datetime', today.toISOString().slice(0, 10));

  document.querySelectorAll('nav button[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });

  $('btn-nuevo-producto').addEventListener('click', () => openProductModal());
  $('btn-add-var').addEventListener('click', addVariantDraft);
  $('btn-guardar-producto').addEventListener('click', saveProduct);
  $('btn-guardar-stock').addEventListener('click', saveStock);
  $('btn-registrar-venta').addEventListener('click', registerSale);
  $('btn-add-cart').addEventListener('click', addToCart);

  $('nv-prod').addEventListener('change', selectSaleProduct);
  $('nv-var').addEventListener('change', selectSaleVariant);
  $('nv-cant').addEventListener('input', recalcSale);
  $('nv-precio').addEventListener('input', recalcSale);

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  ['modal-prod', 'modal-stock'].forEach((id) => {
    $(id).addEventListener('click', (e) => { if (e.target === $(id)) closeModal(id); });
  });

  await loadApp();
});

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    let message = 'Error inesperado';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (_) {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadApp() {
  try {
    const [products, sales, dashboard, movements] = await Promise.all([
      api('/products'),
      api('/sales'),
      api('/dashboard'),
      api('/inventory-movements')
    ]);

    state.productos = products;
    state.ventas = sales;
    state.dashboard = dashboard;
    state.movimientos = movements;

    renderDashboard();
    renderInventory();
    renderSales();
    renderMovements();
    initSaleForm();
    await fetchGananciasChart();
  } catch (error) {
    console.error(error);
    alert(`No se pudo cargar la aplicación: ${error.message}`);
  }
}

function showTab(id) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
  document.querySelectorAll('nav button[data-tab]').forEach((button) => button.classList.remove('active'));
  $(`tab-${id}`).classList.add('active');
  document.querySelector(`nav button[data-tab="${id}"]`).classList.add('active');

  if (id === 'nueva-venta') initSaleForm();
}

function fmt(n) {
  return 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtF(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('es-BO');
}

function alertBox(type, text) {
  return `<div class="alert ${type}">${text}</div>`;
}

function renderDashboard() {
  const dash = state.dashboard;
  $('dash-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Ventas Totales</div><div class="val g mono">${fmt(dash.totalSalesAmount)}</div><div class="sub">${dash.totalUnitsSold} unidades</div></div>
    <div class="metric"><div class="lbl">Ganancia Real</div><div class="val ${dash.totalProfit >= 0 ? 'g' : 'r'} mono">${fmt(dash.totalProfit)}</div><div class="sub">precio − costo</div></div>
    <div class="metric"><div class="lbl">Stock Total</div><div class="val b">${dash.totalStock}</div><div class="sub">${dash.totalProducts} productos</div></div>
    <div class="metric"><div class="lbl">Valor Inventario</div><div class="val mono">${fmt(dash.inventoryCostValue)}</div><div class="sub">a precio costo</div></div>
  `;

  $('dash-ventas').innerHTML = dash.recentSales.length
    ? dash.recentSales.map((sale) => `
      <tr>
        <td>${fmtF(sale.sale_date)}</td>
        <td>${sale.product_name}</td>
        <td style="font-size:0.8rem;color:var(--text2);">${sale.variant_label}</td>
        <td class="r mono">${fmt(sale.total_amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Sin ventas</td></tr>';

  $('dash-stock').innerHTML = dash.lowStock.length
    ? dash.lowStock.map((item) => `
      <tr>
        <td>${item.product_name}</td>
        <td style="font-size:0.8rem;">${item.variant_label}</td>
        <td class="c"><span class="badge ${item.stock === 0 ? 'br' : 'by'}">${item.stock}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty">Todo bien ✓</td></tr>';
}

function renderInventory() {
  const products = state.productos;
  const totalVariants = products.reduce((acc, product) => acc + product.variants.length, 0);
  $('inv-sub').textContent = `${products.length} productos · ${totalVariants} variantes`;

  if (!products.length) {
    $('tbody-inv').innerHTML = '<tr><td colspan="10"><div class="empty">Sin productos. Agregá uno.</div></td></tr>';
    return;
  }

  let html = '';
  products.forEach((product) => {
    const stockTotal = product.variants.reduce((acc, variant) => acc + variant.stock, 0);
    const margin = product.sale_price > 0 ? (((product.sale_price - product.cost_price) / product.sale_price) * 100).toFixed(0) + '%' : '—';
    const badgeClass = stockTotal === 0 ? 'br' : stockTotal <= 2 ? 'by' : 'bg';
    const isExpanded = !!expanded[product.id];

    html += `
      <tr class="prod-base" data-toggle-product="${product.id}">
        <td style="font-size:0.8rem;color:var(--text2);">${isExpanded ? '▼' : '▶'}</td>
        <td><span class="badge bk">${product.code}</span></td>
        <td>${product.name}</td>
        <td>${product.category || '—'}</td>
        <td class="r mono">${fmt(product.cost_price)}</td>
        <td class="r mono">${fmt(product.sale_price)}</td>
        <td class="r" style="color:var(--accent);">${margin}</td>
        <td class="c"><span class="badge ${badgeClass}">${stockTotal}</span></td>
        <td>${product.provider || '—'}</td>
        <td>
          <button class="bedit bsm" data-edit-product="${product.id}">Editar</button>
          <button class="btn bd bsm" data-delete-product="${product.id}">×</button>
        </td>
      </tr>
    `;

    if (isExpanded) {
      product.variants.forEach((variant) => {
        const variantBadge = variant.stock === 0 ? 'br' : variant.stock <= 2 ? 'by' : 'bg';
        html += `
          <tr class="variante">
            <td></td>
            <td style="color:var(--text2);font-size:0.8rem;">↳</td>
            <td colspan="2">${variant.color} <span style="color:var(--text2);">/ ${variant.size}</span></td>
            <td colspan="3"></td>
            <td class="c"><span class="badge ${variantBadge}">${variant.stock}</span></td>
            <td style="color:var(--text2);font-size:0.78rem;">uds.</td>
            <td>
              <button class="bedit bsm" data-stock-variant="${variant.id}" data-product-name="${product.name}" data-variant-label="${variant.color} / ${variant.size}" data-stock="${variant.stock}">Ajustar stock</button>
              <button class="btn bd bsm" data-delete-variant="${variant.id}">×</button>
            </td>
          </tr>
        `;
      });
    }
  });

  $('tbody-inv').innerHTML = html;

  document.querySelectorAll('[data-toggle-product]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = row.dataset.toggleProduct;
      expanded[id] = !expanded[id];
      renderInventory();
    });
  });

  document.querySelectorAll('[data-edit-product]').forEach((btn) => btn.addEventListener('click', () => openProductModal(btn.dataset.editProduct)));
  document.querySelectorAll('[data-delete-product]').forEach((btn) => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct)));
  document.querySelectorAll('[data-stock-variant]').forEach((btn) => btn.addEventListener('click', () => openStockModal(btn.dataset)));
  document.querySelectorAll('[data-delete-variant]').forEach((btn) => btn.addEventListener('click', () => deleteVariant(btn.dataset.deleteVariant)));
}

function renderSales() {
  $('ventas-sub').textContent = `${state.ventas.length} ventas registradas`;

  if (!state.ventas.length) {
    $('tbody-ventas').innerHTML = '<tr><td colspan="10"><div class="empty">Sin ventas registradas</div></td></tr>';
    return;
  }

  $('tbody-ventas').innerHTML = state.ventas.map((sale) => `
    <tr>
      <td>${fmtF(sale.sale_date)}</td>
      <td>${sale.product_name}</td>
      <td style="font-size:0.8rem;color:var(--text2);">${sale.variant_label}</td>
      <td class="c">${sale.quantity}</td>
      <td class="r mono">${fmt(sale.unit_price)}</td>
      <td class="r mono">${fmt(sale.total_amount)}</td>
      <td class="r mono" style="color:${sale.profit_amount >= 0 ? 'var(--accent)' : 'var(--danger)'};">${fmt(sale.profit_amount)}</td>
      <td><span class="badge bk">${sale.payment_method}</span></td>
      <td>${sale.customer_name || '—'}</td>
      <td><button class="btn bd bsm" data-delete-sale="${sale.id}">×</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-delete-sale]').forEach((btn) => btn.addEventListener('click', () => deleteSale(btn.dataset.deleteSale)));
}

function movementTypeLabel(type) {
  if (type === 'sale') return 'Venta';
  if (type === 'sale_reversal') return 'Reversa';
  if (type === 'manual_adjustment') return 'Ajuste manual';
  return type || 'Movimiento';
}

function movementTypeBadgeClass(type) {
  if (type === 'sale') return 'br';
  if (type === 'sale_reversal') return 'bg';
  if (type === 'manual_adjustment') return 'bi';
  return 'bk';
}

function movementRefLabel(item) {
  if (!item.reference_type || !item.reference_id) return '—';
  if (item.reference_type === 'sale') return `Venta #${item.reference_id}`;
  if (item.reference_type === 'variant') return `Variante #${item.reference_id}`;
  return `${item.reference_type} #${item.reference_id}`;
}

function renderMovements() {
  $('mov-sub').textContent = `${state.movimientos.length} movimientos recientes`;

  if (!state.movimientos.length) {
    $('tbody-mov').innerHTML = '<tr><td colspan="9"><div class="empty">Sin movimientos de inventario</div></td></tr>';
    return;
  }

  $('tbody-mov').innerHTML = state.movimientos.map((item) => {
    const change = Number(item.quantity_change);
    const changeLabel = change > 0 ? `+${change}` : `${change}`;
    return `
      <tr>
        <td>${fmtF(item.movement_date)}</td>
        <td>${item.product_name}</td>
        <td style="font-size:0.8rem;color:var(--text2);">${item.variant_label}</td>
        <td><span class="badge ${movementTypeBadgeClass(item.movement_type)}">${movementTypeLabel(item.movement_type)}</span></td>
        <td class="c" style="color:${change >= 0 ? 'var(--accent)' : 'var(--danger)'};font-weight:bold;">${changeLabel}</td>
        <td class="c">${item.stock_before}</td>
        <td class="c">${item.stock_after}</td>
        <td style="font-size:0.8rem;color:var(--text2);">${movementRefLabel(item)}</td>
        <td><button class="btn bd bsm" data-delete-movement="${item.id}">×</button></td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-delete-movement]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMovement(btn.dataset.deleteMovement));
  });
}

function initSaleForm() {
  nvProductId = null;
  nvVariantId = null;
  cart = [];
  $('nv-fecha').value = new Date().toISOString().slice(0, 10);
  $('nv-cliente').value = '';
  $('nv-notas').value = '';
  $('nv-cant').value = 1;
  $('nv-precio').value = '';
  $('nv-alert').innerHTML = '';
  $('nv-det').classList.add('hidden');
  $('nv-cart').classList.add('hidden');
  $('nv-totales').classList.add('hidden');
  $('btn-add-cart').disabled = true;

  $('nv-prod').innerHTML = '<option value="">Seleccionar producto...</option>';
  state.productos.forEach((product) => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = `[${product.code}] ${product.name}`;
    $('nv-prod').appendChild(option);
  });

  $('nv-var').innerHTML = '<option value="">— primero elegí un producto —</option>';
  $('nv-var').disabled = true;
  renderCart();
}

function renderCart() {
  if (!cart.length) {
    $('nv-cart').classList.add('hidden');
    $('nv-totales').classList.add('hidden');
    return;
  }
  $('nv-cart').classList.remove('hidden');
  $('nv-totales').classList.remove('hidden');

  let totalAmount = 0;
  let totalProfit = 0;

  $('nv-cart').innerHTML = cart.map((item, index) => {
    const itemTotal = item.quantity * item.unit_price;
    const itemProfit = item.quantity * (item.unit_price - item.cost_price);
    totalAmount += itemTotal;
    totalProfit += itemProfit;
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <span class="cart-item-name">${item.product_name}</span>
          <span class="cart-item-detail">${item.variant_label} · ${item.quantity} ud${item.quantity > 1 ? 's' : ''}. × ${fmt(item.unit_price)}</span>
        </div>
        <span class="cart-item-price">${fmt(itemTotal)}</span>
        <button class="btn bd bsm" data-remove-cart="${index}">×</button>
      </div>
    `;
  }).join('');

  $('nv-total-disp').textContent = fmt(totalAmount);
  $('nv-gan-disp').textContent = fmt(totalProfit);
  $('nv-gan-disp').style.color = totalProfit >= 0 ? 'var(--accent)' : 'var(--danger)';

  document.querySelectorAll('[data-remove-cart]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.removeCart), 1);
      renderCart();
    });
  });
}

function addToCart() {
  if (!nvProductId || !nvVariantId) return;
  const product = state.productos.find((p) => p.id === Number(nvProductId));
  const variant = product.variants.find((v) => v.id === Number(nvVariantId));
  const quantity = Number($('nv-cant').value || 0);
  const unit_price = Number($('nv-precio').value || 0);

  if (quantity < 1 || !unit_price) {
    $('nv-alert').innerHTML = alertBox('aw', 'Ingresá cantidad y precio.');
    return;
  }
  if (quantity > variant.stock) {
    $('nv-alert').innerHTML = alertBox('ae', `Stock insuficiente. Disponible: ${variant.stock}`);
    return;
  }

  cart.push({
    product_id: product.id,
    variant_id: variant.id,
    product_name: product.name,
    variant_label: `${variant.color} / ${variant.size}`,
    quantity,
    unit_price,
    cost_price: product.cost_price,
  });

  $('nv-alert').innerHTML = '';
  $('nv-prod').value = '';
  $('nv-var').innerHTML = '<option value="">— primero elegí un producto —</option>';
  $('nv-var').disabled = true;
  $('nv-det').classList.add('hidden');
  $('nv-cant').value = 1;
  $('nv-precio').value = '';
  $('btn-add-cart').disabled = true;
  nvProductId = null;
  nvVariantId = null;
  renderCart();
}

function selectSaleProduct() {
  const productId = $('nv-prod').value;
  nvProductId = productId || null;
  nvVariantId = null;
  $('nv-det').classList.add('hidden');

  if (!productId) {
    $('nv-var').innerHTML = '<option value="">— primero elegí un producto —</option>';
    $('nv-var').disabled = true;
    return;
  }

  const product = state.productos.find((item) => item.id === Number(productId));
  $('nv-var').innerHTML = '<option value="">Elegí variante...</option>';
  product.variants.forEach((variant) => {
    const option = document.createElement('option');
    option.value = variant.id;
    option.textContent = `${variant.color} / ${variant.size} — Stock: ${variant.stock}${variant.stock === 0 ? ' (sin stock)' : ''}`;
    $('nv-var').appendChild(option);
  });
  $('nv-var').disabled = false;
}

function selectSaleVariant() {
  const variantId = $('nv-var').value;
  nvVariantId = variantId || null;
  if (!variantId || !nvProductId) {
    $('nv-det').classList.add('hidden');
    $('btn-add-cart').disabled = true;
    return;
  }

  const product = state.productos.find((item) => item.id === Number(nvProductId));
  const variant = product.variants.find((item) => item.id === Number(variantId));

  $('det-precio').textContent = fmt(product.sale_price);
  $('det-costo').textContent = fmt(product.cost_price);
  $('det-stock').textContent = `${variant.stock} uds.`;
  $('nv-precio').value = product.sale_price;
  $('nv-det').classList.remove('hidden');
  $('btn-add-cart').disabled = false;
  recalcSale();
}

function recalcSale() {
  if (!nvProductId || !nvVariantId) return;
}

async function registerSale() {
  if (!cart.length) {
    $('nv-alert').innerHTML = alertBox('aw', 'Agregá al menos un producto al carrito.');
    return;
  }
  const sale_date = $('nv-fecha').value;
  if (!sale_date) {
    $('nv-alert').innerHTML = alertBox('ae', 'Seleccioná la fecha.');
    return;
  }

  try {
    const payment_method = $('nv-pago').value;
    const customer_name = $('nv-cliente').value.trim();
    const notes = $('nv-notas').value.trim();

    for (const item of cart) {
      await api('/sales', {
        method: 'POST',
        body: JSON.stringify({
          sale_date,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          payment_method,
          customer_name,
          notes,
        }),
      });
    }

    $('nv-alert').innerHTML = alertBox('as', `✓ Venta registrada (${cart.length} producto${cart.length > 1 ? 's' : ''}).`);
    await loadApp();
    setTimeout(() => showTab('dashboard'), 800);
  } catch (error) {
    $('nv-alert').innerHTML = alertBox('ae', error.message);
  }
}

function openProductModal(productId = null) {
  mpEditId = productId ? Number(productId) : null;
  mpVars = [];
  $('mp-alert').innerHTML = '';

  if (mpEditId) {
    const product = state.productos.find((item) => item.id === mpEditId);
    $('mp-titulo').textContent = 'Editar Producto';
    $('mp-id').value = product.code;
    $('mp-nombre').value = product.name;
    $('mp-cat').value = product.category || '';
    $('mp-costo').value = product.cost_price;
    $('mp-precio').value = product.sale_price;
    $('mp-prov').value = product.provider || '';
    $('mp-fecha').value = product.entry_date || '';
    mpVars = product.variants.map((variant) => ({ ...variant }));
  } else {
    $('mp-titulo').textContent = 'Nuevo Producto';
    ['mp-id', 'mp-nombre', 'mp-cat', 'mp-prov', 'av-color', 'av-talla'].forEach((id) => $(id).value = '');
    $('mp-costo').value = '';
    $('mp-precio').value = '';
    $('mp-fecha').value = new Date().toISOString().slice(0, 10);
    $('av-stock').value = 1;
  }

  renderVariantDrafts();
  $('modal-prod').classList.add('open');
}

function renderVariantDrafts() {
  if (!mpVars.length) {
    $('mp-var-list').innerHTML = '<div style="padding:10px 12px;font-size:0.82rem;color:var(--text2);">Sin variantes. Agregá al menos una.</div>';
    return;
  }

  $('mp-var-list').innerHTML = `
    <div class="var-row var-header"><span>Color</span><span>Talla</span><span>Stock</span><span></span></div>
    ${mpVars.map((variant, index) => `
      <div class="var-row">
        <span>${variant.color}</span>
        <span>${variant.size}</span>
        <span><input type="number" value="${variant.stock}" min="0" data-variant-stock-index="${index}" style="width:60px;padding:3px 6px;font-size:0.82rem;"></span>
        <span><button class="btn bd bsm" data-remove-draft-variant="${index}">×</button></span>
      </div>
    `).join('')}
  `;

  document.querySelectorAll('[data-variant-stock-index]').forEach((input) => {
    input.addEventListener('change', () => {
      mpVars[Number(input.dataset.variantStockIndex)].stock = Number(input.value || 0);
    });
  });

  document.querySelectorAll('[data-remove-draft-variant]').forEach((button) => {
    button.addEventListener('click', () => {
      mpVars.splice(Number(button.dataset.removeDraftVariant), 1);
      renderVariantDrafts();
    });
  });
}

function addVariantDraft() {
  const color = $('av-color').value.trim();
  const size = $('av-talla').value.trim() || 'Unica';
  const stock = Number($('av-stock').value || 0);

  if (!color) {
    $('mp-alert').innerHTML = alertBox('aw', 'Ingresá el color de la variante.');
    return;
  }

  mpVars.push({ id: null, color, size, stock });
  $('av-color').value = '';
  $('av-talla').value = '';
  $('av-stock').value = 1;
  $('mp-alert').innerHTML = '';
  renderVariantDrafts();
}

async function saveProduct() {
  try {
    const payload = {
      code: $('mp-id').value.trim(),
      name: $('mp-nombre').value.trim(),
      category: $('mp-cat').value.trim(),
      cost_price: Number($('mp-costo').value),
      sale_price: Number($('mp-precio').value),
      provider: $('mp-prov').value.trim(),
      entry_date: $('mp-fecha').value,
      variants: mpVars.map((variant) => ({
        id: variant.id || null,
        color: variant.color,
        size: variant.size || 'Unica',
        stock: Number(variant.stock || 0)
      }))
    };

    if (!payload.code || !payload.name || !payload.cost_price || !payload.sale_price) {
      $('mp-alert').innerHTML = alertBox('ae', 'Completá ID, nombre, costo y precio.');
      return;
    }

    if (!payload.variants.length) {
      $('mp-alert').innerHTML = alertBox('aw', 'Agregá al menos una variante.');
      return;
    }

    if (mpEditId) {
      await api(`/products/${mpEditId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
    }

    closeModal('modal-prod');
    await loadApp();
    showTab('inventario');
  } catch (error) {
    $('mp-alert').innerHTML = alertBox('ae', error.message);
  }
}

function openStockModal(dataset) {
  msEditVariantId = Number(dataset.stockVariant);
  $('ms-sub').textContent = `${dataset.productName} — ${dataset.variantLabel}`;
  $('ms-val').value = dataset.stock;
  $('modal-stock').classList.add('open');
}

async function saveStock() {
  try {
    await api(`/variants/${msEditVariantId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stock: Number($('ms-val').value) })
    });
    closeModal('modal-stock');
    await loadApp();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProduct(id) {
  if (!await confirmDialog('¿Eliminar este producto y todas sus variantes?')) return;
  await api(`/products/${id}`, { method: 'DELETE' });
  await loadApp();
}

async function deleteVariant(id) {
  if (!await confirmDialog('¿Eliminar esta variante?')) return;
  await api(`/variants/${id}`, { method: 'DELETE' });
  await loadApp();
}

async function deleteSale(id) {
  if (!await confirmDialog('¿Eliminar esta venta? El stock se restaurará automáticamente.')) return;
  await api(`/sales/${id}`, { method: 'DELETE' });
  await loadApp();
}

async function deleteMovement(id) {
  if (!await confirmDialog('¿Eliminar este movimiento del histórico? Esta acción no cambia el stock actual.')) return;
  await api(`/inventory-movements/${id}`, { method: 'DELETE' });
  await loadApp();
}

function closeModal(id) {
  $(id).classList.remove('open');
}

async function fetchGananciasChart() {
  try {
    const data = await api('/ganancias-mensuales');

    const container = $('chart-ganancias');
    container.innerHTML = '<canvas id="canvas-ganancias"></canvas>';
    const canvas = $('canvas-ganancias');

    if (gananciaChart) {
      gananciaChart.destroy();
    }

    const labels = data.map((row) => row.mes);
    const values = data.map((row) => Number(row.ganancia));

    gananciaChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ganancia (Bs)',
          data: values,
          backgroundColor: '#2d6a4f',
          borderColor: '#1b4332',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Ganancias Mensuales',
            color: '#2d6a4f',
            font: { size: 15, weight: 'bold' },
          },
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ' ' + fmt(ctx.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => 'Bs ' + Number(val).toLocaleString('es-BO'),
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('Error cargando gráfico de ganancias:', error);
  }
}

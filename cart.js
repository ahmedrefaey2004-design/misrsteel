// ══ MISR STEEL — CART SYSTEM ══════════════════════════
var CART_KEY = 'ms_cart';

var Cart = {
  // Get cart from localStorage
  get: function() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch(e) { return []; }
  },

  // Save cart
  save: function(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    Cart.updateBadge();
  },

  // Add item
  add: function(product, qty, frameColor, fabricColor, tierPrice) {
    var items = Cart.get();
    var price = tierPrice || product.price || 0;
    // Check if same product+colors already in cart
    var existing = items.find(function(i) {
      return String(i.id) === String(product.id) && i.frameColor === (frameColor||'') && i.fabricColor === (fabricColor||'');
    });
    if (existing) {
      existing.qty += qty;
      existing.total = existing.qty * existing.price;
    } else {
      items.push({
        id: product.id,
        nameAr: product.nameAr,
        nameEn: product.nameEn || '',
        price: price,
        qty: qty || 1,
        total: price * (qty || 1),
        frameColor: frameColor || '',
        fabricColor: fabricColor || '',
        img: product.imgs && product.imgs[0] ? product.imgs[0] : '',
        section: product.section || '',
      });
    }
    Cart.save(items);
    Cart.showToast('✅ تم الإضافة للسلة');
    return items;
  },

  // Remove item by index
  remove: function(idx) {
    var items = Cart.get();
    items.splice(idx, 1);
    Cart.save(items);
  },

  // Update qty
  updateQty: function(idx, qty) {
    var items = Cart.get();
    if (items[idx]) {
      items[idx].qty = parseInt(qty) || 1;
      items[idx].total = items[idx].qty * items[idx].price;
      Cart.save(items);
    }
  },

  // Clear cart
  clear: function() {
    localStorage.removeItem(CART_KEY);
    Cart.updateBadge();
  },

  // Total items count
  count: function() {
    return Cart.get().reduce(function(sum, i) { return sum + (i.qty||1); }, 0);
  },

  // Total price
  total: function() {
    return Cart.get().reduce(function(sum, i) { return sum + (i.total||0); }, 0);
  },

  // Update cart badge in navbar
  updateBadge: function() {
    var count = Cart.count();
    document.querySelectorAll('.cart-badge').forEach(function(el) {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  // Show toast
  showToast: function(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast success show';
    clearTimeout(t._t);
    t._t = setTimeout(function() { t.classList.remove('show'); }, 2500);
  },

  // Build WhatsApp message from cart
  buildWAMessage: function(customerName, customerPhone, customerCountry, notes) {
    var items = Cart.get();
    if (!items.length) return '';
    var USD_EGP = parseFloat(localStorage.getItem('ms_rate') || '50.85');
    var msg = '🛒 طلب جديد من مصر ستيل\n\n';
    msg += '👤 الاسم: ' + customerName + '\n';
    msg += '📱 الواتساب: ' + customerPhone + '\n';
    msg += '🌍 الدولة: ' + customerCountry + '\n\n';
    msg += '📦 المنتجات:\n';
    items.forEach(function(item, i) {
      msg += (i+1) + '. ' + item.nameAr + '\n';
      msg += '   الكمية: ' + item.qty + ' | السعر: $' + item.price + ' | الإجمالي: $' + item.total + '\n';
      if (item.frameColor) msg += '   لون الإطار: ' + item.frameColor + '\n';
      if (item.fabricColor) msg += '   لون القماش: ' + item.fabricColor + '\n';
    });
    var total = Cart.total();
    var deposit = Math.round(total * 0.75);
    var remaining = total - deposit;
    msg += '\n💰 إجمالي الطلب: $' + total;
    msg += ' (≈ ' + Math.round(total * USD_EGP).toLocaleString() + ' ج.م)\n';
    msg += '\n💳 شروط الدفع:\n';
    msg += '   مقدم (75%): $' + deposit + '\n';
    msg += '   قبل التسليم (25%): $' + remaining + '\n';
    if (notes) msg += '\n📝 ملاحظات: ' + notes + '\n';
    msg += '\nأرجو التواصل لتأكيد الطلب 🙏';
    return msg;
  },

  // Submit order to API
  submitOrder: async function(customerName, customerPhone, customerCountry, notes, affiliateCode) {
    var items = Cart.get();
    var total = Cart.total();
    var BACKEND = 'https://misrsteel-backend.vercel.app';
    try {
      var r = await fetch(BACKEND + '/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, customerPhone, customerCountry,
          items: items.map(function(i) {
            return { nameAr:i.nameAr, qty:i.qty, priceUSD:i.price, frameColor:i.frameColor, fabricColor:i.fabricColor };
          }),
          totalUSD: total,
          notes: notes || '',
          affiliateCode: affiliateCode || '',
          source: 'website',
        })
      });
      var d = await r.json();
      return d;
    } catch(e) {
      return { success:false, error:e.message };
    }
  }
};

// Auto-update badge on page load
document.addEventListener('DOMContentLoaded', function() {
  Cart.updateBadge();
});

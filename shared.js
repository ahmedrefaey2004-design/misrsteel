/* MISR STEEL — shared.js v2 */

var USD_EGP = parseFloat(localStorage.getItem('ms_rate') || '50.85');

function fetchRate(){
  fetch('https://api.exchangerate-api.com/v4/latest/USD')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.rates && d.rates.EGP){
        USD_EGP = parseFloat(d.rates.EGP.toFixed(2));
        localStorage.setItem('ms_rate', USD_EGP);
        document.querySelectorAll('.rate-display').forEach(function(el){ el.textContent = USD_EGP.toFixed(2); });
        document.querySelectorAll('[data-usd]').forEach(function(el){
          var usd = parseFloat(el.getAttribute('data-usd'));
          el.textContent = Math.round(usd * USD_EGP).toLocaleString() + ' ج.م';
        });
      }
    }).catch(function(){
      document.querySelectorAll('.rate-display').forEach(function(el){ el.textContent = USD_EGP.toFixed(2); });
    });
}

function toggleLang(){
  document.body.classList.toggle('en');
  document.documentElement.dir = document.body.classList.contains('en') ? 'ltr' : 'rtl';
  localStorage.setItem('ms_lang', document.body.classList.contains('en') ? 'en' : 'ar');
}

function showToast(msg, type){
  var t = document.getElementById('toast') || document.querySelector('.toast');
  if(!t) return;
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

var Cart = {
  items: [],

  load: function(){
    var raw = localStorage.getItem('ms_cart');
    if(!raw){
      this.items = [];
      this.updateBadge();
      return this.items;
    }

    try {
      var parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      this.items = [];
    }

    this.updateBadge();
    return this.items;
  },

  save: function(){
    localStorage.setItem('ms_cart', JSON.stringify(this.items));
    this.updateBadge();
    return this.items;
  },

  save: function(){
    localStorage.setItem('ms_cart', JSON.stringify(this.items));
    this.updateBadge();
    return this.items;
  },

  save: function(){
    localStorage.setItem('ms_cart', JSON.stringify(this.items));
    this.updateBadge();
  },

  add: function(productOrId, qtyOrName, price, img){
    var nextItem;

    // Signature 1 (new): add(productObj, qty)
    if(productOrId && typeof productOrId === 'object'){
      var p = productOrId;
      var qty = parseInt(qtyOrName, 10);
      qty = Number.isFinite(qty) && qty > 0 ? qty : 1;
      nextItem = {
        id: p.id,
        name: p.name || p.nameAr || 'منتج',
        nameAr: p.nameAr || p.name || 'منتج',
        price: Number(p.price || 0),
        img: p.img || p.image || '',
        qty: qty
      };
    } else {
      // Signature 2 (legacy): add(id, name, price, img)
      nextItem = {
        id: productOrId,
        name: qtyOrName || 'منتج',
        nameAr: qtyOrName || 'منتج',
        price: Number(price || 0),
        img: img || '',
        qty: 1
      };
    }

    var ex = this.items.find(function(i){ return String(i.id) === String(nextItem.id); });
    if(ex){
      ex.qty = (parseInt(ex.qty, 10) || 0) + nextItem.qty;
      if(!ex.nameAr) ex.nameAr = ex.name || nextItem.nameAr;
      if(!ex.name) ex.name = ex.nameAr || nextItem.name;
      if(!ex.price && nextItem.price) ex.price = nextItem.price;
      if(!ex.img && nextItem.img) ex.img = nextItem.img;
    } else {
      this.items.push(nextItem);
    }

    this.save();
  },

  add: function(productOrId, qtyOrName, price, img){
    var nextItem;

    // Signature 1 (new): add(productObj, qty)
    if(productOrId && typeof productOrId === 'object'){
      var p = productOrId;
      var qty = parseInt(qtyOrName, 10);
      qty = Number.isFinite(qty) && qty > 0 ? qty : 1;
      nextItem = {
        id: p.id,
        name: p.name || p.nameAr || 'منتج',
        nameAr: p.nameAr || p.name || 'منتج',
        price: Number(p.price || 0),
        img: p.img || p.image || '',
        qty: qty
      };
    } else {
      // Signature 2 (legacy): add(id, name, price, img)
      nextItem = {
        id: productOrId,
        name: qtyOrName || 'منتج',
        nameAr: qtyOrName || 'منتج',
        price: Number(price || 0),
        img: img || '',
        qty: 1
      };
    }

    var ex = this.items.find(function(i){ return String(i.id) === String(nextItem.id); });
    if(ex){
      ex.qty = (parseInt(ex.qty, 10) || 0) + nextItem.qty;
      if(!ex.nameAr) ex.nameAr = ex.name || nextItem.nameAr;
      if(!ex.name) ex.name = ex.nameAr || nextItem.name;
      if(!ex.price && nextItem.price) ex.price = nextItem.price;
      if(!ex.img && nextItem.img) ex.img = nextItem.img;
    } else {
      this.items.push(nextItem);
    }

    this.save();
  },

  add: function(productOrId, qtyOrName, price, img){
    var nextItem;

    // Signature 1 (new): add(productObj, qty)
    if(productOrId && typeof productOrId === 'object'){
      var p = productOrId;
      var qty = parseInt(qtyOrName, 10);
      qty = Number.isFinite(qty) && qty > 0 ? qty : 1;
      nextItem = {
        id: p.id,
        name: p.name || p.nameAr || 'منتج',
        nameAr: p.nameAr || p.name || 'منتج',
        price: Number(p.price || 0),
        img: p.img || p.image || '',
        qty: qty
      };
    } else {
      // Signature 2 (legacy): add(id, name, price, img)
      nextItem = {
        id: productOrId,
        name: qtyOrName || 'منتج',
        nameAr: qtyOrName || 'منتج',
        price: Number(price || 0),
        img: img || '',
        qty: 1
      };
    }

    var ex = this.items.find(function(i){ return String(i.id) === String(nextItem.id); });
    if(ex){
      ex.qty = (parseInt(ex.qty, 10) || 0) + nextItem.qty;
      if(!ex.nameAr) ex.nameAr = ex.name || nextItem.nameAr;
      if(!ex.name) ex.name = ex.nameAr || nextItem.name;
      if(!ex.price && nextItem.price) ex.price = nextItem.price;
      if(!ex.img && nextItem.img) ex.img = nextItem.img;
    } else {
      this.items.push(nextItem);
    }

    this.save();
  },

  getTotal: function(){
    return this.items.reduce(function(sum, i){
      return sum + (Number(i.price) || 0) * (parseInt(i.qty, 10) || 1);
    }, 0);
  },

  // backward compatibility for older pages
  total: function(){
    return this.getTotal();
  },

  updateBadge: function(){
    var n = this.items.reduce(function(sum, i){ return sum + (parseInt(i.qty, 10) || 1); }, 0);
    document.querySelectorAll('.cart-badge').forEach(function(b){
      b.textContent = n;
      b.style.display = n > 0 ? 'flex' : 'none';
    });
  }
};

function buildNav(active){
  function isActive(page){ return active === page ? ' style="color:var(--orange);font-weight:700"' : ''; }
  return '' +
    '<header style="position:sticky;top:0;z-index:1000;background:#fff;border-bottom:1px solid #eee">' +
      '<div style="max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:12px;justify-content:space-between">' +
        '<a href="index.html" style="text-decoration:none;color:#111;font-weight:800">MISR STEEL</a>' +
        '<nav style="display:flex;gap:12px;align-items:center;font-size:13px">' +
          '<a href="shop.html"' + isActive('shop') + '>المتجر</a>' +
          '<a href="contracts.html"' + isActive('contracts') + '>العقود</a>' +
          '<button onclick="toggleLang()" style="border:1px solid #ddd;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer">AR/EN</button>' +
          '<a href="shop.html#checkout" style="position:relative;text-decoration:none;border:1px solid #ddd;border-radius:8px;padding:6px 10px">' +
            '🛒 <span class="cart-badge" style="display:none;position:absolute;top:-8px;right:-8px;min-width:18px;height:18px;border-radius:999px;background:#ff6a00;color:#fff;font-size:11px;align-items:center;justify-content:center;padding:0 4px">0</span>' +
          '</a>' +
        '</nav>' +
      '</div>' +
    '</header>';
}

function buildCartDrawer(){
  return '';
}

function buildFooter(){
  return '' +
    '<footer style="margin-top:40px;padding:24px 16px;text-align:center;color:#777;border-top:1px solid #eee;font-size:12px">' +
      '© MISR STEEL' +
    '</footer>';
}

document.addEventListener('DOMContentLoaded', function(){
  var saved = localStorage.getItem('ms_lang');
  if(saved === 'en'){
    document.body.classList.add('en');
    document.documentElement.dir = 'ltr';
  }
  Cart.load();
  fetchRate();
  setInterval(fetchRate, 30 * 60 * 1000);
});

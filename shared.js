/* shared.js — MISR STEEL shared utilities */

// ══════════════════════════════════════════════
// LANGUAGE TOGGLE
// ══════════════════════════════════════════════
function toggleLang(){
  var isEn = document.body.classList.toggle('en');
  document.documentElement.lang = isEn ? 'en' : 'ar';
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';
  localStorage.setItem('ms_lang', isEn ? 'en' : 'ar');
}
(function(){
  var saved = localStorage.getItem('ms_lang');
  if(saved === 'en'){
    document.body.classList.add('en');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }
})();

// ══════════════════════════════════════════════
// EXCHANGE RATE — USD/EGP live
// ══════════════════════════════════════════════
var USD_EGP = 50.85; // fallback default

function fetchExchangeRate(){
  // Free API — exchangerate-api (no key needed for basic)
  fetch('https://api.exchangerate-api.com/v4/latest/USD')
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data && data.rates && data.rates.EGP){
        USD_EGP = parseFloat(data.rates.EGP.toFixed(2));
        updateRateDisplay();
        updateProductPricesEGP();
        localStorage.setItem('ms_usd_egp', USD_EGP);
        localStorage.setItem('ms_rate_time', Date.now());
      }
    })
    .catch(function(){
      // Try cached value
      var cached = localStorage.getItem('ms_usd_egp');
      if(cached) USD_EGP = parseFloat(cached);
      updateRateDisplay();
      updateProductPricesEGP();
    });
}

function updateRateDisplay(){
  var els = document.querySelectorAll('.rate-display');
  els.forEach(function(el){
    el.textContent = USD_EGP.toFixed(2);
  });
}

function usdToEgp(usd){
  return Math.round(usd * USD_EGP).toLocaleString('ar-EG');
}

function updateProductPricesEGP(){
  var els = document.querySelectorAll('[data-usd]');
  els.forEach(function(el){
    var usd = parseFloat(el.getAttribute('data-usd'));
    el.textContent = usdToEgp(usd) + ' ج.م';
  });
}

// ══════════════════════════════════════════════
// CART
// ══════════════════════════════════════════════
var Cart = {
  items: [],
  
  load: function(){
    var saved = localStorage.getItem('ms_cart');
    this.items = saved ? JSON.parse(saved) : [];
    this.updateBadge();
  },
  
  save: function(){
    localStorage.setItem('ms_cart', JSON.stringify(this.items));
    this.updateBadge();
  },
  
  add: function(product, qty){
    var existing = this.items.find(function(i){ return i.id === product.id; });
    if(existing){
      existing.qty = Math.max(product.minQty, existing.qty + qty);
    } else {
      this.items.push({ id: product.id, nameAr: product.nameAr, nameEn: product.nameEn, price: product.price, qty: Math.max(product.minQty, qty), minQty: product.minQty, step: product.step, svgKey: product.svgKey });
    }
    this.save();
    showToast('✓ ' + product.nameAr + ' — أضيف للسلة', 'success');
  },
  
  remove: function(productId){
    this.items = this.items.filter(function(i){ return i.id !== productId; });
    this.save();
    this.renderDrawer();
  },
  
  updateQty: function(productId, newQty){
    var item = this.items.find(function(i){ return i.id === productId; });
    if(item){
      if(newQty < item.minQty){ this.remove(productId); return; }
      item.qty = newQty;
      this.save();
      this.renderDrawer();
    }
  },
  
  getTotal: function(){
    return this.items.reduce(function(sum, i){ return sum + i.price * i.qty; }, 0);
  },
  
  getTotalQty: function(){
    return this.items.reduce(function(sum, i){ return sum + i.qty; }, 0);
  },
  
  updateBadge: function(){
    var badges = document.querySelectorAll('.cart-badge');
    var count = this.getTotalQty();
    badges.forEach(function(b){
      b.textContent = count > 99 ? '99+' : count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
  },
  
  openDrawer: function(){
    this.renderDrawer();
    document.getElementById('cartOverlay').classList.add('open');
    document.getElementById('cartDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  
  closeDrawer: function(){
    document.getElementById('cartOverlay').classList.remove('open');
    document.getElementById('cartDrawer').classList.remove('open');
    document.body.style.overflow = '';
  },
  
  renderDrawer: function(){
    var container = document.getElementById('cartItemsList');
    if(!container) return;
    
    if(this.items.length === 0){
      container.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p class="ar">السلة فاضية</p><p class="en-t">Your cart is empty</p></div>';
      document.getElementById('cartFooter').style.display = 'none';
      return;
    }
    
    document.getElementById('cartFooter').style.display = 'block';
    var html = '';
    var self = this;
    this.items.forEach(function(item){
      var subtotal = (item.price * item.qty).toLocaleString();
      html += '<div class="cart-item">' +
        '<div class="cart-item-img">' + getProductSVG(item.svgKey, 50, 44) + '</div>' +
        '<div>' +
          '<div class="cart-item-name"><span class="ar">' + item.nameAr + '</span><span class="en-t">' + item.nameEn + '</span></div>' +
          '<div class="cart-item-price">$' + subtotal + '</div>' +
          '<div class="cart-item-qty">' +
            '<button class="ciq-btn" onclick="Cart.updateQty(' + item.id + ',' + (item.qty - item.step) + ')">−</button>' +
            '<span class="ciq-val">' + item.qty + '</span>' +
            '<button class="ciq-btn" onclick="Cart.updateQty(' + item.id + ',' + (item.qty + item.step) + ')">+</button>' +
          '</div>' +
        '</div>' +
        '<button class="cart-remove" onclick="Cart.remove(' + item.id + ')">✕</button>' +
      '</div>';
    });
    container.innerHTML = html;
    
    var total = this.getTotal();
    var deposit = Math.round(total * 0.5);
    document.getElementById('cartTotalAmt').textContent = '$' + total.toLocaleString();
    document.getElementById('cartDepositAmt').textContent = '$' + deposit.toLocaleString();
    document.getElementById('cartTotalEGP').textContent = usdToEgp(total) + ' ج.م';
  },
  
  checkout: function(){
    if(this.items.length === 0){ showToast('السلة فاضية!', 'error'); return; }
    localStorage.setItem('ms_checkout_cart', JSON.stringify(this.items));
    window.location.href = 'shop.html#checkout';
  }
};

// ══════════════════════════════════════════════
// AUTH (simple local session)
// ══════════════════════════════════════════════
var Auth = {
  getUser: function(){ return JSON.parse(localStorage.getItem('ms_user') || 'null'); },
  getAffiliate: function(){ return JSON.parse(localStorage.getItem('ms_affiliate') || 'null'); },
  
  loginUser: function(data){
    localStorage.setItem('ms_user', JSON.stringify(data));
    this.updateNavState();
  },
  loginAffiliate: function(data){
    localStorage.setItem('ms_affiliate', JSON.stringify(data));
  },
  logout: function(){
    localStorage.removeItem('ms_user');
    this.updateNavState();
    window.location.href = 'index.html';
  },
  
  updateNavState: function(){
    var user = this.getUser();
    var loginBtns = document.querySelectorAll('.nav-login-btn');
    var userMenus = document.querySelectorAll('.nav-user-menu');
    if(user){
      loginBtns.forEach(function(b){ b.style.display='none'; });
      userMenus.forEach(function(m){ m.style.display='flex'; m.querySelector('.user-name').textContent = user.name; });
    } else {
      loginBtns.forEach(function(b){ b.style.display='block'; });
      userMenus.forEach(function(m){ m.style.display='none'; });
    }
  }
};

// ══════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════
function showToast(msg, type){
  var toast = document.getElementById('globalToast');
  if(!toast) return;
  toast.textContent = msg;
  toast.className = 'toast ' + (type || '');
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ toast.classList.remove('show'); }, 2800);
}

// ══════════════════════════════════════════════
// PRODUCT SVG HELPER (inline mini SVG)
// ══════════════════════════════════════════════
function getProductSVG(key, w, h){
  w = w || 80; h = h || 90;
  var svgs = {
    chair: '<svg width="'+w+'" height="'+h+'" viewBox="0 0 120 160"><defs><linearGradient id="ms1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#606870"/><stop offset="45%" stop-color="#e8f0f8"/><stop offset="100%" stop-color="#606870"/></linearGradient><linearGradient id="ms2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d0d8e0"/><stop offset="100%" stop-color="#708090"/></linearGradient><linearGradient id="msg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8d49a"/><stop offset="100%" stop-color="#8a6e2a"/></linearGradient></defs><ellipse cx="60" cy="157" rx="45" ry="5" fill="rgba(0,0,0,.3)"/><rect x="18" y="10" width="10" height="85" rx="2" fill="url(#ms2)"/><rect x="92" y="10" width="10" height="85" rx="2" fill="url(#ms2)"/><rect x="18" y="14" width="84" height="7" rx="1.5" fill="url(#ms1)"/><rect x="18" y="30" width="84" height="6" rx="1.5" fill="url(#ms1)"/><rect x="18" y="44" width="84" height="6" rx="1.5" fill="url(#ms1)"/><rect x="18" y="58" width="84" height="6" rx="1.5" fill="url(#ms1)"/><rect x="18" y="72" width="84" height="6" rx="1.5" fill="url(#ms1)"/><rect x="10" y="88" width="100" height="16" rx="3" fill="url(#ms2)"/><rect x="12" y="90" width="96" height="12" rx="2" fill="#0a0a0a"/><rect x="18" y="104" width="7" height="46" rx="2" fill="url(#ms2)"/><rect x="95" y="104" width="7" height="46" rx="2" fill="url(#ms2)"/><rect x="18" y="128" width="84" height="5" rx="1.5" fill="url(#ms1)"/><ellipse cx="21" cy="152" rx="7" ry="3" fill="url(#msg)"/><ellipse cx="99" cy="152" rx="7" ry="3" fill="url(#msg)"/><rect x="22" y="14" width="2" height="72" rx="1" fill="rgba(255,255,255,.32)"/></svg>',
    
    highback: '<svg width="'+w+'" height="'+h+'" viewBox="0 0 120 180"><ellipse cx="60" cy="177" rx="40" ry="5" fill="rgba(0,0,0,.3)"/><rect x="22" y="5" width="9" height="100" rx="2" fill="url(#ms2)"/><rect x="89" y="5" width="9" height="100" rx="2" fill="url(#ms2)"/><rect x="22" y="8" width="76" height="78" rx="3" fill="#0d0d0d"/><rect x="28" y="14" width="64" height="5" rx="1.5" fill="url(#ms1)" opacity=".5"/><rect x="28" y="28" width="64" height="5" rx="1.5" fill="url(#ms1)" opacity=".4"/><rect x="28" y="42" width="64" height="5" rx="1.5" fill="url(#ms1)" opacity=".4"/><rect x="28" y="56" width="64" height="5" rx="1.5" fill="url(#ms1)" opacity=".4"/><rect x="12" y="100" width="96" height="14" rx="3" fill="url(#ms2)"/><rect x="14" y="101" width="92" height="11" rx="2" fill="#0a0a0a"/><rect x="20" y="114" width="7" height="48" rx="2" fill="url(#ms2)"/><rect x="93" y="114" width="7" height="48" rx="2" fill="url(#ms2)"/><ellipse cx="23" cy="164" rx="7" ry="3" fill="url(#msg)"/><ellipse cx="97" cy="164" rx="7" ry="3" fill="url(#msg)"/></svg>',
    
    armchair: '<svg width="'+w+'" height="'+h+'" viewBox="0 0 140 160"><ellipse cx="70" cy="157" rx="50" ry="5" fill="rgba(0,0,0,.3)"/><rect x="22" y="12" width="96" height="66" rx="4" fill="#0a0a0a"/><rect x="28" y="18" width="84" height="5" rx="1.5" fill="url(#ms1)" opacity=".5"/><rect x="28" y="32" width="84" height="5" rx="1.5" fill="url(#ms1)" opacity=".4"/><rect x="28" y="46" width="84" height="5" rx="1.5" fill="url(#ms1)" opacity=".4"/><rect x="8" y="60" width="20" height="6" rx="3" fill="url(#ms1)"/><rect x="112" y="60" width="20" height="6" rx="3" fill="url(#ms1)"/><rect x="12" y="66" width="12" height="28" rx="2" fill="url(#ms2)"/><rect x="116" y="66" width="12" height="28" rx="2" fill="url(#ms2)"/><rect x="10" y="76" width="120" height="14" rx="3" fill="url(#ms2)"/><rect x="12" y="77" width="116" height="11" rx="2" fill="#0a0a0a"/><rect x="18" y="90" width="8" height="48" rx="2" fill="url(#ms2)"/><rect x="114" y="90" width="8" height="48" rx="2" fill="url(#ms2)"/><ellipse cx="22" cy="140" rx="8" ry="3" fill="url(#msg)"/><ellipse cx="118" cy="140" rx="8" ry="3" fill="url(#msg)"/></svg>',
    
    rtable: '<svg width="'+w+'" height="'+h+'" viewBox="0 0 160 130"><ellipse cx="80" cy="126" rx="70" ry="6" fill="rgba(0,0,0,.3)"/><ellipse cx="80" cy="30" rx="70" ry="22" fill="url(#ms2)"/><ellipse cx="80" cy="28" rx="68" ry="20" fill="url(#ms2)"/><ellipse cx="60" cy="22" rx="20" ry="8" fill="rgba(255,255,255,.22)" transform="rotate(-15 60 22)"/><ellipse cx="80" cy="28" rx="68" ry="20" fill="none" stroke="url(#msg)" stroke-width="2"/><rect x="73" y="48" width="14" height="50" rx="4" fill="url(#ms2)"/><rect x="30" y="96" width="100" height="10" rx="4" fill="url(#ms1)"/><ellipse cx="35" cy="108" rx="9" ry="4" fill="url(#msg)"/><ellipse cx="125" cy="108" rx="9" ry="4" fill="url(#msg)"/><ellipse cx="80" cy="112" rx="9" ry="4" fill="url(#msg)"/></svg>',
    
    table: '<svg width="'+w+'" height="'+h+'" viewBox="0 0 180 120"><ellipse cx="90" cy="116" rx="84" ry="6" fill="rgba(0,0,0,.3)"/><rect x="10" y="18" width="160" height="32" rx="3" fill="url(#ms2)"/><rect x="12" y="20" width="156" height="28" rx="2" fill="url(#ms2)"/><rect x="12" y="18" width="156" height="4" rx="2" fill="url(#msg)" opacity=".7"/><rect x="18" y="50" width="8" height="50" rx="2" fill="url(#ms2)"/><rect x="154" y="50" width="8" height="50" rx="2" fill="url(#ms2)"/><rect x="60" y="50" width="8" height="50" rx="2" fill="url(#ms2)"/><rect x="112" y="50" width="8" height="50" rx="2" fill="url(#ms2)"/><rect x="18" y="74" width="144" height="4" rx="1.5" fill="url(#ms1)"/><ellipse cx="22" cy="102" rx="7" ry="3.5" fill="url(#msg)"/><ellipse cx="158" cy="102" rx="7" ry="3.5" fill="url(#msg)"/><ellipse cx="64" cy="102" rx="7" ry="3.5" fill="url(#msg)"/><ellipse cx="116" cy="102" rx="7" ry="3.5" fill="url(#msg)"/></svg>'
  };
  return svgs[key] || svgs['chair'];
}

// ══════════════════════════════════════════════
// NAV HTML BUILDER
// ══════════════════════════════════════════════
function buildNav(activePage){
  var user = Auth.getUser();
  return '<div class="topbar"><div class="topbar-rate"><div class="rate-live-dot"></div><span class="ar">سعر الدولار اليوم:</span><span class="en-t">USD/EGP today:</span><span class="topbar-rate-num"><span class="rate-display">'+USD_EGP.toFixed(2)+'</span> ج.م</span></div><div class="topbar-links"><a href="tel:+201000000000" class="ar">📞 اتصل بنا</a><a href="tel:+201000000000" class="en-t">📞 Call us</a><a href="https://wa.me/201000000000" target="_blank">💬 WhatsApp</a></div></div>' +
  '<nav class="main-nav"><div class="nav-inner"><a class="nav-logo" href="index.html"><div class="nav-logo-ar ar">مصر ستيل</div><div class="nav-logo-en">MISR STEEL</div></a><div class="nav-links"><a href="index.html"'+(activePage==='home'?' class="active"':'')+'>🏠 <span class="ar">الرئيسية</span><span class="en-t">Home</span></a><a href="index.html#catalog"'+(activePage==='catalog'?' class="active"':'')+'>📦 <span class="ar">المنتجات</span><span class="en-t">Products</span></a><a href="shop.html"'+(activePage==='shop'?' class="active"':'')+'>🛒 <span class="ar">المتجر</span><span class="en-t">Shop</span></a><a href="contracts.html"'+(activePage==='contracts'?' class="active"':'')+'>📄 <span class="ar">العقود</span><span class="en-t">Contracts</span></a><a href="misrsteel_affiliate.html">🤝 <span class="ar">انضم كمسوّق</span><span class="en-t">Become Affiliate</span></a></div><div class="nav-search"><span class="nav-search-icon">🔍</span><input type="text" placeholder="" id="navSearchInp"></div><div class="nav-actions"><button class="nav-icon-btn" onclick="Cart.openDrawer()">🛒<span class="cart-badge" style="display:none">0</span></button>'+(user ? '<div class="nav-user-menu" style="display:flex;align-items:center;gap:8px;cursor:pointer"><span style="font-size:22px">👤</span><span class="user-name" style="font-size:13px;font-weight:600">'+user.name+'</span><button onclick="Auth.logout()" style="padding:5px 10px;border:1px solid #e8e8e8;background:transparent;cursor:pointer;font-size:11px;border-radius:4px;font-family:inherit">خروج</button></div>' : '<a href="login.html" class="nav-login-btn"><span class="ar">دخول</span><span class="en-t">Login</span></a>')+'<button class="lang-toggle" onclick="toggleLang()">EN / ع</button></div></div></nav>';
}

function buildFooter(){
  return '<footer class="main-footer"><div class="footer-top"><div class="footer-brand"><div class="fb-logo-ar ar">مصر ستيل</div><div class="fb-logo-en">MISR STEEL</div><p class="ar">مصنع أثاث استانلس متخصص في تصنيع الكراسي والترابيزات للفنادق والمطاعم وقاعات الأفراح. تصدير لجميع أنحاء العالم.</p><p class="en-t">Specialized stainless furniture factory for hotels, restaurants and event halls. Exporting worldwide.</p><a href="https://wa.me/201000000000" class="footer-wa" target="_blank">💬 <span class="ar">واتساب</span><span class="en-t">WhatsApp</span></a></div><div class="footer-col"><h4 class="ar">الصفحات</h4><h4 class="en-t">Pages</h4><a href="index.html"><span class="ar">الرئيسية</span><span class="en-t">Home</span></a><a href="shop.html"><span class="ar">المتجر</span><span class="en-t">Shop</span></a><a href="contracts.html"><span class="ar">العقود</span><span class="en-t">Contracts</span></a><a href="misrsteel_affiliate.html"><span class="ar">برنامج المسوّقين</span><span class="en-t">Affiliate Program</span></a></div><div class="footer-col"><h4 class="ar">معلومات</h4><h4 class="en-t">Info</h4><a href="#"><span class="ar">الشحن والتسليم</span><span class="en-t">Shipping & Delivery</span></a><a href="#"><span class="ar">سياسة الاسترداد</span><span class="en-t">Refund Policy</span></a><a href="contracts.html"><span class="ar">الشروط والأحكام</span><span class="en-t">Terms & Conditions</span></a></div><div class="footer-col"><h4 class="ar">تواصل</h4><h4 class="en-t">Contact</h4><a href="#">📍 <span class="ar">القاهرة، مصر</span><span class="en-t">Cairo, Egypt</span></a><a href="tel:+201000000000">📞 +20 100 000 0000</a><a href="mailto:info@misrsteel.com">✉️ info@misrsteel.com</a></div></div><div class="footer-bottom">© 2025 MISR STEEL · مصر ستيل · <span class="ar">جميع الحقوق محفوظة</span><span class="en-t">All rights reserved</span></div></footer>';
}

function buildCartDrawer(){
  return '<div class="cart-overlay" id="cartOverlay" onclick="Cart.closeDrawer()"></div><div class="cart-drawer" id="cartDrawer"><div class="cart-header"><h3><span class="ar">سلة المشتريات</span><span class="en-t">Shopping Cart</span></h3><button class="cart-close" onclick="Cart.closeDrawer()">✕</button></div><div class="cart-items" id="cartItemsList"></div><div class="cart-footer" id="cartFooter" style="display:none"><div class="cart-total-row"><span class="ar">الإجمالي (USD)</span><span class="en-t">Total (USD)</span><span class="val" id="cartTotalAmt">$0</span></div><div class="cart-total-row"><span class="ar">بالجنيه المصري</span><span class="en-t">In EGP</span><span class="val" id="cartTotalEGP">0 ج.م</span></div><div class="deposit-info"><strong class="ar">المقدم المطلوب (50%)</strong><strong class="en-t">Deposit required (50%)</strong><span class="ar">سيتم سداد </span><strong id="cartDepositAmt">$0</strong><span class="ar"> الآن لتأكيد الطلب، والباقي قبل الشحن.</span><span class="en-t"> deposit now to confirm, balance before shipping.</span></div><button class="btn btn-orange btn-full btn-lg" onclick="Cart.checkout()">🔒 <span class="ar">إتمام الطلب</span><span class="en-t">Proceed to Checkout</span></button></div></div>';
}

// Global toast element
document.addEventListener('DOMContentLoaded', function(){
  if(!document.getElementById('globalToast')){
    var t = document.createElement('div');
    t.id = 'globalToast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  Cart.load();
  Auth.updateNavState();
  fetchExchangeRate();
  // Refresh rate every 30 min
  setInterval(fetchExchangeRate, 30 * 60 * 1000);
  // Nav search
  var srch = document.getElementById('navSearchInp');
  if(srch){
    srch.placeholder = document.body.classList.contains('en') ? 'Search products...' : 'ابحث عن منتج...';
    srch.addEventListener('keydown', function(e){ if(e.key==='Enter') window.location.href='shop.html?q='+encodeURIComponent(this.value); });
  }
});

/* MISR STEEL — shared.js v2 */

var USD_EGP = parseFloat(localStorage.getItem('ms_rate')||'50.85');

function fetchRate(){
  fetch('https://api.exchangerate-api.com/v4/latest/USD')
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.rates&&d.rates.EGP){
        USD_EGP=parseFloat(d.rates.EGP.toFixed(2));
        localStorage.setItem('ms_rate',USD_EGP);
        document.querySelectorAll('.rate-display').forEach(function(el){el.textContent=USD_EGP.toFixed(2);});
        document.querySelectorAll('[data-usd]').forEach(function(el){
          var usd=parseFloat(el.getAttribute('data-usd'));
          el.textContent=Math.round(usd*USD_EGP).toLocaleString()+' ج.م';
        });
      }
    }).catch(function(){
      document.querySelectorAll('.rate-display').forEach(function(el){el.textContent=USD_EGP.toFixed(2);});
    });
}

function toggleLang(){
  document.body.classList.toggle('en');
  document.documentElement.dir=document.body.classList.contains('en')?'ltr':'rtl';
  localStorage.setItem('ms_lang',document.body.classList.contains('en')?'en':'ar');
}

function showToast(msg,type){
  var t=document.getElementById('toast')||document.querySelector('.toast');
  if(!t)return;
  t.textContent=msg;
  t.className='toast '+(type||'');
  t.classList.add('show');
  clearTimeout(t._t);
  t._t=setTimeout(function(){t.classList.remove('show');},2800);
}

var Cart={
  items:JSON.parse(localStorage.getItem('ms_cart')||'[]'),
  add:function(id,name,price,img){
    var ex=this.items.find(function(i){return i.id===id;});
    if(ex)ex.qty=(ex.qty||1)+1;
    else this.items.push({id:id,name:name,price:price,img:img,qty:1});
    localStorage.setItem('ms_cart',JSON.stringify(this.items));
    this.updateBadge();
  },
  total:function(){return this.items.reduce(function(s,i){return s+i.price*(i.qty||1);},0);},
  updateBadge:function(){
    var n=this.items.reduce(function(s,i){return s+(i.qty||1);},0);
    document.querySelectorAll('.cart-badge').forEach(function(b){b.textContent=n;b.style.display=n>0?'flex':'none';});
  }
};

document.addEventListener('DOMContentLoaded',function(){
  var saved=localStorage.getItem('ms_lang');
  if(saved==='en'){document.body.classList.add('en');document.documentElement.dir='ltr';}
  Cart.updateBadge();
  fetchRate();
  setInterval(fetchRate,30*60*1000);
});

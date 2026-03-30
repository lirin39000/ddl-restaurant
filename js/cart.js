// ── Cart ──────────────────────────────────────────────────────────────────

function openCart() {
  const ct = todayCart();
  document.getElementById("cart-items-list").innerHTML = ct.length === 0
    ? `<div class="empty-hint">今天还没完成任何任务<br>去点 + 打卡第一道菜！🍔</div>`
    : ct.map(t => {
        const c = CATS.find(x => x.id === t.catId);
        return `<div class="cart-item"><div class="cart-item-icon">${foodEmoji(t,c||CATS[0])}</div><div class="cart-item-info"><div class="cart-item-name">${esc(t.text)}</div><div class="cart-item-cat">${c?.label||''}${t.date?' · '+t.date:''}</div></div><div class="cart-item-price">￥9.9</div></div>`;
      }).join('');
  document.getElementById("cart-modal").classList.add("show");
}

document.getElementById("cart-modal").addEventListener("click", function(e) {
  if (e.target === this) this.classList.remove("show");
});

// ── Receipt ───────────────────────────────────────────────────────────────

function generateBarcode() {
  const svg = document.getElementById("r-barcode-svg");
  let bars = ""; let x = 1; const seed = Date.now() % 99999;
  for (let i = 0; i < 80; i++) {
    const w = ((seed*(i+3)*17)%3)+1;
    const gap = ((seed*(i+5)*11)%3)+1;
    if ((seed*(i+2)*7)%4>0) bars += `<rect x="${x}" y="2" width="${w}" height="${((seed*(i+1))%2===0?48:38)}" fill="#111"/>`;
    x += w + gap; if (x > 196) break;
  }
  svg.innerHTML = bars;
  document.getElementById("r-barcode-num").textContent = String(seed + Date.now()).slice(-13).padStart(13, '0');
}

function placeOrder() {
  const ct = todayCart(); if (ct.length === 0) return;
  const now = new Date();
  document.getElementById("r-date").textContent = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById("r-time").textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  document.getElementById("r-order-no").textContent = '#' + Math.floor(Math.random() * 900000 + 100000);
  document.getElementById("r-items-list").innerHTML = ct.map(t => {
    const code = String(Math.floor(Math.random() * 90 + 10));
    return `<div class="r-item"><span class="r-i-no">${code}</span><span class="r-i-name">*${esc(t.text)}</span><span class="r-i-qty">x1</span><span class="r-i-price">￥9.9</span></div>`;
  }).join('');
  const total = (ct.length * 9.9).toFixed(1);
  document.getElementById("r-subtotal").textContent = total;
  document.getElementById("r-total").textContent = total;
  document.getElementById("r-motto").textContent = MOTTOS[Math.floor(Math.random() * MOTTOS.length)];
  generateBarcode();
  closeModal("cart-modal");
  setTimeout(() => {
    const page = document.getElementById("receipt-page");
    page.classList.add("show");
    setTimeout(() => { const s = page.querySelector('.receipt-scroll'); if (s) s.scrollTop = 0; }, 50);
  }, 200);
}

function closeReceipt() { document.getElementById("receipt-page").classList.remove("show"); }

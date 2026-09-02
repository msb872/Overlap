/* ---------- منطق اصلی برنامه ---------- */
let templatesData = [];
let isEditing = false;
let editingIndex = -1;
let correctionHistory = []; // [{title, count}]
const inputsOrder = ['length','seamThickness','coverHook','bodyHook','headThickness','bodyThickness'];

function toMM(thou){ return thou * 0.0254; }
function toThou(mm){ return mm / 0.0254; }
function formatVal(thou, unit){ return unit==='mm' ? (toMM(thou).toFixed(2)+' (mm)') : (thou.toFixed(2)+' (thou)'); }

function updateProgress(){
  const ins = inputsOrder.map(id => document.getElementById(id));
  const filled = ins.filter(i => i.value !== '').length;
  document.getElementById('progress').style.width = (filled / ins.length * 100) + '%';
}

/* --- فوکوس مطمئن با چند تلاش (RAF + timeout) --- */
function focusWithRetry(id, tries=8){
  const el = document.getElementById(id);
  if(!el) return;
  // ابتدا هرچه فوکوس دارد blur شود تا مزاحم نباشد
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  const tryFocus = (n) => {
    if (n <= 0) return;
    el.focus({preventScroll:true});
    if (document.activeElement !== el) {
      // یک بار با RAF و یک بار با timeout تلاش می‌کنیم
      requestAnimationFrame(() => {
        el.focus({preventScroll:true});
        if (document.activeElement !== el) {
          setTimeout(() => tryFocus(n-1), 16);
        }
      });
    }
  };
  // شروع تلاش‌ها بعد از یک tick
  setTimeout(() => tryFocus(tries), 0);
}

document.querySelectorAll('.input-row input, #unitSelect').forEach(i => {
  i.addEventListener('input', e => {
    if(e.target.id === 'unitSelect'){
      const unit = e.target.value;
      document.getElementById('infoText').innerHTML =
        unit === 'thou'
          ? '🔹 تمام مقادیر بر حسب <strong>0.001 اینچ</strong> هستند 🔹'
          : '🔹 تمام مقادیر بر حسب <strong>میلیمتر</strong> هستند 🔹';
    }
    updateProgress();
  });
});
inputsOrder.forEach((id, i) => {
  const el = document.getElementById(id);
  el.addEventListener('keydown', e => {
    if(e.key === 'Enter'){
      e.preventDefault();
      if(i < inputsOrder.length - 1){
        document.getElementById(inputsOrder[i + 1]).focus();
      } else {
        document.getElementById('calcBtn').focus();
      }
    }
  });
});
document.getElementById('calcBtn').addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); addTemplate(); } });

const LIMITS_T = { CH_MIN:70, BH_MIN:70, DIFF_MAX:7.8, FREE_MAX:7.5, OL_MIN:45 };

function addTemplate(){
  const unit = document.getElementById('unitSelect').value;
  let raw = inputsOrder.map(id => parseFloat(document.getElementById(id).value));
  if(raw.some(v => isNaN(v) || v < 0)){ alert('لطفاً همه مقادیر را به درستی وارد کنید'); return; }
  if(unit === 'mm') raw = raw.map(v => toThou(v));
  const [L, ST, CH, BH, Te, Tb] = raw;

  const diff = Math.abs(CH - BH);
  const free = Math.abs(ST - (3*Te + 2*Tb));
  const denom = L - (2.2*Te + 1.1*Tb);
  const overlap = denom ? Math.abs((L - (CH + BH + 1.1*Te)) / denom * 100) : 0;

  const newIndex = templatesData.length;
  templatesData.push({L,ST,CH,BH,Te,Tb});

  const title = isEditing ? `اصلاحیه قالب ${editingIndex + 1}` : `قالب ${countOriginals() + 1}`;

  const th = document.createElement('th');
  th.innerHTML = `${title}<br>
    <input type="checkbox" class="editCheck" data-idx="${newIndex}">
    <button class="del" style="margin-left:6px">حذف</button>`;
  document.getElementById('headerRow').appendChild(th);

  th.querySelector('.del').onclick = () => {
    const colIndex = [...document.getElementById('headerRow').children].indexOf(th);
    th.remove();
    document.querySelectorAll('#tableBody tr').forEach(r => { if(r.children[colIndex]) r.children[colIndex].remove(); });
    removeWarningByTitle(title);
    correctionHistory = correctionHistory.filter(obj => obj.title !== title);
    renderCorr();
    isEditing = false; editingIndex = -1; document.getElementById('calcBtn').textContent = '➕ محاسبه/جدید';
  };

  const colIndex = document.getElementById('headerRow').children.length - 1;
  const vals = [L, ST, CH, BH, Te, Tb, diff, free, overlap, '-', '-'];
  addValuesToTable(colIndex, vals, unit);

  const warns = [];
  const mark = (row, msg) => {
    document.querySelectorAll('#tableBody tr')[row].children[colIndex].style.background = '#ffd2d2';
    warns.push(msg);
  };
  if (CH < LIMITS_T.CH_MIN) mark(2, `قلاب درب کمتر از ${formatVal(LIMITS_T.CH_MIN, unit)}`);
  if (BH < LIMITS_T.BH_MIN) mark(3, `قلاب بدنه کمتر از ${formatVal(LIMITS_T.BH_MIN, unit)}`);
  if (diff > LIMITS_T.DIFF_MAX) mark(6, `اختلاف قلاب بیشتر از ${formatVal(LIMITS_T.DIFF_MAX, unit)}`);
  if (free > LIMITS_T.FREE_MAX) mark(7, `فضای آزاد بیشتر از ${formatVal(LIMITS_T.FREE_MAX, unit)}`);
  if (overlap < LIMITS_T.OL_MIN) mark(8, `درصد درگیری کمتر از ${LIMITS_T.OL_MIN}%`);

  clearWarningList(title);
  clearInfoByTitle(title);

  if(warns.length > 0){ addWarning(`${title}: ${warns.join(' ؛ ')}`); }
  if (isEditing) { const baseTemplate = `قالب ${editingIndex + 1}`; addInfo(`${title}:   ${baseTemplate}  اصلاح شد`); }

  correctionHistory.push({ title, count: warns.length });
  renderCorr();

  /* --- ریست کنترل‌شده: Te/Tb را حفظ کن، بقیه چهار فیلد را پاک کن و فوکوس بده --- */
  resetOperationalInputs();           // فقط SL, ST, CH, BH پاک می‌شود
  isEditing = false;
  editingIndex = -1;
  document.getElementById('calcBtn').textContent = '➕ محاسبه/جدید';

  // فوکوس مطمئن روی SL
  focusWithRetry('length');

  updateProgress();
  /* --- پایان ریست --- */
}

function countOriginals(){
  const ths = [...document.getElementById('headerRow').children];
  let count = 0;
  for(let i=1;i<ths.length;i++){
    const title = ths[i].textContent.trim().split('\n')[0];
    if(/^قالب\s+\d+$/u.test(title)) count++;
  }
  return count;
}

function addValuesToTable(col, vals, unit){
  const rows = document.querySelectorAll('#tableBody tr');
  for(let i=0; i<vals.length; i++){
    let cell = rows[i].children[col];
    if(!cell){ cell = document.createElement('td'); rows[i].appendChild(cell); }
    const v = vals[i];
    if(typeof v === 'number'){
      if(i >= 9){ cell.textContent = v; }
      else if(i === 8){ cell.textContent = v.toFixed(1) + ' (%)'; }
      else { cell.textContent = formatVal(v, unit); }
    } else { cell.textContent = v; }
    cell.style.background = '';
  }
}

/* پیام‌ها */
function addWarning(text){ const div=document.createElement('div'); div.className='warningItem'; div.textContent=text; document.getElementById('warningList').appendChild(div); }
function addInfo(text){ const div=document.createElement('div'); div.className='infoItem'; div.textContent=text; document.getElementById('warningList').appendChild(div); }
function clearWarningList(templateTitle){
  const list=document.getElementById('warningList');
  [...list.children].forEach(child => { if(child.classList.contains('warningItem') && child.textContent.startsWith(templateTitle)) child.remove(); });
}
function clearInfoByTitle(templateTitle){
  const list=document.getElementById('warningList');
  [...list.children].forEach(child => { if(child.classList.contains('infoItem') && child.textContent.startsWith(templateTitle)) child.remove(); });
}
function removeWarningByTitle(templateTitle){
  const list=document.getElementById('warningList');
  [...list.children].forEach(child => { if(child.textContent.startsWith(templateTitle)) child.remove(); });
}
function renderCorr(){ const total=document.querySelectorAll('#warningList .warningItem').length; document.getElementById('correctionMessage').textContent = total>0 ? `جمع کل هشدارها: ${total} مورد` : ''; }

/* ویرایش: بارگذاری مقادیر */
document.addEventListener('change', e => {
  if(e.target.classList.contains('editCheck')){
    if(e.target.checked){
      isEditing = true; editingIndex = +e.target.dataset.idx; loadTemplate(editingIndex);
      document.querySelectorAll('.editCheck').forEach(chk => { if(chk !== e.target) chk.checked = false; });
      document.getElementById('calcBtn').textContent = '📝 اصلاح قالب'; document.getElementById('calcBtn').focus();
    } else {
      isEditing=false; editingIndex=-1;
      // فقط عملیاتی‌ها پاک شوند
      resetOperationalInputs();
      document.getElementById('calcBtn').textContent='➕ محاسبه/جدید';
      // فوکوس مطمئن روی SL
      focusWithRetry('length');
    }
  }
});

function loadTemplate(idx){
  const t = templatesData[idx]; if(!t) return;
  const unit = document.getElementById('unitSelect').value;
  document.getElementById('length').value        = unit==='mm'? toMM(t.L).toFixed(2)  : t.L.toFixed(2);
  document.getElementById('seamThickness').value = unit==='mm'? toMM(t.ST).toFixed(2) : t.ST.toFixed(2);
  document.getElementById('coverHook').value     = unit==='mm'? toMM(t.CH).toFixed(2) : t.CH.toFixed(2);
  document.getElementById('bodyHook').value      = unit==='mm'? toMM(t.BH).toFixed(2) : t.BH.toFixed(2);
  document.getElementById('headThickness').value = unit==='mm'? toMM(t.Te).toFixed(2) : t.Te.toFixed(2);
  document.getElementById('bodyThickness').value = unit==='mm'? toMM(t.Tb).toFixed(2) : t.Tb.toFixed(2);
}

/* فقط این تابع برای پاک‌سازی «عملیاتی‌ها» استفاده می‌شود */
function resetOperationalInputs(){
  ['length','seamThickness','coverHook','bodyHook'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function clearInputs(){
  // برای سازگاری؛ دیگر همه فیلدها را پاک نمی‌کنیم
  resetOperationalInputs();
}

/* پرینت/اکسل/HTML */
function printReport() {
  // پرسش تأیید قبل از هر تغییری
  const ok = confirm('آیا از چاپ گزارش مطمئن هستید؟');
  if (!ok) return; // لغو شد ⇒ هیچ کاری انجام نده

  // مقداردهی هدر چاپ فقط اگر چاپ تأیید شده باشد
  const name = prompt('نام کارشناس', 'مهندس خانی') || 'مهندس خانی';
  document.getElementById('reporterName').textContent = name;
  document.getElementById('containerSelected').textContent = document.getElementById('containerType').value || '-';
  document.getElementById('analysisDate').textContent = new Date().toLocaleDateString('fa-IR');

  const hdr = document.getElementById('printHeader');
  const prevVis = hdr.style.visibility;
  const restore = () => {
    hdr.style.visibility = prevVis || 'hidden';
    window.removeEventListener('afterprint', restore);
  };

  // هدر برای حالت پرینت قابل‌مشاهده شود
  hdr.style.visibility = 'visible';

  // بعد از اتمام/لغو چاپ، هدر را به حالت قبل برگردان
  window.addEventListener('afterprint', restore);

  // اجرای چاپ + fallback برای مرورگرهایی که afterprint را روی Cancel فراخوانی نمی‌کنند
  try {
    window.print();
  } finally {
    // اگر afterprint تا 1200ms نیامد، خودمان ریستور کنیم
    setTimeout(() => {
      if (hdr.style.visibility === 'visible') restore();
    }, 1200);
  }
}

function exportToExcel(){
  const table=document.getElementById('resultsTable').outerHTML;
  const warningsHTML=document.getElementById('warningList').outerHTML;
  const corrHTML=document.getElementById('correctionMessage').outerHTML;
  const style = `
    <style>
      table, th, td{ border:1px solid #555; border-collapse:collapse; padding:6px; text-align:center; font-family:Tahoma, sans-serif; font-size:12pt; }
      th{ background-color:#f0f4f8; }
      .warningItem{ background:#ffe6e6; border:1px solid #ffb3b3; padding:4px 6px; margin:2px 0; }
      .infoItem{ background:#e6f4ff; border:1px solid #b3daff; padding:4px 6px; margin:2px 0; }
    </style>`;
  const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">${style}</head><body>
    ${table}<h3>پیام‌ها</h3>${warningsHTML}${corrHTML}
  </body></html>`;
  const blob=new Blob([html], {type:'application/vnd.ms-excel'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='تحلیل_درگیری.xls'; a.click(); URL.revokeObjectURL(url);
  setTimeout(()=>alert('پس از ذخیره فایل اکسل، روی فایل راست‌کلیک کرده و گزینه "Unblock" را فعال کنید.'), 200);
}
function saveAsHTML(){
  const name = prompt('نام کارشناس', 'مهندس خانی') || 'مهندس خانی';
  const date = new Date().toLocaleDateString('fa-IR');
  const hdr=document.getElementById('printHeader'); const prevVis=hdr.style.visibility;
  hdr.style.visibility='visible';
  document.getElementById('analysisDate').textContent=date;
  document.getElementById('reporterName').textContent=name;
  document.getElementById('containerSelected').textContent=document.getElementById('containerType').value || '-';
  const content=`
  <!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8" />
  <title>گزارش تحلیل درگیری</title>
  <style>
    body{ font-family:Tahoma, sans-serif; direction:rtl; background:#fff; color:#333; margin:20px; }
    table{ width:100%; border-collapse:collapse; margin-bottom:15px; }
    th,td{ border:1px solid #555; padding:6px; text-align:center; font-size:14px; }
    th{ background-color:#f0f4f8; }
    .warningItem{ background:#ffe6e6; border:1px solid #ffb3b3; padding:6px 10px; margin:4px 0; border-radius:6px; }
    .infoItem{ background:#e6f4ff; border:1px solid #b3daff; padding:6px 10px; margin:4px 0; border-radius:6px; }
    #pageFooter{ font-size:12px; color:#666; text-align:center; border-top:1px solid #ccc; padding-top:8px; margin-top:12px; }
  </style></head><body>
    ${document.getElementById('printArea').innerHTML}
    <h3>پیام‌ها</h3>
    <div>${document.getElementById('warningList').innerHTML}</div>
    <div id="correctionMessage">${document.getElementById('correctionMessage').innerHTML}</div>
    <div id="pageFooter">© ۲۰۲۵ کارخانه یک‌و‌یک | نویسنده: مصیب خانی</div>
  </body></html>`;
  const blob=new Blob([content], {type:'text/html'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`گزارش_${date}.html`; a.click(); URL.revokeObjectURL(url);
  hdr.style.visibility=prevVis||'hidden';
}

/* راهنمای سریع */
function showHelp(){
  const helpHTML = `
<div style="font-family:Tahoma; direction:rtl; line-height:1.6; background:#f9f9f9; border-radius:10px; padding:15px; border:1px solid #ccc; max-width:600px; margin:auto;">

  <h2 style="color:#2c3e50; text-align:center;">📘 راهنمای سریع برنامه درصد درگیری</h2>

  <!-- تصویر نویسنده -->
  <div style="text-align:center; margin:10px 0;">
    <img src="author.jpg" alt="نویسنده"
      style="width:120px;height:120px;border-radius:50%;border:2px solid #3498db;object-fit:cover;">
  </div>

  <p style="text-align:center; color:#555; font-size:14px;">
    این برنامه برای محاسبه درصد درگیری (Overlap) و بررسی پارامترهای دربندی قوطی فلزی طراحی شده است.
  </p>

  <ol style="padding-right:20px; color:#333; font-size:14px;">
    <li><b>انتخاب ظرف و واحد:</b> نوع قوطی و واحد اندازه‌گیری (میلیمتر یا 0.001") را انتخاب کنید.</li>
    <li><b>ورود مقادیر:</b> اعداد SL، ST، CH، BH، Te و Tb را وارد کرده و «محاسبه» را بزنید.</li>
    <li><b>نتایج و هشدار:</b> درصد درگیری کمتر از 45٪ با رنگ قرمز نمایش داده می‌شود. هشدارها بر اساس واحد انتخابی شما هستند.</li>
    <li><b>اصلاح قالب:</b> تیک قالب را بزنید، مقادیر را تغییر دهید و روی «اصلاح قالب» کلیک کنید. نتیجه با نام <span style="color:#2980b9;">«اصلاحیه قالبX»</span> ذخیره می‌شود.</li>
    <li><b>خروجی:</b> با دکمه‌ها خروجی <span style="color:#27ae60;">پرینت</span>، <span style="color:#27ae60;">اکسل</span> یا HTML بگیرید یا ستون‌ها را حذف کنید.</li>
    <li><b>نکته مهم فایل اکسل:</b> پس از ذخیره، روی فایل راست‌کلیک کرده و گزینه <span style="color:#c0392b;">Unblock</span> را فعال کنید تا بدون محدودیت باز شود.</li>
  </ol>

  <div style="background:#eef6ff; padding:10px; border-radius:8px; margin-top:10px; font-size:13px;">
    <b>📏 حدود مجاز:</b><br>
    CH ≥ 1.78mm ، BH ≥ 1.78mm ، ΔH ≤ 0.20mm ، FS ≤ 0.19mm ، OL% ≥ 45%
    <br>
    <span style="color:#777;">واحد هشدارها بر اساس واحد انتخابی شما است.</span>
  </div>

  <div style="background:#fff4e5; padding:10px; border-radius:8px; margin-top:10px; font-size:13px;">
    <b>💡 پیشنهادات و پشتیبانی:</b><br>
    📧 <a href="mailto:mosayeb872@gmail.com" style="color:#d35400;">mosayeb872@gmail.com</a>
  </div>

  <p style="text-align:center; margin-top:10px; font-size:12px; color:#777;">
    © ۲۰۲۵ - مصیب خانی - کارخانه یک‌و‌یک
  </p>

  <div style="text-align:center;">
    <button id="helpCloseBtn"
      style="padding:8px 15px; border:none; background:#3498db; color:white; border-radius:5px; cursor:pointer;">
      بستن
    </button>
  </div>

</div>`;

  const helpBox = document.getElementById('helpBox');
  helpBox.innerHTML = helpHTML;
  document.getElementById('helpOverlay').style.display = 'flex';
  document.getElementById('helpCloseBtn').onclick = () => {
    document.getElementById('helpOverlay').style.display = 'none';
  };
}

/* ---------- Troubleshooting content (pages) ---------- */
const tsPages = [
`<p>پس از تنظیمات اولیه دستگاه دربندی و نمونه‌برداری و آزمایشات لازم، در صورت وجود اشکال و با فرض استاندارد بودن تمامی ابعاد فنی قوطی‌های ساخته‌شده، مطابق موارد زیر اقدام کنید.</p>
<ol class="tsList" start="1">
  <li><b>طول قلاب سر – کم بودن از حد مجاز:</b> تنظیم قرقره‌های عمل اول (نزدیک‌تر به دیسک تا حد مجاز افقی)، تنظیم قرقره‌های عمل دوم نیز مؤثر است. کنترل ابعاد دیسک نسبت به درب قوطی. در صورت عدم اصلاح، تعویض قرقره‌های مربوطه.</li>
  <li><b>طول قلاب سر – زیادتر از حد مجاز:</b> فاصله‌دار کردن قرقره‌های عمل اول از دیسک (فیلر بزرگ‌تر). در صورت عدم اصلاح، قرقره‌های عمل دوم نیز با فیلر بزرگ‌تر تنظیم گردند (با حفظ ضخامت دوخت استاندارد). در نهایت تعویض قرقره‌ها.</li>
</ol>`,
`<ol class="tsList" start="3">
  <li><b>طول قلاب بدنه:</b> کم بودن → افزایش فشار پدال؛ زیاد بودن → کاهش فشار پدال. اگر با تنظیم فشار پدال قلاب بدنه استاندارد و قوطی می‌چرخد/می‌ایستد، دیسک کوچک/فرسوده است و باید متناسب ساخته/تعویض شود.</li>
  <li><b>طول دوخت:</b> کم بودن → نزدیک‌تر کردن قرقره‌های عمل دوم به دیسک (فیلر کوچک‌تر). زیاد بودن → با حفظ ضخامت استاندارد، فیلر عمل دوم بزرگ‌تر شود. باز بودن عمل اول (فیلر بزرگ) نیز طول دوخت را افزایش می‌دهد. در صورت عدم حصول، تعویض قرقره‌های عمل اول و دوم.</li>
</ol>`,
`<ol class="tsList" start="5">
  <li><b>ضخامت دوخت:</b> زیاد → فیلرگیری عمل دوم جذب‌تر؛ کم → فیلرگیری بازتر. در صورت عدم حصول با وجود نزدیک‌کردن، تعویض قرقره‌های عمل دوم. در موارد لقی عمودی/افقی شافت و بازوها، رفع عیب توسط افراد کاردان.</li>
  <li><b>عمق دوخت:</b> تابع زوایا و ابعاد دیسک است و کمتر با تنظیم اصلاح می‌شود؛ نیاز به ساخت/تعویض دیسک استاندارد دارد.</li>
</ol>`,
`<ol class="tsList" start="7">
  <li><b>درصد درگیری:</b> تابع طول قلاب‌ها و طول دوخت است. درگیری کم → کنترل و رساندن CH و BH و طول دوخت به حدود استاندارد؛ می‌توان با کاهش طول دوخت یا افزایش قلاب‌ها درگیری را بالا برد.</li>
  <li><b>فضای آزاد بین لایه‌ها:</b> رابطه مستقیم با ضخامت دوخت دارد؛ با استاندارد شدن ضخامت، فضای آزاد نیز استاندارد می‌شود.</li>
</ol>`,
`<ol class="tsList" start="9">
  <li><b>چرخیدن/سر خوردن قوطی:</b> باعث افزایش طول دوخت (عمل اول) و افزایش ضخامت (عمل دوم) می‌شود و مردود است. علل: نزدیکی بیش از حد قرقره به دیسک، فرسودگی دیسک، فشار پدال کم.</li>
  <li><b>غیریکنواختی فاکتورهای دوخت:</b> ناشی از تنظیم نامناسب (یکی جلوتر/عقب‌تر)، لنگی دیسک/شافت، بزرگ بودن دیسک نسبت به درب، کجی سطح پدال. باید تک‌تک بررسی و رفع شود.</li>
</ol>`,
`<ol class="tsList" start="11">
  <li><b>تیزی، پله یا بریدگی دوخت:</b> از تنظیم غلط نسبت به دیسک (ارتفاعی/افقی)، فشار پدال زیاد، یا فرسودگی دیسک ناشی می‌شود. موارد را تشخیص و اصلاح کنید.</li>
  <li><b>بریدگی از پایین دوخت:</b> وقتی عمل اول از نظر عمودی یکی پایین‌تر و یکی بالاتر باشد یا فاصله افقی زیاد باشد، خط و بریدگی از زیر رخ می‌دهد. باریک بودن قرقره‌های عمل اول نیز مؤثر است.</li>
</ol>`,
`<ol class="tsList" start="13">
  <li><b>پایین افتادگی (داخلی/خارجی):</b> از باز بودن بیش از حد قرقره‌ها نسبت به دیسک، فرسودگی یا گیر کردن بلبرینگ قرقره‌ها ناشی می‌شود. ضربه به درب در کانال انتقال نیز سبب نقاطی از پایین‌افتادگی می‌شود.</li>
  <li><b>چین و چروک قلاب سر:</b> با نزدیک‌تر کردن قرقره‌های عمل دوم به دیسک اصلاح می‌شود. در صورت عدم اصلاح، تعویض قرقره‌های عمل دوم. کوچک بودن دیسک نسبت به درب نیز عامل چروک است.</li>
</ol>`,
`<ol class="tsList" start="15">
  <li><b>پیک/دکمه زدن دوخت:</b> ناشی از گیرکردن حرکت چرخشی بلبرینگ قرقره‌ها، لقی عمودی، یا ضربه در مسیر فیدر/کانال‌ها. نقاط ضرب‌دیده دوخت نمی‌شوند و بیرون‌زدگی دیده می‌شود. اگر چندنقطه‌ای باشد از قرقره‌ها و فرسودگی شدید است.</li>
  <li><b>گیر کردن قوطی و درب به دیسک:</b> از فرسودگی شدید دیسک، نزدیکی بیش از حد قرقره‌ها، اختلاف زیاد فاصله عمودی قرقره با دیسک، یا بزرگ بودن دیسک نسبت به درب ناشی می‌شود.</li>
  <li><b>دوخت ناقص:</b> هم‌مرکز نبودن درب و قوطی، ضرب‌دیدگی درب/قوطی، بیضی شدن قوطی، یا تایم غلط ستاره‌ها/انگشتی‌ها نسبت به پدال. باید تنظیم شوند تا از زاویه ۹۰ درجه کاملاً هم‌مرکز باشند؛ قطعات فرسوده تعویض شوند.</li>
</ol>`,
`<ol class="tsList" start="17">
  <li><b>چین‌خوردگی و تاخوردگی:</b> تاخوردگی و برگشتگی قلاب سر در مرحله اول ایجاد می‌شود؛ علل: گیرپاچ بلبرینگ قرقره‌ها، ضرب‌دیدگی درب، تنظیم نامناسب/فرسودگی تیغه‌های فیدر درب. چین‌خوردگی حالت بین چروک و تاخوردگی است.</li>
</ol>`
];

/* --- جستجوی زنده + هایلایت --- */
let tsIndex = 0;
let matchedPages = null;
let searchTerm = '';

function openTroubleshooting(){
  tsIndex = 0; matchedPages = null; searchTerm = '';
  document.getElementById('tsSearch').value = '';
  renderTsPage();
  document.getElementById('tsOverlay').style.display = 'flex';
  document.getElementById('tsOverlay').setAttribute('aria-hidden','false');
  setTimeout(()=>document.getElementById('tsSearch').focus(), 50);
}
function closeTroubleshooting(){
  document.getElementById('tsOverlay').style.display = 'none';
  document.getElementById('tsOverlay').setAttribute('aria-hidden','true');
}

function getActivePages(){
  if (matchedPages && matchedPages.length) return matchedPages;
  return tsPages.map((_,i)=>i);
}

function highlightHTML(html, term){
  if(!term) return html;
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${esc})`, 'gi');
  return html.replace(re, '<span class="hl">$1</span>');
}

function renderTsPage(){
  const pages = getActivePages();
  if (pages.length === 0){
    document.getElementById('tsContent').innerHTML = `<p>نتیجه‌ای یافت نشد.</p>`;
    document.getElementById('tsPageIndicator').textContent = `۰ نتیجه`;
    document.getElementById('tsPrev').disabled = true;
    document.getElementById('tsNext').disabled = true;
    return;
  }
  if (!pages.includes(tsIndex)) tsIndex = pages[0];

  const contentEl = document.getElementById('tsContent');
  const rawHTML = tsPages[tsIndex];
  contentEl.innerHTML = searchTerm ? highlightHTML(rawHTML, searchTerm) : rawHTML;

  const currentPos = pages.indexOf(tsIndex) + 1;
  document.getElementById('tsPageIndicator').textContent = `صفحه ${currentPos} از ${pages.length}`;
  document.getElementById('tsPrev').disabled = currentPos === 1;
  document.getElementById('tsNext').disabled = currentPos === pages.length;
}

function gotoPrev(){
  const pages = getActivePages();
  const pos = pages.indexOf(tsIndex);
  if (pos > 0){ tsIndex = pages[pos-1]; renderTsPage(); }
}
function gotoNext(){
  const pages = getActivePages();
  const pos = pages.indexOf(tsIndex);
  if (pos < pages.length-1){ tsIndex = pages[pos+1]; renderTsPage(); }
}

document.getElementById('tsPrev').addEventListener('click', gotoPrev);
document.getElementById('tsNext').addEventListener('click', gotoNext);
document.getElementById('tsClose').addEventListener('click', closeTroubleshooting);
document.getElementById('tsOverlay').addEventListener('click', (e)=>{ if(e.target.id==='tsOverlay') closeTroubleshooting(); });

// جستجوی زنده با debounce سبک
let tsSearchTimer = null;
document.getElementById('tsSearch').addEventListener('input', (e)=>{
  const value = e.target.value.trim();
  clearTimeout(tsSearchTimer);
  tsSearchTimer = setTimeout(()=>{
    searchTerm = value;
    if(!searchTerm){
      matchedPages = null;
      renderTsPage();
      return;
    }
    const s = searchTerm.toLowerCase();
    matchedPages = tsPages
      .map((html, i) => ({ i, hit: html.toLowerCase().includes(s) }))
      .filter(x => x.hit)
      .map(x => x.i);

    if (!matchedPages.includes(tsIndex)) tsIndex = matchedPages[0] || 0;
    renderTsPage();
  }, 120);
});

document.getElementById('tsClear').addEventListener('click', ()=>{
  document.getElementById('tsSearch').value = '';
  searchTerm = ''; matchedPages = null; renderTsPage();
});

/* شروع */
updateProgress();
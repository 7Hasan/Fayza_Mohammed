(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const stories = [
    {category:"دعاء للفقيدة",text:"اللهم اغفر لها وارحمها، وعافها واعفُ عنها، وأكرم نزلها ووسّع مدخلها."},
    {category:"دعاء للمسلمين",text:"اللهم اغفر للمؤمنين والمؤمنات والمسلمين والمسلمات الأحياء منهم والأموات."},
    {category:"ذكر",text:"سبحان الله وبحمده، سبحان الله العظيم."},
    {category:"الصلاة على النبي ﷺ",text:"اللهم صلِّ وسلم وبارك على نبينا محمد وعلى آله وصحبه أجمعين."},
    {category:"دعاء",text:"اللهم آنس وحشتها، ونوّر قبرها، واجعل قبرها روضةً من رياض الجنة."}
  ];
  let storyIndex = 0;
  let storyInterval = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function renderStory() {
    const category = $("#story-category");
    const content = $("#story-text");
    if (!category || !content) return;
    category.textContent = stories[storyIndex].category;
    content.textContent = stories[storyIndex].text;
  }
  function nextStory() {
    storyIndex = (storyIndex + 1) % stories.length;
    renderStory();
  }
  function startStories() {
    if (reducedMotion || storyInterval) return;
    storyInterval = window.setInterval(nextStory, 7000);
  }
  function stopStories() {
    window.clearInterval(storyInterval);
    storyInterval = null;
  }
  window.nextStory = nextStory;
  window.shareCurrentStory = async () => {
    const message = stories[storyIndex].text + "\n\n" + location.href;
    await share({title:document.title,text:message,url:location.href});
  };
  window.sharePage = async () => share({
    title:document.title,
    text:"صدقة جارية عن روح فايزة محمد رحمها الله. نسألكم الدعاء لها.",
    url:location.href
  });
  async function share(data) {
    try {
      if (navigator.share) await navigator.share(data);
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.url + (data.text ? "\n" + data.text : ""));
        alert("نُسخ الرابط والنص. يمكنك مشاركته الآن.");
      } else {
        window.prompt("انسخ رابط الصفحة:", data.url);
      }
    } catch (error) {
      if (error?.name !== "AbortError") console.warn("تعذرت المشاركة:", error);
    }
  }

  window.executeIslamicSearch = () => {
    const query = $("#islamic-search-query")?.value.trim();
    const source = $("#search-source")?.value;
    if (!query) { alert("اكتب موضوع البحث أولاً."); $("#islamic-search-query")?.focus(); return; }
    const urls = {
      dorar: "https://dorar.net/hadith/search?q=",
      islamweb: "https://www.islamweb.net/ar/articles/index.php?page=expsearch&stxt=",
      binbaz: "https://binbaz.org.sa/search?q="
    };
    const base = urls[source];
    if (base) window.open(base + encodeURIComponent(query), "_blank", "noopener,noreferrer");
  };

  // سجل الدعاء مركزي: القراءة من Google Sheets والإرسال للمراجعة.
  const DUA_API_URL = "PASTE_WEB_APP_URL_HERE";
  const API_READY = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(DUA_API_URL);
  const wallForm = $("#dua-form");
  const wallList = $("#dua-list");
  const wallStatus = $("#wall-status");
  let publishedDuas = [];

  // الاتصال بـ Google Apps Script عبر POST داخل iframe مخفي.
  // هذه هي آلية القراءة التي اجتازت الاختبار في diagnostics.html.
  const transportFrame = document.createElement("iframe");
  transportFrame.name = "duaTransportFrame";
  transportFrame.title = "اتصال سجل الدعاء";
  transportFrame.style.display = "none";
  document.body.appendChild(transportFrame);

  let pendingApiRequest = null;

  function makeApiToken() {
    return "diag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
  }

  function requestDuaApi(fields) {
    return new Promise((resolve, reject) => {
      if (!API_READY) {
        reject(new Error("سجل الدعاء قيد الربط. سيعمل بعد نشر ملف Code.gs وإضافة رابط /exec."));
        return;
      }
      if (pendingApiRequest) {
        reject(new Error("هناك طلب آخر قيد التنفيذ. حاول بعد لحظات."));
        return;
      }
      const token = makeApiToken();
      const request = {token, resolve, reject, timer:null};
      request.timer = window.setTimeout(() => {
        if (pendingApiRequest !== request) return;
        pendingApiRequest = null;
        reject(new Error("انتهت مهلة الاتصال. حاول تحديث الصفحة."));
      }, 25000);
      pendingApiRequest = request;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = DUA_API_URL;
      form.target = transportFrame.name;
      form.acceptCharset = "UTF-8";
      form.style.display = "none";
      const values = {...fields, token};
      Object.entries(values).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value ?? "");
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      window.setTimeout(() => form.remove(), 1000);
    });
  }

  window.addEventListener("message", event => {
    const data = event.data;
    const request = pendingApiRequest;
    if (!request || !data || data.channel !== "dua-wall-diagnostic" || data.token !== request.token) return;
    pendingApiRequest = null;
    window.clearTimeout(request.timer);
    request.resolve(data.payload);
  });
  // نعرض 3 أدعية فقط في البداية، ثم نكشف 3 إضافية مع كل ضغطة.
  const DUA_PAGE_SIZE = 3;
  let visibleDuasCount = DUA_PAGE_SIZE;
  let showMoreDuasButton = null;
  let showLessDuasButton = null;

  function renderDuas() {
    if (!wallList) return;
    wallList.replaceChildren();

    if (!publishedDuas.length) {
      const empty = document.createElement("p");
      empty.className = "small";
      empty.textContent = "لا توجد أدعية منشورة حتى الآن. كن أول من يترك دعاءً.";
      wallList.appendChild(empty);
      if (showMoreDuasButton) showMoreDuasButton.hidden = true;
      return;
    }

    const newestFirst = publishedDuas.slice().reverse();
    newestFirst.slice(0, visibleDuasCount).forEach(item => {
      const card = document.createElement("article");
      card.className = "wall-msg-card";

      const name = document.createElement("strong");
      name.textContent = item.name || "زائر كريم";

      const message = document.createElement("p");
      message.textContent = item.dua || "";

      const date = document.createElement("span");
      date.className = "small";
      if (item.date) {
        const parsedDate = new Date(item.date);
        date.textContent = Number.isNaN(parsedDate.getTime())
          ? ""
          : parsedDate.toLocaleDateString("ar");
      }

      card.append(name, message, date);
      wallList.appendChild(card);
    });

    const remaining = Math.max(0, newestFirst.length - visibleDuasCount);
    if (!showMoreDuasButton) {
      showMoreDuasButton = document.createElement("button");
      showMoreDuasButton.type = "button";
      showMoreDuasButton.className = "btn outline";
      showMoreDuasButton.addEventListener("click", () => {
        visibleDuasCount = Math.min(visibleDuasCount + DUA_PAGE_SIZE, newestFirst.length);
        renderDuas();
      });
      wallList.insertAdjacentElement("afterend", showMoreDuasButton);
    }
    showMoreDuasButton.hidden = remaining === 0;
    showMoreDuasButton.textContent = remaining > 0
      ? `عرض المزيد من الأدعية (${remaining} متبقية)`
      : "";

    if (!showLessDuasButton) {
      showLessDuasButton = document.createElement("button");
      showLessDuasButton.type = "button";
      showLessDuasButton.className = "btn outline";
      showLessDuasButton.textContent = "عرض أقل";
      showLessDuasButton.addEventListener("click", () => {
        visibleDuasCount = DUA_PAGE_SIZE;
        renderDuas();
        wallList.scrollIntoView({behavior: reducedMotion ? "auto" : "smooth", block: "start"});
      });
      showMoreDuasButton.insertAdjacentElement("afterend", showLessDuasButton);
    }
    showLessDuasButton.hidden = visibleDuasCount <= DUA_PAGE_SIZE || remaining > 0;
  }

  async function loadPublishedDuas() {
    if (!API_READY) {
      if (wallStatus) wallStatus.textContent = "سجل الدعاء قيد الربط، وسيظهر بعد إعداد Google Apps Script.";
      return;
    }
    if (wallStatus) wallStatus.textContent = "جارٍ تحميل الأدعية المنشورة...";
    try {
      const result = await requestDuaApi({mode:"frameRead", action:"read"});
      if (!result || !result.success || !Array.isArray(result.duas)) {
        throw new Error(result?.message || "تعذر تحميل الأدعية.");
      }
      publishedDuas = result.duas;
      renderDuas();
      if (wallStatus) wallStatus.textContent = "";
    } catch (error) {
      if (wallStatus) wallStatus.textContent =
        "تعذر تحميل سجل الدعاء حاليًا. يرجى تحديث الصفحة لاحقًا.";
      if (wallList) wallList.replaceChildren();
      console.warn("Dua list loading failed:", error);
    }
  }

  wallForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const message = $("#dua-message")?.value.trim() || "";
    const name = $("#dua-name")?.value.trim().slice(0, 45) || "زائر كريم";
    const submitButton = wallForm.querySelector('button[type="submit"]');

    if (!message) {
      if (wallStatus) wallStatus.textContent = "اكتب الدعاء أولاً.";
      return;
    }
    if (message.length > 500) {
      if (wallStatus) wallStatus.textContent = "الدعاء يجب ألا يتجاوز 500 حرف.";
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (wallStatus) wallStatus.textContent = "جارٍ إرسال الدعاء للمراجعة...";

    try {
      const result = await requestDuaApi({
        mode: "frameSubmit",
        action: "submit",
        dua: message,
        name: name
      });

      if (!result || !result.success) {
        throw new Error(result?.message || "تعذر إرسال الدعاء.");
      }

      wallForm.reset();
      if (wallStatus) {
        wallStatus.textContent = "وصل دعاؤك بنجاح. جارٍ تحديث قائمة الأدعية...";
      }
      await loadPublishedDuas();
    } catch (error) {
      if (wallStatus) {
        wallStatus.textContent =
          error.message || "تعذر إرسال الدعاء. حاول مرة أخرى.";
      }
      console.warn("Dua submission failed:", error);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  loadPublishedDuas();

  // إحصائيات الزوار: تسجيل واحد عند فتح الصفحة، ثم قراءة الإجمالي التراكمي.
  // طلب الإحصائيات مستقل عن قناة الأدعية حتى لا يؤثر تعطلها على سجل الدعاء.
  const visitorEye = $("#visitor-eye");
  const visitorTotal = $("#visitor-total");
  const visitorStatsFrame = document.createElement("iframe");
  visitorStatsFrame.name = "visitorStatsTransportFrame";
  visitorStatsFrame.title = "اتصال إحصائيات الزيارات";
  visitorStatsFrame.style.display = "none";
  document.body.appendChild(visitorStatsFrame);

  let pendingVisitorStatsRequest = null;
  let visitorTotalLoaded = false;

  function requestVisitorStats(action) {
    return new Promise((resolve, reject) => {
      if (pendingVisitorStatsRequest) {
        reject(new Error("طلب إحصائيات آخر قيد التنفيذ."));
        return;
      }

      const token = "visitor_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 12);
      const request = { token, action, resolve, reject, timer: null };

      request.timer = window.setTimeout(() => {
        if (pendingVisitorStatsRequest !== request) return;
        pendingVisitorStatsRequest = null;
        reject(new Error("انتهت مهلة طلب إحصائيات الزيارات."));
      }, 25000);

      pendingVisitorStatsRequest = request;

      const form = document.createElement("form");
      form.method = "POST";
      form.action = DUA_API_URL;
      form.target = visitorStatsFrame.name;
      form.acceptCharset = "UTF-8";
      form.style.display = "none";

      const fields = {
        mode: "frameStats",
        action,
        token
      };

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
      window.setTimeout(() => form.remove(), 1000);
    });
  }

  window.addEventListener("message", event => {
    const data = event.data;
    const request = pendingVisitorStatsRequest;

    if (
      !request ||
      !data ||
      data.channel !== "visitor-stats" ||
      data.token !== request.token
    ) return;

    pendingVisitorStatsRequest = null;
    window.clearTimeout(request.timer);
    request.resolve(data.payload);
  });

  function renderVisitorTotal(total) {
    if (!visitorEye || !visitorTotal) return;
    const safeTotal = Number(total);
    if (!Number.isFinite(safeTotal) || safeTotal < 0) return;

    visitorTotal.textContent =
      "إجمالي الزيارات: " + Math.floor(safeTotal).toLocaleString("ar");
    visitorTotalLoaded = true;
    visitorEye.disabled = false;
  }

  visitorEye?.addEventListener("click", () => {
    if (!visitorTotalLoaded || !visitorTotal) return;
    const isVisible = visitorEye.getAttribute("aria-expanded") === "true";
    visitorEye.setAttribute("aria-expanded", String(!isVisible));
    visitorTotal.hidden = isVisible;
    visitorEye.setAttribute(
      "aria-label",
      isVisible ? "إظهار إجمالي الزيارات" : "إخفاء إجمالي الزيارات"
    );
  });

  function getAdenDateKey() {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Aden",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }

  async function initializeVisitorStats() {
    if (!API_READY) return;
    // زيارة واحدة لكل متصفح في اليوم بتوقيت عدن، مع حماية إضافية للجلسة الحالية.
    const visitStorageKey = "faysa_mohammed_last_visit_date_v1";
    const sessionVisitKey = "faysa_mohammed_session_visit_date_v1";
    const today = getAdenDateKey();
    let alreadyTracked = false;
    let localMarkConfirmed = false;
    let sessionMarkConfirmed = false;

    // لا نعدّ التخزين متاحًا إلا بعد نجاح الكتابة ثم قراءة القيمة نفسها.
    try {
      alreadyTracked = localStorage.getItem(visitStorageKey) === today;
      if (!alreadyTracked) {
        localStorage.setItem(visitStorageKey, today);
        localMarkConfirmed = localStorage.getItem(visitStorageKey) === today;
      } else {
        localMarkConfirmed = true;
      }
    } catch (error) {
      console.warn("Visitor local storage unavailable:", error);
    }

    // بديل للجلسة الحالية إذا منع المتصفح التخزين الدائم.
    try {
      if (sessionStorage.getItem(sessionVisitKey) === today) {
        alreadyTracked = true;
        sessionMarkConfirmed = true;
      } else {
        sessionStorage.setItem(sessionVisitKey, today);
        sessionMarkConfirmed = sessionStorage.getItem(sessionVisitKey) === today;
      }
    } catch (error) {
      console.warn("Visitor session storage unavailable:", error);
    }

    // لا نرسل الزيارة إلا إذا تأكدنا أن أحد التخزينين سيمنع تكرارها.
    if (!alreadyTracked && (localMarkConfirmed || sessionMarkConfirmed)) {
      try {
        await requestVisitorStats("track");
      } catch (error) {
        // لا نعيد المحاولة تلقائيًا؛ ربما سُجلت الزيارة بالفعل رغم انتهاء المهلة.
        console.warn("Visitor tracking failed:", error);
      }
    }

    // القراءة مستقلة ولا تضيف زيارة، وتعرض للزائر الإجمالي فقط.
    try {
      const result = await requestVisitorStats("read");
      if (!result || !result.success) {
        throw new Error(result?.message || "تعذرت قراءة إجمالي الزيارات.");
      }
      renderVisitorTotal(result.count);
    } catch (error) {
      console.warn("Visitor total loading failed:", error);
    }
  }

  initializeVisitorStats();

  // تثبيت التطبيق: رسائل المساعدة تبقى أسفل زر التثبيت ولا تختلط بنموذج الدعاء.
  let installPrompt = null;
  const installButton = $("#install-app");
  const installHelp = $("#install-help");
  const installArea = installButton?.closest(".install-area");

  function hideInstallArea() {
    if (installButton) installButton.hidden = true;
    if (installHelp) installHelp.hidden = true;
    if (installArea) installArea.hidden = true;
  }

  function showInstallHelp(message) {
    if (installHelp) {
      installHelp.textContent = message;
      installHelp.hidden = false;
    }
  }

  const alreadyInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone === true;

  if (alreadyInstalled) hideInstallArea();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    if (!alreadyInstalled && installButton) installButton.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if (!installPrompt) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isAndroid = /android/i.test(navigator.userAgent);
      const help = isIOS
        ? "لتثبيت الموقع: اضغط مشاركة في Safari، ثم اختر إضافة إلى الشاشة الرئيسية."
        : isAndroid
          ? "لتثبيت الموقع: افتح قائمة Chrome ⋮ ثم اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية."
          : "لتثبيت الموقع: افتح قائمة Chrome ⋮ ثم اختر حفظ ومشاركة، وبعدها تثبيت الصفحة كتطبيق.";
      showInstallHelp(help);
      return;
    }

    const promptEvent = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        hideInstallArea();
      } else {
        showInstallHelp("لم يتم التثبيت. يمكنك المحاولة مرة أخرى من قائمة المتصفح.");
      }
    } catch (error) {
      console.warn("تعذر فتح نافذة التثبيت:", error);
      showInstallHelp("لم تفتح نافذة التثبيت. افتح قائمة المتصفح واختر تثبيت التطبيق.");
    } finally {
      installButton.disabled = false;
    }
  });

  window.addEventListener("appinstalled", hideInstallArea);

  // ملفات الموقع الأساسية تُخزّن محليًا للعمل دون اتصال بعد أول زيارة.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(error =>
        console.warn("تعذر تفعيل وضع عدم الاتصال:", error)
      );
    });
  }

  const storageKey = "faysa_mohammed_tasbeeh_v1";
  let count = 0;
  try { count = Number(localStorage.getItem(storageKey)) || 0; } catch (_) {}
  const counter = $("#tasbeeh-count");
  if (counter) counter.textContent = String(count);
  $("#tasbeeh-btn")?.addEventListener("click", () => {
    count += 1;
    if (counter) counter.textContent = String(count);
    try { localStorage.setItem(storageKey, String(count)); } catch (_) {}
  });
  $("#tasbeeh-reset")?.addEventListener("click", () => {
    count = 0;
    if (counter) counter.textContent = "0";
    try { localStorage.removeItem(storageKey); } catch (_) {}
  });

  // نستخدم textContent فقط لعرض النصوص، فلا تُفسّر مدخلات الزائر على أنها HTML.
  $("#islamic-search-query")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") window.executeIslamicSearch();
  });

  const storyBox = $("#story-box");
  storyBox?.addEventListener("mouseenter", stopStories);
  storyBox?.addEventListener("mouseleave", startStories);
  storyBox?.addEventListener("focusin", stopStories);
  storyBox?.addEventListener("focusout", startStories);
  document.addEventListener("visibilitychange", () => document.hidden ? stopStories() : startStories());

  // ظهور الأقسام تدريجياً عند الاقتراب منها، مع احترام إعداد تقليل الحركة.
  const sections = document.querySelectorAll(".section");
  if ("IntersectionObserver" in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, {threshold:0.08});
    sections.forEach(section => { section.classList.add("reveal"); observer.observe(section); });
  }
  renderStory();
  startStories();
})();

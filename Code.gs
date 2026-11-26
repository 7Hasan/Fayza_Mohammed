/**
 * Google Apps Script الخاص بموقع الصدقة الجارية عن روح فايزة محمد.
 * الصق هذا الملف في Apps Script المرتبط بجدول فايزة ثم انشره كتطبيق ويب.
 *
 * لا يسجل النظام أسماء الزوار أو أرقامهم أو عناوين IP.
 * اسم الداعي اختياري ويُسجل فقط عند إرسال دعاء، كما في الموقع الأصلي.
 */
const SPREADSHEET_ID = "1Ta49DYhNik60CSgYCL8vzzvcNqqPx2VzQqa2fkMl1Sc";
const TIME_ZONE = "Asia/Aden";
const DUA_SHEET_NAME = "الورقة1";
const STATS_SHEET_NAME = "إحصائيات الزوار";
const DUA_HEADERS = ["رقم الدعاء", "نص الدعاء", "اسم الداعي", "تاريخ الإرسال", "حالة الدعاء"];

function doGet(e) {
  const params = (e && e.parameter) || {};
  const mode = String(params.mode || "");
  const action = String(params.action || "");
  try {
    if (mode === "frameStats" || action === "track" || action === "stats") {
      const count = action === "track" ? trackVisitorVisit() : getVisitorCount();
      return visitorStatsFrameResponse({ success: true, count: count }, params.token);
    }
    if (mode === "frameRead" || action === "read") {
      return frameResponse({ success: true, duas: getPublishedDuas() }, params.token);
    }
    const payload = { success: true, message: "Faysa Mohammed web app is ready." };
    const callback = String(params.callback || "");
    if (/^[A-Za-z_$][\w.$]*$/.test(callback)) {
      return ContentService.createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    const payload = { success: false, message: safeErrorMessage_(error) };
    if (mode === "frameStats") return visitorStatsFrameResponse(payload, params.token);
    if (mode === "frameRead") return frameResponse(payload, params.token);
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const params = (e && e.parameter) || {};
  const mode = String(params.mode || "");
  const action = String(params.action || "");
  try {
    if (mode === "frameStats" || action === "track" || action === "stats") {
      const count = action === "track" ? trackVisitorVisit() : getVisitorCount();
      return visitorStatsFrameResponse({ success: true, count: count }, params.token);
    }
    if (mode === "frameSubmit" || action === "submit") {
      return frameResponse(saveDua(params.dua, params.name), params.token);
    }
    if (mode === "frameRead" || action === "read") {
      return frameResponse({ success: true, duas: getPublishedDuas() }, params.token);
    }
    return frameResponse({ success: false, message: "طلب غير معروف." }, params.token);
  } catch (error) {
    const payload = { success: false, message: safeErrorMessage_(error) };
    return mode === "frameStats"
      ? visitorStatsFrameResponse(payload, params.token)
      : frameResponse(payload, params.token);
  }
}

function getDuaSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(DUA_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(DUA_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DUA_HEADERS.length).setValues([DUA_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPublishedDuas() {
  const sheet = getDuaSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const allowed = ["منشور", "منشورة", "معتمد", "معتمدة", "approved", "published"];
  return rows.filter(function(row) {
    const status = String(row[4] || "").trim().toLowerCase();
    return allowed.indexOf(status) !== -1 && String(row[1] || "").trim();
  }).map(function(row) {
    const date = row[3] instanceof Date
      ? Utilities.formatDate(row[3], TIME_ZONE, "yyyy-MM-dd")
      : String(row[3] || "");
    return { id: row[0], dua: String(row[1] || ""), name: String(row[2] || "زائر كريم"), date: date };
  });
}

function saveDua(duaText, name) {
  const dua = String(duaText || "").trim();
  const author = String(name || "زائر كريم").trim().slice(0, 45) || "زائر كريم";
  if (!dua) return { success: false, message: "نص الدعاء فارغ." };
  if (dua.length > 500) return { success: false, message: "الدعاء يتجاوز الحد المسموح." };
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sheet = getDuaSheet_();
    const nextNumber = Math.max(1, sheet.getLastRow());
    sheet.appendRow([nextNumber, dua, author, new Date(), "منشور"]);
    return { success: true, message: "تم استلام الدعاء للمراجعة." };
  } finally {
    lock.releaseLock();
  }
}

function getVisitorStatsSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(STATS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(STATS_SHEET_NAME);
  if (sheet.getRange("A1").getValue() !== "التاريخ") sheet.getRange("A1").setValue("التاريخ");
  if (sheet.getRange("B1").getValue() !== "عدد الزيارات") sheet.getRange("B1").setValue("عدد الزيارات");
  if (sheet.getRange("C1").getValue() !== "إجمالي الزيارات") sheet.getRange("C1").setValue("إجمالي الزيارات");
  if (sheet.getRange("C2").getFormula() !== "=SUM(B2:B)") sheet.getRange("C2").setFormula("=SUM(B2:B)");
  sheet.setFrozenRows(1);
  return sheet;
}

function normalizeVisitorDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TIME_ZONE, "yyyy-MM-dd");
  }
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? "" : Utilities.formatDate(parsed, TIME_ZONE, "yyyy-MM-dd");
}

function trackVisitorVisit() {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sheet = getVisitorStatsSheet_();
    const today = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      sheet.getRange(2, 1, 1, 2).setValues([[today, 1]]);
    } else {
      const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      const matches = [];
      let dailyTotal = 0;
      values.forEach(function(row, index) {
        if (normalizeVisitorDate_(row[0]) === today) {
          matches.push(index + 2);
          dailyTotal += Number(row[1]) || 0;
        }
      });
      if (matches.length) {
        sheet.getRange(matches[0], 1, 1, 2).setValues([[today, dailyTotal + 1]]);
        for (let i = matches.length - 1; i >= 1; i--) sheet.deleteRow(matches[i]);
      } else {
        sheet.appendRow([today, 1]);
      }
    }
    return getVisitorCount();
  } finally {
    lock.releaseLock();
  }
}

function getVisitorCount() {
  const sheet = getVisitorStatsSheet_();
  const value = Number(sheet.getRange("C2").getValue());
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function frameResponse(payload, token) {
  return postMessageHtml_("dua-wall-diagnostic", payload, token);
}

function visitorStatsFrameResponse(payload, token) {
  return postMessageHtml_("visitor-stats", payload, token);
}

function postMessageHtml_(channel, payload, token) {
  const jsonChannel = JSON.stringify(String(channel));
  const jsonToken = JSON.stringify(String(token || ""));
  const jsonPayload = JSON.stringify(payload || {}).replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const html = "<!doctype html><html><head><meta charset='utf-8'></head><body>" +
    "<script>(function(){var data={channel:" + jsonChannel + ",token:" + jsonToken +
    ",payload:" + jsonPayload + "};if(window.top){window.top.postMessage(data,'*');}})();</script>" +
    "</body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function safeErrorMessage_(error) {
  return error && error.message ? String(error.message) : "حدث خطأ غير متوقع.";
}

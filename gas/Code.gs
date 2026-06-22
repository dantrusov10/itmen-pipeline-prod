/**
 * ITMen Pipeline — Google Apps Script API
 * Хранит JSON пайплайна в скрытом листе _pipeline (чанками по 40k символов).
 * Журнал изменений — лист _audit.
 *
 * Деплой: Развернуть → Веб-приложение → доступ «Все, в том числе анонимные».
 */

var STATE_SHEET = '_pipeline';
var AUDIT_SHEET = '_audit';
var CHUNK_SIZE = 40000;
var AUDIT_VALUE_MAX = 1500;

var MANAGERS = [
  { id: 'merlein', name: 'Аркадий Мерлейн', sheet: 'Мерлейн' },
  { id: 'akhmetshin', name: 'Арслан Ахметшин', sheet: 'Ахметшин' },
  { id: 'sirotkin', name: 'Александр Сироткин', sheet: 'Сироткин' },
  { id: 'kulagin', name: 'Алексей Кулагин', sheet: 'Кулагин' }
];

var FIELD_LABELS = {
  customer: 'Клиент',
  industry: 'Отрасль',
  owner: 'Владелец',
  stage: 'Стадия',
  amount: 'Ожид. сумма',
  expectedBudget: 'Ожид. бюджет',
  partner: 'Партнёр',
  partnerDiscount: 'Скидка партнёру, %',
  clientDiscount: 'Скидка клиенту, %',
  manualProb: 'Вероятность',
  taskDue: 'Срок задачи',
  budgetPeriod: 'Срок бюджета',
  budgetStatus: 'Статус бюджета',
  budgetPlannedMonth: 'Месяц согласования',
  budgetPlannedYear: 'Год согласования',
  commitStatus: 'Статус коммита',
  pains: 'Ключевые боли',
  riskTypes: 'Риски',
  riskComment: 'Комментарий к риску',
  scores: 'Скоринг',
  seekingSegments: 'Что ищут',
  seekingOtherLabel: 'Другое (что ищут)',
  productRequirementsPct: '% требований проекта',
  pilotRequirementsPct: '% требований пилота',
  asIsStack: 'Что есть сейчас',
  changePains: 'Почему меняют',
  competitorEntries: 'Конкуренты',
  projectTasks: 'Задачи проекта'
};

var SCALAR_FIELDS = [
  'customer', 'industry', 'owner', 'stage', 'amount', 'expectedBudget',
  'partner', 'partnerDiscount', 'clientDiscount', 'manualProb', 'taskDue',
  'budgetPeriod', 'budgetStatus', 'budgetPlannedMonth', 'budgetPlannedYear',
  'commitStatus', 'pains', 'riskComment'
];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'get';
  try {
    if (action === 'health') {
      getAuditSheet_();
      return json_({ ok: true, ts: new Date().toISOString(), auditSheet: AUDIT_SHEET });
    }
    if (action === 'init' || action === 'setup') {
      getStateSheet_();
      getAuditSheet_();
      return json_({ ok: true, auditSheet: AUDIT_SHEET, pipelineSheet: STATE_SHEET });
    }
    if (action === 'get' || action === 'pipeline') return json_({ state: loadState_() });
    if (action === 'managers') return json_(MANAGERS);
    return json_({ error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      if (!body.state || !Array.isArray(body.state.deals)) {
        return json_({ error: 'Некорректное тело запроса' });
      }
      var oldState = loadState_();
      getAuditSheet_();
      var savedBy = String(body.savedBy || '').trim();
      var diffRows = diffPipeline_(oldState, body.state);
      var auditWritten = appendAudit_(savedBy, diffRows);
      var updatedAt = saveState_(body.state);
      return json_({ ok: true, updatedAt: updatedAt, auditRows: auditWritten });
    }
    return json_({ error: 'Unknown action' });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STATE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(STATE_SHEET);
    sh.hideSheet();
  }
  return sh;
}

function getAuditSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AUDIT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AUDIT_SHEET);
    sh.appendRow([
      'Когда', 'Кто сохранил', 'ID сделки', 'Клиент', 'Ответственный',
      'Изменений', 'Поле', 'Было', 'Стало'
    ]);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, 9);
  }
  return sh;
}

function loadState_() {
  var sh = getStateSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return null;
  var rows = sh.getRange(1, 1, lastRow, 1).getValues();
  var jsonStr = rows.map(function (r) { return r[0]; }).join('');
  if (!jsonStr) return null;
  return JSON.parse(jsonStr);
}

function saveState_(state) {
  var sh = getStateSheet_();
  var payload = JSON.parse(JSON.stringify(state));
  payload._savedAt = new Date().toISOString();
  payload._savedBy = 'web';
  var jsonStr = JSON.stringify(payload);
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
    chunks.push([jsonStr.substring(i, i + CHUNK_SIZE)]);
  }
  if (chunks.length === 0) chunks.push(['']);
  sh.clear();
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
  return payload._savedAt;
}

function normalizeRiskTypes_(deal) {
  if (!deal) return [];
  if (deal.riskTypes && deal.riskTypes.length) {
    return deal.riskTypes.filter(function (r) { return r && r !== 'none'; });
  }
  if (deal.riskType && deal.riskType !== 'none') return [deal.riskType];
  return [];
}

function formatAuditValue_(key, val) {
  if (val === null || val === undefined || val === '') return '';
  if (key === 'riskTypes') {
    var arr = Array.isArray(val) ? val : [];
    return arr.join(', ');
  }
  if (key === 'seekingSegments') {
    return (Array.isArray(val) ? val : []).join(', ');
  }
  if (key === 'projectTasks') {
    return (Array.isArray(val) ? val : []).join('; ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function truncate_(s) {
  s = s == null ? '' : String(s);
  if (s.length <= AUDIT_VALUE_MAX) return s;
  return s.substring(0, AUDIT_VALUE_MAX) + '…';
}

function diffDeal_(oldD, newD) {
  var changes = [];
  var i, key, o, n;

  for (i = 0; i < SCALAR_FIELDS.length; i++) {
    key = SCALAR_FIELDS[i];
    o = formatAuditValue_(key, oldD[key]);
    n = formatAuditValue_(key, newD[key]);
    if (o !== n) {
      changes.push({ field: key, label: FIELD_LABELS[key] || key, old: o, new: n });
    }
  }

  o = formatAuditValue_('riskTypes', normalizeRiskTypes_(oldD));
  n = formatAuditValue_('riskTypes', normalizeRiskTypes_(newD));
  if (o !== n) {
    changes.push({ field: 'riskTypes', label: FIELD_LABELS.riskTypes, old: o, new: n });
  }

  o = JSON.stringify(oldD.scores || {});
  n = JSON.stringify(newD.scores || {});
  if (o !== n) {
    changes.push({ field: 'scores', label: FIELD_LABELS.scores, old: o, new: n });
  }

  var otr = oldD.techResearch || {};
  var ntr = newD.techResearch || {};
  var techKeys = [
    'seekingSegments', 'seekingOtherLabel', 'productRequirementsPct',
    'pilotRequirementsPct', 'asIsStack', 'changePains', 'competitorEntries', 'projectTasks'
  ];
  for (i = 0; i < techKeys.length; i++) {
    key = techKeys[i];
    o = formatAuditValue_(key, otr[key]);
    n = formatAuditValue_(key, ntr[key]);
    if (o !== n) {
      changes.push({ field: key, label: FIELD_LABELS[key] || key, old: o, new: n });
    }
  }

  return changes;
}

function diffPipeline_(oldState, newState) {
  var rows = [];
  var oldMap = {};
  var newMap = {};
  var id, od, nd, changes, j;

  (oldState && oldState.deals ? oldState.deals : []).forEach(function (d) {
    if (d && d.id) oldMap[d.id] = d;
  });
  (newState.deals || []).forEach(function (d) {
    if (d && d.id) newMap[d.id] = d;
  });

  Object.keys(newMap).forEach(function (dealId) {
    nd = newMap[dealId];
    od = oldMap[dealId];
    if (!od) {
      rows.push({
        dealId: dealId,
        customer: nd.customer || '',
        owner: nd.owner || '',
        changeCount: 1,
        label: '—',
        old: '',
        new: 'Новая сделка'
      });
      return;
    }
    changes = diffDeal_(od, nd);
    if (!changes.length) return;
    for (j = 0; j < changes.length; j++) {
      rows.push({
        dealId: dealId,
        customer: nd.customer || '',
        owner: nd.owner || '',
        changeCount: changes.length,
        label: changes[j].label,
        old: changes[j].old,
        new: changes[j].new
      });
    }
  });

  Object.keys(oldMap).forEach(function (dealId) {
    if (!newMap[dealId]) {
      od = oldMap[dealId];
      rows.push({
        dealId: dealId,
        customer: od.customer || '',
        owner: od.owner || '',
        changeCount: 1,
        label: '—',
        old: 'Сделка удалена',
        new: ''
      });
    }
  });

  return rows;
}

function appendAudit_(savedBy, diffRows) {
  if (!diffRows || !diffRows.length) return 0;
  var sh = getAuditSheet_();
  var at = new Date();
  var tz = Session.getScriptTimeZone() || 'Europe/Moscow';
  var atStr = Utilities.formatDate(at, tz, 'yyyy-MM-dd HH:mm:ss');
  var startRow = sh.getLastRow() + 1;
  var data = diffRows.map(function (r) {
    var actor = r.owner || savedBy || '';
    return [
      atStr,
      actor,
      r.dealId || '',
      r.customer || '',
      r.owner || '',
      r.changeCount || 0,
      r.label || '',
      truncate_(r.old),
      truncate_(r.new)
    ];
  });
  sh.getRange(startRow, 1, data.length, 9).setValues(data);
  return data.length;
}

/** Запустите один раз из редактора Apps Script для инициализации */
function setup() {
  getStateSheet_();
  getAuditSheet_();
  Logger.log('Листы _pipeline и _audit готовы. Теперь: Развернуть → Веб-приложение.');
}

/**
 * Easy Deals CRM — weekly private backup to Google Drive (Google Apps Script).
 *
 * Runs in Ashok's own Google account. Nothing here is public:
 *  - The Supabase key lives ONLY in Script Properties (Project Settings → Script properties), never in this file.
 *  - Files go to a private Drive folder; the script refuses to write if that folder is shared.
 *  - Each run makes: 1 JSON restore file (all rows, exact) + 1 Excel file (readable).
 *  - Old backups are moved to Drive Trash after KEEP_WEEKS (Trash keeps them 30 more days).
 *  - Any failure sends an email to the account owner.
 *
 * Script properties needed:
 *   SUPABASE_URL   e.g. https://sfvpslsexobukgerkixi.supabase.co
 *   SUPABASE_KEY   service_role key (reads all rows; keep secret)
 * Optional:
 *   ALERT_EMAIL    extra address for failure mails (default: the script owner)
 *   KEEP_WEEKS     default 8
 *   FOLDER_NAME    default "EasyDeals CRM Backups (private)"
 */

var TABLES = ['leads','calls','device_calls','call_events','message_log','lead_assignment_log','lead_shares',
  'dup_requests','profiles','team_access','zones','areas','area_audit','properties','buyer_leads','buyer_history',
  'invoices','assign_rules','app_settings','wa_settings','wa_messages',
  // added only if the SQL fixes are applied; missing tables are skipped and listed in the report
  'lead_archive','lead_status_log'];
var OPTIONAL = {lead_archive:1, lead_status_log:1};
var PAGE = 1000;
var EXCEL_CELL_LIMIT = 4000000;   // keep the temp Google Sheet well under its 10M-cell limit

function cfg_() {
  var p = PropertiesService.getScriptProperties();
  var c = {
    url: (p.getProperty('SUPABASE_URL') || '').replace(/\/+$/, ''),
    key: p.getProperty('SUPABASE_KEY') || '',
    alert: p.getProperty('ALERT_EMAIL') || '',
    keep: parseInt(p.getProperty('KEEP_WEEKS') || '8', 10),
    folder: p.getProperty('FOLDER_NAME') || 'EasyDeals CRM Backups (private)'
  };
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(c.url)) throw new Error('SUPABASE_URL missing or not a supabase.co URL');
  if (!c.key) throw new Error('SUPABASE_KEY missing in Script properties');
  return c;
}

/** Run once by hand: checks settings and creates the weekly trigger (Sunday ~2 AM, script time zone Asia/Kolkata). */
function setup() {
  cfg_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  folder_(cfg_());
  Logger.log('Weekly trigger set. Now run weeklyBackup once to test.');
}

function weeklyBackup() {
  var c, started = new Date();
  try {
    c = cfg_();
    var folder = folder_(c);
    var stamp = Utilities.formatDate(started, 'Asia/Kolkata', 'yyyy-MM-dd_HHmm');
    // same shape as the CRM's own "Full backup" JSON: {_meta, leads:[...], calls:[...], ...}
    var out = {_meta: {app: 'EasyDeals CRM', taken_at: started.toISOString(), by: 'weekly Apps Script', tables: {}}};
    var data = {};
    var skipped = [];
    TABLES.forEach(function (t) {
      var r = fetchTable_(c, t);
      if (r === null) { if (!OPTIONAL[t]) skipped.push(t); return; }
      out[t] = data[t] = r.rows;
      out._meta.tables[t] = r.rows.length;
    });
    out._meta.missing = skipped;   // tables that do not exist in this project (listed, not fatal)
    if (!data.leads || !data.leads.length) throw new Error('leads came back empty: backup NOT saved');

    var json = JSON.stringify(out);
    var jf = folder.createFile(Utilities.newBlob(json, 'application/json', 'EasyDeals_Backup_' + stamp + '.json'));
    // read back and compare counts, so a broken file is caught now and not on restore day
    var back = JSON.parse(jf.getBlob().getDataAsString());
    Object.keys(out._meta.tables).forEach(function (t) {
      if ((back[t] || []).length !== out._meta.tables[t]) throw new Error('JSON check failed for ' + t);
    });

    var excelNote = excel_(folder, data, stamp);
    var trashed = retention_(folder, c.keep);
    var lines = Object.keys(out._meta.tables).map(function (t) { return t + ': ' + out._meta.tables[t]; });
    Logger.log('Backup OK ' + stamp + '\n' + lines.join('\n') + '\n' + excelNote + '\nOld files trashed: ' + trashed +
      (skipped.length ? '\nNot found (skipped): ' + skipped.join(', ') : ''));
    PropertiesService.getScriptProperties().setProperty('LAST_OK', started.toISOString());
  } catch (e) {
    alert_(c, 'FAILED', String(e && e.stack || e));
    throw e;
  }
}

/** Reads every row of one table with exact-count check. Returns null if the table does not exist / is not readable. */
function fetchTable_(c, t) {
  var rows = [], total = null, from = 0, order = 'id.asc';
  while (true) {
    var url = c.url + '/rest/v1/' + t + '?select=*' + (order ? '&order=' + order : '');
    var res = UrlFetchApp.fetch(url, {
      method: 'get', muteHttpExceptions: true,
      headers: {apikey: c.key, Authorization: 'Bearer ' + c.key, Prefer: 'count=exact', Range: from + '-' + (from + PAGE - 1), 'Range-Unit': 'items'}
    });
    var code = res.getResponseCode(), body = res.getContentText();
    if (code === 400 && order && /column|order/i.test(body)) { order = ''; continue; }   // table without an id column
    if (code === 404 || (code >= 400 && /does not exist|Could not find the table/i.test(body))) return null;
    if (code === 416) break;   // asked past the end (empty table)
    if (code >= 300) throw new Error(t + ': HTTP ' + code + ' ' + body.slice(0, 200));
    var page = JSON.parse(body);
    var cr = (res.getHeaders()['Content-Range'] || res.getHeaders()['content-range'] || '');
    var m = /\/(\d+)$/.exec(cr); if (m) total = parseInt(m[1], 10);
    rows = rows.concat(page);
    if (page.length < PAGE || (total !== null && rows.length >= total)) break;
    from += PAGE;
  }
  if (total !== null && rows.length !== total) throw new Error(t + ': got ' + rows.length + ' of ' + total + ' rows');
  return {rows: rows};
}

/** Readable Excel copy: temp Google Sheet → export .xlsx → temp sheet to Trash. */
function excel_(folder, tables, stamp) {
  var names = Object.keys(tables), cells = 0, skipped = [];
  var ss = SpreadsheetApp.create('EasyDeals_tmp_' + stamp);
  var tmp = DriveApp.getFileById(ss.getId());
  try {
    var first = true;
    names.forEach(function (t) {
      var rows = tables[t];
      var cols = {}; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { cols[k] = 1; }); });
      var head = Object.keys(cols);
      var n = (rows.length + 1) * Math.max(head.length, 1);
      if (cells + n > EXCEL_CELL_LIMIT) { skipped.push(t); return; }
      cells += n;
      var sh = first ? ss.getSheets()[0].setName(t) : ss.insertSheet(t); first = false;
      if (!head.length) { sh.getRange(1, 1).setValue('(empty)'); return; }
      var data = [head].concat(rows.map(function (r) {
        return head.map(function (k) { var v = r[k]; if (v === null || v === undefined) return '';
          if (typeof v === 'object') v = JSON.stringify(v); v = String(v);
          if (/^[=+\-@]/.test(v)) v = "'" + v;          // stop formula injection from lead text
          return v.length > 49000 ? v.slice(0, 49000) + '…' : v; });
      }));
      sh.getRange(1, 1, data.length, head.length).setNumberFormat('@').setValues(data);
      sh.setFrozenRows(1);
    });
    SpreadsheetApp.flush();
    var x = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
      {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true});
    if (x.getResponseCode() !== 200) throw new Error('Excel export HTTP ' + x.getResponseCode());
    folder.createFile(x.getBlob().setName('EasyDeals_Backup_' + stamp + '.xlsx'));
  } finally {
    tmp.setTrashed(true);
  }
  return skipped.length ? 'Excel skipped (too big, still in JSON): ' + skipped.join(', ') : 'Excel: all tables';
}

/** Private folder; refuses to continue if anyone else has access. */
function folder_(c) {
  var it = DriveApp.getFoldersByName(c.folder);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(c.folder);
  var shared = f.getEditors().length + f.getViewers().length > 0 || f.getSharingAccess() !== DriveApp.Access.PRIVATE;
  if (shared) throw new Error('Backup folder "' + c.folder + '" is shared. Make it private (only you) and run again.');
  return f;
}

/** Moves backups older than keep weeks to Trash (recoverable for 30 days). Only touches EasyDeals_Backup_* files. */
function retention_(folder, keep) {
  var cut = Date.now() - keep * 7 * 86400000, n = 0, it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^EasyDeals_Backup_/.test(f.getName()) && f.getDateCreated().getTime() < cut) { f.setTrashed(true); n++; }
  }
  return n;
}

function alert_(c, what, detail) {
  var to = Session.getEffectiveUser().getEmail();
  if (c && c.alert) to += ',' + c.alert;
  // never include keys or row data in the mail
  var safe = String(detail).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[key hidden]').slice(0, 1500);
  MailApp.sendEmail(to, 'Easy Deals CRM backup ' + what, 'The weekly CRM backup ' + what.toLowerCase() + '.\n\n' + safe +
    '\n\nOpen the Apps Script project → Executions to see details. Until it is fixed, take a manual backup from the CRM (admin menu → Full backup).');
}

/** Optional: run by hand any time to check the last successful backup. */
function lastBackup() { Logger.log(PropertiesService.getScriptProperties().getProperty('LAST_OK') || 'never'); }

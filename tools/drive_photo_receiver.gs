/**
 * EasyDeals CRM - Photo receiver (Google Apps Script)
 * Runs inside the proptecheasydeals@gmail.com Google account.
 * The onboarding form sends one photo at a time; this script checks that the
 * sender is logged in to the CRM (Supabase) as admin / telecaller / field exec,
 * then saves the photo in Drive: My Drive > EasyDeals Properties > ED-xxx folder.
 * Photos never go to Supabase or GitHub.
 */
var SB = 'https://sfvpslsexobukgerkixi.supabase.co';
var KEY = 'sb_publishable_YckWE6w7_PM9Q8ysBM-XFg_KBQwYDEa';
var ROOT = 'EasyDeals Properties';

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var u = UrlFetchApp.fetch(SB + '/auth/v1/user', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + b.token }, muteHttpExceptions: true });
    if (u.getResponseCode() !== 200) return out({ ok: false, error: 'login expired' });
    var uid = JSON.parse(u.getContentText()).id;
    var pr = UrlFetchApp.fetch(SB + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(uid), {
      headers: { apikey: KEY, Authorization: 'Bearer ' + b.token }, muteHttpExceptions: true });
    var rows = JSON.parse(pr.getContentText() || '[]');
    var role = rows.length ? rows[0].role : '';
    if (['admin', 'telecaller', 'fe'].indexOf(role) < 0) return out({ ok: false, error: 'not allowed' });
    if (!/^ED-\d{3,}$/.test(String(b.ed || ''))) return out({ ok: false, error: 'bad property id' });
    if (!b.data || b.data.length > 15 * 1024 * 1024) return out({ ok: false, error: 'photo missing or too big' });

    var root = getRoot();
    var folder = findFolder(root, b.ed) || root.createFolder((b.ed + ' ' + (b.title || '')).trim());
    var name = (b.name || ('photo-' + new Date().getTime() + '.jpg')).replace(/[\\/]/g, '-');
    var blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'image/jpeg', name);
    var file = folder.createFile(blob);
    return out({ ok: true, file: file.getId(), folder: folder.getUrl() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() { return out({ ok: true, service: 'EasyDeals photo receiver' }); }

function getRoot() {
  var it = DriveApp.getRootFolder().getFoldersByName(ROOT);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT);
}

function findFolder(root, ed) {
  var it = root.getFolders();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (n === ed || n.indexOf(ed + ' ') === 0) return f;
  }
  return null;
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

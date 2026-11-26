# Flows added in the final audit (26 Nov 2026). Mocked Supabase, no real data.
# 1) Number history shows status changes from lead_status_log
# 2) AI draft: a property with details.ai_off (or in the code lock list) shows the red banner and Send is disabled
# 3) AI draft: a normal property keeps Send enabled; admin sees the per-property toggle, telecaller does not
# 4) Full backup table list includes the newer tables
import asyncio, os
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'mock.js')).read()
async def ctxp(br,role):
    ctx=await br.new_context(viewport={'width':390,'height':844})
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.fulfill(body='',content_type='text/plain')
    await ctx.route('**/*',route)
    await ctx.add_init_script(f"localStorage.setItem('mockrole','{role}')")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(BASE+'index.html'); await pg.wait_for_timeout(1200)
    return ctx,pg,errs
async def main():
  fails=[]
  def check(name,ok):
    print(('PASS ' if ok else 'FAIL ')+name)
    if not ok: fails.append(name)
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'),args=['--no-sandbox'])
    for role in ['admin','telecaller']:
      ctx,pg,errs=await ctxp(br,role)
      await pg.evaluate("numHist('9876543211')");await pg.wait_for_timeout(700)
      t=await pg.inner_text('#nhv')
      check(role+': number history shows status change', 'Status changed' in t and 'New → Ringing' in t)
      await pg.evaluate("document.getElementById('nhv').remove()")
      await pg.evaluate("rmLoad()");await pg.wait_for_timeout(600)
      await pg.evaluate("aiDraft(2)");await pg.wait_for_timeout(300)
      t=await pg.inner_text('#aidr')
      check(role+': locked property shows banner', 'AI RM band hai' in t)
      check(role+': locked property Send disabled', await pg.evaluate("document.getElementById('ai_send').disabled"))
      check(role+': toggle only for admin', await pg.evaluate("!!document.getElementById('ai_pon')")==(role=='admin'))
      await pg.evaluate("document.getElementById('aidr').remove();aiDraft(1)");await pg.wait_for_timeout(300)
      t=await pg.inner_text('#aidr')
      check(role+': normal property no banner, Send enabled', 'band hai' not in t and not await pg.evaluate("document.getElementById('ai_send').disabled"))
      if role=='admin':
        bk=await pg.evaluate("BK_TABLES")
        check('full backup includes new tables', all(x in bk for x in ['lead_archive','lead_status_log','blocked_leads','lead_ingest_log']))
      check(role+': no page errors', not errs)
      if errs: print(errs)
      await ctx.close()
    await br.close()
  print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
asyncio.run(main())

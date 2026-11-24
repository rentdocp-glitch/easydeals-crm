import asyncio
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open('/home/claude/qa/mock.js').read()
async def ctxp(br,role):
    ctx=await br.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.fulfill(body='',content_type='text/plain')
    await ctx.route('**/*',route)
    await ctx.add_init_script(f"localStorage.setItem('mockrole','{role}')")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:asyncio.ensure_future(d.accept()))
    await pg.goto(BASE+'index.html'); await pg.wait_for_timeout(1200)
    return ctx,pg,errs
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx,pg,errs=await ctxp(br,'admin')
    # delete safety copy
    dls=[];pg.on('download',lambda d:dls.append(d.suggested_filename))
    await pg.evaluate("viewSt='new';ST_SUB='';go('st')");await pg.wait_for_timeout(500)
    await pg.evaluate("window.__calls.length=0;openForm(100,'del')");await pg.wait_for_timeout(400)
    await pg.locator('button:has-text("Yes, delete")').click();await pg.wait_for_timeout(1200)
    calls=await pg.evaluate("window.__calls.map(c=>c[0]+':'+c[1])")
    print('DELETE: downloads',dls,'| db writes',calls)
    # status list sub-filter + count text
    await pg.evaluate("viewSt='new';ST_SUB='notc';go('st')");await pg.wait_for_timeout(500)
    t=await pg.inner_text('#app'); print('ST_SUB view shows chip:', 'No telecaller yet' in t, '| bulk link:', 'Assign in bulk' in t)
    # attention panel click
    await pg.evaluate("go('dash')");await pg.wait_for_timeout(800)
    await pg.locator('.att:has-text("Overdue follow-ups")').click();await pg.wait_for_timeout(600)
    print('attention click -> tab',await pg.evaluate("tab+'|'+viewSt+'|'+ST_SUB"))
    # backup reminder disappears after backup
    print('errors',errs); await ctx.close()
    # telecaller: drawer groups + actions rows
    ctx,pg,errs=await ctxp(br,'telecaller')
    await pg.evaluate("go('call')");await pg.wait_for_timeout(500)
    print('acts1 count',await pg.evaluate("document.querySelectorAll('.acts1').length"),'acts2 has transfer',await pg.evaluate("!!document.querySelector('.acts2 [onclick*=share]')"))
    await pg.evaluate("openDrawer()");await pg.wait_for_timeout(500)
    print('drawer groups',await pg.evaluate("[...document.querySelectorAll('#drb .ds')].map(x=>x.textContent)"))
    # back closes number history
    await pg.evaluate("numHist('9876543211')");await pg.wait_for_timeout(500)
    await pg.go_back();await pg.wait_for_timeout(400)
    print('back closes sheet',await pg.evaluate("!document.querySelector('#nhv')"),'still logged in tab',await pg.evaluate("tab"))
    print('errors',errs); await ctx.close()
    await br.close()
asyncio.run(main())

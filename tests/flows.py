import asyncio
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open('/home/claude/qa/mock.js').read()
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await br.new_context(viewport={'width':390,'height':844})
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.fulfill(body='',content_type='text/plain')
    await ctx.route('**/*',route)
    await ctx.add_init_script("localStorage.setItem('mockrole','telecaller')")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(BASE+'index.html'); await pg.wait_for_timeout(1200)
    await pg.evaluate("go('call')"); await pg.wait_for_timeout(600)
    # 1) status form with note -> appended
    await pg.evaluate("openForm && 0"); 
    await pg.evaluate("openId=101;openK='status';render()"); await pg.wait_for_timeout(500)
    print('status form has empty note:', await pg.eval_on_selector('#sn','e=>e.value===""'), '| earlier notes shown:', 'Earlier notes' in await pg.inner_text('#app'))
    await pg.select_option('#sst','prospect'); await pg.fill('#sn','Owner wants 90 L')
    await pg.evaluate("window.__calls.length=0")
    btn=pg.locator('button:has-text("Save")').first
    await btn.dblclick(); await pg.wait_for_timeout(800)
    ups=await pg.evaluate("window.__calls.filter(c=>c[0]=='update')")
    print('updates after double-click:',len(ups)); print('payload remarks:',repr(ups[0][2].get('remarks')) if ups else None)
    # 2) note block
    await pg.evaluate("noteId=101;render()"); await pg.wait_for_timeout(400)
    await pg.evaluate("window.__calls.length=0")
    await pg.fill('#nt','second note'); await pg.locator('button:has-text("Save note")').click(); await pg.wait_for_timeout(600)
    ups=await pg.evaluate("window.__calls.filter(c=>c[0]=='update')"); print('note payload:',repr(ups[0][2]) if ups else None)
    # 3) empty note blocked
    await pg.evaluate("noteId=101;render()"); await pg.wait_for_timeout(300); await pg.evaluate("window.__calls.length=0")
    await pg.locator('button:has-text("Save note")').click(); await pg.wait_for_timeout(400)
    print('empty note writes:',len(await pg.evaluate("window.__calls.filter(c=>c[0]=='update')")), '| toast:', await pg.inner_text('#toast'))
    # 4) call form note
    await pg.evaluate("openId=101;openK='call';render()"); await pg.wait_for_timeout(400)
    ks=await pg.evaluate("[...document.querySelectorAll('#app textarea')].map(t=>t.id+':'+t.value)"); print('call form textareas:',ks)
    print('errors:',errs)
    await br.close()
asyncio.run(main())

import asyncio
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open('/home/claude/qa/mock.js').read()
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await br.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
        if 'xlsx' in u and 'cdnjs' in u: return await r.fulfill(body=open('/home/claude/qa/vendor/package/dist/xlsx.full.min.js').read(),content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.fulfill(body='',content_type='text/plain')
    await ctx.route('**/*',route)
    await ctx.add_init_script("localStorage.setItem('mockrole','admin')")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    dls=[]; pg.on('download',lambda d:dls.append(d))
    await pg.goto(BASE+'index.html'); await pg.wait_for_timeout(1200)
    await pg.evaluate("openDrawer()"); await pg.wait_for_timeout(300)
    await pg.locator('#drb .di:has-text("Full backup")').click()
    await pg.wait_for_timeout(5000)
    print('toast:',await pg.inner_text('#toast'))
    for d in dls:
        path='/tmp/'+d.suggested_filename; await d.save_as(path); print('download',d.suggested_filename)
    await pg.locator('#drb .di:has-text("Download Excel")').click(); await pg.wait_for_timeout(3000)
    print('toast2:',await pg.inner_text('#toast')); print('drawer item text:',await pg.inner_text('#drb .di:has-text("Download Excel")'))
    print('downloads total',len(dls),'errors',errs)
    await br.close()
asyncio.run(main())

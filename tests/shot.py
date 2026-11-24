import asyncio,sys,os
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open('/home/claude/qa/mock.js').read()
# usage: shot.py role page "js;js" out.png [w h] [full]
async def main(role,page,js,out,w=390,h=844,full=False):
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await br.new_context(viewport={'width':w,'height':h})
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
        if 'xlsx' in u: return await r.fulfill(body=open('/home/claude/qa/vendor/package/dist/xlsx.full.min.js').read(),content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.fulfill(body='',content_type='text/plain')
    await ctx.route('**/*',route)
    await ctx.add_init_script(f"localStorage.setItem('mockrole','{role}')")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(BASE+page); await pg.wait_for_timeout(1200)
    for j in [x for x in js.split(';;') if x.strip()]:
        await pg.evaluate(j); await pg.wait_for_timeout(500)
    await pg.screenshot(path=out,full_page=full)
    if errs: print('ERR',errs)
    await br.close()
a=sys.argv
asyncio.run(main(a[1],a[2],a[3],a[4],int(a[5]) if len(a)>5 else 390,int(a[6]) if len(a)>6 else 844,len(a)>7))

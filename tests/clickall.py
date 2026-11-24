import asyncio,sys
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open('/home/claude/qa/mock.js').read()
SKIP=('logout','location.href','doDelete','toggleMode','history.back','exportXlsx','fullBackup','doInstall')
async def main(page='index.html'):
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    res=[]
    for role in (['admin','telecaller','fe'] if page=='index.html' else ['admin']):
      ctx=await br.new_context(viewport={'width':390,'height':844})
      async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.fulfill(body='',content_type='text/plain')
      await ctx.route('**/*',route)
      await ctx.add_init_script(f"localStorage.setItem('mockrole','{role}');window.open=()=>null;")
      pg=await ctx.new_page(); errs=[]
      pg.on('pageerror',lambda e:errs.append(str(e)))
      pg.on('dialog',lambda d:asyncio.ensure_future(d.dismiss()))
      await pg.goto(BASE+page); await pg.wait_for_timeout(1200)
      tabs=await pg.evaluate("typeof TABS!=='undefined'&&ME?(TABS[ME.role]||[]).map(x=>x[0]):['props','buyers','fu','deal','rep','team','un','access','mb']")
      for t in tabs:
        await pg.evaluate(f"go('{t}')"); await pg.wait_for_timeout(400)
        n=await pg.evaluate("document.querySelectorAll('#app [onclick]').length")
        for i in range(min(n,40)):
          await pg.evaluate(f"go('{t}')"); await pg.wait_for_timeout(250)
          info=await pg.evaluate(f"(()=>{{const e=document.querySelectorAll('#app [onclick]')[{i}];if(!e)return null;return e.getAttribute('onclick').slice(0,60)}})()")
          if not info or any(s in info for s in SKIP): continue
          errs.clear()
          try:
            await pg.evaluate(f"document.querySelectorAll('#app [onclick]')[{i}].click()")
          except Exception as ex: errs.append('click:'+str(ex)[:80])
          await pg.wait_for_timeout(350)
          txt=await pg.inner_text('#app')
          if errs or 'Something went wrong' in txt:
            res.append((role,t,info,errs[:2],'SWW' if 'Something went wrong' in txt else ''))
          # close any overlay
          await pg.evaluate("document.querySelectorAll('#nhv,#wqv').forEach(x=>x.remove())")
      await ctx.close()
    await br.close()
    for r in res: print(r)
    print('problems',len(res))
asyncio.run(main(sys.argv[1] if len(sys.argv)>1 else 'index.html'))

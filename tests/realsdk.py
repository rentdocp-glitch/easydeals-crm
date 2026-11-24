import asyncio
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
LIB=open('/home/claude/qa/vendor/sb/package/dist/umd/supabase.js').read()
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for page in ['index.html','buyers.html','onboard.html']:
      ctx=await br.new_context(viewport={'width':390,'height':844})
      seen=[]
      async def route(r):
        u=r.request.url
        if 'supabase-js' in u: seen.append(u); return await r.fulfill(body=LIB,content_type='application/javascript')
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
      await ctx.route('**/*',route)
      pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
      await pg.goto(BASE+page); await pg.wait_for_timeout(2500)
      v=await pg.evaluate("[typeof supabase.createClient, typeof sb.from('leads').select('*').eq('a',1).range(0,9).contains, typeof sb.rpc, typeof sb.functions.invoke, !!document.querySelector('#pw,#em,input[type=password]')]")
      print(page,'sdk url:',seen[0].split('npm/')[1] if seen else None,'api:',v,'errors:',errs)
      await ctx.close()
    await br.close()
asyncio.run(main())

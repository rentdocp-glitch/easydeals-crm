import sys, asyncio, json
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8765/'
MOCK=open('/home/claude/qa/mock.js').read()
import os
VIEWPORTS={'mobile':{'width':int(os.environ.get('VW','390')),'height':int(os.environ.get('VH','844'))}}
async def run(page_name='index.html', roles=('admin','telecaller','fe'), shots=None):
    out=[]
    async with async_playwright() as p:
        br=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for role in roles:
            ctx=await br.new_context(viewport=VIEWPORTS['mobile'],device_scale_factor=1)
            async def route(r):
                u=r.request.url
                if 'supabase-js' in u: return await r.fulfill(body=MOCK,content_type='application/javascript')
                if u.startswith(BASE): return await r.continue_()
                return await r.fulfill(body='',content_type='text/plain')
            await ctx.route('**/*',route)
            await ctx.add_init_script(f"localStorage.setItem('mockrole','{role}')")
            pg=await ctx.new_page()
            errs=[]
            pg.on('pageerror',lambda e,errs=errs:errs.append('pageerror: '+str(e)))
            pg.on('console',lambda m,errs=errs:errs.append('console.'+m.type+': '+m.text) if m.type=='error' else None)
            await pg.goto(BASE+page_name); await pg.wait_for_timeout(1500)
            if page_name=='buyers.html' and role=='admin':
                for t in ['props','buyers','fu','deal','rep','team','un','access','mb']:
                    errs.clear(); await pg.evaluate(f"go('{t}')"); await pg.wait_for_timeout(400)
                    txt=await pg.inner_text('#app'); bad='Something went wrong' in txt
                    out.append((role,'b:'+t,errs[:],(txt[txt.find('Something went wrong'):][:200] if bad else '')))
                    if shots: await pg.screenshot(path=f'{shots}/b-{t}.png',full_page=False)
                await ctx.close(); continue
            if page_name!='index.html':
                txt=await pg.inner_text('body'); out.append((role,'load',errs[:],''))
                if shots: await pg.screenshot(path=f'{shots}/{page_name}-{role}.png',full_page=True)
                await ctx.close(); continue
            tabs=await pg.evaluate("(()=>{const t=(TABS[ME.role]||[]).map(x=>x[0]);const extra={admin:['st','xfer','dups','xlog','dreq','rep'],telecaller:[],fe:['fs']}[ME.role]||[];return t.concat(extra)})()")
            modes=['owner']+(['rm'] if role!='admin' else [])
            for mode in modes:
                if mode=='rm':
                    await pg.evaluate("ME.canRM=true;toggleMode()"); await pg.wait_for_timeout(500)
                    tabs=await pg.evaluate("TABS[ME.role].map(x=>x[0])")
                for t in tabs:
                    errs.clear()
                    await pg.evaluate(f"go('{t}')"); await pg.wait_for_timeout(500)
                    txt=await pg.inner_text('#app')
                    ov=await pg.evaluate('document.documentElement.scrollWidth-innerWidth')
                    if ov>2: errs.append('OVERFLOW %dpx'%ov)
                    bad='Something went wrong' in txt
                    out.append((role,mode+':'+t,errs[:],(txt[txt.find('Something went wrong'):][:200] if bad else '')))
                    if shots: await pg.screenshot(path=f'{shots}/{role}-{mode}-{t}.png',full_page=False)
            await ctx.close()
        await br.close()
    return out
if __name__=='__main__':
    page=sys.argv[1] if len(sys.argv)>1 else 'index.html'
    shots=sys.argv[2] if len(sys.argv)>2 else None
    res=asyncio.run(run(page,shots=shots))
    fails=0
    for r in res:
        flag='FAIL' if (r[2] or r[3]) else 'ok'
        if flag=='FAIL': fails+=1
        if flag=='FAIL' or '-v' in sys.argv: print(flag,r[0],r[1],r[2][:3],r[3][:200])
    print('total',len(res),'fail',fails)

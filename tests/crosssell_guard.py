"""No-cross-selling guard for the team app WhatsApp templates (mock data only).
Adds a second property to the in-page list, then renders EVERY buyer template in
index.html and buyers.html and fails if any text names the other property or offers "other options".
Run: python3 -m http.server 8765 (repo root) and the mock in /home/claude/qa/mock.js, then python3 tests/crosssell_guard.py"""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8765/'
MOCK = open('/home/claude/qa/mock.js').read()
BAD = ['ED-999', 'Other Towers', 'more options', 'other options', 'matching options', 'Similar properties', 'More options']
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for page in ['index.html', 'buyers.html']:
        ctx = br.new_context(viewport={'width': 390, 'height': 844})
        def route(r):
            u = r.request.url
            if 'supabase-js' in u: return r.fulfill(body=MOCK, content_type='application/javascript')
            if u.split('?')[0] == BASE + 'index.html':
                # index.html keeps its templates inside a closure: expose them to this test only (served copy, file unchanged)
                src = open('index.html', encoding='utf8').read()
                i = src.index('/* ===== WhatsApp templates: owner data, buyer leads')
                j = src.index('})();\n</script>', i)
                src = src[:j] + 'window.__T={WT,WTdef,waText,BL_T,addProp:function(x){WAPR.push(x)}};\n' + src[j:]
                return r.fulfill(body=src, content_type='text/html')
            if u.startswith(BASE): return r.continue_()
            return r.fulfill(body='', content_type='text/plain')
        ctx.route('**/*', route)
        ctx.add_init_script("localStorage.setItem('mockrole','admin')")
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + page); pg.wait_for_timeout(1500)
        res = pg.evaluate("""(()=>{
          const own={id:'ED-001',project:'Society 10',bhk:'2 BHK',locality:'Baner',status:'Available - Sale',price:'85 L',details:{}};
          const other={id:'ED-999',project:'Other Towers',bhk:'2 BHK',locality:'Baner',status:'Available - Sale',price:'90 L',details:{}};
          let WT,WTdef,waText,BL_T;
          if(window.__T){({WT,WTdef,waText,BL_T}=window.__T);__T.addProp(own);__T.addProp(other)}
          else{WT=window.eval('WT');WTdef=window.eval('WTdef');waText=window.eval('waText');try{BL_T=window.eval('BL_T')}catch(e){}
               const PRx=window.eval('PR');if(Array.isArray(PRx)&&!PRx.find(x=>x.id==='ED-999'))PRx.push(other)}
          const b={id:1,buyer_name:'Rahul Patil',buyer_phone:'9000000001',property_id:'ED-001',status:'Not Interested',source:'99acres'};
          const out={keys:WT.map(x=>x[0]),def:WTdef(b),texts:{}};
          WT.forEach(([k])=>{try{out.texts[k]=waText(k,b)}catch(e){out.texts[k]='ERR '+e.message}});
          out.texts['similar(legacy key)']=waText('similar',b);
          out.noprop=waText('details',Object.assign({},b,{property_id:null}));
          if(BL_T)out.bl=BL_T.map(x=>x[0]);
          return out})()""")
        if 'similar' in res['keys'] or 'similar' in (res.get('bl') or []): fails.append(f'{page}: "similar" template still offered')
        if res['def'] == 'similar': fails.append(f'{page}: Not Interested still defaults to similar')
        for k, t in list(res['texts'].items()) + [('no property', res['noprop'])]:
            if t.startswith('ERR'): fails.append(f'{page} {k}: {t}')
            for w in BAD:
                if w.lower() in t.lower(): fails.append(f'{page} template {k}: contains "{w}"')
        if errs: fails.append(f'{page}: JS errors {errs}')
        print(page, 'templates checked:', ', '.join(res['texts'].keys()))
        ctx.close()
    br.close()
print('FAIL' if fails else 'PASS', *fails, sep='\n  ')
sys.exit(1 if fails else 0)

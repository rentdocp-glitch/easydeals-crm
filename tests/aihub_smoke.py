"""AI Hub smoke test (mock data only, no network writes).
Run from repo root:  python3 -m http.server 8765 &  then  python3 tests/aihub_smoke.py [outdir]
Opens every tab at 360 px and 1280 px, checks for JS errors and sideways overflow,
exercises the approval queue, and verifies the live mode refuses without a login.
Any request to a host other than localhost is blocked and reported."""
import sys, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/aihub.html?mock=1')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/aihub_shots'
os.makedirs(OUT, exist_ok=True)
TABS = ['dash', 'owner', 'buyer', 'mkt', 'report', 'appr', 'act', 'cost', 'set']
fails, external = [], []

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for w, h in [(360, 780), (1280, 900)]:
        ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if w == 360 else 1)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        def route(r):
            if 'localhost' in r.request.url: return r.continue_()
            external.append(r.request.url); return r.abort()
        pg.route('**/*', route)
        pg.goto(BASE); pg.wait_for_selector('#tabs button')
        for t in TABS:
            pg.evaluate(f"go('{t}')"); pg.wait_for_timeout(150)
            txt = pg.inner_text('#app')
            if 'Something went wrong' in txt: fails.append(f'{w}px {t}: render error')
            ov = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            if ov > 2: fails.append(f'{w}px {t}: sideways overflow {ov}px')
            if w == 360: pg.screenshot(path=f'{OUT}/{t}_360.png', full_page=False)
        if w == 360:
            # Buyer tab: open the first draft, queue all HOT drafts, approve one, reject one
            pg.evaluate("go('buyer')"); pg.click('details summary'); pg.screenshot(path=f'{OUT}/buyer_draft_360.png')
            pg.click('text=Queue all HOT drafts'); pg.wait_for_timeout(100)
            n = pg.evaluate("S.queue.filter(q=>q.status=='pending').length")
            if n < 3: fails.append(f'queue: expected >=3 HOT drafts, got {n}')
            pg.click('text=Queue all HOT drafts'); pg.wait_for_timeout(100)
            if pg.evaluate("S.queue.length") != n: fails.append('queue: duplicate drafts were added')
            pg.evaluate("go('appr')"); pg.screenshot(path=f'{OUT}/approvals_pending_360.png')
            pg.click('text=✅ Approve >> nth=0'); pg.click('text=✖ Reject >> nth=0')
            st = pg.evaluate("S.queue.map(q=>q.status)")
            if st.count('approved') != 1 or st.count('rejected') != 1: fails.append(f'queue decisions wrong: {st}')
            pg.evaluate("F.appr='approved';render()"); pg.screenshot(path=f'{OUT}/approvals_approved_360.png')
            pg.evaluate("go('act')"); pg.screenshot(path=f'{OUT}/activity_360.png')
            pg.evaluate("go('owner')"); pg.click('text=Call suggestions >> nth=0'); pg.screenshot(path=f'{OUT}/owner_script_360.png')
            pg.evaluate("go('report')"); pg.screenshot(path=f'{OUT}/report_full_360.png', full_page=True)
            pg.evaluate("go('mkt')"); pg.screenshot(path=f'{OUT}/mkt_full_360.png', full_page=True)
            pg.evaluate("go('dash')"); pg.screenshot(path=f'{OUT}/dash_full_360.png', full_page=True)
        if w == 360:
            # Growing data: pretend the last visit saw buyers up to id 5, reload, new ones must be flagged
            pg.evaluate("localStorage.setItem('aihub_v1_mock', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('aihub_v1_mock')||'{}'), {seen:{b:5,l:5}})))")
            pg.reload(); pg.wait_for_selector('#tabs button'); pg.evaluate("go('buyer')")
            if pg.evaluate("F.buyer") != 'NEW': fails.append('buyer tab did not open on New after new enquiries arrived')
            nn = pg.evaluate("R.buyers.filter(b=>b.isNew&&!b.dupOf).length")
            if nn < 5: fails.append(f'expected >=5 new buyers, got {nn}')
            pg.screenshot(path=f'{OUT}/buyer_new_360.png')
            pg.evaluate("refresh(true)"); pg.wait_for_timeout(300)
            if pg.evaluate("R.buyers.filter(b=>b.isNew).length") != nn: fails.append('manual refresh changed the new-lead set')
            pg.evaluate("go('dash')"); pg.screenshot(path=f'{OUT}/dash_live_360.png')
        if w == 1280: pg.evaluate("go('dash')"); pg.screenshot(path=f'{OUT}/dash_1280.png', full_page=True)
        if errs: fails.append(f'{w}px JS errors: {errs}')
        ctx.close()
    # Live mode without login must refuse (Supabase CDN is blocked here, so it must fail safely)
    ctx = br.new_context(viewport={'width': 360, 'height': 780}); pg = ctx.new_page()
    pg.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    pg.goto(BASE.replace('?mock=1', '')); pg.wait_for_timeout(1500)
    t = pg.inner_text('#app')
    if 'Could not load' not in t: fails.append('live mode without login did not refuse: ' + t[:120])
    pg.screenshot(path=f'{OUT}/live_refused_360.png'); ctx.close()
    br.close()

ext = [u for u in external if 'supabase' not in u]
if ext: fails.append(f'unexpected external requests in mock mode: {ext}')
print('FAIL' if fails else 'PASS', *fails, sep='\n  ')
sys.exit(1 if fails else 0)

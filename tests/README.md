# CRM smoke tests (no real data)

The tests use a fake (mocked) Supabase, so nothing touches the live database.

Setup (one time): `pip install playwright`. You also need Google Chrome at `/usr/bin/google-chrome`.

1. Serve the repo: `python3 -m http.server 8765` (run this in the repo root).
2. In this folder, run:
   - `python3 smoke.py index.html`: opens every tab for admin, telecaller and FE, including RM mode.
   - `python3 smoke.py buyers.html` and `python3 smoke.py onboard.html`
   - `VW=360 python3 smoke.py`: same check on a 360 px wide screen. It also flags any sideways overflow.
   - `python3 clickall.py index.html`: taps every button on every tab.
   - `python3 flows.py` and `python3 flows2.py`: test notes history, double tap, delete safety copy, Needs attention links, the drawer and the Back button.
   - `python3 backup_test.py`: tests the Full backup files.
   - `node wa_signature_test.mjs`: tests the webhook signature logic.
   - `python3 flows3.py`: status history in Number history, AI-off banner and disabled Send on locked properties, admin-only toggle, Full backup table list.
   - `node --test aihub_engine.test.mjs` and `python3 aihub_smoke.py`: AI Hub (read-only page).

`backup_test.py`, `shot.py` and `realsdk.py` expect the Excel and Supabase libraries downloaded into `../qa/vendor` (see the comments inside each file).

Paths inside the scripts point to `/home/claude/qa`. Change them if you run the tests somewhere else.

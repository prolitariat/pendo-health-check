#!/usr/bin/env python3
"""Render Chrome Web Store screenshots from the real v4.6.1 popup UI.

Uses a fresh headless Chrome profile and fixture data. It never reads the user's
Chrome profile, installs the extension, or calls Pendo/network diagnostics.
Output is three opaque 1280x800 PNG files under store-screenshots/v4.6.1.

Run with --chrome /path/to/chrome or set CHROME_BIN when Chrome is not detected.
Use --html-dir /path/to/scratch to generate the same self-contained fixture HTML
for a browser automation runner. All styles and renderers come from the repository;
fixture startup excludes extension APIs, telemetry and diagnostic execution.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import argparse
import json
import os
import shutil
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path(os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser") or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
OUT = ROOT / "store-screenshots" / "v4.6.1"

SCENES = [
    {
        "name": "01-status", "tab": "status",
        "title": "Your Pendo checks,<br>right up front.",
        "intro": "Review install signals, copy IDs, and open the Pendo Debugger from one view.",
        "features": [
            ("A clear starting point", "An A-to-F grade and a plain-language status."),
            ("Everyday actions, close at hand", "Visitor ID, Account ID, and debugger access."),
            ("A report when issues appear", "Copy findings with Pendo validateInstall output.")
        ],
        "values": {"visitorId": "visitor_demo_42", "accountId": "account_demo_17", "version": "2.348.0_prod-io", "realm": "US"},
        "extra_warnings": [{"status": "warn", "label": "Pendo Instances", "detail": "Multiple Pendo agent scripts detected"}]
    },
    {
        "name": "02-identifiers", "tab": "ids",
        "title": "Useful IDs.<br>No empty rows.",
        "intro": "See the values available on this page. Copy one field, or export all identifier fields as JSON.",
        "features": [
            ("Click a value to copy it", "Use complete IDs in tickets and investigations."),
            ("Unset fields stay out of view", "A shorter table, with fewer distractions."),
            ("Keep the technical context", "Agent version and realm are easy to find.")
        ],
        "values": {"visitorId": "visitor_demo_42", "accountId": None, "subscriptionId": None, "sessionId": None, "version": "2.348.0_prod-io", "realm": "US"}
    },
    {
        "name": "03-tools", "tab": "tools",
        "title": "Automatic checks.<br>Your choice.",
        "intro": "Keep an issue badge on the toolbar. Turn on automatic page checks when you want them.",
        "features": [
            ("Badge on by default", "See warning and critical issue counts after analysis."),
            ("Auto-check off by default", "Enable page-load checks from the Tools tab."),
            ("Permission requested when needed", "Chrome asks for page access when you enable auto-check.")
        ],
        "values": {"visitorId": "visitor_demo_42", "accountId": "account_demo_17", "version": "2.348.0_prod-io", "realm": "US"}
    }
]


def build_page(scene):
    markup = (ROOT / "popup.html").read_text().split("<body>", 1)[1].split('<script src="popup.js"></script>', 1)[0]
    css = (ROOT / "popup.css").read_text()
    source = (ROOT / "popup.js").read_text()
    # Reuse actual score + UI renderers, excluding extension startup, telemetry,
    # tool event handlers and page-injected diagnostic functions.
    renderers = source[source.index("function computeGrade("):source.index("// --- Wireup: tabs")]
    features = "".join('<div class="feature"><span class="dot"></span><div><h2>' + title + '</h2><p>' + body + '</p></div></div>' for title, body in scene["features"])
    fixture = """
      window.__lastValues = VALUES;
      document.getElementById('loading').classList.remove('is-active');
      document.getElementById('tabs').style.display = 'flex';
      document.getElementById('content').style.display = 'block';
      document.getElementById('page-url-display').textContent = 'https://app.example.com/dashboard';
      v4RenderAllQuickCopy(window.__lastValues);
      var checks = [{status:'pass',label:'Pendo Agent Loaded'}, {status:'pass',label:'Pendo Ready'}];
      if (!window.__lastValues.accountId) checks.push({status:'warn',label:'Account ID',detail:'No account ID found'});
      checks = checks.concat(EXTRA_WARNINGS);
      var issues = v4BuildIssues(checks, null, window.__lastValues);
      v4RenderIssuesList(issues);
      v4RenderWhyItems(issues);
      renderGradeCard(computeGrade(checks, []));
      v4ActivateTab(TAB);
      document.getElementById('badge-enabled').checked = true;
      document.getElementById('auto-check-enabled').checked = false;
      requestAnimationFrame(function () {
        var shell = document.querySelector('.ui-shell');
        shell.style.top = Math.round((800 - shell.getBoundingClientRect().height) / 2) + 'px';
        document.documentElement.dataset.ready = 'true';
      });
    """.replace("VALUES", json.dumps(scene["values"])).replace("TAB", json.dumps(scene["tab"])).replace("EXTRA_WARNINGS", json.dumps(scene.get("extra_warnings", [])))
    composition = """
      body { width:1280px; height:800px; overflow:hidden; background:#F7F8FB; font-family:var(--sans); }
      .stage { position:relative; width:1280px; height:800px; overflow:hidden; }
      .glow { position:absolute; width:740px; height:740px; left:600px; top:40px; background:radial-gradient(circle, #FDE9F0 0%, #F7F8FB 69%); }
      .identity { position:absolute; left:76px; top:63px; display:flex; align-items:center; gap:12px; font-weight:750; font-size:21px; color:#1A1A24; }
      .identity-mark { width:31px; height:31px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#EB4778; color:white; font-size:26px; font-weight:700; }
      .release { position:absolute; top:113px; left:76px; font-size:11px; font-weight:750; letter-spacing:2px; color:#C9335F; }
      .copy { position:absolute; left:76px; top:181px; width:548px; }
      .copy h1 { margin:0 0 24px; color:#1A1A24; font-size:51px; letter-spacing:-1.8px; line-height:1.07; font-weight:800; }
      .intro { width:500px; margin:0; font-size:19px; line-height:1.52; color:#585965; }
      .features { margin-top:34px; display:flex; flex-direction:column; gap:23px; }
      .feature { display:flex; gap:13px; align-items:flex-start; }
      .dot { flex:0 0 8px; width:8px; height:8px; background:#EB4778; border-radius:50%; margin-top:7px; }
      .feature h2 { margin:0 0 5px; color:#252630; font-size:16px; letter-spacing:-.15px; font-weight:700; }
      .feature p { margin:0; color:#696A76; font-size:14px; line-height:1.45; max-width:475px; }
      .ui-shell { position:absolute; left:711px; top:80px; width:384px; transform:scale(1.30); transform-origin:top left; border:1px solid #E1E1E8; border-radius:13px; background:white; overflow:hidden; box-shadow:0 20px 55px #3432471A,0 4px 12px #3432470C; }
      .legal { position:absolute; left:76px; bottom:54px; color:#767783; font-size:11px; line-height:1.7; }
      .legal b { color:#50515B; font-weight:600; }
    """
    return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + composition + '</style></head><body><main class="stage"><div class="glow"></div><div class="identity"><span class="identity-mark">+</span>Pendo Health Check</div><div class="release">VERSION 4.6.1</div><section class="copy"><h1>' + scene["title"] + '</h1><p class="intro">' + scene["intro"] + '</p><div class="features">' + features + '</div></section><div class="ui-shell">' + markup + '</div><div class="legal"><b>Independent tool. Not affiliated with or endorsed by Pendo.</b><br>Example data shown. Available fields and findings vary by page.</div></main><script>' + renderers.replace('</script', '<\/script') + fixture + '</script></body></html>'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chrome', type=Path, default=CHROME)
    parser.add_argument('--html-dir', type=Path, help='Write offline fixture HTML only, for another browser test renderer')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.html_dir:
        args.html_dir.mkdir(parents=True, exist_ok=True)
        for scene in SCENES:
            html = args.html_dir / (scene['name'] + '.html')
            html.write_text(build_page(scene))
            print(str(html))
        return
    if not args.chrome.is_file():
        parser.error("Chrome was not found. Supply --chrome /path/to/chrome or CHROME_BIN.")
    with TemporaryDirectory(prefix='pendo-store-render-') as tmp:
        temp = Path(tmp)
        for scene in SCENES:
            html = temp / (scene['name'] + '.html')
            html.write_text(build_page(scene))
            png = OUT / (scene['name'] + '.png')
            command = [str(args.chrome), '--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1280,800', '--virtual-time-budget=1200', '--user-data-dir=' + str(temp / ('profile-' + scene['tab'])), '--screenshot=' + str(png), html.as_uri()]
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
            if result.returncode:
                raise RuntimeError("Chrome exited " + str(result.returncode) + ": " + result.stderr.decode(errors='replace')[-2500:])
            with Image.open(png) as image:
                if image.size != (1280, 800):
                    raise RuntimeError('Unexpected screenshot size: ' + str(image.size))
                image.convert('RGB').save(png)
            print(str(png))

if __name__ == '__main__':
    main()

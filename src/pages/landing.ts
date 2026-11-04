export function landingPage(saasMode = false, loggedIn = false): string {
  const primaryHref = saasMode && !loggedIn ? "/account" : "/app";
  const primaryLabel = saasMode
    ? loggedIn ? "进入上传工作台" : "登录 / 免费注册"
    : "打开上传工作台";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="PicoShare：快速分享文件、图片、HTML 视觉稿和云便签。支持浏览器扩展、API、CLI 与 Agent Skill。" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#f6f5f4" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>PicoShare — 让内容从本地，变成可分享的链接</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f5f3ed;
      --paper-deep: #ebe8df;
      --ink: #172321;
      --ink-soft: #45534e;
      --muted: #78817a;
      --line: #d8d9d0;
      --orange: #ef6842;
      --orange-dark: #c94d2d;
      --lime: #d9f06e;
      --teal: #173e38;
      --white: #fffefa;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      --serif: "Songti SC", "STSong", Georgia, serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 90px; }
    body { margin: 0; color: var(--ink); background: var(--paper); font: 15px/1.65 var(--sans); }
    a { color: inherit; text-decoration: none; }
    button { font: inherit; }
    .wrap { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
    .skip-link { position: absolute; left: 12px; top: -60px; z-index: 20; padding: 10px 14px; color: var(--ink); background: var(--lime); border-radius: 8px; }
    .skip-link:focus { top: 12px; }
    .topbar { position: sticky; top: 0; z-index: 10; background: rgba(245,243,237,.9); border-bottom: 1px solid rgba(23,35,33,.08); backdrop-filter: blur(16px); }
    .nav { min-height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .brand { display: inline-flex; align-items: center; gap: 11px; font-size: 17px; font-weight: 800; letter-spacing: -.04em; }
    .brand-mark { display: grid; place-items: center; width: 34px; height: 34px; color: var(--ink); background: var(--lime); border-radius: 10px 10px 10px 3px; }
    .brand-mark svg { width: 22px; height: 22px; }
    .brand-mark img { width: 27px; height: 27px; object-fit: contain; }
    .brand-sub { margin-left: -5px; color: var(--muted); font: 11px var(--mono); letter-spacing: .02em; }
    .nav-links { display: flex; gap: clamp(16px, 2.8vw, 34px); align-items: center; color: var(--ink-soft); font-size: 13px; }
    .nav-links a:hover, .footer-links a:hover { color: var(--orange-dark); }
    .nav-actions { display: flex; align-items: center; gap: 10px; }
    .button { display: inline-flex; justify-content: center; align-items: center; gap: 10px; min-height: 46px; padding: 0 19px; border: 1px solid transparent; border-radius: 8px; font-size: 13px; font-weight: 700; transition: transform .18s ease, background .18s ease, border-color .18s ease; cursor: pointer; }
    .button:hover { transform: translateY(-2px); }
    .button-dark { color: var(--white); background: var(--ink); }
    .button-dark:hover { background: #2a3a36; }
    .button-orange { color: white; background: var(--orange); }
    .button-orange:hover { background: var(--orange-dark); }
    .button-outline { color: var(--ink); border-color: #aeb8ac; background: transparent; }
    .button-outline:hover { border-color: var(--ink); background: rgba(255,255,255,.55); }
    .arrow { font-size: 17px; line-height: 1; }

    .hero { position: relative; isolation: isolate; overflow: hidden; color: var(--white); background: var(--ink); }
    .hero::before { content: ""; position: absolute; z-index: -1; inset: 0; opacity: .18; background-image: linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px); background-size: 48px 48px; mask-image: linear-gradient(90deg, black, transparent 85%); }
    .hero::after { content: ""; position: absolute; z-index: -1; width: 520px; height: 520px; right: -100px; top: -220px; border: 1px solid rgba(217,240,110,.23); border-radius: 50%; box-shadow: 0 0 0 55px rgba(217,240,110,.035), 0 0 0 110px rgba(217,240,110,.025); }
    .hero-grid { min-height: 610px; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 60px; padding: 76px 0 88px; }
    .eyebrow { display: flex; align-items: center; gap: 9px; margin: 0 0 22px; color: var(--lime); font: 11px var(--mono); letter-spacing: .13em; text-transform: uppercase; }
    .eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--orange); box-shadow: 0 0 18px var(--orange); }
    .hero h1 { max-width: 620px; margin: 0; font-size: clamp(48px, 6vw, 76px); line-height: 1.06; letter-spacing: -.075em; font-weight: 800; }
    .hero h1 em { color: var(--lime); font-style: normal; }
    .hero-lede { max-width: 500px; margin: 24px 0 28px; color: #b8c2b8; font-size: 16px; line-height: 1.9; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 11px; }
    .hero .button-outline { color: var(--white); border-color: #52635d; }
    .hero .button-outline:hover { background: rgba(255,255,255,.08); }
    .hero-proof { display: flex; align-items: center; gap: 12px; margin-top: 31px; color: #9ca9a1; font-size: 11px; }
    .proof-rule { width: 28px; height: 1px; background: var(--orange); }
    .hero-art { position: relative; min-height: 435px; display: grid; place-items: center; }
    .orbit { position: absolute; width: min(430px, 90vw); aspect-ratio: 1; border: 1px solid rgba(217,240,110,.12); border-radius: 50%; }
    .orbit::before, .orbit::after { content: ""; position: absolute; inset: 34px; border: 1px dashed rgba(217,240,110,.1); border-radius: 50%; }
    .orbit::after { inset: 90px; border-style: solid; opacity: .45; }
    .share-window { position: relative; z-index: 2; width: min(410px, 100%); padding: 15px; color: var(--ink); background: var(--white); border: 1px solid rgba(255,255,255,.6); border-radius: 13px; box-shadow: 0 28px 90px rgba(0,0,0,.34); transform: rotate(-2.2deg); animation: settle .9s cubic-bezier(.2,.8,.2,1) both; }
    @keyframes settle { from { opacity: 0; transform: translateY(18px) rotate(1deg); } to { opacity: 1; transform: rotate(-2.2deg); } }
    .window-bar { display: flex; align-items: center; justify-content: space-between; padding: 1px 0 13px; border-bottom: 1px solid #e9ebe4; color: #89928b; font: 10px var(--mono); }
    .window-dots { display: flex; gap: 4px; }
    .window-dots i { display: block; width: 6px; height: 6px; border-radius: 50%; background: #d0d5cd; }
    .file-row { display: flex; align-items: center; gap: 12px; padding: 18px 2px 14px; }
    .file-icon { display: grid; place-items: center; flex: 0 0 43px; width: 43px; height: 49px; color: #fff; background: var(--orange); border-radius: 7px; font: 10px var(--mono); box-shadow: 5px 5px 0 #f6c7b9; }
    .file-info { min-width: 0; flex: 1; }
    .file-name { display: block; overflow: hidden; color: var(--ink); font-size: 13px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
    .file-meta { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; }
    .uploaded { padding: 5px 8px; color: #386b49; background: #e7f2df; border-radius: 5px; font-size: 9px; font-weight: 700; }
    .share-label { display: flex; justify-content: space-between; padding: 0 2px 6px; color: #818980; font-size: 9px; }
    .share-url { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px; border: 1px solid #dfe2da; border-radius: 7px; background: #f8f8f3; font: 10px var(--mono); }
    .share-url span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .copy-chip { flex: 0 0 auto; padding: 4px 7px; color: #182c27; background: var(--lime); border-radius: 4px; font-size: 9px; font-weight: 800; }
    .share-foot { display: flex; justify-content: space-between; align-items: center; padding: 12px 2px 0; color: #909890; font-size: 9px; }
    .avatar-stack { display: flex; align-items: center; }
    .avatar-stack i { display: grid; place-items: center; width: 20px; height: 20px; margin-left: -4px; border: 2px solid white; border-radius: 50%; background: var(--teal); color: var(--lime); font-size: 7px; font-style: normal; }
    .orbit-label { position: absolute; z-index: 3; padding: 7px 10px; color: var(--lime); background: #263630; border: 1px solid #53645a; border-radius: 5px; font: 9px var(--mono); letter-spacing: .05em; }
    .orbit-label.one { top: 25px; right: 7px; transform: rotate(4deg); }
    .orbit-label.two { bottom: 37px; left: 0; color: #ffb39b; transform: rotate(-5deg); }
    .orbit-label.three { bottom: 75px; right: -10px; }
    .hero-index { position: absolute; right: 6px; bottom: 10px; color: #75817a; font: 10px var(--mono); }

    .ticker { overflow: hidden; border-bottom: 1px solid var(--line); background: var(--lime); }
    .ticker-inner { min-height: 51px; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 12px 30px; color: #263625; font-size: 11px; font-weight: 700; letter-spacing: .03em; }
    .ticker-item { display: inline-flex; align-items: center; gap: 8px; }
    .ticker-item b { color: var(--orange-dark); font: 12px var(--mono); }
    section.content-section { padding: 106px 0; }
    .section-head { display: grid; grid-template-columns: .85fr 1.15fr; align-items: end; gap: 40px; margin-bottom: 42px; }
    .section-kicker { margin: 0 0 11px; color: var(--orange-dark); font: 11px var(--mono); letter-spacing: .1em; text-transform: uppercase; }
    .section-head h2 { max-width: 500px; margin: 0; font-size: clamp(34px, 4vw, 51px); line-height: 1.13; letter-spacing: -.065em; }
    .section-head p { max-width: 450px; margin: 0 0 4px; color: var(--muted); font-size: 14px; line-height: 1.9; }
    .pain-section { background: var(--paper); }
    .pain-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 13px; }
    .pain-card { position: relative; min-height: 222px; grid-column: span 2; padding: 21px; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,254,250,.74); transition: transform .2s ease, box-shadow .2s ease; }
    .pain-card:hover { transform: translateY(-4px); box-shadow: 0 15px 35px rgba(28,45,37,.08); }
    .pain-card.wide { grid-column: span 3; min-height: 207px; }
    .pain-num { color: var(--orange); font: 11px var(--mono); }
    .pain-card h3 { max-width: 260px; margin: 23px 0 8px; font-size: 17px; line-height: 1.45; letter-spacing: -.03em; }
    .pain-card p { max-width: 330px; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
    .pain-tag { position: absolute; top: 19px; right: 18px; color: #a2aaa1; font: 9px var(--mono); }
    .pain-card.wide h3 { max-width: 410px; }
    .pain-card.wide p { max-width: 465px; }
    .pain-foot { display: flex; align-items: center; gap: 13px; margin-top: 26px; padding: 17px 20px; color: #b8c8bd; background: var(--teal); border-radius: 8px; font-size: 12px; }
    .pain-foot strong { color: var(--lime); }
    .pain-foot span { color: #73867c; }

    .workflow { color: var(--white); background: var(--teal); }
    .workflow .section-kicker { color: var(--lime); }
    .workflow .section-head p { color: #a9b9b0; }
    .workflow .section-head h2 { color: var(--white); }
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #547068; border: 1px solid #547068; border-radius: 10px; overflow: hidden; }
    .step { min-height: 232px; padding: 25px; background: var(--teal); }
    .step-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 33px; }
    .step-num { color: var(--lime); font: 12px var(--mono); }
    .step-glyph { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid #668077; border-radius: 50%; color: var(--lime); }
    .step-glyph svg { width: 19px; height: 19px; }
    .step h3 { margin: 0 0 8px; font-size: 17px; }
    .step p { max-width: 285px; margin: 0; color: #a9b9b0; font-size: 12px; line-height: 1.8; }
    .workflow-note { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 24px; padding: 15px 18px; border: 1px solid #49645a; border-radius: 8px; color: #a9b9b0; font-size: 11px; }
    .workflow-note strong { color: var(--lime); font-weight: 700; }

    .use-cases { background: var(--paper-deep); }
    .case-row { display: grid; grid-template-columns: .9fr 1.1fr; gap: 58px; align-items: center; padding: 33px 0; border-top: 1px solid #cdd0c7; }
    .case-row:last-child { border-bottom: 1px solid #cdd0c7; }
    .case-index { color: var(--orange-dark); font: 11px var(--mono); }
    .case-row h3 { max-width: 440px; margin: 10px 0 9px; font-size: clamp(22px, 3vw, 31px); line-height: 1.25; letter-spacing: -.055em; }
    .case-row p { max-width: 500px; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.9; }
    .case-visual { min-height: 143px; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 17px; border: 1px solid #d2d3ca; border-radius: 10px; background: rgba(255,254,250,.68); }
    .mini-tile { display: grid; place-items: center; min-width: 88px; min-height: 83px; padding: 10px; color: var(--ink-soft); border: 1px solid #e3e4dc; border-radius: 7px; background: var(--white); text-align: center; font-size: 10px; }
    .mini-tile svg { width: 24px; height: 24px; margin-bottom: 7px; color: var(--orange); }
    .flow-arrow { color: var(--orange); font: 21px var(--mono); }
    .link-tile { width: min(280px, 55%); padding: 13px; color: var(--white); background: var(--ink); border-radius: 8px; box-shadow: 5px 5px 0 var(--lime); }
    .link-tile small { display: block; color: #9fac9f; font: 9px var(--mono); }
    .link-tile strong { display: block; overflow: hidden; margin-top: 8px; color: var(--lime); font: 10px var(--mono); text-overflow: ellipsis; white-space: nowrap; }
    .terminal-tile { width: min(370px, 80%); padding: 14px 16px; color: #d6e0d6; background: #182420; border-radius: 8px; font: 10px/1.9 var(--mono); }
    .terminal-tile b { color: var(--lime); font-weight: 500; }
    .terminal-tile em { color: #ffa88d; font-style: normal; }

    .integrations { background: var(--paper); }
    .integration-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .integration-card { display: flex; flex-direction: column; min-height: 350px; padding: 22px; border: 1px solid var(--line); border-radius: 10px; background: var(--white); }
    .integration-type { display: flex; justify-content: space-between; align-items: center; color: var(--orange-dark); font: 10px var(--mono); letter-spacing: .09em; text-transform: uppercase; }
    .integration-symbol { display: grid; place-items: center; width: 39px; height: 39px; color: var(--ink); background: var(--lime); border-radius: 10px 10px 10px 3px; }
    .integration-symbol svg { width: 21px; height: 21px; }
    .integration-card h3 { margin: 20px 0 8px; font-size: 21px; letter-spacing: -.045em; }
    .integration-card p { margin: 0 0 16px; color: var(--muted); font-size: 12px; line-height: 1.85; }
    .code-sample { margin-top: auto; padding: 14px; overflow: hidden; color: #d8e1d7; background: #1c2925; border-radius: 7px; font: 10px/1.9 var(--mono); overflow-wrap: anywhere; }
    .code-sample span { color: var(--lime); }
    .integration-link { display: inline-flex; align-items: center; gap: 7px; margin-top: 18px; color: var(--orange-dark); font-size: 12px; font-weight: 750; }
    .package-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 9px 15px; margin-top: 14px; }
    .package-actions .button { min-height: 39px; padding: 0 12px; font-size: 11px; }
    .package-actions .integration-link { margin-top: 0; }

    .extension { overflow: hidden; color: var(--white); background: var(--ink); }
    .extension .section-kicker { color: var(--lime); }
    .extension .section-head h2 { color: var(--white); }
    .extension .section-head p { color: #a9b5ac; }
    .extension-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 58px; align-items: center; }
    .extension-preview { position: relative; min-height: 395px; display: grid; place-items: center; border: 1px solid #53635a; border-radius: 13px; background: radial-gradient(circle at 50% 45%, rgba(217,240,110,.12), transparent 58%), linear-gradient(135deg, #26352f, #15201d); }
    .extension-preview::before { content: ""; position: absolute; inset: 19px; border: 1px dashed rgba(217,240,110,.22); border-radius: 9px; }
    .browser-frame { position: relative; z-index: 1; width: min(320px, 83%); padding: 11px; color: var(--ink); background: var(--white); border-radius: 10px; box-shadow: 0 22px 55px rgba(0,0,0,.35); transform: rotate(2deg); }
    .browser-top { display: flex; gap: 4px; align-items: center; padding: 3px 2px 10px; color: #8a938d; font: 8px var(--mono); }
    .browser-top i { width: 6px; height: 6px; border-radius: 50%; background: #d5d8cf; }
    .browser-url { margin-left: 10px; padding: 4px 7px; flex: 1; border-radius: 4px; background: #f0f1eb; }
    .browser-content { display: grid; grid-template-columns: 1fr .85fr; gap: 8px; min-height: 115px; padding: 12px; background: #e9eee6; border-radius: 6px; }
    .browser-page-lines { padding-top: 10px; }
    .browser-page-lines i { display: block; width: 92%; height: 5px; margin: 0 0 7px; border-radius: 4px; background: #bdc9bd; }
    .browser-page-lines i:nth-child(2) { width: 66%; }
    .browser-page-lines i:nth-child(3) { width: 82%; }
    .browser-page-art { display: grid; place-items: center; border-radius: 5px; color: var(--orange); background: #f5c5ad; font: 18px var(--serif); }
    .browser-popup { position: absolute; z-index: 3; right: 18px; bottom: 21px; width: 206px; padding: 14px; color: var(--ink); background: var(--white); border: 1px solid #e0e3da; border-radius: 9px; box-shadow: 0 17px 45px rgba(0,0,0,.24); transform: rotate(-2deg); }
    .popup-heading { display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 800; }
    .popup-logo { display: grid; place-items: center; width: 19px; height: 19px; background: var(--lime); border-radius: 6px 6px 6px 2px; }
    .popup-logo svg { width: 13px; }
    .popup-logo img { width: 15px; height: 15px; object-fit: contain; }
    .popup-success { margin: 10px 0 7px; padding: 8px; color: #386b49; background: #e9f2e2; border-radius: 5px; font-size: 9px; }
    .popup-link { overflow: hidden; color: #41695b; font: 8px var(--mono); text-overflow: ellipsis; white-space: nowrap; }
    .extension-copy h3 { margin: 0 0 12px; font-size: 23px; letter-spacing: -.045em; }
    .extension-copy > p { margin: 0; color: #a9b5ac; font-size: 13px; line-height: 1.9; }
    .extension-feature-list { display: grid; gap: 11px; margin: 23px 0 26px; padding: 0; list-style: none; }
    .extension-feature-list li { display: flex; gap: 10px; align-items: flex-start; color: #d5ddd5; font-size: 12px; }
    .check { display: grid; place-items: center; flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; color: var(--ink); background: var(--lime); border-radius: 50%; font-size: 11px; font-weight: 800; }
    .install-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-top: 52px; }
    .install-step { min-height: 112px; padding: 14px; border: 1px solid #44574e; border-radius: 7px; }
    .install-step b { display: block; margin-bottom: 12px; color: var(--lime); font: 10px var(--mono); }
    .install-step span { color: #c3cec4; font-size: 11px; line-height: 1.7; }
    .install-note { margin-top: 12px; color: #91a198; font-size: 10px; line-height: 1.8; }

    .video-section { background: var(--paper-deep); }
    .video-card { position: relative; display: grid; grid-template-columns: 1.1fr .9fr; min-height: 345px; overflow: hidden; border: 1px solid #cad0c6; border-radius: 12px; background: #e0e2d9; }
    .video-player { min-width: 0; min-height: 300px; aspect-ratio: 16 / 9; overflow: hidden; background: #02093a; }
    .product-video { display: block; width: 100%; height: 100%; min-height: 300px; object-fit: contain; background: #02093a; }
    .video-copy { display: flex; flex-direction: column; justify-content: center; padding: clamp(24px, 4vw, 47px); }
    .video-copy .section-kicker { margin-bottom: 15px; }
    .video-copy h3 { margin: 0 0 11px; font-size: clamp(22px, 3vw, 32px); line-height: 1.25; letter-spacing: -.055em; }
    .video-copy p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.9; }

    .pricing { background: var(--paper); }
    .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 900px; margin: 0 auto; }
    .price-card { position: relative; padding: clamp(24px, 4vw, 38px); border: 1px solid var(--line); border-radius: 11px; background: var(--white); }
    .price-card.pro { color: var(--white); border-color: var(--teal); background: var(--teal); box-shadow: 0 18px 45px rgba(23,62,56,.13); }
    .price-badge { position: absolute; top: 19px; right: 20px; padding: 5px 8px; color: var(--ink); background: var(--lime); border-radius: 4px; font: 9px var(--mono); }
    .price-name { margin: 0 0 10px; font-size: 17px; }
    .price-description { min-height: 44px; margin: 0; color: var(--muted); font-size: 11px; }
    .pro .price-description { color: #a9b9b0; }
    .price { display: flex; align-items: baseline; gap: 5px; margin: 20px 0 2px; }
    .price strong { font-size: clamp(45px, 6vw, 62px); line-height: 1; letter-spacing: -.075em; }
    .price span { color: var(--muted); font-size: 12px; }
    .pro .price span { color: #a9b9b0; }
    .price-sub { min-height: 21px; color: var(--muted); font-size: 10px; }
    .pro .price-sub { color: #a9b9b0; }
    .price-sep { height: 1px; margin: 22px 0; background: var(--line); }
    .pro .price-sep { background: #47645b; }
    .price-features { display: grid; gap: 10px; min-height: 158px; margin: 0 0 24px; padding: 0; list-style: none; }
    .price-features li { display: flex; gap: 9px; align-items: flex-start; color: var(--ink-soft); font-size: 11px; }
    .pro .price-features li { color: #d7e0d6; }
    .price-features li::before { content: "↗"; color: var(--orange); font: 11px var(--mono); }
    .pro .price-features li::before { color: var(--lime); }
    .price-card .button { width: 100%; }
    .price-footnote { max-width: 730px; margin: 22px auto 0; color: var(--muted); text-align: center; font-size: 10px; line-height: 1.8; }

    .faq { padding-top: 25px !important; }
    .faq-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0 40px; border-top: 1px solid var(--line); }
    details { padding: 17px 0; border-bottom: 1px solid var(--line); }
    summary { cursor: pointer; font-size: 13px; font-weight: 750; }
    details p { margin: 10px 0 0; color: var(--muted); font-size: 11px; line-height: 1.85; }
    .site-footer { padding: 28px 0 36px; color: #a9b5ac; background: var(--ink); }
    .footer-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .footer-brand { display: flex; align-items: center; gap: 10px; color: var(--white); font-size: 13px; font-weight: 750; }
    .footer-links { display: flex; flex-wrap: wrap; gap: 19px; color: #b7c2b7; font-size: 10px; }
    .footer-note { margin-top: 15px; color: #77867b; font: 9px var(--mono); }
    .reveal { animation: rise .65s both; }
    @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; } }
    @media (max-width: 900px) {
      .hero-grid { gap: 25px; }
      .hero-art { min-height: 370px; }
      .integration-card { min-height: 385px; }
      .case-row { gap: 28px; }
    }
    @media (max-width: 720px) {
      .wrap { width: min(100% - 32px, 560px); }
      .nav { min-height: 66px; }
      .nav-links { display: none; }
      .nav-actions .button-outline { display: none; }
      .button { min-height: 43px; padding: 0 14px; }
      .hero-grid { grid-template-columns: 1fr; padding: 61px 0 56px; }
      .hero h1 { font-size: clamp(47px, 12vw, 66px); }
      .hero-lede { margin: 19px 0 22px; font-size: 14px; }
      .hero-art { min-height: 350px; margin-top: 8px; }
      .share-window { width: min(410px, 90%); }
      .orbit-label.three { right: 0; }
      section.content-section { padding: 73px 0; }
      .section-head { grid-template-columns: 1fr; gap: 14px; margin-bottom: 27px; }
      .section-head h2 { font-size: clamp(32px, 8vw, 44px); }
      .section-head p { font-size: 12px; }
      .pain-grid { grid-template-columns: repeat(2, 1fr); }
      .pain-card, .pain-card.wide { grid-column: span 1; min-height: 221px; padding: 17px; }
      .pain-card:last-child { grid-column: span 2; min-height: 180px; }
      .pain-card h3 { margin-top: 20px; font-size: 15px; }
      .pain-card p { font-size: 11px; }
      .pain-foot { align-items: flex-start; flex-direction: column; gap: 5px; }
      .steps { grid-template-columns: 1fr; }
      .step { min-height: auto; padding: 20px; }
      .step-top { margin-bottom: 20px; }
      .workflow-note { align-items: flex-start; flex-direction: column; }
      .case-row { grid-template-columns: 1fr; gap: 18px; padding: 25px 0; }
      .case-visual { min-height: 125px; }
      .integration-grid { grid-template-columns: 1fr; }
      .integration-card { min-height: auto; }
      .code-sample { min-height: 77px; }
      .extension-grid { grid-template-columns: 1fr; gap: 28px; }
      .extension-preview { min-height: 325px; }
      .browser-popup { right: 8px; bottom: 14px; width: 185px; }
      .install-steps { grid-template-columns: 1fr 1fr; margin-top: 34px; }
      .install-step { min-height: 100px; }
      .video-card { grid-template-columns: 1fr; }
      .video-player { min-height: 0; }
      .product-video { min-height: 0; }
      .video-copy { padding: 25px; }
      .pricing-grid { grid-template-columns: 1fr; max-width: 490px; }
      .price-description { min-height: auto; }
      .price-features { min-height: auto; }
      .faq-list { grid-template-columns: 1fr; }
      .footer-row { align-items: flex-start; flex-direction: column; }
    }
    @media (max-width: 390px) {
      .brand-sub { display: none; }
      .nav-actions .button { min-height: 40px; padding: 0 9px; font-size: 13px; }
      .hero-art { min-height: 315px; }
      .share-window { padding: 12px; }
      .orbit-label.one { right: -5px; }
      .orbit-label.two { left: -7px; }
      .pain-grid { gap: 8px; }
      .pain-card, .pain-card.wide { padding: 13px; }
      .mini-tile { min-width: 70px; min-height: 75px; font-size: 9px; }
    }

    /* Notion-inspired paper system, shared with the PicoShare workspace. */
    :root {
      --paper: #f6f5f4;
      --paper-deep: #f6f5f4;
      --ink: #111111;
      --ink-soft: #615d59;
      --muted: #757575;
      --line: rgba(0,0,0,.08);
      --orange: #0075de;
      --orange-dark: #0075de;
      --lime: #ffb110;
      --teal: #02093a;
      --white: #ffffff;
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      --serif: "Source Serif Pro", "Songti SC", Georgia, serif;
    }
    body { color: var(--ink); background: var(--paper); font-size: 16px; line-height: 1.5; }
    .wrap { width: min(1280px, calc(100% - 48px)); }
    .topbar { background: rgba(246,245,244,.96); border-bottom-color: rgba(0,0,0,.06); backdrop-filter: none; box-shadow: 0 .7px 1.5px rgba(0,0,0,.015), 0 3px 9px rgba(0,0,0,.03); }
    .nav { min-height: 68px; }
    .brand { color: #111; font-size: 17px; font-weight: 650; letter-spacing: -.035em; }
    .brand-mark { color: #0075de; background: #e6f3fe; border-radius: 8px; }
    .brand-sub { color: #757575; }
    .nav-links { color: rgba(0,0,0,.6); font-size: 14px; }
    .nav-links a:hover, .footer-links a:hover, .integration-link:hover { color: #0075de; }
    .button { min-height: 40px; padding: 0 15px; border-radius: 8px; font-size: 14px; font-weight: 550; transition: background-color .2s ease, border-color .2s ease, color .2s ease; }
    .button:hover { transform: none; }
    .button-dark, .button-orange { color: #fff; background: #0075de; }
    .button-dark:hover, .button-orange:hover { background: #0068c7; }
    .button-outline { color: #0075de; border-color: transparent; background: #e6f3fe; }
    .button-outline:hover { color: #005fb8; border-color: transparent; background: #d8edfc; }
    .hero .button-outline { color: #0075de; border-color: transparent; background: #e6f3fe; }
    .hero .button-outline:hover { color: #005fb8; border-color: transparent; background: #d8edfc; }
    .language-toggle { min-height: 40px; padding: 0 12px; color: #0075de; background: #e6f3fe; cursor: pointer; }
    .language-toggle:hover { color: #005fb8; background: #d8edfc; }
    .arrow { font-size: 16px; }

    .hero { color: #111; background: #f6f5f4; }
    .hero::before, .hero::after { display: none; }
    .hero-grid { min-height: 0; grid-template-columns: 1fr; gap: 26px; padding: 70px 0 58px; text-align: center; }
    .hero-copy { width: min(900px,100%); margin: 0 auto; }
    .eyebrow { justify-content: center; margin-bottom: 24px; color: #615d59; font-size: 12px; letter-spacing: .08em; }
    .eyebrow-dot { background: #0075de; box-shadow: none; }
    .hero h1 { max-width: 940px; margin: 0 auto; color: #111; font-size: clamp(54px,7.2vw,86px); font-weight: 600; line-height: 1.06; letter-spacing: -.055em; }
    .hero h1 em { display: inline-block; margin-top: 7px; padding: 4px 22px 9px; color: #111; background: #ffb110; border-radius: 9999px; font-style: normal; }
    .hero-lede { max-width: 720px; margin: 24px auto 28px; color: #615d59; font: 18px/1.55 var(--serif); }
    .hero-actions { justify-content: center; gap: 10px; }
    .hero-proof { justify-content: center; margin-top: 24px; color: #757575; font-size: 13px; }
    .proof-rule { width: 22px; background: #0075de; }
    .hero-art { width: min(790px,100%); min-height: 380px; margin: 0 auto; }
    .orbit { display: none; }
    .orbit-label { padding: 6px 11px; color: #111; background: #e6f3fe; border: 0; border-radius: 9999px; font: 11px/1.3 var(--sans); letter-spacing: 0; }
    .orbit-label.one { top: 9px; right: 6%; transform: rotate(3deg); }
    .orbit-label.two { bottom: 24px; left: 2%; color: #111; background: #f6d5b8; transform: rotate(-3deg); }
    .orbit-label.three { right: 0; bottom: 68px; color: #fff; background: #097fe8; }
    .share-window { width: min(690px,94%); padding: 20px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.1); transform: none; animation: settle .55s ease both; }
    @keyframes settle { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .window-bar { color: #757575; border-bottom-color: rgba(0,0,0,.08); }
    .file-icon { background: #0075de; border-radius: 8px; box-shadow: none; }
    .uploaded { color: #111; background: #ffb110; border-radius: 9999px; }
    .share-url { border-color: rgba(0,0,0,.08); border-radius: 8px; background: #f6f5f4; }
    .copy-chip { color: #fff; background: #0075de; border-radius: 8px; }
    .share-foot { color: #757575; }
    .avatar-stack i { background: #097fe8; color: #fff; }
    .hero-index { color: #757575; font-size: 11px; }

    .ticker { border-bottom: 1px solid var(--line); background: #fff; }
    .ticker-inner { min-height: 58px; color: #615d59; font-size: 13px; font-weight: 500; }
    .ticker-item b { color: #0075de; font-size: 12px; }
    section.content-section { padding: 88px 0; }
    .section-head { grid-template-columns: 1fr 1fr; gap: 50px; margin-bottom: 34px; }
    .section-kicker { color: #0075de; font-size: 12px; letter-spacing: .08em; }
    .section-head h2 { color: #111; font-size: clamp(38px,5vw,56px); font-weight: 600; line-height: 1.08; letter-spacing: -.045em; }
    .section-head p { color: #615d59; font-size: 16px; line-height: 1.6; }

    .pain-section, .use-cases, .integrations, .pricing, .faq, .video-section { background: #f6f5f4; }
    .pain-grid { gap: 12px; }
    .pain-card, .pain-card.wide { min-height: 210px; padding: 24px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; background: #fff; transition: border-color .2s ease, transform .2s ease; }
    .pain-card:hover { transform: translateY(-2px); border-color: rgba(0,117,222,.32); box-shadow: none; }
    .pain-card:nth-child(2) { background: #e6f3fe; border-color: transparent; }
    .pain-card:nth-child(3) { background: #ffb110; border-color: transparent; }
    .pain-card:nth-child(5) { color: #fff; background: #02093a; border-color: transparent; }
    .pain-card:nth-child(5) .pain-tag, .pain-card:nth-child(5) p { color: rgba(255,255,255,.72); }
    .pain-card:nth-child(5) .pain-num { color: #62aef0; }
    .pain-num { color: #0075de; }
    .pain-tag { color: #757575; }
    .pain-card h3 { margin-top: 27px; color: #111; font-size: 20px; font-weight: 600; line-height: 1.3; letter-spacing: -.025em; }
    .pain-card p { color: #615d59; font-size: 14px; line-height: 1.55; }
    .pain-foot { padding: 18px 20px; color: #111; background: #e6f3fe; border-radius: 12px; font-size: 14px; }
    .pain-foot strong { color: #111; }
    .pain-foot span { color: #615d59; }

    .workflow { color: #111; background: #e6f3fe; }
    .workflow .section-kicker, .workflow .section-head h2 { color: #111; }
    .workflow .section-head p, .step p { color: #615d59; }
    .steps { gap: 12px; overflow: visible; border: 0; border-radius: 0; background: transparent; }
    .step { min-height: 220px; padding: 24px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    .step-num { color: #0075de; }
    .step-glyph { color: #0075de; border-color: rgba(0,117,222,.25); border-radius: 12px; }
    .step h3 { color: #111; font-size: 20px; font-weight: 600; }
    .step p { font-size: 14px; line-height: 1.55; }
    .workflow-note { color: #615d59; border-color: rgba(0,0,0,.1); border-radius: 8px; font-size: 13px; }
    .workflow-note strong { color: #0075de; }

    .case-row { gap: 48px; padding: 32px 0; border-color: rgba(0,0,0,.1); }
    .case-index { color: #0075de; }
    .case-row h3 { color: #111; font-size: clamp(23px,3vw,32px); font-weight: 600; letter-spacing: -.04em; }
    .case-row p { color: #615d59; font-size: 15px; line-height: 1.6; }
    .case-visual { border: 1px solid rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    .mini-tile { min-width: 92px; min-height: 88px; color: #111; border-color: rgba(0,0,0,.08); border-radius: 8px; }
    .mini-tile svg, .flow-arrow { color: #0075de; }
    .link-tile { color: #111; background: #e6f3fe; border-radius: 8px; box-shadow: none; }
    .link-tile small { color: #615d59; }
    .link-tile strong { color: #0075de; }
    .terminal-tile { color: #fff; background: #02093a; border-radius: 8px; }
    .terminal-tile b { color: #ffb110; }

    .integration-card { min-height: 350px; padding: 24px; border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    .integration-type, .integration-link { color: #0075de; }
    .integration-symbol { color: #0075de; background: #e6f3fe; border-radius: 12px; }
    .integration-card h3 { color: #111; font-size: 22px; font-weight: 600; letter-spacing: -.025em; }
    .integration-card p { color: #615d59; font-size: 14px; line-height: 1.55; }
    .code-sample { color: #fff; background: #02093a; border-radius: 8px; font-size: 11px; }
    .code-sample span { color: #ffb110; }

    .extension { color: #111; background: #f6f5f4; }
    .extension .section-kicker, .extension .section-head h2 { color: #111; }
    .extension .section-head p { color: #615d59; }
    .extension-grid { gap: 48px; }
    .extension-preview { border: 0; border-radius: 12px; background: #ffb110; }
    .extension-preview::before { inset: 17px; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; }
    .browser-frame { border: 1px solid rgba(0,0,0,.08); border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.1); transform: none; }
    .browser-content { background: #e6f3fe; }
    .browser-page-art { color: #0075de; background: #fff; }
    .browser-popup { border-color: rgba(0,0,0,.08); border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.1); transform: none; }
    .popup-logo { color: #0075de; background: #e6f3fe; border-radius: 8px; }
    .popup-success { color: #111; background: #e6f3fe; border-radius: 8px; }
    .popup-link { color: #0075de; }
    .extension-copy h3 { color: #111; font-size: 28px; font-weight: 600; letter-spacing: -.04em; }
    .extension-copy > p, .extension-feature-list li { color: #615d59; font-size: 15px; line-height: 1.55; }
    .check { color: #fff; background: #0075de; }
    .install-step { min-height: 116px; padding: 17px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    .install-step b { color: #0075de; }
    .install-step span { color: #615d59; font-size: 13px; }
    .install-note { color: #757575; font-size: 12px; }

    .video-card { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    .video-copy h3 { color: #111; font-weight: 600; letter-spacing: -.04em; }

    .price-card { padding: clamp(24px,4vw,38px); border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    .price-card.pro { color: #111; border-color: transparent; background: #e6f3fe; box-shadow: none; }
    .price-badge { color: #fff; background: #0075de; border-radius: 9999px; }
    .price-name { color: #111; font-size: 22px; font-weight: 600; }
    .price-description, .pro .price-description, .price span, .pro .price span, .price-sub, .pro .price-sub { color: #615d59; font-size: 14px; }
    .price strong { color: #111; font-weight: 600; letter-spacing: -.05em; }
    .price-sep, .pro .price-sep { background: rgba(0,0,0,.1); }
    .price-features li, .pro .price-features li { color: #615d59; font-size: 14px; }
    .price-features li::before, .pro .price-features li::before { color: #0075de; }
    .price-footnote { color: #757575; font-size: 12px; }
    .faq { padding-top: 35px !important; }
    .faq-list { grid-template-columns: 1fr 1fr; gap: 0 48px; border-top-color: rgba(0,0,0,.08); }
    details { border-bottom-color: rgba(0,0,0,.08); }
    summary { color: #111; font-size: 16px; font-weight: 600; }
    details p { color: #615d59; font-size: 14px; line-height: 1.6; }
    .site-footer { color: rgba(255,255,255,.72); background: #02093a; }
    .footer-brand { color: #fff; }
    .footer-links { color: rgba(255,255,255,.72); font-size: 13px; }
    .footer-note { color: rgba(255,255,255,.45); }
    @media (max-width: 980px) { .wrap { width: calc(100% - 32px); } }
    @media (max-width: 720px) {
      .wrap { width: min(100% - 32px, 560px); }
      .hero-grid { grid-template-columns: 1fr; gap: 22px; padding: 58px 0 44px; }
      .hero h1 { font-size: clamp(46px,11vw,68px); }
      .hero-lede { font-size: 17px; }
      .hero-art { min-height: 310px; }
      .share-window { width: 94%; padding: 16px; }
      .section-head { grid-template-columns: 1fr; gap: 14px; }
      .section-head h2 { font-size: clamp(36px,8vw,48px); }
      .pain-card, .pain-card.wide { min-height: 210px; padding: 17px; }
      .pain-card:last-child { grid-column: span 2; min-height: 180px; }
      .steps { grid-template-columns: 1fr; }
      .step { min-height: 0; }
      .extension-grid { grid-template-columns: 1fr; gap: 28px; }
      .extension-preview { min-height: 325px; }
      .install-steps { grid-template-columns: 1fr 1fr; }
      .video-card, .pricing-grid, .faq-list { grid-template-columns: 1fr; }
      body { font-size: 16px; line-height: 1.6; }
      .hero h1 { font-size: clamp(38px, 10vw, 54px); line-height: 1.1; }
      .hero-lede, .section-head p { font-size: 16px; line-height: 1.6; }
      .hero-proof, .workflow-note, .pain-foot, .install-step span, .faq details p { font-size: 14px; }
      .nav-links { display: none; }
      .nav-actions { gap: 7px; }
      .nav-actions .button { min-height: 42px; padding: 0 11px; font-size: 13px; }
      .pain-card p, .step p, .case-row p, .integration-card p, .video-copy p,
      .extension-copy > p, .extension-feature-list li, .price-description,
      .price-sub, .price-features li, details p { font-size: 15px; line-height: 1.6; }
      .price-footnote { font-size: 14px; }
      .file-meta, .uploaded, .share-label, .copy-chip, .share-foot, .hero-index,
      .pain-num, .pain-tag, .step-num, .case-index, .integration-type, .footer-links { font-size: 12px; }
      .code-sample { font-size: 13px; }
      .case-row { gap: 24px; }
      .integration-card { min-height: 0; padding: 20px; }
      .price-card { padding: 22px; }
      .footer-links { gap: 14px; }
    }
    @media (max-width: 390px) {
      .wrap { width: calc(100% - 24px); }
      .hero h1 { font-size: 36px; }
      .hero-actions { align-items: stretch; flex-direction: column; }
      .hero-actions .button { width: 100%; }
      .nav-actions .button { min-height: 40px; padding: 0 9px; font-size: 13px; }
      .section-head h2 { font-size: 31px; }
      .price-card { padding: 18px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <header class="topbar">
    <nav class="nav wrap" aria-label="主导航">
      <a class="brand" href="/" aria-label="PicoShare 首页">
        <span class="brand-mark" aria-hidden="true"><img src="/favicon.svg" alt="" /></span>
        <span>PicoShare</span><span class="brand-sub">SHARE WHAT YOU MAKE</span>
      </a>
      <div class="nav-links"><a href="#pain">解决什么</a><a href="#workflow">怎么使用</a><a href="#integrations">开发者接入</a><a href="#extension">浏览器扩展</a><a href="#pricing">价格</a></div>
      <div class="nav-actions"><button id="language-toggle" class="button language-toggle" type="button" aria-label="Switch language">EN</button><a class="button button-outline" href="/api-docs">API 文档</a><a class="button button-dark" href="${primaryHref}">${primaryLabel}<span class="arrow">↗</span></a></div>
    </nav>
  </header>

  <main id="main">
    <section class="hero">
      <div class="hero-grid wrap">
        <div class="hero-copy reveal">
          <p class="eyebrow"><i class="eyebrow-dot"></i> DEV TOOLS · SIMPLE SHARING</p>
          <h1>本地的内容，<br /><em>一键分享。</em></h1>
          <p class="hero-lede">文件、图片、HTML 视觉稿、命令片段——从电脑到伙伴、从开发机到堡垒机，把“怎么传过去”这一步交给 PicoShare。</p>
          <div class="hero-actions"><a class="button button-orange" href="${primaryHref}">${primaryLabel}<span class="arrow">↗</span></a><a class="button button-outline" href="#extension">先看浏览器扩展<span class="arrow">↓</span></a></div>
          <div class="hero-proof"><span class="proof-rule"></span>上传一次，链接随时可分享 <span>·</span> API / CLI / Agent Skill</div>
        </div>
        <div class="hero-art" aria-label="PicoShare 文件分享界面示意图">
          <div class="orbit"></div><span class="orbit-label one">LOCAL → LINK</span><span class="orbit-label two">NO MORE “WHERE IS IT?”</span><span class="orbit-label three">PICOSHARE / READY</span>
          <div class="share-window">
            <div class="window-bar"><span class="window-dots"><i></i><i></i><i></i></span><span>share.picoshare.app / upload</span><span>● LIVE</span></div>
            <div class="file-row"><span class="file-icon">HTML</span><span class="file-info"><strong class="file-name">dashboard-concept.html</strong><small class="file-meta">2.4 MB · HTML 视觉稿</small></span><span class="uploaded">已上传</span></div>
            <div class="share-label"><span>你的分享链接</span><span>任何持有链接的人可访问</span></div>
            <div class="share-url"><span>pico.justnow.uk/-a8k2m7</span><b class="copy-chip">复制</b></div>
            <div class="share-foot"><span>发给伙伴，打开即预览</span><span class="avatar-stack"><i>F</i><i>J</i><i>+</i></span></div>
          </div>
          <span class="hero-index">FIG. 01 — FROM LOCAL TO SHARED</span>
        </div>
      </div>
    </section>

    <div class="ticker" aria-label="支持的分享内容"><div class="ticker-inner wrap"><span class="ticker-item"><b>01</b>文件与图片</span><span class="ticker-item"><b>02</b>HTML 视觉稿</span><span class="ticker-item"><b>03</b>云便签</span><span class="ticker-item"><b>04</b>API / CLI / Skill</span><span class="ticker-item"><b>05</b>浏览器扩展</span></div></div>

    <section id="pain" class="content-section pain-section">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">THE LITTLE FRICTIONS</p><h2>每天都在发生的<br />小麻烦，不必再忍。</h2></div><p>不是再加一个聊天窗口，而是把临时分享、跨设备传递和开发协作里的碎片动作，变成一条简单的链接。</p></div>
        <div class="pain-grid">
          <article class="pain-card"><span class="pain-num">01 / FILES</span><span class="pain-tag">分享附件</span><h3>一个文件、一张图，想发给伙伴却要找地方中转。</h3><p>传到 PicoShare，生成链接；对方打开即可看或下载，不用追问“发哪个版本”。</p></article>
          <article class="pain-card"><span class="pain-num">02 / PREVIEW</span><span class="pain-tag">视觉稿预览</span><h3>AI 做出的页面稿还在 localhost，别人看不到。</h3><p>上传 HTML 视觉稿，拿到在线预览链接。适合分享静态布局和样式稿，脚本会在安全沙箱中禁用。</p></article>
          <article class="pain-card"><span class="pain-num">03 / DEVICES</span><span class="pain-tag">多设备传输</span><h3>电脑之间传个文件，绕进网盘、聊天记录和下载目录。</h3><p>用自己的文件空间暂存，换一台电脑打开同一条链接，交接更直接。</p></article>
          <article class="pain-card wide"><span class="pain-num">04 / NOTES</span><span class="pain-tag">信息不再沉底</span><h3>重要文本习惯性发给自己，过几天就埋进 IM 历史里。</h3><p>把常用命令、临时说明、检查清单存成云便签；按名称读取，也能生成只读分享链接。</p></article>
          <article class="pain-card wide"><span class="pain-num">05 / TERMINAL</span><span class="pain-tag">开发机 → 堡垒机</span><h3>堡垒机不好复制命令，手敲长指令容易出错。</h3><p>在开发机把命令清单存进云便签，再从堡垒机打开或由 CLI / Agent 调用，少抄一遍，多一份准确。</p></article>
        </div>
        <div class="pain-foot"><strong>小工具应该消掉步骤，而不是制造新的工作流。</strong><span>—</span><span>上传 · 生成链接 · 分享</span></div>
      </div>
    </section>

    <section id="workflow" class="content-section workflow">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">THREE SMALL STEPS</p><h2>本地到伙伴，<br />只差一个链接。</h2></div><p>不需要先建项目、建群或配置复杂权限。按你的习惯选择网页、终端或 Agent，内容进入 PicoShare 后即可分享。</p></div>
        <div class="steps">
          <article class="step"><div class="step-top"><span class="step-num">STEP / 01</span><span class="step-glyph"><svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><h3>把内容送上来</h3><p>拖入文件、右键网页或图片；也可以用 curl、CLI、Agent Skill 上传。</p></article>
          <article class="step"><div class="step-top"><span class="step-num">STEP / 02</span><span class="step-glyph"><svg viewBox="0 0 24 24" fill="none"><path d="M10 13.5 14 9.5m-6.5 7H6a4 4 0 0 1 0-8h4m4 0h2a4 4 0 1 1 0 8h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span></div><h3>拿到可访问链接</h3><p>上传成功就能复制分享链接。文件和便签按账号管理，链接只发给需要的人。</p></article>
          <article class="step"><div class="step-top"><span class="step-num">STEP / 03</span><span class="step-glyph"><svg viewBox="0 0 24 24" fill="none"><path d="M8 12h8m-4-4 4 4-4 4M4 5h16v14H4z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><h3>在对的地方打开</h3><p>发到 IM、浏览器或终端；伙伴预览视觉稿，另一台设备接着下载。</p></article>
        </div>
        <div class="workflow-note"><span><strong>隐私提示</strong> 文件分享链接对持有者开放；敏感材料请只发给可信对象。</span><span>上传时可设置备注和过期时间 ↗</span></div>
      </div>
    </section>

    <section class="content-section use-cases">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">MADE FOR THE IN-BETWEEN</p><h2>填平开发日常里的<br />那些“差一点”。</h2></div><p>文件上传不是终点。PicoShare 把网页、终端和 Agent 都接在同一套文件与云便签 API 上。</p></div>
        <article class="case-row"><div><span class="case-index">A / QUICK HANDOFF</span><h3>把刚刚导出的设计稿，交给正在等反馈的同事。</h3><p>不必打包项目或临时开服务器。上传 HTML 视觉稿，复制链接给伙伴；页面按安全策略沙箱预览。</p></div><div class="case-visual"><div class="mini-tile"><svg viewBox="0 0 24 24" fill="none"><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 14h8M8 17h6" stroke="currentColor" stroke-width="1.5"/></svg>design.html</div><span class="flow-arrow">→</span><div class="link-tile"><small>SHARE PREVIEW</small><strong>pico.justnow.uk/-design</strong></div><span class="flow-arrow">→</span><div class="mini-tile"><svg viewBox="0 0 24 24" fill="none"><path d="M3 5h18v14H3zM3 8h18M7 6.5h.1M10 6.5h.1" stroke="currentColor" stroke-width="1.5"/></svg>浏览器预览</div></div></article>
        <article class="case-row"><div><span class="case-index">B / ACROSS MACHINES</span><h3>把本地文件发到另一台电脑，不再来回找 U 盘。</h3><p>文件有独立分享链接。在你有权限的电脑上打开即可预览或下载，不需要安装专用同步客户端。</p></div><div class="case-visual"><div class="mini-tile"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.5"/></svg>开发机</div><span class="flow-arrow">↗</span><div class="link-tile"><small>YOUR SHARE LINK</small><strong>一个链接 · 多台设备</strong></div><span class="flow-arrow">↗</span><div class="mini-tile"><svg viewBox="0 0 24 24" fill="none"><rect x="6" y="2.5" width="12" height="19" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10 18.5h4" stroke="currentColor" stroke-width="1.5"/></svg>另一台电脑</div></div></article>
        <article class="case-row"><div><span class="case-index">C / TERMINAL NOTES</span><h3>让命令片段离开 IM 历史，准确到达堡垒机。</h3><p>以 slug 组织便签，在开发机写入，在目标环境读取；适合部署命令、排查步骤、临时配置说明。</p></div><div class="case-visual"><div class="mini-tile"><svg viewBox="0 0 24 24" fill="none"><path d="m5 7 4 4-4 4m6 1h8M4 3h16v18H4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>开发机</div><span class="flow-arrow">→</span><div class="terminal-tile"><span>$</span> picoshare notes put deploy<br/><b>✓ 已保存为云便签</b><br /><span>$</span> picoshare notes share deploy</div><span class="flow-arrow">→</span><div class="mini-tile"><svg viewBox="0 0 24 24" fill="none"><path d="m5 7 4 4-4 4m6 1h8M4 3h16v18H4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>堡垒机</div></div></article>
      </div>
    </section>

    <section id="integrations" class="content-section integrations">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">MEET YOUR WORKFLOW</p><h2>不只给人点，<br />也能给程序用。</h2></div><p>同一个账户、同一套 API。网页上传、自动化脚本、命令行和 Agent Skill 都能管理自己的文件与云便签。</p></div>
        <div class="integration-grid">
          <article class="integration-card"><div class="integration-type"><span>01 / API</span><span class="integration-symbol"><svg viewBox="0 0 24 24" fill="none"><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><h3>接进你的工具</h3><p>使用个人 API Key 上传文件、获取列表、管理云便签。认证走请求头，权限按账户隔离。</p><div class="code-sample"><span>curl</span> -X POST "$PICOSHARE_BASE_URL/api/entry"<br />&nbsp; -H "X-API-Key: $PICOSHARE_API_KEY"<br />&nbsp; -F "file=@./design.html"</div><a class="integration-link" href="/api-docs">查看 API 调用手册 <span>↗</span></a></article>
          <article class="integration-card"><div class="integration-type"><span>02 / CLI</span><span class="integration-symbol"><svg viewBox="0 0 24 24" fill="none"><path d="m5 7 4 4-4 4m7 1h7M4 3h16v18H4z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><h3>终端里直接分享</h3><p>用命令行上传、搜索、获取文件链接或读写便签；适合重复操作、服务器工作流和批处理。</p><div class="code-sample"><span>picoshare</span> files upload ./report.pdf<br /><span>picoshare</span> notes put deploy --file ./steps.md<br /><span>picoshare</span> notes share deploy</div><div class="package-actions"><a class="button button-outline" href="/downloads/picoshare-agent-kit-v0.1.0.zip" download>下载 CLI + Skill 工具包 <span class="arrow">↓</span></a><a class="integration-link" href="/downloads/picoshare-agent-kit-v0.1.0.tar.gz" download>tar.gz <span>↓</span></a></div><a class="integration-link" href="/account">创建 API Key <span>↗</span></a></article>
          <article class="integration-card"><div class="integration-type"><span>03 / AGENT SKILL</span><span class="integration-symbol"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 4 7v5c0 4.3 3.2 7.6 8 9 4.8-1.4 8-4.7 8-9V7l-8-4Z" stroke="currentColor" stroke-width="1.5"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><h3>让 Agent 替你处理文件</h3><p>工具包内包含可分发到 Codex、Claude、Hermes、OpenCode 和 OpenClaw 的 Skill，也附带常用 AI 提示词。</p><div class="code-sample"><span>安装：</span>&nbsp;解压工具包后运行 sh install.sh<br /><span>配置：</span>&nbsp;PICOSHARE_BASE_URL<br /><span>密钥：</span>&nbsp;PICOSHARE_API_KEY</div><div class="package-actions"><a class="button button-dark" href="/downloads/picoshare-agent-kit-v0.1.0.zip" download>下载 CLI + Skill 工具包 <span class="arrow">↓</span></a><a class="integration-link" href="/downloads/picoshare-ai-prompts-v0.1.0.md" download>下载 AI 提示词 <span>↓</span></a></div><a class="integration-link" href="/api-docs">查看 API 调用手册 <span>↗</span></a></article>
        </div>
      </div>
    </section>

    <section id="extension" class="content-section extension">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">BROWSER EXTENSION</p><h2>把分享入口，<br />放回浏览器里。</h2></div><p>本地文件不必先打开网站；网页内容和图片也不必另存再上传。浏览器扩展把常用动作放在右键菜单和常驻按钮里。</p></div>
        <div class="extension-grid">
          <div class="extension-preview" role="img" aria-label="浏览器扩展上传成功界面示意图">
            <div class="browser-frame"><div class="browser-top"><i></i><i></i><i></i><span class="browser-url">design.local / dashboard</span></div><div class="browser-content"><div class="browser-page-lines"><i></i><i></i><i></i></div><div class="browser-page-art">P</div></div></div>
            <div class="browser-popup"><div class="popup-heading"><span class="popup-logo"><img src="/favicon.svg" alt="" /></span>PicoShare Uploader</div><div class="popup-success">✓ 上传成功 · dashboard.html</div><div class="popup-link">pico.justnow.uk/-f3p7k2</div></div>
          </div>
          <div class="extension-copy"><h3>上传成功看得见，分享链接复制即用。</h3><p>扩展使用你的 PicoShare 站点和账户 API Key。上传后会显示成功提示、浏览器通知和链接卡片。</p>
            <ul class="extension-feature-list"><li><i class="check">✓</i><span>弹窗选本地文件上传，生成并复制分享链接</span></li><li><i class="check">✓</i><span>网页空白处右键上传 HTML；图片右键保存并分享</span></li><li><i class="check">✓</i><span>启用常驻浮动按钮：长截图、选文件、上传当前页 HTML</span></li><li><i class="check">✓</i><span>浮动按钮可拖动并记住位置，适配日常浏览</span></li></ul>
            <a class="button button-orange" href="https://chromewebstore.google.com/detail/picoshare-%E4%B8%8A%E4%BC%A0%E5%8A%A9%E6%89%8B/mebpfkiaglhkbkkodfbhpgdhoapdjebg?hl=zh-CN&amp;utm_source=ext_sidebar" target="_blank" rel="noopener noreferrer">从 Chrome 网上应用店添加 <span class="arrow">↗</span></a>
            <a class="integration-link" href="/downloads/picoshare-browser-extension.zip" download>下载 ZIP 手动安装 <span class="arrow">↓</span></a>
            <a class="integration-link" href="/account">还没有 API Key？先去账户页创建 <span>↗</span></a>
          </div>
        </div>
        <div class="install-steps" aria-label="浏览器扩展安装步骤"><div class="install-step"><b>01 / DOWNLOAD</b><span>下载 ZIP 并解压到本地文件夹。</span></div><div class="install-step"><b>02 / LOAD</b><span>打开 chrome://extensions 或 edge://extensions，开启开发者模式并加载解压缩的扩展。</span></div><div class="install-step"><b>03 / CONNECT</b><span>填入 PicoShare 站点地址和账户 API Key，点击“保存并授权网站”。</span></div><div class="install-step"><b>04 / SHARE</b><span>从扩展弹窗、网页右键菜单或常驻按钮开始上传。</span></div></div>
        <p class="install-note">扩展通过 Chrome / Edge 开发者模式安装。启用常驻按钮和整页截图时会请求网页访问权限；网页 HTML 分享预览会禁用脚本。请在上传前检查页面中是否含有私人信息。</p>
      </div>
    </section>

    <section id="product-video-section" class="content-section video-section">
      <div class="wrap">
        <div class="video-card">
          <div class="video-player"><video id="product-video" class="product-video" controls playsinline preload="metadata" src="/videos/picoshare-intro-zh-full.mp4" aria-label="PicoShare 中文产品介绍视频"></video></div>
          <div class="video-copy"><p class="section-kicker">WATCH THE WORKFLOW</p><h3>从本地内容，到分享链接。<br />看看 PicoShare 的实际使用流程。</h3><p>通过产品演示了解文件分享、HTML 预览、命令行与云便签的日常工作流。</p></div>
        </div>
      </div>
    </section>

    <section id="pricing" class="content-section pricing">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">SIMPLE PRICING</p><h2>先从免费开始，<br />需要更多再升级。</h2></div><p>这是一个轻量分享工具：免费版满足日常小文件和小文本分享；Pro 为更大的文件、更长的保存时间和稳定的自动化调用提供空间。</p></div>
        <div class="pricing-grid">
          <article class="price-card"><h3 class="price-name">Free</h3><p class="price-description">适合个人试用、偶尔分享、小文本便签与轻量自动化。</p><div class="price"><strong>$0</strong><span>/ 永久免费</span></div><p class="price-sub">无需绑定支付方式</p><div class="price-sep"></div><ul class="price-features"><li>1 GiB 账户存储空间</li><li>单文件最大 100 MiB</li><li>文件最长保存 30 天</li><li>5 条云便签，每条最多 32 KiB</li><li>每月 500 次 API 请求（最多 10 次/分钟）· 1 个 API Key</li><li>最多 3 个访客上传链接</li></ul><a class="button button-outline" href="${primaryHref}">${primaryLabel} <span class="arrow">↗</span></a></article>
          <article class="price-card pro"><span class="price-badge">PRO · MORE ROOM</span><h3 class="price-name">Pro</h3><p class="price-description">适合常用分享、较大文件和稳定的开发者工作流。</p><div class="price"><strong>$5</strong><span>/ 月付</span></div><p class="price-sub">或 $50 / 年付 · 相比月付全年省 $10</p><div class="price-sep"></div><ul class="price-features"><li>5 GiB 账户存储空间</li><li>单文件最大 1 GiB</li><li>文件最长保存 365 天</li><li>20 条云便签，每条最多 128 KiB</li><li>每月 5,000 次 API 请求（最多 60 次/分钟）· 3 个 API Key</li><li>最多 20 个访客上传链接</li></ul><a class="button button-orange" href="/account">查看账户与订阅 <span class="arrow">↗</span></a></article>
        </div>
        <p class="price-footnote">API 请求额度由账号下所有 API Key 共享，网页账户管理不计入。云便签用于配置片段、命令和小文本分享，较大内容请作为文件上传。需要更大容量、更高频 API 或内网部署，可使用自己的 Cloudflare 账号联系 PicoShare 做私有化部署。文件分享链接对持有链接的人开放，请勿通过公开网页或仓库暴露 API Key。实际支付以订阅结账页所配置的商品为准。</p>
      </div>
    </section>

    <section class="content-section faq">
      <div class="wrap">
        <div class="section-head"><div><p class="section-kicker">GOOD TO KNOW</p><h2>开始之前，<br />几个小问题。</h2></div><p>把分享方式、HTML 预览和账户密钥的边界说清楚，省去开始之后的意外。</p></div>
        <div class="faq-list">
          <details><summary>分享链接是否需要登录？</summary><p>文件分享链接面向链接持有者开放，不要求对方先注册。请只把链接发给你希望访问内容的人。</p></details>
          <details><summary>上传的 HTML 能运行完整交互吗？</summary><p>HTML 以沙箱方式预览，样式和静态内容可展示；脚本、表单、API 连接等受到限制。它适合分享视觉稿和静态页面预览，不等同于部署完整 Web 应用。</p></details>
          <details><summary>API Key 可以放进网页前端吗？</summary><p>不可以。API Key 只能保存在可信的本地工具、服务器或 Agent Secret 配置中。公开客户端代码可能被任何人读取。</p></details>
          <details><summary>浏览器扩展怎么登录我的账户？</summary><p>在账户页创建 API Key，然后在扩展中配置 PicoShare 站点地址和 API Key。密钥保存在当前浏览器扩展的本地存储中。</p></details>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer"><div class="wrap"><div class="footer-row"><a class="footer-brand" href="/"><span class="brand-mark" aria-hidden="true"><img src="/favicon.svg" alt="" /></span>PicoShare</a><div class="footer-links"><a href="/app">打开工作台</a><a href="/account">账户与订阅</a><a href="/api-docs">API 文档</a><a href="#extension">浏览器扩展</a><a href="/privacy">隐私政策</a></div></div><div class="footer-note">MAKE IT HERE. SHARE IT ANYWHERE. · PICOSHARE</div></div></footer>
  <script>
    (function() {
      var english = {
        "跳到主要内容": "Skip to main content",
        "主导航": "Main navigation",
        "PicoShare 首页": "PicoShare home",
        "解决什么": "What it solves",
        "怎么使用": "How it works",
        "开发者接入": "For developers",
        "浏览器扩展": "Browser extension",
        "价格": "Pricing",
        "API 文档": "API docs",
        "进入上传工作台": "Open workspace",
        "登录 / 免费注册": "Sign in / Get started",
        "打开上传工作台": "Open workspace",
        "本地的内容，": "Your local content,",
        "一键分享。": "ready to share.",
        "文件、图片、HTML 视觉稿、命令片段——从电脑到伙伴、从开发机到堡垒机，把“怎么传过去”这一步交给 PicoShare。": "Files, images, HTML mockups, and command snippets—from your computer to a teammate, or from a dev machine to a bastion host. Let PicoShare handle the handoff.",
        "先看浏览器扩展": "Explore the extension",
        "上传一次，链接随时可分享": "Upload once. Share the link anywhere.",
        "PicoShare 文件分享界面示意图": "PicoShare file sharing preview",
        "HTML 视觉稿": "HTML mockup",
        "2.4 MB · HTML 视觉稿": "2.4 MB · HTML mockup",
        "一个链接 · 多台设备": "One link · multiple devices",
        "已上传": "Uploaded",
        "你的分享链接": "Your share link",
        "任何持有链接的人可访问": "Anyone with the link can access",
        "复制": "Copy",
        "发给伙伴，打开即预览": "Share with a teammate. Open to preview.",
        "支持的分享内容": "Supported content",
        "文件与图片": "Files & images",
        "云便签": "Cloud notes",
        "每天都在发生的": "Everyday",
        "小麻烦，不必再忍。": "friction, gone.",
        "不是再加一个聊天窗口，而是把临时分享、跨设备传递和开发协作里的碎片动作，变成一条简单的链接。": "Instead of adding another chat window, turn everyday sharing, device-to-device handoffs, and developer collaboration into one simple link.",
        "分享附件": "File sharing",
        "一个文件、一张图，想发给伙伴却要找地方中转。": "Need to send a file or image? Skip the detour.",
        "传到 PicoShare，生成链接；对方打开即可看或下载，不用追问“发哪个版本”。": "Upload to PicoShare and send a link. Teammates can preview or download it without asking which version is current.",
        "视觉稿预览": "Design previews",
        "AI 做出的页面稿还在 localhost，别人看不到。": "AI-generated pages are stuck on localhost where no one else can see them.",
        "上传 HTML 视觉稿，拿到在线预览链接。适合分享静态布局和样式稿，脚本会在安全沙箱中禁用。": "Upload an HTML mockup and get a preview link. Share static layouts and styling; scripts are disabled in a secure sandbox.",
        "多设备传输": "Across devices",
        "电脑之间传个文件，绕进网盘、聊天记录和下载目录。": "Moving files between computers shouldn't mean chasing cloud drives and chat histories.",
        "用自己的文件空间暂存，换一台电脑打开同一条链接，交接更直接。": "Keep files in your own space and open the same link on another computer for a direct handoff.",
        "信息不再沉底": "Notes that stay handy",
        "重要文本习惯性发给自己，过几天就埋进 IM 历史里。": "Important snippets sent to yourself can quickly disappear in chat history.",
        "把常用命令、临时说明、检查清单存成云便签；按名称读取，也能生成只读分享链接。": "Save commands, quick notes, and checklists as cloud notes. Find them by name or create a read-only share link.",
        "开发机 → 堡垒机": "Dev machine → bastion",
        "堡垒机不好复制命令，手敲长指令容易出错。": "Copying commands to a bastion host is awkward, and long commands are easy to mistype.",
        "在开发机把命令清单存进云便签，再从堡垒机打开或由 CLI / Agent 调用，少抄一遍，多一份准确。": "Save command lists as cloud notes on your dev machine, then open them on the bastion host or use the CLI/Agent—fewer manual copies, fewer mistakes.",
        "小工具应该消掉步骤，而不是制造新的工作流。": "A small tool should remove steps, not add another workflow.",
        "上传 · 生成链接 · 分享": "Upload · link · share",
        "本地到伙伴，": "From your device to a teammate,",
        "只差一个链接。": "just one link away.",
        "不需要先建项目、建群或配置复杂权限。按你的习惯选择网页、终端或 Agent，内容进入 PicoShare 后即可分享。": "No project, group chat, or complicated setup required. Use the browser, terminal, or an Agent—once content is in PicoShare, it's ready to share.",
        "把内容送上来": "Bring content in",
        "拖入文件、右键网页或图片；也可以用 curl、CLI、Agent Skill 上传。": "Drag in a file, right-click a page or image, or upload with curl, the CLI, or an Agent Skill.",
        "拿到可访问链接": "Get a share link",
        "上传成功就能复制分享链接。文件和便签按账号管理，链接只发给需要的人。": "Copy a share link as soon as the upload completes. Files and notes stay in your account; share links with the people who need them.",
        "在对的地方打开": "Open it where it's needed",
        "发到 IM、浏览器或终端；伙伴预览视觉稿，另一台设备接着下载。": "Send it to chat, a browser, or a terminal. Teammates can preview mockups, and another device can download the file.",
        "隐私提示": "Privacy note",
        "文件分享链接对持有者开放；敏感材料请只发给可信对象。": "Anyone with a file link can access it. Share sensitive material only with people you trust.",
        "上传时可设置备注和过期时间 ↗": "Add a note and expiration when you upload ↗",
        "填平开发日常里的": "Filling the gaps in",
        "那些“差一点”。": "everyday developer workflows.",
        "文件上传不是终点。PicoShare 把网页、终端和 Agent 都接在同一套文件与云便签 API 上。": "Uploading is only the start. PicoShare connects your browser, terminal, and Agent to the same file and cloud note APIs.",
        "把刚刚导出的设计稿，交给正在等反馈的同事。": "Send a freshly exported mockup to a teammate waiting for feedback.",
        "不必打包项目或临时开服务器。上传 HTML 视觉稿，复制链接给伙伴；页面按安全策略沙箱预览。": "No need to package a project or spin up a server. Upload an HTML mockup, share the link, and let your teammate preview it in a secure sandbox.",
        "浏览器预览": "Browser preview",
        "把本地文件发到另一台电脑，不再来回找 U 盘。": "Send a local file to another computer without reaching for a USB drive.",
        "文件有独立分享链接。在你有权限的电脑上打开即可预览或下载，不需要安装专用同步客户端。": "Every file gets a share link. Open it from another authorized computer to preview or download—no sync client needed.",
        "另一台电脑": "Another computer",
        "让命令片段离开 IM 历史，准确到达堡垒机。": "Move command snippets out of chat history and onto the bastion host accurately.",
        "以 slug 组织便签，在开发机写入，在目标环境读取；适合部署命令、排查步骤、临时配置说明。": "Organize notes by slug, write them on your dev machine, and read them in the target environment. Useful for deployment commands, troubleshooting, and temporary setup notes.",
        "开发机": "Dev machine",
        "堡垒机": "Bastion host",
        "已保存为云便签": "Saved as a cloud note",
        "✓ 已保存为云便签": "✓ Saved as a cloud note",
        "不只给人点，": "Not just for people,",
        "也能给程序用。": "ready for your tools.",
        "同一个账户、同一套 API。网页上传、自动化脚本、命令行和 Agent Skill 都能管理自己的文件与云便签。": "One account, one API. Use the browser, scripts, CLI, and Agent Skill to manage your files and cloud notes.",
        "接进你的工具": "Connect your tools",
        "使用个人 API Key 上传文件、获取列表、管理云便签。认证走请求头，权限按账户隔离。": "Use your API Key to upload files, list them, and manage cloud notes. Requests use a header and are scoped to your account.",
        "查看 API 调用手册": "Read the API guide",
        "终端里直接分享": "Share from the terminal",
        "用命令行上传、搜索、获取文件链接或读写便签；适合重复操作、服务器工作流和批处理。": "Upload and search files, get share links, and manage notes from the command line—great for repeatable tasks, server workflows, and batch jobs.",
        "下载 CLI + Skill 工具包": "Download the CLI + Skill kit",
        "tar.gz": "tar.gz archive",
        "工具包内包含可分发到 Codex、Claude、Hermes、OpenCode 和 OpenClaw 的 Skill，也附带常用 AI 提示词。": "The kit includes a Skill for Codex, Claude, Hermes, OpenCode, and OpenClaw, plus ready-to-use AI prompts.",
        "安装：": "Install:",
        "解压工具包后运行 sh install.sh": "Extract the kit and run sh install.sh",
        "配置：": "Set:",
        "密钥：": "Key:",
        "下载 AI 提示词": "Download AI prompts",
        "创建 API Key": "Create an API Key",
        "让 Agent 替你处理文件": "Let your Agent handle files",
        "安装 PicoShare Skill 后，用自然语言要求 Agent 上传文件、查找记录、创建云便签并返回分享链接。": "Install the PicoShare Skill and ask your Agent to upload files, find items, create notes, and return share links.",
        "把这个设计稿上传到 PicoShare，": "Upload this mockup to PicoShare and",
        "生成分享链接给我。": "send me the share link.",
        "你：": "You:",
        "Agent：": "Agent:",
        "上传完成，链接已就绪。": "Upload complete. Your link is ready.",
        "查看接入说明": "See integration guide",
        "把分享入口，": "Put sharing",
        "放回浏览器里。": "back in your browser.",
        "本地文件不必先打开网站；网页内容和图片也不必另存再上传。浏览器扩展把常用动作放在右键菜单和常驻按钮里。": "No need to open the site for local files or save pages and images before uploading. Share from the browser's right-click menu or floating button.",
        "浏览器扩展上传成功界面示意图": "Browser extension upload success preview",
        "上传成功 · dashboard.html": "Uploaded · dashboard.html",
        "✓ 上传成功 · dashboard.html": "✓ Uploaded · dashboard.html",
        "上传成功看得见，分享链接复制即用。": "See the upload succeed, then copy the share link.",
        "扩展使用你的 PicoShare 站点和账户 API Key。上传后会显示成功提示、浏览器通知和链接卡片。": "Connect the extension to your PicoShare site with an account API Key. After upload, it shows a success message, browser notification, and link card.",
        "弹窗选本地文件上传，生成并复制分享链接": "Upload a local file from the popup and copy its share link",
        "网页空白处右键上传 HTML；图片右键保存并分享": "Right-click a page to upload its HTML, or an image to save and share it",
        "启用常驻浮动按钮：长截图、选文件、上传当前页 HTML": "Use the floating button to capture a full-page screenshot, choose a file, or upload the current page as HTML",
        "浮动按钮可拖动并记住位置，适配日常浏览": "Drag the floating button; it remembers its position as you browse",
        "下载浏览器扩展": "Download browser extension",
        "从 Chrome 网上应用店添加": "Add from the Chrome Web Store",
        "下载 ZIP 手动安装": "Download ZIP for manual installation",
        "还没有 API Key？先去账户页创建": "Need an API Key? Create one in your account",
        "下载 ZIP 并解压到本地文件夹。": "Download the ZIP and extract it to a folder.",
        "打开 chrome://extensions 或 edge://extensions，开启开发者模式并加载解压缩的扩展。": "Open chrome://extensions or edge://extensions, enable Developer mode, and load the unpacked extension.",
        "填入 PicoShare 站点地址和账户 API Key，点击“保存并授权网站”。": "Enter your PicoShare site URL and account API Key, then choose Save and grant access.",
        "从扩展弹窗、网页右键菜单或常驻按钮开始上传。": "Upload from the extension popup, page context menu, or floating button.",
        "扩展通过 Chrome / Edge 开发者模式安装。启用常驻按钮和整页截图时会请求网页访问权限；网页 HTML 分享预览会禁用脚本。请在上传前检查页面中是否含有私人信息。": "Install through Chrome or Edge Developer mode. The floating button and full-page capture request website access; shared HTML previews disable scripts. Check pages for private information before uploading.",
        "从本地内容，到分享链接。": "From local content to a shareable link.",
        "看看 PicoShare 的实际使用流程。": "See PicoShare in action.",
        "通过产品演示了解文件分享、HTML 预览、命令行与云便签的日常工作流。": "See how PicoShare handles file sharing, HTML previews, CLI workflows, and cloud notes.",
        "先从免费开始，": "Start for free,",
        "需要更多再升级。": "upgrade when you need more.",
        "这是一个轻量分享工具：免费版满足日常小文件和小文本分享；Pro 为更大的文件、更长的保存时间和稳定的自动化调用提供空间。": "PicoShare is a lightweight sharing tool: Free covers everyday small files and text snippets, while Pro adds room for larger files, longer retention, and reliable automation.",
        "适合个人试用、偶尔分享、小文本便签与轻量自动化。": "For personal trials, occasional sharing, small text notes, and light automation.",
        "$0": "$0",
        "/ 永久免费": "/ forever",
        "无需绑定支付方式": "No payment method required",
        "1 GiB 账户存储空间": "1 GiB account storage",
        "单文件最大 100 MiB": "100 MiB maximum file size",
        "文件最长保存 30 天": "Files kept for up to 30 days",
        "5 条云便签，每条最多 32 KiB": "5 cloud notes, up to 32 KiB each",
        "每月 500 次 API 请求（最多 10 次/分钟）· 1 个 API Key": "500 API requests per month (up to 10/minute) · 1 API Key",
        "最多 3 个访客上传链接": "Up to 3 guest upload links",
        "适合常用分享、较大文件和稳定的开发者工作流。": "For regular sharing, larger files, and reliable developer workflows.",
        "$5": "$5",
        "/ 月付": "/ month",
        "或 $50 / 年付 · 相比月付全年省 $10": "or $50 / year · save $10 vs. monthly",
        "5 GiB 账户存储空间": "5 GiB account storage",
        "单文件最大 1 GiB": "1 GiB maximum file size",
        "文件最长保存 365 天": "Files kept for up to 365 days",
        "20 条云便签，每条最多 128 KiB": "20 cloud notes, up to 128 KiB each",
        "每月 5,000 次 API 请求（最多 60 次/分钟）· 3 个 API Key": "5,000 API requests per month (up to 60/minute) · 3 API Keys",
        "最多 20 个访客上传链接": "Up to 20 guest upload links",
        "查看账户与订阅": "Account and subscription",
        "API 请求额度由账号下所有 API Key 共享，网页账户管理不计入。云便签用于配置片段、命令和小文本分享，较大内容请作为文件上传。需要更大容量、更高频 API 或内网部署，可使用自己的 Cloudflare 账号联系 PicoShare 做私有化部署。文件分享链接对持有链接的人开放，请勿通过公开网页或仓库暴露 API Key。实际支付以订阅结账页所配置的商品为准。": "API request quotas are shared across all API Keys on an account; browser account management is excluded. Cloud notes are for config snippets, commands, and small text; upload larger content as a file. For more storage, higher API volume, or private network deployment, contact PicoShare about a private deployment on your own Cloudflare account. Anyone with a file link can access it. Never expose API Keys in public websites or repositories. Final charges follow the product configured at checkout.",
        "开始之前，": "Before you start,",
        "几个小问题。": "a few quick answers.",
        "把分享方式、HTML 预览和账户密钥的边界说清楚，省去开始之后的意外。": "A few details about sharing, HTML previews, and account keys can help avoid surprises.",
        "分享链接是否需要登录？": "Do recipients need to sign in to open a share link?",
        "文件分享链接面向链接持有者开放，不要求对方先注册。请只把链接发给你希望访问内容的人。": "Anyone with a file link can open it without registering. Share links only with people you want to access the content.",
        "上传的 HTML 能运行完整交互吗？": "Can uploaded HTML run full interactions?",
        "HTML 以沙箱方式预览，样式和静态内容可展示；脚本、表单、API 连接等受到限制。它适合分享视觉稿和静态页面预览，不等同于部署完整 Web 应用。": "HTML is shown in a sandbox. Styles and static content can render, while scripts, forms, and API connections are restricted. It's for sharing mockups and static previews, not for deploying a full web app.",
        "API Key 可以放进网页前端吗？": "Can I put an API Key in browser-side code?",
        "不可以。API Key 只能保存在可信的本地工具、服务器或 Agent Secret 配置中。公开客户端代码可能被任何人读取。": "No. Keep API Keys in trusted local tools, servers, or Agent secret stores. Public client-side code can be read by anyone.",
        "浏览器扩展怎么登录我的账户？": "How does the browser extension connect to my account?",
        "在账户页创建 API Key，然后在扩展中配置 PicoShare 站点地址和 API Key。密钥保存在当前浏览器扩展的本地存储中。": "Create an API Key in your account, then enter your PicoShare site URL and key in the extension. The key is stored in the extension's local storage in this browser profile.",
        "打开工作台": "Open workspace",
        "账户与订阅": "Account & subscription",
        "隐私政策": "Privacy policy"
      };
      var attributes = [
        [".skip-link", "aria-label", "跳到主要内容", "Skip to main content"],
        [".nav", "aria-label", "主导航", "Main navigation"],
        [".brand", "aria-label", "PicoShare 首页", "PicoShare home"],
        [".ticker", "aria-label", "支持的分享内容", "Supported content"],
        [".hero-art", "aria-label", "PicoShare 文件分享界面示意图", "PicoShare file sharing preview"],
        [".extension-preview", "aria-label", "浏览器扩展上传成功界面示意图", "Browser extension upload success preview"],
        [".install-steps", "aria-label", "浏览器扩展安装步骤", "Browser extension installation steps"],
        ["#product-video", "aria-label", "PicoShare 中文产品介绍视频", "PicoShare English product introduction video"]
      ];
      var originals = new WeakMap();
      var toggle = document.getElementById("language-toggle");
      var requested = new URLSearchParams(location.search).get("lang");
      var stored = null;
      try {
        stored = localStorage.getItem("ps_lang");
        if (stored !== "en" && stored !== "zh") stored = localStorage.getItem("picoshare_landing_lang");
      } catch (_) {}
      var locale = requested === "en" || requested === "zh" ? requested : stored || (navigator.language.toLowerCase().startsWith("en") ? "en" : "zh");
      try {
        localStorage.setItem("ps_lang", locale);
        localStorage.removeItem("picoshare_landing_lang");
      } catch (_) {}

      function applyLanguage(nextLocale) {
        locale = nextLocale;
        var productVideo = document.getElementById("product-video");
        var videoSource = locale === "en"
          ? "/videos/picoshare-intro-en-full.mp4"
          : "/videos/picoshare-intro-zh-full.mp4";
        if (productVideo && productVideo.getAttribute("src") !== videoSource) {
          productVideo.setAttribute("src", videoSource);
          productVideo.load();
        }
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          var node = walker.currentNode;
          if (!originals.has(node)) originals.set(node, node.nodeValue);
          var original = originals.get(node);
          var trimmed = original.trim();
          var translated = locale === "en" ? english[trimmed] : null;
          node.nodeValue = translated ? original.replace(trimmed, translated) : original;
        }
        attributes.forEach(function(entry) {
          var element = document.querySelector(entry[0]);
          if (element) element.setAttribute(entry[1], locale === "en" ? entry[3] : entry[2]);
        });
        document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
        document.title = locale === "en" ? "PicoShare — Share what you make" : "PicoShare — 让内容从本地，变成可分享的链接";
        var description = document.querySelector('meta[name="description"]');
        if (description) description.content = locale === "en"
          ? "PicoShare makes it easy to share files, images, HTML mockups, and cloud notes. Includes a browser extension, API, CLI, and Agent Skill."
          : "PicoShare：快速分享文件、图片、HTML 视觉稿和云便签。支持浏览器扩展、API、CLI 与 Agent Skill。";
        toggle.textContent = locale === "en" ? "中文" : "EN";
        toggle.setAttribute("aria-label", locale === "en" ? "切换到中文" : "Switch to English");
      }

      toggle.addEventListener("click", function() {
        var nextLocale = locale === "en" ? "zh" : "en";
        try { localStorage.setItem("ps_lang", nextLocale); } catch (_) {}
        var nextUrl = new URL(location.href);
        nextUrl.searchParams.set("lang", nextLocale);
        history.replaceState(null, "", nextUrl);
        applyLanguage(nextLocale);
      });
      applyLanguage(locale);
    })();
  </script>
</body>
</html>`;
}

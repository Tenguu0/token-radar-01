// Token Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, a per-protocol detail view with the
// model's own breakdown and the protocol's farm plan, a live-token view, and a model sandbox
// that re-ranks the board from the same snapshot figures. No network: every byte it shows
// is in data.js. Hash routes drive the three screenshots: #/detail/<slug> and
// #/filter/chain/<chain> or #/filter/category/<category>.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = {
    q: '', chain: 'all', category: 'all', scope: 'all', tab: 'board',
    sort: 'implied', dir: -1, selected: null, limit: 50,
    model: { base_multiple: DATA.model.base_multiple, growth_weight: DATA.model.growth_weight, maturity_days: DATA.model.maturity_days },
    sandbox: false,
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    var d = Math.floor((Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z')) / 86400000);
    return isFinite(d) ? Math.max(0, d) : null;
  }

  // --- the model, in the page, from the same figures as lib/model.ts -----------------
  function implied(r, m) {
    var growth = Math.min(120, Math.max(-60, isFinite(r.change_7d) ? r.change_7d : 0));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = r.age_days === null || r.age_days === undefined ? 365 : r.age_days;
    var maturity = 0.6 + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * 0.4;
    var breadth = 1 + Math.min(Math.max(r.chains.length - 1, 0), 4) * 0.05;
    var stability = (isFinite(r.change_7d) ? r.change_7d : 0) < -30 ? 0.9 : 1;
    return Math.max(1, Math.round(r.tvl_usd * m.base_multiple * growthMult * maturity * breadth * stability));
  }
  function rankedRows() {
    var rows = DATA.rows.map(function (r) {
      return { r: r, v: state.sandbox ? implied(r, state.model) : r.implied_value_usd };
    });
    rows.sort(function (a, b) { return b.v - a.v || (a.r.slug < b.r.slug ? -1 : 1); });
    rows.forEach(function (x, i) { x.rank = i + 1; });
    return rows;
  }

  // --- the farm plan, same rules as lib/model.ts farmSteps ----------------------------
  function gasOn(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 'about $5 to $12';
    if (c === 'solana') return 'under $0.05';
    if (c === 'bitcoin' || c === 'tron' || c === 'bsc' || c === 'binance') return 'under $0.50';
    return 'under $0.50';
  }
  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase();
    var n = r.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ' and borrow a small amount against it, then repay the borrow.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + n + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into ' + n + "'s main vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + n + ', then use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + n + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + n + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('basis') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + n + "'s farm on " + chain + ' and keep the position open.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + n + ' on ' + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function farmPlan(r) {
    var chain = r.chains.length ? r.chains[0] : 'its main chain';
    var capital = capitalFor(r.tvl_usd);
    var hold = holdFor(r.age_days);
    var gas = gasOn(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'nothing but the wallet', time: '5 minutes' },
      { text: actionFor(r, capital, chain), cost: '$' + capital + ' of capital and ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', cost: gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind the position once the token launches.', cost: 'nothing but the log', time: '5 minutes' },
    ];
  }

  // --- filtering / sorting ------------------------------------------------------------
  function filtered() {
    var rows = rankedRows();
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (x) {
      var r = x.r;
      if (state.scope === 'watchlist' && !DATA.watchlistSet[r.slug]) return false;
      if (state.scope === 'early' && DATA.watchlistSet[r.slug]) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(rows) {
    var key = state.sort;
    var dir = state.dir;
    var val = function (x) {
      var r = x.r;
      if (key === 'implied') return x.v;
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -9999 : r.change_7d;
      if (key === 'age') return r.age_days === null ? -1 : r.age_days;
      return x.rank;
    };
    return rows.slice().sort(function (a, b) { return (val(a) - val(b)) * dir || a.rank - b.rank; });
  }

  // --- rendering ----------------------------------------------------------------------
  function chainOptions() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = 1; }); });
    return Object.keys(seen).sort();
  }
  function catOptions() {
    var seen = {};
    DATA.rows.forEach(function (r) { seen[r.category || 'Uncategorised'] = 1; });
    return Object.keys(seen).sort();
  }
  function topChain() {
    var counts = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    var best = '', n = 0;
    Object.keys(counts).forEach(function (c) { if (counts[c] > n) { n = counts[c]; best = c; } });
    return best + ' (' + n + ')';
  }
  function totalPreTvl() {
    return DATA.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
  }

  function render() {
    var rows = sorted(filtered());
    var shown = rows.slice(0, state.limit);
    var sel = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    var selRank = null;
    if (sel) {
      var all = rankedRows();
      for (var i = 0; i < all.length; i++) if (all[i].r.slug === sel.slug) { selRank = all[i]; break; }
    }
    var h = '';
    h += '<header class="hero"><h1>Token Radar<span class="dot">.</span></h1>';
    h += '<p><strong>Every pre-token protocol, ranked by what its token would be worth.</strong> The board covers all '
      + DATA.watchlist_size + ' watchlist protocols and ' + DATA.early_size
      + ' early ones below the $50M floor — ' + DATA.board_size + ' rows in all, scored only from the snapshot: '
      + 'TVL, 7-day growth, age with no token, and chain breadth. “Records no token” means the snapshot records none; it is not proof none exists.</p>';
    h += '<p>Snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source) + ' · model <strong>' + esc(DATA.model_version) + '</strong></p></header>';
    h += '<div class="stats">'
      + '<div class="stat"><b>' + DATA.board_size + '</b><span>Pre-token rows</span></div>'
      + '<div class="stat"><b>' + fmtUsd(totalPreTvl()) + '</b><span>Pre-token TVL tracked</span></div>'
      + '<div class="stat"><b>' + fmtUsd(DATA.rows[0].implied_value_usd) + '</b><span>Top implied value</span></div>'
      + '<div class="stat"><b>' + esc(topChain()) + '</b><span>Most common chain</span></div></div>';

    h += '<div class="tabs" role="group" aria-label="Views">'
      + '<button data-tab="board" aria-pressed="' + (state.tab === 'board') + '">Board</button>'
      + '<button data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live tokens (' + DATA.live_size + ')</button>'
      + '<button data-scope="all" aria-pressed="' + (state.scope === 'all') + '">All</button>'
      + '<button data-scope="watchlist" aria-pressed="' + (state.scope === 'watchlist') + '">Watchlist only</button>'
      + '<button data-scope="early" aria-pressed="' + (state.scope === 'early') + '">Early (below floor)</button></div>';

    if (state.tab === 'live') {
      h += '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>';
      DATA.live.forEach(function (r) {
        h += '<tr><td><span class="name">' + esc(r.name) + '</span> <span class="slug">' + esc(r.slug) + '</span><span class="badge live">LIVE</span></td>'
          + '<td>' + esc(r.category || '—') + '</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td>'
          + '<td class="num ' + ((r.change_7d || 0) >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td></tr>';
      });
      h += '</tbody></table><p class="meta">Live tokens already trade: the board shows the market\u2019s own value for them, never a model\u2019s. They are not farm targets for a launch that already happened.</p>';
    } else {
      h += '<div class="controls"><input type="search" id="q" placeholder="Search name or slug…" value="' + esc(state.q) + '" aria-label="Search">'
        + '<select id="chain" aria-label="Chain"><option value="all">All chains</option>'
        + chainOptions().map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
        + '<select id="cat" aria-label="Category"><option value="all">All categories</option>'
        + catOptions().map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
        + '<span class="count">' + rows.length + ' of ' + DATA.board_size + ' rows</span></div>';

      if (sel && selRank) {
        var r = sel;
        var base = Math.round(r.tvl_usd * DATA.model.base_multiple);
        h += '<section class="detail" id="detail"><h2>#' + selRank.rank + ' ' + esc(r.name) + '</h2>'
          + '<div class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed')
          + ' · listed ' + esc(r.listed_at || 'unknown') + ' · ' + (r.age_days === null ? 'age unknown' : r.age_days + ' days old')
          + (DATA.watchlistSet[r.slug] ? ' · <span class="badge wl">WATCHLIST</span>' : ' · <span class="badge early">EARLY</span>') + '</div>'
          + '<div class="breakdown">'
          + '<div><b>' + fmtUsd(selRank.v) + '</b><span>Implied value' + (state.sandbox ? ' (sandbox)' : '') + '</span></div>'
          + '<div><b>' + fmtUsd(r.tvl_usd) + '</b><span>TVL × 0.25 = ' + fmtUsd(base) + ' base</span></div>'
          + '<div><b>' + fmtPct(r.change_7d) + '</b><span>7-day growth → ×' + r.growth_multiplier.toFixed(2) + '</span></div>'
          + '<div><b>×' + r.maturity_multiplier.toFixed(2) + '</b><span>Maturity (' + (r.age_days === null ? 'age unknown, 365d assumed' : r.age_days + ' days') + ')</span></div>'
          + '<div><b>×' + r.breadth_multiplier.toFixed(2) + '</b><span>Breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</span></div>'
          + '<div><b>×' + r.stability_multiplier.toFixed(2) + '</b><span>Stability' + (r.stability_multiplier < 1 ? ' (TVL bleeding &gt;30%)' : '') + '</span></div></div>'
          + '<h3>How to farm it — 6 steps</h3><ol class="farm">'
          + farmPlan(r).map(function (s) { return '<li>' + esc(s.text) + ' <span class="cost">Cost: ' + esc(s.cost) + '. Time: ' + esc(s.time) + '.</span></li>'; }).join('')
          + '</ol><p><a href="#/" id="close-detail">← Back to the board</a></p></section>';
      }

      h += '<table><thead><tr>'
        + '<th><button data-sort="rank">Rank</button></th><th>Protocol</th><th>Category</th>'
        + '<th class="num"><button data-sort="implied">Implied value</button></th>'
        + '<th class="num"><button data-sort="tvl">TVL</button></th>'
        + '<th class="num"><button data-sort="growth">7d</button></th>'
        + '<th class="num"><button data-sort="age">Age</button></th></tr></thead><tbody>';
      shown.forEach(function (x) {
        var rr = x.r;
        h += '<tr class="row' + (state.selected === rr.slug ? ' sel' : '') + '" data-slug="' + esc(rr.slug) + '">'
          + '<td class="num">#' + x.rank + '</td>'
          + '<td><span class="name">' + esc(rr.name) + '</span> <span class="slug">' + esc(rr.slug) + '</span>'
          + (DATA.watchlistSet[rr.slug] ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') + '</td>'
          + '<td>' + esc(rr.category || '—') + '</td>'
          + '<td class="num">' + fmtUsd(x.v) + '</td>'
          + '<td class="num">' + fmtUsd(rr.tvl_usd) + '</td>'
          + '<td class="num ' + ((rr.change_7d || 0) >= 0 ? 'pos' : 'neg') + '">' + fmtPct(rr.change_7d) + '</td>'
          + '<td class="num">' + (rr.age_days === null ? '—' : rr.age_days + 'd') + '</td></tr>';
      });
      h += '</tbody></table>';
      if (rows.length > state.limit) h += '<button class="more" id="more">Show more (' + (rows.length - state.limit) + ' left)</button>';
      h += '<p class="count" style="color:var(--muted);font-size:13px">Showing ' + shown.length + ' of ' + rows.length + ' matching rows. Click any row for its detail view and farm plan.</p>';
    }

    h += '<section class="sandbox"><h2>Model sandbox — change the model, re-rank the board</h2>'
      + '<p>Same figures, your weights. The sandbox re-scores every row in the page; the board above re-ranks live. Reset restores model ' + esc(DATA.model_version) + '.</p>'
      + '<div class="sliders">'
      + '<label>Base multiple <output id="o-base">' + state.model.base_multiple.toFixed(2) + '</output><input type="range" id="s-base" min="0.05" max="0.6" step="0.01" value="' + state.model.base_multiple + '"></label>'
      + '<label>Growth weight <output id="o-growth">' + state.model.growth_weight.toFixed(2) + '</output><input type="range" id="s-growth" min="0" max="1" step="0.05" value="' + state.model.growth_weight + '"></label>'
      + '<label>Maturity horizon (days) <output id="o-mat">' + state.model.maturity_days + '</output><input type="range" id="s-mat" min="180" max="1825" step="5" value="' + state.model.maturity_days + '"></label>'
      + '</div><p><button class="more" id="reset-model" style="margin:0">Reset model</button> ' + (state.sandbox ? '<span style="color:var(--amber)">Sandbox active — ranks below are re-scored, not the submitted board.</span>' : '') + '</p></section>';

    h += '<section class="method"><h2>How the radar scores</h2>'
      + '<p><code>implied = TVL × 0.25 × (1 + clamp(7d, −60, 120)% × 0.5) × (0.6 + min(age, 1095)/1095 × 0.4) × (1 + 0.05 × min(chains−1, 4)) × (0.9 if 7d &lt; −30% else 1)</code></p>'
      + '<p>Size is the anchor: a token is usually priced off the protocol behind it. Growth rewards momentum, maturity rewards a long run with no token (pent-up launch value), breadth rewards a multi-chain footprint, and a hard TVL bleed is discounted 10%. No name is special-cased — the same function scores all '
      + DATA.board_size + ' rows. Farm plans are generated from each protocol\u2019s own category, chains, TVL and age, with the cost and time of every step. Implied value is this radar\u2019s claim, never a promise: it does not predict whether or when a token launches.</p></section>';
    h += '<footer>Token Radar · model ' + esc(DATA.model_version) + ' · snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source) + ' · runs fully offline; no network calls.</footer>';

    app.innerHTML = '<div class="wrap">' + h + '</div>';
    app.setAttribute('aria-busy', 'false');
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.limit = 50; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; state.limit = 50; render(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; state.limit = 50; render(); });
    var more = document.getElementById('more');
    if (more) more.addEventListener('click', function () { state.limit += 100; render(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); state.limit = 50; render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-scope]'), function (b) {
      b.addEventListener('click', function () { state.scope = b.getAttribute('data-scope'); state.limit = 50; render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = -1; }
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tr.row'), function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        location.hash = '#/detail/' + state.selected;
        render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView();
      });
    });
    var close = document.getElementById('close-detail');
    if (close) close.addEventListener('click', function (e) { e.preventDefault(); state.selected = null; location.hash = '#/'; render(); });
    var sb = document.getElementById('s-base');
    if (sb) sb.addEventListener('input', function () { state.model.base_multiple = parseFloat(sb.value); document.getElementById('o-base').textContent = state.model.base_multiple.toFixed(2); state.sandbox = true; state.limit = 50; render(); });
    var sg = document.getElementById('s-growth');
    if (sg) sg.addEventListener('input', function () { state.model.growth_weight = parseFloat(sg.value); document.getElementById('o-growth').textContent = state.model.growth_weight.toFixed(2); state.sandbox = true; state.limit = 50; render(); });
    var sm = document.getElementById('s-mat');
    if (sm) sm.addEventListener('input', function () { state.model.maturity_days = parseInt(sm.value, 10); document.getElementById('o-mat').textContent = sm.value; state.sandbox = true; state.limit = 50; render(); });
    var rs = document.getElementById('reset-model');
    if (rs) rs.addEventListener('click', function () {
      state.model = { base_multiple: DATA.model.base_multiple, growth_weight: DATA.model.growth_weight, maturity_days: DATA.model.maturity_days };
      state.sandbox = false; render();
    });
  }

  // --- hash routes for deep links and screenshots --------------------------------------
  function applyHash() {
    var hash = location.hash || '';
    var m = hash.match(/^#\/detail\/([A-Za-z0-9._-]+)/);
    if (m) { state.selected = m[1]; state.tab = 'board'; return; }
    m = hash.match(/^#\/filter\/chain\/(.+)$/);
    if (m) { state.chain = decodeURIComponent(m[1]); state.tab = 'board'; return; }
    m = hash.match(/^#\/filter\/category\/(.+)$/);
    if (m) { state.category = decodeURIComponent(m[1]); state.tab = 'board'; return; }
    state.selected = null;
  }
  DATA.watchlistSet = {};
  DATA.watchlist.forEach(function (s) { DATA.watchlistSet[s] = true; });
  window.addEventListener('hashchange', function () { applyHash(); render(); });
  applyHash();
  render();
})();

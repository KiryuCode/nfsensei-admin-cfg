(() => {
  const data = window.CLI_DATA;
  const qEl = document.getElementById("q");
  const main = document.getElementById("main");
  const catsEl = document.getElementById("cats");
  const meta = document.getElementById("meta");

  const byName = Object.fromEntries(data.commands.map((c) => [c.name, c]));
  const categories = [...new Set(data.commands.map((c) => c.category).filter(Boolean))].sort();
  let activeCat = "";

  meta.innerHTML = `<strong>${data.command_count}</strong> commands · ${data.version}<br>${esc(data.hostname)}`;

  catsEl.innerHTML =
    `<button data-cat="" class="on">all</button>` +
    categories.map((c) => `<button data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  catsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    activeCat = b.dataset.cat;
    [...catsEl.querySelectorAll("button")].forEach((x) => x.classList.toggle("on", x === b));
    render();
  });

  qEl.addEventListener("input", render);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== qEl) {
      e.preventDefault();
      qEl.focus();
      qEl.select();
    }
    if (e.key === "Escape") {
      qEl.value = "";
      qEl.blur();
      render();
    }
  });

  main.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy).then(() => {
      const t = b.textContent;
      b.textContent = "copied";
      setTimeout(() => (b.textContent = t), 900);
    });
  });

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hi(text, q) {
    const t = esc(text);
    if (!q || q.length < 2) return t;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    return t.replace(re, (m) => `<mark>${m}</mark>`);
  }

  function tokens(q) {
    return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  function hasToken(hay, t) {
    const h = String(hay).toLowerCase();
    if (t.length <= 2) {
      return new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`).test(h);
    }
    return h.includes(t);
  }

  function scoreCmd(c, toks) {
    if (!toks.length) return 1;
    const name = c.name.toLowerCase();
    const blob = c.search || "";
    let s = 0;
    for (const t of toks) {
      if (name === t) s += 50;
      else if (name.startsWith(t) || name.split(/\s+/).includes(t)) s += 24;
      else if (hasToken(name, t)) s += 14;
      else if ((c.tags || []).some((x) => hasToken(x, t))) s += 12;
      else if (hasToken(blob, t)) s += 4;
      else return 0;
    }
    if (c.rank) s += 8;
    return s;
  }

  function scoreHowto(h, toks) {
    if (!toks.length) return 1;
    const phrase = toks.join(" ");
    const queries = (h.queries || []).map((x) => x.toLowerCase());
    let s = queries.includes(phrase) ? 50 : 0;
    for (const t of toks) {
      const inQuery = queries.some((q) => hasToken(q, t));
      const inTitle = hasToken(h.title, t);
      const inSum = hasToken(h.summary, t);
      if (inTitle) s += 16;
      else if (inQuery) s += 14;
      else if (inSum) s += 8;
      else return 0;
    }
    return s + 20;
  }

  function codeBlock(src, q) {
    const raw = src || "";
    return `<div class="row"><span class="lab">example</span><button class="copy" data-copy="${esc(raw)}">copy</button></div>
      <pre>${hi(raw, q)}</pre>`;
  }

  function renderHowto(h, q) {
    const steps = (h.steps || [])
      .map(
        (st, i) => `<div class="step">
        <div class="n">${i + 1}</div>
        <div>
          <pre>${hi(st.cmd, q)}</pre>
          ${st.note ? `<p class="note">${hi(st.note, q)}</p>` : ""}
        </div>
      </div>`
      )
      .join("");
    return `<article class="card howto">
      <div class="name">${hi(h.title, q)}</div>
      <p class="desc">${hi(h.summary, q)}</p>
      ${steps}
      ${h.alt ? `<p class="note">${hi(h.alt, q)}</p>` : ""}
    </article>`;
  }

  function renderCmd(c, q, ranked) {
    const flags = (c.flags || [])
      .slice(0, 8)
      .map((f) => `<li><code>${esc(f.flag)}</code> ${esc(f.description)}</li>`)
      .join("");
    const more = (c.flags || []).length > 8 ? `<li>… ${(c.flags || []).length - 8} more flags</li>` : "";
    const params = (c.parameters || [])
      .map((p) => `<li><code>${esc(p.name)}</code> ${esc(p.description)}${p.required ? " — required" : ""}</li>`)
      .join("");
    const usage = (c.usage || []).join("\n");
    return `<article class="card${ranked ? " top" : ""}">
      <div>
        ${c.rank ? `<span class="rank">${c.rank}</span>` : ""}
        <span class="name">${hi(c.name, q)}</span>
        <span class="cat">${esc(c.category)}</span>
      </div>
      <p class="desc">${hi(c.description, q)}</p>
      ${usage ? `<div class="row"><span class="lab">usage</span><button class="copy" data-copy="${esc(usage)}">copy</button></div><pre>${hi(usage, q)}</pre>` : ""}
      ${c.example ? codeBlock(c.example, q) : ""}
      ${params ? `<ul class="flags">${params}</ul>` : ""}
      ${flags ? `<ul class="flags">${flags}${more}</ul>` : ""}
      ${c.notes ? `<p class="note">${hi(c.notes, q)}</p>` : ""}
    </article>`;
  }

  function render() {
    const q = qEl.value.trim();
    const toks = tokens(q);
    const searching = toks.length > 0;

    let howtos = data.howtos
      .map((h) => ({ h, s: scoreHowto(h, toks) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    let cmds = data.commands.filter((c) => !activeCat || c.category === activeCat);
    cmds = cmds
      .map((c) => ({ c, s: scoreCmd(c, toks) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (a.c.rank || 99) - (b.c.rank || 99) || a.c.name.localeCompare(b.c.name));

    let html = "";

    function compact(c) {
      return `<article class="card">
        <div><span class="name">${hi(c.name, q)}</span><span class="cat">${esc(c.category)}</span></div>
        <p class="desc">${hi(c.description, q)}</p>
      </article>`;
    }

    if (!searching && !activeCat) {
      html += `<section><h2>How to</h2><div class="grid">${data.howtos.map((h) => renderHowto(h, q)).join("")}</div></section>`;
      const top = data.top20.map((n) => byName[n]).filter(Boolean);
      html += `<section><h2>Top 20 — most useful</h2><div class="grid cards">${top.map((c) => renderCmd(c, q, true)).join("")}</div></section>`;
      html += `<section><h2>All ${data.command_count} commands</h2><p class="note">Search or pick a category for usage, flags, and examples.</p><div class="grid cards">${data.commands.map(compact).join("")}</div></section>`;
    } else {
      if (howtos.length && !activeCat) {
        html += `<section><h2>How to</h2><div class="grid">${howtos.map((x) => renderHowto(x.h, q)).join("")}</div></section>`;
      }
      if (cmds.length) {
        const label = searching ? `${cmds.length} matching commands` : `${cmds.length} in ${activeCat}`;
        html += `<section><h2>${esc(label)}</h2><div class="grid cards">${cmds.map((x) => renderCmd(x.c, q, Boolean(x.c.rank))).join("")}</div></section>`;
      }
      if (!html) html = `<p class="empty">No matches for “${esc(q)}”.</p>`;
    }
    main.innerHTML = html;
  }

  render();
  qEl.focus();
})();

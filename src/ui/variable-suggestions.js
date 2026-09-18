(() => {
  let sequence = 0;
  window.attachVariableSuggestions = (input, variables) => {
    const menu = document.createElement('div'); menu.className = 'variable-menu'; menu.hidden = true;
    menu.id = `variable-menu-${++sequence}`; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', '変数の候補');
    input.after(menu); input.setAttribute('aria-controls', menu.id); input.setAttribute('aria-autocomplete', 'list');
    let matches = [], selected = 0, start = 0, end = 0;
    function close() { menu.hidden = true; input.removeAttribute('aria-activedescendant'); }
    function highlight() { [...menu.children].forEach((row, i) => row.setAttribute('aria-selected', String(i === selected))); input.setAttribute('aria-activedescendant', menu.children[selected].id); menu.children[selected].scrollIntoView({ block: 'nearest' }); }
    function choose(index) {
      const token = `{${matches[index]}}`;
      const finish = input.value[end] === '}' ? end + 1 : end;
      if (input.value.length - (finish - start) + token.length > input.maxLength) return;
      input.setRangeText(token, start, finish, 'end'); input.focus(); close(); input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function update() {
      if (document.activeElement !== input || input.selectionStart !== input.selectionEnd) return close();
      end = input.selectionStart;
      const match = /\{([a-z-]*)$/.exec(input.value.slice(0, end));
      if (!match) return close();
      start = end - match[0].length; matches = variables.filter(v => v.startsWith(match[1]));
      if (!matches.length) return close();
      selected = 0; menu.replaceChildren();
      matches.forEach((variable, index) => {
        const row = document.createElement('div'); row.id = `${menu.id}-${index}`; row.setAttribute('role', 'option'); row.textContent = `{${variable}}`;
        row.addEventListener('mousedown', event => event.preventDefault()); row.addEventListener('click', () => choose(index)); menu.append(row);
      });
      menu.hidden = false; highlight();
    }
    input.addEventListener('input', event => { if (!event.isComposing) update(); });
    input.addEventListener('compositionend', update); input.addEventListener('click', update); input.addEventListener('blur', close);
    input.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) update(); });
    input.addEventListener('keydown', event => {
      if (event.isComposing || menu.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length; highlight(); }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(selected); }
    });
  };
})();

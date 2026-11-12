/* Preferenze di visualizzazione; nessun cambiamento ai dati del viaggio. */
(() => {
  const root = document.documentElement;
  let prefs = { layout: 'phone', rotate: true, orientation: 'any' };
  try { const saved = JSON.parse(localStorage.getItem('adc-screen') || '{}'); if (['phone','tablet'].includes(saved.layout)) prefs.layout=saved.layout; if(typeof saved.rotate==='boolean') prefs.rotate=saved.rotate; prefs.orientation=['any','portrait','landscape'].includes(saved.orientation)?saved.orientation:(saved.rotate===false?'portrait':'any'); } catch (_) {}
  const save = () => { try {localStorage.setItem('adc-screen',JSON.stringify(prefs));} catch (_) {} };
  root.dataset.screen=prefs.layout;
  const dialog=document.createElement('dialog');
  dialog.className='screen-dialog';
  dialog.setAttribute('aria-labelledby','screen-title');
  dialog.innerHTML='<div class="screen-heading"><h2 id="screen-title">Schermo</h2><button type="button" class="close" data-screen-close aria-label="Chiudi impostazioni schermo">Chiudi</button></div><p class="note">Scegli come visualizzare la scheda treno.</p><fieldset><legend>Formato schermo</legend><label class="screen-choice"><input type="radio" name="screen-layout" value="phone"><span><b>Telefono</b><small>Vista compatta, adatta a uno schermo piccolo.</small></span></label><label class="screen-choice"><input type="radio" name="screen-layout" value="tablet"><span><b>Tablet</b><small>Più spazio per località, colonne e dettagli.</small></span></label></fieldset><fieldset><legend>Orientamento</legend><label class="screen-choice"><input type="radio" name="screen-orientation" value="any"><span><b>Automatico</b><small>Segue la rotazione del dispositivo.</small></span></label><label class="screen-choice"><input type="radio" name="screen-orientation" value="portrait"><span><b>Verticale</b></span></label><label class="screen-choice"><input type="radio" name="screen-orientation" value="landscape"><span><b>Orizzontale</b></span></label></fieldset><p class="note">Applica orientamento apre la modalità a schermo intero, richiesta da Chrome per controllare la rotazione. Per Automatico, lascia attiva anche la rotazione del dispositivo.</p><button class="btn" type="button" id="screen-apply">Applica orientamento</button><button class="btn" type="button" id="screen-exit-full" hidden>Esci da schermo intero</button><p class="note" id="screen-result" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const result=dialog.querySelector('#screen-result');
  const orientationInputs=[...dialog.querySelectorAll('[name="screen-orientation"]')];
  const apply=dialog.querySelector('#screen-apply');
  const exitFull=dialog.querySelector('#screen-exit-full');
  dialog.querySelector('[name="screen-orientation"][value="'+prefs.orientation+'"]').checked=true;
  dialog.querySelector('[name="screen-layout"][value="'+prefs.layout+'"]').checked=true;
  result.textContent='Seleziona un orientamento e premi Applica. La scelta salvata viene applicata solo dopo la conferma del browser.';
  let opener;
  const menu=document.createElement('dialog');
  menu.id='app-options';menu.className='app-options';menu.setAttribute('aria-labelledby','options-title');
  menu.innerHTML='<div class="screen-heading"><h2 id="options-title">Menu</h2><button type="button" class="close" data-options-close aria-label="Chiudi menu">Chiudi</button></div><nav aria-label="Impostazioni"><ul class="options-list"><li><button type="button" class="options-item" data-options-db><span>Database<span class="notifica-testo"> · aggiornamento disponibile</span></span><span aria-hidden="true">›</span></button></li><li><button type="button" class="options-item" data-options-guida><span>Guida</span><span aria-hidden="true">›</span></button></li><li><button type="button" class="options-item" data-options-screen><span>Schermo</span><span aria-hidden="true">›</span></button></li></ul></nav>';
  document.body.append(menu);
  document.querySelectorAll('header.head .tools:not(#vLoco)').forEach(tools=>{
    const button=document.createElement('button'); button.type='button';button.className='chip screen-more';button.textContent='⋮';button.setAttribute('aria-label','Apri menu');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded','false');
    button.addEventListener('click',()=>{
      opener=button;menu.showModal();button.setAttribute('aria-expanded','true');
      const r=button.getBoundingClientRect();
      menu.style.left=Math.max(12,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-12))+'px';
      menu.style.top=Math.max(12,Math.min(r.bottom+8,innerHeight-menu.offsetHeight-12))+'px';
    });tools.append(button);
  });
  menu.querySelector('[data-options-close]').addEventListener('click',()=>menu.close());
  menu.querySelector('[data-options-screen]').addEventListener('click',()=>{menu.close();dialog.showModal();});
  menu.querySelector('[data-options-db]').addEventListener('click',()=>{menu.close();if(typeof apriDatabase==='function')apriDatabase();});
  menu.querySelector('[data-options-guida]').addEventListener('click',()=>{menu.close();if(typeof apriGuida==='function')apriGuida();});
  menu.addEventListener('close',()=>{opener?.setAttribute('aria-expanded','false');if(!dialog.open)opener?.focus();});
  menu.addEventListener('click',e=>{if(e.target===menu){const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)menu.close();}});
  dialog.querySelector('[data-screen-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>opener?.focus());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.querySelectorAll('[name="screen-layout"]').forEach(input=>input.addEventListener('change',()=>{prefs.layout=input.value;root.dataset.screen=prefs.layout;save();}));
  let applied=false;
  apply.addEventListener('click',async()=>{
    const scelta=dialog.querySelector('[name="screen-orientation"]:checked').value;
    let entered=false;
    apply.disabled=true;orientationInputs.forEach(input=>input.disabled=true);
    try {
      if(typeof screen.orientation?.lock!=='function') throw new Error('unsupported');
      if(!document.fullscreenElement){
        if(typeof root.requestFullscreen!=='function') throw new Error('unsupported');
        await root.requestFullscreen();entered=true;
      }
      await screen.orientation.lock(scelta);
      prefs.orientation=scelta;prefs.rotate=scelta==='any';save();applied=true;
      result.textContent=scelta==='any'?'Rotazione automatica applicata in schermo intero. Gira il dispositivo.':(scelta==='portrait'?'Orientamento verticale applicato.':'Orientamento orizzontale applicato.');
    } catch(err) {
      if(entered && document.fullscreenElement){try{await document.exitFullscreen();}catch(_){}}
      result.textContent=err.message==='unsupported'?'Questo browser non offre il controllo dell’orientamento. La scelta non è stata applicata.':'Chrome non ha consentito il cambio di orientamento. La scelta non è stata salvata; riprova da Applica orientamento.';
    } finally {
      apply.disabled=false;orientationInputs.forEach(input=>input.disabled=false);
      exitFull.hidden=!document.fullscreenElement;
    }
  });
  exitFull.addEventListener('click',async()=>{
    try {await document.exitFullscreen();}
    catch(_){result.textContent='Usa il comando del browser per uscire da schermo intero.';}
  });
  document.addEventListener('fullscreenchange',()=>{
    exitFull.hidden=!document.fullscreenElement;
    if(!document.fullscreenElement && applied){
      try{screen.orientation?.unlock?.();}catch(_){}
      applied=false;result.textContent='Schermo intero terminato: l’orientamento torna al controllo del dispositivo. Premi Applica per riapplicare la scelta.';
    }
  });
  // Nessun tentativo di blocco all’avvio: Chrome richiede un gesto esplicito dell’utente.
  try{screen.orientation?.unlock?.();}catch(_){}
})();

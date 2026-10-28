/* Preferenze di visualizzazione; nessun cambiamento ai dati del viaggio. */
(() => {
  const root = document.documentElement;
  let prefs = { layout: 'phone', rotate: true };
  try { const saved = JSON.parse(localStorage.getItem('adc-screen') || '{}'); if (['phone','tablet'].includes(saved.layout)) prefs.layout=saved.layout; if(typeof saved.rotate==='boolean') prefs.rotate=saved.rotate; } catch (_) {}
  const save = () => { try {localStorage.setItem('adc-screen',JSON.stringify(prefs));} catch (_) {} };
  root.dataset.screen=prefs.layout;
  const dialog=document.createElement('dialog');
  dialog.className='screen-dialog';
  dialog.setAttribute('aria-labelledby','screen-title');
  dialog.innerHTML='<div class="screen-heading"><h2 id="screen-title">Schermo</h2><button type="button" class="close" data-screen-close aria-label="Chiudi impostazioni schermo">Chiudi</button></div><p class="note">Scegli come visualizzare la scheda treno.</p><fieldset><legend>Formato schermo</legend><label class="screen-choice"><input type="radio" name="screen-layout" value="phone"><span><b>Telefono</b><small>Vista compatta, adatta a uno schermo piccolo.</small></span></label><label class="screen-choice"><input type="radio" name="screen-layout" value="tablet"><span><b>Tablet</b><small>Più spazio per località, colonne e dettagli.</small></span></label></fieldset><label class="screen-choice"><input type="checkbox" id="screen-rotate"><span><b>Rotazione automatica</b><small>Adatta la scheda quando giri il dispositivo.</small></span></label><p class="note" id="screen-result" role="status"></p>';
  document.body.append(dialog);
  const result=dialog.querySelector('#screen-result');
  const rotate=dialog.querySelector('#screen-rotate');
  rotate.checked=prefs.rotate;
  dialog.querySelector('[value="'+prefs.layout+'"]').checked=true;
  result.textContent='Per ruotare lo schermo, abilita anche la rotazione automatica nelle impostazioni del telefono o tablet.';
  let opener;
  document.querySelectorAll('header.head .tools:not(#vLoco)').forEach(tools=>{
    const button=document.createElement('button'); button.type='button';button.className='chip screen-more';button.textContent='⋮';button.setAttribute('aria-label','Menu schermo');button.setAttribute('aria-haspopup','dialog');
    button.addEventListener('click',()=>{opener=button;dialog.showModal();});tools.append(button);
  });
  dialog.querySelector('[data-screen-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>opener?.focus());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.querySelectorAll('[name="screen-layout"]').forEach(input=>input.addEventListener('change',()=>{prefs.layout=input.value;root.dataset.screen=prefs.layout;save();}));
  rotate.addEventListener('change',async()=>{
    if(rotate.checked){
      try {screen.orientation?.unlock?.();prefs.rotate=true;save();result.textContent='Rotazione automatica attiva. Se lo schermo resta fermo, controlla il blocco rotazione del dispositivo.';}
      catch(_){rotate.checked=prefs.rotate;result.textContent='Il browser non consente di cambiare orientamento. Usa le impostazioni del dispositivo.';}
    }else{
      try {if(!screen.orientation?.lock)throw Error();await screen.orientation.lock('portrait');prefs.rotate=false;save();result.textContent='Orientamento verticale bloccato.';}
      catch(_){rotate.checked=true;prefs.rotate=true;save();result.textContent='Il blocco verticale non è disponibile in questo browser. Puoi bloccare la rotazione dalle impostazioni del dispositivo.';}
    }
  });
  if(prefs.rotate){try{screen.orientation?.unlock?.();}catch(_){}}
  else if(screen.orientation?.lock){screen.orientation.lock('portrait').catch(()=>{prefs.rotate=true;rotate.checked=true;save();});}
  else {prefs.rotate=true;rotate.checked=true;save();}
})();

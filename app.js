import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getDatabase, ref, get, set, update, remove, onValue, runTransaction, onDisconnect, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {firebaseConfig,FIREBASE_LIMIT_CONFIRMED} from './firebase-config.js';
import {SAME_QUESTIONS,HOT_CATEGORIES,IMPOSTER_WORDS,JEOPARDY_BOARDS,WEAK_QUESTIONS} from './game-data.js';
import {normalizeAnswer,sameScores,hotPoints,averagePoints,jeopardyPoints,winnerOfVotes,publicPlayers,validTeams,nextAlive} from './engine.js';

const GAME_INFO={same:{name:'3 Dumme, 1 Gedanke',icon:'🧠',desc:'Den gleichen Gedanken treffen'},hot:{name:'Hotzone',icon:'🎯',desc:'Geheime Zahlen und gute Hinweise'},imp:{name:'Imposter',icon:'🕵️',desc:'Täuschen, verdächtigen, abstimmen'},jeo:{name:'Jeopardy',icon:'🏆',desc:'50 Fragen, zwei Boards, Buzzer'},weak:{name:'Der Dümmste fliegt',icon:'💔',desc:'Wissensduell mit drei Leben'}};
const app=initializeApp(firebaseConfig);const auth=getAuth(app);const db=getDatabase(app);
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>C.user?.uid||'';
const path=(...p)=>ref(db,p.join('/'));
const makeRid=(prefix='r')=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
const randomInt=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
const shuffle=(arr)=>[...arr].sort(()=>0.5-Math.random());
const cap=(n,min,max)=>Math.min(max,Math.max(min,Number(n)||0));
const humanTimer=(ms)=>{let n=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`};
const C={user:null,screen:'loading',form:{name:'',avatar:Math.floor(Math.random()*80),joinCode:new URLSearchParams(location.search).get('room')||''},room:null,meta:null,players:{},state:null,privateData:null,acks:{},answers:{},draft:{},reveals:{},connected:false,error:'',pending:false,watchers:[],roundWatchers:[],roundKey:'',actionWatcher:null,submitted:new Set(),processing:new Set(),advancing:false,groupOverrides:{},toastTimer:null,clockTimer:null,renderBusy:false,lowConnectivity:false};

function toast(msg){const el=$('toast');if(!el)return;el.textContent=String(msg);el.classList.add('open');clearTimeout(C.toastTimer);C.toastTimer=setTimeout(()=>el.classList.remove('open'),4400)}
function errorMsg(e){const code=String(e?.code||'');console.error(e);if(FIREBASE_LIMIT_CONFIRMED)return 'Timo hat sein kostenloses Limit für die Website erreicht. Ihr könnt erst nach dem Zurücksetzen des Kontingents weiterspielen.';
if(code.includes('permission-denied'))return 'Zugriff verweigert: Bitte die mitgelieferten Firebase-Datenbankregeln veröffentlichen.';
if(code.includes('network')||code.includes('unavailable')||code.includes('disconnected'))return 'Der Spielserver ist gerade nicht erreichbar. Prüfe deine Internetverbindung.';
return (e?.message||'Ein unbekannter Fehler ist aufgetreten.').slice(0,260)}
function activePlayers(){return publicPlayers(C.players).filter(p=>p.online!==false)}
function allPlayers(){return publicPlayers(C.players)}
function member(id){return C.players[id]||{name:'Unbekannt',avatar:0,team:0}}
function me(){return member(uid())}
function host(){return !!C.meta&&C.meta.hostUid===uid()}
function labelName(id){return member(id).name||'Unbekannt'}
function teamKey(id){return Number(C.state?.setup?.teamCount)>0?'team'+Number(member(id).team):id}
function maxRounds(){return Number(C.state?.setup?.rounds||10)}
function timeLimit(){return Number(C.state?.setup?.timer||0)}
function deadline(){return timeLimit()>0?Date.now()+timeLimit()*1000:0}
function pickFrom(list,used=[]){const options=list.map((_,i)=>i).filter(i=>!used.includes(i));const nums=options.length?options:list.map((_,i)=>i);return nums[randomInt(0,nums.length-1)]}
const defaultSetup={teamCount:0,rounds:10,timer:30,imposters:1};

// Deterministic, self-contained SVG portraits: 80 illustrated heads, no image upload or hotlink.
function avatarSvg(index=0){const id=cap(index,0,79),skin=['#f8c9ab','#de9a76','#a96d50','#704b3b','#eab398','#ba8167','#8f5c48','#f2d1ad'][id%8],hair=['#272236','#50382a','#9b5137','#d6aa6b','#151c2c','#955b2c','#673e63','#cf7c4b'][Math.floor(id/8)%8],bg=['#2d6687','#63509a','#2e836c','#b16063','#745a9c','#956c38','#376b7a','#774f5c'][Math.floor(id/10)%8],v=id%10,glasses=v===4||v===8,beard=v===2||v===7,fringe=v===1||v===5||v===9;
return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="17" fill="${bg}"/><circle cx="53" cy="11" r="19" fill="#ffffff10"/><path d="M6 63 Q9 48 23 46 L42 46 Q55 48 58 63Z" fill="${['#294061','#5a3e68','#324b58','#583f47'][id%4]}"/><path d="M25 43h14v12H25z" fill="${skin}"/><ellipse cx="32" cy="28" rx="18" ry="21" fill="${skin}"/><ellipse cx="14" cy="29" rx="3" ry="6" fill="${skin}"/><ellipse cx="50" cy="29" rx="3" ry="6" fill="${skin}"/><path d="M14 27 Q10 6 26 8 Q42 0 51 16 L49 27 Q47 16 42 15 Q28 19 21 15 Q17 18 14 27Z" fill="${hair}"/>${fringe?`<path d="M17 13Q31 7 46 14Q42 26 28 23L20 20z" fill="${hair}"/>`:''}${v===6?`<circle cx="32" cy="7" r="9" fill="${hair}"/>`:''}<path d="M23 28h5m8 0h5" stroke="#2e2630" stroke-width="2.3" stroke-linecap="round"/>${glasses?'<path d="M21 25h11v8H21z M34 25h11v8H34z M32 28h2" stroke="#22324c" stroke-width="1.4" fill="none"/>':''}${beard?`<path d="M22 39Q32 52 42 39Q39 49 32 51Q25 49 22 39Z" fill="${hair}"/>`:''}<path d="M31 30l-1 7h4" stroke="#b17a61" stroke-width="1.3" fill="none"/><path d="M27 41 Q32 ${v%2===0?'45':'39'} 37 41" stroke="#8f4b4e" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`}
function avatar(index,cls=''){return `<span class="avatar ${cls}">${avatarSvg(index)}</span>`}
function playerBadge(p){return `<div class="member ${p.uid===uid()?'self':''} ${p.online===false?'offline':''}">${avatar(p.avatar,'sm')}<div class="grow"><div class="mname">${esc(p.name)} ${p.uid===C.meta?.hostUid?'★':''}</div><small>${p.uid===uid()?'Du · ':''}${p.online===false?'Offline':(p.ready?'Bereit':'Nicht bereit')}${Number(p.team)>0?' · Team '+p.team:''}</small></div><span class="ready-dot ${p.ready?'yes':''}"></span></div>`}
function header(){const con=C.connected?'Verbunden':'Offline';return `<header class="site-header"><div class="logo"><span class="logo-mark">🎮</span><span>SPIELE<em>ABEND</em></span></div><div class="header-actions"><span class="micro-pill"><span class="status-dot ${C.connected?'on':''}"></span>${con}</span>${C.room?`<span class="micro-pill">Raum ${esc(C.room)}</span>`:''}<button class="btn ghost small" data-action="fullscreen" title="Vollbild">⛶ Vollbild</button></div></header>`}
function shell(content){$('app').innerHTML=`<main class="app-shell">${header()}${content}<footer class="footer">Spieleabend · Gemeinsame Spiele, keine Installation · Powered by Firebase & GitHub Pages</footer></main>`}
function hero(title,sub){return `<div class="hero"><div class="kicker">DEIN ONLINE-SPIELEABEND</div><h1>${title}</h1><p>${sub}</p></div>`}
function button(action,text,cls='secondary',extra=''){return `<button type="button" class="btn ${cls}" data-action="${esc(action)}" ${extra}>${text}</button>`}
function hostOnly(){return host()?'<span class="chip green">★ Du bist Host</span>':'<span class="chip">Gast</span>'}
function gameChip(){return GAME_INFO[C.state?.game]?.name||'Spieleabend'}
function scoreEntries(){const s=C.state?.scores||{},tc=Number(C.state?.setup?.teamCount||0);if(tc&&C.state?.game!=='imp'&&C.state?.game!=='jeo'&&C.state?.game!=='weak')return Array.from({length:tc},(_,i)=>({id:String(i+1),name:'Team '+(i+1),score:Number(s['team'+(i+1)]||0),avatar:i+5,team:true})).sort((a,b)=>b.score-a.score);
return allPlayers().map(p=>({id:p.uid,name:p.name,score:Number(s[p.uid]||0),avatar:p.avatar})).sort((a,b)=>b.score-a.score)}
function scoreboard(){const entries=scoreEntries();if(!entries.length)return '';const best=entries[0].score;return `<div class="score-row">${entries.map(e=>`<div class="score ${e.score===best&&e.score>0?'leading':''}">${e.team?'<span style="font-size:1.7rem">🏳️</span>':avatar(e.avatar,'sm')}<div class="grow" style="min-width:0"><div class="score-name">${esc(e.name)}</div><div class="score-value">${e.score}</div></div></div>`).join('')}</div>`}
function controlsToLobby(){return host()?button('back-lobby','↩ Zur Lobby','ghost small'):''}
function timerHtml(){return C.state?.deadline?`<div class="timer" id="countdown">⏱ ${humanTimer(C.state.deadline-Date.now())}</div>`:''}
function showTop(){const s=C.state;return `<div class="show-top"><div><div class="eyebrow">${esc(gameChip())}</div><div class="show-title">${esc(GAME_INFO[s.game]?.name||'Spieleabend')}</div></div><div class="flex">${timerHtml()}${controlsToLobby()}</div></div>`}
function banner(txt){return `<div class="warning">${esc(txt)}</div>`}
function note(txt){return `<p class="note">${txt}</p>`}
function renderLoading(){shell(`<div class="hero"><h1>Verbindung wird hergestellt</h1><div class="loading-inline"><span class="spinner"></span>Firebase-Anmeldung läuft …</div></div>`)}
function renderIdentity(){shell(hero('DEIN <span>SPIELEABEND.</span>','Wähle einen Namen und deinen Avatar. Kein Passwort, kein Konto.')+`<section class="panel panel-pad intro-panel"><div class="stack intro-fields"><div class="field"><label for="player-name">Dein Spielername</label><input class="input" id="player-name" data-draft="name" value="${esc(C.form.name)}" maxlength="22" autocomplete="off" placeholder="Wie heißt du?"></div><div class="field"><span class="label">Dein Avatar · 80 Köpfe zur Auswahl</span><div class="avatar-grid">${Array.from({length:80},(_,i)=>`<button class="avatar-option ${i===C.form.avatar?'selected':''}" data-action="choose-avatar" data-id="${i}" title="Avatar ${i+1}">${avatar(i)}</button>`).join('')}</div></div>${button('profile-next','Weiter →','primary block')}</div></section>`)}
function renderEntry(){shell(hero('LOS <span>GEHT’S!</span>','Wie möchtest du heute mitspielen?')+`<section class="panel panel-pad intro-panel"><div class="flex" style="margin-bottom:23px">${avatar(C.form.avatar,'big')}<div><b style="font-size:1.3rem">${esc(C.form.name)}</b><div class="muted small">Dein Spielerprofil für diese Sitzung</div>${button('back-profile','Avatar ändern','ghost small')}</div></div><div class="split-choice"><button class="choice-card" data-action="create-room"><span>✨</span><b>Raum erstellen</b><small>Du startest als Host und erhältst einen sechsstelligen Code.</small></button><button class="choice-card" data-action="focus-join"><span>🔑</span><b>Raum beitreten</b><small>Gemeinsam mit deinen Freunden per Raumcode spielen.</small></button></div><div class="divider"></div><div class="field"><label for="join-code">Sechsstelliger Raumcode</label><div class="flex"><input class="input grow" id="join-code" data-draft="joinCode" value="${esc(C.form.joinCode)}" inputmode="numeric" maxlength="6" placeholder="z. B. 482913" autocomplete="one-time-code" style="max-width:300px">${button('join-room','Beitreten','primary')}</div></div></section>`)}
function renderLobby(){const s=C.state||{},ps=allPlayers(),isH=host(),setup={...defaultSetup,...(s.setup||{})},game=s.game||'same',teamCount=Number(setup.teamCount)||0,teamsAvailable=Math.floor(ps.length/2),minCount=game==='jeo'||game==='weak'?3:3,maxImposters=Math.max(1,ps.length-2),ready=ps.filter(p=>p.ready).length;let selectedMsg='';if(ps.length<3)selectedMsg='Mindestens 3 Personen benötigt.';else if(ps.some(p=>p.online===false))selectedMsg='Mindestens eine Person ist offline. Bitte erneut verbinden oder aus der Lobby entfernen.';else if(ready!==ps.length)selectedMsg=`${ps.length-ready} Person(en) noch nicht bereit.`;else if(teamCount&&!validTeams(ps,teamCount))selectedMsg='Alle Teams benötigen mindestens zwei Personen.';
const teamCapable=game==='same'||game==='hot';
const readyBtn=button('toggle-ready',me().ready?'✓ Nicht mehr bereit':'✓ Ich bin bereit',me().ready?'ghost':'primary');
const setupHTML=`<section class="panel panel-pad stack"><div class="section-head"><div><div class="eyebrow">SPIELEAUSWAHL</div><h2 style="margin:5px 0 0">Was spielen wir?</h2></div>${isH?'<span class="chip green">Host-Auswahl</span>':'<span class="chip">Der Host wählt</span>'}</div><div class="mode-list">${Object.entries(GAME_INFO).map(([id,g])=>`<button class="game-card ${game===id?'selected':''}" data-action="choose-game" data-id="${id}" ${!isH?'disabled':''}><span>${g.icon}</span><span>${esc(g.name)}</span></button>`).join('')}</div><div class="divider"></div><div class="inline-fields">${teamCapable?`<div class="field"><label>Teammodus</label><select class="select" data-setup="teamCount" ${!isH?'disabled':''}><option value="0" ${!teamCount?'selected':''}>Jeder gegen jeden</option>${Array.from({length:Math.max(0,teamsAvailable-1)},(_,i)=>i+2).map(n=>`<option value="${n}" ${teamCount===n?'selected':''}>${n} Teams</option>`).join('')}</select></div>`:''}<div class="field"><label>${game==='hot'?'Durchgänge pro Person/Team':game==='jeo'?'Jeopardy-Boards':game==='weak'?'Leben je Person':'Fragen / Runden'}</label><input type="number" class="input" min="1" max="${game==='same'?100:game==='hot'?15:20}" data-setup="rounds" value="${game==='jeo'?2:game==='weak'?3:setup.rounds}" ${!isH||game==='jeo'||game==='weak'?'disabled':''}></div><div class="field"><label>Zeit pro Antwort (0 = offen)</label><input type="number" class="input" min="0" max="300" data-setup="timer" value="${setup.timer}" ${!isH?'disabled':''}></div>${game==='imp'?`<div class="field"><label>Anzahl der Imposter</label><input type="number" class="input" min="1" max="${maxImposters}" data-setup="imposters" value="${Math.min(maxImposters,setup.imposters)}" ${!isH?'disabled':''}></div>`:''}</div>${game==='hot'?note('Ein Hotzone-Durchgang bedeutet: Jede Person bzw. jedes Team ist einmal Hinweisgeber.') :game==='jeo'?note('Zwei Boards mit je 25 Fragen, im zweiten Board doppelte Punktzahl.') : game==='weak'?note('Jede aktive Person beantwortet zweimal Fragen; nach jeder Runde verliert eine Person ein Leben.') :''}${teamCapable&&teamCount?renderTeamChoice(ps,teamCount):''}<div class="divider"></div>${isH?`<div class="stack">${selectedMsg?banner(selectedMsg):''}${button('start-game','Spiel starten →','primary block',selectedMsg?'disabled':'')}${note('Du spielst als Host normal mit. Der Raum bleibt beim Spielwechsel erhalten.')}</div>`:`<div class="panel-soft center"><b>${esc(GAME_INFO[game].name)}</b><br><small>Der Host konfiguriert die Partie. Stelle dich auf bereit!</small></div>`}</section>`;
shell(`<div class="lobby-wrap"><section class="panel panel-pad stack"><div class="section-head"><div><div class="eyebrow">DEINE LOBBY</div><h2 style="margin:4px 0">Gemeinsam spielen</h2></div>${hostOnly()}</div><div class="panel-soft"><div class="step-label">RAUMCODE</div><div class="room-code">${esc(C.room)}</div><div class="flex">${button('copy-code','⧉ Code kopieren','ghost small')}${button('copy-link','↗ Einladungslink','ghost small')}${button('leave-room','Raum verlassen','ghost small')}</div></div><div class="section-head"><h3 style="margin:0">Mitspielende <span class="muted">${ps.length}/20</span></h3><span class="chip ${ready===ps.length?'green':''}">${ready}/${ps.length} bereit</span></div><div class="lobby-players">${ps.map(playerBadge).join('')}</div>${readyBtn}${host()&&ps.some(p=>p.online===false)?`<div class="panel-soft stack"><b>Offline-Mitglieder entfernen</b>${ps.filter(p=>p.online===false).map(p=>button('kick-player','✕ '+esc(p.name)+' entfernen','ghost small',`data-id="${esc(p.uid)}"`)).join('')}</div>`:''}${!host()&&C.players[C.meta?.hostUid]?.online===false?button('take-host','Hostrolle übernehmen','gold'):''}${host()?`<div class="field"><label>Hostrolle freiwillig übertragen</label><div class="flex"><select id="new-host" class="select grow"><option value="">Person auswählen</option>${ps.filter(p=>p.uid!==uid()).map(p=>`<option value="${esc(p.uid)}">${esc(p.name)}</option>`).join('')}</select>${button('transfer-host','Übertragen','ghost small')}</div></div>`:''}</section>${setupHTML}</div>`)}
function renderTeamChoice(ps,tc){return `<div class="stack"><div class="section-head" style="margin:0"><div class="eyebrow">EIGENE TEAMS WÄHLEN</div><small>Mindestens 2 Personen pro Team</small></div><div class="team-grid">${Array.from({length:tc},(_,i)=>i+1).map(t=>{const members=ps.filter(p=>Number(p.team)===t);return `<div class="team-card ${Number(me().team)===t?'selected':''}"><div class="team-bar"><b>Team ${t}</b><span class="chip ${members.length>=2?'green':''}">${members.length} Personen</span></div><button class="btn small ${Number(me().team)===t?'primary':'secondary'} block" data-action="choose-team" data-id="${t}">${Number(me().team)===t?'✓ Dein Team':'Team beitreten'}</button><div class="team-members">${members.map(p=>`<span>${esc(p.name)}</span>`).join('')}</div></div>`}).join('')}</div></div>`}
function renderError(){shell(hero('VERBINDUNG <span>FEHLER.</span>','Die Spieleplattform konnte nicht gestartet werden.')+`<section class="panel panel-pad intro-panel center">${banner(C.error||'Verbindung fehlgeschlagen')}${button('reload','Erneut verbinden','primary')}</section>`)}
function renderGame(){const s=C.state;const body=s.phase==='finished'?renderWinner():s.game==='same'?renderSame():s.game==='hot'?renderHot():s.game==='imp'?renderImposter():s.game==='jeo'?renderJeopardy():renderWeak();shell(`${showTop()}${scoreboard()}${body}`)}
function renderWinner(){const scores=scoreEntries();return `<section class="panel winner"><div class="crown">🏆</div><div class="eyebrow" style="justify-content:center">SPIEL BEENDET</div><h2>Glückwunsch!</h2><div class="winner-card">${scores.map((e,i)=>`<div class="winner-row"><div class="flex">${i===0?'<span style="font-size:1.5rem">👑</span>':''}${e.team?'🏳️':avatar(e.avatar,'sm')}<b>${i+1}. ${esc(e.name)}</b></div><b>${e.score} Punkte</b></div>`).join('')}</div><div class="controls-bar">${host()?button('back-lobby','Zur Spieleauswahl','primary'):''}</div></section>`}
function render(){if(C.screen==='loading')return renderLoading();if(C.screen==='error')return renderError();if(C.screen==='identity')return renderIdentity();if(C.screen==='entry')return renderEntry();if(!C.room||!C.state||!C.meta)return renderLoading();if(C.state.phase==='lobby')return renderLobby();return renderGame()}

function readyCount(expected){return expected.filter(id=>!!C.acks[id]).length}
function submitted(){return !!C.acks[uid()]||C.submitted.has(C.state?.rid)}
function answerForm(placeholder,max=120){return `<div class="panel panel-pad stack" style="max-width:770px;margin:18px auto"><div class="field"><label>Deine geheime Antwort</label><input class="input" id="answer-input" data-draft="${esc(C.state.rid)}" maxlength="${max}" placeholder="${esc(placeholder)}" value="${esc(C.draft[C.state.rid]||'')}" autocomplete="off"></div>${button('submit-text','Antwort abschicken','primary block')}</div>`}
function renderSame(){const s=C.state,ps=allPlayers(),participants=s.participants||[],tc=Number(s.setup?.teamCount||0),expected=participants.map(id=>id),done=readyCount(expected),isAnswer=s.phase==='same-answer',isReveal=s.phase==='same-reveal',isResult=s.phase==='same-result';const scoring=sameScores(ps.filter(p=>participants.includes(p.uid)),C.answers,tc,(isResult?s.overrides:C.groupOverrides)||{});
let body=`<section class="panel question-panel"><div class="eyebrow">FRAGE ${s.round} VON ${s.setup.rounds}</div><h2>${esc(s.question)}</h2><p>${isAnswer?'Gleiche Antworten bringen Punkte. Sprich dich nicht mit den anderen ab.':isReveal?'Alle Antworten sind aufgedeckt. Die Gruppierung kann noch korrigiert werden.':'So viele Punkte habt ihr in dieser Runde gesammelt.'}</p>${isAnswer?`<div class="chip green">${done}/${expected.length} Antworten eingegangen</div>`:''}</section>`;
if(isAnswer){if(participants.includes(uid())&&!submitted())body+=answerForm('Ein Wort oder kurzer Begriff …');else body+=`<div class="panel-soft center" style="margin-top:14px">${submitted()?'✅ Antwort eingereicht – die anderen sind noch dran.':'Du schaust gerade zu.'}</div>`;if(host())body+=`<div class="controls-bar">${button('force-reveal','Antworten jetzt aufdecken','ghost small')}</div>`}
if(isReveal||isResult){body+=`<section class="panel panel-pad" style="margin-top:14px"><div class="section-head"><h3>Antworten & Übereinstimmungen</h3><span class="chip">${participants.length} Spieler</span></div><div class="answer-list">${participants.map(id=>{const p=member(id),ans=C.answers[id]||'',group=(isResult?s.overrides?.[id]:C.groupOverrides[id])??ans;return `<div class="answer-item"><div class="answer-person">${avatar(p.avatar,'sm')}<div><b>${esc(p.name)}</b><small>${tc?'Team '+p.team+' · ':''}${ans?'':'Keine Antwort'}</small></div></div><span class="answer-word">${esc(ans||'—')}</span>${host()&&isReveal?`<div class="field"><label>Gruppieren als</label><input class="input" data-group="${esc(id)}" value="${esc(group)}" placeholder="z. B. Handy"></div>`:`<span class="chip">${esc(normalizeAnswer(group)||'—')}</span>`}</div>`}).join('')}</div>${isReveal?`<div class="controls-bar">${host()?button('same-score','Gruppierung bestätigen & Punkte vergeben','primary'):''}</div>`:`<div class="divider"></div><div class="result-group">${tc?Object.entries(s.awards||{}).map(([k,v])=>`<div class="result-card"><b>Team ${esc(k.replace('team',''))}</b><span class="points">+${Number(v)}</span></div>`).join(''):participants.map(id=>`<div class="result-card"><b>${esc(labelName(id))}</b><span class="points">+${Number(s.awards?.[id]||0)}</span></div>`).join('')}</div><div class="controls-bar">${host()?button('same-next',s.round>=s.setup.rounds?'Siegerehrung':'Nächste Frage →','primary'):''}</div>`}</section>`}
return body}
function renderHot(){const s=C.state,tc=Number(s.setup?.teamCount||0),giver=s.giverUid,imGiver=giver===uid(),guessAllowed=tc?uid()===s.speakerUid:(s.participants||[]).includes(uid())&&!imGiver,actorKey=teamKey(uid()),used=s.jokersUsed?.[actorKey]||{},risk=!!s.riskActive?.[actorKey],cut=s.cutAllowed?.[actorKey];const turns=(s.setup.rounds||1)*(tc||s.participants.length),canJoker=imGiver||guessAllowed;
const phase=s.phase;
let h=`<section class="panel question-panel"><div class="eyebrow">RUNDE ${s.round} VON ${turns}</div><div class="chip">Hinweisgeber: ${esc(labelName(giver))}${tc?' · Team '+s.activeTeam:''}</div><h2>${esc(s.category||'Kategorie')}</h2>${phase==='hot-clue'?`<p>Wie gut passt dein Hinweis auf einer Skala von <b>1 (schlecht)</b> bis <b>10 (perfekt)</b>?</p>`:`<p class="subtle">Hinweis: <strong>${esc(s.clue||'…')}</strong></p>`}${phase==='hot-result'?`<div class="tagline">GEHEIME ZAHL: ${s.target}</div>`:''}</section>`;
if(phase==='hot-clue'){
  h+=`<div class="panel panel-pad center" style="margin-top:13px">${imGiver?`<div class="eyebrow" style="justify-content:center">NUR FÜR DICH</div><h2 style="font-size:4rem;margin:12px">${C.privateData?.target??'…'}</h2><p>Gib einen Hinweis zur Kategorie, ohne die Zahl zu verraten.</p>${submitted()?'<div class="chip green">✓ Hinweis eingereicht</div>':answerForm('z. B. Halloumi',80)}`:`<h3>${esc(labelName(giver))} denkt sich einen Hinweis aus …</h3><p class="muted">Die geheime Zahl sieht nur der Hinweisgeber.</p>`}${imGiver&&!used.secondChance?button('hot-second','↻ Second Chance · Kategorie wechseln','secondary small'):''}</div>`;
  if(host())h+=`<div class="controls-bar">${button('hot-force-clue','Ohne Hinweis fortfahren','ghost small')}</div>`;
}
if(phase==='hot-guess'){
  const options=Array.from({length:10},(_,i)=>i+1),guess=C.draft[s.rid]||'';
  h+=`<section class="panel panel-pad stack" style="margin-top:13px"><div class="section-head"><h3>Welche Zahl ist gemeint?</h3><span class="chip">${readyCount(s.eligible||[])}/${(s.eligible||[]).length} Tipps</span></div><div class="number-grid">${options.map(n=>`<button class="num ${String(guess)===String(n)?'chosen':''} ${cut&&!cut.includes(n)?'eliminated':''}" data-action="choose-number" data-id="${n}" ${!guessAllowed||submitted()||(cut&&!cut.includes(n))?'disabled':''}>${n}</button>`).join('')}</div>${guessAllowed?submitted()?'<div class="panel-soft center">✅ Tipp abgegeben.</div>':`<div class="center"><p>Dein Tipp: <b>${esc(guess||'noch keiner')}</b></p>${button('submit-number','Zahl verbindlich abgeben','primary',!guess?'disabled':'')}</div>`:`<div class="center muted">${imGiver?'Du hast den Hinweis gegeben und darfst nicht mitraten.':tc?'Dein Teamsprecher ist '+esc(labelName(s.speakerUid))+'.':'Du bist Zuschauer dieser Runde.'}</div>`}${canJoker&&guessAllowed&&!submitted()?`<div class="divider"></div><div class="joker-row">${!used.risk?button('hot-risk',risk?'✓ Risk aktiviert':'🔥 Risk ×2',risk?'primary small':'secondary small'):''}${!used.cut?button('hot-cut',cut?'✓ Cut aktiviert':'✂ Cut · 4 Zahlen weg',cut?'primary small':'secondary small'):''}</div>`:''}${host()?`<div class="controls-bar">${button('hot-force-guess','Tipps auflösen','ghost small')}</div>`:''}</section>`;
}
if(phase==='hot-result'){
  h+=`<section class="panel panel-pad stack" style="margin-top:14px"><div class="eyebrow">DIE AUFLÖSUNG</div><div class="number-grid">${Array.from({length:10},(_,i)=>i+1).map(n=>`<div class="num ${n===s.target?'target':''}">${n}</div>`).join('')}</div><div class="result-group">${Object.entries(s.breakdown||{}).map(([id,r])=>`<div class="result-card"><div><b>${id.startsWith('team')?'Team '+id.slice(4):esc(labelName(id))}</b><div class="muted small">${r.guess==='—'?'Kein Tipp':'Tipp '+esc(r.guess)}${r.risk?' · Risk ×2':''}</div></div><div class="points">${r.points>=0?'+':''}${r.points}</div></div>`).join('')}</div>${!tc?`<div class="panel-soft">Hinweisgeber ${esc(labelName(giver))}: <b>${s.giverPoints>=0?'+':''}${s.giverPoints} Punkte</b> (gerundeter Durchschnitt)</div>`:''}<div class="controls-bar">${host()?button('hot-next',s.round>=turns?'Siegerehrung':'Nächster Hinweisgeber →','primary'):''}</div></section>`;
}
return h}
function renderImposter(){const s=C.state,phase=s.phase,im= C.privateData?.role==='imposter',meEliminated=!!s.eliminated?.[uid()],participants=s.participants||[],alive=s.alive||participants;let h=`<section class="panel question-panel"><div class="eyebrow">FALL ${s.round} VON ${s.setup.rounds}</div><h2>${phase==='imp-clue'?'Wer kennt das Wort nicht?':phase==='imp-clues'?'Die Hinweise sind da!':phase==='imp-vote'?'Wer ist der Imposter?':phase==='imp-guess'?'Letzte Chance!':phase==='imp-result'?'Der Fall ist gelöst!':'Diskutiert und stimmt ab!'}</h2>${phase==='imp-result'?`<p>Das geheime Wort war <strong>${esc(s.word)}</strong>.</p>`:phase==='imp-clue'?'<p>Alle geben ihren Hinweis ab. Der Imposter versucht, unauffällig zu bleiben.</p>':'<p>Diskutiert gemeinsam im Sprachchat und findet die Person, die den Begriff nicht kannte.</p>'}</section>`;
if(phase==='imp-clue'){
 h+=`<div class="panel panel-pad stack" style="margin-top:14px"><div class="center">${im?`<div class="chip yellow">🎭 DU BIST IMPOSTER</div><h3>Du kennst das Wort nicht!</h3>`:`<div class="chip green">🔍 NORMALE PERSON</div><h2 style="margin:12px">${esc(C.privateData?.word||'Wort wird verteilt …')}</h2>`}</div>${submitted()?'<div class="panel-soft center">✓ Dein Hinweis ist eingegangen.</div>':answerForm('Ein einzelnes Hinweiswort …',50)}<div class="center muted small">${readyCount(participants)}/${participants.length} Hinweise abgegeben</div>${host()?`<div class="controls-bar">${button('imp-force-clues','Hinweise aufdecken','ghost small')}</div>`:''}</div>`;
}
if(['imp-clues','imp-vote','imp-vote-result','imp-tie','imp-guess','imp-discuss','imp-result'].includes(phase)){
 h+=`<section class="panel panel-pad" style="margin-top:14px"><div class="section-head"><h3>Die Hinweise</h3><span class="chip">${Object.keys(s.hints||{}).length}/${participants.length}</span></div><div class="answer-list">${participants.map(id=>`<div class="answer-item"><div class="answer-person">${avatar(member(id).avatar,'sm')}<b>${esc(labelName(id))}</b></div><strong>${esc(s.hints?.[id]||'—')}</strong></div>`).join('')}</div></section>`;
}
if(phase==='imp-clues'||phase==='imp-discuss'||phase==='imp-tie'){
 let msg=phase==='imp-tie'?`Gleichstand zwischen ${s.tiedCandidates.map(labelName).join(', ')} – es folgt eine Stichwahl.`:phase==='imp-discuss'?'Der enttarnte Imposter ist ausgeschieden. Sucht nun die verbleibenden Imposter.':'Jetzt dürft ihr über die Hinweise diskutieren.';
 h+=`<section class="panel panel-pad center" style="margin-top:14px"><h3>${esc(msg)}</h3><p class="muted">${phase==='imp-tie'?'Nur die gleichauf liegenden Kandidaten stehen zur Wahl.':'Alle aktiven Spieler stimmen auf ihren Geräten geheim ab.'}</p>${host()?button('imp-start-vote',phase==='imp-tie'?'Stichwahl beginnen':'Abstimmung starten','primary'):''}</section>`;
}
if(phase==='imp-vote'){
 const candidates=s.candidates||alive,allowed=!meEliminated&&alive.includes(uid());const vote=C.draft[s.rid]||'',voted=submitted();
 h+=`<section class="panel panel-pad stack" style="margin-top:14px"><div class="section-head"><h3>Geheime Abstimmung</h3><span class="chip">${readyCount(alive)}/${alive.length} Stimmen</span></div>${allowed?voted?'<div class="panel-soft center">✅ Deine Stimme wurde abgegeben. Bis zur Auflösung bleibt sie geheim.</div>':`<div class="vote-grid">${candidates.filter(id=>id!==uid()).map(id=>`<button class="vote-item ${vote===id?'selected':''}" data-action="choose-vote" data-id="${esc(id)}">${avatar(member(id).avatar,'big')}<b>${esc(labelName(id))}</b></button>`).join('')}</div>${button('submit-vote','Stimme abgeben','primary block',!vote?'disabled':'')}`:'<div class="panel-soft center">Du bist nicht mehr abstimmungsberechtigt.</div>'}${host()?`<div class="controls-bar">${button('imp-force-vote','Abstimmung auswerten','ghost small')}</div>`:''}</section>`;
}
if(phase==='imp-vote-result'){
 h+=`<section class="panel panel-pad stack" style="margin-top:14px"><h3>Abstimmungsergebnis</h3><div class="result-group">${Object.entries(s.voteTally||{}).sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<div class="result-card"><b>${esc(labelName(id))}</b><span class="points">${n} Stimmen</span></div>`).join('')}</div><div class="center"><h3>${esc(s.voteMessage||'')}</h3>${host()?button('imp-vote-continue','Weiter →','primary'):''}</div></section>`;
}
if(phase==='imp-guess'){
 const isCandidate=uid()===s.guesser,hasAnswered=submitted();h+=`<section class="panel panel-pad center" style="margin-top:14px"><div class="chip yellow">🎭 Imposter entdeckt: ${esc(labelName(s.guesser))}</div><h3 style="margin-top:20px">Eine letzte Chance: Wie lautet das geheime Wort?</h3>${isCandidate?hasAnswered?'<div class="panel-soft">Deine Wortschätzung ist eingereicht.</div>':answerForm('Geheimes Wort erraten …',80):'<p>Nur der enttarnte Imposter darf das Wort erraten.</p>'}${host()?`<div class="controls-bar">${button('imp-force-guess','Wortschätzung auswerten','ghost small')}</div>`:''}</section>`;
}
if(phase==='imp-result'){
 h+=`<section class="panel panel-pad center stack" style="margin-top:14px"><div class="crown">${s.winnerSide==='citizen'?'🎉':'🎭'}</div><h2>${s.winnerSide==='citizen'?'Normale Spieler gewinnen!':'Die Imposter gewinnen!'}</h2><p>${esc(s.outcome||'')}</p><div class="panel-soft">Imposter: <strong>${(s.imposters||[]).map(labelName).map(esc).join(', ')}</strong></div>${host()?button('imp-next',s.round>=s.setup.rounds?'Siegerehrung':'Nächster Fall →','primary'):''}</section>`;
}
return h}
function renderJeopardy(){const s=C.state,taken=s.taken||{},board=Number(s.board||0),b=JEOPARDY_BOARDS[board]||JEOPARDY_BOARDS[0],v=s.selected?(s.selected.row+1)*100*(board+1):0;
if(s.phase==='jeo-board')return `<section class="panel panel-pad stack"><div class="section-head"><div><div class="eyebrow">${board?'DOUBLE JEOPARDY':'JEOPARDY'}</div><h2 style="margin:5px 0">Board ${board+1} von 2</h2></div><div class="field" style="min-width:180px"><label>Person am Zug</label><select class="select" id="jeo-player" data-jeo-first ${!host()?'disabled':''}>${allPlayers().map(p=>`<option value="${esc(p.uid)}" ${s.activeUid===p.uid?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div></div><div class="jeo-board">${b.map(([cat])=>`<div class="jeo-cat">${esc(cat)}</div>`).join('')}${Array.from({length:5},(_,row)=>b.map((_,col)=>{const k=`${board}-${col}-${row}`;return `<button class="jeo-cell ${taken[k]?'used':''}" data-action="jeo-select" data-col="${col}" data-row="${row}" ${taken[k]||!host()?'disabled':''}>${(row+1)*100*(board+1)}</button>`}).join('')).join('')}</div>${note('Host wählt das Feld, die am Zug befindliche Person und optional genau einen Buzzer. Das zweite Board hat doppelte Werte.')}</section>`;
const q=b[s.selected?.col]?.[1]?.[s.selected?.row]||['Frage fehlt','—'];
return `<section class="panel panel-pad stack"><div class="section-head"><span class="chip yellow">${esc(b[s.selected.col][0])} · ${v} Punkte</span><span class="chip">Board ${board+1}/2</span></div><div class="jeo-question">${esc(q[0])}</div>${s.revealed?`<div class="reveal-answer">${esc(q[1])}</div>`:`<div class="center"><span class="chip">Antwort noch verborgen</span></div>`}${host()?`${!s.revealed?button('jeo-reveal','👁 Lösung aufdecken','primary block'):''}<div class="verdicts"><div class="verdict-box"><h3>Erstantwort · ${esc(labelName(s.firstUid))}</h3><div class="segmented">${['correct','wrong','none'].map((x,i)=>button('jeo-first-verdict',['✓ Richtig','✗ Falsch','– Nichts'][i],s.firstVerdict===x?'primary small':'ghost small',`data-id="${x}"`)).join('')}</div></div><div class="verdict-box"><h3>Buzzer · maximal eine Person</h3><select class="select" id="jeo-challenger" data-jeo-buzzer><option value="">Niemand</option>${allPlayers().filter(p=>p.uid!==s.firstUid).map(p=>`<option value="${esc(p.uid)}" ${s.challengerUid===p.uid?'selected':''}>${esc(p.name)}</option>`).join('')}</select><div class="segmented" style="margin-top:10px">${['correct','wrong','none'].map((x,i)=>button('jeo-buzzer-verdict',['✓ Richtig','✗ Falsch','– Nichts'][i],s.challengerVerdict===x?'primary small':'ghost small',`data-id="${x}" ${!s.challengerUid?'disabled':''}`)).join('')}</div></div></div><div class="panel-soft small">Regel: Erstantwort richtig +${v}, Buzzer 0. Erstantwort falsch −${v/2}; Buzzer richtig +${v}, falsch −${v}. Bei „Nichts“ kein Abzug.</div><div class="controls-bar">${button('jeo-award','Punkte buchen & weiter','gold',!s.revealed?'disabled':'')}</div>`:`<div class="panel-soft center">Der Host sammelt die Antworten und führt die Punktevergabe durch.</div>`}</section>`}
function renderWeak(){const s=C.state,ps=allPlayers(),alive=nextAlive(ps,s.lives),q=WEAK_QUESTIONS[s.questionId]||{q:'Frage folgt',a:'—',info:'',cat:'Wissen'},current=s.weakQueue?.[s.weakIndex];let h=`<div class="life-grid" style="margin-bottom:17px">${ps.map(p=>`<div class="life-card ${(s.lives?.[p.uid]??3)===0?'out':''}">${avatar(p.avatar,'sm')}<b style="margin-left:7px">${esc(p.name)}</b><div class="hearts">${'♥'.repeat(s.lives?.[p.uid]??3)}${'♡'.repeat(3-(s.lives?.[p.uid]??3))}</div><span class="small muted">${s.correctCounts?.[p.uid]||0} richtige Antworten</span></div>`).join('')}</div>`;
if(s.phase==='weak-vote')return h+`<section class="panel panel-pad center stack"><div class="eyebrow" style="justify-content:center">AUSSCHEIDUNGSRUNDE ${s.round}</div><h2>Wer verliert ein Leben?</h2><p>Alle aktiven Spieler haben zwei Fragen erhalten. Der Host wählt jetzt eine Person, die ein Herz verliert.</p><div class="vote-grid">${alive.map(p=>`<button class="vote-item" data-action="weak-eliminate" data-id="${esc(p.uid)}" ${!host()?'disabled':''}>${avatar(p.avatar,'big')}<b>${esc(p.name)}</b><span>${'♥'.repeat(s.lives?.[p.uid]??3)}</span></button>`).join('')}</div></section>`;
h+=`<section class="panel question-panel"><div class="eyebrow">FRAGERUNDE ${s.round} · FRAGE ${Number(s.weakIndex)+1}/${s.weakQueue?.length||0}</div><div class="chip yellow">${esc(labelName(current))} ist dran</div><div class="step-label" style="margin-top:23px">${esc(q.cat||'Allgemeinwissen')} · ${esc(q.difficulty||'Mittel')}</div><h2>${esc(q.q)}</h2>${s.phase==='weak-reveal'?`<div class="reveal-answer" style="max-width:800px;width:100%">${esc(q.a)}<br><small>${esc(q.info||'')}</small></div>`:''}</section>`;
h+=`<div class="controls-bar">${host()?s.phase==='weak-question'?button('weak-reveal','👁 Antwort aufdecken','primary'):button('weak-right','✓ Richtig','primary')+button('weak-wrong','✗ Falsch','warn'):''}</div>`;
return h}

// ---- Echtzeit-Verbindung, Sitzungen, Lobby ----
function rememberSession(){if(C.room&&C.user)sessionStorage.setItem('spieleabend-session',JSON.stringify({room:C.room,name:C.form.name,avatar:C.form.avatar,uid:uid()}));else sessionStorage.removeItem('spieleabend-session')}
function unsubscribeRoom(){C.watchers.forEach(f=>{try{f()}catch{}});C.watchers=[];C.roundWatchers.forEach(f=>{try{f()}catch{}});C.roundWatchers=[];if(C.actionWatcher){C.actionWatcher();C.actionWatcher=null}C.roundKey='';C.acks={};C.answers={};C.meta=null;C.state=null;C.players={};C.privateData=null;C.room=null;C.processing.clear();C.submitted.clear();C.draft={};C.groupOverrides={}}
async function createRoom(){if(C.pending)return;C.pending=true;try{
  let room=null;
  for(let i=0;i<15;i++){
    const code=String(randomInt(100000,999999));const initial={hostUid:uid(),createdAt:Date.now(),status:'open'};
    const res=await runTransaction(path('rooms',code,'meta'),old=>old===null?initial:undefined,{applyLocally:false});
    if(res.committed){room=code;break}
  }
  if(!room)throw new Error('Es konnte kein freier Raumcode generiert werden.');
  await set(path('rooms',room,'players',uid()),{name:C.form.name,avatar:Number(C.form.avatar),team:0,ready:false,online:true,joinedAt:Date.now()});
  await set(path('rooms',room,'state'),{game:'same',phase:'lobby',setup:defaultSetup,scores:{}});
  await enterRoom(room);toast('Dein Raum ist bereit!')
 }catch(e){toast(errorMsg(e))}finally{C.pending=false}}
async function joinRoom(code,{resume=false}={}){if(C.pending)return;C.pending=true;try{
 code=String(code||'').trim();if(!/^\d{6}$/.test(code))throw new Error('Bitte einen gültigen sechsstelligen Raumcode eingeben.');
 const meta=(await get(path('rooms',code,'meta'))).val();if(!meta||meta.status!=='open')throw new Error('Dieser Raum existiert nicht oder ist geschlossen.');
 const mine=(await get(path('rooms',code,'players',uid()))).val();
 if(!mine){await set(path('rooms',code,'players',uid()),{name:C.form.name,avatar:Number(C.form.avatar),team:0,ready:false,online:true,joinedAt:Date.now()});}
 else await update(path('rooms',code,'players',uid()),{online:true,name:C.form.name,avatar:Number(C.form.avatar)});
 await enterRoom(code);
 const peers=publicPlayers((await get(path('rooms',code,'players'))).val()||{});if(peers.filter(p=>p.name.trim().toLowerCase()===C.form.name.trim().toLowerCase()).length>1&&!resume){await remove(path('rooms',code,'players',uid()));unsubscribeRoom();C.screen='entry';render();throw new Error('Diesen Namen gibt es im Raum schon. Wähle bitte einen anderen.');}
 toast('Du bist dem Raum beigetreten!');
 }catch(e){if(resume){sessionStorage.removeItem('spieleabend-session');C.screen='identity';render()}toast(errorMsg(e))}finally{C.pending=false}}
async function enterRoom(code){unsubscribeRoom();C.room=code;C.screen='room';C.roundKey='';rememberSession();
 try{const ownOnline=path('rooms',code,'players',uid(),'online');await onDisconnect(ownOnline).set(false);
  C.watchers.push(onValue(path('rooms',code,'meta'),v=>{C.meta=v.val();if(!C.meta||C.meta.status!=='open'){toast('Der Raum wurde geschlossen.');leaveLocal();return}syncActionListener();render()},err=>toast(errorMsg(err))));
  C.watchers.push(onValue(path('rooms',code,'players'),v=>{C.players=v.val()||{};render();maybeAdvance()},err=>toast(errorMsg(err))));
  C.watchers.push(onValue(path('rooms',code,'state'),v=>{const prev=C.state?.rid;const prevPhase=C.state?.phase;C.state=v.val()||null;if(prev!==C.state?.rid){C.groupOverrides={};C.draft={};}syncRoundListener();render();maybeAdvance()},err=>toast(errorMsg(err))));
  C.watchers.push(onValue(path('rooms',code,'private',uid()),v=>{C.privateData=v.val();render()},err=>toast(errorMsg(err))));
  C.watchers.push(onValue(ref(db,'.info/connected'),v=>{C.connected=!!v.val();if(C.connected&&C.room===code)update(ownOnline.parent,{online:true}).catch(e=>console.warn(e));render()},err=>console.error(err)));
  render();
 }catch(e){toast(errorMsg(e))}
}
function leaveLocal(){unsubscribeRoom();rememberSession();C.screen='entry';render()}
async function leaveRoom(){if(!C.room)return;const r=C.room;try{
 await onDisconnect(path('rooms',r,'players',uid(),'online')).cancel();
 if(host()){
   const successor=allPlayers().find(p=>p.uid!==uid()&&p.online!==false)||allPlayers().find(p=>p.uid!==uid());
   if(successor){await update(path('rooms',r,'meta'),{hostUid:successor.uid});await remove(path('rooms',r,'players',uid()));}
   else {await remove(path('rooms',r,'players',uid()));await update(path('rooms',r,'meta'),{status:'closed'});}
 } else await remove(path('rooms',r,'players',uid()));
 }catch(e){console.warn('Leave:',e)}leaveLocal()}
async function changeHost(newId){if(!host())return;const p=C.players[newId];if(!p)return;await update(path('rooms',C.room,'meta'),{hostUid:newId});toast('Hostrolle übertragen')}
async function takeover(){const old=C.meta.hostUid;if(C.players[old]?.online!==false)return toast('Der aktuelle Host ist noch verbunden.');try{const res=await runTransaction(path('rooms',C.room,'meta'),m=>{if(!m||m.hostUid!==old)return;return {...m,hostUid:uid()}},{applyLocally:false});if(res.committed)toast('Du bist nun Host.');else toast('Host wurde bereits übernommen.')}catch(e){toast(errorMsg(e))}}
async function setState(s){if(!host())return;await set(path('rooms',C.room,'state'),s)}
async function patchState(part){if(!host())return;await update(path('rooms',C.room,'state'),part)}
async function updatePlayer(fields){await update(path('rooms',C.room,'players',uid()),fields)}
function syncRoundListener(){const s=C.state;if(!C.room||!s)return;const rid=s.rid||'',revealed=!!s.reveals?.[rid],key=rid+'-'+(revealed?'open':'closed');if(key===C.roundKey)return;C.roundWatchers.forEach(f=>{try{f()}catch{}});C.roundWatchers=[];C.roundKey=key;C.acks={};C.answers={};if(!rid)return;
 C.roundWatchers.push(onValue(path('rooms',C.room,'acks',rid),v=>{if(C.state?.rid!==rid)return;C.acks=v.val()||{};render();maybeAdvance()},e=>console.warn(errorMsg(e))));
 if(revealed){C.roundWatchers.push(onValue(path('rooms',C.room,'answers',rid),v=>{if(C.state?.rid!==rid)return;C.answers=v.val()||{};render()},e=>console.warn(errorMsg(e))))}
}
function syncActionListener(){if(!C.room||!C.meta)return;if(host()&&!C.actionWatcher){C.actionWatcher=onValue(path('rooms',C.room,'actions'),snap=>{const x=snap.val()||{};Object.entries(x).forEach(([id,a])=>receiveAction(id,a))},e=>console.warn('Actions:',e))}else if(!host()&&C.actionWatcher){C.actionWatcher();C.actionWatcher=null}}
async function receiveAction(id,a){if(!host()||!a?.nonce||C.processing.has(a.nonce))return;C.processing.add(a.nonce);try{await handleRemoteAction(id,a);await remove(path('rooms',C.room,'actions',id))}catch(e){console.warn('Action:',e);try{await remove(path('rooms',C.room,'actions',id))}catch{}}finally{C.processing.delete(a.nonce)}}
async function remoteAction(type){if(!C.room)return;try{await set(path('rooms',C.room,'actions',uid()),{type,rid:C.state?.rid||'',nonce:makeRid('a'),createdAt:Date.now()});toast('Aktion wird synchronisiert …')}catch(e){toast(errorMsg(e))}}
async function submitValue(value){const s=C.state;if(!s?.rid||submitted())return;value=String(value??'').trim().slice(0,140);if(!value)return toast('Bitte erst eine Antwort auswählen oder eingeben.');
 try{await set(path('rooms',C.room,'answers',s.rid,uid()),value);await set(path('rooms',C.room,'acks',s.rid,uid()),true);C.submitted.add(s.rid);render();toast('Antwort eingereicht!')}catch(e){toast(errorMsg(e))}}
async function hostRevealPhase(newPhase){const s=C.state;if(!host()||!s?.rid)return;const reveals={...(s.reveals||{}),[s.rid]:true};await patchState({phase:newPhase,reveals,deadline:0});const ans=(await get(path('rooms',C.room,'answers',s.rid))).val()||{};C.answers=ans;render();return ans}
async function maybeAdvance(){const s=C.state;if(!host()||!s||C.advancing||!C.room||!C.connected)return;const expiry=s.deadline>0&&Date.now()>=s.deadline;
const expected=s.phase==='same-answer'?s.participants:s.phase==='hot-clue'?[s.giverUid]:s.phase==='hot-guess'?s.eligible:s.phase==='imp-clue'?s.participants:s.phase==='imp-vote'?s.alive:s.phase==='imp-guess'?[s.guesser]:null;
if(s.game==='weak'&&s.phase==='weak-question'&&expiry){C.advancing=true;try{await patchState({phase:'weak-reveal',deadline:0})}finally{C.advancing=false}return;}
if(!expected?.length)return;
if(!expiry&&expected.some(id=>!C.acks[id]))return;
C.advancing=true;try{
 switch(s.phase){
 case 'same-answer':await hostRevealPhase('same-reveal');break;
 case 'hot-clue':await finishHotClue();break;
 case 'hot-guess':await finishHotGuess();break;
 case 'imp-clue':await finishImpClues();break;
 case 'imp-vote':await finishImpVote();break;
 case 'imp-guess':await finishImpGuess();break;
 }
 }catch(e){console.warn(e);toast(errorMsg(e))}finally{C.advancing=false}}
function updateTimer(){const s=C.state;if(!s)return;const el=$('countdown');if(el&&s.deadline){const ms=s.deadline-Date.now();el.textContent='⏱ '+humanTimer(ms);el.classList.toggle('urgent',ms<=10000)}maybeAdvance()}
setInterval(updateTimer,1000);

// ---- Partiespiel wählen, Teilnehmer-Konstellation und Lobby ----
async function chooseGame(game){if(!host()||!GAME_INFO[game])return;const setup={...defaultSetup,...(C.state?.setup||{})};if(game!=='same'&&game!=='hot')setup.teamCount=0;if(game==='hot'&&C.state?.game!==game)setup.rounds=2;if(game==='weak')setup.rounds=3;if(game==='jeo')setup.rounds=2;await patchState({game,setup});}
async function configure(k,v){if(!host())return;const s=C.state;const setup={...defaultSetup,...(s.setup||{})};if(k==='teamCount')setup.teamCount=cap(v,0,Math.floor(allPlayers().length/2));if(k==='rounds')setup.rounds=cap(v,1,100);if(k==='timer')setup.timer=cap(v,0,300);if(k==='imposters')setup.imposters=cap(v,1,Math.max(1,allPlayers().length-2));await patchState({setup})}
async function backLobby(){if(!host())return;if(C.state?.phase!=='finished'&&!confirm('Laufende Partie abbrechen und zur Lobby wechseln?'))return;await patchState({phase:'lobby',rid:'',deadline:0});for(const p of allPlayers()){try{await remove(path('rooms',C.room,'private',p.uid))}catch{}}}
async function startGame(){if(!host())return;const s=C.state,p=allPlayers();if(p.length<3||p.length>20)return toast('Bitte 3 bis 20 Spieler verbinden.');if(p.some(x=>x.online===false))return toast('Offline-Spieler müssen erst wieder beitreten oder entfernt werden.');if(p.some(x=>!x.ready))return toast('Noch nicht alle Personen sind bereit.');const tc=Number(s.setup?.teamCount||0);if(tc&&!validTeams(p,tc))return toast('Jedes Team benötigt mindestens zwei Spieler.');
 try{const scores=Object.fromEntries(p.map(x=>[x.uid,0]));for(let i=1;i<=tc;i++)scores['team'+i]=0;
 const base={...s,scores,round:0,participants:p.map(x=>x.uid),reveals:{},jokersUsed:{},awards:{},history:[],deadline:0};
 if(s.game==='same')await startSameRound(1,base);
 else if(s.game==='hot')await startHotTurn(1,base);
 else if(s.game==='imp')await startImposterRound(1,base);
 else if(s.game==='jeo')await setState({...base,phase:'jeo-board',board:0,round:1,taken:{},activeUid:p[randomInt(0,p.length-1)].uid,setup:{...s.setup,teamCount:0}});
 else if(s.game==='weak')await startWeakCycle(1,{...base,setup:{...s.setup,teamCount:0},lives:Object.fromEntries(p.map(x=>[x.uid,3])),correctCounts:Object.fromEntries(p.map(x=>[x.uid,0])),usedQuestions:[]});
 }catch(e){toast(errorMsg(e))}}

// ---- 3 Dumme, 1 Gedanke ----
async function startSameRound(n,base){const i=pickFrom(SAME_QUESTIONS,base.history||[]);const s={...base,phase:'same-answer',round:n,question:SAME_QUESTIONS[i],rid:makeRid('same'),deadline:base.setup.timer?Date.now()+Number(base.setup.timer)*1000:0,history:[...(base.history||[]),i],awards:{},overrides:{}};await setState(s)}
async function finishSameRound(){const s=C.state;if(!host()||s.phase!=='same-reveal')return;const ps=allPlayers().filter(p=>s.participants.includes(p.uid));const score=sameScores(ps,C.answers,Number(s.setup.teamCount||0),C.groupOverrides);const awards=s.setup.teamCount?Object.fromEntries(Object.entries(score.teams).map(([t,n])=>['team'+t,n])):score.individual;const totals={...(s.scores||{})};for(const [id,points]of Object.entries(awards))totals[id]=Number(totals[id]||0)+points;await patchState({phase:'same-result',scores:totals,awards,overrides:C.groupOverrides});}
async function nextSame(){const s=C.state;if(!host())return;if(s.round>=s.setup.rounds)await patchState({phase:'finished',deadline:0});else await startSameRound(s.round+1,s)}

// ---- Hotzone ----
function hotActor(s,turn){const ps=allPlayers().filter(p=>(s.participants||[]).includes(p.uid));const tc=Number(s.setup.teamCount||0);
 if(!tc){const giver=ps[(turn-1)%ps.length];return {giverUid:giver.uid,speakerUid:null,activeTeam:0,eligible:ps.filter(p=>p.uid!==giver.uid).map(p=>p.uid)}}
 const t=((turn-1)%tc)+1;const members=ps.filter(p=>Number(p.team)===t);const prior=Math.floor((turn-1)/tc);const giver=members[prior%members.length],others=members.filter(p=>p.uid!==giver.uid);const speaker=others[prior%others.length];return {giverUid:giver.uid,speakerUid:speaker.uid,activeTeam:t,eligible:[speaker.uid]}}
async function startHotTurn(turn,base){const active=hotActor(base,turn),catId=pickFrom(HOT_CATEGORIES,base.history||[]),target=randomInt(1,10),rid=makeRid('hot');const state={...base,...active,round:turn,category:HOT_CATEGORIES[catId],history:[...(base.history||[]),catId],phase:'hot-clue',rid,deadline:base.setup.timer?Date.now()+Number(base.setup.timer)*1000:0,clue:'',target:null,cutAllowed:{},riskActive:{},breakdown:{},giverPoints:0};const patches={'state':state,'vault':{target},[`private/${active.giverUid}`]:{role:'giver',target,category:state.category}};
for(const p of allPlayers())if(p.uid!==active.giverUid)patches[`private/${p.uid}`]=null;
await update(path('rooms',C.room),patches)}
async function finishHotClue(){const s=C.state;if(!host()||s.phase!=='hot-clue')return;const old=await hostRevealPhase('hot-clue-reveal'),clue=String(old?.[s.giverUid]||'Kein Hinweis').trim();await patchState({phase:'hot-guess',rid:makeRid('hotguess'),clue,deadline:s.setup.timer?Date.now()+Number(s.setup.timer)*1000:0});}
async function finishHotGuess(){const s=C.state;if(!host()||s.phase!=='hot-guess')return;const a=await hostRevealPhase('hot-reveal'),target=(await get(path('rooms',C.room,'vault','target'))).val();const tc=Number(s.setup.teamCount||0),breakdown={},awards={},points=[];
 if(tc){const guesser=s.speakerUid,key='team'+s.activeTeam;const answer=a[guesser]||null,risk=!!s.riskActive?.[key],score=hotPoints(target,answer,risk);breakdown[key]={guess:answer||'—',risk,points:score};awards[key]=score;}
 else{for(const id of s.eligible||[]){const answer=a[id]||null,risk=!!s.riskActive?.[id],score=hotPoints(target,answer,risk);breakdown[id]={guess:answer||'—',risk,points:score};awards[id]=score;points.push(score)}
 const giver=averagePoints(points);awards[s.giverUid]=giver;}
 const scores={...(s.scores||{})};for(const [id,point] of Object.entries(awards))scores[id]=Number(scores[id]||0)+point;
 await patchState({phase:'hot-result',target,breakdown,giverPoints:awards[s.giverUid]||0,scores,deadline:0});}
async function nextHot(){const s=C.state,tc=Number(s.setup.teamCount||0),turns=(s.setup.rounds||1)*(tc||s.participants.length);if(!host())return;if(s.round>=turns)await patchState({phase:'finished'});else await startHotTurn(s.round+1,s)}
async function handleRemoteAction(actor,action){const s=C.state;if(!host()||!s||s.game!=='hot'||action.rid!==s.rid)return;const type=action.type,tc=Number(s.setup.teamCount||0),who=s.giverUid===actor,guessing=s.phase==='hot-guess'&&(s.eligible||[]).includes(actor),key=tc?'team'+s.activeTeam:actor;
 if(type==='second'&&s.phase==='hot-clue'&&who&&!s.jokersUsed?.[key]?.secondChance){const i=pickFrom(HOT_CATEGORIES,s.history||[]),category=HOT_CATEGORIES[i],used={...(s.jokersUsed||{})};used[key]={...(used[key]||{}),secondChance:true};await patchState({category,history:[...(s.history||[]),i],jokersUsed:used});return}
 if(!guessing)return;
 if(type==='risk'&&!s.jokersUsed?.[key]?.risk){const used={...(s.jokersUsed||{})};used[key]={...(used[key]||{}),risk:true};await patchState({jokersUsed:used,riskActive:{...(s.riskActive||{}),[key]:true}});return}
 if(type==='cut'&&!s.jokersUsed?.[key]?.cut){const target=(await get(path('rooms',C.room,'vault','target'))).val(),wrong=shuffle(Array.from({length:10},(_,i)=>i+1).filter(x=>x!==target)).slice(0,5);const allowed=[target,...wrong].sort((a,b)=>a-b),used={...(s.jokersUsed||{})};used[key]={...(used[key]||{}),cut:true};await patchState({jokersUsed:used,cutAllowed:{...(s.cutAllowed||{}),[key]:allowed}})}
}

// ---- Imposter ----
async function startImposterRound(n,base){const ids=base.participants||[],count=cap(base.setup.imposters,1,Math.max(1,ids.length-2)),imposters=shuffle(ids).slice(0,count),wordIdx=pickFrom(IMPOSTER_WORDS,base.history||[]),word=IMPOSTER_WORDS[wordIdx],state={...base,round:n,history:[...(base.history||[]),wordIdx],phase:'imp-clue',rid:makeRid('impclue'),deadline:base.setup.timer?Date.now()+Number(base.setup.timer)*1000:0,alive:ids,eliminated:{},impCount:count,hints:{},voteTally:{},runoff:0,guesser:null,word:null,imposters:null,winnerSide:null,outcome:''};const patches={state,vault:{word,imposters}};
 ids.forEach(id=>patches['private/'+id]=imposters.includes(id)?{role:'imposter'}:{role:'citizen',word});await update(path('rooms',C.room),patches)}
async function finishImpClues(){const s=C.state;if(!host()||s.phase!=='imp-clue')return;const answers=await hostRevealPhase('imp-clue-reveal');await patchState({phase:'imp-clues',hints:answers,deadline:0});}
async function startImpVote(){const s=C.state;if(!host())return;const candidates=s.phase==='imp-tie'?s.tiedCandidates:s.alive;
 if(!['imp-clues','imp-discuss','imp-tie'].includes(s.phase))return;
 await patchState({phase:'imp-vote',rid:makeRid('impvote'),candidates,deadline:s.setup.timer?Date.now()+Number(s.setup.timer)*1000:0});}
async function finishImpVote(){const s=C.state;if(!host()||s.phase!=='imp-vote')return;const votes=await hostRevealPhase('imp-vote-reveal');const results=winnerOfVotes(votes,s.candidates||s.alive),tie=results.leaders.length>1,none=results.leaders.length===0;const lastTie=(s.runoff||0)>=1;
 if(none){await endImposterRound('imposter','Keine gültigen Stimmen abgegeben. Die Imposter bleiben unenttarnt.');return}
 const selected=results.leaders[0];
 await patchState({phase:'imp-vote-result',voteTally:results.tally,selection:tie?null:selected,tiedCandidates:tie?results.leaders:[],voteMessage:tie?lastTie?'Noch ein Gleichstand – die Imposter gewinnen.':'Stimmengleichstand! Es folgt eine Stichwahl.':`${labelName(selected)} wurde mit ${results.top} Stimme(n) gewählt.`,lastTie});}
async function continueImpVote(){const s=C.state;if(!host()||s.phase!=='imp-vote-result')return;const vault=(await get(path('rooms',C.room,'vault'))).val()||{},imps=vault.imposters||[];
 if(s.tiedCandidates?.length>1){if(s.lastTie){await endImposterRound('imposter','Auch die Stichwahl endete unentschieden.');return}await patchState({phase:'imp-tie',runoff:(s.runoff||0)+1});return}
 if(imps.includes(s.selection)){await patchState({phase:'imp-guess',guesser:s.selection,rid:makeRid('impguess'),deadline:s.setup.timer?Date.now()+Number(s.setup.timer)*1000:0});return}
 await endImposterRound('imposter',`${labelName(s.selection)} war unschuldig. Die Imposter gewinnen!`);
}
async function finishImpGuess(){const s=C.state;if(!host()||s.phase!=='imp-guess')return;const answer=await hostRevealPhase('imp-guess-reveal');const vault=(await get(path('rooms',C.room,'vault'))).val()||{};const guess=answer?.[s.guesser]||'';
 if(normalizeAnswer(guess)&&normalizeAnswer(guess)===normalizeAnswer(vault.word)){await endImposterRound('imposter',`${labelName(s.guesser)} hat das Wort erraten!`,s.guesser);return}
 const eliminated={...(s.eliminated||{}),[s.guesser]:true};const alive=s.alive.filter(id=>id!==s.guesser);const remaining=(vault.imposters||[]).filter(id=>!eliminated[id]);
 if(!remaining.length){await endImposterRound('citizen','Alle Imposter wurden enttarnt.');return}
 await patchState({phase:'imp-discuss',alive,eliminated,deadline:0});}
async function endImposterRound(winnerSide,outcome,bonusUid=null){const s=C.state,vault=(await get(path('rooms',C.room,'vault'))).val()||{},imposters=vault.imposters||[],scores={...(s.scores||{})};
 for(const id of s.participants){const isImp=imposters.includes(id);if((winnerSide==='imposter'&&isImp)||(winnerSide==='citizen'&&!isImp))scores[id]=Number(scores[id]||0)+(winnerSide==='imposter'?3:2)}
 if(bonusUid)scores[bonusUid]=(scores[bonusUid]||0)+2;
 await patchState({phase:'imp-result',deadline:0,winnerSide,outcome,word:vault.word||'—',imposters,scores});}
async function nextImposter(){const s=C.state;if(!host()||s.phase!=='imp-result')return;if(s.round>=s.setup.rounds)await patchState({phase:'finished'});else await startImposterRound(s.round+1,s)}

// ---- Jeopardy (2 x 25) ----
async function pickJeopardy(col,row){const s=C.state;if(!host()||s.phase!=='jeo-board')return;const key=`${s.board}-${col}-${row}`;if(s.taken?.[key])return;await patchState({phase:'jeo-question',selected:{col,row},firstUid:s.activeUid,challengerUid:'',firstVerdict:'none',challengerVerdict:'none',revealed:false});}
async function awardJeopardy(){const s=C.state;if(!host()||s.phase!=='jeo-question'||!s.revealed)return;const value=(Number(s.selected.row)+1)*100*(Number(s.board)+1),awards=jeopardyPoints(value,s.firstUid,s.challengerUid,s.firstVerdict,s.challengerVerdict),scores={...(s.scores||{})},taken={...(s.taken||{})};for(const [id,points]of Object.entries(awards))scores[id]=Number(scores[id]||0)+points;taken[`${s.board}-${s.selected.col}-${s.selected.row}`]=true;
 const currentBoardDone=Array.from({length:25},(_,i)=>taken[`${s.board}-${i%5}-${Math.floor(i/5)}`]).every(Boolean);
 const nextBoard=s.board===0&&currentBoardDone?1:s.board;
 const p=allPlayers();let active=s.firstUid;if(s.firstVerdict==='wrong'&&s.challengerUid&&s.challengerVerdict==='correct')active=s.challengerUid;else if(s.firstVerdict!=='correct')active=p[(p.findIndex(x=>x.uid===s.firstUid)+1)%p.length]?.uid||s.firstUid;
 await patchState({scores,taken,board:nextBoard,activeUid:active,phase:Object.keys(taken).length===50?'finished':'jeo-board',selected:null,firstUid:null,challengerUid:'',revealed:false});}

// ---- Der Dümmste fliegt ----
function unusedWeakQuestion(base){const used=base.usedQuestions||[],available=WEAK_QUESTIONS.map((_,i)=>i).filter(i=>!used.includes(i));const pool=available.length?available:WEAK_QUESTIONS.map((_,i)=>i);const id=pool[randomInt(0,pool.length-1)];return {id,used:available.length?[...used,id]:[id]}}
async function startWeakCycle(n,base){const p=allPlayers().filter(x=>base.participants.includes(x.uid)&&(base.lives?.[x.uid]??3)>0),ids=p.map(x=>x.uid);if(ids.length<2){await patchState({phase:'finished',scores:base.correctCounts||{}});return}
 const q=unusedWeakQuestion(base);await setState({...base,phase:'weak-question',round:n,weakQueue:[...ids,...ids],weakIndex:0,questionId:q.id,usedQuestions:q.used,deadline:base.setup.timer?Date.now()+Number(base.setup.timer)*1000:0});}
async function weakMark(correct){const s=C.state;if(!host()||s.phase!=='weak-reveal')return;const current=s.weakQueue[s.weakIndex],count={...(s.correctCounts||{})};if(correct)count[current]=Number(count[current]||0)+1;const next=s.weakIndex+1;
 if(next>=s.weakQueue.length){await patchState({phase:'weak-vote',weakIndex:next,correctCounts:count,deadline:0});return}
 const q=unusedWeakQuestion(s);await patchState({phase:'weak-question',weakIndex:next,questionId:q.id,usedQuestions:q.used,correctCounts:count,deadline:s.setup.timer?Date.now()+Number(s.setup.timer)*1000:0});}
async function weakLoseLife(id){const s=C.state;if(!host()||s.phase!=='weak-vote')return;const lives={...(s.lives||{})},current=Number(lives[id]??3);if(current<=0)return;lives[id]=current-1;const left=allPlayers().filter(p=>s.participants.includes(p.uid)&&Number(lives[p.uid]??3)>0);
 if(left.length===1){const scores={...(s.correctCounts||{})};scores[left[0].uid]=(scores[left[0].uid]||0)+100;await patchState({phase:'finished',lives,scores,deadline:0});return}
 await startWeakCycle(s.round+1,{...s,lives})}

// ---- UI Events ----
document.addEventListener('input',e=>{const el=e.target;if(el?.dataset?.draft!==undefined){const key=el.dataset.draft;if(key==='name')C.form.name=el.value;if(key==='joinCode')C.form.joinCode=el.value.replace(/\D/g,'').slice(0,6);if(key!=='name'&&key!=='joinCode')C.draft[key]=el.value}if(el?.dataset?.group){C.groupOverrides[el.dataset.group]=el.value}});
document.addEventListener('change',async e=>{const el=e.target;try{if(el.dataset.setup)await configure(el.dataset.setup,el.value);if(el.dataset.jeoFirst!==undefined&&host())await patchState({activeUid:el.value});if(el.dataset.jeoBuzzer!==undefined&&host())await patchState({challengerUid:el.value,challengerVerdict:'none'});}catch(err){toast(errorMsg(err))}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='answer-input'){e.preventDefault();const b=document.querySelector('[data-action="submit-text"]');if(b)b.click()}if(e.key==='Enter'&&e.target.id==='join-code'){e.preventDefault();document.querySelector('[data-action="join-room"]')?.click()}});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action,id=el.dataset.id;try{
 switch(a){
 case 'fullscreen':if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();break;
 case 'choose-avatar':C.form.avatar=Number(id);render();break;
 case 'profile-next':C.form.name=C.form.name.trim().slice(0,22);if(C.form.name.length<2)return toast('Bitte mindestens zwei Zeichen für deinen Namen eingeben.');C.screen='entry';render();break;
 case 'back-profile':C.screen='identity';render();break;
 case 'focus-join':$('join-code')?.focus();break;
 case 'create-room':await createRoom();break;
 case 'join-room':await joinRoom(C.form.joinCode);break;
 case 'copy-code':await navigator.clipboard.writeText(C.room);toast('Raumcode kopiert!');break;
 case 'copy-link':await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${C.room}`);toast('Einladungslink kopiert!');break;
 case 'leave-room':await leaveRoom();break;
 case 'reload':location.reload();break;
 case 'toggle-ready':await updatePlayer({ready:!me().ready});break;
 case 'kick-player':if(host()&&C.players[id]?.online===false){await remove(path('rooms',C.room,'players',id));toast('Offline-Spieler entfernt.')}break;
 case 'choose-team':await updatePlayer({team:Number(id),ready:false});break;
 case 'choose-game':await chooseGame(id);break;
 case 'transfer-host':await changeHost($('new-host')?.value);break;
 case 'take-host':await takeover();break;
 case 'start-game':await startGame();break;
 case 'back-lobby':await backLobby();break;
 case 'submit-text':{
   const s=C.state;const valid=['same-answer','hot-clue','imp-clue','imp-guess'];if(!valid.includes(s?.phase))return;
   const permitted=s.phase==='hot-clue'?s.giverUid===uid():s.phase==='imp-guess'?s.guesser===uid():(s.participants||[]).includes(uid());if(!permitted)return toast('Du darfst in dieser Phase nicht antworten.');
   const value=$('answer-input')?.value||C.draft[s.rid]||'';await submitValue(value);break;}
 case 'force-reveal':await hostRevealPhase('same-reveal');break;
 case 'same-score':await finishSameRound();break;
 case 'same-next':await nextSame();break;
 case 'hot-second':await remoteAction('second');break;
 case 'hot-risk':await remoteAction('risk');break;
 case 'hot-cut':await remoteAction('cut');break;
 case 'hot-force-clue':await finishHotClue();break;
 case 'hot-force-guess':await finishHotGuess();break;
 case 'hot-next':await nextHot();break;
 case 'choose-number':C.draft[C.state.rid]=id;render();break;
 case 'submit-number':await submitValue(C.draft[C.state.rid]);break;
 case 'imp-force-clues':await finishImpClues();break;
 case 'imp-start-vote':await startImpVote();break;
 case 'choose-vote':C.draft[C.state.rid]=id;render();break;
 case 'submit-vote':await submitValue(C.draft[C.state.rid]);break;
 case 'imp-force-vote':await finishImpVote();break;
 case 'imp-vote-continue':await continueImpVote();break;
 case 'imp-force-guess':await finishImpGuess();break;
 case 'imp-next':await nextImposter();break;
 case 'jeo-select':await pickJeopardy(Number(el.dataset.col),Number(el.dataset.row));break;
 case 'jeo-reveal':await patchState({revealed:true});break;
 case 'jeo-first-verdict':await patchState({firstVerdict:id});break;
 case 'jeo-buzzer-verdict':await patchState({challengerVerdict:id});break;
 case 'jeo-award':await awardJeopardy();break;
 case 'weak-reveal':await patchState({phase:'weak-reveal',deadline:0});break;
 case 'weak-right':await weakMark(true);break;
 case 'weak-wrong':await weakMark(false);break;
 case 'weak-eliminate':await weakLoseLife(id);break;
 }
 }catch(err){toast(errorMsg(err))}});

// ---- Verbindungsinitialisierung ----
let authBusy=false;
onAuthStateChanged(auth,async user=>{
 if(!user){if(authBusy)return;authBusy=true;try{await signInAnonymously(auth)}catch(e){C.error=errorMsg(e);C.screen='error';render()}finally{authBusy=false}return}
 C.user=user;
 const sess=sessionStorage.getItem('spieleabend-session');if(sess){try{const old=JSON.parse(sess);if(old.uid===uid()&&/^\d{6}$/.test(old.room)&&old.name){C.form.name=old.name;C.form.avatar=cap(old.avatar,0,79);C.form.joinCode=old.room;C.screen='loading';render();await joinRoom(old.room,{resume:true});return}}catch(e){console.warn(e)}sessionStorage.removeItem('spieleabend-session')}
 C.screen='identity';render();
},e=>{C.error=errorMsg(e);C.screen='error';render()});

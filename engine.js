/** Reine Spiellogik ohne Netzwerk; lässt sich mit Node separat testen. */
const SYNONYM_GROUPS = [
 ['handy','smartphone','mobiltelefon','telefon','iphone'],
 ['portemonnaie','geldbeutel','geldbörse','brieftasche','wallet'],
 ['fahrrad','rad','bike','velo'],
 ['schlüssel','schluessel','haustürschlüssel','autoschlüssel'],
 ['cola','coca cola','coke'],
 ['fußball','fussball','football'],
 ['nudeln','pasta','spaghetti'],
 ['kühlschrank','kuehlschrank','kühlgerät'],
 ['freund','kumpel','buddy'],
 ['bier','pils'],
 ['schokolade','schoki','schoko'],
 ['pommes','fritten','pommes frites'],
 ['fernseher','tv','television'],
 ['geld','bargeld','cash']
];
export function normalizeAnswer(value='') {
  const clean = String(value).trim().toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if (!clean) return '';
  for (const group of SYNONYM_GROUPS) if (group.some(s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')===clean)) return group[0];
  return clean;
}
export function sameScores(players, answers, teamCount=0, overrides={}) {
  const keys={};
  for(const p of players){
    const raw=Object.prototype.hasOwnProperty.call(overrides,p.uid)?overrides[p.uid]:answers[p.uid];
    keys[p.uid]=normalizeAnswer(raw);
  }
  if (!teamCount) {
    const counts={}; Object.values(keys).filter(Boolean).forEach(k=>counts[k]=(counts[k]||0)+1);
    return {individual:Object.fromEntries(players.map(p=>[p.uid,keys[p.uid]?counts[keys[p.uid]]-1:0])),teams:{},keys};
  }
  const teams={};
  for(let t=1;t<=teamCount;t++){
    const members=players.filter(p=>Number(p.team)===t);
    const counts={};members.forEach(p=>{const k=keys[p.uid];if(k)counts[k]=(counts[k]||0)+1});
    const max=Math.max(0,...Object.values(counts));
    teams[t]=members.length>=2&&max===members.length?3:max>=2?1:0;
  }
  return {individual:{},teams,keys};
}
export function hotPoints(target,guess,risk=false){
  if(guess===null||guess===undefined||guess===''||!Number.isInteger(Number(guess))||Number(guess)<1||Number(guess)>10)return 0;
  const delta=Math.abs(Number(target)-Number(guess));
  const value=delta===0?3:delta===1?1:delta===2?0:-2;
  return value*(risk?2:1);
}
export function averagePoints(points){
  if(!points.length)return 0;
  return Math.round(points.reduce((s,v)=>s+v,0)/points.length);
}
export function jeopardyPoints(value,first,challenger,firstVerdict,challengerVerdict){
  const out={};
  if(firstVerdict==='correct')out[first]=Number(value);
  if(firstVerdict==='wrong')out[first]=-Number(value)/2;
  if(challenger&&challenger!==first&&firstVerdict!=='correct'){
    if(challengerVerdict==='correct')out[challenger]=Number(value);
    if(challengerVerdict==='wrong')out[challenger]=-Number(value);
  }
  return out;
}
export function winnerOfVotes(votes,eligible){
  const tally=Object.fromEntries(eligible.map(uid=>[uid,0]));
  for(const uid of Object.values(votes))if(Object.prototype.hasOwnProperty.call(tally,uid))tally[uid]++;
  const top=Math.max(0,...Object.values(tally));
  const leaders=top?eligible.filter(uid=>tally[uid]===top):[];
  return {tally,leaders,top};
}
export function publicPlayers(players){return Object.entries(players||{}).map(([uid,p])=>({uid,...p})).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0))}
export function validTeams(players,teamCount){
  if(!teamCount)return true;
  for(let i=1;i<=teamCount;i++)if(players.filter(p=>Number(p.team)===i).length<2)return false;
  return players.every(p=>Number(p.team)>=1&&Number(p.team)<=teamCount);
}
export function isFinishedJeopardy(taken){return Object.keys(taken||{}).length>=50}
export function nextAlive(players,lives){return players.filter(p=>(lives?.[p.uid]??3)>0)}

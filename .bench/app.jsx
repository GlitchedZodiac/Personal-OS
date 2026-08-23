import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";

const WORDS = "and it came to pass that the LORD spoke unto Moses saying behold I will do a great thing among you in that day".split(" ");
function verseText(i){ let s=""; const n=18+(i%14); for(let k=0;k<n;k++) s += WORDS[(i*7+k)%WORDS.length]+" "; return s.trim(); }
function makeVerses(n){ return Array.from({length:n},(_,i)=>({
  refInt: 19119000+i+1, verseNum: i+1, text: verseText(i),
  crossrefs: i%3===0 ? [{letter:"a",ref:1},{letter:"b",ref:2}] : [],
  footnotes: i%5===0 ? [{marker:1,text:"Or something"}] : [],
  heading: i%12===0 ? "A Heading Here" : null, psalmTitle: null, lines: null,
})); }

// per-verse subtree transcribed from components/spirit/reader.tsx:976-1170 (prose branch)
function Verse({ v, sel, notesCount }) {
  const on = sel === v.refInt;
  return (
    <div key={v.refInt}>
      {v.heading && <p className="border-b px-2.5 pb-2.5 pt-3 text-[12px] italic leading-[1.6]" style={{fontFamily:"var(--font-serif)",color:"#888",borderColor:"#eee"}}>{v.heading}</p>}
      <div data-verse={v.refInt} data-verse-num={v.verseNum} id={`v-${v.refInt}`}
        onClick={()=>{}}
        className="cursor-pointer rounded-[9px] px-[11px] py-[7px] transition-all"
        style={{ background: on?"#f6e8ee":"transparent", boxShadow: on?"inset 0 0 0 1.5px #A63D63":"none",
                 borderLeft:"3px solid transparent", opacity: 1 }}>
        <div className="leading-[1.75]" style={{fontFamily:"serif",fontSize:"16px",color:"#221",textAlign:"left",hyphens:"manual"}}>
          <span data-verse-number={v.refInt} className="mr-1.5 align-super text-[10px] font-bold" style={{fontFamily:"var(--font-display)",color:"#A63D63"}}>{v.verseNum}</span>
          {v.text}
          {v.crossrefs.slice(0,3).map(c=>(
            <sup key={c.letter} onClick={(e)=>e.stopPropagation()} className="ml-[3px] cursor-pointer text-[10px] font-bold"
                 style={{color:"#8C2F51",textDecoration:"none"}}>{c.letter}</sup>))}
          {v.footnotes.slice(0,3).map(f=>(
            <sup key={`fn${f.marker}`} onClick={(e)=>e.stopPropagation()} className="ml-[3px] cursor-pointer text-[9.5px] font-bold"
                 style={{color:"#888",textDecoration:"none"}}>[{f.marker}]</sup>))}
        </div>
        {notesCount>0 && <div className="mt-1" style={{fontSize:11,color:"#777"}}>{notesCount} note(s)</div>}
      </div>
    </div>
  );
}

function Reader({ verses, notes }) {
  const [sel] = useState(null);
  return (
    <div data-text-column="1" className="relative mt-3 rounded-[18px] px-3.5 py-4" style={{background:"#fff",boxShadow:"0 1px 2px rgba(0,0,0,.06)"}}>
      {verses.map(v => {
        const n = notes.filter(x => x.refStart === v.refInt).length; // O(verses x notes)
        return <Verse key={v.refInt} v={v} sel={sel} notesCount={n} />;
      })}
    </div>
  );
}

function Pane({ verses, notes }) {
  const [strokes, setStrokes] = useState([]);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const t = useRef(0);
  const commit = () => {
    const t0 = performance.now();
    setPast(h => [...h.slice(-40), strokes]);
    setFuture([]);
    setStrokes(s => [...s, {id: Math.random()}]);
    // measure after React's sync flush for this discrete event
    queueMicrotask(()=>{ /* noop */ });
    t.current = t0;
  };
  return (
    <div>
      <button id="commit" onClick={commit}>commit</button>
      <span id="n">{strokes.length}</span>
      <Reader verses={verses} notes={notes} />
      <div id="canvasish" style={{position:"absolute"}} />
    </div>
  );
}

window.__bench = (nVerses, nNotes, iters) => {
  const host = document.getElementById("root");
  host.innerHTML = "";
  const el = document.createElement("div"); host.appendChild(el);
  const root = createRoot(el);
  const verses = makeVerses(nVerses);
  const notes = Array.from({length:nNotes},(_,i)=>({refStart: 19119000+((i*3)%nVerses)+1}));
  return new Promise(res => {
    root.render(<Pane verses={verses} notes={notes} />);
    setTimeout(()=>{
      const btn = el.querySelector("#commit");
      const times = [];
      for (let i=0;i<iters;i++){
        const t0 = performance.now();
        btn.dispatchEvent(new PointerEvent("pointerup", {bubbles:true}));
        btn.click(); // discrete -> sync flush
        times.push(performance.now()-t0);
      }
      times.sort((a,b)=>a-b);
      res({ nVerses, nNotes, median: times[Math.floor(iters/2)], p90: times[Math.floor(iters*0.9)], max: times[times.length-1] });
    }, 300);
  });
};

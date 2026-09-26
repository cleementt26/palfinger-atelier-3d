"use client";
import {useEffect,useRef,useState,useId} from "react";
import {ArrowDownToLine,ArrowUpRight,Box,Check,CircleHelp,Eye,Focus,GitBranch,Maximize2,Minus,MoveUpRight,Pause,Play,Plus,Rotate3D,RotateCcw,RotateCw,Route,Settings2,X} from "lucide-react";
import {Slider} from "@/components/ui/slider";
import {Switch} from "@/components/ui/switch";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import Viewer,{type ViewerHandle,type ViewName,type Telemetry} from "./viewer";
import {BROCHURE_URL,DEFAULT_POSE,PARTS,PRESETS,PRODUCT_URL,SPECS,VARIANTS,type CranePose,type PartId} from "@/lib/crane-data";
import {INITIAL_JOINTS,LIMITS,measurements,nearestRotation,SEQUENCE_PHASES,sequencePhase,type JointPose} from "@/lib/crane-kinematics";

const number=(v:number,digits=0)=>v.toLocaleString("fr-FR",{minimumFractionDigits:digits,maximumFractionDigits:digits});
function RangeControl({label,value,actual=value,min,max,unit="°",start,end,onChange}:{label:string;value:number;actual?:number;min:number;max:number;unit?:string;start?:string;end?:string;onChange:(v:number)=>void}){
  const id=useId();
  return <div className="range-control"><div><label id={id}>{label}</label><output title="Position affichée">{number(actual)}<span> {unit}</span></output></div>
    <Slider ref={el=>{const thumb=el?.querySelector('[role="slider"]');thumb?.setAttribute("aria-label",label);thumb?.setAttribute("aria-valuetext",`${number(value)} ${unit==="°"?"degrés":"pour cent"}`);}} aria-labelledby={id} value={[value]} min={min} max={max} step={1} onValueChange={v=>onChange(v[0])}/>
    <div className="range-ends"><span>{start??`${min}°`}</span><span>{end??`${max}°`}</span></div>
  </div>;
}
export default function CraneStudio(){
  const [pose,setPose]=useState<CranePose>(DEFAULT_POSE);
  const [live,setLive]=useState<Telemetry>({pose:INITIAL_JOINTS,progress:58,limited:false,returning:false,measurements:measurements(INITIAL_JOINTS)});
  const [selected,setSelected]=useState<PartId|null>(null),[labels,setLabels]=useState(true),[autoRotate,setAutoRotate]=useState(false);
  const [expanded,setExpanded]=useState(false),[tab,setTab]=useState("explore"),[ready,setReady]=useState(false),[view,setView]=useState<ViewName>("perspective");
  const [mechanism,setMechanism]=useState(false),[trace,setTrace]=useState(false),[playing,setPlaying]=useState(false),[paused,setPaused]=useState(false),[direction,setDirection]=useState<1|-1>(1),[speed,setSpeed]=useState(.5);
  const viewer=useRef<ViewerHandle>(null);
  const snapshot=useRef({pose,live,selected,labels,view,playing,paused});snapshot.current={pose,live,selected,labels,view,playing,paused};
  const part=PARTS.find(p=>p.id===selected),phase=sequencePhase(live.progress);
  const setCamera=(v:ViewName)=>{setView(v);viewer.current?.view(v);};
  const stop=()=>{setPlaying(false);setPaused(false);};
  const seek=(deployment:number)=>{stop();setPose(p=>({...p,mode:"sequence",deployment}));};
  const setMode=(mode:string)=>{stop();setPose(p=>({...p,...snapshot.current.live.pose,mode:mode as CranePose["mode"]}));};
  const setJoint=(key:keyof JointPose,value:number)=>{stop();setPose(p=>({...p,deployment:p.mode==="sequence"?snapshot.current.live.progress:p.deployment,[key]:value}));};
  const reset=()=>{stop();setPose({...DEFAULT_POSE});setSelected(null);setAutoRotate(false);setMechanism(false);setTrace(false);viewer.current?.clearTrail();setCamera("perspective");};
  const showPart=(id:PartId)=>{setSelected(id);setTab("explore");};
  const play=(d:1|-1)=>{if(playing&&direction===d){setPlaying(false);setPaused(true);setPose(p=>({...p,deployment:live.progress}));return;}setDirection(d);setPaused(false);setPose(p=>({...p,mode:"sequence"}));setPlaying(true);};
  const finishPlayback=(deployment:number)=>{setPlaying(false);setPaused(false);setPose(p=>({...p,deployment}));};
  const detailView=()=>{setMechanism(true);if(selected!=="main")setSelected("knuckle");setCamera("joint");};

  useEffect(()=>{if(!expanded)return;const old=document.body.style.overflow;document.body.style.overflow="hidden";const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setExpanded(false);};window.addEventListener("keydown",esc);return()=>{document.body.style.overflow=old;window.removeEventListener("keydown",esc);};},[expanded]);
  useEffect(()=>{
    type MC={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>unknown};
    const mc=(document as Document&{modelContext?:MC}).modelContext;if(!mc?.registerTool)return;
    const lifecycle=new AbortController();
    const register=(tool:Parameters<MC["registerTool"]>[0])=>{try{Promise.resolve(mc.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
    register({name:"get_crane_details",title:"Lire la fiche et la cinématique",description:"Retourne les données constructeur, les commandes et la pose affichée de la reconstruction. Les courses sont relatives au modèle, sans calcul de levage.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({model:"PK 53002 SH",...snapshot.current,specifications:SPECS,source:PRODUCT_URL,representation:"Reconstruction cinématique, cotes et courses illustratives"})});
    register({name:"configure_crane_view",title:"Commander la grue 3D",description:"Pilote une séquence illustrative ou les articulations indépendantes. deployment ne se combine pas avec boom, knuckle ou extension. Les commandes évoluent progressivement ; la réponse distingue commande et pose affichée.",inputSchema:{type:"object",properties:{deployment:{type:"number",minimum:0,maximum:100},boom:{type:"number",minimum:0,maximum:82},knuckle:{type:"number",minimum:-155,maximum:15},extension:{type:"number",minimum:0,maximum:100},rotation:{type:"number",minimum:-3600,maximum:3600},view:{type:"string",enum:["perspective","side","top","joint"]},part:{type:"string",enum:PARTS.map(p=>p.id)}},minProperties:1,additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{
      if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Objet attendu");const o=input as Record<string,unknown>;
      if(!Object.keys(o).length||Object.keys(o).some(k=>!["deployment","boom","knuckle","extension","rotation","view","part"].includes(k)))throw new Error("Paramètre inconnu ou manquant");
      const bounds={deployment:[0,100],boom:[0,82],knuckle:[-155,15],extension:[0,100],rotation:[-3600,3600]};
      for(const [k,[min,max]] of Object.entries(bounds))if(o[k]!==undefined&&(typeof o[k]!=="number"||!Number.isFinite(o[k])||o[k]<min||o[k]>max))throw new Error(`${k} hors limites`);
      if(o.view!==undefined&&!["perspective","side","top","joint"].includes(o.view as string))throw new Error("Vue inconnue");if(o.part!==undefined&&!PARTS.some(p=>p.id===o.part))throw new Error("Composant inconnu");
      const manual=["boom","knuckle","extension"].some(k=>o[k]!==undefined);if(manual&&o.deployment!==undefined)throw new Error("Choisir une séquence ou des articulations indépendantes");
      stop();setPose(p=>({...p,...(manual?snapshot.current.live.pose:{}),...Object.fromEntries(Object.entries(o).filter(([k])=>k in bounds)),mode:manual?"manual":o.deployment!==undefined?"sequence":p.mode}));
      if(o.part)showPart(o.part as PartId);if(o.view)setCamera(o.view as ViewName);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {...snapshot.current,representation:"Pose illustrative ; mouvement progressif vers la commande"};
    }});
    return()=>lifecycle.abort();
  },[]);

  return <main className="studio-shell">
    <header className="site-header"><a href="#main" className="brand" aria-label="Palfinger, atelier 3D"><img className="brand-logo" src="./brand/palfinger-logo.svg" alt="PALFINGER" width={107} height={23}/><span className="brand-divider"/><span className="brand-caption">ATELIER <b>3D</b></span></a><a href={PRODUCT_URL} target="_blank" rel="noreferrer" className="source-link">Documentation Palfinger <ArrowUpRight size={17}/></a></header>
    <section className="model-heading" id="main"><div><p className="eyebrow">GRUE DE CHARGEMENT ARTICULÉE</p><h1>PK 53002 <span>SH</span><span className="model-tag">High Performance</span></h1></div><div className="heading-note"><span className="line-mark"/><p>Deux articulations. Six extensions.<br/><strong>La mécanique, mouvement par mouvement.</strong></p></div></section>
    <div className="workspace">
      <section className={`stage ${expanded?"stage-expanded":""}`} aria-label="Visualiseur 3D de la grue">
        <Viewer ref={viewer} pose={pose} selected={selected} labels={labels} autoRotate={autoRotate} mechanism={mechanism} trace={trace} playing={playing} paused={paused} direction={direction} speed={speed} onSelect={showPart} onReady={()=>setReady(true)} onTelemetry={setLive} onPlaybackEnd={finishPlayback}/>
        <div className="stage-top"><span className="stage-badge"><Box size={16}/>{mechanism?"Liaisons & axes":"Vue 3D interactive"}</span><button className="icon-button light" aria-label={expanded?"Réduire la vue":"Agrandir la vue"} title={expanded?"Réduire":"Agrandir"} onClick={()=>setExpanded(v=>!v)}>{expanded?<X size={19}/>:<Maximize2 size={18}/>}</button></div>
        <div className="stage-readout" aria-label="Angles réels de la maquette"><span title="Bras principal par rapport au sol">α <b>{number(live.pose.boom,1)}°</b></span><span title="Second bras par rapport au premier">β <b>{number(live.pose.knuckle,1)}°</b></span>{paused&&<span className="paused-tag"><Pause size={11}/>Pause</span>}</div>
        <div className="view-toolbar" aria-label="Commandes de la caméra"><div className="camera-presets">{([['perspective','3/4'],['side','Profil'],['top','Dessus']] as const).map(([value,label])=><button key={value} className={view===value?"active":""} onClick={()=>setCamera(value)} aria-pressed={view===value} disabled={!ready}>{label}</button>)}</div><div className="zoom-buttons"><button aria-label="Dézoomer" disabled={!ready} onClick={()=>viewer.current?.zoom(-1)}><Minus size={17}/></button><button aria-label="Zoomer" disabled={!ready} onClick={()=>viewer.current?.zoom(1)}><Plus size={17}/></button><button aria-label="Recentrer la grue" disabled={!ready} onClick={()=>setCamera(view)}><Focus size={17}/></button></div></div>
        <div className="stage-bottom"><span>Glisser pour tourner <span className="desktop-hint">· Molette pour zoomer</span><span className="mobile-hint">· Pincer pour zoomer</span></span><span className="model-disclaimer">Cinématique reconstruite</span></div>
      </section>
      <aside className="inspector" aria-label="Commandes et caractéristiques">
        <Tabs value={tab} onValueChange={setTab} className="inspector-tabs"><TabsList className="inspector-tabs-list"><TabsTrigger value="explore"><Settings2 size={16}/>Mouvements</TabsTrigger><TabsTrigger value="specs"><span className="spec-icon">≡</span>Caractéristiques</TabsTrigger></TabsList>
          <TabsContent value="explore" className="explore-panel">
            <div className="section-heading"><h2>Prendre les commandes</h2><button className="icon-button" title="Réinitialiser" aria-label="Réinitialiser la grue" onClick={reset}><RotateCcw size={17}/></button></div>
            <Tabs value={pose.mode} onValueChange={setMode} className="motion-tabs"><TabsList className="motion-tabs-list"><TabsTrigger value="sequence">Séquence</TabsTrigger><TabsTrigger value="manual">Articulations</TabsTrigger></TabsList>
              <TabsContent value="sequence" className="motion-content">
                <div className="pose-presets" aria-label="Positions des bras">{PRESETS.map(p=><button key={p.value} className={Math.abs(live.progress-p.value)<.1&&!live.returning?"selected":""} onClick={()=>{seek(p.value);viewer.current?.view(view);}} aria-pressed={Math.abs(live.progress-p.value)<.1&&!live.returning}>{p.name}{Math.abs(live.progress-p.value)<.1&&!live.returning&&<Check size={13}/>}</button>)}</div>
                <div className="playback-controls"><button className={playing&&direction===-1?"is-playing":""} onClick={()=>play(-1)} disabled={!ready||live.progress<.01&&!live.returning} aria-label={playing&&direction===-1?"Mettre le repli en pause":"Lire le repli"}>{playing&&direction===-1?<Pause size={15}/>:<RotateCcw size={15}/>}Replier</button><button className={`play-button ${playing&&direction===1?"is-playing":""}`} onClick={()=>play(1)} disabled={!ready||live.progress>99.99&&!live.returning} aria-label={playing&&direction===1?"Mettre le dépliage en pause":"Lire le dépliage"}>{playing&&direction===1?<Pause size={15}/>:<Play size={15}/>}Déplier</button><button className="speed-button" onClick={()=>setSpeed(s=>s===1?.25:s===.25?.5:1)} aria-label={`Vitesse de l’animation ${speed}. Changer la vitesse.`}>×{number(speed,speed===.25?2:speed===.5?1:0)}</button></div>
                <RangeControl label="Déploiement des bras" value={playing?live.progress:pose.deployment} actual={live.progress} min={0} max={100} unit="%" start="Repliés" end="Étendus" onChange={seek}/>
                <div className="sequence-phase"><span>{live.returning?"Retour vers la séquence":phase.title}</span><small>Animation illustrative</small></div>
                <div className="phase-track" aria-label="Étapes de dépliage">{SEQUENCE_PHASES.map((p,i)=><button key={p.from} className={live.progress>=p.from?"reached":""} onClick={()=>seek(p.to)} title={p.title} aria-label={`Étape ${i+1} : ${p.title}`}><span>{String(i+1).padStart(2,"0")}</span><i/></button>)}</div>
              </TabsContent>
              <TabsContent value="manual" className="motion-content manual-controls">
                <p className="manual-intro">Chaque articulation se commande séparément.</p>
                <RangeControl label="α · Bras principal" value={pose.boom} actual={live.pose.boom} min={LIMITS.boom[0]} max={LIMITS.boom[1]} start="Horizontal" end="Relevé" onChange={v=>setJoint("boom",v)}/>
                <RangeControl label="β · Articulation du coude" value={pose.knuckle} actual={live.pose.knuckle} min={LIMITS.knuckle[0]} max={LIMITS.knuckle[1]} start="Replié −155°" end="Power Link +15°" onChange={v=>setJoint("knuckle",v)}/>
                <p className="angle-note">β = 0° : bras alignés. β = +15° : dépassement de cet alignement.</p>
                <RangeControl label="Extensions télescopiques" value={pose.extension} actual={live.pose.extension} min={0} max={100} unit="%" start="Rentrées" end="6 éléments sortis" onChange={v=>setJoint("extension",v)}/>
                {live.limited&&<p className="motion-limit" role="status">Butée de la maquette : ouverture du coude ajustée pour préserver le dégagement.</p>}
              </TabsContent>
            </Tabs>
            <div className="slew-control"><RangeControl label="Orientation de la colonne" value={((pose.rotation%360)+360)%360} actual={live.pose.rotation} min={0} max={360} start="0°" end="360° · sans butée" onChange={v=>setJoint("rotation",nearestRotation(pose.rotation,v))}/><div className="turn-buttons"><button onClick={()=>setJoint("rotation",pose.rotation-90)} aria-label="Tourner la colonne de moins 90 degrés"><RotateCcw size={14}/>−90°</button><button onClick={()=>setJoint("rotation",pose.rotation+90)} aria-label="Tourner la colonne de plus 90 degrés">+90°<RotateCw size={14}/></button></div></div>
            <div className="view-switches"><label><GitBranch size={17}/><span>Voir les liaisons et les axes</span><Switch checked={mechanism} onCheckedChange={setMechanism} aria-label="Voir les liaisons et les axes"/></label><label><Route size={17}/><span>Tracer le mouvement du crochet</span><Switch checked={trace} onCheckedChange={setTrace} aria-label="Tracer le mouvement du crochet"/></label><label><Eye size={17}/><span>Repères des composants</span><Switch checked={labels} onCheckedChange={setLabels} aria-label="Afficher les repères des composants"/></label><label><Rotate3D size={17}/><span>Tourner autour de la grue</span><Switch checked={autoRotate} onCheckedChange={setAutoRotate} aria-label="Rotation automatique de la caméra"/></label></div>
            <div className="mechanism-readings"><div className="reading-heading"><h3>Courses des vérins</h3><span>du modèle</span></div><div className="stroke-row"><span>Levage</span><progress max={100} value={live.measurements.mainStroke}/><b>{number(live.measurements.mainStroke)} %</b></div><div className="stroke-row"><span>Coude</span><progress max={100} value={live.measurements.secondStroke}/><b>{number(live.measurements.secondStroke)} %</b></div><div className="extension-readings" aria-label="Sortie de chaque élément télescopique">{live.measurements.stages.map((v,i)=><div key={i} title={`Élément ${i+1} : ${number(v)} %`}><span>T{i+1}</span><progress max={100} value={v} aria-label={`Élément télescopique ${i+1}`}/><b>{number(v)}<small>%</small></b></div>)}</div></div>
            <div className="component-heading"><h2>Dans le détail</h2><span>05 composants</span></div><div className="component-buttons" aria-label="Choisir un composant">{PARTS.map(p=><button key={p.id} className={selected===p.id?"selected":""} onClick={()=>showPart(p.id)} title={p.title} aria-label={p.title} aria-pressed={selected===p.id}>{p.number}</button>)}</div>
            <div className={`component-card ${part?"has-selection":""}`} aria-live="polite">{part?<><span className="component-number">{part.number}</span><div><h3>{part.title}</h3><p>{part.description}</p><strong>{part.detail}</strong></div></>:<><div className="component-empty-icon"><MoveUpRight size={21}/></div><div><h3>Inspecter une articulation</h3><p>Choisissez un composant ou observez le renvoi du coude en gros plan.</p></div></>}</div>
            <button className="inspect-button" onClick={detailView} disabled={!ready}><Focus size={17}/>{selected==="main"?"Observer le renvoi principal":"Observer le renvoi du coude"}<ArrowUpRight size={16}/></button>
            <details className="model-assumptions"><summary>Fidélité de la cinématique</summary><p>Les deux renvois ferment des boucles à longueurs constantes. Les vérins gardent un corps et une tige rigides ; les télescopes conservent leur recouvrement.</p><p>Les cotes des pivots, les courses, les vitesses et l’ordre de télescopage sont reconstruits. Les butées de la maquette ne sont pas les limites d’utilisation de la grue.</p><p>Le dépassement relatif de +15° est documenté par PALFINGER. La séquence n’est pas une procédure opérateur ni une simulation de charge.</p><a href={`${BROCHURE_URL}#page=6`} target="_blank" rel="noreferrer">Power Link Plus · brochure p. 6<ArrowUpRight size={14}/></a></details>
          </TabsContent>
          <TabsContent value="specs" className="specs-panel">
            <div className="section-heading"><h2>Fiche constructeur</h2><span className="verified-tag">PALFINGER</span></div>
            <p className="panel-intro">Valeurs maximales selon configuration et équipement.</p>
            <dl className="spec-list">{SPECS.map(([label,value,note])=><div key={label}><dt>{label}{note&&<small>{note}</small>}</dt><dd>{value}</dd></div>)}</dl>
            <div className="spec-important"><CircleHelp size={18}/><p><strong>18,2 t et 21 m sont deux maxima distincts.</strong> La charge admissible varie avec la portée et la configuration. Consultez le diagramme constructeur correspondant.</p></div>
            <h3 className="variants-title">Versions hydrauliques</h3><Table className="variants-table"><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Portée publiée</TableHead><TableHead>Masse</TableHead></TableRow></TableHeader><TableBody>{VARIANTS.map(v=><TableRow key={v.name}><TableCell><b>{v.name}</b></TableCell><TableCell>{v.reach} m</TableCell><TableCell>{v.weight} kg</TableCell></TableRow>)}</TableBody></Table>
            <p className="source-detail">Les portées des diagrammes sont publiées avec le bras principal à 20°. Elles ne décrivent pas les positions de cette maquette.</p>
            <figure className="reference-photo"><img src="./reference/pk-53002-sh.jpg" alt="Rendu constructeur de la Palfinger PK 53002 SH, bras repliés" loading="lazy"/><figcaption>Référence repliée · Rendu © PALFINGER</figcaption></figure>
            <a className="brochure-button" href={BROCHURE_URL} target="_blank" rel="noreferrer"><ArrowDownToLine size={17}/>Brochure constructeur PDF<ArrowUpRight size={16}/></a>
            <a className="full-source" href={PRODUCT_URL} target="_blank" rel="noreferrer">Voir la fiche et les diagrammes Palfinger<ArrowUpRight size={15}/></a>
          </TabsContent>

        </Tabs>
      </aside>
    </div>
    <section className="key-figures" aria-label="Caractéristiques clés du modèle"><div><span>Moment de levage max.</span><p>50,1 <small>t·m</small></p><span>491,5 kN·m</span></div><div><span>Capacité de levage max.</span><p>18,2 <small>t</small></p><span>Selon portée et configuration</span></div><div><span>Portée hydraulique max.</span><p>21 <small>m</small></p><span>32,5 m avec fly-jib optionnel</span></div><div><span>Rotation de la colonne</span><p className="infinity">∞ <small>continue</small></p><span>Sans butée fixe</span></div></section>
    <footer className="site-footer"><p>Étude indépendante · Cinématique reconstruite, sans valeur de plan ni de diagramme de charge.</p><a href={BROCHURE_URL} target="_blank" rel="noreferrer">Données Palfinger · brochure p. 6 & 11<ArrowUpRight size={14}/></a></footer>
  </main>;
}

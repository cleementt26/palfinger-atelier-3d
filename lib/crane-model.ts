import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import palfingerLogoSvg from "../public/brand/palfinger-logo.svg?raw";
import type { PartId } from "./crane-data";
import { GEOMETRY, INITIAL_JOINTS, solveLinkage, solvePrimaryLinkage, stageExtensions, type JointPose, type Vec2 } from "./crane-kinematics";
import { batchRigidMeshes, boxSection, flexibleHose, profilePlate } from "./crane-details";

// Appearance follows PALFINGER's public PK 53002 SH photographs: tapered welded
// boom boxes, dark knuckle links, exposed extension cylinders and separate covers.
// Proportions, plate thicknesses, fasteners and hose routes are illustrative; this
// is neither factory CAD nor a dimensional, collision or load-envelope model.
// Every mechanical centre, stroke and rigid-link length is kept in GEOMETRY.
export function createCrane(simple=false) {
  const root=new THREE.Group();root.name="PK 53002 SH · illustrative articulated assembly";
  const materials=new Map<string,THREE.MeshStandardMaterial>();
  const sourceGeometries=new Set<THREE.BufferGeometry>(),geometryCache=new Map<string,THREE.BufferGeometry>();
  const paint={red:0xc62525,redEdge:0xb51e20,dark:0x252a2e,cover:0x333a3e,steel:0xaab7bf,machined:0x6b777e,yellow:0xfddb30,rubber:0x101416};
  const material=(color:number,part:PartId,metalness=.38,roughness=.35)=>{
    const key=`${color}-${part}-${metalness}-${roughness}`;
    if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,metalness,roughness}));
    return materials.get(key)!;
  };
  const cached=(key:string,create:()=>THREE.BufferGeometry)=>{if(!geometryCache.has(key)){const g=create();geometryCache.set(key,g);sourceGeometries.add(g);}return geometryCache.get(key)!;};
  const mesh=(parent:THREE.Object3D,geo:THREE.BufferGeometry,color:number,part:PartId,pos:number[]=[0,0,0],metalness=.38,roughness=.35)=>{
    sourceGeometries.add(geo);const m=new THREE.Mesh(geo,material(color,part,metalness,roughness));m.position.set(pos[0],pos[1],pos[2]);m.castShadow=true;m.receiveShadow=true;m.userData.part=part;parent.add(m);return m;
  };
  const box=(parent:THREE.Object3D,size:number[],pos:number[],color:number,part:PartId,r=.025)=>{
    const radius=Math.min(r,...size.map(v=>v*.23));return mesh(parent,cached(`box:${size}:${radius}:${simple}`,()=>simple||radius<.005?new THREE.BoxGeometry(...size as [number,number,number]):new RoundedBoxGeometry(...size as [number,number,number],1,radius)),color,part,pos);
  };
  const cyl=(parent:THREE.Object3D,r:number,len:number,pos:number[],color:number,part:PartId,radial=20)=>mesh(parent,cached(`cyl:${r}:${len}:${radial}:${simple}`,()=>new THREE.CylinderGeometry(r,r,len,simple?Math.min(radial,8):radial)),color,part,pos,color===paint.steel?.9:.45,color===paint.steel?.22:.34);
  const alongZ=(m:THREE.Mesh)=>{m.rotation.x=Math.PI/2;return m;};
  const ring=(parent:THREE.Object3D,outer:number,inner:number,depth:number,pos:number[],color:number,part:PartId)=>{
    const key=`ring:${outer}:${inner}:${depth}:${simple}`;
    return mesh(parent,cached(key,()=>{const shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:simple?4:10});geo.translate(0,0,-depth/2);return geo;}),color,part,pos,color===paint.steel?.82:.45);
  };
  const plate=(parent:THREE.Object3D,points:number[][],depth:number,pos:number[],color:number,part:PartId,holes:{x:number;y:number;r:number}[]=[])=>mesh(parent,profilePlate(points,depth,holes,simple),color,part,pos);
  const bolt=(parent:THREE.Object3D,x:number,y:number,z:number,part:PartId,r=.027)=>{
    if(simple)return;ring(parent,r*1.45,r*.65,.012,[x,y,z],paint.machined,part);alongZ(cyl(parent,r,.028,[x,y,z+Math.sign(z||1)*.016],paint.steel,part,6));
  };
  const pivot=(parent:THREE.Object3D,x:number,y:number,r:number,width:number,part:PartId)=>{
    alongZ(cyl(parent,r*.47,width+.095,[x,y,0],paint.steel,part,16));
    for(const side of [-1,1]) {
      ring(parent,r,r*.48,.068,[x,y,side*(width/2-.02)],paint.dark,part);
      ring(parent,r*.71,r*.48,.018,[x,y,side*(width/2+.025)],paint.machined,part);
      alongZ(cyl(parent,r*.45,.025,[x,y,side*(width/2+.046)],paint.dark,part,16));
      if(!simple){const keeper=box(parent,[r*.55,r*.17,.021],[x+r*.29,y-r*.34,side*(width/2+.05)],paint.dark,part,.004);keeper.rotation.z=-.2;bolt(parent,x+r*.48,y-r*.31,side*(width/2+.065),part,r*.09);}
    }
  };
  const clevis=(parent:THREE.Object3D,x:number,y:number,r:number,z:number,part:PartId,lean=0,color=paint.red)=>{
    const points=[[-r*1.25,-r*1.38],[r*1.28,-r*1.38],[r*1.13,r*.4],[r*.72,r*.9],[-r*.72,r*.9],[-r*1.13,r*.4]];
    for(const side of [-1,1]){const ear=plate(parent,points,.065,[x,y,side*z],color,part,[{x:0,y:0,r:r*.42}]);ear.rotation.z=lean;}
    pivot(parent,x,y,r*.84,z*2+.07,part);
  };
  const cylinderClevis=(parent:THREE.Object3D,x:number,y:number,r:number,centerZ:number,halfGap:number,part:PartId,lean=0)=>{
    const mount=new THREE.Group();mount.name=`${part} · paired cylinder mounting lugs`;mount.position.z=centerZ;parent.add(mount);
    clevis(mount,x,y,r,halfGap,part,lean);
    // A short transverse web ties the outside lug pair back to the boom skin.
    box(parent,[r*1.9,r*.45,Math.max(.045,centerZ-.30)],[x,y-r*1.1,(centerZ+.30)/2],paint.red,part,.009);
  };
  const weld=(parent:THREE.Object3D,length:number,pos:number[],part:PartId,rotation=0)=>{if(simple)return;const seam=box(parent,[length,.013,.014],pos,paint.redEdge,part,.002);seam.rotation.z=rotation;};
  const anchor=(parent:THREE.Object3D,position:number[])=>{const o=new THREE.Object3D();o.position.set(position[0],position[1],position[2]);parent.add(o);return o;};
  const hose=(parent:THREE.Object3D,pts:number[][],part:PartId,r=.026)=>mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p as [number,number,number]))),simple?8:20,r,simple?4:6,false),paint.rubber,part,undefined,.08,.66);
  const ferrule=(parent:THREE.Object3D,pos:number[],part:PartId,rotation=0,r=.035)=>{const f=cyl(parent,r,.08,pos,paint.steel,part,6);f.rotation.z=rotation;return f;};
  // The official supplied SVG is triangulated, preserving the actual wordmark
  // and its 107:23 proportion in WebGL and in the texture-free SVG fallback.
  const logoPaths=new SVGLoader().parse(palfingerLogoSvg).paths;
  const sourceLogoShapes=logoPaths.flatMap(path=>SVGLoader.createShapes(path).map(shape=>({shape,color:path.color.getHex()})));
  let logoFaces=sourceLogoShapes;
  if(simple) {
    // SVGRenderer sorts triangles by centroid depth, not with a depth buffer.
    // A yellow polygon under the letters can therefore paint over black glyphs
    // on a sloping arm. This exact vector mosaic has no overlapping faces:
    // subtract each glyph contour, then restore its yellow counters as islands.
    const background=sourceLogoShapes[0].shape.clone(),yellow=sourceLogoShapes[0].color;
    const islands:{shape:THREE.Shape;color:number}[]=[];
    for(const glyph of sourceLogoShapes.slice(1)) {
      const outline=new THREE.Path();outline.curves=glyph.shape.curves.map(curve=>curve.clone());background.holes.push(outline);
      for(const counter of glyph.shape.holes){const island=new THREE.Shape();island.curves=counter.curves.map(curve=>curve.clone());islands.push({shape:island,color:yellow});}
    }
    logoFaces=[{shape:background,color:yellow},...islands,...sourceLogoShapes.slice(1)];
  }
  const logoGeometry=logoFaces.map(({shape,color})=>{
    const geometry=new THREE.ShapeGeometry(shape,simple?3:7);geometry.translate(-53.5,-11.5,0);geometry.scale(1,-1,1);
    // Bake SVG's downward Y axis, then repair winding. Both renderers now see
    // front faces without relying on WebGL's negative-scale compensation.
    const index=geometry.getIndex()!;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}index.needsUpdate=true;
    return {geometry,color};
  });
  logoGeometry.forEach(({geometry})=>sourceGeometries.add(geometry));
  const logo=(parent:THREE.Object3D,width:number,pos:number[],part:PartId,back=false)=>{
    const group=new THREE.Group();parent.add(group);group.position.set(...pos as [number,number,number]);if(back)group.rotation.y=Math.PI;group.name="Official PALFINGER wordmark";
    logoGeometry.forEach(({geometry,color},i)=>{const m=mesh(group,geometry,color,part,[0,0,simple?0:i>0?.0008:0],.05,.6);m.scale.set(width/107,width/107,1);});return group;
  };
  const label=(parent:THREE.Object3D,text:string,w:number,h:number,pos:number[],part:PartId,back=false)=>{
    if(simple)return;
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=160;const ctx=canvas.getContext("2d")!;ctx.clearRect(0,0,1024,160);ctx.fillStyle="#FDDB30";ctx.font="500 98px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,512,88,980);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;const mat=new THREE.MeshStandardMaterial({map:tex,transparent:true,alphaTest:.15,roughness:.5,metalness:0,polygonOffset:true,polygonOffsetFactor:-1});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(...pos as [number,number,number]);if(back)m.rotation.y=Math.PI;m.userData.part=part;m.userData.noBatch=true;parent.add(m);return m;
  };
  const alignDecal=(decal:THREE.Object3D|undefined,x:number,depth:number,length:number,side:number)=>{if(!decal)return;const slope=depth*.12/(2*(length-.25));decal.position.z=side*(depth/2-slope*(x-.13)+.003);decal.rotation.y=side>0?Math.atan(slope):Math.PI-Math.atan(slope);};

  // Subdivide long faces only for the compatible painter-based renderer. Small
  // centroid spans prevent inside telescope faces painting through nearer skins.
  const section=(length:number,hA:number,wA:number,hB:number,wB:number,wall=0)=>boxSection(length,hA,wA,hB,wB,wall,simple?Math.max(1,Math.min(28,Math.ceil(length/.14))):1);

  // Welded mounting traverse and distinct nested outrigger sleeves. Their visual
  // deployment stays fixed; the articulated crane's existing mechanical API is unchanged.
  const traverse=mesh(root,section(2.74,.61,1.29,.61,1.29,.065),paint.red,"base",[0,1.085,-1.37]);traverse.rotation.y=-Math.PI/2;
  box(root,[1.45,.12,2.9],[0,1.425,0],paint.red,"base",.02);
  box(root,[1.4,.12,2.82],[0,.746,0],paint.redEdge,"base",.018);
  for(const side of [-1,1]) {
    for(const [length,height,width,start,color] of [[1.94,.41,.88,1.12,paint.dark],[1.35,.325,.69,2.48,paint.cover]] as number[][]){const beam=mesh(root,section(length,height,width,height,width,.035),color,"base",[0,1.06,side*start]);beam.rotation.y=-side*Math.PI/2;}
    box(root,[.99,.048,.12],[0,1.3,side*1.42],paint.machined,"base",.004);
    box(root,[.84,.044,.13],[0,1.254,side*2.96],paint.machined,"base",.004);
    for(const face of [-1,1]) {
      const rib=plate(root,[[0,0],[.12,0],[.12,.53],[0,.53]],.06,[face*.65,.78,side*.74],paint.redEdge,"base");rib.rotation.y=Math.PI/2;
      const gusset=plate(root,[[0,0],[.42,0],[0,.31]],.045,[face*.70,1.48,side*.5],paint.red,"base");gusset.rotation.y=side*Math.PI/2;
    }
    const leg=new THREE.Group();root.add(leg);leg.name=`Outrigger ${side} · jack and spherical pad`;leg.position.z=side*3.83;
    box(leg,[.76,.19,.40],[0,1.21,0],paint.dark,"base",.035);
    for(const face of [-1,1]){const ear=plate(leg,[[-.23,-.22],[.22,-.22],[.27,.12],[.17,.22],[-.17,.22],[-.27,.12]],.06,[0,1.04,face*.25],paint.dark,"base",[{x:0,y:0,r:.055}]);ear.rotation.z=.12;}
    pivot(leg,0,1.04,.10,.64,"base");
    cyl(leg,.17,.81,[0,.75,0],paint.dark,"base",24);
    cyl(leg,.186,.07,[0,1.12,0],paint.cover,"base",24);
    cyl(leg,.182,.055,[0,.35,0],paint.machined,"base",24);
    cyl(leg,.155,.025,[0,.322,0],paint.rubber,"base",24);
    cyl(leg,.097,.25,[0,.2,0],paint.steel,"base",20);
    const ball=mesh(leg,cached("foot-ball",()=>new THREE.SphereGeometry(.113,simple?8:16,simple?5:8)),paint.machined,"base",[0,.095,0],.68);
    const foot=mesh(leg,cached("foot-dish",()=>new THREE.CylinderGeometry(.14,.37,.115,simple?10:24)),paint.dark,"base",[0,.066,0]);foot.receiveShadow=true;
    cyl(leg,.38,.025,[0,.01,0],paint.dark,"base",24);
    if(!simple)for(let i=0;i<4;i++){const fin=plate(leg,[[.12,0],[.33,0],[.12,.12]],.026,[0,.04,0],paint.cover,"base");fin.rotation.y=i*Math.PI/2;}
    box(leg,[.06,.56,.085],[.18,.68,0],paint.cover,"base",.01);
    ferrule(leg,[.19,1.01,.08],"base",Math.PI/2,.032);
    hose(leg,[[.19,1.01,.08],[.29,1.14,.1],[.32,1.25,.12],[.15,1.28,.18]],"base",.02);
    for(let i=0;i<3;i++){const stripe=box(root,[.64,.025,.073],[0,1.238,side*(3.26+i*.13)],paint.yellow,"base",.002);stripe.rotation.y=.12*side;}
    logo(root,.56,[.729,1.105,side*.7],"base").rotation.y=Math.PI/2;
    for(const z of [side*.37,side*1.1]){const fix=alongZ(cyl(root,.046,.038,[.716,1.13,z],paint.dark,"base",6));fix.rotation.z=Math.PI/2;fix.rotation.y=Math.PI/2;}
  }
  // Slewing ring, visibly separate column shell, access covers and service block.
  const turret=new THREE.Group();turret.name="Rotating column";turret.position.y=1.49;root.add(turret);turret.userData.part="column";
  cyl(turret,.64,.16,[0,-.025,0],paint.dark,"column",simple?16:48);
  cyl(turret,.61,.075,[0,.085,0],paint.machined,"column",simple?16:48);
  cyl(turret,.575,.07,[0,.145,0],paint.red,"column",simple?16:40);
  if(!simple)for(let i=0;i<16;i++){const a=i*Math.PI/8;cyl(turret,.026,.035,[.588*Math.cos(a),.135,.588*Math.sin(a)],paint.steel,"column",6);}
  const columnProfile=[[-.46,.16],[.4,.16],[.32,.69],[.24,1.12],[-.20,1.28],[-.42,.93]];
  plate(turret,columnProfile,.73,[0,0,0],paint.red,"column");
  for(const side of [-1,1]) {
    plate(turret,[[-.36,.18],[.30,.18],[.26,.64],[-.18,.83],[-.4,.60]],.058,[0,0,side*.405],paint.cover,"column");
    box(turret,[.1,.21,.032],[-.14,.49,side*.443],paint.dark,"column",.015);
    if(!simple){for(const x of [-.28,.20])bolt(turret,x,.28,side*.45,"column",.017);}
    const guard=plate(turret,[[-.68,.25],[-.27,.25],[-.27,.91],[-.40,.98],[-.7,.91]],.20,[-.10,0,side*.60],paint.cover,"column");
    logo(turret,.42,[-.565,.79,side*.715],"column",side<0);
  }
  clevis(turret,.02,1.08,.27,.43,"column",0);
  // Cooler: frame, recessed fan, side louvres and a real guard perimeter.
  const cooler=new THREE.Group();cooler.name="Oil cooler and guard";cooler.position.set(.56,.47,.63);turret.add(cooler);
  box(cooler,[.64,.67,.21],[0,0,0],paint.dark,"column",.025);
  mesh(cooler,cached("fan-disc",()=>new THREE.CircleGeometry(.24,simple?12:28)),0x18232b,"column",[0,0,.111],.2,.72);
  cyl(cooler,.064,.036,[0,0,.14],paint.machined,"column",12).rotation.x=Math.PI/2;
  for(let i=0;i<(simple?4:7);i++){const blade=plate(cooler,[[.045,-.025],[.11,-.075],[.215,-.02],[.20,.06],[.08,.07]],.014,[0,0,.13],0x3b4a56,"column");blade.rotation.z=i*Math.PI*2/(simple?4:7);}
  for(const x of [-.302,.302])box(cooler,[.035,.66,.043],[x,0,.15],paint.cover,"column",.004);
  for(const y of [-.313,.313])box(cooler,[.64,.035,.043],[0,y,.15],paint.cover,"column",.004);
  for(let i=0;i<(simple?5:12);i++)box(cooler,[.57,.014,.017],[0,-.26+i*.52/(simple?4:11),.163],paint.dark,"column",.002);
  if(!simple)for(const x of [-.266,.266])for(const y of [-.277,.277])bolt(cooler,x,y,.17,"column",.014);
  // Valve bank and reachable manual controls, located at the column's service side.
  box(turret,[.26,.19,.71],[-.69,.73,-.09],paint.dark,"column",.025);
  for(let i=0;i<(simple?3:5);i++) {
    const z=-.34+i*(simple?.24:.12);box(turret,[.15,.16,.075],[-.76,.72,z],paint.machined,"column",.015);
    const lever=cyl(turret,.012,.21,[-.80,.88,z],paint.steel,"column",8);lever.rotation.z=-.3;
    mesh(turret,cached("lever-knob",()=>new THREE.SphereGeometry(.033,8,6)),paint.rubber,"column",[-.77,.985,z]);
  }
  if(!simple)for(let i=0;i<3;i++)hose(turret,[[-.62,.68,-.3+i*.14],[-.63,.38,-.4+i*.13],[-.31,.27,-.5+i*.13],[-.1,.37,-.49+i*.12]],"column",.017);

  const shoulder=new THREE.Group();shoulder.name="Main boom · shoulder pivot";shoulder.position.set(.02,1.08,0);turret.add(shoulder);
  const {mainLength,secondLength}=GEOMETRY;
  function arm(parent:THREE.Object3D,length:number,depth:number,part:PartId,rootHeight:number,tipHeight:number,hollow=false) {
    // The longitudinal chamfers continue through the tapered side skins. A hollow
    // outer knuckle admits the six nested steel sections rather than surrounding
    // them with the previous solid extruded block.
    const body=mesh(parent,section(length-.25,rootHeight,depth,tipHeight,depth*.88,hollow?.026:0),paint.red,part,[.13,.015,0]);body.name=`${part} · chamfered welded box`;
    for(const side of [-1,1]) {
      plate(parent,[[-.22,-.20],[-.19,.22],[.08,.32],[.60,rootHeight*.41],[.66,-rootHeight*.38],[.11,-.30]],.052,[0,0,side*(depth/2+.006)],paint.red,part,[{x:0,y:0,r:.128}]);
      plate(parent,[[length-.48,-tipHeight*.40],[length+.12,-.18],[length+.21,.05],[length+.10,.20],[length-.48,tipHeight*.40]],.052,[0,0,side*(depth*.44+.015)],paint.red,part,[{x:length,y:0,r:.1}]);
      if(!simple){
        const seamLength=length-.96;weld(parent,seamLength,[(length+.15)/2,-.5*(rootHeight+tipHeight)/2+.069,side*(depth*.43)],part,.024);
        // Local doubler plates surround force introduction points; no decorative
        // bolt rows are placed along the welded boom skins.
        plate(parent,[[.13,-.15],[.34,-.15],[.52,-.29],[.45,-.33],[.09,-.23]],.022,[0,0,side*(depth/2+.045)],paint.redEdge,part);
      }
    }
    pivot(parent,0,0,.24,depth+.18,part);pivot(parent,length,0,.19,depth*.88+.18,part);
  }
  arm(shoulder,mainLength,.66,"main",.79,.51);
  cylinderClevis(shoulder,GEOMETRY.primaryCylinder.x,GEOMETRY.primaryCylinder.y,.16,.57,.112,"main",-.35);
  for(const side of [-1,1]) {
    alignDecal(logo(shoulder,1.36,[1.40,.07,0],"main",side<0),1.4,.66,mainLength,side);
    alignDecal(label(shoulder,"PK 53002 SH",1.00,.15,[2.79,.06,0],"main",side<0),2.79,.66,mainLength,side);
    hose(shoulder,[[.33,.49,side*.26],[.75,.47,side*.29],[1.74,.41,side*.28],[3.23,.32,side*.25]],"main",.024);
    if(!simple)for(const x of [.82,1.8,2.8]){const y=.48-x*.049;box(shoulder,[.068,.076,.10],[x,y,side*.267],paint.dark,"main",.008);bolt(shoulder,x,y,side*.322,"main",.013);}
  }
  const elbow=new THREE.Group();elbow.name="Articulated knuckle boom";elbow.position.x=mainLength;shoulder.add(elbow);
  arm(elbow,secondLength,.55,"knuckle",.64,.535,true);
  for(const side of [-1,1])alignDecal(logo(elbow,1.02,[1.60,.065,0],"knuckle",side<0),1.6,.55,secondLength,side);
  const fixedP=GEOMETRY.linkBase,fixedQ=GEOMETRY.linkEye;
  clevis(shoulder,mainLength+fixedP.x,fixedP.y,.15,.45,"knuckle",-.1,paint.red);
  clevis(elbow,fixedQ.x,fixedQ.y,.135,.43,"knuckle",.4,paint.red);
  cylinderClevis(shoulder,mainLength+GEOMETRY.cylinderBase.x,GEOMETRY.cylinderBase.y,.12,.66,.087,"knuckle",Math.PI/2);
  hose(elbow,[[.55,.37,-.28],[1.04,.38,-.30],[2.14,.34,-.29],[2.76,.32,-.27]],"knuckle",.023);
  if(!simple)for(const x of [.94,1.94,2.7])box(elbow,[.07,.065,.092],[x,.375-x*.019,-.284],paint.dark,"knuckle",.007);

  const stages:THREE.Group[]=[];let parent:THREE.Object3D=elbow;
  const telescopeAnchors:{a:THREE.Object3D;b:THREE.Object3D}[]=[];
  for(let i=0;i<6;i++) {
    const g=new THREE.Group();g.name=`Telescopic section ${i+1} · rigid sleeve`;g.position.x=i===0?GEOMETRY.firstStageOffset:GEOMETRY.nestedStageOffset;parent.add(g);stages.push(g);
    const h=.47-i*.055,w=.405-i*.047,l=GEOMETRY.stageLength;
    mesh(g,section(l,h,w,h,w,.014),i<2?paint.dark:0x2e3337,"extensions");
    // Bolted collar / replaceable wear pads sit only at the sliding mouth.
    const collar=mesh(g,section(.105,h+.016,w+.014,h+.016,w+.014,.016),paint.cover,"extensions",[l-.09,0,0]);
    for(const side of [-1,1]) {
      box(g,[.075,.012,w*.54],[l-.04,side*(h/2+.004),0],paint.machined,"extensions",.002);
      if(!simple&&i>0){box(g,[.045,h*.36,.010],[l+.006,0,side*(w/2+.003)],paint.cover,"extensions",.002);bolt(g,l+.004,0,side*(w/2+.012),"extensions",.013);}
    }
    box(g,[.13,.027,w*.47],[.16,h/2-.002,0],paint.machined,"extensions",.003);
    const actuatorY=h/2+.12,actuatorZ=.30-i*.039;
    telescopeAnchors.push({a:anchor(parent,[i===0?.36:0,actuatorY,actuatorZ]),b:anchor(g,[1.90,actuatorY,actuatorZ])});
    for(const x of [.19,1.9])box(g,[.075,.14,.11],[x,actuatorY-.065,actuatorZ],paint.dark,"extensions",.008);
    if(!simple){const pipeZ=actuatorZ+.075;hose(g,[[.12,actuatorY-.02,pipeZ],[.29,actuatorY+.008,pipeZ],[1.73,actuatorY+.008,pipeZ],[1.87,actuatorY-.025,pipeZ]],"extensions",.012);}
    parent=g;
  }
  // Forged hook with a variable-width curved profile, throat, heel and safety
  // latch. It hangs from a double cheek adapter and stays vertical under gravity.
  for(const side of [-1,1])plate(parent,[[2.16,-.10],[2.17,.11],[2.37,.10],[2.44,-.055],[2.40,-.16],[2.27,-.16]],.055,[0,0,side*.115],paint.red,"extensions",[{x:GEOMETRY.hookOffset,y:-.08,r:.042}]);
  pivot(parent,GEOMETRY.hookOffset,-.08,.083,.31,"extensions");
  const hook=new THREE.Group();hook.name="Suspended hook · vertical gravity alignment";hook.position.set(GEOMETRY.hookOffset,-.08,0);parent.add(hook);
  ring(hook,.105,.061,.12,[0,-.08,0],paint.dark,"extensions");
  cyl(hook,.055,.18,[0,-.215,0],paint.steel,"extensions",16);
  cyl(hook,.095,.065,[0,-.29,0],paint.dark,"extensions",16);
  const hookShape=new THREE.Shape();hookShape.moveTo(-.055,-.285);hookShape.bezierCurveTo(-.05,-.40,-.18,-.50,-.21,-.64);hookShape.bezierCurveTo(-.25,-.82,-.095,-.86,.067,-.805);hookShape.bezierCurveTo(.19,-.76,.239,-.60,.18,-.51);hookShape.bezierCurveTo(.185,-.635,.11,-.721,.014,-.719);hookShape.bezierCurveTo(-.075,-.711,-.097,-.659,-.068,-.592);hookShape.bezierCurveTo(-.035,-.50,.077,-.41,.066,-.30);hookShape.closePath();
  const hookGeo=new THREE.ExtrudeGeometry(hookShape,{depth:.115,steps:1,bevelEnabled:!simple,bevelSize:.022,bevelThickness:.022,bevelSegments:2,curveSegments:simple?5:12});hookGeo.translate(0,0,-.0575);mesh(hook,hookGeo,paint.dark,"extensions",undefined,.68,.28);
  const latch=plate(hook,[[-.014,-.02],[.012,-.02],[.15,-.205],[.128,-.218]],.036,[.037,-.341,0],paint.steel,"extensions");
  alongZ(cyl(hook,.022,.155,[.045,-.359,0],paint.steel,"extensions",12));
  if(!simple)ring(hook,.045,.030,.023,[0,-.30,.073],paint.machined,"extensions");

  // Hydraulic rods and barrels are separate rigid parts. The only animated
  // operation is the rod group's axial translation; neither body is scaled.
  const cylinderPairs:{group:THREE.Group;rodGroup:THREE.Group;a:THREE.Object3D;b:THREE.Object3D;rodLength:number;cap:number;part:PartId;port:THREE.Object3D}[]=[];
  function hydraulic(a:THREE.Object3D,b:THREE.Object3D,part:PartId,r:number,cap:number,rodLength:number) {
    const group=new THREE.Group();group.name=`hydraulic-${cylinderPairs.length}-${part}-barrel`;root.add(group);
    const eyeR=r*.84,barrelStart=Math.max(.065,r*.72),barrelEnd=cap-.056;
    cyl(group,r,barrelEnd-barrelStart,[0,(barrelEnd+barrelStart)/2,0],paint.dark,part);
    cyl(group,r*1.035,.07,[0,barrelStart+.01,0],paint.cover,part);
    cyl(group,r*1.11,.075,[0,cap-.048,0],paint.machined,part);
    cyl(group,r*.83,.015,[0,cap-.004,0],paint.rubber,part);
    // Short weld-on eye necks make the cylinder ends visibly integral.
    box(group,[r*.95,barrelStart,r*.88],[0,barrelStart*.54,0],paint.dark,part,r*.2);
    ring(group,eyeR,eyeR*.48,r*.92,[0,0,0],paint.dark,part);
    ring(group,eyeR*.68,eyeR*.48,r*.97,[0,0,0],paint.machined,part);
    const rodGroup=new THREE.Group();rodGroup.name=`hydraulic-${cylinderPairs.length}-${part}-rod`;group.add(rodGroup);
    cyl(rodGroup,r*.54,rodLength,[0,-rodLength/2,0],paint.steel,part,20);
    cyl(rodGroup,r*.84,.055,[0,-rodLength+.04,0],0xb3a166,part);
    box(rodGroup,[r*.91,r*.63,r*.87],[0,-r*.3,0],paint.dark,part,r*.14);
    ring(rodGroup,eyeR*.93,eyeR*.48,r*.94,[0,0,0],paint.dark,part);
    ring(rodGroup,eyeR*.67,eyeR*.48,r*.99,[0,0,0],paint.machined,part);
    const portY=Math.min(.24,cap*.2),port=anchor(group,[r+.046,portY,.015]);
    if(!simple){
      ferrule(group,[r+.025,portY,0],part,Math.PI/2,r*.24);
      ferrule(group,[r+.025,cap-.16,0],part,Math.PI/2,r*.24);
      // Paired barrel ports linked by a protected fixed hydraulic hard line.
      hose(group,[[r+.055,portY,0],[r+.089,portY+.07,0],[r+.089,cap-.23,0],[r+.055,cap-.16,0]],part,r*.10);
      for(const y of [portY+.11,cap-.28])box(group,[r*.16,r*.2,r*.38],[r+.042,y,0],paint.cover,part,.004);
    }
    cylinderPairs.push({group,rodGroup,a,b,rodLength,cap,part,port});return {group,rodGroup,port};
  }
  const primaryEnd=anchor(turret,[0,0,.57]);
  const primaryHydraulic=hydraulic(anchor(shoulder,[GEOMETRY.primaryCylinder.x,GEOMETRY.primaryCylinder.y,.57]),primaryEnd,"main",.14,1.59,1.08);
  const linkageEnd=anchor(shoulder,[0,0,.66]);
  const secondaryHydraulic=hydraulic(anchor(shoulder,[mainLength+GEOMETRY.cylinderBase.x,GEOMETRY.cylinderBase.y,.66]),linkageEnd,"knuckle",.095,1.05,1.05);
  // Six pack centre spacing is 0.048 reconstruction units; these slender
  // radii keep adjacent rigid barrel/gland envelopes separate. Anchors unchanged.
  telescopeAnchors.forEach(({a,b})=>hydraulic(a,b,"extensions",.021,1.82,1.94));

  // Link side plates have bored eyes and a waisted web; their centre distances
  // remain exactly the lengths consumed by the two analytic closure solvers.
  function rigidLink(parent:THREE.Object3D,length:number,z:number,part:PartId) {
    const g=new THREE.Group();g.name=`${part} · rigid linkage plate`;g.position.z=z;parent.add(g);
    const r=.118,points=[[-r,-.043],[-.075,-.105],[.075,-.105],[length*.38,-.074],[length-.075,-.105],[length+.075,-.105],[length+r,-.043],[length+r,.043],[length+.075,.105],[length-.075,.105],[length*.40,.074],[.075,.105],[-.075,.105],[-r,.043]];
    plate(g,points,.092,[0,0,0],paint.dark,part,[{x:0,y:0,r:.045},{x:length,y:0,r:.045}]);
    for(const x of [0,length]){ring(g,.079,.045,.105,[x,0,0],paint.machined,part);if(!simple)ring(g,.06,.045,.113,[x,0,0],paint.steel,part);}
    return (a:Vec2,b:Vec2)=>{g.position.x=a.x;g.position.y=a.y;g.rotation.z=Math.atan2(b.y-a.y,b.x-a.x);};
  }
  const links=[-.49,.49].map(z=>({a:rigidLink(shoulder,GEOMETRY.linkA,z,"knuckle"),b:rigidLink(shoulder,GEOMETRY.linkB,z,"knuckle")}));
  const primaryLinks=[-.47,.47].map(z=>({a:rigidLink(turret,GEOMETRY.primaryLinkA,z,"main"),b:rigidLink(turret,GEOMETRY.primaryLinkB,z,"main")}));
  const dynamicPin=(parent:THREE.Object3D,r:number,width:number,part:PartId)=>{const g=new THREE.Group();g.name=`${part} · moving linkage pin`;parent.add(g);alongZ(cyl(g,r,width,[0,0,0],paint.steel,part,12));for(const side of [-1,1]){ring(g,r*1.52,r*.99,.026,[0,0,side*(width/2-.015)],paint.machined,part);alongZ(cyl(g,r*1.05,.038,[0,0,side*(width/2+.008)],paint.dark,part,6));}return g;};
  const primaryPins=[0,1,2].map(()=>dynamicPin(turret,.045,1.31,"main"));
  const linkPins=[0,1,2].map(()=>dynamicPin(shoulder,.04,1.46,"knuckle"));
  const offset=(p:Vec2)=>({x:mainLength+p.x,y:p.y});

  // Service loops have their end points and tangent controls attached to the
  // actual adjacent rigid bodies. Six small buffers deform with the solved pose.
  const movingHoses:{anchors:THREE.Object3D[];points:THREE.Vector3[];update:ReturnType<typeof flexibleHose>["update"]}[]=[];
  function movingHose(anchors:THREE.Object3D[],part:PartId,r=.022) {
    const flex=flexibleHose(simple?10:22,simple?4:6,r);const m=mesh(root,flex.geometry,paint.rubber,part,undefined,.07,.65);m.userData.dynamic=true;m.userData.dynamicBounds=true;m.name=`${part} · anchored flexible service loop`;m.frustumCulled=false;
    movingHoses.push({anchors,points:anchors.map(()=>new THREE.Vector3()),update:flex.update});
  }
  for(const offsetZ of (simple?[0]:[-.031,.031])) {
    const z=-.35+offsetZ;
    movingHose([anchor(turret,[-.22,.86,z]),anchor(turret,[-.42,1.38,z-.10]),anchor(shoulder,[.0,.82,z-.08]),anchor(shoulder,[.36,.485,z])],"main",.024);
    movingHose([anchor(shoulder,[mainLength-.43,.335,z]),anchor(shoulder,[mainLength-.02,.82,z-.09]),anchor(elbow,[.05,.86,z-.09]),anchor(elbow,[.59,.377,z])],"knuckle",.023);
  }
  if(!simple) {
    movingHose([anchor(shoulder,[2.13,-.26,.56]),anchor(shoulder,[2.04,-.52,.71]),anchor(primaryHydraulic.group,[.34,.33,.13]),primaryHydraulic.port],"main",.019);
    movingHose([anchor(shoulder,[1.60,.24,.62]),anchor(shoulder,[1.56,.50,.79]),anchor(secondaryHydraulic.group,[.25,.29,.11]),secondaryHydraulic.port],"knuckle",.017);
  }

  // Inspection overlay uses true solved joint centres; decorative hardware is
  // never treated as an independent degree of freedom.
  const axes=new THREE.Group();axes.name="Kinematic inspection axes";axes.userData.noBatch=true;root.add(axes);axes.visible=false;
  const axisMaterial=new THREE.MeshBasicMaterial({color:0xf0ad00,depthTest:false,transparent:true,opacity:.95});
  const jointAxes=Array.from({length:8},()=>{const g=new THREE.Group();g.userData.noBatch=true;axes.add(g);const pin=new THREE.Mesh(cached("inspection-pin",()=>new THREE.CylinderGeometry(.02,.02,1.72,8)),axisMaterial);pin.rotation.x=Math.PI/2;g.add(pin);for(const z of [-.84,.84]){const ringMesh=new THREE.Mesh(cached("inspection-ring",()=>new THREE.TorusGeometry(.115,.022,6,16)),axisMaterial);ringMesh.position.z=z;g.add(ringMesh);}g.renderOrder=20;return g;});
  const skeletonGeometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:4},()=>new THREE.Vector3()));
  const skeleton=new THREE.Line(skeletonGeometry,new THREE.LineBasicMaterial({color:0xe29d00,depthTest:false,transparent:true,opacity:.95}));skeleton.renderOrder=22;axes.add(skeleton);
  let mechanism=false;
  function showMechanism(show:boolean){if(show===mechanism)return;mechanism=show;axes.visible=show;for(const mat of materials.values()){mat.transparent=show;mat.opacity=show?.31:1;mat.depthWrite=!show;mat.needsUpdate=true;}}
  const markers:Record<PartId,THREE.Object3D>={base:anchor(root,[0,1.08,2.65]),column:anchor(turret,[-.32,.82,.55]),main:anchor(shoulder,[1.38,.34,.42]),knuckle:anchor(elbow,[1.45,.32,.35]),extensions:anchor(stages[3],[1.1,.15,.25])};
  const va=new THREE.Vector3(),vb=new THREE.Vector3(),direction=new THREE.Vector3(),normal=new THREE.Vector3(),right=new THREE.Vector3(),basis=new THREE.Matrix4();
  const poseCache:JointPose={...INITIAL_JOINTS};
  function setPose(pose:JointPose) {
    Object.assign(poseCache,pose);turret.rotation.y=THREE.MathUtils.degToRad(pose.rotation);shoulder.rotation.z=THREE.MathUtils.degToRad(pose.boom);elbow.rotation.z=THREE.MathUtils.degToRad(pose.knuckle);
    const extension=stageExtensions(pose.extension);stages.forEach((g,i)=>g.position.x=(i===0?GEOMETRY.firstStageOffset:GEOMETRY.nestedStageOffset)+extension[i]);hook.rotation.z=-shoulder.rotation.z-elbow.rotation.z;
    const linkage=solveLinkage(pose.knuckle),p=offset(linkage.p),q=offset(linkage.q),c=offset(linkage.c);links.forEach(link=>{link.a(p,c);link.b(c,q);});[p,c,q].forEach((point,i)=>linkPins[i].position.set(point.x,point.y,0));linkageEnd.position.set(c.x,c.y,.66);
    const primary=solvePrimaryLinkage(pose.boom),baseOffset=(point:Vec2)=>({x:GEOMETRY.shoulderX+point.x,y:GEOMETRY.shoulderLocalY+point.y});const pp=baseOffset(primary.p),pc=baseOffset(primary.c),pq=baseOffset(primary.q);primaryLinks.forEach(link=>{link.a(pp,pc);link.b(pc,pq);});[pp,pc,pq].forEach((point,i)=>primaryPins[i].position.set(point.x,point.y,0));primaryEnd.position.set(pc.x,pc.y,.57);
    root.updateMatrixWorld(true);normal.set(0,0,1).applyQuaternion(turret.quaternion);
    for(const cylinder of cylinderPairs){cylinder.a.getWorldPosition(va);root.worldToLocal(va);cylinder.b.getWorldPosition(vb);root.worldToLocal(vb);direction.subVectors(vb,va);const len=direction.length();direction.divideScalar(len);right.crossVectors(direction,normal).normalize();basis.makeBasis(right,direction,normal);cylinder.group.position.copy(va);cylinder.group.quaternion.setFromRotationMatrix(basis);cylinder.rodGroup.position.y=len;}
    root.updateMatrixWorld(true);
    for(const flex of movingHoses){flex.anchors.forEach((a,i)=>{a.getWorldPosition(flex.points[i]);root.worldToLocal(flex.points[i]);});flex.update(flex.points,normal);}
    const positions=[shoulder.getWorldPosition(va.clone()),elbow.getWorldPosition(vb.clone()),...[p,c,q].map(point=>shoulder.localToWorld(new THREE.Vector3(point.x,point.y,0))),...[pp,pc,pq].map(point=>turret.localToWorld(new THREE.Vector3(point.x,point.y,0)))];
    jointAxes.forEach((axis,i)=>{axis.position.copy(positions[i]);axis.quaternion.copy(turret.quaternion);});const path=[turret.localToWorld(new THREE.Vector3(0,0,0)),positions[0],positions[1],hook.getWorldPosition(va.clone())];const attr=skeletonGeometry.getAttribute("position");path.forEach((v,i)=>attr.setXYZ(i,v.x,v.y,v.z));attr.needsUpdate=true;skeletonGeometry.computeBoundingSphere();root.updateMatrixWorld(true);
  }
  function select(part:PartId|null){for(const [key,mat] of materials){mat.emissive.setHex(key.includes(`-${part}-`)?0x80651a:0x000000);mat.emissiveIntensity=part?.17:0;}}
  const staticMeshesMerged=batchRigidMeshes(root);
  const geometryStats={triangles:0,meshes:0,materials:0,staticMeshesMerged,movingHoses:movingHoses.length,sections:stages.length};
  const usedMaterials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometryStats.meshes++;geometryStats.triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.getAttribute("position").count)/3;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>usedMaterials.add(m));}});geometryStats.materials=usedMaterials.size;
  function dispose(){const geometries=new Set<THREE.BufferGeometry>(sourceGeometries),mats=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});geometries.forEach(g=>g.dispose());mats.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial)m.map?.dispose();m.dispose();});}
  setPose(INITIAL_JOINTS);
  return {root,markers,setPose,select,dispose,showMechanism,focus:()=>elbow.getWorldPosition(new THREE.Vector3()),tip:()=>hook.getWorldPosition(new THREE.Vector3()),inspect:()=>({pose:{...poseCache},geometry:{...geometryStats},cylinders:cylinderPairs.map(c=>({part:c.part,length:c.rodGroup.position.y,piston:c.rodGroup.position.y-c.rodLength,cap:c.cap,rigidScale:c.group.scale.toArray(),barrelOrigin:c.group.getWorldPosition(new THREE.Vector3()).toArray(),rodEndpoint:c.rodGroup.getWorldPosition(new THREE.Vector3()).toArray(),anchorA:c.a.getWorldPosition(new THREE.Vector3()).toArray(),anchorB:c.b.getWorldPosition(new THREE.Vector3()).toArray()}))})};
}

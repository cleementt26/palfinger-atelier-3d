import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { PartId } from "./crane-data";
import { GEOMETRY, INITIAL_JOINTS, solveLinkage, solvePrimaryLinkage, stageExtensions, type JointPose, type Vec2 } from "./crane-kinematics";

// Illustrative geometry reconstructed from the manufacturer's public references.
// This is deliberately not a dimensional CAD model or a load-envelope model.
export function createCrane(simple=false) {
  const root = new THREE.Group();
  const materials = new Map<string,THREE.MeshStandardMaterial>();
  const paint = {red:0xc82724, dark:0x262c31, steel:0xb8c4cb, yellow:0xffdb13, rubber:0x151b20};
  const material = (color:number,part:PartId,metalness=.35,roughness=.35) => {
    const key = `${color}-${part}-${metalness}`;
    if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({color,metalness,roughness}));
    return materials.get(key)!;
  };
  const mesh = (parent:THREE.Object3D,geo:THREE.BufferGeometry,color:number,part:PartId,pos:number[]=[0,0,0],metalness=.35) => {
    const m = new THREE.Mesh(geo,material(color,part,metalness));
    m.position.set(pos[0],pos[1],pos[2]); m.castShadow=true;m.receiveShadow=true;m.userData.part=part;parent.add(m);return m;
  };
  const box = (parent:THREE.Object3D,size:number[],pos:number[],color:number,part:PartId,r=.045) => mesh(parent,simple?new THREE.BoxGeometry(size[0],size[1],size[2]):new RoundedBoxGeometry(size[0],size[1],size[2],2,r),color,part,pos);
  const cyl = (parent:THREE.Object3D,r:number,len:number,pos:number[],color:number,part:PartId,radial=24) => mesh(parent,new THREE.CylinderGeometry(r,r,len,simple?Math.min(radial,12):radial),color,part,pos,color===paint.steel?.85:.35);
  const pivot = (parent:THREE.Object3D,x:number,y:number,r:number,width:number,part:PartId) => {
    const a=cyl(parent,r,width,[x,y,0],paint.dark,part);a.rotation.x=Math.PI/2;
    for(const z of [-1,1]) {const b=cyl(parent,r*.37,.045,[x,y,z*(width/2+.025)],paint.steel,part,6);b.rotation.x=Math.PI/2;}
  };
  const bolt = (parent:THREE.Object3D,x:number,y:number,z:number,part:PartId) => {const b=cyl(parent,.035,.035,[x,y,z],paint.steel,part,6);b.rotation.x=Math.PI/2;};
  const label=(parent:THREE.Object3D,text:string,w:number,h:number,pos:number[],part:PartId,bg="#ffdb13",fg="#192022",back=false) => {
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=128;const ctx=canvas.getContext("2d")!;
    ctx.fillStyle=bg;ctx.fillRect(0,0,1024,128);ctx.fillStyle=fg;ctx.font="900 83px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,512,69,960);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    const mat=new THREE.MeshStandardMaterial({map:tex,color:simple?bg:0xffffff,roughness:.5,metalness:.1});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(pos[0],pos[1],pos[2]);if(back)m.rotation.y=Math.PI;m.userData.part=part;parent.add(m);return m;
  };
  const anchor=(parent:THREE.Object3D,position:number[])=>{const o=new THREE.Object3D();o.position.set(position[0],position[1],position[2]);parent.add(o);return o;};
  const hose=(parent:THREE.Object3D,pts:number[][],part:PartId,r=.035)=>mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p as [number,number,number]))),simple?12:28,r,simple?5:7,false),paint.rubber,part);

  // Transverse base, telescopic outrigger beams, leveling cylinders and pads.
  box(root,[1.28,.58,2.5],[0,1.06,0],paint.red,"base",.075);
  box(root,[1.48,.12,2.68],[0,1.39,0],paint.red,"base");
  for(const side of [-1,1]) {
    box(root,[.72,.32,2.52],[0,.99,side*2.06],paint.dark,"base");
    box(root,[.58,.24,1.3],[0,.99,side*3.11],paint.dark,"base");
    box(root,[.62,.75,.5],[0,.83,side*3.82],paint.dark,"base");
    cyl(root,.17,.82,[0,.82,side*3.82],paint.dark,"base");
    cyl(root,.09,.5,[0,.33,side*3.82],paint.steel,"base");
    const foot=mesh(root,new THREE.CylinderGeometry(.2,.38,.14,24),paint.dark,"base",[0,.1,side*3.82]);foot.receiveShadow=true;
    box(root,[.64,.09,.64],[0,.025,side*3.82],paint.dark,"base");
    for(let i=0;i<3;i++) box(root,[.74,.055,.085],[0,1.165,side*(2.85+i*.16)],paint.yellow,"base",.005);
    label(root,"PALFINGER",.62,.1,[.645,1.1,side*.72],"base").rotation.y=Math.PI/2;
  }
  for(const z of [-1.17,-.86,-.55,.55,.86,1.17]) bolt(root,.65,1.1,z,"base");
  const turret=new THREE.Group();turret.position.y=1.49;root.add(turret);turret.userData.part="column";
  cyl(turret,.61,.17,[0,0,0],paint.dark,"column",48);
  cyl(turret,.55,.13,[0,.1,0],paint.red,"column",48);
  for(let i=0;i<20;i++){const a=i*Math.PI/10;cyl(turret,.025,.05,[.565*Math.cos(a),.106,.565*Math.sin(a)],paint.steel,"column",6);}
  box(turret,[.69,1.1,.75],[-.04,.68,0],paint.red,"column",.1);
  box(turret,[.58,.76,.82],[-.27,.52,0],paint.dark,"column",.12);
  for(const z of [-.63,.63]) {
    box(turret,[.55,.73,.32],[-.45,.48,z],paint.dark,"column",.07);
    label(turret,"PALFINGER",.46,.08,[-.44,.64,z+(z>0?.17:-.17)],"column","#ffdb13","#192022",z<0);
  }
  // Oil cooler, protective grille and control levers.
  box(turret,[.64,.65,.2],[.48,.47,.63],paint.dark,"column");
  const fan=mesh(turret,new THREE.CircleGeometry(.25,32),0x39434a,"column",[.48,.47,.737]);
  for(let i=0;i<5;i++){const blade=box(turret,[.085,.43,.025],[.48,.47,.75],0x333c42,"column",.02);blade.rotation.z=i*Math.PI/5;}
  for(let i=0;i<12;i++)box(turret,[.58,.013,.015],[.48,.2+i*.047,.78],paint.dark,"column",.002);
  for(let i=0;i<5;i++){cyl(turret,.016,.21,[-.78,.83,-.38+i*.13],paint.steel,"column",8);mesh(turret,new THREE.SphereGeometry(.038,8,8),paint.dark,"column",[-.78,.94,-.38+i*.13]);}
  const shoulder=new THREE.Group();shoulder.position.set(.02,1.08,0);turret.add(shoulder);
  const {mainLength,secondLength}=GEOMETRY;
  function arm(parent:THREE.Object3D,length:number,depth:number,part:PartId) {
    const shape=new THREE.Shape();shape.moveTo(-.18,-.23);shape.lineTo(.32,-.43);shape.lineTo(length-.1,-.25);shape.lineTo(length+.21,.02);shape.lineTo(length-.15,.27);shape.lineTo(.26,.39);shape.lineTo(-.18,.24);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:!simple,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.035});geo.translate(0,0,-depth/2);
    mesh(parent,geo,paint.red,part);
    for(const side of [-1,1]) {
      box(parent,[length-.45,.065,.028],[length/2,-.23,side*(depth/2+.047)],0xe53a30,part,.007);
      for(let i=1;i<5;i++)bolt(parent,i*length/5, i%2?-.21:.21,side*(depth/2+.06),part);
    }
    pivot(parent,0,0,.28,depth+.16,part);pivot(parent,length,0,.22,depth+.14,part);
  }
  arm(shoulder,mainLength,.64,"main");
  for(const side of [-1,1]) {
    label(shoulder,"PALFINGER",1.46,.23,[1.42,.075,side*.361],"main","#ffdb13","#192022",side<0);
    label(shoulder,"PK 53002 SH",1.08,.115,[2.78,.05,side*.365],"main","#c82724","#ffdb13",side<0);
    hose(shoulder,[[.0,.44,side*.22],[.25,.56,side*.25],[1.6,.48,side*.28],[3.25,.36,side*.28]],"main",.028);
  }
  const elbow=new THREE.Group();elbow.position.x=mainLength;shoulder.add(elbow);
  arm(elbow,secondLength,.51,"knuckle");
  hose(elbow,[[.65,.36,-.24],[1.2,.37,-.28],[2.2,.32,-.28],[2.8,.31,-.28]],"knuckle",.03);
  for(const side of [-1,1])label(elbow,"PALFINGER",1.0,.16,[1.7,.075,side*.296],"knuckle","#ffdb13","#192022",side<0);
  const stages:THREE.Group[]=[];let parent:THREE.Object3D=elbow;
  const telescopeAnchors:{a:THREE.Object3D;b:THREE.Object3D}[]=[];
  for(let i=0;i<6;i++) {
    const g=new THREE.Group();g.position.x=i===0?GEOMETRY.firstStageOffset:GEOMETRY.nestedStageOffset;parent.add(g);stages.push(g);
    const h=.47-i*.055,w=.405-i*.047,l=GEOMETRY.stageLength;
    // Hollow rectangular sections: nested solids no longer occupy the same metal.
    const outer=new THREE.Shape();outer.moveTo(-h/2,-w/2);outer.lineTo(h/2,-w/2);outer.lineTo(h/2,w/2);outer.lineTo(-h/2,w/2);outer.closePath();
    const wall=.014,inner=new THREE.Path();inner.moveTo(-h/2+wall,-w/2+wall);inner.lineTo(-h/2+wall,w/2-wall);inner.lineTo(h/2-wall,w/2-wall);inner.lineTo(h/2-wall,-w/2+wall);inner.closePath();outer.holes.push(inner);
    const tube=new THREE.ExtrudeGeometry(outer,{depth:l,bevelEnabled:false,steps:1});
    // original (x,y,z) -> (z,x,y), maps section axes onto the beam's YZ plane.
    tube.applyMatrix4(new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1));
    mesh(g,tube,paint.dark,"extensions");
    box(g,[.1,.028,w+.035],[l-.07,h/2+.007,0],0x4b545b,"extensions",.005);
    box(g,[.1,.028,w+.035],[l-.07,-h/2-.007,0],0x4b545b,"extensions",.005);
    for(const side of [-1,1]){box(g,[.1,h,.025],[l-.07,0,side*(w/2+.01)],0x4b545b,"extensions",.005);bolt(g,l-.07,0,side*(w/2+.029),"extensions");}
    // Wear pads and an individual actuator for every sliding element.
    box(g,[.13,.035,.08],[.12,h/2,0],paint.steel,"extensions",.004);
    const actuatorY=h/2+.12,actuatorZ=.30-i*.039;
    telescopeAnchors.push({a:anchor(parent,[i===0?.36:0,actuatorY,actuatorZ]),b:anchor(g,[1.90,actuatorY,actuatorZ])});
    box(g,[.09,.16,.09],[1.9,actuatorY-.06,actuatorZ],paint.dark,"extensions",.006);
    parent=g;
  }
  // The terminal adapter belongs to the telescope; only the suspended hook turns.
  box(parent,[.25,.24,.25],[GEOMETRY.hookOffset-.09,0,0],paint.red,"extensions",.035);
  pivot(parent,GEOMETRY.hookOffset,-.08,.08,.32,"extensions");
  const hook=new THREE.Group();hook.position.set(GEOMETRY.hookOffset,-.08,0);parent.add(hook);
  cyl(hook,.065,.26,[0,-.24,0],paint.steel,"extensions");
  const hookCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.33,0),new THREE.Vector3(-.04,-.5,0),new THREE.Vector3(-.18,-.69,0),new THREE.Vector3(-.07,-.81,0),new THREE.Vector3(.13,-.76,0),new THREE.Vector3(.19,-.57,0)]);
  mesh(hook,new THREE.TubeGeometry(hookCurve,24,.065,10,false),paint.dark,"extensions");
  const latch=box(hook,[.025,.23,.028],[.105,-.48,0],paint.steel,"extensions",.005);latch.rotation.z=.52;

  // The hydraulic assemblies connect moving local anchors in world space.
  const cylinderPairs:{group:THREE.Group;rodGroup:THREE.Group;a:THREE.Object3D;b:THREE.Object3D;rodLength:number;cap:number;part:PartId}[]=[];
  function hydraulic(a:THREE.Object3D,b:THREE.Object3D,part:PartId,r:number,cap:number,rodLength:number) {
    const group=new THREE.Group();root.add(group);
    const barrel=cyl(group,r,cap-.02,[0,(cap+.02)/2,0],paint.dark,part);
    cyl(group,r*1.08,.065,[0,cap-.03,0],0x53616a,part);
    cyl(group,r*1.06,.075,[0,.065,0],paint.dark,part);
    const rodGroup=new THREE.Group();group.add(rodGroup);
    cyl(rodGroup,r*.54,rodLength,[0,-rodLength/2,0],paint.steel,part);
    // The piston remains in the same rigid barrel; it is visible in mechanism mode.
    cyl(rodGroup,r*.84,.055,[0,-rodLength+.04,0],0xdec548,part);
    mesh(group,new THREE.TorusGeometry(r*.72,r*.28,6,16),paint.dark,part);
    mesh(rodGroup,new THREE.TorusGeometry(r*.70,r*.26,6,16),paint.dark,part);
    cylinderPairs.push({group,rodGroup,a,b,rodLength,cap,part});
    return barrel;
  }
  const primaryEnd=anchor(turret,[0,0,.57]);
  hydraulic(anchor(shoulder,[GEOMETRY.primaryCylinder.x,GEOMETRY.primaryCylinder.y,.57]),primaryEnd,"main",.14,1.59,1.08);
  const linkageEnd=anchor(shoulder,[0,0,.66]);
  hydraulic(anchor(shoulder,[mainLength+GEOMETRY.cylinderBase.x,GEOMETRY.cylinderBase.y,.66]),linkageEnd,"knuckle",.095,1.05,1.05);
  telescopeAnchors.forEach(({a,b})=>hydraulic(a,b,"extensions",.045,1.82,1.94));

  // Actual rigid links, with their pivots coincident with the closure solution.
  function rigidLink(parent:THREE.Object3D,length:number,z:number,part:PartId){
    const g=new THREE.Group();g.position.z=z;parent.add(g);
    box(g,[length,.14,.12],[length/2,0,0],paint.dark,part,.055);
    for(const x of [0,length]){const eye=cyl(g,.105,.16,[x,0,0],paint.dark,part,16);eye.rotation.x=Math.PI/2;const pin=cyl(g,.038,.185,[x,0,0],paint.steel,part,12);pin.rotation.x=Math.PI/2;}
    return (a:Vec2,b:Vec2)=>{g.position.x=a.x;g.position.y=a.y;g.rotation.z=Math.atan2(b.y-a.y,b.x-a.x);};
  }
  const links=[-.49,.49].map(z=>({a:rigidLink(shoulder,GEOMETRY.linkA,z,"knuckle"),b:rigidLink(shoulder,GEOMETRY.linkB,z,"knuckle")}));
  const primaryLinks=[-.47,.47].map(z=>({a:rigidLink(turret,GEOMETRY.primaryLinkA,z,"main"),b:rigidLink(turret,GEOMETRY.primaryLinkB,z,"main")}));
  const primaryPins=[0,1,2].map(()=>{const p=cyl(turret,.045,1.31,[0,0,0],paint.steel,"main",12);p.rotation.x=Math.PI/2;return p;});
  const linkPins=[0,1,2].map(()=>{const p=cyl(shoulder,.04,1.46,[0,0,0],paint.steel,"knuckle",12);p.rotation.x=Math.PI/2;return p;});
  const offset=(p:Vec2)=>({x:mainLength+p.x,y:p.y});

  // Inspection overlay: real joint centres, not decorative nodes.
  const axes=new THREE.Group();root.add(axes);axes.visible=false;
  const axisMaterial=new THREE.MeshBasicMaterial({color:0xf0ad00,depthTest:false,transparent:true,opacity:.95});
  const jointAxes=Array.from({length:8},()=>{const g=new THREE.Group();axes.add(g);const pin=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,1.72,8),axisMaterial);pin.rotation.x=Math.PI/2;g.add(pin);for(const z of [-.84,.84]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.115,.022,6,16),axisMaterial);ring.position.z=z;g.add(ring);}g.renderOrder=20;return g;});
  const skeletonGeometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:4},()=>new THREE.Vector3()));
  const skeleton=new THREE.Line(skeletonGeometry,new THREE.LineBasicMaterial({color:0xe29d00,depthTest:false,transparent:true,opacity:.95}));skeleton.renderOrder=22;axes.add(skeleton);
  let mechanism=false;
  function showMechanism(show:boolean){if(show===mechanism)return;mechanism=show;axes.visible=show;for(const mat of materials.values()){mat.transparent=show;mat.opacity=show?.34:1;mat.depthWrite=!show;mat.needsUpdate=true;}}

  const markers:Record<PartId,THREE.Object3D>={
    base:anchor(root,[0,1.08,2.65]),column:anchor(turret,[-.32,.82,.55]),
    main:anchor(shoulder,[1.38,.34,.42]),knuckle:anchor(elbow,[1.45,.32,.35]),
    extensions:anchor(stages[3],[1.1,.15,.25]),
  };
  const va=new THREE.Vector3(),vb=new THREE.Vector3(),direction=new THREE.Vector3(),normal=new THREE.Vector3(),right=new THREE.Vector3(),basis=new THREE.Matrix4();
  const poseCache:JointPose={...INITIAL_JOINTS};
  function setPose(pose:JointPose) {
    Object.assign(poseCache,pose);
    turret.rotation.y=THREE.MathUtils.degToRad(pose.rotation);
    shoulder.rotation.z=THREE.MathUtils.degToRad(pose.boom);
    elbow.rotation.z=THREE.MathUtils.degToRad(pose.knuckle);
    const extension=stageExtensions(pose.extension);
    stages.forEach((g,i)=>g.position.x=(i===0?GEOMETRY.firstStageOffset:GEOMETRY.nestedStageOffset)+extension[i]);
    hook.rotation.z=-shoulder.rotation.z-elbow.rotation.z;
    const linkage=solveLinkage(pose.knuckle),p=offset(linkage.p),q=offset(linkage.q),c=offset(linkage.c);
    links.forEach(link=>{link.a(p,c);link.b(c,q);});
    [p,c,q].forEach((point,i)=>linkPins[i].position.set(point.x,point.y,0));
    linkageEnd.position.set(c.x,c.y,.66);
    const primary=solvePrimaryLinkage(pose.boom),baseOffset=(point:Vec2)=>({x:GEOMETRY.shoulderX+point.x,y:GEOMETRY.shoulderLocalY+point.y});
    const pp=baseOffset(primary.p),pc=baseOffset(primary.c),pq=baseOffset(primary.q);
    primaryLinks.forEach(link=>{link.a(pp,pc);link.b(pc,pq);});
    [pp,pc,pq].forEach((point,i)=>primaryPins[i].position.set(point.x,point.y,0));
    primaryEnd.position.set(pc.x,pc.y,.57);
    root.updateMatrixWorld(true);
    normal.set(0,0,1).applyQuaternion(turret.quaternion);
    for(const c of cylinderPairs){
      c.a.getWorldPosition(va);root.worldToLocal(va);c.b.getWorldPosition(vb);root.worldToLocal(vb);
      direction.subVectors(vb,va);const len=direction.length();direction.divideScalar(len);
      right.crossVectors(direction,normal).normalize();basis.makeBasis(right,direction,normal);
      c.group.position.copy(va);c.group.quaternion.setFromRotationMatrix(basis);c.rodGroup.position.y=len;
    }
    const positions=[shoulder.getWorldPosition(va.clone()),elbow.getWorldPosition(vb.clone()),... [p,c,q].map(point=>shoulder.localToWorld(new THREE.Vector3(point.x,point.y,0))),...[pp,pc,pq].map(point=>turret.localToWorld(new THREE.Vector3(point.x,point.y,0)))];
    jointAxes.forEach((axis,i)=>{axis.position.copy(positions[i]);axis.quaternion.copy(turret.quaternion);});
    const path=[turret.localToWorld(new THREE.Vector3(0,0,0)),positions[0],positions[1],hook.getWorldPosition(va.clone())];
    const attr=skeletonGeometry.getAttribute("position");path.forEach((v,i)=>attr.setXYZ(i,v.x,v.y,v.z));attr.needsUpdate=true;skeletonGeometry.computeBoundingSphere();
    root.updateMatrixWorld(true);
  }
  function select(part:PartId|null){for(const [key,mat] of materials){mat.emissive.setHex(key.includes(`-${part}-`)?0x80651a:0x000000);mat.emissiveIntensity=part ? .17 : 0;}}
  function dispose(){const geometries=new Set<THREE.BufferGeometry>();const mats=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});geometries.forEach(g=>g.dispose());mats.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial)m.map?.dispose();m.dispose();});}
  setPose(INITIAL_JOINTS);
  return {root,markers,setPose,select,dispose,showMechanism,focus:()=>elbow.getWorldPosition(new THREE.Vector3()),tip:()=>hook.getWorldPosition(new THREE.Vector3()),inspect:()=>({pose:{...poseCache},cylinders:cylinderPairs.map(c=>({part:c.part,length:c.rodGroup.position.y,piston:c.rodGroup.position.y-c.rodLength,cap:c.cap,rigidScale:c.group.scale.toArray()}))})};
}

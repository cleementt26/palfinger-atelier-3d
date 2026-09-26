// Lengths below are reconstruction units, NOT PALFINGER design dimensions.
// Only the +15° relative overextension is sourced (PK 53002 SH brochure, p. 6).
export type Vec2 = { x: number; y: number };
export type JointPose = { boom: number; knuckle: number; extension: number; rotation: number };
export type MotionCommand = JointPose & { mode: "sequence" | "manual"; deployment: number };
export const GEOMETRY = {
  mainLength: 3.65, secondLength: 3.12, shoulderHeight: 2.57,
  shoulderX: .02, turretHeight: 1.49, shoulderLocalY: 1.08,
  stageLength: 2.26, firstStageOffset: .45, nestedStageOffset: .09,
  stages: 6, stageStroke: 1.45, hookOffset: 2.37, hookDrop: .88,
  mainBase: { x: .33, y: .16 }, mainEye: { x: 2.48, y: -.27 },
  linkBase: { x: -.42, y: .10 }, linkEye: { x: .42, y: .20 },
  cylinderBase: { x: -1.80, y: .10 }, linkA: .72, linkB: .57,
  primaryBase:{x:-.12,y:-.55},primaryEye:{x:.48,y:-.05},primaryCylinder:{x:2.40,y:-.25},primaryLinkA:.65,primaryLinkB:.75,
} as const;
export const LIMITS = { boom: [0, 82], knuckle: [-155, 15], extension: [0, 100] } as const;
export const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(max,v));
export const rad = (a:number) => a * Math.PI / 180;
export const rotate2 = (p:Vec2,a:number):Vec2 => ({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});
export const add2 = (a:Vec2,b:Vec2):Vec2 => ({x:a.x+b.x,y:a.y+b.y});
export const distance = (a:Vec2,b:Vec2) => Math.hypot(b.x-a.x,b.y-a.y);
export const smoother = (x:number) => {const t=clamp(x,0,1);return t*t*t*(t*(t*6-15)+10);};
export const mix = (a:number,b:number,t:number) => a+(b-a)*t;

// Closed two-circle construction. Keeping the negative branch preserves assembly
// mode throughout the permitted elbow sweep; no frame-to-frame branch guessing.
export function solveLinkage(knuckle:number) {
  const p=GEOMETRY.linkBase,q=rotate2(GEOMETRY.linkEye,rad(knuckle));
  return closeLinkage(p,q,GEOMETRY.linkA,GEOMETRY.linkB,GEOMETRY.cylinderBase);
}
export function solvePrimaryLinkage(boom:number){
  return closeLinkage(GEOMETRY.primaryBase,rotate2(GEOMETRY.primaryEye,rad(boom)),GEOMETRY.primaryLinkA,GEOMETRY.primaryLinkB,rotate2(GEOMETRY.primaryCylinder,rad(boom)));
}
function closeLinkage(p:Vec2,q:Vec2,r:number,s:number,f:Vec2){
  const d=distance(p,q),ux=(q.x-p.x)/d,uy=(q.y-p.y)/d;
  const a=(r*r-s*s+d*d)/(2*d);
  const h2=r*r-a*a;
  if(d<1e-9||h2<0)throw new RangeError("Four-bar linkage outside its assembly domain");
  const h=Math.sqrt(h2),c={x:p.x+a*ux+h*uy,y:p.y+a*uy-h*ux};
  return {p,q,c,f,length:distance(f,c),closureHeight:h};
}

export function stageExtensions(extension:number) {
  const progress=clamp(extension,0,100)/100*GEOMETRY.stages;
  return Array.from({length:GEOMETRY.stages},(_,i)=>GEOMETRY.stageStroke*smoother(progress-i));
}
export function tipLocal(pose:JointPose):Vec2 {
  const elbow=add2({x:GEOMETRY.shoulderX,y:GEOMETRY.shoulderHeight},rotate2({x:GEOMETRY.mainLength,y:0},rad(pose.boom)));
  const total=GEOMETRY.firstStageOffset+5*GEOMETRY.nestedStageOffset+GEOMETRY.hookOffset+stageExtensions(pose.extension).reduce((a,b)=>a+b,0);
  return add2(elbow,rotate2({x:total,y:-.08},rad(pose.boom+pose.knuckle)));
}
export function mainCylinderLength(boom:number) {
  return solvePrimaryLinkage(boom).length;
}
const mainMin=mainCylinderLength(LIMITS.boom[0]),mainMax=mainCylinderLength(LIMITS.boom[1]);
const secondMin=solveLinkage(LIMITS.knuckle[0]).length,secondMax=solveLinkage(LIMITS.knuckle[1]).length;
export function measurements(pose:JointPose) {
  const linkage=solveLinkage(pose.knuckle),tip=tipLocal(pose);
  return { mainStroke:100*(mainCylinderLength(pose.boom)-mainMin)/(mainMax-mainMin),
    secondStroke:100*(linkage.length-secondMin)/(secondMax-secondMin),
    stages:stageExtensions(pose.extension).map(x=>100*x/GEOMETRY.stageStroke),
    absoluteAngle:pose.boom+pose.knuckle, tip, linkage };
}

// Deliberately conservative DEMONSTRATION constraints: a tip/boom clearance
// guard and a folded-arm envelope near the column. Not a collision/EN12999 system.
export function isPoseClear(pose:JointPose) {
  const tip=tipLocal(pose);
  if(tip.y-GEOMETRY.hookDrop<.22)return false;
  // Below the elbow, the folded boom must remain away from the central pedestal.
  const elbow=add2({x:GEOMETRY.shoulderX,y:GEOMETRY.shoulderHeight},rotate2({x:GEOMETRY.mainLength,y:0},rad(pose.boom)));
  for(let i=1;i<=18;i++){
    const t=i/18,x=mix(elbow.x,tip.x,t),y=mix(elbow.y,tip.y,t);
    if(Math.abs(x)<.78&&y<3.02)return false;
  }
  return true;
}
export function constrainPose(input:JointPose):{pose:JointPose;limited:boolean} {
  const pose={boom:clamp(input.boom,...LIMITS.boom),knuckle:clamp(input.knuckle,...LIMITS.knuckle),extension:clamp(input.extension,...LIMITS.extension),rotation:input.rotation};
  if(isPoseClear(pose))return {pose,limited:false};
  // Open the elbow to the first clear angle; rotation and extension stay requested.
  const start=pose.knuckle;
  for(let a=start+.25;a<=15.25;a+=.25){pose.knuckle=Math.min(a,15);if(isPoseClear(pose))break;}
  return {pose,limited:true};
}

export const SEQUENCE_PHASES = [
  {from:0,to:18,title:"Dégagement du bras",short:"Dégager"},
  {from:18,to:48,title:"Ouverture de l’articulation",short:"Articuler"},
  {from:48,to:62,title:"Mise en position du bras",short:"Positionner"},
  {from:62,to:100,title:"Sortie des extensions",short:"Télescoper"},
] as const;
export function sequencePhase(progress:number) {return SEQUENCE_PHASES.find(p=>progress<p.to)??SEQUENCE_PHASES[3];}
export function sequencePose(progress:number,rotation=-12):JointPose {
  const p=clamp(progress,0,100);
  return {boom:p<18?mix(70,82,smoother(p/18)):p<48?82:mix(82,36,smoother((p-48)/14)),
    knuckle:mix(-155,-18,smoother((p-18)/30)),extension:100*smoother((p-62)/38),rotation};
}
export const INITIAL_JOINTS=sequencePose(58);

type Spring={value:number;velocity:number};
// Exact critically damped solution. Frame rate changes do not change motion speed.
export function advanceSpring(state:Spring,target:number,dt:number,omega=7):Spring {
  const x=state.value-target,c=state.velocity+omega*x,e=Math.exp(-omega*dt);
  const value=target+(x+c*dt)*e,velocity=(state.velocity-omega*c*dt)*e;
  return Math.abs(value-target)<1e-5&&Math.abs(velocity)<1e-4?{value:target,velocity:0}:{value,velocity};
}
export function nearestRotation(current:number,angle:number) {return current+((angle-current+540)%360+360)%360-180;}

export class CraneMotion {
  pose:JointPose; progress:number; limited=false; returning=false;
  private lastMode:"sequence"|"manual"="sequence";
  private springs:Record<keyof JointPose,Spring>;
  private progressSpring:Spring;
  private route:JointPose[]=[];
  constructor(progress=58,rotation=-12){this.pose=sequencePose(progress,rotation);this.progress=progress;this.progressSpring={value:progress,velocity:0};this.springs=Object.fromEntries(Object.entries(this.pose).map(([key,value])=>[key,{value,velocity:0}])) as Record<keyof JointPose,Spring>;}
  hold(){this.progressSpring={value:this.progress,velocity:0};for(const key of Object.keys(this.springs) as (keyof JointPose)[])this.springs[key]={value:this.pose[key],velocity:0};}
  step(command:MotionCommand,dt:number,speed=1) {
    dt=clamp(dt,0,.1)*speed;
    if(command.mode!==this.lastMode){
      this.lastMode=command.mode;
      if(command.mode==="sequence"){
        const retract={...this.pose,extension:0},raised={...retract,boom:82},folded={...raised,knuckle:-155};
        this.route=[retract,raised,folded,sequencePose(0,this.pose.rotation)];
        this.progressSpring={value:0,velocity:0};this.progress=0;
      }else{this.route=[];}
    }
    this.returning=this.route.length>0;
    if(command.mode==="sequence"&&!this.returning){
      this.progressSpring=advanceSpring(this.progressSpring,command.deployment,dt,5);
      this.progress=clamp(this.progressSpring.value,0,100);
      const rotation=advanceSpring(this.springs.rotation,command.rotation,dt,4);
      this.pose=sequencePose(this.progress,rotation.value);this.springs.rotation=rotation;
      for(const key of ["boom","knuckle","extension"] as const)this.springs[key]={value:this.pose[key],velocity:0};
      this.limited=false;
    }else{
      const target=this.returning?{...this.route[0],rotation:command.rotation}:constrainPose(command).pose;
      for(const key of Object.keys(this.springs) as (keyof JointPose)[])this.springs[key]=advanceSpring(this.springs[key],target[key],dt,key==="rotation"?4:6);
      const candidate=Object.fromEntries(Object.entries(this.springs).map(([k,s])=>[k,s.value])) as JointPose;
      const result=constrainPose(candidate);this.pose=result.pose;
      this.limited=result.limited||(!this.returning&&Math.abs(target.knuckle-command.knuckle)>.1);
      if(result.limited)this.springs.knuckle={value:this.pose.knuckle,velocity:0};
      if(this.returning&&(["boom","knuckle","extension"] as const).every(k=>Math.abs(this.pose[k]-target[k])<.03))this.route.shift();
    }
    return this.pose;
  }
}
